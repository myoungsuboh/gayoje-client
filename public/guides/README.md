# GuideTooltip 자산 — webm/mp4 녹화 가이드

이 폴더에는 UI 의 각 기능을 설명하는 짧은 영상(`.webm` 권장) 자산이 들어갑니다. `GuideTooltip` 컴포넌트가 hover 시 자동으로 재생합니다.

## 위치
- `src/utils/guides.js` 의 `GUIDES` 객체에서 `gif: '/guides/<key>.webm'` 으로 참조.
- 실제 파일은 이 폴더 (`/public/guides/<key>.webm`) 에 둠.

## 사이즈 가이드
- **길이**: 4–8 초 (loop 재생되므로 짧을수록 좋음)
- **해상도**: 가로 600px 정도면 충분 (popover 너비 280px)
- **파일 크기**: 개당 100-300KB 목표 (>500KB 면 사용자 wait time 증가)
- **fps**: 15fps 로 충분 (30fps 는 용량 ↑↑)
- **오디오**: 불필요 — 제거

## 녹화 → 압축 워크플로

### 1. 녹화 (OS 기본 도구)
- **Windows**: `Win + G` → 게임 바 → "캡처 시작" → 화면 영역 녹화
- **macOS**: `Cmd + Shift + 5` → "선택 부분 녹화"
- **Linux**: OBS Studio 또는 `gpu-screen-recorder`

### 2. 압축 (ffmpeg, 한 줄)

```bash
# 기본 (webm vp9, 가벼움)
ffmpeg -i raw.mov -t 6 -vf "fps=15,scale=600:-1" -c:v libvpx-vp9 \
       -crf 36 -b:v 0 -an -y public/guides/<key>.webm

# 더 가볍게 (품질 조금 ↓, ~70KB/4초)
ffmpeg -i raw.mov -t 6 -vf "fps=12,scale=520:-1" -c:v libvpx-vp9 \
       -crf 40 -b:v 0 -an -y public/guides/<key>.webm
```

옵션 설명:
- `-t 6` : 6초만 자르기 (그 이상 자동 truncate)
- `-vf "fps=15,scale=600:-1"` : 15fps + 가로 600px (세로 비율 유지)
- `-c:v libvpx-vp9` : webm vp9 codec (브라우저 지원 넓고 압축 좋음)
- `-crf 36` : 품질 (0=무손실, 63=최저). 36 정도면 가이드용 충분.
- `-an` : 오디오 제거 (필수 — 무음이라도 파일 크기 ↓)

mp4 도 가능 — Safari 호환이 더 좋지만 webm 도 모든 모던 브라우저 지원:
```bash
ffmpeg -i raw.mov -t 6 -vf "fps=15,scale=600:-1" -c:v libx264 \
       -crf 28 -preset slow -an -movflags +faststart \
       -y public/guides/<key>.mp4
```

mp4 사용 시 `guides.js` 에서 `gif: '/guides/<key>.mp4'` 로 경로 수정.

### 3. 추가 절차
1. `<key>.webm` 파일을 `public/guides/` 에 drop.
2. `src/utils/guides.js` 의 해당 entry 에 `gif: '/guides/<key>.webm'` 추가 (이미 있으면 그대로).
3. 페이지 새로고침 → ⓘ 아이콘 hover 시 자동 재생 확인.

## 권장 우선순위 — 자산 만들 5-10개 먼저

`guides.js` 의 entries 중 사용자 진입이 가장 잦은 것부터:

1. `meeting-log-template` — 양식 삽입 (1번 화면)
2. `meeting-log-audio` — STT 음성 업로드 (impact ↑)
3. `meeting-log-batch` — 배치 처리
4. `run-lint` — Lint 실행
5. `design-latest-update` — Design 6분 흐름
6. `vibe-coding-package` — 가장 결정적 가치
7. (이후) 나머지 추가

각 5-10분이면 녹화 + 압축 완료. 인프라가 이미 깔려 있어서 drop 만 하면 됨.

## 디자인 톤
- 단순한 호버/클릭 동작 1개씩만 보여주기.
- 텍스트 자막 X (popover 의 desc 가 텍스트 역할).
- 배경은 실제 운영 화면 그대로 (가공/모자이크 불필요).
- 마우스 커서가 보이도록 녹화.
