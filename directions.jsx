// Six brand directions for ProjectRose
// Each direction = { id, name, descriptor, palette, type, Mark, Chrome }
// Mark is a small SVG mark; Chrome is the applied in-app mock (topbar + sidebar + editor body)

// ═════════════════════════════════════════════════════════════
// Shared chrome scaffold — every direction fills this shape so
// options are comparable at a glance.
// ═════════════════════════════════════════════════════════════
function ChromeFrame({ palette, type, children, mark, name, descriptor, chrome }) {
  const { bg, panel, line, textHi, textMid, textLo, accent, tintWarn, tintSaved } = palette;
  const monoFont = type.mono;
  const uiFont = type.ui || type.mono;

  return (
    <div style={{
      width: '100%', height: '100%', background: bg, color: textHi,
      fontFamily: uiFont, fontSize: 12, display: 'flex', flexDirection: 'column',
      letterSpacing: type.letterSpacing || 0,
    }}>
      {/* titlebar (macOS traffic lights + app name) */}
      <div style={{
        height: 32, display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 14px', background: chrome.titlebarBg, borderBottom: `1px solid ${line}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }}/>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }}/>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }}/>
        </div>
        <div style={{
          flex: 1, textAlign: 'center', fontFamily: monoFont, fontSize: 11,
          color: textLo, letterSpacing: 0.3,
        }}>
          {chrome.windowTitle || 'ProjectRose — main.rs'}
        </div>
        <div style={{ width: 54 }}/>
      </div>

      {/* topbar */}
      <div style={{
        height: 40, display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 12, background: chrome.topbarBg,
        borderBottom: `1px solid ${line}`, flexShrink: 0,
      }}>
        {/* brand mark + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {mark}
          </div>
          <div style={{
            fontFamily: type.wordmarkFont || monoFont,
            fontSize: type.wordmarkSize || 12,
            fontWeight: type.wordmarkWeight || 500,
            letterSpacing: type.wordmarkTracking ?? 0.5,
            color: textHi,
            textTransform: type.wordmarkCase || 'none',
          }}>
            {name}
          </div>
          {descriptor && (
            <div style={{
              fontFamily: monoFont, fontSize: 10, color: textLo,
              paddingLeft: 10, marginLeft: 2, borderLeft: `1px solid ${line}`,
              letterSpacing: 0.4,
            }}>{descriptor}</div>
          )}
        </div>

        <div style={{ flex: 1 }}/>

        {/* view toggle (Code / Chat / Git / Docker) */}
        <div style={{
          display: 'flex', background: chrome.toggleBg, borderRadius: chrome.radius,
          padding: 2, gap: 1, border: `1px solid ${chrome.toggleBorder || 'transparent'}`,
        }}>
          {['CODE', 'CHAT', 'GIT', 'DOCK'].map((l, i) => {
            const active = i === 0;
            return (
              <div key={l} style={{
                padding: '4px 10px', borderRadius: chrome.radius - 1,
                fontFamily: monoFont, fontSize: 10, fontWeight: 500, letterSpacing: 0.6,
                background: active ? chrome.toggleActiveBg : 'transparent',
                color: active ? chrome.toggleActiveText : textMid,
              }}>{l}</div>
            );
          })}
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {/* indexing indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: tintSaved,
              boxShadow: `0 0 8px ${tintSaved}`,
            }}/>
            <span style={{ fontFamily: monoFont, fontSize: 10, color: textLo, letterSpacing: 0.4 }}>
              INDEXED
            </span>
          </div>
        </div>
      </div>

      {/* main body — sidebar + editor */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* sidebar / file tree */}
        <div style={{
          width: 200, background: chrome.sidebarBg, borderRight: `1px solid ${line}`,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* section header */}
          <div style={{
            padding: '10px 12px 8px', fontFamily: monoFont, fontSize: 9, fontWeight: 600,
            color: textLo, letterSpacing: 1.4,
          }}>
            {chrome.sidebarHeader || '▾ PROJECTROSE'}
          </div>

          {/* file tree lines */}
          <div style={{ padding: '2px 8px', fontFamily: monoFont, fontSize: 11 }}>
            {[
              { d: 0, name: 'src/', folder: true },
              { d: 1, name: 'main.rs', active: true },
              { d: 1, name: 'editor.rs' },
              { d: 1, name: 'chat.rs', mod: 'M' },
              { d: 1, name: 'git.rs' },
              { d: 0, name: 'README.md' },
              { d: 0, name: 'Cargo.toml', mod: 'U' },
            ].map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 6px', paddingLeft: 6 + f.d * 12,
                borderRadius: chrome.radius - 1,
                background: f.active ? chrome.itemActiveBg : 'transparent',
                color: f.active ? textHi : textMid,
              }}>
                <span style={{ color: textLo, fontSize: 10, width: 8 }}>
                  {f.folder ? '▾' : ' '}
                </span>
                <span style={{ flex: 1 }}>{f.name}</span>
                {f.mod && (
                  <span style={{
                    fontSize: 9, color: f.mod === 'M' ? tintWarn : accent,
                    fontWeight: 600,
                  }}>{f.mod}</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ flex: 1 }}/>

          {/* chat preview at bottom of sidebar */}
          <div style={{
            padding: '10px 12px', borderTop: `1px solid ${line}`,
            fontFamily: monoFont, fontSize: 9, color: textLo, letterSpacing: 1.4,
          }}>
            ▾ {chrome.chatLabel || 'CHAT · SESSION 14'}
          </div>
          <div style={{ padding: '0 12px 12px' }}>
            <div style={{
              fontFamily: monoFont, fontSize: 10, color: textMid,
              lineHeight: 1.5,
            }}>
              <span style={{ color: accent, fontWeight: 600 }}>›</span> refactor the{'\u00A0'}
              <span style={{ color: textHi, background: chrome.codeBg, padding: '0 3px' }}>
                parseBuffer
              </span>{'\u00A0'}fn to…
            </div>
          </div>
        </div>

        {/* editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: chrome.editorBg }}>
          {/* tab bar */}
          <div style={{
            height: 32, display: 'flex', background: chrome.tabBarBg,
            borderBottom: `1px solid ${line}`, flexShrink: 0,
          }}>
            {['main.rs', 'editor.rs', 'chat.rs'].map((t, i) => {
              const active = i === 0;
              return (
                <div key={t} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '0 14px', fontFamily: monoFont, fontSize: 11,
                  color: active ? textHi : textMid,
                  background: active ? chrome.editorBg : 'transparent',
                  borderRight: `1px solid ${line}`,
                  borderTop: active ? `1px solid ${accent}` : '1px solid transparent',
                }}>
                  <span>{t}</span>
                  <span style={{
                    fontSize: 8, width: 6, height: 6, borderRadius: '50%',
                    background: i === 2 ? tintWarn : 'transparent',
                  }}/>
                </div>
              );
            })}
          </div>

          {/* breadcrumb */}
          <div style={{
            padding: '6px 14px', fontFamily: monoFont, fontSize: 10,
            color: textLo, borderBottom: `1px solid ${line}`,
          }}>
            src <span style={{ opacity: 0.5 }}>›</span> main.rs <span style={{ opacity: 0.5 }}>›</span>{' '}
            <span style={{ color: accent }}>fn run()</span>
          </div>

          {/* code body (fake syntax highlight) */}
          <div style={{
            flex: 1, padding: '14px 0', fontFamily: monoFont, fontSize: 12, lineHeight: 1.6,
            overflow: 'hidden',
          }}>
            {children}
          </div>

          {/* status bar */}
          <div style={{
            height: 22, display: 'flex', alignItems: 'center', gap: 14,
            padding: '0 14px', background: chrome.statusBg, borderTop: `1px solid ${line}`,
            fontFamily: monoFont, fontSize: 10, color: textLo, letterSpacing: 0.4,
            flexShrink: 0,
          }}>
            <span style={{ color: accent }}>● main</span>
            <span>UTF-8</span>
            <span>RUST</span>
            <span>LN 42 · COL 18</span>
            <div style={{ flex: 1 }}/>
            <span>{chrome.statusRight || 'ROSE/0.1.0'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// shared fake code body — syntax colors passed in
function CodeBody({ syntax, accent, lineNumColor }) {
  const { kw, ident, str, comment, fn, num } = syntax;
  const L = ({ n, children }) => (
    <div style={{ display: 'flex', gap: 12, padding: '0 14px' }}>
      <span style={{ color: lineNumColor, minWidth: 18, textAlign: 'right', userSelect: 'none' }}>{n}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
  return (
    <>
      <L n="38"><span style={{ color: comment }}>// petal — the smallest unit of change</span></L>
      <L n="39"><span style={{ color: kw }}>pub fn</span> <span style={{ color: fn }}>run</span>() {'-> '}
        <span style={{ color: kw }}>Result</span>{'<()> {'}</L>
      <L n="40">&nbsp;&nbsp;<span style={{ color: kw }}>let</span> <span style={{ color: ident }}>editor</span> = <span style={{ color: fn }}>Editor</span>::<span style={{ color: fn }}>new</span>();</L>
      <L n="41">&nbsp;&nbsp;<span style={{ color: kw }}>let</span> <span style={{ color: ident }}>mut</span> <span style={{ color: ident }}>chat</span> = <span style={{ color: fn }}>Chat</span>::<span style={{ color: fn }}>connect</span>(<span style={{ color: str }}>"anthropic"</span>)?;</L>
      <L n="42">&nbsp;&nbsp;<span style={{ color: ident }}>chat</span>.<span style={{ color: fn }}>attach</span>(&<span style={{ color: ident }}>editor</span>);</L>
      <L n="43"></L>
      <L n="44">&nbsp;&nbsp;<span style={{ color: kw }}>loop</span> {'{'}</L>
      <L n="45">&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: kw }}>match</span> <span style={{ color: ident }}>editor</span>.<span style={{ color: fn }}>tick</span>()? {'{'}</L>
      <L n="46">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: fn }}>Event</span>::<span style={{ color: fn }}>Quit</span> =&gt; <span style={{ color: kw }}>break</span>,</L>
      <L n="47">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: fn }}>Event</span>::<span style={{ color: fn }}>Key</span>(<span style={{ color: ident }}>k</span>) =&gt; <span style={{ color: ident }}>editor</span>.<span style={{ color: fn }}>key</span>(<span style={{ color: ident }}>k</span>),</L>
      <L n="48">&nbsp;&nbsp;&nbsp;&nbsp;{'}'}</L>
      <L n="49">&nbsp;&nbsp;{'}'}</L>
      <L n="50">&nbsp;&nbsp;<span style={{ color: fn }}>Ok</span>(())</L>
      <L n="51">{'}'}</L>
    </>
  );
}

