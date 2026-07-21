import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CONTACT_KINDS,
  type ContactKind,
  type ContactSearchResult
} from '@shared/contacts'
import {
  buildContactMarkdown,
  parseContactContent,
  type LabeledValue,
  type ParsedLocalFields
} from '@shared/contactFields'
import { FieldList } from './fields/FieldList'
import { OrgList, type OrgEntry } from './fields/OrgList'
import { logInteraction } from '../../../lib/interactionLog'
import styles from './ContactsPage.module.css'

// ── Helpers ────────────────────────────────────────────────────────────────

function kindBadgeClass(kind: ContactKind): string {
  switch (kind) {
    case 'person':   return `${styles.kindBadge} ${styles.kindPerson}`
    case 'business': return `${styles.kindBadge} ${styles.kindBusiness}`
    case 'website':  return `${styles.kindBadge} ${styles.kindWebsite}`
    case 'other':    return `${styles.kindBadge} ${styles.kindOther}`
  }
}

const EMPTY_FIELDS: ParsedLocalFields = {
  emails: [], phones: [], addresses: [], urls: [], orgs: [], biographyLines: []
}

interface EditorState {
  kind: ContactKind
  fields: ParsedLocalFields
  notesText: string
}

function stateFromContent(content: string): EditorState {
  const parsed = parseContactContent(content)
  return {
    kind: parsed.kind,
    fields: { ...parsed.fields, biographyLines: [] },
    notesText: parsed.fields.biographyLines.join('\n')
  }
}

function buildContentFromState(entity: string, state: EditorState): string {
  const biographyLines = state.notesText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return buildContactMarkdown(entity, state.kind, {
    ...state.fields,
    biographyLines
  })
}

// ── Page component ─────────────────────────────────────────────────────────

