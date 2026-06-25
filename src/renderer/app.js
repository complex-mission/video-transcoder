// CM视频转码器 - 渲染进程主逻辑
(function () {
  'use strict';

  const { CONTAINERS, VIDEO_ENCODERS, CRF_PRESETS, AUDIO_BITRATES, AUDIO_CODECS, RESOLUTION_PRESETS,
    getCompatibilityLabel, estimateSize, formatBytes, formatDuration } = window.VideoTranscoderConstants;

  const MAX_FILES = 100;

  // 「?」提示气泡的说明文案（key 对应 .help-tip 的 data-help）
  function getHelpTexts() {
    return {
      container: I18n.t('helptip.container'),
      encoder: I18n.t('helptip.encoder'),
      quality: I18n.t('helptip.quality'),
      preset: I18n.t('helptip.preset'),
      hwaccel: I18n.t('helptip.hwaccel'),
      audio: I18n.t('helptip.audio'),
      parallel: I18n.t('helptip.parallel'),
      deinterlace: I18n.t('helptip.deinterlace')
    };
  }

  let config = {};
  let currentOptions = {
    container: 'mp4',
    videoEncoder: 'h264',
    qualityPreset: 'medium',
    crf: 23,
    preset: 'medium',
    resolution: null,
    customWidth: null,
    customHeight: null,
    deinterlace: 'smart',
    audioEnabled: true,
    audioBitrate: 128,
    audioCopy: false,
    hwaccel: false
  };
  let hwInfo = { h264: null, h265: null, vendor: null, devices: [] };
  let lockAspect = true; // 自定义分辨率：是否锁定宽高比
  let selectedProbeData = null;
  let probedPath = null; // 当前已 probe 的首个待转码文件路径
  let lastActive = false; // 上次是否有进行中/排队任务，用于检测批量完成

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  async function init() {
    setupEventListeners();
    setupDragDrop();
    setupIPCListeners();

    // 申请系统通知权限（用于批量完成提醒）
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (e) { /* ignore */ }

    const result = await window.api.init();
    if (!result.success) {
      showToast(I18n.t('toast.initFailed', { error: result.error }), 'error', 8000);
    } else {
      config = result.config;
      if (result.ffmpeg?.hw) hwInfo = result.ffmpeg.hw;
      I18n.initLang(config.language);
      I18n.applyI18n();
      applyConfigToUI();
    }

    updateFooterCopy();

    // 通知主进程：渲染层已就绪，可展示主窗口并关闭欢迎页
    window.api.appReady();
  }

  function updateFooterCopy() {
    const BUILD_YEAR = 2026;
    const endYear = Math.max(BUILD_YEAR, new Date().getFullYear());
    const copyEl = $('#footer-copy');
    if (copyEl) copyEl.textContent = I18n.t('help.copyright', { year: endYear });
  }

  // 切换语言时刷新「由 JS 动态写入、不带 data-i18n」的文案，避免残留旧语言
  function refreshDynamicI18n() {
    // 编码器兼容性徽章
    const badge = $('#compat-badge');
    if (badge) {
      const compatKey = getCompatibilityLabel(currentOptions.container, currentOptions.videoEncoder);
      badge.textContent = I18n.t(compatKey);
    }
    // 硬件加速检测到的设备
    const hwEnc = hwInfo[currentOptions.videoEncoder];
    const hwWrap = $('#hwaccel-group-wrap');
    if (hwEnc && hwWrap && !hwWrap.classList.contains('hidden')) {
      $('#hwaccel-device').textContent = I18n.t('hwaccel.detected', { vendor: hwInfo.vendor || 'HW', encoder: hwEnc });
    }
    // 音频码率编码器标注
    const audioLabel = $('#audio-bitrate-label');
    if (audioLabel) {
      const codec = AUDIO_CODECS[CONTAINERS[currentOptions.container].audioEncoder] || AUDIO_CODECS.aac;
      audioLabel.textContent = I18n.t('audio.bitrateLabelWithCodec', { codec: codec.label });
    }
    // 锁定宽高比按钮 title
    const lockEl = $('#res-lock');
    if (lockEl) lockEl.title = lockAspect ? I18n.t('resolution.lockAspect') : I18n.t('resolution.unlockAspect');
    // 自定义分辨率提示（仅在自定义模式可见时刷新）
    const hintEl = $('#resolution-hint');
    if (hintEl && !hintEl.classList.contains('hidden')) applyCustomResolution();
  }

  function applyConfigToUI() {
    if (config.defaultContainer) {
      selectToggle('#container-group', config.defaultContainer);
      currentOptions.container = config.defaultContainer;
    }
    if (config.defaultEncoder) {
      currentOptions.videoEncoder = config.defaultEncoder;
    }
    updateEncoderButtons();
    updateEncoderUI();
    updateAudioOptions();
  }

  function setupEventListeners() {
    $('#btn-add-files').addEventListener('click', async () => {
      const files = await window.api.selectFiles();
      if (files.length > 0) addFiles(files);
    });

    $('#empty-state').addEventListener('click', async () => {
      const files = await window.api.selectFiles();
      if (files.length > 0) addFiles(files);
    });

    $$('#container-group .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        selectToggle('#container-group', btn.dataset.value);
        currentOptions.container = btn.dataset.value;
        updateEncoderButtons();
        updateEncoderUI();
        updateAudioOptions();
        updatePreview();
      });
    });

    $$('#encoder-group .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('hidden')) return;
        selectToggle('#encoder-group', btn.dataset.value);
        currentOptions.videoEncoder = btn.dataset.value;
        updateEncoderUI();
        updatePreview();
      });
    });

    $$('#quality-group .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        selectToggle('#quality-group', btn.dataset.value);
        currentOptions.qualityPreset = btn.dataset.value;
        if (btn.dataset.value !== 'custom') {
          const preset = CRF_PRESETS[btn.dataset.value];
          currentOptions.crf = preset[currentOptions.videoEncoder];
          $('#crf-slider-wrap').classList.add('hidden');
          $('#crf-hint').classList.add('hidden');
        } else {
          updateCrfSlider();
          $('#crf-slider-wrap').classList.remove('hidden');
          $('#crf-hint').classList.remove('hidden');
        }
        updatePreview();
      });
    });

    // 画质百分比滑块（内部换算为 CRF）
    $('#crf-slider').addEventListener('input', (e) => {
      const q = parseInt(e.target.value);
      currentOptions.crf = qualityToCrf(q);
      $('#crf-value').textContent = q + '%';
      updatePreview();
    });

    $('#preset-select').addEventListener('change', (e) => {
      currentOptions.preset = e.target.value;
    });

    // 硬件加速开关
    $('#hwaccel-toggle').addEventListener('change', (e) => {
      currentOptions.hwaccel = e.target.checked;
      updatePreview();
    });

    $('#resolution-select').addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        $('#resolution-custom-wrap').classList.remove('hidden');
        $('#resolution-hint').classList.remove('hidden');
        currentOptions.resolution = null;
        applyCustomResolution();
      } else if (val === 'original') {
        $('#resolution-custom-wrap').classList.add('hidden');
        $('#resolution-hint').classList.add('hidden');
        currentOptions.resolution = null;
        currentOptions.customWidth = null;
        currentOptions.customHeight = null;
        updatePreview();
      } else {
        $('#resolution-custom-wrap').classList.add('hidden');
        $('#resolution-hint').classList.add('hidden');
        currentOptions.resolution = parseInt(val);
        currentOptions.customWidth = null;
        currentOptions.customHeight = null;
        updatePreview();
      }
    });

    // Custom resolution inputs（锁定时改一个尺寸自动按原视频比例算另一个）
    $('#res-width').addEventListener('input', () => { if (lockAspect) syncHeightFromWidth(); applyCustomResolution(); });
    $('#res-height').addEventListener('input', () => { if (lockAspect) syncWidthFromHeight(); applyCustomResolution(); });
    $('#res-lock').addEventListener('click', () => {
      lockAspect = !lockAspect;
      $('#res-lock').classList.toggle('active', lockAspect);
      $('#res-lock').title = lockAspect ? I18n.t('resolution.lockAspect') : I18n.t('resolution.unlockAspect');
      if (lockAspect) { syncHeightFromWidth(); applyCustomResolution(); }
    });

    $$('#deinterlace-group .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        selectToggle('#deinterlace-group', btn.dataset.value);
        currentOptions.deinterlace = btn.dataset.value;
        updatePreview();
      });
    });

    $('#audio-enabled').addEventListener('change', (e) => {
      currentOptions.audioEnabled = e.target.checked;
      $('#audio-bitrate-wrap').classList.toggle('hidden', !e.target.checked);
      $('#audio-copy-wrap').classList.toggle('hidden', !e.target.checked);
      updatePreview();
    });

    $('#audio-copy').addEventListener('change', (e) => {
      currentOptions.audioCopy = e.target.checked;
      $('#audio-bitrate-wrap').classList.toggle('hidden', e.target.checked);
      updatePreview();
    });

    $('#audio-bitrate').addEventListener('change', (e) => {
      currentOptions.audioBitrate = parseInt(e.target.value);
      updatePreview();
    });

    $('#btn-cancel-all').addEventListener('click', () => window.api.cancelAll());
    $('#btn-clear-finished').addEventListener('click', () => {
      window.api.clearFinished();
      refreshTaskList();
    });

    $('#btn-start').addEventListener('click', startTranscoding);

    $('#btn-settings').addEventListener('click', () => openSettings());
    $('#btn-close-settings').addEventListener('click', () => closeSettings());
    $('#settings-modal .modal-backdrop').addEventListener('click', () => closeSettings());
    $('#btn-save-settings').addEventListener('click', saveSettings);
    $('#btn-select-output').addEventListener('click', async () => {
      const dir = await window.api.selectOutputDir();
      if (dir) $('#setting-output-dir').value = dir;
    });
    $('#setting-template').addEventListener('input', updateTemplatePreview);

    $$('#parallel-mode-group .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        selectToggle('#parallel-mode-group', btn.dataset.value);
        $('#parallel-count-wrap').classList.toggle('hidden', btn.dataset.value === 'auto');
      });
    });

    $('#link-help').addEventListener('click', (e) => {
      e.preventDefault();
      $('#help-modal').classList.remove('hidden');
    });
    $('#btn-close-help').addEventListener('click', () => $('#help-modal').classList.add('hidden'));
    $('#help-modal .modal-backdrop').addEventListener('click', () => $('#help-modal').classList.add('hidden'));

    // 截帧弹窗
    $('#capture-slider').addEventListener('input', (e) => {
      captureState.seek = parseFloat(e.target.value) || 0;
      $('#capture-time-label').textContent = formatDuration(captureState.seek);
      scheduleCapturePreview();
    });
    $$('#capture-format-group .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        selectToggle('#capture-format-group', btn.dataset.value);
        captureState.format = btn.dataset.value;
      });
    });
    $('#btn-capture-save').addEventListener('click', saveCapture);
    $('#btn-close-capture').addEventListener('click', closeCapture);
    $('#capture-modal .modal-backdrop').addEventListener('click', closeCapture);

    // 外部链接统一用系统浏览器打开（避免在应用窗口内跳转）
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-ext]');
      if (link) {
        e.preventDefault();
        window.api.openExternal(link.dataset.ext);
      }
    });

    // 「?」提示气泡：点击切换，点击别处关闭
    document.addEventListener('click', (e) => {
      const tip = e.target.closest('.help-tip');
      const pop = $('#help-popover');
      if (tip) {
        e.preventDefault();
        e.stopPropagation();
        if (!pop.classList.contains('hidden') && pop.dataset.for === tip.dataset.help) {
          hideHelpPopover();
        } else {
          showHelpPopover(tip);
        }
        return;
      }
      if (!e.target.closest('#help-popover')) hideHelpPopover();
    });
  }

  function showHelpPopover(btn) {
    const text = getHelpTexts()[btn.dataset.help];
    if (!text) return;
    const pop = $('#help-popover');
    pop.innerHTML = text;
    pop.dataset.for = btn.dataset.help;
    pop.classList.remove('hidden');
    // 定位在按钮下方，避免超出右/下边界
    const r = btn.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - pw - 12);
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - 12) top = r.top - ph - 8; // 放不下则翻到上方
    pop.style.left = Math.max(12, left) + 'px';
    pop.style.top = Math.max(12, top) + 'px';
  }

  function hideHelpPopover() {
    $('#help-popover').classList.add('hidden');
  }

  // 原视频宽高比（无探测数据时回退 16:9）
  function srcAspect() {
    const v = selectedProbeData?.video;
    return (v && v.width && v.height) ? v.width / v.height : (16 / 9);
  }
  function syncHeightFromWidth() {
    const w = parseInt($('#res-width').value) || 0;
    if (w > 0) $('#res-height').value = Math.round(w / srcAspect() / 2) * 2;
  }
  function syncWidthFromHeight() {
    const h = parseInt($('#res-height').value) || 0;
    if (h > 0) $('#res-width').value = Math.round(h * srcAspect() / 2) * 2;
  }

  function applyCustomResolution() {
    const w = parseInt($('#res-width').value) || 0;
    const h = parseInt($('#res-height').value) || 0;
    const hintEl = $('#resolution-hint');

    if (h > 0) {
      currentOptions.resolution = h;
      currentOptions.customWidth = w > 0 ? w : null;
      currentOptions.customHeight = h;
    } else {
      currentOptions.resolution = null;
      currentOptions.customWidth = null;
      currentOptions.customHeight = null;
    }

    if (w > 0 && h > 0) {
      const v = selectedProbeData?.video;
      if (v && v.width && v.height) {
        const diff = Math.abs((v.width / v.height) - (w / h));
        hintEl.textContent = diff > 0.01
          ? I18n.t('resolution.hintDiffRatio')
          : I18n.t('resolution.hintSameRatio');
      } else {
        hintEl.textContent = I18n.t('resolution.hintEven');
      }
    } else {
      hintEl.textContent = I18n.t('resolution.hintInput');
    }

    updatePreview();
  }

  function setupDragDrop() {
    let dragCounter = 0;
    let overlay = null;

    function createOverlay() {
      overlay = document.createElement('div');
      overlay.className = 'drag-overlay';
      overlay.innerHTML = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="8" y="12" width="32" height="24" rx="4" stroke="currentColor" stroke-width="2"/><path d="M24 20v8M20 24h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>${I18n.t('drag.dropToAdd')}</span>`;
      document.body.appendChild(overlay);
    }

    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (!overlay) createOverlay();
    });

    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0 && overlay) {
        overlay.remove();
        overlay = null;
        dragCounter = 0;
      }
    });

    document.addEventListener('dragover', (e) => { e.preventDefault(); });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      if (overlay) { overlay.remove(); overlay = null; }
      dragCounter = 0;

      // Electron 32+ 已移除 File.path，须用 webUtils.getPathForFile 取真实路径
      const files = Array.from(e.dataTransfer.files)
        .map(f => window.api.getPathForFile(f))
        .filter(Boolean);

      if (files.length > 0) addFiles(files);
    });
  }

  function setupIPCListeners() {
    window.api.on('taskProgress', (task) => { updateTaskUI(task); throttledGlobalProgress(); });
    window.api.on('taskCompleted', (task) => { updateTaskUI(task); updateGlobalProgress(); });
    window.api.on('taskFailed', (task) => { updateTaskUI(task); updateGlobalProgress(); });
    window.api.on('taskCancelled', (task) => { updateTaskUI(task); updateGlobalProgress(); });
    window.api.on('taskStarted', (task) => { updateTaskUI(task); updateGlobalProgress(); });
    window.api.on('taskAdded', (task) => { addTaskToList(task); updateGlobalProgress(); });
    window.api.on('queueUpdated', (stats) => updateGlobalProgress(stats));
  }

  async function addFiles(filePaths) {
    if (!window._pendingFiles) window._pendingFiles = [];

    // 仅接受受支持的扩展名，并去重
    const incoming = (Array.isArray(filePaths) ? filePaths : [filePaths])
      .filter(p => /\.(mp4|mov|mkv)$/i.test(p))
      .filter(p => !window._pendingFiles.includes(p));

    if (incoming.length === 0) return;

    // 强制最多 MAX_FILES 个，超出部分明确提示
    const remaining = MAX_FILES - window._pendingFiles.length;
    if (remaining <= 0) {
      showToast(I18n.t('toast.maxFiles', { max: MAX_FILES }), 'warning');
      return;
    }
    const toAdd = incoming.slice(0, remaining);
    const dropped = incoming.length - toAdd.length;
    if (dropped > 0) {
      showToast(I18n.t('toast.maxFilesReached', { max: MAX_FILES, count: dropped }), 'warning');
    }

    window._pendingFiles.push(...toAdd);

    renderPending();
    await ensurePreviewForFirst();
  }

  // 渲染待转码文件列表（可逐个移除）
  function renderPending() {
    const wrap = $('#pending-wrap');
    const files = window._pendingFiles || [];
    wrap.innerHTML = '';

    if (files.length === 0) {
      $('#btn-start').classList.add('hidden');
      // 没有任务时恢复空状态
      if (document.querySelectorAll('.task-item').length === 0) {
        $('#empty-state')?.classList.remove('hidden');
      }
      return;
    }

    $('#empty-state')?.classList.add('hidden');
    $('#btn-start').classList.remove('hidden');

    const header = document.createElement('div');
    header.className = 'pending-header';
    header.textContent = I18n.t('pending.header', { count: files.length, max: MAX_FILES });
    wrap.appendChild(header);

    files.forEach((fp, idx) => {
      const name = fp.split(/[\\/]/).pop();
      const row = document.createElement('div');
      row.className = 'pending-item';
      row.innerHTML = `
        <div class="thumb thumb-sm"><img alt=""></div>
        <span class="pending-name" title="${fp}">${name}</span>
        <button class="pending-capture" title="${I18n.t('pending.captureTitle')}">
          <span class="svg-icon svg-icon--lg"><svg viewBox="0 0 24 24" fill="none"><rect x="2" y="7" width="20" height="13" rx="2.5" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="13.5" r="3.6" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 7l1.5-2.6h4L15.5 7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></span>
        </button>
        <button class="pending-remove" title="${I18n.t('pending.removeTitle')}">
          <span class="svg-icon svg-icon--sm"><svg viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
        </button>`;
      row.querySelector('.pending-capture').addEventListener('click', () => openCaptureForFile(fp));
      row.querySelector('.pending-remove').addEventListener('click', () => removePending(idx));
      // 先入文档再加载缩略图：命中缓存时 applyThumb 会同步执行，
      // 须保证此刻 img 已 isConnected（否则切换语言重渲染后缓存命中不显示）
      wrap.appendChild(row);
      loadThumb(fp, row.querySelector('.thumb img'));
    });
  }

  // 缩略图缓存 + 受控并发（避免大批量时瞬间 spawn 大量 ffmpeg）
  const thumbCache = new Map();
  const thumbQueue = [];
  let thumbActive = 0;
  const THUMB_CONCURRENCY = 4;

  function applyThumb(imgEl, data) {
    if (!imgEl || !imgEl.isConnected) return; // 列表可能已重建，元素已脱离文档
    imgEl.src = data;
    imgEl.parentElement.classList.add('loaded');
  }

  function loadThumb(filePath, imgEl) {
    if (!imgEl) return;
    if (thumbCache.has(filePath)) { applyThumb(imgEl, thumbCache.get(filePath)); return; }
    thumbQueue.push({ filePath, imgEl });
    pumpThumbs();
  }

  function pumpThumbs() {
    while (thumbActive < THUMB_CONCURRENCY && thumbQueue.length > 0) {
      const { filePath, imgEl } = thumbQueue.shift();
      if (thumbCache.has(filePath)) { applyThumb(imgEl, thumbCache.get(filePath)); continue; }
      thumbActive++;
      window.api.getThumbnail(filePath, 1, 160)
        .then(data => { if (data) { thumbCache.set(filePath, data); applyThumb(imgEl, data); } })
        .finally(() => { thumbActive--; pumpThumbs(); });
    }
  }

  async function removePending(idx) {
    if (!window._pendingFiles) return;
    window._pendingFiles.splice(idx, 1);
    renderPending();
    await ensurePreviewForFirst();
  }

  // 预览始终反映「第一个待转码文件」；列表为空则清空预览
  async function ensurePreviewForFirst() {
    const first = (window._pendingFiles || [])[0] || null;
    if (!first) {
      probedPath = null;
      selectedProbeData = null;
      updatePreview();
      return;
    }
    if (probedPath === first) return; // 首个文件未变，无需重新探测
    probedPath = first;
    const probeResult = await window.api.probeFile(first);
    if (probedPath !== first) return; // 期间又变了，丢弃过期结果
    selectedProbeData = probeResult.error ? null : probeResult;
    updatePreview();
  }

  async function startTranscoding() {
    const files = window._pendingFiles;
    if (!files || files.length === 0) return;

    $('#btn-start').classList.add('hidden');
    $('#btn-cancel-all').classList.remove('hidden');
    window._pendingFiles = null;
    $('#pending-wrap').innerHTML = '';

    // 清空预览，等待下一批
    selectedProbeData = null;
    probedPath = null;
    $('#preview-card').classList.add('hidden');

    await window.api.addTasks(files, currentOptions);
  }

  function updateEncoderButtons() {
    const container = CONTAINERS[currentOptions.container];
    const encoders = container.videoEncoders;

    $$('#encoder-group .btn-toggle').forEach(btn => {
      btn.classList.toggle('hidden', !encoders.includes(btn.dataset.value));
    });

    // 当前编码器若不被新容器支持，回退到第一个
    if (!encoders.includes(currentOptions.videoEncoder)) {
      currentOptions.videoEncoder = encoders[0];
    }

    // 始终只高亮当前编码器（清除隐藏按钮上的残留 active）
    selectToggle('#encoder-group', currentOptions.videoEncoder);
  }

  function updateEncoderUI() {
    const enc = VIDEO_ENCODERS[currentOptions.videoEncoder];

    const badge = $('#compat-badge');
    const compatKey = getCompatibilityLabel(currentOptions.container, currentOptions.videoEncoder);
    const compat = I18n.t(compatKey);
    const isFull = CONTAINERS[currentOptions.container].compatibility[currentOptions.videoEncoder] === 'full';
    badge.textContent = compat;
    badge.className = 'compat-badge' + (isFull ? '' : ' warning');

    const qualityBtn = document.querySelector('#quality-group .btn-toggle.active');
    if (qualityBtn && qualityBtn.dataset.value !== 'custom') {
      currentOptions.crf = CRF_PRESETS[qualityBtn.dataset.value][currentOptions.videoEncoder];
    } else {
      // 自定义模式下切换编码器：保持画质百分比不变，按新编码器范围重算 CRF
      const q = parseInt($('#crf-slider').value) || crfToQuality(enc.crfDefault);
      currentOptions.crf = qualityToCrf(q);
    }
    updateCrfSlider();

    $('#preset-group-wrap').classList.toggle('hidden', enc.presets.length === 0);
    if (enc.presetDefault) {
      currentOptions.preset = enc.presetDefault;
      $('#preset-select').value = enc.presetDefault;
    }

    updateHwaccelUI();
  }

  // 硬件加速开关：仅当前编码器存在可用硬件编码器时显示
  function updateHwaccelUI() {
    const hwEnc = hwInfo[currentOptions.videoEncoder];
    const wrap = $('#hwaccel-group-wrap');
    if (hwEnc) {
      const vendor = hwInfo.vendor || 'HW';
      wrap.classList.remove('hidden');
      $('#hwaccel-device').textContent = I18n.t('hwaccel.detected', { vendor, encoder: hwEnc });
    } else {
      wrap.classList.add('hidden');
      currentOptions.hwaccel = false;
      $('#hwaccel-toggle').checked = false;
    }
  }

  // 音频码率选项随容器的音频编码器变化（AAC vs Opus）
  function updateAudioOptions() {
    const encoderKey = CONTAINERS[currentOptions.container].audioEncoder;
    const codec = AUDIO_CODECS[encoderKey] || AUDIO_CODECS.aac;

    // 当前码率若不在新编码器的可选范围内，回退到该编码器默认值
    if (!codec.bitrates.includes(currentOptions.audioBitrate)) {
      currentOptions.audioBitrate = codec.default;
    }

    const select = $('#audio-bitrate');
    select.innerHTML = codec.bitrates
      .map(b => `<option value="${b}">${b} kbps</option>`)
      .join('');
    select.value = String(currentOptions.audioBitrate);

    // 标注当前音频编码器
    const label = $('#audio-bitrate-label');
    if (label) label.textContent = I18n.t('audio.bitrateLabelWithCodec', { codec: codec.label });
  }

  // CRF <-> 画质百分比换算（百分比越高 = CRF 越低 = 画质越好）
  // 对用户隐藏 0-51 / 0-63 两套不同的 CRF 量纲。
  function crfToQuality(crf) {
    const [min, max] = VIDEO_ENCODERS[currentOptions.videoEncoder].crfRange;
    return Math.round((max - crf) / (max - min) * 100);
  }
  function qualityToCrf(q) {
    const [min, max] = VIDEO_ENCODERS[currentOptions.videoEncoder].crfRange;
    return Math.round(max - (q / 100) * (max - min));
  }
  function updateCrfSlider() {
    const q = crfToQuality(currentOptions.crf);
    $('#crf-slider').value = q;
    $('#crf-value').textContent = q + '%';
    renderCrfRuler();
  }

  // 画质标尺：按当前编码器的 CRF 关键点，在滑块下标注
  // 肉眼无损 / 平衡 / 明显损失 三个位置（随编码器不同而移动）
  function renderCrfRuler() {
    const ruler = $('#crf-ruler');
    if (!ruler) return;
    const marks = VIDEO_ENCODERS[currentOptions.videoEncoder].qualityMarks;
    if (!marks) { ruler.innerHTML = ''; return; }
    const defs = [
      { key: 'lossless', crf: marks.lossless },
      { key: 'balanced', crf: marks.balanced },
      { key: 'lossy', crf: marks.lossy }
    ];
    ruler.innerHTML = defs.map(d => {
      const pct = Math.max(0, Math.min(100, crfToQuality(d.crf)));
      const title = I18n.t('quality.mark.' + d.key);
      return `<span class="crf-mark ${d.key}" style="left:${pct}%" title="${title}"></span>`;
    }).join('');
  }

  function selectToggle(groupSel, value) {
    document.querySelectorAll(`${groupSel} .btn-toggle`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }

  function addTaskToList(task) {
    const list = $('#task-list');
    const empty = $('#empty-state');
    if (empty) empty.classList.add('hidden');

    const statusClass = task.status || 'queued';
    const statusText = getStatusLabel(statusClass);
    const el = document.createElement('div');
    el.className = `task-item ${statusClass === 'running' ? 'active' : ''}`;
    el.id = `task-${task.id}`;
    el.innerHTML = `
      <div class="thumb"><img alt=""></div>
      <div class="task-body">
        <div class="task-header">
          <span class="task-name" title="${task.filePath}">${task.probeData?.filename || task.filePath}</span>
          <span class="task-status ${statusClass}">${statusText}</span>
          <button class="task-cancel" title="${I18n.t('task.cancelTitle')}">
            <span class="svg-icon svg-icon--sm"><svg viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
          </button>
        </div>
        <div class="task-meta">
          <span class="task-fps">-- fps</span>
          <span class="task-speed">-- x</span>
          <span class="task-remaining">${I18n.t('task.remaining', { time: '--:--:--' })}</span>
        </div>
        <div class="task-progress-bar"><div class="task-progress-fill" style="width:0%"></div></div>
      </div>
    `;
    // X 按钮：进行中/排队中 = 取消任务；已完成/失败/取消 = 移除该卡片
    el.querySelector('.task-cancel').addEventListener('click', () => {
      const cls = el.querySelector('.task-status')?.className || '';
      if (cls.includes('running') || cls.includes('queued')) {
        window.api.cancelTask(task.id);
      } else {
        removeTaskCard(task.id, el);
      }
    });
    // 先入文档再加载缩略图（缓存命中时 applyThumb 同步执行，依赖 img 已 isConnected）
    list.appendChild(el);
    if (task.filePath) loadThumb(task.filePath, el.querySelector('.thumb img'));

    updateTaskCount();
    updateGlobalButtons();
  }

  function updateTaskUI(task) {
    const el = document.getElementById(`task-${task.id}`);
    if (!el) return;

    const statusEl = el.querySelector('.task-status');
    const fillEl = el.querySelector('.task-progress-fill');
    const fpsEl = el.querySelector('.task-fps');
    const speedEl = el.querySelector('.task-speed');
    const remainEl = el.querySelector('.task-remaining');

    statusEl.textContent = getStatusLabel(task.status);
    statusEl.className = `task-status ${task.status}`;
    fillEl.style.width = `${task.progress}%`;
    fillEl.className = `task-progress-fill ${task.status}`;

    // X 按钮始终可见：进行中/排队中=取消，结束后=移除卡片（title 随之切换）
    const cancelBtn = el.querySelector('.task-cancel');
    if (cancelBtn) {
      const cancellable = task.status === 'queued' || task.status === 'running';
      cancelBtn.classList.remove('hidden');
      cancelBtn.title = cancellable ? I18n.t('task.cancelTitle') : I18n.t('task.removeTitle');
    }

    if (task.status === 'running') {
      fpsEl.textContent = `${task.fps?.toFixed(1) || '--'} fps`;
      speedEl.textContent = `${task.speed?.toFixed(1) || '--'}x`;
      remainEl.textContent = I18n.t('task.remaining', { time: task.remaining > 0 ? formatDuration(task.remaining) : '--:--:--' });
    }

    if (task.status === 'completed') {
      el.classList.remove('active');
      el.classList.add('completed');
      const meta = el.querySelector('.task-meta');
      meta.innerHTML = `<span class="mono">${I18n.t('task.completedSize', { size: formatBytes(task.outputSize || 0) })}</span>`;

      if (task.outputPath) {
        let actions = el.querySelector('.task-actions');
        if (!actions) {
          actions = document.createElement('div');
          actions.className = 'task-actions';
          el.querySelector('.task-body').appendChild(actions);
        }
        actions.innerHTML = '';
        const openBtn = document.createElement('button');
        openBtn.className = 'btn btn-sm';
        openBtn.textContent = I18n.t('task.openFile');
        openBtn.addEventListener('click', () => window.api.openPath(task.outputPath));
        const folderBtn = document.createElement('button');
        folderBtn.className = 'btn btn-sm';
        folderBtn.textContent = I18n.t('task.openFolder');
        folderBtn.addEventListener('click', () => window.api.showInFolder(task.outputPath));
        const captureBtn = document.createElement('button');
        captureBtn.className = 'btn btn-sm';
        captureBtn.textContent = I18n.t('task.capture');
        captureBtn.addEventListener('click', () => openCaptureForFile(task.filePath, task.probeData?.duration));
        actions.appendChild(openBtn);
        actions.appendChild(folderBtn);
        actions.appendChild(captureBtn);
      }
    }

    if (task.status === 'failed') {
      el.classList.remove('active');
      el.classList.add('failed');
      const meta = el.querySelector('.task-meta');
      meta.innerHTML = `<span style="color:var(--danger)">${task.error || I18n.t('task.unknownError')}</span>`;
      let actions = el.querySelector('.task-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'task-actions';
        el.querySelector('.task-body').appendChild(actions);
      }
      actions.innerHTML = '';
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn btn-sm';
      retryBtn.textContent = I18n.t('task.retry');
      retryBtn.addEventListener('click', () => retryTask(task.id));
      actions.appendChild(retryBtn);
    }

    if (task.status === 'cancelled') {
      el.classList.remove('active');
      const meta = el.querySelector('.task-meta');
      meta.innerHTML = `<span style="color:var(--warning)">${I18n.t('task.cancelled')}</span>`;
    }

    updateGlobalButtons();
  }

  function getStatusLabel(status) {
    const key = { queued: 'task.queued', running: 'task.running', completed: 'task.completed', failed: 'task.failed', cancelled: 'task.cancelled' };
    return I18n.t(key[status] || status);
  }

  // 转码进度 tick 很密集，节流刷新总进度条（约 250ms 一次），避免频繁 IPC 取 stats
  let _globalProgressTimer = null;
  function throttledGlobalProgress() {
    if (_globalProgressTimer) return;
    _globalProgressTimer = setTimeout(() => {
      _globalProgressTimer = null;
      updateGlobalProgress();
    }, 250);
  }

  async function updateGlobalProgress(stats) {
    if (!stats) stats = await window.api.getStats();

    const bar = $('#global-progress');

    if (stats.total === 0) {
      bar.classList.add('hidden');
      updateGlobalButtons(stats);
      return;
    }

    bar.classList.remove('hidden');
    $('#global-status').textContent = I18n.t('progress.completedOf', { completed: stats.completed, total: stats.total });
    $('#global-percent').textContent = `${Math.round(stats.overallProgress)}%`;
    $('#global-progress-fill').style.width = `${stats.overallProgress}%`;

    // 检测「有活跃任务 → 全部结束」的转变，提示一次
    const active = stats.running > 0 || stats.queued > 0;
    if (lastActive && !active) {
      notifyBatchDone(stats);
    }
    lastActive = active;

    updateGlobalButtons(stats);
  }

  // 批量完成提示（应用内 toast + 系统通知，便于最小化时也能感知）
  function notifyBatchDone(stats) {
    const failed = stats.failed || 0;
    const msg = failed > 0
      ? I18n.t('toast.batchDonePartial', { completed: stats.completed, failed })
      : I18n.t('toast.batchDoneAll', { completed: stats.completed, total: stats.total });
    showToast(msg, failed > 0 ? 'warning' : 'success', 5000);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(I18n.t('notify.title'), { body: msg });
      }
    } catch (e) { /* ignore */ }
  }

  function updateGlobalButtons(stats) {
    const hasAny = document.querySelectorAll('.task-item').length > 0;
    // 没拿到 stats 时从 DOM 实时判断是否仍有进行中/排队任务，
    // 避免误判为「无活跃」而瞬间隐藏「全部取消」按钮（多任务时某个完成会闪烁）
    const hasActive = stats
      ? (stats.running > 0 || stats.queued > 0)
      : document.querySelectorAll('.task-status.running, .task-status.queued').length > 0;
    $('#btn-clear-finished').classList.toggle('hidden', !hasAny);
    $('#btn-cancel-all').classList.toggle('hidden', !hasActive);
  }

  function updateTaskCount() {
    const count = document.querySelectorAll('.task-item').length;
    $('#task-count').textContent = count;
  }

  async function refreshTaskList() {
    const tasks = await window.api.getAllTasks();
    const list = $('#task-list');
    list.innerHTML = `
      <div id="pending-wrap"></div>
      <div id="empty-state" class="empty-state">
        <svg class="svg-icon svg-icon--xl" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="8" width="40" height="28" rx="4" stroke="currentColor" stroke-width="2"/>
          <path d="M20 16l12 8-12 8V16z" fill="currentColor" opacity="0.5"/>
          <rect x="12" y="40" width="24" height="2" rx="1" fill="currentColor" opacity="0.3"/>
        </svg>
        <p>${I18n.t('empty.dragOrClick')}</p>
        <p class="sub">${I18n.t('empty.formats')}</p>
      </div>`;

    // 重新绑定空状态点击
    $('#empty-state').addEventListener('click', async () => {
      const files = await window.api.selectFiles();
      if (files.length > 0) addFiles(files);
    });

    if (tasks.length === 0) {
      $('#btn-cancel-all').classList.add('hidden');
      $('#btn-clear-finished').classList.add('hidden');
    } else {
      $('#empty-state').classList.add('hidden');
      tasks.forEach(t => { addTaskToList(t); updateTaskUI(t); });
    }

    // 恢复待转码列表（若有）
    renderPending();
    updateTaskCount();
    updateGlobalProgress();
  }

  function updatePreview() {
    if (!selectedProbeData) {
      $('#preview-card').classList.add('hidden');
      return;
    }

    $('#preview-card').classList.remove('hidden');
    const pd = selectedProbeData;
    const enc = VIDEO_ENCODERS[currentOptions.videoEncoder];
    const srcW = pd.video?.width || 0;
    const srcH = pd.video?.height || 0;

    let dstW = srcW, dstH = srcH;
    if (currentOptions.customWidth && currentOptions.customHeight) {
      dstW = currentOptions.customWidth;
      dstH = currentOptions.customHeight;
    } else if (currentOptions.resolution && srcH > currentOptions.resolution) {
      const scale = currentOptions.resolution / srcH;
      dstH = currentOptions.resolution;
      dstW = Math.round(srcW * scale / 2) * 2;
    }

    const estimated = estimateSize(pd.duration, currentOptions.videoEncoder, currentOptions.crf,
      currentOptions.audioEnabled ? currentOptions.audioBitrate : 0);
    const minSize = estimated * 0.5;
    const maxSize = estimated * 2;

    let deinterlaceText = I18n.t('preview.deinterlaceNone');
    if (currentOptions.deinterlace === 'smart') {
      deinterlaceText = I18n.t('preview.deinterlaceSmart');
    } else if (currentOptions.deinterlace === 'force') {
      deinterlaceText = I18n.t('preview.deinterlaceForce');
    }

    const containerLabel = CONTAINERS[currentOptions.container].label;
    const compatKey = getCompatibilityLabel(currentOptions.container, currentOptions.videoEncoder);
    const compat = I18n.t(compatKey);

    const hwSuffix = (currentOptions.hwaccel && hwInfo[currentOptions.videoEncoder]) ? I18n.t('preview.hwSuffix') : '';
    const encLabel = (currentOptions.hwaccel && hwInfo[currentOptions.videoEncoder]) ? hwInfo[currentOptions.videoEncoder] : enc.lib;

    $('#preview-content').innerHTML = `
      <table class="preview-table">
        <tr><td class="label"></td><td class="src">${I18n.t('preview.source')}</td><td class="dst">${I18n.t('preview.output')}</td></tr>
        <tr>
          <td>${I18n.t('preview.video')}</td>
          <td class="src">${srcW}x${srcH} ${pd.video?.codec || '?'}</td>
          <td class="dst">${dstW}x${dstH} ${enc.label}${hwSuffix}</td>
        </tr>
        <tr>
          <td>${I18n.t('preview.duration')}</td>
          <td class="src">${formatDuration(pd.duration)}</td>
          <td class="dst">${formatDuration(pd.duration)}</td>
        </tr>
        <tr>
          <td>${I18n.t('preview.size')}</td>
          <td class="src">${formatBytes(pd.size)}</td>
          <td class="dst">~ ${formatBytes(minSize)} - ${formatBytes(maxSize)}</td>
        </tr>
        <tr>
          <td>${I18n.t('preview.audio')}</td>
          <td class="src">${pd.audio?.codec || I18n.t('preview.none')} ${pd.audio?.bitrate ? Math.round(pd.audio.bitrate / 1000) + 'k' : ''}</td>
          <td class="dst">${currentOptions.audioEnabled ? (currentOptions.audioCopy ? I18n.t('preview.copy') : `${CONTAINERS[currentOptions.container].audioEncoder} ${currentOptions.audioBitrate}k`) : I18n.t('preview.none')}</td>
        </tr>
      </table>
      <div class="preview-divider"></div>
      <table class="preview-table">
        <tr><td colspan="2" class="dst">${I18n.t('preview.techSpecs')}</td></tr>
        <tr><td class="label">${I18n.t('preview.container')}</td><td class="dst">${containerLabel} (${currentOptions.container})</td></tr>
        <tr><td class="label">${I18n.t('preview.encoding')}</td><td class="dst">${encLabel} - CRF ${currentOptions.crf}${enc.presets.length ? ' - ' + currentOptions.preset : ''}</td></tr>
        <tr><td class="label">${I18n.t('preview.pixel')}</td><td class="dst">yuv420p (8-bit)</td></tr>
        <tr><td class="label">${I18n.t('preview.scan')}</td><td class="dst">${deinterlaceText}</td></tr>
        <tr><td class="label">${I18n.t('preview.compat')}</td><td class="dst">${compat}</td></tr>
      </table>
      <div class="preview-note">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M6 3.5a2 2 0 012 2c0 1-1 1.5-1.5 2-.3.3-.5.7-.5 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="6" cy="9" r="0.5" fill="currentColor"/></svg>
        <span>${I18n.t('preview.sizeNote')}</span>
      </div>
    `;
  }

  async function openSettings() {
    config = await window.api.getConfig();
    $('#setting-output-dir').value = config.outputDir || '';
    $('#setting-template').value = config.filenameTemplate || '';
    updateTemplatePreview();

    const parallelMode = config.parallelMode || 'auto';
    selectToggle('#parallel-mode-group', parallelMode);
    $('#parallel-count-wrap').classList.toggle('hidden', parallelMode === 'auto');
    $('#parallel-count').value = config.parallelCount || 2;

    // 语言选择器
    const langSelect = $('#setting-language');
    if (langSelect) langSelect.value = I18n.getLang();

    $('#settings-modal').classList.remove('hidden');
  }

  function closeSettings() {
    $('#settings-modal').classList.add('hidden');
  }

  // 设置面板里实时预览文件名模板的渲染结果
  function updateTemplatePreview() {
    const tpl = $('#setting-template').value.trim() || '{name}_{encoder}';
    const enc = VIDEO_ENCODERS[currentOptions.videoEncoder];
    const [min, max] = enc.crfRange;
    const quality = Math.round((max - currentOptions.crf) / (max - min) * 100);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const h = selectedProbeData?.video?.height || 1080;
    const w = selectedProbeData?.video?.width || 1920;
    const vars = {
      name: (selectedProbeData?.filename || 'video').replace(/\.[^.]+$/, ''),
      encoder: currentOptions.videoEncoder,
      container: currentOptions.container,
      height: h ? h + 'p' : '',
      width: w ? String(w) : '',
      crf: String(currentOptions.crf),
      quality: quality + 'q',
      date: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
      time: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    };
    const stem = tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
      .replace(/[\\/:*?"<>|]/g, '_').trim();
    $('#template-preview').textContent = I18n.t('template.example', { stem: stem || 'video', ext: currentOptions.container });
  }

  async function saveSettings() {
    const parallelMode = document.querySelector('#parallel-mode-group .btn-toggle.active')?.dataset.value || 'auto';

    config.outputDir = $('#setting-output-dir').value;
    config.filenameTemplate = $('#setting-template').value.trim();
    config.parallelMode = parallelMode;
    config.parallelCount = parseInt($('#parallel-count').value) || 2;

    // 语言切换
    const langSelect = $('#setting-language');
    const newLang = langSelect ? langSelect.value : I18n.getLang();
    if (newLang !== I18n.getLang()) {
      I18n.setLang(newLang);
      I18n.applyI18n();
      config.language = newLang;
      // 重渲染动态部分
      refreshDynamicI18n();
      renderCrfRuler();
      updatePreview();
      renderPending();
      refreshTaskList();
      updateFooterCopy();
      showToast(I18n.t('toast.langSaved'), 'success');
    }

    await window.api.saveConfig(config);
    closeSettings();
    if (newLang === I18n.getLang()) {
      showToast(I18n.t('toast.settingsSaved'), 'success');
    }
  }

  async function retryTask(taskId) {
    await window.api.retryTask(taskId);
    refreshTaskList();
  }

  // 移除单个已结束任务的卡片（仅完成/失败/取消可移除）
  async function removeTaskCard(taskId, el) {
    const ok = await window.api.removeTask(taskId);
    if (!ok) return;
    el.remove();
    updateTaskCount();
    updateGlobalButtons();
    // 没有任何任务卡片且无待转码文件时恢复空状态
    if (document.querySelectorAll('.task-item').length === 0 &&
        !(window._pendingFiles && window._pendingFiles.length > 0)) {
      $('#empty-state')?.classList.remove('hidden');
    }
  }

  let captureState = { filePath: null, duration: 0, seek: 0, format: 'png' };
  let captureReqToken = 0;
  let captureDebounce = null;

  async function openCaptureForFile(filePath, knownDuration) {
    let duration = knownDuration || 0;
    if (!duration) {
      if (selectedProbeData && selectedProbeData.path === filePath) {
        duration = selectedProbeData.duration;
      } else {
        const pd = await window.api.probeFile(filePath);
        if (pd && !pd.error) duration = pd.duration;
      }
    }
    captureState = { filePath, duration: duration || 0, seek: 0, format: 'png' };
    selectToggle('#capture-format-group', 'png');
    const slider = $('#capture-slider');
    slider.max = String(Math.max(0.1, captureState.duration));
    slider.value = '0';
    $('#capture-time-label').textContent = formatDuration(0);
    $('#capture-img').src = '';
    $('#capture-modal').classList.remove('hidden');
    refreshCapturePreview();
  }

  function closeCapture() {
    $('#capture-modal').classList.add('hidden');
  }

  function scheduleCapturePreview() {
    $('#capture-loading').classList.remove('hidden');
    if (captureDebounce) clearTimeout(captureDebounce);
    captureDebounce = setTimeout(refreshCapturePreview, 220);
  }

  async function refreshCapturePreview() {
    const token = ++captureReqToken;
    const data = await window.api.getThumbnail(captureState.filePath, captureState.seek, 640);
    if (token !== captureReqToken) return; // 丢弃过期结果
    if (data) $('#capture-img').src = data;
    $('#capture-loading').classList.add('hidden');
  }

  async function saveCapture() {
    const res = await window.api.captureFrame(captureState.filePath, captureState.seek, captureState.format);
    if (res && res.success) {
      showToast(I18n.t('toast.captureSaved'), 'success');
      closeCapture();
    } else if (res && !res.canceled) {
      showToast(I18n.t('toast.captureFailed', { error: res.error || '' }), 'error', 5000);
    }
  }

  function showToast(message, type = 'info', duration = 3000) {
    const container = $('#toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    // 触发进入动画
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  init();
})();
