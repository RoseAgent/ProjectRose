// ═════════════════════════════════════════════════════════════
// PROJECTROSE · HERBARIUM № 01
// Refined direction — full chrome pass
// Palette: bone paper, sepia-red, olive, ochre
// Type: IBM Plex Mono, with italic for Latin / editorial notes
// ═════════════════════════════════════════════════════════════

const H = {
  // ——— palette ———
  paper:      '#f1ebdf',   // warm bone — base bg
  paperLight: '#f7f2e6',   // editor canvas
  paperDark:  '#e8e0d0',   // panels, tabs
  paperDeep:  '#e0d6c0',   // sidebar deep
  vellum:     '#ebe3d1',

  line:       '#d6cbaf',
  lineSoft:   '#e4dac2',
  lineStrong: '#b8ac94',

  ink:        '#2e2418',   // primary text
  inkMid:     '#6b5c44',   // secondary text
  inkSoft:    '#9c8c6e',   // tertiary / muted
  inkWisp:    '#c4b8a0',   // line-number / meta

  sepia:      '#7a2a20',   // accent 1 — flower, active
  sepiaDeep:  '#5a1a14',
  olive:      '#5a6a30',   // accent 2 — stem, saved
  oliveDeep:  '#4a5a26',
  ochre:      '#a06a20',   // accent 3 — modified, warn
  ochreSoft:  '#c4956a',

  stamp:      'rgba(122,42,32,0.12)',
  shadow:     '0 1px 2px rgba(46,36,24,0.06), 0 8px 32px rgba(46,36,24,0.10)',

  // ——— type ———
  mono:       "'IBM Plex Mono', ui-monospace, monospace",
};

// ═════════════════════════════════════════════════════════════
// The refined mark — botanical rose, small, illustrated
// Drawn as nested petals radiating from a center, with a stem + 2 leaves.
// Designed to read at 14px as a circle, at 72px as a small pressed bloom.
// ═════════════════════════════════════════════════════════════
function RoseMark({ size = 64, mono = false, style = {} }) {
  const red   = mono ? H.ink : H.sepia;
  const deep  = mono ? H.ink : H.sepiaDeep;
  const green = mono ? H.ink : H.olive;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={style} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* stem */}
      <path d="M32 36 C 32 42, 33 48, 34 56" stroke={green} strokeWidth="1.3" strokeLinecap="round"/>
      {/* left leaf */}
      <path d="M32 46 C 26 44, 22 46, 20 50 C 24 52, 30 50, 32 48" fill={green} opacity={mono ? 0.4 : 0.85}/>
      <path d="M24 48 L 30 48" stroke={mono ? '#fff' : H.oliveDeep} strokeWidth="0.6" opacity="0.5"/>
      {/* right leaf */}
      <path d="M33 50 C 38 49, 42 51, 43 55 C 39 56, 34 54, 33 52" fill={green} opacity={mono ? 0.4 : 0.7}/>
      <path d="M37 52 L 42 54" stroke={mono ? '#fff' : H.oliveDeep} strokeWidth="0.6" opacity="0.5"/>

      {/* outer petals — 5 around the bloom */}
      <g>
        <path d="M32 8 C 40 10, 44 18, 42 26 C 38 22, 34 18, 32 12 Z" fill={red}/>
        <path d="M50 18 C 52 26, 48 34, 40 36 C 40 30, 42 24, 46 20 Z" fill={red}/>
        <path d="M46 36 C 42 42, 34 42, 30 38 C 34 34, 40 32, 44 34 Z" fill={red} opacity="0.92"/>
        <path d="M18 36 C 14 32, 14 24, 20 20 C 22 26, 22 32, 20 36 Z" fill={red} opacity="0.92"/>
        <path d="M22 10 C 28 8, 34 10, 34 16 C 30 16, 24 16, 22 14 Z" fill={red} opacity="0.9"/>
      </g>

      {/* inner petals — fewer, darker, overlapping */}
      <g>
        <path d="M32 14 C 38 16, 40 22, 38 28 C 34 26, 30 22, 30 16 Z" fill={deep} opacity={mono ? 0.3 : 0.85}/>
        <path d="M26 18 C 22 22, 22 28, 26 32 C 30 28, 30 22, 28 18 Z" fill={deep} opacity={mono ? 0.3 : 0.75}/>
        <path d="M38 30 C 36 34, 30 34, 28 30 C 32 28, 36 28, 38 30 Z" fill={deep} opacity={mono ? 0.35 : 0.9}/>
      </g>

      {/* bloom center */}
      <circle cx="32" cy="25" r="2.4" fill={deep}/>
      <circle cx="32" cy="25" r="0.9" fill={mono ? '#fff' : H.ochreSoft}/>
    </svg>
  );
}

