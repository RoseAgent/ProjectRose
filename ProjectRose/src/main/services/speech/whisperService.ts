import { app } from 'electron'
import path from 'path'
import { readWavAsPCM } from './audioService'

type TranscriptionPipeline = (
  input: Float32Array,
  opts: { sampling_rate: number; language: string; task: string }
) => Promise<{ text: string }>

let _pipeline: TranscriptionPipeline | null = null

async function getPipeline(): Promise<TranscriptionPipeline> {
  if (_pipeline) return _pipeline

  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = path.join(app.getPath('userData'), 'hf-models')

  console.log('[Speech] Loading Whisper model (first use — may take a moment)...')
  _pipeline = (await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
    dtype: 'fp32'
  })) as unknown as TranscriptionPipeline
  console.log('[Speech] Whisper ready')

  return _pipeline
}

export async function transcribe(wavPath: string): Promise<string> {
  const pipe = await getPipeline()
  const pcm = readWavAsPCM(wavPath)
  const result = await pipe(pcm, { sampling_rate: 16000, language: 'en', task: 'transcribe' })
  return result.text.trim()
}