// ═════════════════════════════════════════════════════════════
// 01 — COMPASS ROSE (the navigator)
// Near-black ink, deep oxblood accent, cream highlight.
// Mark: 8-point compass-rose star, needle-thin.
// ═════════════════════════════════════════════════════════════
const D1 = {
  id: 'compass',
  name: 'ProjectRose',
  descriptor: 'COMPASS',
  subtitle: 'The navigator. Near-black ink, oxblood accent, cream highlight. A compass rose that reads as cursor and bearing.',
  palette: {
    bg: '#0f0d0c', panel: '#16130f', line: '#26211d',
    textHi: '#e9e0d0', textMid: '#a89a82', textLo: '#6b5f4e',
    accent: '#b23a3a', tintWarn: '#c99060', tintSaved: '#9fb069',
  },
  type: {
    mono: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
    ui: "'JetBrains Mono', ui-monospace, monospace",
    wordmarkFont: "'JetBrains Mono', ui-monospace, monospace",
    wordmarkSize: 12, wordmarkWeight: 600, wordmarkTracking: 0.8,
    wordmarkCase: 'none',
  },
  chrome: {
    titlebarBg: '#0a0908', topbarBg: '#0f0d0c', sidebarBg: '#0d0b0a',
    editorBg: '#0f0d0c', tabBarBg: '#0a0908', statusBg: '#0a0908',
    toggleBg: '#16130f', toggleBorder: '#26211d',
    toggleActiveBg: '#b23a3a', toggleActiveText: '#f4ece0',
    itemActiveBg: '#1c1814', codeBg: '#1c1814', radius: 2,
    windowTitle: 'ProjectRose/compass — main.rs',
  },
  syntax: { kw: '#b23a3a', ident: '#e9e0d0', str: '#c99060', comment: '#6b5f4e', fn: '#d4a677', num: '#c99060' },
  lineNumColor: '#3d3530',
};
const Mark01 = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2 L13.2 10.8 L22 12 L13.2 13.2 L12 22 L10.8 13.2 L2 12 L10.8 10.8 Z" fill="#b23a3a"/>
    <circle cx="12" cy="12" r="1.3" fill="#e9e0d0"/>
  </svg>
);

