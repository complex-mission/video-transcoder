const { spawn } = require('child_process');
const ffmpegManager = require('./ffmpeg');
const i18n = require('./i18n');

class Probe {
  async probeFile(filePath) {
    const ffprobePath = ffmpegManager.getFFprobePath();
    if (!ffprobePath) throw new Error(i18n.t('err.ffprobeNotInit'));

    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ];

      const proc = spawn(ffprobePath, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);

      proc.on('close', code => {
        if (code !== 0) {
          return reject(new Error(i18n.t('err.ffprobeFailed', { code, detail: stderr })));
        }

        try {
          const data = JSON.parse(stdout);
          const result = this._parseProbeData(data, filePath);
          resolve(result);
        } catch (e) {
          reject(new Error(i18n.t('err.parseFailed', { detail: e.message })));
        }
      });

      proc.on('error', reject);
    });
  }

  _parseProbeData(data, filePath) {
    const format = data.format || {};
    const streams = data.streams || [];

    const videoStream = streams.find(s => s.codec_type === 'video');
    const audioStream = streams.find(s => s.codec_type === 'audio' && s.disposition?.default) ||
                        streams.find(s => s.codec_type === 'audio');

    const result = {
      path: filePath,
      filename: require('path').basename(filePath),
      duration: parseFloat(format.duration) || 0,
      size: parseInt(format.size) || 0,
      formatName: format.format_name || '',
      bitrate: parseInt(format.bit_rate) || 0,

      video: null,
      audio: null,

      // 用于反交错判断
      fieldOrder: null,
      isInterlaced: false
    };

    if (videoStream) {
      result.video = {
        codec: videoStream.codec_name || '',
        codecLong: videoStream.codec_long_name || '',
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        fps: this._parseFPS(videoStream.r_frame_rate),
        bitrate: parseInt(videoStream.bit_rate) || 0,
        profile: videoStream.profile || '',
        pixFmt: videoStream.pix_fmt || '',
        level: videoStream.level
      };

      const fieldOrder = videoStream.field_order || videoStream.field_order === undefined ? 'unknown' : 'progressive';
      result.fieldOrder = videoStream.field_order || 'unknown';
      result.isInterlaced = ['tt', 'bb', 'tb', 'bt', 'unknown'].includes(result.fieldOrder);
    }

    if (audioStream) {
      result.audio = {
        codec: audioStream.codec_name || '',
        channels: audioStream.channels || 0,
        sampleRate: parseInt(audioStream.sample_rate) || 0,
        bitrate: parseInt(audioStream.bit_rate) || 0,
        profile: audioStream.profile || ''
      };
    }

    return result;
  }

  /**
   * 抽取一帧并以 base64 data URL 返回（用于缩略图与截帧预览）
   * @param {string} filePath
   * @param {number} seekSec 抽帧时间点（秒）
   * @param {number} width 缩放宽度（高自适应，-2 保证偶数）
   */
  getThumbnail(filePath, seekSec = 1, width = 160) {
    const ffmpegPath = ffmpegManager.getFFmpegPath();
    const grab = (seek) => new Promise((resolve, reject) => {
      const args = [
        '-hide_banner',
        '-ss', String(Math.max(0, seek)),
        '-i', filePath,
        '-frames:v', '1',
        '-vf', `scale=${width}:-2`,
        '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'
      ];
      const proc = spawn(ffmpegPath, args, { windowsHide: true });
      const chunks = [];
      proc.stdout.on('data', d => chunks.push(d));
      proc.stderr.on('data', () => {});
      proc.on('close', () => {
        const buf = Buffer.concat(chunks);
        buf.length > 0 ? resolve('data:image/jpeg;base64,' + buf.toString('base64')) : reject(new Error('empty'));
      });
      proc.on('error', reject);
    });
    // 先按给定时间抽帧，失败（如视频过短）则回退到 0 秒
    return grab(seekSec).catch(() => grab(0));
  }

  /**
   * 抽取一帧并保存为图片文件（全分辨率，用于截帧导出）
   */
  captureFrame(filePath, seekSec, outPath) {
    const ffmpegPath = ffmpegManager.getFFmpegPath();
    return new Promise((resolve, reject) => {
      const args = [
        '-hide_banner', '-y',
        '-ss', String(Math.max(0, seekSec)),
        '-i', filePath,
        '-frames:v', '1',
        outPath
      ];
      const proc = spawn(ffmpegPath, args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', d => stderr += d);
      proc.on('close', code => {
        if (code === 0) resolve(outPath);
        else reject(new Error(i18n.t('err.captureFailed', { code, detail: stderr.slice(-300) })));
      });
      proc.on('error', reject);
    });
  }

  _parseFPS(fpsStr) {
    if (!fpsStr) return 0;
    const parts = fpsStr.split('/');
    if (parts.length === 2) {
      return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    return parseFloat(fpsStr) || 0;
  }
}

module.exports = new Probe();
