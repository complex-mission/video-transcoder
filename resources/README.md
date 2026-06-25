# resources 目录

应用图标、字体等资源放在此目录，并会随打包一起进入发行版。

## 需要手动放入 ffmpeg（不随仓库提供）

`ffmpeg.exe` 与 `ffprobe.exe` 体积较大且为 GPLv3 二进制，**未纳入本仓库**（已在 `.gitignore` 忽略）。
克隆后请自行下载并放到本目录：

```
resources/
├── ffmpeg.exe
└── ffprobe.exe
```

### 下载（Windows 64 位，需 GPL 构建，含 libx264 / libx265）

- BtbN 构建：https://github.com/BtbN/FFmpeg-Builds/releases
  （选 `ffmpeg-master-latest-win64-gpl.zip`，解压后取 `bin/` 下的两个 exe）
- 或 gyan.dev：https://www.gffmpeg.org / https://www.gyan.dev/ffmpeg/builds/

> 程序启动时会优先使用本目录的 ffmpeg；若不存在，则回退到系统 PATH 中的 ffmpeg。