// ═════════════════════════════════════════════════════════════
// 02 — PETAL CURVE (the softest one)
// Dusty-rose gradient. Mark: a single closed petal curve.
// Warmer, more humanist feel.
// ═════════════════════════════════════════════════════════════
const D2 = {
  id: 'petal',
  name: 'ProjectRose',
  descriptor: 'PETAL',
  subtitle: 'Dusty rose + cream. A single closed petal as the mark. The warmest, most intimate of the six.',
  palette: {
    bg: '#1a1214', panel: '#201619', line: '#2e2024',
    textHi: '#f0dcdc', textMid: '#c4a8a8', textLo: '#7e6670',
    accent: '#d4859a', tintWarn: '#e0b078', tintSaved: '#9cb896',
  },
  type: {
    mono: "'IBM Plex Mono', ui-monospace, monospace",
    ui: "'IBM Plex Mono', ui-monospace, monospace",
    wordmarkFont: "'IBM Plex Mono', ui-monospace, monospace",
    wordmarkSize: 12, wordmarkWeight: 400, wordmarkTracking: 1.2,
    wordmarkCase: 'lowercase',
  },
  chrome: {
    titlebarBg: '#140c0e', topbarBg: '#1a1214', sidebarBg: '#160f11',
    editorBg: '#1a1214', tabBarBg: '#140c0e', statusBg: '#140c0e',
    toggleBg: '#261a1d', toggleActiveBg: '#d4859a', toggleActiveText: '#1a1214',
    itemActiveBg: '#2a1d21', codeBg: '#2a1d21', radius: 6,
    windowTitle: 'projectrose/petal — main.rs',
    sidebarHeader: '▾ projectrose',
    chatLabel: 'chat · session 14',
    statusRight: 'rose/0.1.0',
  },
  syntax: { kw: '#d4859a', ident: '#f0dcdc', str: '#e0b078', comment: '#7e6670', fn: '#c4a8a8', num: '#e0b078' },
  lineNumColor: '#4a3840',
};
const Mark02 = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* single petal — two bezier arcs meeting at top and bottom */}
    <path d="M12 3 C 18 8, 18 16, 12 21 C 6 16, 6 8, 12 3 Z" fill="#d4859a"/>
    <path d="M12 3 C 14 9, 14 15, 12 21" stroke="#1a1214" strokeWidth="1" fill="none" opacity="0.4"/>
  </svg>
);

