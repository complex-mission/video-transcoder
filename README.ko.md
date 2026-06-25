<div align="center">

# CM Video Transcoder

**MP4 / MOV / MKV를 어떤 브라우저에서도 매끄럽게 재생되는 영상으로 변환**

세밀한 제어 · 깔끔한 UI · 일괄 대기열 · 자동 병렬 · 하드웨어 가속 · 프레임 캡처

[![License](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6.svg)]()
[![Electron](https://img.shields.io/badge/Electron-42-47848F.svg)]()

[**공식 사이트 → tc.complexmission.com**](https://tc.complexmission.com)

[English](README.md) · [中文](README.zh.md) · [日本語](README.ja.md) · **한국어**

</div>

---

> **일반 사용자**: 직접 빌드할 필요가 없습니다. [**공식 사이트**](https://tc.complexmission.com)에서 바로 사용할 수 있는 설치 파일을 내려받으세요.
>
> **개발자 / 소스에서 빌드하려는 분**: 아래 내용을 읽어 주세요.

---

## 다운로드 및 설치

| 채널 | 설명 |
|------|------|
| [**공식 사이트**](https://tc.complexmission.com) | 권장 — 바로 사용할 수 있는 설치 파일 |
| [**GitHub Releases**](../../releases) | 버전별 설치 파일과 변경 이력 |

설치 파일에는 **FFmpeg가 내장되어 있어 별도 설정이 필요 없습니다**. 설치 후 바로 변환을 시작할 수 있습니다.

---

## Windows "알 수 없는 게시자" 경고에 대하여

본 소프트웨어는 무료 오픈소스 도구이며 상용 코드 서명 인증서를 구입하지 않았습니다. 그래서 설치 파일을 처음 실행할 때 Windows가 **파란색 SmartScreen 경고**를 표시하거나 **"알 수 없는 게시자 (Unknown Publisher)"**라고 표시할 수 있습니다. 이는 서명되지 않은 앱에서 흔한 정상 동작이며 **소프트웨어에 문제가 있다는 뜻이 아닙니다**. 우회 방법:

1. 파란색 경고 창에서 **추가 정보 (More info)** 클릭
2. 아래에 나타나는 **실행 (Run anyway)** 클릭

출처가 염려된다면 [**GitHub Releases**](../../releases)에서 내려받고, 함께 제공되는 `SHA256SUMS.txt`로 파일 무결성을 확인하세요:

```powershell
# 설치 파일이 있는 폴더에서 실행하고, 출력값이 SHA256SUMS.txt의 값과 일치하는지 비교
Get-FileHash .\CM-VideoTranscoder-1.0.0-setup.exe -Algorithm SHA256
```

> 본 소프트웨어는 완전히 로컬에서 동작하는 도구로, 어떠한 데이터도 수집하거나 전송하지 않습니다. 소스 코드는 모두 공개되어 있어 직접 검토하고 빌드할 수 있습니다.

---

## 기능

- **입력**: MP4 / MOV / MKV
- **출력 컨테이너**: MP4 / MOV / WebM
- **영상 코덱**: H.264 / H.265 / VP9 / AV1
- **하드웨어 가속**: NVIDIA NVENC / Intel QSV / AMD AMF 자동 감지로 수 배 빠르게
- **품질 제어**: 고 / 중 / 소용량 프리셋, 또는 사용자 지정 품질(CRF)
- **해상도**: 프리셋 또는 사용자 지정, 종횡비 고정·맞춤 축소·레터박스(검은 여백) 지원
- **디인터레이스**: 프레임별 스마트 판정으로 프로그레시브 출력 보장, Safari 재생 오류 방지
- **오디오**: AAC / Opus 적응형 비트레이트, 또는 원본 오디오 트랙 그대로 복사
- **파일명 템플릿**: `{name} {encoder} {height} {date}` 등의 변수로 출력 이름 사용자 지정
- **프레임 캡처**: 임의의 시점 프레임을 PNG / WebP / JPG로 내보내기
- **일괄 대기열**: 최대 100개 파일, CPU 코어 수에 따라 자동 병렬, 썸네일, 실시간 진행률, 완료 후 한 번에 열기
- **완전 로컬**: 어떠한 데이터도 수집·전송하지 않음

## 빠른 시작 (개발)

```bash
# 1. 클론
git clone https://github.com/complex-mission/cm-video-transcoder.git
cd cm-video-transcoder

# 2. 의존성 설치
npm install

# 3. ffmpeg 배치 (바이너리는 저장소에 포함되지 않음 — resources/README.md 참조)
#    Windows GPL 빌드를 내려받아 ffmpeg.exe / ffprobe.exe를 resources/에 배치

# 4. 실행
npm start
```

> `ffmpeg.exe`와 `ffprobe.exe`는 용량이 큰 GPLv3 바이너리라 저장소에 **포함되어 있지 않습니다**.
> [`resources/README.md`](resources/README.md)에 따라 내려받아 `resources/` 디렉터리에 배치하세요.

## 패키징

```bash
npm run dist        # NSIS 설치 파일 빌드 (dist/ 로)
npm run dist:dir    # 압축 해제 폴더만 빌드 (디버깅용)
```

결과물은 `dist/`에 생성됩니다. 패키징 전에 `resources/`에 ffmpeg가 있는지 확인하세요(설치 파일에 함께 포함되어 사용자는 별도 설정이 필요 없습니다).

## 릴리스

빌드 산출물은 git에 커밋하지 않고 GitHub Releases로 배포합니다.

**원클릭 릴리스 (권장)**:

```bash
# 먼저 package.json의 "version"을 갱신한 뒤:
npm run release              # 버전 자동 감지, 필요 시 빌드 후 GitHub 릴리스 생성
npm run release -- --build   # 릴리스 전 강제 재빌드
npm run release -- --notes "변경 내용..."   # 릴리스 노트 사용자 지정
```

[GitHub CLI](https://cli.github.com) 설치 및 로그인(`gh auth login`)이 필요합니다.

**수동 릴리스**:
1. `npm run dist`로 `dist/CM-VideoTranscoder-<version>-setup.exe` 생성
2. 저장소 페이지 → Releases → New release에서 태그 생성 (예: `v1.0.0`)
3. 해당 setup.exe를 자산으로 업로드하고 게시

## 기술 스택

Electron · 순수 HTML / CSS / JS (프런트엔드 프레임워크 없음) · FFmpeg

## 디렉터리 구조

```
src/
├── main/        메인 프로세스: 창, IPC, ffmpeg 감지, 변환 대기열, 분석/프레임 캡처
├── renderer/    렌더러: UI 및 상호작용
└── shared/      메인/렌더러 공유 상수
resources/       아이콘, 폰트 (ffmpeg는 직접 배치)
```

## 라이선스

[**GPL-3.0**](LICENSE)으로 오픈소스화되었습니다.

- **FFmpeg**: 변환 엔진. GPLv3(x264 / x265 포함), © [FFmpeg](https://ffmpeg.org) 개발자.
- **폰트**: [JetBrains Mono](https://www.jetbrains.com/lp/mono/)(SIL OFL 1.1), Xiaomi [MiSans](https://hyperos.mi.com/font/zh/)(상업적 이용 무료).

GPLv3의 FFmpeg를 내장하므로 배포물 전체는 GPL-3.0을 따릅니다.

---

<div align="center">

[Complex Mission](https://tc.complexmission.com) 개발 · 자세한 내용은 [**공식 사이트**](https://tc.complexmission.com)에서

</div>
