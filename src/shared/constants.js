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
    lib: 'libx264',
    label: 'H.264',
    crfRange: [0, 51],
    crfDefault: 23,
    profile: '-profile:v high',
    presets: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'],
    presetDefault: 'medium'
  },
  h265: {
    lib: 'libx265',
    label: 'H.265',
    crfRange: [0, 51],
    crfDefault: 28,
    profile: '',
    presets: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'],
    presetDefault: 'medium'
  },
  vp9: {
    lib: 'libvpx-vp9',
    label: 'VP9',
    crfRange: [0, 63],
    crfDefault: 32,
    profile: '',
    presets: [],
    presetDefault: null
  },
  av1: {
    lib: 'libaom-av1',
    label: 'AV1',
    crfRange: [0, 63],
    crfDefault: 32,
    profile: '',
    presets: [],
    presetDefault: null
  }
};

const CRF_PRESETS = {
  high: { label: '高画质', h264: 18, h265: 22, vp9: 24, av1: 24 },
  medium: { label: '中等', h264: 23, h265: 28, vp9: 32, av1: 32 },
  low: { label: '小体积', h264: 28, h265: 35, vp9: 40, av1: 40 }
};

const AUDIO_BITRATES = [96, 128, 160, 192, 256, 320];

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

function getParallelConfig(cpuCores) {
  if (cpuCores <= 4) return { parallel: 1, threadsPerTask: cpuCores };
  if (cpuCores <= 10) return { parallel: 2, threadsPerTask: Math.max(2, Math.floor((cpuCores - 1) / 2)) };
  if (cpuCores <= 16) return { parallel: 3, threadsPerTask: Math.max(2, Math.floor((cpuCores - 1) / 3)) };
  return { parallel: 4, threadsPerTask: Math.max(2, Math.floor((cpuCores - 1) / 4)) };
}

function getCompatibilityLabel(container, encoder) {
  const info = CONTAINERS[container];
  if (!info) return '';
  const level = info.compatibility[encoder];
  if (level === 'full') return '全平台浏览器';
  return '浏览器支持率低于 H.264';
}

// 估算文件体积（粗估，基于经验码率）
function estimateSize(durationSec, encoder, crf, audioBitrate) {
  // 经验码率表 (kbps at default CRF, 1080p)
  const baseBitrates = { h264: 5000, h265: 3500, vp9: 3000, av1: 2500 };
  const baseCRF = { h264: 23, h265: 28, vp9: 32, av1: 32 };
  const base = baseBitrates[encoder] || 5000;
  const refCRF = baseCRF[encoder] || 23;

  // CRF 每增减 6，码率大约减半/翻倍
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

module.exports = {
  CONTAINERS, VIDEO_ENCODERS, CRF_PRESETS, AUDIO_BITRATES,
  RESOLUTION_PRESETS, DEINTERLACE_MODES, INPUT_FORMATS,
  getParallelConfig, getCompatibilityLabel, estimateSize,
  formatBytes, formatDuration
};
