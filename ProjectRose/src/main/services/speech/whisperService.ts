import path from 'path'
import { readWavAsPCM } from './audioService'

type TranscriptionPipeline = (
  input: Float32Array,
  opts: { sampling_rate: number }
) => Promise<{ text: string }>

let _pipeline: TranscriptionPipeline | null = null
let _cacheDir = ''

export function initCacheDir(dir: string): void { _cacheDir = dir }

async function getPipeline(): Promise<TranscriptionPipeline> {
  if (_pipeline) return _pipeline

  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = path.join(_cacheDir, 'hf-models')

  console.log('[Speech] Loading Whisper model (first use — may take a moment)...')
  _pipeline = (await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
    dtype: 'q8'
  })) as unknown as TranscriptionPipeline
  console.log('[Speech] Whisper ready')

  return _pipeline
}

// ~-40 dBFS. Silence and ambient noise sit well below this; normal speech well above.
const SILENCE_RMS_THRESHOLD = 0.01

function rms(pcm: Float32Array): number {
  let sum = 0
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i]
  return Math.sqrt(sum / pcm.length)
}

// Whisper commonly hallucinates these patterns on silence or near-silence.
const HALLUCINATION_PATTERNS: RegExp[] = [
  /^\[.*?\]$/,                                  // [Music], [Applause], [Silence], etc.
  /^\(.*?\)$/,                                  // (Music), (piano music), etc.
  /^thank\s+you\.?$/i,
  /^thanks?\s+(for\s+watching)?\.?$/i,
  /^you$/i,
  /^\.+$/,                                      // lone periods
  /^[\s.,!?]+$/,                                // punctuation only
]

function isSilentOrHallucination(text: string): boolean {
  const t = text.trim()
  if (t.length === 0) return true
  if (t.length <= 2) return true                // single char / emoji artifact
  return HALLUCINATION_PATTERNS.some((p) => p.test(t))
}

export async function transcribe(wavPath: string): Promise<string> {
  const pipe = await getPipeline()
  const pcm = readWavAsPCM(wavPath)

  // Gate on energy — don't send silence to Whisper at all
  if (rms(pcm) < SILENCE_RMS_THRESHOLD) return ''

  const result = await pipe(pcm, { sampling_rate: 16000 })
  const text = result.text.trim()

  if (isSilentOrHallucination(text)) return ''
  return text
}
