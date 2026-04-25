import path from 'path'
import fs from 'fs'
import { readWavAsPCM } from './audioService'

let _cacheDir = ''
export function initCacheDir(dir: string): void { _cacheDir = dir }

const THRESHOLD = 0.75

// FeatureExtractionPipeline is a text pipeline and calls this.tokenizer().
// WavLM is an audio XVector model — use AutoProcessor + AutoModelForAudioXVector directly.
type Processor = (audio: Float32Array, opts: { sampling_rate: number }) => Promise<Record<string, unknown>>
type XVectorModel = (inputs: Record<string, unknown>) => Promise<{ embeddings: { tolist: () => number[][] } }>

let _processor: Processor | null = null
let _model: XVectorModel | null = null

interface SpeakerEmbeddings {
  [speakerId: string]: number[]
}

export async function getEmbedder(): Promise<boolean> {
  if (_processor && _model) return true

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { AutoProcessor, AutoModelForXVector, env } = await import('@huggingface/transformers') as any
    env.cacheDir = path.join(_cacheDir, 'hf-models')

    console.log('[Speech] Loading speaker embedding model...')
    const TEN_MINUTES = 10 * 60 * 1000
    const loadPromise = Promise.all([
      AutoProcessor.from_pretrained('Xenova/wavlm-base-sv'),
      AutoModelForXVector.from_pretrained('Xenova/wavlm-base-sv', { dtype: 'fp32' })
    ])
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Speaker model download timed out after 10 minutes')), TEN_MINUTES)
    )
    const [processor, model] = await Promise.race([loadPromise, timeoutPromise])
    _processor = processor as Processor
    _model = model as XVectorModel
    console.log('[Speech] Speaker embedder ready')
  } catch (e) {
    console.warn('[Speech] Speaker embedding model unavailable — speaker ID disabled:', e)
    return false
  }

  return true
}

export function warmupEmbedder(): void {
  getEmbedder().catch(e => console.warn('[Speech] Model warmup failed:', e))
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

const MAX_EMBED_SAMPLES = 5 * 16000  // cap at 5s to keep CPU inference fast

export async function embed(wavPath: string): Promise<number[] | null> {
  const ready = await getEmbedder()
  if (!ready || !_processor || !_model) return null

  let pcm = readWavAsPCM(wavPath)
  if (pcm.length > MAX_EMBED_SAMPLES) pcm = pcm.slice(0, MAX_EMBED_SAMPLES)

  console.log(`[Speech] embed: processing ${pcm.length} samples from ${wavPath}`)
  const inputs = await _processor(pcm, { sampling_rate: 16000 })
  console.log('[Speech] embed: processor done, running model...')
  const output = await _model(inputs)
  console.log('[Speech] embed: model done')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const embeddings = (output as any).embeddings
  if (!embeddings) {
    console.warn('[Speech] embed: model output has no embeddings field, keys:', Object.keys(output as object))
    return null
  }
  return embeddings.tolist()[0]
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
  console.log(`[Speech] train: starting with ${recordings.length} recordings`)
  const ready = await getEmbedder()
  if (!ready) return { accuracy: 0, deployed: false }

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
    const existing = loadEmbeddings(projectPath)
    saveEmbeddings(projectPath, existing)
  }

  return { accuracy, deployed }
}