// ═════════════════════════════════════════════════════════════
// 03 — CURSOR BLOOM (the typographic one)
// Cream background (light!) with oxblood ink. Among the six, this
// is the "daylight" direction — a printed-editor feel.
// Mark: a blinking-caret that is also a stem and bud.
// ═════════════════════════════════════════════════════════════
const D3 = {
  id: 'bloom',
  name: 'ProjectRose',
  descriptor: 'BLOOM',
  subtitle: 'The daylight direction — cream paper, oxblood ink. The cursor is the stem; the bud is where it blinks.',
  palette: {
    bg: '#f4ede4', panel: '#ece4d8', line: '#d4c9b5',
    textHi: '#2a1a1a', textMid: '#6b4e4a', textLo: '#9a8270',
    accent: '#8a2a3a', tintWarn: '#a8642a', tintSaved: '#5c7a3c',
  },
  type: {
    mono: "'IBM Plex Mono', ui-monospace, monospace",
    ui: "'IBM Plex Mono', ui-monospace, monospace",
    wordmarkFont: "'IBM Plex Mono', ui-monospace, monospace",
    wordmarkSize: 12, wordmarkWeight: 500, wordmarkTracking: 0.4,
    wordmarkCase: 'none',
  },
  chrome: {
    titlebarBg: '#e8dfd0', topbarBg: '#f4ede4', sidebarBg: '#ece4d8',
    editorBg: '#faf5ec', tabBarBg: '#ece4d8', statusBg: '#e8dfd0',
    toggleBg: '#ece4d8', toggleBorder: '#d4c9b5',
    toggleActiveBg: '#8a2a3a', toggleActiveText: '#faf5ec',
    itemActiveBg: '#e0d6c4', codeBg: '#e8dfd0', radius: 3,
    windowTitle: 'ProjectRose/bloom — main.rs',
  },
  syntax: { kw: '#8a2a3a', ident: '#2a1a1a', str: '#5c7a3c', comment: '#9a8270', fn: '#6b4e4a', num: '#a8642a' },
  lineNumColor: '#c4b8a4',
};
const Mark03 = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* stem cursor */}
    <rect x="11" y="10" width="2" height="12" fill="#2a1a1a"/>
    {/* bud — small closed rose */}
    <circle cx="12" cy="6" r="4" fill="#8a2a3a"/>
    <path d="M12 3 C 14 5, 14 7, 12 9 C 10 7, 10 5, 12 3 Z" fill="#6b1a2a" opacity="0.6"/>
    {/* leaf */}
    <path d="M13 15 C 17 14, 18 12, 17 10" stroke="#5c7a3c" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
  </svg>
);

