// Electron 主进程
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpegManager = require('./ffmpeg');
const queueManager = require('./queue');
const probe = require('./probe');
const i18n = require('./i18n');

let mainWindow = null;
let splashWindow = null;
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

// dialog 标题/过滤器名取主进程本地化文案（错误消息在各模块内用 i18n.t）
const mt = (key) => i18n.t(key);

const DEFAULT_CONFIG = {
  outputDir: '',
  parallelMode: 'auto', // auto | manual
  parallelCount: 2,
  defaultContainer: 'mp4',
  defaultEncoder: 'h264',
  defaultCRF: 23,
  defaultPreset: 'medium',
  defaultResolution: null,
  defaultDeinterlace: 'smart',
  defaultAudioEnabled: true,
  defaultAudioBitrate: 128,
  defaultAudioCopy: false,
  outputSuffix: '',
  filenameTemplate: '{name}_{encoder}',
  language: ''
};

function loadConfig() {
  let cfg = { ...DEFAULT_CONFIG };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      cfg = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
    }
  } catch (e) { /* ignore */ }
  i18n.setLang(cfg.language || 'en'); // 同步主进程文案语言
  return cfg;
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) { /* ignore */ }
  i18n.setLang(config.language || 'en');
}

// 把用户在设置里配置的输出目录 / 文件后缀合并进转码选项
function withOutputConfig(options) {
  const cfg = loadConfig();
  return {
    ...options,
    outputDir: cfg.outputDir || '',
    suffix: cfg.outputSuffix || '',
    template: cfg.filenameTemplate || ''
  };
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 420,
    frame: false,
    resizable: false,
    transparent: false,
    backgroundColor: '#131313',
    center: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'CM视频转码器',
    icon: path.join(__dirname, '..', '..', 'resources', 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  splashWindow.loadFile(path.join(__dirname, '..', 'renderer', 'splash.html'));
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1150,
    minHeight: 600,
    title: 'CM视频转码器',
    icon: path.join(__dirname, '..', '..', 'resources', 'icon.ico'),
    backgroundColor: '#131313',
    // 隐藏系统标题栏，仅保留右上角原生窗口按钮（最小化/最大化/关闭），
    // 颜色调成深色融入工具栏；顶部 .toolbar 设为可拖动区（-webkit-app-region: drag）。
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1b1b1b',        // 按钮区背景＝工具栏 --bg-secondary
      symbolColor: '#a2a2a2',  // 按钮图标色＝--text-secondary
      // 比 52px 工具栏矮，使按钮顶端贴齐、底部与工具栏底边框之间留出空隙
      height: 51
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true,
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // 渲染进程完成初始化后才展示主窗口并关闭欢迎页；
  // 设置兜底超时，避免初始化异常时永远停在欢迎页。
  let shown = false;
  const reveal = () => {
    if (shown || !mainWindow || mainWindow.isDestroyed()) return;
    shown = true;
    mainWindow.show();
    closeSplash();
  };
  ipcMain.once('appReady', reveal);
  mainWindow.once('ready-to-show', () => setTimeout(reveal, 8000));
}

function setupIPC() {
  ipcMain.handle('init', async () => {
    const config = loadConfig();
    try {
      const ffmpegInfo = await ffmpegManager.init();
      const queueInfo = queueManager.init({
        parallelMode: config.parallelMode,
        parallelCount: config.parallelCount
      });
      return { success: true, ffmpeg: ffmpegInfo, queue: queueInfo, config };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('selectFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: mt('selectFiles'),
      filters: [
        { name: mt('videoFiles'), extensions: ['mp4', 'mov', 'mkv'] }
      ],
      properties: ['openFile', 'multiSelections']
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('probeFile', async (e, filePath) => {
    try {
      return await probe.probeFile(filePath);
    } catch (err) {
      return { error: err.message };
    }
  });

  // 缩略图 / 截帧预览（返回 base64 data URL）
  ipcMain.handle('getThumbnail', async (e, filePath, seekSec, width) => {
    try {
      return await probe.getThumbnail(filePath, seekSec ?? 1, width ?? 160);
    } catch (err) {
      return null;
    }
  });

  // 截帧导出：弹保存对话框，按选定时间抽全分辨率帧
  ipcMain.handle('captureFrame', async (e, filePath, seekSec, format) => {
    const base = path.basename(filePath, path.extname(filePath));
    const fmt = ['png', 'webp', 'jpg'].includes(format) ? format : 'png';
    const allFilters = {
      png: { name: mt('pngImage'), extensions: ['png'] },
      webp: { name: mt('webpImage'), extensions: ['webp'] },
      jpg: { name: mt('jpegImage'), extensions: ['jpg', 'jpeg'] }
    };
    // 把所选格式排在第一，作为保存对话框的默认类型
    const filters = [allFilters[fmt], ...Object.keys(allFilters).filter(k => k !== fmt).map(k => allFilters[k])];
    const result = await dialog.showSaveDialog(mainWindow, {
      title: mt('saveCapture'),
      defaultPath: `${base}_${Math.round(seekSec)}s.${fmt}`,
      filters
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      await probe.captureFrame(filePath, seekSec, result.filePath);
      return { success: true, path: result.filePath };
    } catch (err) {
      return { error: err.message };
    }
  });

  // 添加任务（注入用户配置的输出目录与后缀）
  ipcMain.handle('addTask', async (e, filePath, options) => {
    return await queueManager.addTask(filePath, withOutputConfig(options));
  });

  ipcMain.handle('addTasks', async (e, filePaths, options) => {
    return await queueManager.addTasks(filePaths, withOutputConfig(options));
  });

  ipcMain.handle('cancelTask', (e, taskId) => {
    return queueManager.cancelTask(taskId);
  });

  ipcMain.handle('cancelAll', () => {
    return queueManager.cancelAll();
  });

  ipcMain.handle('retryTask', (e, taskId) => {
    return queueManager.retryTask(taskId);
  });

  ipcMain.handle('removeTask', (e, taskId) => {
    return queueManager.removeTask(taskId);
  });

  ipcMain.handle('clearFinished', () => {
    return queueManager.clearFinished();
  });

  ipcMain.handle('getStats', () => {
    return queueManager.getStats();
  });

  ipcMain.handle('getAllTasks', () => {
    return queueManager.getAllTasks();
  });

  ipcMain.handle('getConfig', () => {
    return loadConfig();
  });

  ipcMain.handle('saveConfig', (e, config) => {
    saveConfig(config);
    if (config.parallelMode || config.parallelCount) {
      queueManager.init({
        parallelMode: config.parallelMode,
        parallelCount: config.parallelCount
      });
    }
    return true;
  });

  ipcMain.handle('selectOutputDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: mt('selectOutputDir'),
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('openPath', async (e, p) => {
    if (!p || !fs.existsSync(p)) return false;
    const err = await shell.openPath(p);
    return !err;
  });

  ipcMain.handle('showInFolder', (e, p) => {
    if (!p || !fs.existsSync(p)) return false;
    shell.showItemInFolder(p);
    return true;
  });

  // 用系统默认浏览器打开外部链接（仅允许 http/https）
  ipcMain.handle('openExternal', (e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('getCpuCores', () => {
    return require('os').cpus().length;
  });

  // 队列事件转发到渲染进程
  const events = ['taskAdded', 'taskStarted', 'taskProgress', 'taskCompleted', 'taskFailed', 'taskCancelled', 'taskRetried', 'queueUpdated'];
  events.forEach(event => {
    queueManager.on(event, (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(event, data);
      }
    });
  });
}

// 单实例锁：避免重复启动（如再次 npm start 或重复双击）时两个实例
// 抢占同一个用户数据目录，导致缓存 "Access is denied" 报错、窗口黑屏/空白。
// 第二个实例直接退出，并把已存在的窗口前置聚焦。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = mainWindow || splashWindow;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    setupIPC();
    createSplash();
    createWindow();
  });
}

app.on('window-all-closed', () => {
  queueManager.cancelAll();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
