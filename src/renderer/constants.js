// 共享常量（渲染进程版本，挂载到 window）
(function () {
  'use strict';

  const CONTAINERS = {
    mp4: {
      label: 'MP4',
      videoEncoders: ['h264', 'h265'],
      audioEncoder: 'aac',
      compatibility: { h264: 'full', h265: 'partial' },
      extensions: ['.mp4'],
      movflags: '-movflags +faststart'
    },
    mov: {
      label: 'MOV',
      videoEncoders: ['h264', 'h265'],
      audioEncoder: 'aac',
      compatibility: { h264: 'full', h265: 'partial' },
      extensions: ['.mov'],
      movflags: '-movflags +faststart'
    },
    webm: {
      label: 'WebM',
      videoEncoders: ['vp9', 'av1'],
      audioEncoder: 'opus',
      compatibility: { vp9: 'partial', av1: 'partial' },
      extensions: ['.webm'],
      movflags: ''
    }
  };

  const VIDEO_ENCODERS = {
    h264: {
      lib: 'libx264', label: 'H.264',
      crfRange: [0, 51], crfDefault: 23,
      qualityMarks: { lossless: 18, balanced: 23, lossy: 32 },
      profile: '-profile:v high',
      presets: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'],
      presetDefault: 'medium'
    },
    h265: {
      lib: 'libx265', label: 'H.265',
      crfRange: [0, 51], crfDefault: 28,
      qualityMarks: { lossless: 23, balanced: 28, lossy: 37 },
      profile: '',
      presets: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'],
      presetDefault: 'medium'
    },
    vp9: {
      lib: 'libvpx-vp9', label: 'VP9',
      crfRange: [0, 63], crfDefault: 32,
      qualityMarks: { lossless: 24, balanced: 33, lossy: 45 },
      profile: '', presets: [], presetDefault: null
    },
    av1: {
      lib: 'libaom-av1', label: 'AV1',
      crfRange: [0, 63], crfDefault: 32,
      qualityMarks: { lossless: 24, balanced: 33, lossy: 45 },
      profile: '', presets: [], presetDefault: null
    }
  };

  const CRF_PRESETS = {
    high: { label: '高画质', h264: 18, h265: 22, vp9: 24, av1: 24 },
    medium: { label: '中等', h264: 23, h265: 28, vp9: 32, av1: 32 },
    low: { label: '小体积', h264: 28, h265: 35, vp9: 40, av1: 40 }
  };

  const AUDIO_BITRATES = [96, 128, 160, 192, 256, 320];

  // 不同音频编码器的可选码率与默认值。
  // Opus 效率远高于 AAC：立体声约 96~128k 即接近透明，无需 256/320k。
  const AUDIO_CODECS = {
    aac:  { label: 'AAC',  bitrates: [96, 128, 160, 192, 256, 320], default: 128 },
    opus: { label: 'Opus', bitrates: [64, 96, 128, 160, 192],       default: 96 }
  };

  const RESOLUTION_PRESETS = [
    { label: '原始', value: null },
    { label: '2160p', height: 2160 },
    { label: '1440p', height: 1440 },
    { label: '1080p', height: 1080 },
    { label: '720p', height: 720 },
    { label: '480p', height: 480 }
  ];

  const DEINTERLACE_MODES = {
    smart: { label: '智能（推荐）', description: '仅对隔行源反交错' },
    force: { label: '强制反交错', description: '始终应用 bwdif' },
    none: { label: '不处理', description: '保持源扫描方式' }
  };

  const INPUT_FORMATS = ['.mp4', '.mov', '.mkv'];

  function getCompatibilityLabel(container, encoder) {
    const info = CONTAINERS[container];
    if (!info) return '';
    const level = info.compatibility[encoder];
    if (level === 'full') return 'compat.full';
    return 'compat.partial';
  }

  function estimateSize(durationSec, encoder, crf, audioBitrate) {
    const baseBitrates = { h264: 5000, h265: 3500, vp9: 3000, av1: 2500 };
    const baseCRF = { h264: 23, h265: 28, vp9: 32, av1: 32 };
    const base = baseBitrates[encoder] || 5000;
    const refCRF = baseCRF[encoder] || 23;
    const crfFactor = Math.pow(2, (refCRF - crf) / 6);
    const videoKbps = base * crfFactor;
    const audioKbps = audioBitrate || 128;
    const totalKbps = videoKbps + audioKbps;
    const bytes = (totalKbps * 1000 / 8) * durationSec;
    return bytes;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  }

  window.VideoTranscoderConstants = {
    CONTAINERS, VIDEO_ENCODERS, CRF_PRESETS, AUDIO_BITRATES, AUDIO_CODECS,
    RESOLUTION_PRESETS, DEINTERLACE_MODES, INPUT_FORMATS,
    getCompatibilityLabel, estimateSize, formatBytes, formatDuration
  };
})();