// ═════════════════════════════════════════════════════════════
// 04 — THORN (sharp, brutal, opinionated)
// Deep crimson on near-black. Mark: a thorn/triangular wedge.
// The "loud" direction — most brand-forward, most confident.
// ═════════════════════════════════════════════════════════════
const D4 = {
  id: 'thorn',
  name: 'ProjectRose',
  descriptor: 'THORN',
  subtitle: 'The loud one. Near-black, crimson, a sharp wedge for a mark. Confident, opinionated, a little dangerous.',
  palette: {
    bg: '#0c0a0a', panel: '#120e0e', line: '#2a1a1a',
    textHi: '#f2e4e0', textMid: '#b09890', textLo: '#665048',
    accent: '#c4203a', tintWarn: '#d48048', tintSaved: '#7ca06c',
  },
  type: {
    mono: "'JetBrains Mono', ui-monospace, monospace",
    ui: "'JetBrains Mono', ui-monospace, monospace",
    wordmarkFont: "'JetBrains Mono', ui-monospace, monospace",
    wordmarkSize: 11, wordmarkWeight: 700, wordmarkTracking: 2,
    wordmarkCase: 'uppercase',
  },
  chrome: {
    titlebarBg: '#080606', topbarBg: '#0c0a0a', sidebarBg: '#0a0808',
    editorBg: '#0c0a0a', tabBarBg: '#080606', statusBg: '#080606',
    toggleBg: '#160e0e', toggleActiveBg: '#c4203a', toggleActiveText: '#f2e4e0',
    itemActiveBg: '#1a1010', codeBg: '#1a1010', radius: 0,
    windowTitle: 'PROJECTROSE/THORN — main.rs',
    sidebarHeader: '▾ PROJECTROSE',
    chatLabel: 'CHAT · SESSION 14',
    statusRight: 'ROSE ⌁ 0.1.0',
  },
  syntax: { kw: '#c4203a', ident: '#f2e4e0', str: '#d48048', comment: '#665048', fn: '#e06080', num: '#d48048' },
  lineNumColor: '#332020',
};
const Mark04 = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* thorn — sharp downward wedge with hooked tip */}
    <path d="M4 5 L20 5 L14 20 Z" fill="#c4203a"/>
    <path d="M14 20 L18 13" stroke="#0c0a0a" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// ═════════════════════════════════════════════════════════════
