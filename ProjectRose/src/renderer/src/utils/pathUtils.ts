export function joinPath(a: string, b: string): string {
  return a.replace(/[\\/]$/, '') + '/' + b
}
