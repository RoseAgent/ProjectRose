export function joinPath(a: string, b: string): string {
  return a.replace(/[\\/]$/, '') + '/' + b
}

// Last path segment, tolerant of both separators and trailing slashes.
export function basename(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}
