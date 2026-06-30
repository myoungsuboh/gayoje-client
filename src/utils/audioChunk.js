/**
 * 긴 회의 녹음 STT — 클라이언트 측 오디오 청킹.
 *
 * [배경] /transcribeAudio 단일 업로드는 30MB(≈30~50분) 가 한계라 1~2시간 회의가 안 들어간다.
 * 서버엔 ffmpeg 가 없고, 거대 파일을 한 요청에 적재하면 메모리·타임아웃 위험이 크다. 그래서
 * 브라우저 Web Audio 로 디코드 → 16kHz 모노로 변환(메모리·용량 축소) → 시간 분할 →
 * 각 청크를 기존 엔드포인트로 전사 → 이어붙인다. BE 는 청크당 일반 호출이라 변경이 없다.
 *
 * [경계 트레이드오프] 고정 시간 분할이라 청크 경계에서 단어가 갈리거나 화자 라벨(A:/B:)이
 * 청크마다 재시작할 수 있다 — "검토용 raw 전사" 라 허용한다(사용자가 textarea 에서 검토/수정).
 *
 * 순수 함수(planChunks/encodeWavPCM16/chunkSecForRate/joinTranscripts)와 오케스트레이터
 * (transcribeLargeAudio)는 decode·upload 를 주입받아 단위 테스트 가능. decodeAudioToMono 만
 * Web Audio 의존(테스트에선 주입으로 대체).
 */

/** 청킹 단계별 오류 — 호출부가 code 로 사용자 메시지를 매핑한다. */
export class AudioChunkError extends Error {
  constructor(code, meta = {}) {
    super(code)
    this.name = 'AudioChunkError'
    this.code = code
    this.meta = meta
  }
}

/**
 * 샘플레이트에 맞춰 청크 길이(초)를 산출 — 16-bit 모노 WAV 한 청크가 maxChunkBytes 를
 * 넘지 않게. Safari 가 16kHz 요청을 무시하고 원본 레이트로 디코드해도 청크가 과대해지지 않음.
 */
export function chunkSecForRate(sampleRate, maxChunkBytes) {
  // 16-bit 모노 = 2 bytes/sample. WAV 헤더(44B)+multipart 여유로 1KB 뺀다.
  const sec = Math.floor((maxChunkBytes - 1024) / (sampleRate * 2))
  return Math.max(30, sec) // 최소 30초 (지나치게 잘게 쪼개지 않도록)
}

/** 전체 길이(초)를 chunkSec 단위 구간으로 분할. [{index,startSec,endSec}]. */
export function planChunks(durationSec, chunkSec) {
  const chunks = []
  if (!(durationSec > 0) || !(chunkSec > 0)) return chunks
  for (let start = 0, i = 0; start < durationSec; start += chunkSec, i++) {
    chunks.push({ index: i, startSec: start, endSec: Math.min(durationSec, start + chunkSec) })
  }
  return chunks
}

/** Float32 모노 PCM → 16-bit PCM WAV(ArrayBuffer). Gemini 가 audio/wav 를 그대로 받는다. */
export function encodeWavPCM16(float32, sampleRate) {
  const numSamples = float32.length
  const blockAlign = 2 // 모노 * 16bit/8
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk 크기
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // 채널 수(모노)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  let off = 44
  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, float32[i] || 0))
    s = s < 0 ? s * 0x8000 : s * 0x7fff
    view.setInt16(off, s, true)
    off += 2
  }
  return buffer
}

