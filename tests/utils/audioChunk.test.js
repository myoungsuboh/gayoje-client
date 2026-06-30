/**
 * audioChunk.js — 긴 회의 STT 클라이언트 청킹 유틸.
 * 순수 헬퍼 + 오케스트레이터(decode/upload 주입)로 Web Audio 없이 전량 검증.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  AudioChunkError,
  chunkSecForRate,
  planChunks,
  encodeWavPCM16,
  joinTranscripts,
  transcribeLargeAudio,
} from '@/utils/audioChunk'

describe('planChunks', () => {
  it('전체 길이를 chunkSec 단위로 나눈다 (마지막은 잔여)', () => {
    expect(planChunks(25, 10)).toEqual([
      { index: 0, startSec: 0, endSec: 10 },
      { index: 1, startSec: 10, endSec: 20 },
      { index: 2, startSec: 20, endSec: 25 },
    ])
  })
  it('딱 떨어지면 균등 분할', () => {
    expect(planChunks(20, 10).length).toBe(2)
  })
  it('0/음수 입력은 빈 배열', () => {
    expect(planChunks(0, 10)).toEqual([])
    expect(planChunks(10, 0)).toEqual([])
  })
})

describe('chunkSecForRate', () => {
  it('청크 WAV 가 maxChunkBytes 를 넘지 않는 초를 준다', () => {
    const sr = 16000
    const max = 24 * 1024 * 1024
    const sec = chunkSecForRate(sr, max)
    expect(sec * sr * 2 + 44).toBeLessThanOrEqual(max) // 16-bit 모노 + 헤더
  })
  it('높은 샘플레이트(44.1k)에서도 상한 유지', () => {
    const sr = 44100
    const max = 24 * 1024 * 1024
    const sec = chunkSecForRate(sr, max)
    expect(sec * sr * 2 + 44).toBeLessThanOrEqual(max)
    expect(sec).toBeLessThan(chunkSecForRate(16000, max)) // 레이트 높을수록 짧게
  })
  it('최소 30초 보장', () => {
    expect(chunkSecForRate(16000, 1024)).toBe(30)
  })
})

describe('encodeWavPCM16', () => {
  it('올바른 WAV 헤더 + 데이터 크기', () => {
    const sr = 16000
    const buf = encodeWavPCM16(new Float32Array([0, 1, -1, 0.5]), sr)
    expect(buf.byteLength).toBe(44 + 4 * 2)
    const view = new DataView(buf)
    const str = (o, n) => String.fromCharCode(...Array.from({ length: n }, (_, i) => view.getUint8(o + i)))
    expect(str(0, 4)).toBe('RIFF')
    expect(str(8, 4)).toBe('WAVE')
    expect(str(36, 4)).toBe('data')
    expect(view.getUint16(22, true)).toBe(1) // 모노
    expect(view.getUint32(24, true)).toBe(sr) // 샘플레이트
    expect(view.getUint16(34, true)).toBe(16) // bits
    expect(view.getUint32(40, true)).toBe(8) // dataSize = 4 샘플 * 2
  })
  it('샘플 클리핑 + 16-bit 변환 (1.0→0x7FFF, -1.0→-0x8000)', () => {
    const buf = encodeWavPCM16(new Float32Array([1, -1, 2]), 8000) // 2 는 클리핑되어 1 취급
    const view = new DataView(buf)
    expect(view.getInt16(44, true)).toBe(0x7fff)
    expect(view.getInt16(46, true)).toBe(-0x8000)
    expect(view.getInt16(48, true)).toBe(0x7fff)
  })
  it('subarray(비-0 오프셋) 뷰도 올바르게 인코딩 — 실사용 슬라이스 경로', () => {
    const full = new Float32Array([0, 0, 1.0, -1.0]) // 앞 2개는 다른 청크
    const slice = full.subarray(2, 4) // byteOffset=8, [1.0, -1.0]
    const buf = encodeWavPCM16(slice, 8000)
    const view = new DataView(buf)
    expect(view.getUint32(40, true)).toBe(4) // dataSize = 2 샘플 * 2
    expect(view.getInt16(44, true)).toBe(0x7fff) // slice[0]=1.0
    expect(view.getInt16(46, true)).toBe(-0x8000) // slice[1]=-1.0
  })
})

describe('joinTranscripts', () => {
  it('trim + 빈 청크 제외 + 빈 줄로 연결', () => {
    expect(joinTranscripts(['a', '', '  b ', null])).toBe('a\n\nb')
  })
  it('전부 비면 빈 문자열', () => {
    expect(joinTranscripts(['', '   ', null])).toBe('')
  })
})

describe('transcribeLargeAudio', () => {
  const makeDecode = (samples, sampleRate) => vi.fn(async () => ({ samples, sampleRate }))

  it('디코드 → 청크별 업로드 → 이어붙이기 + 토큰 합산 + truncated OR', async () => {
    // sampleRate 100Hz, 75초 → maxChunkBytes 로 chunkSec=30 강제 → 3 청크
    const sampleRate = 100
    const samples = new Float32Array(sampleRate * 75)
    const decode = makeDecode(samples, sampleRate)
    const upload = vi.fn(async (_blob, meta) => ({
      text: `seg${meta.index}`,
      tokens: 10,
      truncated: meta.index === 1,
    }))
    const progress = []
    const res = await transcribeLargeAudio(new Blob(['x']), {
      decode,
      upload,
      onProgress: (p) => progress.push(p),
      maxChunkBytes: 30 * sampleRate * 2 + 1024, // chunkSec = 30
    })
    expect(upload).toHaveBeenCalledTimes(3)
    expect(res.chunkCount).toBe(3)
    expect(res.text).toBe('seg0\n\nseg1\n\nseg2')
    expect(res.totalTokens).toBe(30)
    expect(res.truncated).toBe(true)
    expect(progress).toEqual([
      { index: 0, total: 3 },
      { index: 1, total: 3 },
      { index: 2, total: 3 },
    ])
    // 업로드된 blob 은 audio/wav
    expect(upload.mock.calls[0][0].type).toBe('audio/wav')
  })

  it('무음(빈 텍스트) 청크는 결과에서 빠지되 전체는 진행', async () => {
    const sampleRate = 100
    const samples = new Float32Array(sampleRate * 60)
    const upload = vi.fn(async (_b, meta) => ({ text: meta.index === 0 ? '' : 'hello', tokens: 5 }))
    const res = await transcribeLargeAudio(new Blob(['x']), {
      decode: makeDecode(samples, sampleRate),
      upload,
      maxChunkBytes: 30 * sampleRate * 2 + 1024, // 30초 청크 → 2 청크
    })
    expect(res.chunkCount).toBe(2)
    expect(res.text).toBe('hello') // 첫 청크 무음 제외
    expect(res.totalTokens).toBe(10)
  })

  it('최대 길이 초과 → too_long 에러', async () => {
    const sampleRate = 100
    const samples = new Float32Array(sampleRate * 100) // 100초
    await expect(
      transcribeLargeAudio(new Blob(['x']), {
        decode: makeDecode(samples, sampleRate),
        upload: vi.fn(),
        maxDurationSec: 10,
      }),
    ).rejects.toMatchObject({ code: 'too_long' })
  })

  it('빈 오디오 → empty 에러', async () => {
    await expect(
      transcribeLargeAudio(new Blob(['x']), {
        decode: makeDecode(new Float32Array(0), 16000),
        upload: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(AudioChunkError)
  })

  it('중간 청크 실패 → 앞 전사 보존하며 chunk_failed (부분결과)', async () => {
    const sampleRate = 100
    const samples = new Float32Array(sampleRate * 75) // 30초 청크 → 3 청크
    const upload = vi.fn(async (_b, meta) => {
      if (meta.index === 1) throw new Error('network')
      return { text: `seg${meta.index}`, tokens: 5 }
    })
    await expect(
      transcribeLargeAudio(new Blob(['x']), {
        decode: makeDecode(samples, sampleRate),
        upload,
        maxChunkBytes: 30 * sampleRate * 2 + 1024,
      }),
    ).rejects.toMatchObject({
      code: 'chunk_failed',
      meta: { partialText: 'seg0', doneCount: 1, total: 3, failedIndex: 1 },
    })
    expect(upload).toHaveBeenCalledTimes(2) // seg0 성공 후 seg1 실패에서 중단
  })

  it('첫 청크부터 실패 → 보존할 게 없어 원본 오류 그대로 전파(chunk_failed 래핑 안 함)', async () => {
    const sampleRate = 100
    const samples = new Float32Array(sampleRate * 75)
    const upload = vi.fn(async () => { throw new Error('boom') })
    let caught
    try {
      await transcribeLargeAudio(new Blob(['x']), {
        decode: makeDecode(samples, sampleRate),
        upload,
        maxChunkBytes: 30 * sampleRate * 2 + 1024,
      })
    } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(AudioChunkError)
    expect(caught.message).toBe('boom')
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('signal.aborted=true(사용자 취소) → 부분보존 없이 원본 오류 전파', async () => {
    const sampleRate = 100
    const samples = new Float32Array(sampleRate * 75) // 3 청크
    const fakeSignal = { aborted: false }
    const upload = vi.fn(async (_b, meta) => {
      if (meta.index === 1) { fakeSignal.aborted = true; throw new Error('canceled') }
      return { text: `seg${meta.index}`, tokens: 5 }
    })
    let caught
    try {
      await transcribeLargeAudio(new Blob(['x']), {
        decode: makeDecode(samples, sampleRate),
        upload,
        signal: fakeSignal,
        maxChunkBytes: 30 * sampleRate * 2 + 1024,
      })
    } catch (e) { caught = e }
    // 취소는 chunk_failed 로 래핑하지 않고 원본 오류 그대로 → 호출부가 '취소됨' 처리.
    expect(caught).not.toBeInstanceOf(AudioChunkError)
    expect(caught.message).toBe('canceled')
  })
})
