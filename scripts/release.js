#!/usr/bin/env node
/**
 * 一键发布脚本
 *   node scripts/release.js            自动读版本号，按需打包，创建 GitHub release
 *   node scripts/release.js --build    强制先重新打包
 *   node scripts/release.js --notes "自定义说明"
 *
 * 依赖：已安装并登录 gh CLI（gh auth login）
 */
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;
const tag = `v${version}`;
const exeName = `CM-VideoTranscoder-${version}-setup.exe`;
const exePath = path.join(root, 'dist', exeName);

const args = process.argv.slice(2);
const forceBuild = args.includes('--build');
const notesIdx = args.indexOf('--notes');
const notes = notesIdx !== -1 ? args[notesIdx + 1] : `A Windows video transcoder that converts mp4/mov/mkv into browser-friendly formats.

Download \`${exeName}\` below and run the installer.

---

Windows 视频转码工具，将 mp4/mov/mkv 转为浏览器兼容格式。下载下方的 \`${exeName}\` 安装即可。`;

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(' ')}`);
  execFileSync(cmd, cmdArgs, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32', ...opts });
}

// 0. 前置检查：gh 是否登录
try {
  execSync('gh auth status', { stdio: 'ignore' });
} catch {
  console.error('❌ gh 未登录，请先运行：gh auth login');
  process.exit(1);
}

// 1. 按需打包
if (forceBuild || !fs.existsSync(exePath)) {
  console.log(forceBuild ? '🔨 强制重新打包...' : `📦 未找到 ${exeName}，开始打包...`);
  run('npm', ['run', 'dist']);
}
if (!fs.existsSync(exePath)) {
  console.error(`❌ 打包后仍未找到 ${exePath}`);
  process.exit(1);
}

// 2. 检查同名 release 是否已存在
let releaseExists = false;
try {
  execSync(`gh release view ${tag}`, { stdio: 'ignore', cwd: root });
  releaseExists = true;
} catch { /* 不存在 */ }

if (releaseExists) {
  console.log(`ℹ️  Release ${tag} 已存在，改为更新安装包附件...`);
  run('gh', ['release', 'upload', tag, exePath, '--clobber']);
} else {
  run('gh', ['release', 'create', tag, exePath,
    '--title', `CM Video Transcoder ${tag}`,
    '--notes', notes]);
}

const repo = (pkg.repository && pkg.repository.url) || 'complex-mission/video-transcoder';
console.log(`\n✅ 发布完成：${tag}`);
console.log('   查看：https://github.com/complex-mission/video-transcoder/releases/tag/' + tag);
