import * as monaco from 'monaco-editor'

type ServerName = 'py' | 'ts'

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

let nextId = 1
const pending = new Map<string, Pending>() // `${server}:${id}` → pending

const openVersions = new Map<string, number>() // uri → version

const disposables: monaco.IDisposable[] = []

// ─── IPC bridge ───────────────────────────────────────────────────────────────

function sendToServer(server: ServerName, msg: object): void {
  window.api.lsp.sendToServer(server, msg)
}

function sendRequest(server: ServerName, method: string, params: unknown): Promise<unknown> {
  const id = nextId++
  const key = `${server}:${id}`
  return new Promise((resolve, reject) => {
    pending.set(key, { resolve, reject })
    setTimeout(() => {
      if (pending.has(key)) {
        pending.delete(key)
        reject(new Error(`LSP ${method} timed out`))
      }
    }, 5000)
    sendToServer(server, { jsonrpc: '2.0', id, method, params })
  })
}

function sendNotification(server: ServerName, method: string, params: unknown): void {
  sendToServer(server, { jsonrpc: '2.0', method, params })
}

// ─── Message handler ──────────────────────────────────────────────────────────

function handleMessage(server: ServerName, msg: any): void {
  if ('id' in msg && ('result' in msg || 'error' in msg)) {
    const key = `${server}:${msg.id}`
    const p = pending.get(key)
    if (p) {
      pending.delete(key)
      if ('error' in msg) p.reject(msg.error)
      else p.resolve(msg.result)
    }
    return
  }
  // Notification
  if (msg.method === 'textDocument/publishDiagnostics') {
    applyDiagnostics(server, msg.params)
  }
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

function lspSeverityToMonaco(s?: number): monaco.MarkerSeverity {
  switch (s) {
    case 1: return monaco.MarkerSeverity.Error
    case 2: return monaco.MarkerSeverity.Warning
    case 3: return monaco.MarkerSeverity.Info
    default: return monaco.MarkerSeverity.Hint
  }
}

function applyDiagnostics(server: ServerName, params: any): void {
  const model = monaco.editor.getModel(monaco.Uri.parse(params.uri))
  if (!model) return
  const source = server === 'py' ? 'pyright' : 'tsserver'
  const markers: monaco.editor.IMarkerData[] = (params.diagnostics ?? []).map((d: any) => ({
    severity: lspSeverityToMonaco(d.severity),
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    message: d.message,
    source
  }))
  monaco.editor.setModelMarkers(model, source, markers)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serverForLang(lang: string): ServerName | null {
  if (lang === 'python') return 'py'
  if (lang === 'typescript' || lang === 'javascript') return 'ts'
  return null
}

function posToLsp(pos: monaco.Position) {
  return { line: pos.lineNumber - 1, character: pos.column - 1 }
}

function lspRange(r: any): monaco.IRange {
  return {
    startLineNumber: r.start.line + 1,
    startColumn: r.start.character + 1,
    endLineNumber: r.end.line + 1,
    endColumn: r.end.character + 1
  }
}

function lspKind(k?: number): monaco.languages.CompletionItemKind {
  const map: Record<number, monaco.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    17: monaco.languages.CompletionItemKind.File,
    19: monaco.languages.CompletionItemKind.Folder,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    25: monaco.languages.CompletionItemKind.TypeParameter,
  }
  return map[k ?? 0] ?? monaco.languages.CompletionItemKind.Text
}

// ─── Document sync ────────────────────────────────────────────────────────────

function didOpen(model: monaco.editor.ITextModel): void {
  const server = serverForLang(model.getLanguageId())
  if (!server) return
  const uri = model.uri.toString()
  const version = 1
  openVersions.set(uri, version)
  sendNotification(server, 'textDocument/didOpen', {
    textDocument: { uri, languageId: model.getLanguageId(), version, text: model.getValue() }
  })
}

function didChange(model: monaco.editor.ITextModel): void {
  const server = serverForLang(model.getLanguageId())
  if (!server) return
  const uri = model.uri.toString()
  const version = (openVersions.get(uri) ?? 0) + 1
  openVersions.set(uri, version)
  sendNotification(server, 'textDocument/didChange', {
    textDocument: { uri, version },
    contentChanges: [{ text: model.getValue() }]
  })
}

function didClose(model: monaco.editor.ITextModel): void {
  const server = serverForLang(model.getLanguageId())
  if (!server) return
  const uri = model.uri.toString()
  openVersions.delete(uri)
  sendNotification(server, 'textDocument/didClose', { textDocument: { uri } })
}

// ─── Monaco providers ─────────────────────────────────────────────────────────

function registerProviders(): void {
  for (const lang of ['python', 'typescript', 'javascript'] as const) {
    const server = serverForLang(lang)!

    disposables.push(
      monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: ['.', '(', ',', '"', "'", ' '],
        async provideCompletionItems(model, position) {
          try {
            const result: any = await sendRequest(server, 'textDocument/completion', {
              textDocument: { uri: model.uri.toString() },
              position: posToLsp(position),
              context: { triggerKind: 1 }
            })
            if (!result) return { suggestions: [] }
            const items: any[] = Array.isArray(result) ? result : (result.items ?? [])
            const wordRange = model.getWordUntilPosition(position)
            const defaultRange: monaco.IRange = {
              startLineNumber: position.lineNumber,
              startColumn: wordRange.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: position.column
            }
            return {
              suggestions: items.map((item: any) => ({
                label: item.label,
                kind: lspKind(item.kind),
                detail: item.detail,
                documentation: typeof item.documentation === 'object'
                  ? item.documentation?.value
                  : item.documentation,
                insertText: item.textEdit?.newText ?? item.insertText ?? item.label,
                insertTextRules: item.insertTextFormat === 2
                  ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                  : undefined,
                range: item.textEdit?.range ? lspRange(item.textEdit.range) : defaultRange,
                sortText: item.sortText,
                filterText: item.filterText
              }))
            }
          } catch {
            return { suggestions: [] }
          }
        }
      })
    )

    disposables.push(
      monaco.languages.registerHoverProvider(lang, {
        async provideHover(model, position) {
          try {
            const result: any = await sendRequest(server, 'textDocument/hover', {
              textDocument: { uri: model.uri.toString() },
              position: posToLsp(position)
            })
            if (!result?.contents) return null
            const contents = Array.isArray(result.contents) ? result.contents : [result.contents]
            return {
              range: result.range ? lspRange(result.range) : undefined,
              contents: contents.map((c: any) => ({
                value: typeof c === 'string' ? c : (c?.value ?? '')
              }))
            }
          } catch {
            return null
          }
        }
      })
    )

    disposables.push(
      monaco.languages.registerDefinitionProvider(lang, {
        async provideDefinition(model, position) {
          try {
            const result: any = await sendRequest(server, 'textDocument/definition', {
              textDocument: { uri: model.uri.toString() },
              position: posToLsp(position)
            })
            if (!result) return null
            const locs: any[] = Array.isArray(result) ? result : [result]
            return locs.map((loc: any) => ({
              uri: monaco.Uri.parse(loc.uri ?? loc.targetUri),
              range: lspRange(loc.range ?? loc.targetRange ?? loc.targetSelectionRange)
            }))
          } catch {
            return null
          }
        }
      })
    )

    disposables.push(
      monaco.languages.registerReferenceProvider(lang, {
        async provideReferences(model, position, context) {
          try {
            const result: any = await sendRequest(server, 'textDocument/references', {
              textDocument: { uri: model.uri.toString() },
              position: posToLsp(position),
              context: { includeDeclaration: context.includeDeclaration }
            })
            if (!Array.isArray(result)) return []
            return result.map((loc: any) => ({
              uri: monaco.Uri.parse(loc.uri),
              range: lspRange(loc.range)
            }))
          } catch {
            return []
          }
        }
      })
    )
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initLspClient(): void {
  // Listen for messages from both servers
  window.api.lsp.onMessage('py', (msg) => handleMessage('py', msg))
  window.api.lsp.onMessage('ts', (msg) => handleMessage('ts', msg))

  // Track model lifecycle for document synchronization
  disposables.push(
    monaco.editor.onDidCreateModel((model) => {
      didOpen(model)
      disposables.push(model.onDidChangeContent(() => didChange(model)))
      disposables.push(model.onWillDispose(() => didClose(model)))
    })
  )

  // Register completion, hover, definition, reference providers
  registerProviders()
}

export function disposeLspClient(): void {
  disposables.forEach((d) => d.dispose())
  disposables.length = 0
  pending.clear()
  openVersions.clear()
}