// 05 — HERBARIUM (literary, museum-specimen feel)
// Warm bone paper, sepia-red, olive. Serif-flavored wordmark
// (but still set in mono — italicized mono).
// Mark: numbered specimen tag with a rose silhouette.
// ═════════════════════════════════════════════════════════════
const D5 = {
  id: 'herbarium',
  name: 'ProjectRose',
  descriptor: 'HERBARIUM № 01',
  subtitle: 'A pressed-specimen feel. Bone paper, sepia ink, cataloged. For devs who underline things in books.',
  palette: {
    bg: '#f1ebdf', panel: '#e8e0d0', line: '#ccc0a8',
    textHi: '#2e2418', textMid: '#6b5c44', textLo: '#9c8c6e',
    accent: '#7a2a20', tintWarn: '#a06a20', tintSaved: '#5a6a30',
  },
  type: {
    mono: "'IBM Plex Mono', ui-monospace, monospace",
    ui: "'IBM Plex Mono', ui-monospace, monospace",
    wordmarkFont: "'IBM Plex Mono', ui-monospace, monospace",
    wordmarkSize: 12, wordmarkWeight: 400, wordmarkTracking: 0.2,
    wordmarkCase: 'none',
  },
  chrome: {
    titlebarBg: '#e8e0d0', topbarBg: '#f1ebdf', sidebarBg: '#ebe3d1',
    editorBg: '#f7f2e6', tabBarBg: '#e8e0d0', statusBg: '#e0d6c0',
    toggleBg: '#e8e0d0', toggleBorder: '#ccc0a8',
    toggleActiveBg: '#2e2418', toggleActiveText: '#f1ebdf',
    itemActiveBg: '#dfd4bd', codeBg: '#e0d6c0', radius: 1,
    windowTitle: 'Herbarium № 01 · main.rs',
  },
  syntax: { kw: '#7a2a20', ident: '#2e2418', str: '#5a6a30', comment: '#9c8c6e', fn: '#a06a20', num: '#a06a20' },
  lineNumColor: '#b8ac94',
};
const Mark05 = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* specimen tag — rectangle with tied string hole */}
    <rect x="4" y="5" width="16" height="14" stroke="#2e2418" strokeWidth="1.2" fill="#f7f2e6"/>
    <circle cx="12" cy="8.5" r="0.8" fill="#2e2418"/>
    {/* tiny rose silhouette inside */}
    <circle cx="12" cy="14" r="2.8" fill="#7a2a20"/>
    <path d="M12 11.2 C 13.2 12.2, 13.2 13.8, 12 14.8 C 10.8 13.8, 10.8 12.2, 12 11.2 Z" fill="#5a1a14" opacity="0.5"/>
  </svg>
);

// ═════════════════════════════════════════════════════════════
// 06 — WILD (ASCII / terminal-native / chaotic good)
// Pure terminal. Mark is ASCII. No proper logo — just text.
// Green-on-black with rose accent. The "I live in the shell" take.
// ═════════════════════════════════════════════════════════════
const D6 = {
  id: 'wild',
  name: '[rose]',
  descriptor: 'v0.1.0',
  subtitle: 'ASCII-native. The mark is text. Terminal-first, rose only as accent. For the vim/emacs crowd.',
  palette: {
    bg: '#0a0a08', panel: '#0f0f0c', line: '#1a1a14',
    textHi: '#d8d0b8', textMid: '#948a72', textLo: '#5a5244',
    accent: '#c85668', tintWarn: '#d4b060', tintSaved: '#8ca858',
  },
  type: {
    mono: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
    ui: "'JetBrains Mono', ui-monospace, monospace",
    wordmarkFont: "'JetBrains Mono', ui-monospace, monospace",
    wordmarkSize: 12, wordmarkWeight: 500, wordmarkTracking: 0,
    wordmarkCase: 'lowercase',
  },
  chrome: {
    titlebarBg: '#060604', topbarBg: '#0a0a08', sidebarBg: '#0a0a08',
    editorBg: '#0a0a08', tabBarBg: '#0a0a08', statusBg: '#060604',
    toggleBg: 'transparent', toggleBorder: '#1a1a14',
    toggleActiveBg: '#1a1a14', toggleActiveText: '#c85668',
    itemActiveBg: '#14140f', codeBg: '#14140f', radius: 0,
    windowTitle: '~/projectrose $ rose .',
    sidebarHeader: '── tree ──',
    chatLabel: '── chat ──',
    statusRight: '[rose] 0.1.0',
  },
  syntax: { kw: '#c85668', ident: '#d8d0b8', str: '#8ca858', comment: '#5a5244', fn: '#d4b060', num: '#d4b060' },
  lineNumColor: '#2a2a20',
};
// Mark 6 is ASCII — rendered as text, not SVG
const Mark06 = (
  <div style={{
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 13, color: '#c85668', lineHeight: 1, fontWeight: 700,
  }}>@</div>
);

// ═════════════════════════════════════════════════════════════
// Export
// ═════════════════════════════════════════════════════════════
const DIRECTIONS = [
  { ...D1, Mark: Mark01 },
  { ...D2, Mark: Mark02 },
  { ...D3, Mark: Mark03 },
  { ...D4, Mark: Mark04 },
  { ...D5, Mark: Mark05 },
  { ...D6, Mark: Mark06 },
];

Object.assign(window, { DIRECTIONS, ChromeFrame, CodeBody });
