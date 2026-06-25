// 主进程国际化（dialog 标题/过滤器名 + 运行时错误消息）
// 渲染进程通过 saveConfig / init 把当前语言同步过来（setLang）。
const STRINGS = {
  zh: {
    selectFiles: '选择视频文件',
    videoFiles: '视频文件',
    selectOutputDir: '选择输出文件夹',
    saveCapture: '保存截帧',
    pngImage: 'PNG 图片',
    webpImage: 'WebP 图片',
    jpegImage: 'JPEG 图片',
    // 错误（会显示到任务卡片 / toast）
    'err.ffmpegNotFound': '未找到 ffmpeg/ffprobe。请将 ffmpeg.exe 和 ffprobe.exe 放入 resources/ 目录，或确保系统 PATH 中可用。',
    'err.ffprobeNotInit': 'ffprobe 未初始化',
    'err.probeFailed': '探测失败：{detail}',
    'err.ffprobeFailed': 'ffprobe 失败（代码 {code}）：{detail}',
    'err.parseFailed': '解析 ffprobe 输出失败：{detail}',
    'err.ffmpegExit': 'ffmpeg 退出码 {code}：{detail}',
    'err.captureFailed': '截帧失败（代码 {code}）：{detail}'
  },
  en: {
    selectFiles: 'Select Video Files',
    videoFiles: 'Video Files',
    selectOutputDir: 'Select Output Folder',
    saveCapture: 'Save Capture',
    pngImage: 'PNG Image',
    webpImage: 'WebP Image',
    jpegImage: 'JPEG Image',
    'err.ffmpegNotFound': 'ffmpeg/ffprobe not found. Please place ffmpeg.exe and ffprobe.exe in the resources/ directory, or ensure they are in the system PATH.',
    'err.ffprobeNotInit': 'ffprobe not initialized',
    'err.probeFailed': 'Probe failed: {detail}',
    'err.ffprobeFailed': 'ffprobe failed (code {code}): {detail}',
    'err.parseFailed': 'Failed to parse ffprobe output: {detail}',
    'err.ffmpegExit': 'ffmpeg exited with code {code}: {detail}',
    'err.captureFailed': 'Frame capture failed (code {code}): {detail}'
  },
  ja: {
    selectFiles: '動画ファイルを選択',
    videoFiles: '動画ファイル',
    selectOutputDir: '出力フォルダを選択',
    saveCapture: 'キャプチャを保存',
    pngImage: 'PNG 画像',
    webpImage: 'WebP 画像',
    jpegImage: 'JPEG 画像',
    'err.ffmpegNotFound': 'ffmpeg/ffprobe が見つかりません。resources/ ディレクトリに ffmpeg.exe と ffprobe.exe を配置するか、システム PATH に追加してください。',
    'err.ffprobeNotInit': 'ffprobe が初期化されていません',
    'err.probeFailed': '解析に失敗しました：{detail}',
    'err.ffprobeFailed': 'ffprobe が失敗しました（コード {code}）：{detail}',
    'err.parseFailed': 'ffprobe 出力の解析に失敗しました：{detail}',
    'err.ffmpegExit': 'ffmpeg が終了コード {code} で終了しました：{detail}',
    'err.captureFailed': 'フレームのキャプチャに失敗しました（コード {code}）：{detail}'
  },
  ko: {
    selectFiles: '동영상 파일 선택',
    videoFiles: '동영상 파일',
    selectOutputDir: '출력 폴더 선택',
    saveCapture: '캡처 저장',
    pngImage: 'PNG 이미지',
    webpImage: 'WebP 이미지',
    jpegImage: 'JPEG 이미지',
    'err.ffmpegNotFound': 'ffmpeg/ffprobe를 찾을 수 없습니다. resources/ 디렉토리에 ffmpeg.exe와 ffprobe.exe를 배치하거나 시스템 PATH에 추가하세요.',
    'err.ffprobeNotInit': 'ffprobe가 초기화되지 않았습니다',
    'err.probeFailed': '분석 실패: {detail}',
    'err.ffprobeFailed': 'ffprobe 실패 (코드 {code}): {detail}',
    'err.parseFailed': 'ffprobe 출력 분석 실패: {detail}',
    'err.ffmpegExit': 'ffmpeg가 코드 {code}(으)로 종료됨: {detail}',
    'err.captureFailed': '프레임 캡처 실패 (코드 {code}): {detail}'
  }
};

let currentLang = 'en';

function setLang(lang) {
  if (STRINGS[lang]) currentLang = lang;
}

function t(key, vars) {
  let str = (STRINGS[currentLang] && STRINGS[currentLang][key]) || STRINGS.en[key] || STRINGS.zh[key] || key;
  if (vars && typeof vars === 'object') {
    str = str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }
  return str;
}

module.exports = { setLang, t, STRINGS };