// Lockup — mark + wordmark
function Lockup({ size = 'lg', mono = false }) {
  const cfg = {
    sm: { mark: 20, type: 11, tracking: 0.4, gap: 8 },
    md: { mark: 36, type: 18, tracking: 0.3, gap: 12 },
    lg: { mark: 72, type: 32, tracking: 0.2, gap: 20 },
  }[size];
  const ink = mono ? H.ink : H.ink;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: cfg.gap }}>
      <RoseMark size={cfg.mark} mono={mono} />
      <div>
        <div style={{
          fontFamily: H.mono, fontSize: cfg.type, fontWeight: 500,
          color: ink, letterSpacing: cfg.tracking, lineHeight: 1,
        }}>
          Project<span style={{ color: H.sepia, fontStyle: 'italic' }}>Rose</span>
        </div>
        {size === 'lg' && (
          <div style={{
            marginTop: 10, fontFamily: H.mono, fontSize: 10,
            color: H.inkSoft, letterSpacing: 2,
          }}>HERBARIUM  ·  № 01  ·  v0.1.0</div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// The full applied chrome
// ═════════════════════════════════════════════════════════════
function HerbariumChrome() {
  return (
    <div style={{
      width: '100%', height: '100%', background: H.paper,
      fontFamily: H.mono, fontSize: 12, color: H.ink,
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {/* ─── titlebar (macOS) ─── */}
      <div style={{
        height: 32, display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 10, background: H.paperDark,
        borderBottom: `1px solid ${H.line}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#e76d67', border: `1px solid ${H.line}` }}/>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#e4b24d', border: `1px solid ${H.line}` }}/>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#7fb372', border: `1px solid ${H.line}` }}/>
        </div>
        <div style={{
          flex: 1, textAlign: 'center', fontFamily: H.mono, fontSize: 11,
          color: H.inkMid, letterSpacing: 0.3,
        }}>
          <span style={{ color: H.inkSoft }}>№ 01 ·</span>{' '}
          ProjectRose{' '}
          <span style={{ color: H.inkSoft }}>—</span>{' '}
          ~/rose-editor
        </div>
        <div style={{ width: 54 }}/>
      </div>

      {/* ─── topbar ─── */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 14,
        background: H.paper,
        borderBottom: `1px solid ${H.line}`,
        flexShrink: 0, position: 'relative',
      }}>
        {/* double hairline — museum-label touch */}
        <div style={{ position: 'absolute', bottom: -3, left: 0, right: 0, height: 1, background: H.lineSoft }}/>

        {/* brand lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RoseMark size={24} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{
              fontFamily: H.mono, fontSize: 13, fontWeight: 500,
              color: H.ink, letterSpacing: 0.2,
            }}>
              Project<span style={{ color: H.sepia, fontStyle: 'italic' }}>Rose</span>
            </div>
            <div style={{
              fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.4, marginTop: 2,
            }}>
              № 01 · rose-editor
            </div>
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: H.line, marginLeft: 4 }}/>

        {/* breadcrumb of sorts */}
        <div style={{ fontFamily: H.mono, fontSize: 11, color: H.inkMid, letterSpacing: 0.2 }}>
          <span style={{ color: H.inkSoft }}>src/</span>
          <span style={{ color: H.inkSoft, padding: '0 4px' }}>›</span>
          main.rs
        </div>

        <div style={{ flex: 1 }}/>

        {/* view toggle — specimen labels */}
        <div style={{
          display: 'flex', border: `1px solid ${H.line}`,
          background: H.paperDark,
        }}>
          {[
            { l: 'CODE',  n: '01', active: true },
            { l: 'CHAT',  n: '02' },
            { l: 'GIT',   n: '03' },
            { l: 'DOCK',  n: '04' },
            { l: 'MAIL',  n: '05' },
          ].map((t, i, arr) => (
            <div key={t.l} style={{
              padding: '6px 12px',
              background: t.active ? H.ink : 'transparent',
              color: t.active ? H.paperLight : H.inkMid,
              fontFamily: H.mono, fontSize: 10, fontWeight: 500, letterSpacing: 1,
              borderRight: i < arr.length - 1 ? `1px solid ${H.line}` : 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                fontSize: 8, opacity: 0.6,
                color: t.active ? H.paperLight : H.inkSoft,
              }}>№{t.n}</span>
              <span>{t.l}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 14 }}>
          {/* indexing — "cataloged" */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: H.olive,
            }}/>
            <span style={{ fontFamily: H.mono, fontSize: 10, color: H.inkSoft, letterSpacing: 1.2 }}>
              CATALOGED · 247
            </span>
          </div>
          {/* theme */}
          <div style={{
            fontFamily: H.mono, fontSize: 10, color: H.inkMid, letterSpacing: 1.2,
            border: `1px solid ${H.line}`, padding: '4px 8px',
          }}>☀ PAPER</div>
        </div>
      </div>

      {/* ─── main body ─── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ─── sidebar (file tree + chat) ─── */}
        <div style={{
          width: 240, background: H.vellum,
          borderRight: `1px solid ${H.line}`,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* specimen label — sidebar header */}
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: `1px solid ${H.lineSoft}`,
          }}>
            <div style={{
              fontFamily: H.mono, fontSize: 9, color: H.inkSoft,
              letterSpacing: 1.6, marginBottom: 4,
            }}>SPECIMEN · PLATE A</div>
            <div style={{
              fontFamily: H.mono, fontSize: 12, color: H.ink, fontWeight: 500,
            }}>rose-editor</div>
            <div style={{
              fontFamily: H.mono, fontSize: 10, color: H.inkMid,
              fontStyle: 'italic', marginTop: 2,
            }}>Rosa gallica, rust</div>
          </div>

          {/* file tree */}
          <div style={{ padding: '10px 10px', fontFamily: H.mono, fontSize: 11 }}>
            {[
              { d: 0, n: 'src',          f: true, open: true },
              { d: 1, n: 'main.rs',      active: true },
              { d: 1, n: 'editor.rs' },
              { d: 1, n: 'chat.rs',      mod: 'M' },
              { d: 1, n: 'git.rs' },
              { d: 1, n: 'indexer',      f: true, open: true },
              { d: 2, n: 'mod.rs' },
              { d: 2, n: 'watcher.rs',   mod: 'M' },
              { d: 0, n: 'tests',        f: true },
              { d: 0, n: 'Cargo.toml',   mod: 'U' },
              { d: 0, n: 'README.md' },
            ].map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', paddingLeft: 8 + f.d * 14,
                background: f.active ? H.paperDeep : 'transparent',
                color: f.active ? H.ink : H.inkMid,
                borderLeft: f.active ? `2px solid ${H.sepia}` : '2px solid transparent',
                marginLeft: f.active ? -2 : 0,
              }}>
                <span style={{ color: H.inkSoft, fontSize: 9, width: 8 }}>
                  {f.f ? (f.open ? '▾' : '▸') : ' '}
                </span>
                <span style={{ flex: 1 }}>{f.n}</span>
                {f.mod && (
                  <span style={{
                    fontFamily: H.mono, fontSize: 9, fontWeight: 600,
                    color: f.mod === 'M' ? H.ochre : H.olive,
                    letterSpacing: 0.5,
                  }}>{f.mod}</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ flex: 1 }}/>

          {/* chat section */}
          <div style={{
            borderTop: `1px solid ${H.lineSoft}`,
            padding: '12px 16px 8px',
          }}>
            <div style={{
              fontFamily: H.mono, fontSize: 9, color: H.inkSoft,
              letterSpacing: 1.6, marginBottom: 4,
            }}>CORRESPONDENCE</div>
            <div style={{
              fontFamily: H.mono, fontSize: 10, color: H.inkMid, fontStyle: 'italic',
            }}>Session № 14 — in progress</div>
          </div>
          <div style={{
            margin: '0 12px 12px', padding: 10,
            background: H.paperLight, border: `1px solid ${H.lineSoft}`,
          }}>
            <div style={{
              fontFamily: H.mono, fontSize: 10, color: H.inkMid, lineHeight: 1.55,
            }}>
              <span style={{ color: H.sepia, fontWeight: 600 }}>you</span>
              <span style={{ color: H.inkSoft }}> · 10:42 </span>
              <br/>
              refactor <span style={{ background: H.paperDeep, padding: '0 3px', color: H.ink }}>parseBuffer</span> to use the new indexer api
            </div>
          </div>
        </div>

        {/* ─── editor area ─── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: H.paperLight, minWidth: 0,
        }}>
          {/* tab bar — specimen-numbered */}
          <div style={{
            height: 36, display: 'flex',
            background: H.paperDark,
            borderBottom: `1px solid ${H.line}`, flexShrink: 0,
          }}>
            {[
              { n: '01', f: 'main.rs',   active: true },
              { n: '02', f: 'editor.rs' },
              { n: '03', f: 'chat.rs',   mod: true },
              { n: '04', f: 'Cargo.toml' },
            ].map((t, i) => (
              <div key={t.n} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 16px',
                fontFamily: H.mono, fontSize: 11,
                color: t.active ? H.ink : H.inkMid,
                background: t.active ? H.paperLight : 'transparent',
                borderRight: `1px solid ${H.line}`,
                position: 'relative',
              }}>
                <span style={{
                  fontSize: 9, color: t.active ? H.sepia : H.inkSoft,
                  letterSpacing: 0.5, fontWeight: 500,
                }}>№{t.n}</span>
                <span style={{ fontWeight: t.active ? 500 : 400 }}>{t.f}</span>
                {t.mod && (
                  <span style={{ color: H.ochre, fontSize: 10, marginLeft: -2 }}>●</span>
                )}
                <span style={{ color: H.inkSoft, fontSize: 10, marginLeft: 2 }}>×</span>
                {t.active && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    height: 2, background: H.sepia,
                  }}/>
                )}
              </div>
            ))}
          </div>

          {/* editor breadcrumb / label */}
          <div style={{
            padding: '8px 18px', fontFamily: H.mono, fontSize: 10,
            color: H.inkMid, borderBottom: `1px solid ${H.lineSoft}`,
            background: H.paperLight,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ color: H.inkSoft, letterSpacing: 1 }}>PLATE A · FOLIO</span>
            <span style={{ color: H.inkWisp }}>│</span>
            <span>src / main.rs / <span style={{ color: H.sepia }}>fn run()</span></span>
            <div style={{ flex: 1 }}/>
            <span style={{ color: H.inkSoft, fontStyle: 'italic' }}>collected 2026-04-20</span>
          </div>

          {/* code area */}
          <div style={{
            flex: 1, padding: '16px 0',
            fontFamily: H.mono, fontSize: 12, lineHeight: 1.7,
            overflow: 'hidden', position: 'relative',
          }}>
            {/* very faint "specimen" stamp watermark */}
            <div style={{
              position: 'absolute', right: 36, top: 40,
              fontFamily: H.mono, fontSize: 10, color: H.stamp,
              letterSpacing: 2, transform: 'rotate(-8deg)',
              border: `1.5px solid ${H.stamp}`, padding: '4px 10px',
              pointerEvents: 'none',
            }}>SPECIMEN № 01</div>

            <HerbariumCode />
          </div>

          {/* status bar */}
          <div style={{
            height: 24, display: 'flex', alignItems: 'center', gap: 16,
            padding: '0 16px', background: H.paperDark,
            borderTop: `1px solid ${H.line}`,
            fontFamily: H.mono, fontSize: 10, color: H.inkMid, letterSpacing: 0.5,
            flexShrink: 0,
          }}>
            <span style={{ color: H.sepia, fontWeight: 500 }}>
              <span style={{
                display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                background: H.sepia, marginRight: 6, verticalAlign: 'middle',
              }}/>
              main
            </span>
            <span style={{ color: H.inkSoft }}>│</span>
            <span>UTF-8</span>
            <span style={{ color: H.inkSoft }}>│</span>
            <span>RUST · 2021</span>
            <span style={{ color: H.inkSoft }}>│</span>
            <span>LN 42 · COL 18</span>
            <div style={{ flex: 1 }}/>
            <span style={{ fontStyle: 'italic', color: H.inkSoft }}>cataloged · Rosa gallica</span>
            <span style={{ color: H.inkSoft }}>│</span>
            <span style={{ letterSpacing: 1.2 }}>ROSE · 0.1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Code body with herbarium syntax colors
// ═════════════════════════════════════════════════════════════
function HerbariumCode() {
  const S = {
    kw:      H.sepia,
    ident:   H.ink,
    str:     H.olive,
    comment: H.inkSoft,
    fn:      H.ochre,
    num:     H.ochre,
    type:    H.sepiaDeep,
    lineNum: H.inkWisp,
  };
  const L = ({ n, children }) => (
    <div style={{ display: 'flex', gap: 14, padding: '0 18px' }}>
      <span style={{
        color: S.lineNum, minWidth: 22, textAlign: 'right',
        userSelect: 'none', fontVariantNumeric: 'tabular-nums',
      }}>{n}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
  return (
    <>
      <L n="36"><span style={{ color: S.comment, fontStyle: 'italic' }}>// petal — the smallest unit of change</span></L>
      <L n="37"><span style={{ color: S.comment, fontStyle: 'italic' }}>// Rosa gallica, cultivated</span></L>
      <L n="38"></L>
      <L n="39">
        <span style={{ color: S.kw, fontWeight: 500 }}>pub fn</span>{' '}
        <span style={{ color: S.fn }}>run</span>() {'-> '}
        <span style={{ color: S.type }}>Result</span>{'<()> {'}
      </L>
      <L n="40">&nbsp;&nbsp;<span style={{ color: S.kw, fontWeight: 500 }}>let</span> <span style={{ color: S.ident }}>editor</span> = <span style={{ color: S.type }}>Editor</span>::<span style={{ color: S.fn }}>new</span>();</L>
      <L n="41">&nbsp;&nbsp;<span style={{ color: S.kw, fontWeight: 500 }}>let mut</span> <span style={{ color: S.ident }}>chat</span> = <span style={{ color: S.type }}>Chat</span>::<span style={{ color: S.fn }}>connect</span>(<span style={{ color: S.str }}>"anthropic"</span>)?;</L>
      <L n="42">&nbsp;&nbsp;<span style={{ color: S.ident }}>chat</span>.<span style={{ color: S.fn }}>attach</span>(&<span style={{ color: S.ident }}>editor</span>);</L>
      <L n="43"></L>
      <L n="44">&nbsp;&nbsp;<span style={{ color: S.kw, fontWeight: 500 }}>loop</span> {'{'}</L>
      <L n="45">&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: S.kw, fontWeight: 500 }}>match</span> <span style={{ color: S.ident }}>editor</span>.<span style={{ color: S.fn }}>tick</span>()? {'{'}</L>
      <L n="46">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: S.type }}>Event</span>::<span style={{ color: S.fn }}>Quit</span> {'=>'} <span style={{ color: S.kw, fontWeight: 500 }}>break</span>,</L>
      <L n="47">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: S.type }}>Event</span>::<span style={{ color: S.fn }}>Key</span>(<span style={{ color: S.ident }}>k</span>) {'=>'} <span style={{ color: S.ident }}>editor</span>.<span style={{ color: S.fn }}>key</span>(<span style={{ color: S.ident }}>k</span>),</L>
      <L n="48">&nbsp;&nbsp;&nbsp;&nbsp;{'}'}</L>
      <L n="49">&nbsp;&nbsp;{'}'}</L>
      <L n="50">&nbsp;&nbsp;<span style={{ color: S.fn }}>Ok</span>(())</L>
      <L n="51">{'}'}</L>
    </>
  );
}

// ═════════════════════════════════════════════════════════════
// Mark exploration plate — 4 mark sizes + monochrome
// ═════════════════════════════════════════════════════════════
function MarkPlate() {
  return (
    <div style={{
      background: H.paper, padding: '40px 48px',
      border: `1px solid ${H.line}`,
      position: 'relative',
    }}>
      {/* double-rule museum label header */}
      <div style={{ borderBottom: `1px solid ${H.line}`, paddingBottom: 6, marginBottom: 2 }}>
        <div style={{
          fontFamily: H.mono, fontSize: 9, color: H.inkSoft,
          letterSpacing: 2,
        }}>PLATE I · THE MARK</div>
      </div>
      <div style={{ borderBottom: `1px solid ${H.lineSoft}`, marginBottom: 28 }}/>

      {/* hero lockup */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginBottom: 40 }}>
        <Lockup size="lg" />
      </div>

      {/* size scale */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24,
        paddingTop: 24, borderTop: `1px solid ${H.lineSoft}`,
      }}>
        {[
          { size: 14, label: '14 PX' },
          { size: 20, label: '20 PX' },
          { size: 32, label: '32 PX' },
          { size: 48, label: '48 PX' },
          { size: 64, label: '64 PX' },
        ].map((s) => (
          <div key={s.size} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            <div style={{ height: 72, display: 'flex', alignItems: 'center' }}>
              <RoseMark size={s.size} />
            </div>
            <div style={{
              fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.4,
            }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* monochrome */}
      <div style={{
        marginTop: 28, paddingTop: 24, borderTop: `1px solid ${H.lineSoft}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16,
      }}>
        <div style={{
          background: H.paperLight, padding: 20, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 12, border: `1px solid ${H.lineSoft}`,
        }}>
          <RoseMark size={40} />
          <div style={{
            fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.4,
          }}>FULL COLOR</div>
        </div>
        <div style={{
          background: H.paperLight, padding: 20, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 12, border: `1px solid ${H.lineSoft}`,
        }}>
          <RoseMark size={40} mono />
          <div style={{
            fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.4,
          }}>MONOCHROME</div>
        </div>
        <div style={{
          background: H.ink, padding: 20, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 12,
        }}>
          <div style={{ filter: 'invert(1) hue-rotate(180deg)' }}>
            <RoseMark size={40} />
          </div>
          <div style={{
            fontFamily: H.mono, fontSize: 9, color: H.paper, letterSpacing: 1.4,
          }}>REVERSED</div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Palette plate
// ═════════════════════════════════════════════════════════════
function PalettePlate() {
  const groups = [
    {
      label: 'PAPERS',
      items: [
        { name: 'paper',       hex: H.paper,      fg: H.ink },
        { name: 'paper-light', hex: H.paperLight, fg: H.ink },
        { name: 'paper-dark',  hex: H.paperDark,  fg: H.ink },
        { name: 'paper-deep',  hex: H.paperDeep,  fg: H.ink },
        { name: 'vellum',      hex: H.vellum,     fg: H.ink },
      ],
    },
    {
      label: 'INKS',
      items: [
        { name: 'ink',       hex: H.ink,     fg: H.paper },
        { name: 'ink-mid',   hex: H.inkMid,  fg: H.paper },
        { name: 'ink-soft',  hex: H.inkSoft, fg: H.paper },
        { name: 'ink-wisp',  hex: H.inkWisp, fg: H.ink },
        { name: 'line',      hex: H.line,    fg: H.ink },
      ],
    },
    {
      label: 'BOTANICAL',
      items: [
        { name: 'sepia',      hex: H.sepia,     fg: H.paper },
        { name: 'sepia-deep', hex: H.sepiaDeep, fg: H.paper },
        { name: 'olive',      hex: H.olive,     fg: H.paper },
        { name: 'olive-deep', hex: H.oliveDeep, fg: H.paper },
        { name: 'ochre',      hex: H.ochre,     fg: H.paper },
      ],
    },
  ];

  return (
    <div style={{ background: H.paper, padding: '40px 48px', border: `1px solid ${H.line}` }}>
      <div style={{ borderBottom: `1px solid ${H.line}`, paddingBottom: 6, marginBottom: 2 }}>
        <div style={{ fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 2 }}>
          PLATE II · PALETTE
        </div>
      </div>
      <div style={{ borderBottom: `1px solid ${H.lineSoft}`, marginBottom: 28 }}/>

      {groups.map((g) => (
        <div key={g.label} style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: H.mono, fontSize: 10, color: H.inkMid, letterSpacing: 2,
            marginBottom: 10, fontStyle: 'italic',
          }}>{g.label.toLowerCase()}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {g.items.map((i) => (
              <div key={i.name} style={{
                background: i.hex, padding: '22px 14px',
                border: `1px solid ${H.lineSoft}`,
                display: 'flex', flexDirection: 'column', gap: 32,
                minHeight: 110, color: i.fg,
              }}>
                <div style={{
                  fontFamily: H.mono, fontSize: 11, fontWeight: 500,
                }}>{i.name}</div>
                <div style={{
                  marginTop: 'auto',
                  fontFamily: H.mono, fontSize: 9, letterSpacing: 1, opacity: 0.7,
                }}>{i.hex}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  H, RoseMark, Lockup,
  HerbariumChrome, MarkPlate, PalettePlate,
});
