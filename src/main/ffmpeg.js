const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { spawn } = require('child_process');

class FFmpegManager {
  constructor() {
    this.ffmpegPath = null;
    this.ffprobePath = null;
    this.initialized = false;
    this.hw = { h264: null, h265: null, vendor: null, devices: [] };
  }

  /**
   * 初始化 ffmpeg 路径
   * 优先级：
   * 1. 随程序打包的 resources 目录（直接原地运行，无需复制解压）
   * 2. 系统 PATH 中的 ffmpeg
   */
  async init() {
    // 打包后 ffmpeg 位于 process.resourcesPath；开发态位于项目 resources 目录
    const resourcesDir = app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, '..', '..', 'resources');

    const resourceFFmpeg = path.join(resourcesDir, 'ffmpeg.exe');
    const resourceFFprobe = path.join(resourcesDir, 'ffprobe.exe');

    let source = null;
    if (fs.existsSync(resourceFFmpeg) && fs.existsSync(resourceFFprobe)) {
      this.ffmpegPath = resourceFFmpeg;
      this.ffprobePath = resourceFFprobe;
      source = 'resources';
    } else {
      try {
        const result = await this._exec('ffmpeg', ['-version']);
        if (result.includes('ffmpeg version')) {
          this.ffmpegPath = 'ffmpeg';
          this.ffprobePath = 'ffprobe';
          source = 'system';
        }
      } catch (e) { /* not in PATH */ }
    }

    if (!source) {
      throw new Error(require('./i18n').t('err.ffmpegNotFound'));
    }

    this.initialized = true;
    await this.detectHwEncoders();
    return { ffmpeg: this.ffmpegPath, ffprobe: this.ffprobePath, source, hw: this.hw };
  }

  /**
   * 检测可用的硬件编码器（NVENC / QSV / AMF）。
   * 先看 ffmpeg 构建是否包含该编码器，再做一次极短的功能性测试，
   * 避免在没有对应 GPU 的机器上误报。
   */
  async detectHwEncoders() {
    const result = { h264: null, h265: null, vendor: null, devices: [] };

    let encodersList = '';
    try {
      encodersList = await this._exec(this.ffmpegPath, ['-hide_banner', '-encoders']);
    } catch (e) {
      this.hw = result;
      return result;
    }

    // 候选编码器（按优先级：NVIDIA > Intel > AMD）
    const candidates = {
      h264: [['h264_nvenc', 'NVIDIA NVENC'], ['h264_qsv', 'Intel QSV'], ['h264_amf', 'AMD AMF']],
      h265: [['hevc_nvenc', 'NVIDIA NVENC'], ['hevc_qsv', 'Intel QSV'], ['hevc_amf', 'AMD AMF']]
    };

    // 仅测试该 ffmpeg 构建中实际存在的编码器
    const present = [];
    for (const codec of ['h264', 'h265']) {
      for (const [enc, vendor] of candidates[codec]) {
        if (encodersList.includes(enc)) present.push({ codec, enc, vendor });
      }
    }

    const tested = await Promise.all(
      present.map(async (t) => ({ ...t, ok: await this._testEncoder(t.enc) }))
    );

    for (const codec of ['h264', 'h265']) {
      for (const [enc, vendor] of candidates[codec]) {
        const hit = tested.find((x) => x.enc === enc && x.ok);
        if (hit) {
          result[codec] = enc;
          if (!result.vendor) result.vendor = vendor;
          if (!result.devices.includes(vendor)) result.devices.push(vendor);
          break;
        }
      }
    }

    this.hw = result;
    return result;
  }

  // 用极短的空源做一次试编码，确认该硬件编码器真正可用
  _testEncoder(enc) {
    return this._exec(this.ffmpegPath, [
      '-hide_banner',
      '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.1:r=5',
      '-c:v', enc,
      '-f', 'null', '-'
    ]).then(() => true).catch(() => false);
  }

  getHwEncoder(videoEncoder) {
    return (this.hw && this.hw[videoEncoder]) || null;
  }

  _exec(cmd, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { windowsHide: true });
      let out = '';
      proc.stdout.on('data', d => out += d);
      proc.stderr.on('data', d => out += d);
      proc.on('close', code => code === 0 ? resolve(out) : reject(new Error(`Exit ${code}: ${out}`)));
      proc.on('error', reject);
    });
  }

  getFFmpegPath() { return this.ffmpegPath; }
  getFFprobePath() { return this.ffprobePath; }
  isReady() { return this.initialized; }
}

module.exports = new FFmpegManager();
