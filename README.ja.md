<div align="center">

# CM Video Transcoder

**MP4 / MOV / MKV を、どのブラウザでもスムーズに再生できる動画に変換**

細かな制御 · シンプルな UI · バッチキュー · 自動並列 · ハードウェアアクセラレーション · フレーム抽出

[![License](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6.svg)]()
[![Electron](https://img.shields.io/badge/Electron-42-47848F.svg)]()

[English](README.md) · [中文](README.zh.md) · **日本語** · [한국어](README.ko.md)

</div>

---

## ダウンロードとインストール

| 配布元 | 説明 |
|--------|------|
| [**公式サイト**](https://tc.complexmission.com) | 推奨。すぐに使えるインストーラー |
| [**GitHub Releases**](../../releases) | 各バージョンのインストーラーと変更履歴 |

インストーラーには **FFmpeg が同梱されており、追加設定は不要**です。インストール後すぐに変換を開始できます。

---

## Windows の「不明な発行元」警告について

本ソフトウェアは無料のオープンソースツールであり、商用のコード署名証明書を購入していません。そのため、インストーラーを初めて実行すると Windows が **青い SmartScreen の警告**を表示したり、**「不明な発行元 (Unknown Publisher)」**と表示することがあります。これは未署名アプリでは正常な動作であり、**ソフトウェアに問題があることを意味しません**。回避方法：

1. 青い警告画面で「**詳細情報 (More info)**」をクリック
2. 表示される「**実行 (Run anyway)**」をクリック

配布元が心配な場合は、[**GitHub Releases**](../../releases) からダウンロードし、同梱の `SHA256SUMS.txt` でファイルの整合性を確認してください：

```powershell
# インストーラーのあるフォルダーで実行し、出力値が SHA256SUMS.txt の値と一致するか比較
Get-FileHash .\CM-VideoTranscoder-1.0.0-setup.exe -Algorithm SHA256
```

> 本ソフトウェアは完全にローカルで動作するツールで、いかなるデータも収集・送信しません。ソースコードは完全に公開されており、自分で監査・ビルドできます。

---

## 機能

- **入力**：MP4 / MOV / MKV
- **出力コンテナ**：MP4 / MOV / WebM
- **映像コーデック**：H.264 / H.265 / VP9 / AV1
- **ハードウェアアクセラレーション**：NVIDIA NVENC / Intel QSV / AMD AMF を自動検出し、数倍高速化
- **画質制御**：高 / 中 / 小サイズのプリセット、またはカスタム画質（CRF）
- **解像度**：プリセットまたはカスタム。アスペクト比固定、フィット縮小、レターボックス（黒帯）対応
- **インターレース解除**：フレームごとにスマート判定し、プログレッシブ出力を保証。Safari の再生不具合を防止
- **音声**：AAC / Opus の適応ビットレート、または元の音声トラックをそのままコピー
- **ファイル名テンプレート**：`{name} {encoder} {height} {date}` などの変数で出力名をカスタマイズ
- **フレーム抽出**：任意のタイムスタンプのフレームを PNG / WebP / JPG で書き出し
- **バッチキュー**：最大 100 ファイル。CPU コア数に応じて自動並列、サムネイル、リアルタイム進捗、完了後ワンクリックで開く
- **完全ローカル**：いかなるデータも収集・送信しません

## クイックスタート（開発）

```bash
# 1. クローン
git clone https://github.com/complex-mission/video-transcoder.git
cd video-transcoder

# 2. 依存関係をインストール
npm install

# 3. ffmpeg を配置（バイナリはリポジトリに含まれません。resources/README.md を参照）
#    Windows GPL ビルドをダウンロードし、ffmpeg.exe / ffprobe.exe を resources/ に配置

# 4. 起動
npm start
```

> `ffmpeg.exe` と `ffprobe.exe` はサイズが大きい GPLv3 バイナリのため、リポジトリには**含まれていません**。
> [`resources/README.md`](resources/README.md) に従ってダウンロードし、`resources/` ディレクトリに配置してください。

## パッケージング

```bash
npm run dist        # NSIS インストーラーをビルド（dist/ へ）
npm run dist:dir    # 展開済みフォルダーのみビルド（デバッグ用）
```

出力は `dist/` に生成されます。パッケージング前に `resources/` に ffmpeg があることを確認してください（インストーラーに同梱されるため、ユーザー側の設定は不要です）。

## リリース

ビルド成果物は git にコミットせず、GitHub Releases で配布します。

**ワンクリックリリース（推奨）**：

```bash
# まず package.json の "version" を更新してから：
npm run release              # バージョンを自動検出し、必要ならビルドして GitHub リリースを作成
npm run release -- --build   # リリース前に強制的に再ビルド
npm run release -- --notes "更新内容..."   # リリースノートをカスタマイズ
```

[GitHub CLI](https://cli.github.com) のインストールとログイン（`gh auth login`）が必要です。

**手動リリース**：
1. `npm run dist` で `dist/CM-VideoTranscoder-<version>-setup.exe` を生成
2. リポジトリページ → Releases → New release でタグを作成（例：`v1.0.0`）
3. その setup.exe をアセットとしてアップロードして公開

## 技術スタック

Electron · 素の HTML / CSS / JS（フロントエンドフレームワークなし）· FFmpeg

## ディレクトリ構成

```
src/
├── main/        メインプロセス：ウィンドウ、IPC、ffmpeg 検出、変換キュー、解析/フレーム抽出
├── renderer/    レンダラー：UI と操作
└── shared/      メイン/レンダラー共有の定数
resources/       アイコン、フォント（ffmpeg は手動配置）
```

## ライセンス

[**GPL-3.0**](LICENSE) のもとでオープンソース化されています。

- **FFmpeg**：変換エンジン。GPLv3（x264 / x265 を含む）、© [FFmpeg](https://ffmpeg.org) 開発者。
- **フォント**：[JetBrains Mono](https://www.jetbrains.com/lp/mono/)（SIL OFL 1.1）、Xiaomi [MiSans](https://hyperos.mi.com/font/zh/)（商用利用無料）。

GPLv3 の FFmpeg を同梱しているため、配布物全体は GPL-3.0 に従います。

---

<div align="center">

[Complex Mission](https://tc.complexmission.com) が開発 · 詳細は [**公式サイト**](https://tc.complexmission.com) へ

</div>