/** 청크 전사 텍스트들을 빈 줄로 이어붙임(빈 청크=무음은 제외). */
export function joinTranscripts(parts) {
  return (parts || [])
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * 오디오 파일 → 16kHz(목표) 모노 Float32. Web Audio 의존이라 단위 테스트에선 주입으로 대체.
 * targetRate 를 못 맞추는 브라우저(Safari 등)에선 원본 레이트로 디코드되며, 호출부는
 * 반환된 sampleRate 기준으로 청크 길이를 다시 계산하므로 안전하다.
 */
export async function decodeAudioToMono(file, targetRate = 16000) {
  const Ctx =
    (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null
  if (!Ctx) throw new AudioChunkError('no_webaudio')
  const arrayBuf = await file.arrayBuffer()
  let ctx
  try {
    ctx = new Ctx({ sampleRate: targetRate })
  } catch {
    ctx = new Ctx()
  }
  let audioBuf
  try {
    audioBuf = await ctx.decodeAudioData(arrayBuf)
  } catch {
    try { ctx.close() } catch { /* noop */ }
    throw new AudioChunkError('decode_failed')
  }
  const chCount = audioBuf.numberOfChannels
  const len = audioBuf.length
  const mono = new Float32Array(len)
  for (let c = 0; c < chCount; c++) {
    const data = audioBuf.getChannelData(c)
    for (let i = 0; i < len; i++) mono[i] += data[i] / chCount
  }
  const sr = audioBuf.sampleRate
  try { ctx.close() } catch { /* noop */ }
  return { samples: mono, sampleRate: sr }
}

/**
 * 긴 오디오를 청크 단위로 전사하고 이어붙인다.
 * @param file 원본 오디오 File
 * @param decode (file, targetRate) => { samples: Float32Array(mono), sampleRate }
 * @param upload (blob, { index, total }) => { text, tokens, truncated }
 * @param onProgress ({ index, total }) => void  (index 는 0-based)
 * @returns { text, totalTokens, truncated, chunkCount }
 */
export async function transcribeLargeAudio(
  file,
  {
    decode,
    upload,
    onProgress,
    signal,
    targetRate = 16000,
    maxChunkBytes = 24 * 1024 * 1024,
    maxDurationSec = 3 * 3600,
  } = {},
) {
  const { samples, sampleRate } = await decode(file, targetRate)
  // [2026-06] 디코드(수 초~십수 초)는 가장 먼저 도는 단계 — 그 사이 취소했으면 즉시 중단
  // (signal 이 upload 에만 연결돼 디코드 중 취소 버튼이 먹통처럼 보이던 갭).
  if (signal?.aborted) throw new AudioChunkError('canceled')
  const durationSec = samples.length / sampleRate
  if (durationSec > maxDurationSec) {
    throw new AudioChunkError('too_long', { durationSec, maxDurationSec })
  }
  const chunkSec = chunkSecForRate(sampleRate, maxChunkBytes)
  const chunks = planChunks(durationSec, chunkSec)
  if (chunks.length === 0) throw new AudioChunkError('empty')

  const texts = []
  let totalTokens = 0
  let truncated = false
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    if (onProgress) onProgress({ index: i, total: chunks.length })
    const startSample = Math.floor(c.startSec * sampleRate)
    const endSample = Math.min(samples.length, Math.floor(c.endSec * sampleRate))
    const wav = encodeWavPCM16(samples.subarray(startSample, endSample), sampleRate)
    let res
    try {
      res = await upload(new Blob([wav], { type: 'audio/wav' }), {
        index: i,
        total: chunks.length,
      })
    } catch (err) {
      // [2026-06] 사용자 취소(abort)는 부분보존 없이 원본 오류 그대로 — 호출부가 '취소됨' 처리.
      if (signal?.aborted) throw err
      // [2026-06] 부분결과 보존 — 청크 1개가 실패해도 앞서 성공한 청크 전사는 살린다.
      // 살릴 게 있으면 partialText 와 함께 chunk_failed 로 던져 호출부가 채우게 하고,
      // 첫 청크부터 실패해 살릴 게 없으면 원본 오류를 그대로 올려 status/메시지 매핑을 살린다.
      const partialText = joinTranscripts(texts)
      if (partialText) {
        throw new AudioChunkError('chunk_failed', {
          partialText,
          doneCount: i,
          total: chunks.length,
          failedIndex: i,
          truncated,  // 앞 청크 중 truncated 있었으면 보존 → 호출부가 저장 게이트(C5) 적용
        })
      }
      throw err
    }
    texts.push(res?.text || '')
    totalTokens += res?.tokens || 0
    truncated = truncated || !!res?.truncated
  }
  return {
    text: joinTranscripts(texts),
    totalTokens,
    truncated,
    chunkCount: chunks.length,
  }
}