export function ContactsPage(): JSX.Element {
  const [entries, setEntries] = useState<Array<{ entity: string; kind: ContactKind }>>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [originalContent, setOriginalContent] = useState('')
  const [state, setState] = useState<EditorState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResult, setSearchResult] = useState<ContactSearchResult | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const refresh = useCallback(async () => {
    const list = await window.api.contacts.listContactsDetailed()
    setEntries(list)
    if (list.length && !selected) setSelected(list[0].entity)
  }, [selected])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!selected) { setOriginalContent(''); setState(null); return }
    let cancelled = false
    void window.api.contacts.readContact(selected).then((c) => {
      if (cancelled) return
      const text = c ?? ''
      setOriginalContent(text)
      setState(stateFromContent(text))
    })
    return () => { cancelled = true }
  }, [selected])

  useEffect(() => {
    const term = search.trim()
    if (!term) { setSearchResult(null); return }
    // Whitespace-split into independent queries so a search like "alice acme"
    // pulls up contacts matching either word, ranked by how many matched.
    const queries = term.split(/\s+/).filter(Boolean)
    let cancelled = false
    const t = setTimeout(async () => {
      const result = await window.api.contacts.searchContacts(queries)
      if (!cancelled) setSearchResult(result)
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search])

  const currentContent = useMemo(() => {
    if (!selected || !state) return ''
    return buildContentFromState(selected, state)
  }, [selected, state])

  const dirty = state !== null && currentContent !== originalContent

  const updateState = (patch: Partial<EditorState>): void => {
    setState((prev) => (prev ? { ...prev, ...patch } : prev))
  }
  const updateFields = (patch: Partial<ParsedLocalFields>): void => {
    setState((prev) => (prev ? { ...prev, fields: { ...prev.fields, ...patch } } : prev))
  }

  const save = async (): Promise<void> => {
    if (!selected || !state || !dirty) return
    setBusy('Saving…')
    try {
      await window.api.contacts.writeContact({ entity: selected, content: currentContent })
      setOriginalContent(currentContent)
      logInteraction('contact.edited')
      void refresh()
    } finally { setBusy(null) }
  }

  const remove = async (): Promise<void> => {
    if (!selected) return
    setBusy('Deleting…')
    try {
      await window.api.contacts.deleteContact(selected)
      setSelected(null)
      setOriginalContent('')
      setState(null)
      logInteraction('contact.deleted')
      void refresh()
    } finally { setBusy(null) }
  }

  const createContact = async (entity: string, kind: ContactKind): Promise<void> => {
    setBusy('Creating…')
    try {
      const created = await window.api.contacts.newContact(entity)
      // newContact defaults to 'other'; bump the kind in a second call if the
      // user picked something else.
      if (kind !== 'other') {
        await window.api.contacts.setContactKind({ entity: created.entity, kind })
      }
      logInteraction('contact.created')
      await refresh()
      setSelected(created.entity)
      setNewOpen(false)
    } finally { setBusy(null) }
  }

  return (
    <div className={styles.page}>
      <div className={styles.split}>
        <aside className={styles.listPane}>
          <div className={styles.listHeader}>
            <span>Contacts · {entries.length}</span>
          </div>
          <div className={styles.searchPane}>
            <input
              className={styles.search}
              placeholder="Search notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={styles.listScroll}>
            {entries.length === 0 && <div className={styles.empty}>No contacts yet.</div>}
            {entries.map((e) => (
              <button
                key={e.entity}
                className={`${styles.listRow} ${selected === e.entity ? styles.listRowActive : ''}`}
                onClick={() => setSelected(e.entity)}
              >
                <div className={styles.listRowInner}>
                  <span className={styles.listRowName}>{e.entity}</span>
                  <span className={kindBadgeClass(e.kind)}>{e.kind}</span>
                </div>
              </button>
            ))}
          </div>
          <div className={styles.btnRow}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => setNewOpen(true)}
              disabled={busy !== null}
            >
              + New
            </button>
          </div>
        </aside>

        {newOpen && (
          <NewContactModal
            busy={busy !== null}
            existing={new Set(entries.map((e) => e.entity.toLowerCase()))}
            onCancel={() => setNewOpen(false)}
            onCreate={createContact}
          />
        )}

        <section className={styles.editorPane}>
          <div className={styles.editorHeader}>
            <div className={styles.editorHeaderLeft}>
              <span>{selected ?? 'Select a contact'}</span>
              {selected && state && (
                <select
                  className={styles.kindSelect}
                  value={state.kind}
                  onChange={(e) => updateState({ kind: e.target.value as ContactKind })}
                  title="Kind — written as `- kind: <value>` in the file"
                >
                  {CONTACT_KINDS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              )}
            </div>
            <span>{busy ?? (dirty ? 'Unsaved changes' : '')}</span>
          </div>

          {searchResult && (
            <div className={styles.relations}>
              <div className={styles.relationsHead}>
                <strong>Hits ({searchResult.hits.length})</strong>
                {searchResult.queries.length > 1 && (
                  <> {'  ·  '}<span>{searchResult.queries.length} queries</span></>
                )}
              </div>
              {searchResult.hits.map((h) => (
                <button
                  key={h.entity}
                  className={styles.relationRow}
                  onClick={() => setSelected(h.entity)}
                  title={`${h.matchedQueryCount}/${searchResult.queries.length} queries matched · ${h.totalMatches} total`}
                >
                  <code>{h.entity}</code>
                  {h.nameMatches.length > 0 && <em> (name)</em>}
                  {h.noteMatches.length > 0 && (
                    <span>: {h.noteMatches.map((m) => m.note).join(' · ')}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className={styles.editorBody}>
            {!selected || !state ? (
              <div className={styles.empty}>Pick a contact on the left.</div>
            ) : (
              <>
                <FieldList
                  label="Emails"
                  values={state.fields.emails}
                  onChange={(emails: LabeledValue[]) => updateFields({ emails })}
                  valuePlaceholder="name@example.com"
                  typePlaceholder="work / home"
                />
                <FieldList
                  label="Phones"
                  values={state.fields.phones}
                  onChange={(phones: LabeledValue[]) => updateFields({ phones })}
                  valuePlaceholder="+1 555-0100"
                  typePlaceholder="mobile / work / home"
                />
                <FieldList
                  label="Addresses"
                  values={state.fields.addresses}
                  onChange={(addresses: LabeledValue[]) => updateFields({ addresses })}
                  multiline
                  valuePlaceholder="Street, City, Region"
                  typePlaceholder="home / work"
                />
                <FieldList
                  label="URLs"
                  values={state.fields.urls}
                  onChange={(urls: LabeledValue[]) => updateFields({ urls })}
                  valuePlaceholder="https://example.com"
                  typePlaceholder="homepage / social"
                />
                <OrgList
                  values={state.fields.orgs as OrgEntry[]}
                  onChange={(orgs) => updateFields({ orgs })}
                />
                <div className={styles.fieldGroup}>
                  <div className={styles.fieldGroupHead}>
                    <span className={styles.fieldGroupLabel}>Notes</span>
                    <span className={styles.hint}>One bullet per line. Unrecognized fields stay here unchanged.</span>
                  </div>
                  <textarea
                    className={styles.notesArea}
                    value={state.notesText}
                    onChange={(e) => updateState({ notesText: e.target.value })}
                    placeholder="Freeform notes — one bullet per line"
                    rows={6}
                  />
                </div>
              </>
            )}
          </div>

          <div className={styles.btnRow}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={save}
              disabled={!dirty || busy !== null}
            >
              Save
            </button>
            <button
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={remove}
              disabled={!selected || busy !== null}
            >
              Delete
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

// ── New contact modal ─────────────────────────────────────────────────────

function NewContactModal({
  busy,
  existing,
  onCancel,
  onCreate
}: {
  busy: boolean
  existing: Set<string>
  onCancel: () => void
  onCreate: (entity: string, kind: ContactKind) => void | Promise<void>
}): JSX.Element {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ContactKind>('person')

  const trimmed = name.trim()
  const conflict = trimmed !== '' && existing.has(trimmed.toLowerCase())
  const canSubmit = trimmed !== '' && !conflict && !busy

  const submit = (): void => {
    if (!canSubmit) return
    void onCreate(trimmed, kind)
  }

  return (
    <div className={styles.modalScrim} onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>New contact</span>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.fieldRowVertical} style={{ marginBottom: 12 }}>
            <span className={styles.label}>Name</span>
            <input
              className={styles.input}
              type="text"
              autoFocus
              placeholder="Person, business, website, or other"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                else if (e.key === 'Escape') onCancel()
              }}
            />
            {conflict && (
              <div className={styles.error}>A contact named "{trimmed}" already exists.</div>
            )}
          </div>
          <div className={styles.fieldRowVertical}>
            <span className={styles.label}>Kind</span>
            <div className={styles.kindFilterGrid}>
              {CONTACT_KINDS.map((k) => (
                <label key={k} className={styles.kindFilterRow}>
                  <input
                    type="radio"
                    name="new-contact-kind"
                    checked={kind === k}
                    onChange={() => setKind(k)}
                  />
                  <span className={kindBadgeClass(k)}>{k}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btn} onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={submit}
            disabled={!canSubmit}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
