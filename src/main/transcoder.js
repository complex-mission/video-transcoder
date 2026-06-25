const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegManager = require('./ffmpeg');
const i18n = require('./i18n');
const { VIDEO_ENCODERS, CONTAINERS, getParallelConfig } = require('../shared/constants');

class Transcoder {
  constructor() {
    this.activeProcesses = new Map(); // taskId -> child_process
  }

  buildArgs(inputPath, options, probeData) {
    const {
      container, videoEncoder, crf, preset,
      resolution, scaleMode, customWidth, customHeight,
      deinterlace, audioEnabled, audioBitrate, audioCopy
    } = options;

    const encInfo = VIDEO_ENCODERS[videoEncoder];
    const containerInfo = CONTAINERS[container];
    const outputPath = this._getOutputPath(inputPath, container, options, probeData);

    const args = ['-y', '-i', inputPath];

    // MKV 只取第一条视频流 + 第一条音轨，忽略字幕与附加音轨
    if (probeData.formatName?.includes('matroska')) {
      args.push('-map', '0:v:0');
      if (audioEnabled) {
        // 优先取默认音轨，没有则取第一条
        args.push('-map', '0:a:0?');
      }
    }

    // 解析硬件编码器（仅 h264/h265 支持，且需开启硬件加速且检测到可用设备）
    const hwEnc = (options.hwaccel && (videoEncoder === 'h264' || videoEncoder === 'h265'))
      ? ffmpegManager.getHwEncoder(videoEncoder)
      : null;

    if (hwEnc) {
      args.push('-c:v', hwEnc);
      const vendor = hwEnc.endsWith('_nvenc') ? 'nvenc' : (hwEnc.endsWith('_qsv') ? 'qsv' : 'amf');
      if (vendor === 'nvenc') {
        // 恒定质量 VBR，cq 与 CRF 同量纲（越低越好）
        args.push('-rc', 'vbr', '-cq', String(crf), '-b:v', '0');
        args.push('-preset', this._nvencPreset(preset));
      } else if (vendor === 'qsv') {
        args.push('-global_quality', String(crf));
        if (preset) args.push('-preset', preset);
      } else { // amf
        args.push('-rc', 'cqp', '-qp_i', String(crf), '-qp_p', String(crf), '-qp_b', String(crf));
        args.push('-quality', 'balanced');
      }
      // H.264 profile 同样适用于硬件编码器
      if (encInfo.profile) args.push(...encInfo.profile.split(' '));
    } else {
      args.push('-c:v', encInfo.lib);
      args.push('-crf', String(crf));

      // Preset（仅 libx264/libx265 支持）
      if (preset && encInfo.presets.length > 0) {
        args.push('-preset', preset);
      }

      if (videoEncoder === 'vp9') {
        args.push('-b:v', '0', '-row-mt', '1');
      }

      if (videoEncoder === 'av1') {
        args.push('-still-picture', '1', '-row-mt', '1');
      }

      if (encInfo.profile) {
        args.push(...encInfo.profile.split(' '));
      }
    }

    args.push('-pix_fmt', 'yuv420p');

    // 反交错（保证输出为逐行 progressive，避免 Safari 等浏览器播放异常）
    if (deinterlace === 'force') {
      args.push('-vf', 'bwdif');
    } else if (deinterlace === 'smart') {
      // 智能：滤镜逐帧判断，仅对标记为隔行的帧反交错，逐行帧原样通过
      args.push('-vf', 'bwdif=deint=interlaced');
    }

    let scaleFilter = null;
    if (customWidth && customHeight) {
      // 自定义画布：等比缩放至完全容纳，再用黑色填充到精确 W×H（letterbox/pillarbox）
      const w = Math.floor(customWidth / 2) * 2;
      const h = Math.floor(customHeight / 2) * 2;
      scaleFilter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    } else {
      // 预设分辨率：仅按高度等比缩放（resolution 可能是数字或 {height: N}）
      const targetHeight = typeof resolution === 'number' ? resolution : (resolution?.height || null);
      if (targetHeight) {
        scaleFilter = this._buildScaleFilter(probeData, { height: targetHeight }, deinterlace);
      }
    }
    if (scaleFilter) {
      // 如果已有 vf（反交错），需要合并
      const existingVf = args.indexOf('-vf');
      if (existingVf !== -1) {
        args[existingVf + 1] = args[existingVf + 1] + ',' + scaleFilter;
      } else {
        args.push('-vf', scaleFilter);
      }
    }

    if (containerInfo.movflags) {
      args.push(...containerInfo.movflags.split(' '));
    }

    if (audioEnabled) {
      if (audioCopy && this._canAudioCopy(container, probeData)) {
        args.push('-c:a', 'copy');
      } else {
        const audioEnc = containerInfo.audioEncoder;
        args.push('-c:a', audioEnc === 'aac' ? 'aac' : 'libopus');
        args.push('-b:a', `${audioBitrate}k`);
      }
    } else {
      args.push('-an');
    }

    const cpuCores = require('os').cpus().length;
    const config = getParallelConfig(cpuCores);
    args.push('-threads', String(config.threadsPerTask));

    args.push(outputPath);

    return { args, outputPath };
  }

  transcode(inputPath, options, probeData, onProgress, onDone) {
    const ffmpegPath = ffmpegManager.getFFmpegPath();
    const { args, outputPath } = this.buildArgs(inputPath, options, probeData);

    const taskId = options.taskId || Date.now().toString();

    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, args, { windowsHide: true });
      this.activeProcesses.set(taskId, proc);

