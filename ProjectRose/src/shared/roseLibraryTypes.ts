// ── Health Check ──

export interface HealthResponse {
  name: string
  version: string
}

// ── Check File ──

export interface FileHashEntry {
  path: string
  hash: string
}

export type FileStatus = 'current' | 'stale' | 'unknown'

export interface FileCheckResult {
  path: string
  status: FileStatus
}

// ── Update Files (bulk) ──

export interface FileUpdateItem {
  path: string
  content: string
}

export interface BulkUpdateRequest {
  files: FileUpdateItem[]
}

export interface BrokenReference {
  target_symbol_name: string
  affected_files: string[]
}

export interface BulkFileResult {
  path: string
  symbols_indexed: number
  broken_references: BrokenReference[]
}

export interface BulkUpdateResponse {
  results: BulkFileResult[]
}

// ── Status ──

export interface UnresolvedReference {
  source_file: string
  source_symbol: string
  target_symbol_name: string
  type: ReferenceType
  line_number: number
}

export interface IndexStatus {
  files_indexed: number
  symbols_indexed: number
  references_total: number
  unresolved_count: number
  unresolved_references: UnresolvedReference[]
}

// ── Search ──

export interface SearchRequest {
  query: string
  limit?: number
  metadata_weight?: number
  code_weight?: number
}

export interface SearchResult {
  symbol_name: string
  qualified_name: string
  file_path: string
  type: string
  line_start: number
  line_end: number
  source_code: string
  score: number
  docstring: string | null
}

// ── Find References ──

export type ReferenceDirection = 'inbound' | 'outbound' | 'both'
export type ReferenceType = 'import' | 'call' | 'assignment' | 'destructure'

export interface FindReferencesRequest {
  symbol_name: string
  file_path?: string
  direction?: ReferenceDirection
}

export interface ReferenceResult {
  source_file: string
  source_symbol: string
  target_symbol_name: string
  target_file_path: string | null
  type: ReferenceType
  line_number: number
}

// ── Overview ──

export interface OverviewSymbol {
  name: string
  qualified_name: string
  type: string
  parameters: string | null
  docstring: string | null
}

export interface OverviewFile {
  path: string
  language: string
  symbols: OverviewSymbol[]
  inbound_reference_count: number
  outbound_reference_count: number
  depends_on: string[]
  depended_on_by: string[]
}

export interface RepositoryOverview {
  total_files: number
  total_symbols: number
  total_references: number
  files: OverviewFile[]
}

// ── Ambiguous Symbol Error ──

export interface AmbiguousCandidate {
  qualified_name: string
  file_path: string
}

export interface AmbiguousSymbolError {
  message: string
  candidates: AmbiguousCandidate[]
}
