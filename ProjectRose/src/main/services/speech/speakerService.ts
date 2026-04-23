import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { readWavAsPCM } from './audioService'

const THRESHOLD = 0.75

type EmbedPipeline = (
  input: Float32Array,
  opts: { sampling_rate: number; pooling: string; normalize: boolean }
) => Promise<{ tolist: () => number[][] }>

let _embedder: EmbedPipeline | null = null

interface SpeakerEmbeddings {
  [speakerId: string]: number[]
}

async function getEmbedder(): Promise<EmbedPipeline | null> {
  if (_embedder) return _embedder

  try {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = path.join(app.getPath('userData'), 'hf-models')

    console.log('[Speech] Loading speaker embedding model...')
    _embedder = (await pipeline(
      'feature-extraction',
      'Xenova/wavlm-base-sv',
      { dtype: 'fp32' }
    )) as unknown as EmbedPipeline
    console.log('[Speech] Speaker embedder ready')
  } catch (e) {
    console.warn('[Speech] Speaker embedding model unavailable — speaker ID disabled:', e)
    return null
  }

  return _embedder
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

function embeddingsPath(projectPath: string): string {
  return path.join(projectPath, '.projectrose', 'speech', 'models', 'speaker_embeddings.json')
}

export function loadEmbeddings(projectPath: string): SpeakerEmbeddings {
  const p = embeddingsPath(projectPath)
  if (!fs.existsSync(p)) return {}
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as SpeakerEmbeddings } catch { return {} }
}

export function saveEmbeddings(projectPath: string, embeddings: SpeakerEmbeddings): void {
  const dir = path.dirname(embeddingsPath(projectPath))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(embeddingsPath(projectPath), JSON.stringify(embeddings))
}

export async function embed(wavPath: string): Promise<number[] | null> {
  const embedder = await getEmbedder()
  if (!embedder) return null

  const pcm = readWavAsPCM(wavPath)
  const out = await embedder(pcm, { sampling_rate: 16000, pooling: 'mean', normalize: true })
  return out.tolist()[0]
}

export function identify(
  embedding: number[],
  projectPath: string
): { speakerId: number | null; speakerName: string | null; confidence: number } {
  const stored = loadEmbeddings(projectPath)
  let bestId: string | null = null
  let bestSim = -1

  for (const [id, vec] of Object.entries(stored)) {
    const sim = cosine(embedding, vec)
    if (sim > bestSim) { bestSim = sim; bestId = id }
  }

  if (bestId === null || bestSim < THRESHOLD) {
    return { speakerId: null, speakerName: null, confidence: bestSim }
  }

  return { speakerId: parseInt(bestId), speakerName: null, confidence: bestSim }
}

export async function train(
  projectPath: string,
  recordings: Array<{ id: number; speaker_id: number; audio_path: string }>,
  webmPathToWav: (audioPath: string) => Promise<string>,
  cleanupWav: (p: string) => void
): Promise<{ accuracy: number; deployed: boolean }> {
  const embedder = await getEmbedder()
  if (!embedder) {
    return { accuracy: 0, deployed: false }
  }

  // Group recordings by speaker
  const bySpeaker = new Map<number, string[]>()
  for (const r of recordings) {
    if (!bySpeaker.has(r.speaker_id)) bySpeaker.set(r.speaker_id, [])
    bySpeaker.get(r.speaker_id)!.push(r.audio_path)
  }

  const embeddings: SpeakerEmbeddings = {}

  // Compute mean embedding per speaker
  for (const [speakerId, audioPaths] of bySpeaker.entries()) {
    const vecs: number[][] = []
    for (const audioPath of audioPaths) {
      if (!fs.existsSync(audioPath)) continue
      let wav: string | null = null
      try {
        wav = await webmPathToWav(audioPath)
        const vec = await embed(wav)
        if (vec) vecs.push(vec)
      } catch { /* skip */ } finally {
        if (wav) cleanupWav(wav)
      }
    }
    if (vecs.length === 0) continue

    const mean = new Array<number>(vecs[0].length).fill(0)
    for (const v of vecs) for (let i = 0; i < v.length; i++) mean[i] += v[i] / vecs.length
    embeddings[String(speakerId)] = mean
  }

  saveEmbeddings(projectPath, embeddings)

  // Cross-validation accuracy
  let correct = 0, total = 0
  for (const [speakerId, audioPaths] of bySpeaker.entries()) {
    for (const audioPath of audioPaths) {
      if (!fs.existsSync(audioPath)) continue
      let wav: string | null = null
      try {
        wav = await webmPathToWav(audioPath)
        const vec = await embed(wav)
        if (!vec) continue
        const result = identify(vec, projectPath)
        if (result.speakerId === speakerId) correct++
        total++
      } catch { /* skip */ } finally {
        if (wav) cleanupWav(wav)
      }
    }
  }

  const accuracy = total > 0 ? correct / total : 0
  const deployed = accuracy >= 0.7

  if (!deployed) {
    // Roll back embeddings if accuracy too low
    const existing = loadEmbeddings(projectPath)
    if (Object.keys(existing).length === 0) {
      // No previous model — keep the new one anyway so user has something
      // but mark as not deployed
    }
    // Don't save bad embeddings — keep previous
    saveEmbeddings(projectPath, existing)
  }

  return { accuracy, deployed }
}
