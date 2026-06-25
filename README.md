<div align="center">

# CM Video Transcoder

**Convert MP4 / MOV / MKV into videos that play smoothly in any browser**

Fine-grained control · Clean UI · Batch queue · Auto parallel · Hardware acceleration · Frame grab

[![License](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6.svg)]()
[![Electron](https://img.shields.io/badge/Electron-42-47848F.svg)]()

[**Official site → tc.complexmission.com**](https://tc.complexmission.com)

**English** · [中文](#中文说明)

</div>

---

> 📦 **End users**: No need to build it yourself — download a ready-to-use installer from the [**official site**](https://tc.complexmission.com).
>
> 🛠️ **Developers / want to build from source**: read on.

---

## Download & Install

| Channel | Notes |
|---------|-------|
| [**Official site**](https://tc.complexmission.com) | Recommended — ready-to-use installer |
| [**GitHub Releases**](../../releases) | Per-version installers and changelogs |

The installer **bundles FFmpeg — no extra setup required**. Install and start transcoding right away.

---

## About the Windows "Unknown Publisher" warning

This is free, open-source software and has not purchased a commercial code-signing certificate, so the first time you run the installer Windows may show a **blue SmartScreen prompt** or **"Unknown Publisher"**. This is normal for unsigned apps and **does not mean the software is unsafe**. To bypass:

1. On the blue prompt, click **More info**
2. Then click **Run anyway**

If you'd rather be safe about the source, download from [**GitHub Releases**](../../releases) and verify the file with the bundled `SHA256SUMS.txt`:

```powershell
# Run in the installer's folder; compare the output with the value in SHA256SUMS.txt
Get-FileHash .\CM-VideoTranscoder-1.0.0-setup.exe -Algorithm SHA256
```

> This is a fully local tool — it collects nothing and uploads nothing. The source is fully public; audit and build it yourself.

---

## Features

- **Input**: MP4 / MOV / MKV
- **Output container**: MP4 / MOV / WebM
- **Video codec**: H.264 / H.265 / VP9 / AV1
- **Hardware acceleration**: auto-detects NVIDIA NVENC / Intel QSV / AMD AMF — several times faster
- **Quality control**: High / Medium / Small-size presets, or a custom quality percentage (CRF)
- **Resolution**: presets or custom, with aspect-ratio lock, scale-to-fit, and black-bar padding
- **Deinterlace**: smart per-frame detection to guarantee progressive output and avoid Safari playback glitches
- **Audio**: AAC / Opus adaptive bitrate, or copy the original track as-is
- **Filename templates**: customize output names with variables like `{name} {encoder} {height} {date}`
- **Frame grab**: export a frame at any timestamp as PNG / WebP / JPG
- **Batch queue**: up to 100 files, auto-parallel by CPU core count, thumbnails, live progress, one-click open when done
- **Fully local**: collects and uploads nothing

## Quick start (development)

```bash
# 1. Clone
git clone https://github.com/complex-mission/cm-video-transcoder.git
cd cm-video-transcoder

# 2. Install dependencies
npm install

# 3. Add ffmpeg (binaries are not in the repo — see resources/README.md)
#    Download a Windows GPL build and put ffmpeg.exe / ffprobe.exe into resources/

# 4. Start
npm start
```

> ⚠️ `ffmpeg.exe` and `ffprobe.exe` are large GPLv3 binaries and are **not committed** to the repo.
> Download and place them in `resources/` per [`resources/README.md`](resources/README.md).

## Packaging

```bash
npm run dist        # build the NSIS installer (into dist/)
npm run dist:dir    # build the unpacked folder only (for debugging)
```

Output goes to `dist/`. Before packaging, make sure ffmpeg is in `resources/` (it gets bundled into the installer so users need no setup).

## Release

Build artifacts are not committed to git; they are distributed via GitHub Releases.

**One-click release (recommended)**:

```bash
# Bump "version" in package.json first, then:
npm run release              # auto-detects version, builds if needed, creates the GitHub release
npm run release -- --build   # force a rebuild before releasing
npm run release -- --notes "What's new..."   # custom release notes
```

Requires the [GitHub CLI](https://cli.github.com) installed and logged in (`gh auth login`).

**Manual release**:
1. `npm run dist` to produce `dist/CM-VideoTranscoder-<version>-setup.exe`
2. Repo page → Releases → New release, create a tag (e.g. `v1.0.0`)
3. Upload that setup.exe as an asset and publish

## Tech stack

Electron · vanilla HTML / CSS / JS (no front-end framework) · FFmpeg

## Project structure

```
src/
├── main/        main process: window, IPC, ffmpeg detection, transcode queue, probe/frame-grab
├── renderer/    renderer: UI and interaction
└── shared/      constants shared between main & renderer
resources/       icons, fonts (ffmpeg must be added manually)
```

## License

Open-sourced under [**GPL-3.0**](LICENSE).

- **FFmpeg**: the transcoding core, GPLv3 (incl. x264 / x265), © the [FFmpeg](https://ffmpeg.org) developers.
- **Fonts**: [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (SIL OFL 1.1) and Xiaomi [MiSans](https://hyperos.mi.com/font/zh/) (free for commercial use).

Because it bundles GPLv3 FFmpeg, the distribution as a whole is under GPL-3.0.

---

<div align="center">

Built by [Complex Mission](https://tc.complexmission.com) · learn more at the [**official site**](https://tc.complexmission.com)

</div>

---
---

<div align="center">

## 中文说明

**把 MP4 / MOV / MKV 转成可在任意浏览器流畅播放的视频**

参数可控 · 界面简洁 · 批量队列 · 自动并行 · 硬件加速 · 视频截帧

[English](#cm-video-transcoder) · **中文**

</div>

---

> 📦 **普通用户**：无需自行构建，请直接前往 [**官方网站**](https://tc.complexmission.com) 下载开箱即用的安装包。
>
> 🛠️ **开发者 / 想自行构建**：继续阅读下文。

---

## 下载安装

| 渠道 | 说明 |
|------|------|
| [**官方网站**](https://tc.complexmission.com) | 推荐，开箱即用的安装包 |
| [**GitHub Releases**](../../releases) | 各版本安装包与更新日志 |

下载的安装包**已内置 FFmpeg，无需额外配置**，安装后即可转码。

---

## 关于 Windows「未知发布者」警告

本软件为免费开源工具，尚未购买商业代码签名证书，因此首次运行安装包时 Windows 可能弹出 **SmartScreen 蓝色拦截**或显示**「未知发布者 (Unknown Publisher)」**。这是未签名应用的正常提示，**不代表软件有问题**。绕过方法：

1. 在蓝色拦截窗口点击「**更多信息 (More info)**」
2. 再点击下方出现的「**仍要运行 (Run anyway)**」

若你不放心来源，建议从 [**GitHub Releases**](../../releases) 下载，并用随附的 `SHA256SUMS.txt` 校验文件完整性：

```powershell
# 在安装包所在目录执行，比对输出值是否与 SHA256SUMS.txt 中一致
Get-FileHash .\CM-VideoTranscoder-1.0.0-setup.exe -Algorithm SHA256
```

> 本软件为纯本地工具，不收集、不上传任何数据；源码完全公开，可自行审阅与构建。

---

## 功能特性

- **输入**：MP4 / MOV / MKV
- **输出容器**：MP4 / MOV / WebM
- **视频编码**：H.264 / H.265 / VP9 / AV1
- **硬件加速**：自动检测 NVIDIA NVENC / Intel QSV / AMD AMF，转码提速数倍
- **画质控制**：高 / 中 / 小体积预设，或自定义画质百分比（CRF）
- **分辨率**：预设档位或自定义，支持锁定宽高比、等比缩放并填充黑边
- **反交错**：智能逐帧判断，保证输出逐行（progressive），避免 Safari 播放异常
- **音频**：AAC / Opus 自适应码率，或直接复制原音轨
- **文件名模板**：`{name} {encoder} {height} {date}` 等变量自定义输出名
- **视频截帧**：任意时间点抽帧导出 PNG / WebP / JPG
- **批量队列**：最多 100 个文件，按 CPU 核心数自动并行，缩略图、实时进度、完成后一键打开
- **纯本地**：不收集、不上传任何数据

## 快速开始（开发）

```bash
# 1. 克隆
git clone https://github.com/complex-mission/cm-video-transcoder.git
cd cm-video-transcoder

# 2. 安装依赖
npm install

# 3. 放入 ffmpeg（仓库不含二进制，详见 resources/README.md）
#    下载 Windows GPL 构建，把 ffmpeg.exe / ffprobe.exe 放到 resources/

# 4. 启动
npm start
```

> ⚠️ `ffmpeg.exe` 与 `ffprobe.exe` 体积大且为 GPLv3 二进制，**未纳入仓库**。
> 请按 [`resources/README.md`](resources/README.md) 下载并放入 `resources/` 目录。

## 打包

```bash
npm run dist        # 生成 NSIS 安装包（dist/）
npm run dist:dir    # 仅生成免安装目录（调试用）
```

产物在 `dist/`。打包前请确认 `resources/` 下已放好 ffmpeg（会一并打进安装包，用户无需自行配置）。

## 发布

编译产物不进 git，通过 GitHub Releases 分发。

**一键发布（推荐）**：

```bash
# 先把 package.json 的 version 改成对应版本，再：
npm run release              # 自动读版本号，按需打包，创建 GitHub release
npm run release -- --build   # 强制先重新打包
npm run release -- --notes "本次更新内容..."   # 自定义发布说明
```

需先安装并登录 [GitHub CLI](https://cli.github.com)（`gh auth login`）。

**手动发布**：
1. `npm run dist` 生成 `dist/CM-VideoTranscoder-<版本>-setup.exe`
2. 仓库页 → Releases → 新建 Release，打 tag（如 `v1.0.0`）
3. 上传该 setup.exe 作为附件并发布

## 技术栈

Electron · 原生 HTML / CSS / JS（无前端框架）· FFmpeg

## 目录结构

```
src/
├── main/        主进程：窗口、IPC、ffmpeg 检测、转码队列、探测/截帧
├── renderer/    渲染层：界面与交互
└── shared/      主/渲染共享常量
resources/       图标、字体（ffmpeg 需自行放入）
```

## 许可

本项目以 [**GPL-3.0**](LICENSE) 协议开源。

- **FFmpeg**：转码内核，GPLv3（含 x264 / x265），版权归 [FFmpeg](https://ffmpeg.org) 开发者所有。
- **字体**：[JetBrains Mono](https://www.jetbrains.com/lp/mono/)（SIL OFL 1.1）、小米 [MiSans](https://hyperos.mi.com/font/zh/)（免费商用）。

因捆绑了 GPLv3 的 FFmpeg，整体发行版遵循 GPL-3.0。

---

<div align="center">

由 [Complex Mission](https://tc.complexmission.com) 开发 · 更多请访问 [**官方网站**](https://tc.complexmission.com)

</div>
