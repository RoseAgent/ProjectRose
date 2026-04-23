import path from 'path'
import fs from 'fs'
import os from 'os'
import { randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

let _ffmpegPath: string | null = null

function ffmpegPath(): string {
  if (_ffmpegPath) return _ffmpegPath
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _ffmpegPath = (require('@ffmpeg-installer/ffmpeg') as { path: string }).path
  return _ffmpegPath!
}

export async function webmToWav(audioBuffer: ArrayBuffer): Promise<string> {
  const tmp = os.tmpdir()
  const inPath = path.join(tmp, `rs-${randomUUID()}.webm`)
  const outPath = path.join(tmp, `rs-${randomUUID()}.wav`)

  fs.writeFileSync(inPath, Buffer.from(audioBuffer))

  try {
    await execFileAsync(ffmpegPath(), [
      '-y',
      '-i', inPath,
      '-ar', '16000',
      '-ac', '1',
      '-f', 'wav',
      outPath
    ])
    return outPath
  } finally {
    try { fs.unlinkSync(inPath) } catch { /* ignore */ }
  }
}

export async function webmPathToWav(inputPath: string): Promise<string> {
  const outPath = path.join(os.tmpdir(), `rs-${randomUUID()}.wav`)
  await execFileAsync(ffmpegPath(), [
    '-y',
    '-i', inputPath,
    '-ar', '16000',
    '-ac', '1',
    '-f', 'wav',
    outPath
  ])
  return outPath
}

export function cleanupWav(wavPath: string): void {
  try { fs.unlinkSync(wavPath) } catch { /* ignore */ }
}

export function saveRecording(
  projectPath: string,
  speakerId: number | null,
  audioBuffer: ArrayBuffer
): string {
  const subdir = speakerId != null ? String(speakerId) : 'unknown'
  const dir = path.join(projectPath, '.projectrose', 'speech', 'recordings', subdir)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${randomUUID()}.webm`)
  fs.writeFileSync(filePath, Buffer.from(audioBuffer))
  return filePath
}

export function readWavAsPCM(wavPath: string): Float32Array {
  const buf = fs.readFileSync(wavPath)
  const headerSize = 44
  const samples = (buf.length - headerSize) / 2
  const pcm = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    pcm[i] = buf.readInt16LE(headerSize + i * 2) / 32768.0
  }
  return pcm
}