      let stderr = '';
      const duration = probeData.duration;
      let lastProgress = 0;
      let lastParsedTime = 0;

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        // 只解析最新 chunk，避免反复扫描全部输出
        const progress = this._parseProgress(chunk, duration, lastParsedTime);
        if (progress && progress.percent > lastProgress) {
          lastParsedTime = progress.currentTime;
          lastProgress = progress.percent;
          if (onProgress) onProgress({ taskId, ...progress });
        }
      });

      proc.on('close', (code) => {
        this.activeProcesses.delete(taskId);
        if (code === 0) {
          const stat = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null;
          resolve({ taskId, outputPath, success: true, size: stat?.size || 0 });
        } else {
          reject(new Error(i18n.t('err.ffmpegExit', { code, detail: stderr.slice(-500) })));
        }
        if (onDone) onDone({ taskId, success: code === 0, outputPath });
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(taskId);
        reject(err);
      });
    });
  }

  cancel(taskId) {
    const proc = this.activeProcesses.get(taskId);
    if (proc) {
      proc.kill('SIGKILL');
      this.activeProcesses.delete(taskId);
      return true;
    }
    return false;
  }

  cancelAll() {
    for (const [id, proc] of this.activeProcesses) {
      proc.kill('SIGKILL');
    }
    this.activeProcesses.clear();
  }

  _parseProgress(chunk, totalDuration, lastParsedTime) {
    if (!totalDuration || totalDuration <= 0) return null;

    // ffmpeg 进度格式: time=00:01:23.45
    const timeMatch = chunk.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/g);
    if (!timeMatch || timeMatch.length === 0) return null;

    const lastTimeStr = timeMatch[timeMatch.length - 1];
    const m = lastTimeStr.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (!m) return null;

    const currentTime = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100;
    // 防止时间回退
    if (lastParsedTime && currentTime < lastParsedTime) return null;
    const percent = Math.min(100, (currentTime / totalDuration) * 100);

    // 从 chunk 提取 fps 和 speed
    const fpsMatch = chunk.match(/fps=\s*([\d.]+)/);
    const speedMatch = chunk.match(/speed=\s*([\d.]+)x/);
    const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
    const speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
    const remaining = speed > 0 ? (totalDuration - currentTime) / speed : 0;

    return {
      percent: Math.round(percent * 10) / 10,
      currentTime,
      fps,
      speed,
      remaining
    };
  }

  _buildScaleFilter(probeData, resolution, deinterlace) {
    const srcW = probeData.video?.width || 0;
    const srcH = probeData.video?.height || 0;
    if (!srcW || !srcH) return null;

    const targetH = resolution.height;
    // 仅缩小不放大
    if (srcH <= targetH) return null;

    // 等比缩放，宽度自动，确保偶数
    const scale = `scale=-2:${targetH}`;
    return scale;
  }

  _canAudioCopy(container, probeData) {
    if (!probeData.audio) return false;
    const codec = probeData.audio.codec;
    if ((container === 'mp4' || container === 'mov') && codec === 'aac') return true;
    if (container === 'webm' && codec === 'opus') return true;
    return false;
  }

  _getOutputPath(inputPath, container, options, probeData) {
    // 优先使用用户指定的输出目录，否则输出到源文件所在目录
    let dir = path.dirname(inputPath);
    if (options.outputDir && fs.existsSync(options.outputDir)) {
      dir = options.outputDir;
    }
    const ext = path.extname(inputPath);
    const basename = path.basename(inputPath, ext);
    const outExt = '.' + container;

    // 渲染文件名模板（无模板时回退到旧的 后缀/默认 行为）
    const template = options.template || (options.suffix ? `{name}${options.suffix}` : '{name}_{encoder}');
    let stem = this._renderTemplate(template, { inputPath, basename, container, options, probeData });
    stem = this._sanitizeFilename(stem) || basename;

    let outPath = path.join(dir, `${stem}${outExt}`);

    let counter = 1;
    while (fs.existsSync(outPath)) {
      outPath = path.join(dir, `${stem}(${counter})${outExt}`);
      counter++;
    }

    return outPath;
  }

  _renderTemplate(template, ctx) {
    const { basename, container, options, probeData } = ctx;
    const enc = VIDEO_ENCODERS[options.videoEncoder] || {};

    // 计算输出尺寸（与预览逻辑一致）
    const srcW = probeData?.video?.width || 0;
    const srcH = probeData?.video?.height || 0;
    let dstW = srcW, dstH = srcH;
    if (options.customWidth && options.customHeight) {
      dstW = options.customWidth;
      dstH = options.customHeight;
    } else {
      const targetH = typeof options.resolution === 'number'
        ? options.resolution
        : (options.resolution?.height || null);
      if (targetH && srcH > targetH) {
        dstH = targetH;
        dstW = Math.round(srcW * targetH / srcH / 2) * 2;
      }
    }

    // 画质百分比（越高越好），与渲染端展示一致
    const [crfMin, crfMax] = enc.crfRange || [0, 51];
    const quality = Math.round((crfMax - options.crf) / (crfMax - crfMin) * 100);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const vars = {
      name: basename,
      encoder: options.videoEncoder || '',
      container: container,
      height: dstH ? `${dstH}p` : '',
      width: dstW ? String(dstW) : '',
      crf: String(options.crf),
      quality: `${quality}q`,
      date: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
      time: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    };

    return template.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
  }

  _sanitizeFilename(name) {
    // 去除 Windows 文件名非法字符
    return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  }

  // 把软件 preset 名映射到 NVENC 的 p1(最快)~p7(最慢)
  _nvencPreset(preset) {
    const map = {
      ultrafast: 'p1', superfast: 'p1', veryfast: 'p2', faster: 'p3',
      fast: 'p4', medium: 'p4', slow: 'p5', slower: 'p6', veryslow: 'p7'
    };
    return map[preset] || 'p4';
  }
}

module.exports = new Transcoder();
