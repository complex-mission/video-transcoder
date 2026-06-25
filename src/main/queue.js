const os = require('os');
const { getParallelConfig } = require('../shared/constants');
const transcoder = require('./transcoder');
const probe = require('./probe');
const i18n = require('./i18n');

class QueueManager {
  constructor() {
    this.tasks = new Map(); // taskId -> task object
    this.queue = [];         // 等待中的 taskId 列表
    this.running = new Set(); // 正在运行的 taskId
    this.maxParallel = 1;
    this.autoParallel = true;
    this.listeners = new Map();
  }

  init(options = {}) {
    const cores = os.cpus().length;
    const config = getParallelConfig(cores);

    if (options.parallelMode === 'manual' && options.parallelCount) {
      this.maxParallel = options.parallelCount;
      this.autoParallel = false;
    } else {
      this.maxParallel = config.parallel;
      this.autoParallel = true;
    }

    return { cores, maxParallel: this.maxParallel, threadsPerTask: config.threadsPerTask };
  }

  async addTask(filePath, transcodingOptions) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    let probeData;
    try {
      probeData = await probe.probeFile(filePath);
    } catch (e) {
      const task = {
        id: taskId,
        filePath,
        status: 'failed',
        error: i18n.t('err.probeFailed', { detail: e.message }),
        options: transcodingOptions,
        probeData: null,
        progress: 0,
        addedAt: Date.now()
      };
      this.tasks.set(taskId, task);
      this._emit('taskAdded', task);
      this._emit('taskFailed', task);
      return task;
    }

    const task = {
      id: taskId,
      filePath,
      status: 'queued',  // queued | probing | running | completed | failed | cancelled
      error: null,
      options: { ...transcodingOptions, taskId },
      probeData,
      progress: 0,
      fps: 0,
      speed: 0,
      remaining: 0,
      outputPath: null,
      outputSize: 0,
      addedAt: Date.now(),
      startedAt: null,
      completedAt: null
    };

    this.tasks.set(taskId, task);
    this.queue.push(taskId);
    this._emit('taskAdded', task);
    this._processQueue();

    return task;
  }

  async addTasks(filePaths, transcodingOptions) {
    const results = [];
    for (const fp of filePaths) {
      const task = await this.addTask(fp, transcodingOptions);
      results.push(task);
    }
    return results;
  }

  async _processQueue() {
    while (this.running.size < this.maxParallel && this.queue.length > 0) {
      const taskId = this.queue.shift();
      const task = this.tasks.get(taskId);
      if (!task || task.status !== 'queued') continue;

      this.running.add(taskId);
      task.status = 'running';
      task.startedAt = Date.now();
      this._emit('taskStarted', task);

      try {
        const result = await transcoder.transcode(
          task.filePath,
          task.options,
          task.probeData,
          (progressData) => {
            task.progress = progressData.percent;
            task.fps = progressData.fps;
            task.speed = progressData.speed;
            task.remaining = progressData.remaining;
            this._emit('taskProgress', task);
          },
          null
        );

        task.status = 'completed';
        task.progress = 100;
        task.outputPath = result.outputPath;
        task.outputSize = result.size;
        task.completedAt = Date.now();
        this._emit('taskCompleted', task);
      } catch (e) {
        // 用户取消时 ffmpeg 被 kill 会让 transcode reject，此处不要覆盖为「失败」
        // 也不要把 ffmpeg 的退出/stderr 信息当成错误抛给用户
        if (task.status !== 'cancelled') {
          task.status = 'failed';
          task.error = e.message;
          task.completedAt = Date.now();
          this._emit('taskFailed', task);
        }
      } finally {
        this.running.delete(taskId);
        this._processQueue();
      }
    }

    this._emit('queueUpdated', this.getStats());
  }

  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'running') {
      transcoder.cancel(taskId);
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.running.delete(taskId);
      this._emit('taskCancelled', task);
      this._processQueue();
    } else if (task.status === 'queued') {
      task.status = 'cancelled';
      this.queue = this.queue.filter(id => id !== taskId);
      this._emit('taskCancelled', task);
    }
    return true;
  }

  cancelAll() {
    transcoder.cancelAll();
    for (const taskId of this.running) {
      const task = this.tasks.get(taskId);
      if (task) { task.status = 'cancelled'; task.completedAt = Date.now(); }
    }
    for (const taskId of this.queue) {
      const task = this.tasks.get(taskId);
      if (task) { task.status = 'cancelled'; }
    }
    this.running.clear();
    this.queue = [];
    this._emit('queueUpdated', this.getStats());
  }

  retryTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'failed') return false;

    task.status = 'queued';
    task.error = null;
    task.progress = 0;
    this.queue.push(taskId);
    this._emit('taskRetried', task);
    this._processQueue();
    return true;
  }

  /**
   * 移除单个已结束（完成/取消/失败）的任务；进行中/排队中的任务不可移除（应先取消）
   */
  removeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (['completed', 'cancelled', 'failed'].includes(task.status)) {
      this.tasks.delete(taskId);
      this._emit('queueUpdated', this.getStats());
      return true;
    }
    return false;
  }

  clearFinished() {
    for (const [id, task] of this.tasks) {
      if (['completed', 'cancelled', 'failed'].includes(task.status)) {
        this.tasks.delete(id);
      }
    }
    this._emit('queueUpdated', this.getStats());
  }

  getStats() {
    let completed = 0, failed = 0, running = 0, queued = 0, cancelled = 0;
    let totalProgress = 0;
    let totalTasks = this.tasks.size;

    for (const task of this.tasks.values()) {
      switch (task.status) {
        case 'completed': completed++; totalProgress += 100; break;
        case 'failed': failed++; break;
        case 'running': running++; totalProgress += task.progress; break;
        case 'queued': queued++; break;
        case 'cancelled': cancelled++; break;
      }
    }

    return {
      total: totalTasks,
      completed,
      failed,
      running,
      queued,
      cancelled,
      overallProgress: totalTasks > 0 ? totalProgress / totalTasks : 0,
      maxParallel: this.maxParallel,
      isIdle: running === 0 && queued === 0
    };
  }

  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const cbs = this.listeners.get(event);
    if (cbs) this.listeners.set(event, cbs.filter(cb => cb !== callback));
  }

  _emit(event, data) {
    const cbs = this.listeners.get(event);
    if (cbs) cbs.forEach(cb => cb(data));
  }
}

module.exports = new QueueManager();
