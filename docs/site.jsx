// ProjectRose · GitHub Pages
// Herbarium-direction landing site

const { useState, useEffect, useRef } = React;

// ─── deckle edge SVG (a torn-paper top, used at section transitions) ───
const DeckleEdge = ({ flip = false, color = H.paperDark }) => (
  <svg
    viewBox="0 0 1200 14" preserveAspectRatio="none"
    style={{
      display: 'block', width: '100%', height: 14,
      transform: flip ? 'scaleY(-1)' : 'none',
    }}
  >
    <path
      d="M0 0 L0 8 L20 6 L40 9 L60 5 L80 8 L100 4 L120 9 L140 6 L160 8 L180 5 L200 9 L220 7 L240 4 L260 8 L280 6 L300 9 L320 5 L340 8 L360 6 L380 9 L400 4 L420 7 L440 9 L460 5 L480 8 L500 6 L520 9 L540 4 L560 7 L580 9 L600 5 L620 8 L640 6 L660 9 L680 4 L700 7 L720 9 L740 5 L760 8 L780 6 L800 9 L820 4 L840 7 L860 9 L880 5 L900 8 L920 6 L940 9 L960 4 L980 7 L1000 9 L1020 5 L1040 8 L1060 6 L1080 9 L1100 4 L1120 7 L1140 9 L1160 5 L1180 8 L1200 6 L1200 0 Z"
      fill={color}
    />
  </svg>
);

// ─── small repeating layout primitives ───
const PlateLabel = ({ n, title, sub, right }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      paddingBottom: 6, borderBottom: `1px solid ${H.line}`,
    }}>
      <div style={{
        fontFamily: H.mono, fontSize: 10, color: H.inkSoft, letterSpacing: 2.4,
      }}>
        PLATE {n} · {title}
      </div>
      {right && (
        <div style={{
          fontFamily: H.mono, fontSize: 10, color: H.inkSoft,
          letterSpacing: 1.4, fontStyle: 'italic',
        }}>{right}</div>
      )}
    </div>
    <div style={{ borderBottom: `1px solid ${H.lineSoft}`, marginTop: 2 }}/>
    {sub && (
      <div style={{
        marginTop: 18, maxWidth: 720, fontFamily: H.mono, fontSize: 14,
        color: H.inkMid, lineHeight: 1.65, fontStyle: 'italic',
      }}>{sub}</div>
    )}
  </div>
);

const Tag = ({ children, color = H.sepia, bg = 'transparent' }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontFamily: H.mono, fontSize: 9, color, letterSpacing: 1.6,
    border: `1px solid ${color}`, padding: '3px 8px',
    background: bg,
  }}>{children}</span>
);

// ═════════════════════════════════════════════════════════════
// TOP NAV — slim bar with mark, links, cataloged stamp
// ═════════════════════════════════════════════════════════════
function NavBar() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: H.paper,
      borderBottom: `1px solid ${H.line}`,
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        position: 'absolute', bottom: -3, left: 0, right: 0, height: 1, background: H.lineSoft,
      }}/>
      <div style={{
        maxWidth: 1280, margin: '0 auto',
        padding: '14px 40px',
        display: 'flex', alignItems: 'center', gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RoseMark size={28} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{
              fontFamily: H.mono, fontSize: 14, fontWeight: 500, color: H.ink, letterSpacing: 0.2,
            }}>
              Project<span style={{ color: H.sepia, fontStyle: 'italic' }}>Rose</span>
            </div>
            <div style={{
              fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.4, marginTop: 2,
            }}>HERBARIUM · № 01</div>
          </div>
        </div>

        <div style={{ width: 1, height: 26, background: H.line, marginLeft: 4 }}/>

        <nav style={{ display: 'flex', gap: 4, fontFamily: H.mono, fontSize: 11 }}>
          {[
            { n: '01', l: 'OVERVIEW',   href: '#overview' },
            { n: '02', l: 'EDITOR',     href: '#editor' },
            { n: '03', l: 'AGENT',      href: '#agent' },
            { n: '04', l: 'HEARTBEAT',  href: '#heartbeat' },
            { n: '05', l: 'EXTENSIONS', href: '#extensions' },
            { n: '06', l: 'INSTALL',    href: '#install' },
          ].map((i) => (
            <a key={i.n} href={i.href} style={{
              padding: '6px 10px', textDecoration: 'none',
              color: H.inkMid, letterSpacing: 1, display: 'flex', gap: 6, alignItems: 'center',
              border: '1px solid transparent', transition: 'all .15s',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = H.line; e.currentTarget.style.color = H.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = H.inkMid; }}
            >
              <span style={{ color: H.inkSoft, fontSize: 9 }}>№{i.n}</span>
              <span>{i.l}</span>
            </a>
          ))}
        </nav>

        <div style={{ flex: 1 }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: H.olive }}/>
            <span style={{ fontFamily: H.mono, fontSize: 10, color: H.inkSoft, letterSpacing: 1.2 }}>
              v0.1.0 · CATALOGED
            </span>
          </div>
          <a
            href="https://github.com/RoseAgent/ProjectRose"
            target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', textDecoration: 'none',
              fontFamily: H.mono, fontSize: 10, fontWeight: 500, letterSpacing: 1.2,
              color: H.paperLight, background: H.ink,
              border: `1px solid ${H.ink}`,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
            <span>GITHUB</span>
          </a>
          <button
            onClick={() => setDark((v) => !v)}
            title={dark ? 'Switch to paper' : 'Switch to dusk'}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', cursor: 'pointer',
              fontFamily: H.mono, fontSize: 10, fontWeight: 500, letterSpacing: 1.4,
              color: H.ink, background: 'transparent',
              border: `1px solid ${H.line}`,
            }}
          >
            <span style={{ fontSize: 11 }}>{dark ? '☾' : '☀'}</span>
            <span>{dark ? 'DUSK' : 'PAPER'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// HERO — left: copy. right: full pressed-bloom illustration.
// ═════════════════════════════════════════════════════════════
function Hero() {
  return (
    <section id="overview" style={{
      position: 'relative', background: H.paper,
      padding: '72px 40px 32px',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        {/* tiny pre-header — like a museum acquisition slip */}
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 36, paddingBottom: 8, borderBottom: `1px solid ${H.line}`,
        }}>
          <div style={{
            fontFamily: H.mono, fontSize: 10, color: H.inkSoft, letterSpacing: 2.4,
          }}>
            PLATE A · FOLIO 01 · ACCESSION No. 0001
          </div>
          <div style={{
            fontFamily: H.mono, fontSize: 10, color: H.inkSoft, letterSpacing: 1.6, fontStyle: 'italic',
          }}>
            collected · 2026-04 · Rosa gallica × cogitans
          </div>
        </div>
        <div style={{ borderBottom: `1px solid ${H.lineSoft}`, marginBottom: 56, marginTop: 2 }}/>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.15fr 1fr',
          gap: 64,
          alignItems: 'center',
        }}>
          {/* LEFT — copy */}
          <div>
            <div style={{
              fontFamily: H.mono, fontSize: 11, color: H.sepia, letterSpacing: 2.4, marginBottom: 18,
              fontWeight: 500,
            }}>
              ☞ AN AI-NATIVE DESKTOP IDE
            </div>

            <h1 style={{
              fontFamily: H.mono, fontSize: 64, fontWeight: 400,
              color: H.ink, letterSpacing: -1.2, lineHeight: 1.02, margin: 0,
            }}>
              An editor where{' '}
              <span style={{
                fontStyle: 'italic', color: H.sepia, fontWeight: 500,
                position: 'relative',
              }}>
                agents
                <svg viewBox="0 0 200 8" preserveAspectRatio="none" style={{
                  position: 'absolute', left: 0, right: 0, bottom: -6, width: '100%', height: 6,
                }}>
                  <path d="M0 4 C 40 2, 80 6, 120 3 C 160 1, 180 5, 200 3" stroke={H.sepia} strokeWidth="1" fill="none"/>
                </svg>
              </span>
              {' '}take real action.
            </h1>

            <p style={{
              marginTop: 36, maxWidth: 540,
              fontFamily: H.mono, fontSize: 15, lineHeight: 1.7, color: H.inkMid,
            }}>
              ProjectRose pairs a full-featured code editor with an open-source agent
              runtime and an extensible plugin ecosystem — so agents can{' '}
              <span style={{ color: H.ink, fontStyle: 'italic' }}>edit code</span>,{' '}
              <span style={{ color: H.ink, fontStyle: 'italic' }}>run commands</span>,{' '}
              <span style={{ color: H.ink, fontStyle: 'italic' }}>manage infrastructure</span>, and{' '}
              <span style={{ color: H.ink, fontStyle: 'italic' }}>communicate</span> on your behalf.
            </p>

            {/* CTAs */}
            <div style={{ display: 'flex', gap: 10, marginTop: 40, alignItems: 'center', flexWrap: 'wrap' }}>
              <a href="#install" style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '14px 22px', textDecoration: 'none',
                fontFamily: H.mono, fontSize: 12, fontWeight: 500, letterSpacing: 1.4,
                color: H.paperLight, background: H.ink,
              }}>
                <span style={{ fontSize: 9, color: H.ochreSoft, letterSpacing: 1.2 }}>№01</span>
                <span>DOWNLOAD · v0.1.0</span>
                <span style={{ marginLeft: 4 }}>↓</span>
              </a>
              <a href="https://github.com/RoseAgent/ProjectRose" target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '13px 22px', textDecoration: 'none',
                fontFamily: H.mono, fontSize: 12, fontWeight: 500, letterSpacing: 1.4,
                color: H.ink, background: 'transparent', border: `1px solid ${H.line}`,
              }}>
                <span style={{ fontSize: 9, color: H.inkSoft, letterSpacing: 1.2 }}>№02</span>
                <span>VIEW SOURCE</span>
                <span style={{ marginLeft: 4, color: H.inkSoft }}>↗</span>
              </a>
              <div style={{
                fontFamily: H.mono, fontSize: 10, color: H.inkSoft, letterSpacing: 1.4,
                paddingLeft: 16, fontStyle: 'italic',
              }}>
                macOS · Windows · Linux
              </div>
            </div>

            {/* meta strip — like the bottom of a herbarium label */}
            <div style={{
              marginTop: 56, paddingTop: 18, borderTop: `1px solid ${H.line}`,
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14,
            }}>
              {[
                { k: 'GENUS',     v: 'Editor + Agent' },
                { k: 'KINGDOM',   v: 'Desktop · Electron' },
                { k: 'HABITAT',   v: 'Local + Cloud LLMs' },
                { k: 'STATUS',    v: 'Cultivated · 0.1.0' },
              ].map((m) => (
                <div key={m.k}>
                  <div style={{
                    fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.6,
                  }}>{m.k}</div>
                  <div style={{
                    fontFamily: H.mono, fontSize: 12, color: H.ink, marginTop: 4, fontStyle: 'italic',
                  }}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — pressed specimen card */}
          <SpecimenCard />
        </div>
      </div>
    </section>
  );
}

// Big herbarium-style specimen card on the right of the hero
function SpecimenCard() {
  return (
    <div style={{
      position: 'relative',
      background: H.paperLight,
      border: `1px solid ${H.line}`,
      padding: '32px 32px 24px',
      boxShadow: H.shadow,
    }}>
      {/* corner mounts (like real herbarium tape) */}
      {[[0,0],[1,0],[0,1],[1,1]].map(([x, y], i) => (
        <div key={i} style={{
          position: 'absolute',
          [x ? 'right' : 'left']: 12,
          [y ? 'bottom' : 'top']: 12,
          width: 28, height: 28,
          background: 'rgba(122,42,32,0.10)',
          transform: `rotate(${x === y ? 45 : -45}deg)`,
        }}/>
      ))}

      {/* the bloom */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '24px 0 18px', position: 'relative',
      }}>
        <div style={{ position: 'relative' }}>
          <RoseMark size={280} />
          {/* faint pressed-bloom shadow */}
          <div style={{
            position: 'absolute', inset: -12,
            background: 'radial-gradient(ellipse at center, rgba(122,42,32,0.06), transparent 70%)',
            zIndex: -1,
          }}/>
        </div>
      </div>

      {/* dotted ruler */}
      <div style={{
        height: 1, borderTop: `1px dashed ${H.lineStrong}`, margin: '12px 0 18px',
      }}/>

      {/* label grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px',
        fontFamily: H.mono, fontSize: 11, color: H.inkMid,
      }}>
        {[
          { k: 'fam.',     v: 'Rosaceae' },
          { k: 'gen.',     v: 'Rosa' },
          { k: 'sp.',      v: <i style={{ color: H.sepia }}>R. gallica × cogitans</i> },
          { k: 'cult.',    v: 'rose-editor 0.1' },
          { k: 'loc.',     v: '~/projects/rose' },
          { k: 'coll.',    v: '2026-04-20' },
        ].map((r) => (
          <div key={r.k} style={{ display: 'flex', gap: 10 }}>
            <span style={{ color: H.inkSoft, minWidth: 38, fontStyle: 'italic' }}>{r.k}</span>
            <span style={{ color: H.ink }}>{r.v}</span>
          </div>
        ))}
      </div>

      {/* signature row */}
      <div style={{
        marginTop: 24, paddingTop: 14, borderTop: `1px solid ${H.lineSoft}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: H.mono, fontSize: 10, color: H.inkSoft, letterSpacing: 1.4,
      }}>
        <span>det. <span style={{ fontStyle: 'italic', color: H.inkMid }}>RoseAgent</span></span>
        <span style={{
          fontFamily: H.mono, fontSize: 10, fontWeight: 500,
          color: H.sepia, border: `1px solid ${H.sepia}`, padding: '2px 8px',
          letterSpacing: 1.4,
        }}>SPECIMEN № 0001</span>
      </div>

      {/* faint stamp watermark */}
      <div style={{
        position: 'absolute', right: 24, bottom: 96,
        fontFamily: H.mono, fontSize: 9, color: 'rgba(122,42,32,0.18)',
        letterSpacing: 2, transform: 'rotate(-12deg)',
        border: '1.5px solid rgba(122,42,32,0.18)', padding: '3px 8px',
        pointerEvents: 'none',
      }}>CATALOGED · APR 2026</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// QUICK STATS — taxonomy strip under hero
// ═════════════════════════════════════════════════════════════
function StatStrip() {
  const items = [
    { k: 'EDITOR ENGINE',   v: 'Monaco',     sub: 'the VS Code core' },
    { k: 'TERMINAL',         v: 'Full PTY',   sub: 'integrated, persistent' },
    { k: 'LANGUAGE SERVERS', v: 'TS · Py',    sub: 'Pyright + tsserver' },
    { k: 'AI PROVIDERS',     v: '4 +',        sub: 'incl. local Ollama' },
    { k: 'EXTENSIONS',       v: 'Open source', sub: 'plugin ecosystem' },
  ];
  return (
    <section style={{ background: H.paperDark, borderTop: `1px solid ${H.line}`, borderBottom: `1px solid ${H.line}` }}>
      <div style={{
        maxWidth: 1280, margin: '0 auto',
        padding: '28px 40px',
        display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      }}>
        {items.map((it, i) => (
          <div key={it.k} style={{
            paddingLeft: i === 0 ? 0 : 24,
            borderLeft: i === 0 ? 'none' : `1px solid ${H.line}`,
          }}>
            <div style={{
              fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.6,
            }}>{it.k}</div>
            <div style={{
              fontFamily: H.mono, fontSize: 22, color: H.ink,
              marginTop: 8, fontWeight: 500, letterSpacing: -0.3,
            }}>{it.v}</div>
            <div style={{
              fontFamily: H.mono, fontSize: 11, color: H.inkMid,
              marginTop: 2, fontStyle: 'italic',
            }}>{it.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════
// EDITOR PLATE — large applied chrome from herbarium.jsx + caption
// ═════════════════════════════════════════════════════════════
function EditorSection() {
  return (
    <section id="editor" style={{ background: H.paper, padding: '88px 40px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <PlateLabel
          n="II"
          title="THE EDITOR"
          right="FIG. 02 · 1440 × 900"
          sub={<>
            Monaco at the heart — syntax highlighting, IntelliSense, quick-open file
            search, and an integrated terminal with full PTY support. Tabs and views
            are <i style={{ color: H.sepia }}>cataloged</i>, not just clicked through.
          </>}
        />

        <div style={{
          display: 'grid',
          gridTemplateColumns: '3fr 1fr',
          gap: 36, alignItems: 'flex-start',
        }}>
          {/* the chrome */}
          <div style={{
            width: '100%', aspectRatio: '16/10', minHeight: 600,
            border: `1px solid ${H.line}`,
            boxShadow: H.shadow, overflow: 'hidden',
          }}>
            <HerbariumChrome />
          </div>

          {/* feature list */}
          <div style={{
            background: H.paperLight, border: `1px solid ${H.line}`,
            padding: '24px 24px',
          }}>
            <div style={{
              fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.6,
              marginBottom: 14,
            }}>FEATURES · A — D</div>

            {[
              { n: 'A', t: 'Monaco editor', d: 'The VS Code engine — syntax highlighting, IntelliSense, quick-open file search.' },
              { n: 'B', t: 'Integrated terminal', d: 'Full PTY support; multiple sessions per project.' },
              { n: 'C', t: 'Language servers', d: 'TypeScript and Python (Pyright) over LSP, out of the box.' },
              { n: 'D', t: 'Session persistence', d: 'Multi-file tabs that survive a restart, per project.' },
            ].map((f, i, arr) => (
              <div key={f.n} style={{
                paddingTop: i === 0 ? 0 : 14,
                paddingBottom: i === arr.length - 1 ? 0 : 14,
                borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${H.lineSoft}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{
                    fontFamily: H.mono, fontSize: 10, color: H.sepia, letterSpacing: 1,
                    fontWeight: 600, minWidth: 14,
                  }}>{f.n}</span>
                  <span style={{
                    fontFamily: H.mono, fontSize: 13, color: H.ink, fontWeight: 500,
                  }}>{f.t}</span>
                </div>
                <div style={{
                  marginLeft: 24, marginTop: 6,
                  fontFamily: H.mono, fontSize: 11, color: H.inkMid, lineHeight: 1.6,
                }}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════
// AGENT PLATE — explains the agent runtime; shows fake chat panel
// ═════════════════════════════════════════════════════════════
function AgentSection() {
  return (
    <section id="agent" style={{
      background: H.vellum, padding: '88px 40px',
      borderTop: `1px solid ${H.line}`, borderBottom: `1px solid ${H.line}`,
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <PlateLabel
          n="III"
          title="THE AGENT RUNTIME"
          right="LIVES NATIVELY IN THE SIDEBAR"
          sub={<>
            Agents in ProjectRose are <i style={{ color: H.sepia }}>tool-use enabled</i> —
            they invoke extensions to act, not just describe actions. Configurable
            per project, with system prompts and session management built in.
          </>}
        />

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.4fr',
          gap: 36, alignItems: 'stretch',
        }}>
          {/* LEFT — three feature cards stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              {
                n: 'i',
                t: 'Configurable per project',
                d: 'System prompts, model selection, and session history all live alongside the code, in .projectrose/.',
                tags: ['SYSTEM PROMPT', 'SESSIONS', 'PER-PROJECT'],
              },
              {
                n: 'ii',
                t: 'Action-oriented',
                d: 'Agents call extension tools directly — file edits, shell commands, container ops, mail — with results streaming back into the conversation.',
                tags: ['TOOL-USE', 'STREAMING'],
              },
              {
                n: 'iii',
                t: 'Reads your project',
                d: 'A background indexer keeps the codebase "cataloged" so the agent always works with up-to-date context.',
                tags: ['INDEXER', 'CONTEXT'],
              },
            ].map((c) => (
              <div key={c.n} style={{
                background: H.paperLight, border: `1px solid ${H.line}`,
                padding: '22px 24px',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8,
                }}>
                  <span style={{
                    fontFamily: H.mono, fontSize: 11, color: H.sepia,
                    fontStyle: 'italic', letterSpacing: 0.5, fontWeight: 500,
                    minWidth: 18,
                  }}>{c.n}.</span>
                  <span style={{
                    fontFamily: H.mono, fontSize: 16, color: H.ink, fontWeight: 500,
                  }}>{c.t}</span>
                </div>
                <div style={{
                  marginLeft: 30, fontFamily: H.mono, fontSize: 12, color: H.inkMid,
                  lineHeight: 1.65,
                }}>{c.d}</div>
                <div style={{ marginLeft: 30, marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.tags.map((t) => <Tag key={t} color={H.olive}>{t}</Tag>)}
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT — fake chat panel mock */}
          <ChatMock />
        </div>
      </div>
    </section>
  );
}

function ChatMock() {
  return (
    <div style={{
      background: H.paperLight, border: `1px solid ${H.line}`,
      display: 'flex', flexDirection: 'column',
      boxShadow: H.shadow, position: 'relative', minHeight: 580,
    }}>
      {/* tag in corner */}
      <div style={{
        position: 'absolute', top: -1, right: 32,
        fontFamily: H.mono, fontSize: 9, fontWeight: 500,
        color: H.paperLight, background: H.sepia,
        padding: '4px 12px', letterSpacing: 1.6,
      }}>SESSION № 14</div>

      {/* header tabs */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${H.line}`,
        background: H.paperDark,
      }}>
        {[
          { l: 'CHAT', n: '01', active: true },
          { l: 'TRANSCRIPT', n: '02' },
        ].map((t, i) => (
          <div key={t.l} style={{
            padding: '12px 18px', display: 'flex', gap: 8, alignItems: 'center',
            background: t.active ? H.paperLight : 'transparent',
            color: t.active ? H.ink : H.inkMid,
            fontFamily: H.mono, fontSize: 11, fontWeight: 500, letterSpacing: 1,
            borderRight: i === 0 ? `1px solid ${H.line}` : 'none',
            borderTop: t.active ? `2px solid ${H.sepia}` : '2px solid transparent',
            position: 'relative', top: -1,
          }}>
            <span style={{ fontSize: 9, color: t.active ? H.sepia : H.inkSoft }}>№{t.n}</span>
            <span>{t.l}</span>
          </div>
        ))}
        <div style={{ flex: 1 }}/>
        <div style={{
          padding: '12px 18px', fontFamily: H.mono, fontSize: 10,
          color: H.inkSoft, letterSpacing: 1, alignSelf: 'center',
          fontStyle: 'italic',
        }}>Rosa × cogitans · v0.1</div>
      </div>

      {/* system prompt */}
      <div style={{
        margin: 16, padding: '10px 14px',
        border: `1px solid ${H.line}`, background: H.paper,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: H.mono, fontSize: 10, color: H.inkSoft, letterSpacing: 1.4,
      }}>
        <span>SYSTEM PROMPT · ROSE-AGENT-DEFAULT</span>
        <span>▾</span>
      </div>

      {/* conversation */}
      <div style={{
        flex: 1, padding: '4px 16px 16px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <ChatBubble who="you" time="10:42" sepia>
          Refactor the <code style={{ background: H.paperDeep, padding: '0 4px', color: H.ink, fontSize: 12 }}>parseBuffer</code> function in <i>src/indexer/watcher.rs</i> to use the new async indexer api.
        </ChatBubble>

        <ChatBubble who="rose" time="10:42">
          Reading <i>src/indexer/watcher.rs</i> and the indexer module…
        </ChatBubble>

        <ToolCall name="fs.read" args="path: src/indexer/watcher.rs" result="237 lines · cached" />
        <ToolCall name="fs.read" args="path: src/indexer/mod.rs"     result="89 lines · cached" />

        <ChatBubble who="rose" time="10:43">
          I&apos;ll switch <code style={{ background: H.paperDeep, padding: '0 4px', color: H.ink, fontSize: 12 }}>parseBuffer</code> to the streaming
          api and add a small backpressure helper. Editing now.
        </ChatBubble>

        <ToolCall name="fs.edit" args="watcher.rs · 18 lines" result="applied · M" status="ok" />
        <ToolCall name="shell.run" args="cargo test --quiet"  result="6 passed · 0 failed" status="ok" />

        <ChatBubble who="rose" time="10:43">
          Done — tests pass. <span style={{ color: H.olive, fontWeight: 500 }}>Heartbeat</span> will commit
          the change on its next run if you don&apos;t need to review first.
        </ChatBubble>
      </div>

      {/* composer */}
      <div style={{
        padding: 14, borderTop: `1px solid ${H.line}`,
        background: H.paperDark, display: 'flex', alignItems: 'flex-end', gap: 10,
      }}>
        <div style={{
          flex: 1, padding: '10px 12px',
          border: `1px solid ${H.line}`, background: H.paperLight,
          fontFamily: H.mono, fontSize: 11, color: H.inkSoft, fontStyle: 'italic',
          minHeight: 36,
        }}>
          Type a message… (Enter to send, Shift+Enter for newline)
        </div>
        <div style={{
          padding: '10px 16px', background: H.ink, color: H.paperLight,
          fontFamily: H.mono, fontSize: 10, letterSpacing: 1.6, fontWeight: 500,
        }}>SEND</div>
      </div>
    </div>
  );
}

function ChatBubble({ who, time, sepia, children }) {
  return (
    <div style={{
      borderLeft: `2px solid ${sepia ? H.sepia : H.olive}`,
      paddingLeft: 12,
    }}>
      <div style={{
        fontFamily: H.mono, fontSize: 10, color: H.inkSoft, letterSpacing: 1.2,
        marginBottom: 4,
      }}>
        <span style={{
          color: sepia ? H.sepia : H.olive, fontWeight: 600, letterSpacing: 0.5,
        }}>{who}</span>
        <span> · {time}</span>
      </div>
      <div style={{
        fontFamily: H.mono, fontSize: 12, color: H.ink, lineHeight: 1.6,
      }}>{children}</div>
    </div>
  );
}

function ToolCall({ name, args, result, status }) {
  return (
    <div style={{
      marginLeft: 14, padding: '8px 12px',
      background: H.paper, border: `1px solid ${H.lineSoft}`,
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: H.mono, fontSize: 10, color: H.inkMid,
    }}>
      <span style={{ color: H.inkSoft, letterSpacing: 1, fontSize: 9 }}>TOOL ↳</span>
      <span style={{ color: H.sepia, fontWeight: 600 }}>{name}</span>
      <span style={{ color: H.inkSoft }}>·</span>
      <span style={{ color: H.inkMid, fontStyle: 'italic' }}>{args}</span>
      <div style={{ flex: 1 }}/>
      {status === 'ok' && <span style={{ color: H.olive, fontWeight: 600 }}>● ok</span>}
      <span style={{ color: H.ink }}>{result}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// HEARTBEAT — periodic background process
// ═════════════════════════════════════════════════════════════
function HeartbeatSection() {
  return (
    <section id="heartbeat" style={{ background: H.paper, padding: '88px 40px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <PlateLabel
          n="IV"
          title="HEARTBEAT"
          right="EVERY 5 MIN · BACKGROUND"
          sub={<>
            A background process runs automatically every few minutes — processing
            deferred notes, executing scheduled tasks, and committing agent-authored
            changes to git. Every run is logged like a <i style={{ color: H.sepia }}>field-note entry</i>.
          </>}
        />

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 36, alignItems: 'flex-start',
        }}>
          {/* LEFT — heartbeat log mock */}
          <HeartbeatLog />

          {/* RIGHT — what it does */}
          <div>
            <div style={{
              background: H.paperLight, border: `1px solid ${H.line}`,
              padding: '28px 30px', position: 'relative',
            }}>
              {/* pulsing dot */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: H.sepia,
                  animation: 'rosePulse 2s ease-in-out infinite',
                }}/>
                <span style={{
                  fontFamily: H.mono, fontSize: 10, color: H.sepia, letterSpacing: 2, fontWeight: 600,
                }}>BEAT · ALIVE</span>
              </div>

              <div style={{
                fontFamily: H.mono, fontSize: 22, color: H.ink, fontWeight: 500,
                lineHeight: 1.3, marginBottom: 14, letterSpacing: -0.2,
              }}>
                The IDE keeps moving when you&apos;re not looking.
              </div>

              <p style={{
                fontFamily: H.mono, fontSize: 12, color: H.inkMid, lineHeight: 1.7,
              }}>
                Heartbeat picks up where you left off. Pin a note for the agent, walk away,
                come back: it&apos;s been read, processed, and the change has been committed
                to a feature branch with a descriptive message.
              </p>

              <div style={{
                marginTop: 22, paddingTop: 16, borderTop: `1px solid ${H.lineSoft}`,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                {[
                  { l: 'Deferred notes',     d: 'queued tasks ↳ executed' },
                  { l: 'Scheduled work',     d: 'cron-like agent jobs' },
                  { l: 'Auto-commits',       d: 'descriptive messages, tagged' },
                  { l: 'Inspector',          d: 'every run · forever' },
                ].map((r) => (
                  <div key={r.l} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    fontFamily: H.mono, fontSize: 12,
                  }}>
                    <span style={{ color: H.ink }}>{r.l}</span>
                    <span style={{
                      flex: 1, margin: '0 10px', borderBottom: `1px dotted ${H.lineStrong}`,
                      transform: 'translateY(-3px)',
                    }}/>
                    <span style={{ color: H.inkSoft, fontStyle: 'italic' }}>{r.d}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* schedule strip */}
            <div style={{
              marginTop: 20, padding: '16px 20px',
              background: H.ink, color: H.paperLight,
              fontFamily: H.mono, fontSize: 11, letterSpacing: 0.2,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{ color: H.ochreSoft, fontSize: 10, letterSpacing: 1.6 }}>NEXT BEAT</span>
              <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                {Array.from({ length: 30 }).map((_, i) => (
                  <span key={i} style={{
                    flex: 1, height: 8, background: i < 22 ? H.sepia : 'rgba(241,235,223,0.18)',
                  }}/>
                ))}
              </div>
              <span style={{ fontStyle: 'italic', color: H.ochreSoft }}>in 1m 12s</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeartbeatLog() {
  const runs = [
    {
      time: 'Apr 25, 10:42:05',  status: 'OK',
      summary: 'Processed 2 deferred notes · 1 commit',
      lines: [
        { t: 'INFO',  c: H.olive, m: 'heartbeat run started' },
        { t: 'NOTE',  c: H.sepia, m: 'pulled "rename indexer types" from queue' },
        { t: 'TOOL',  c: H.ochre, m: 'fs.edit · src/indexer/types.rs · 6 lines' },
        { t: 'TOOL',  c: H.ochre, m: 'shell.run · cargo check · 0 errors' },
        { t: 'GIT',   c: H.olive, m: 'commit a7f1c4 · "rename indexer::Types → idx::Types"' },
        { t: 'NOTE',  c: H.sepia, m: 'pulled "review test flake in chat.rs" from queue' },
        { t: 'INFO',  c: H.inkSoft, m: 'opened review thread #18 · awaiting human' },
        { t: 'OK',    c: H.olive, m: 'run complete · 47s' },
      ],
    },
    {
      time: 'Apr 25, 10:37:00',  status: 'OK',
      summary: 'Nothing to process.',
      lines: [],
    },
  ];

  return (
    <div style={{
      background: H.paperLight, border: `1px solid ${H.line}`,
      boxShadow: H.shadow, position: 'relative', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${H.line}`,
        display: 'flex', alignItems: 'center', gap: 14,
        background: H.paperDark,
      }}>
        <span style={{
          fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.6,
        }}>FIELD LOG · HEARTBEAT</span>
        <div style={{ flex: 1 }}/>
        <button style={{
          fontFamily: H.mono, fontSize: 9, fontWeight: 500, letterSpacing: 1.4,
          padding: '5px 10px', background: H.sepia, color: H.paperLight,
          border: 'none', cursor: 'pointer',
        }}>RUN NOW</button>
      </div>

      {/* runs */}
      <div style={{ display: 'flex' }}>
        {/* sidebar of runs */}
        <div style={{
          width: 200, borderRight: `1px solid ${H.line}`,
          padding: '12px 0', background: H.vellum,
        }}>
          {[
            { t: 'Apr 25, 10:42 AM', active: true },
            { t: 'Apr 25, 10:37 AM' },
            { t: 'Apr 25, 10:32 AM' },
            { t: 'Apr 25, 10:27 AM' },
            { t: 'Apr 25, 10:22 AM' },
            { t: 'Apr 25, 10:17 AM' },
          ].map((r, i) => (
            <div key={i} style={{
              padding: '8px 16px',
              fontFamily: H.mono, fontSize: 11,
              color: r.active ? H.ink : H.inkMid,
              background: r.active ? H.paperDeep : 'transparent',
              borderLeft: r.active ? `2px solid ${H.sepia}` : '2px solid transparent',
              marginLeft: r.active ? -2 : 0,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: r.active ? H.sepia : H.olive,
              }}/>
              {r.t}
            </div>
          ))}
        </div>

        {/* run body */}
        <div style={{ flex: 1, padding: '16px 24px', minHeight: 480 }}>
          <div style={{
            fontFamily: H.mono, fontSize: 11, color: H.inkSoft, letterSpacing: 0.4,
            marginBottom: 4,
          }}>
            # Heartbeat — <span style={{ color: H.ink }}>{runs[0].time}</span>
          </div>
          <div style={{
            fontFamily: H.mono, fontSize: 12, color: H.ink, fontStyle: 'italic',
            marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${H.lineSoft}`,
          }}>{runs[0].summary}</div>

          {runs[0].lines.map((l, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '60px 1fr',
              gap: 12, padding: '4px 0',
              fontFamily: H.mono, fontSize: 11,
            }}>
              <span style={{
                color: l.c, fontWeight: 600, letterSpacing: 1.2, fontSize: 9,
              }}>{l.t}</span>
              <span style={{ color: H.inkMid }}>{l.m}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// EXTENSIONS — open-source plugin ecosystem
// ═════════════════════════════════════════════════════════════
function ExtensionsSection() {
  const exts = [
    { n: '01', name: 'rose-discord', d: 'Read/write Discord channels, DMs, threads — with a native panel inside the IDE.', tag: 'COMM',  installed: true },
    { n: '02', name: 'rose-docker',  d: 'Inspect & control containers without leaving the editor — logs, files, exec.', tag: 'INFRA', installed: true },
    { n: '03', name: 'rose-email',   d: 'Send mail, triage inbox, scan links against URLhaus from the agent.', tag: 'COMM',  installed: true },
  ];
  return (
    <section id="extensions" style={{
      background: H.vellum, padding: '88px 40px',
      borderTop: `1px solid ${H.line}`, borderBottom: `1px solid ${H.line}`,
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <PlateLabel
          n="V"
          title="EXTENSIONS"
          right="AN OPEN-SOURCE PLUGIN ECOSYSTEM"
          sub={<>
            Extensions are the agent&apos;s vocabulary of action. Each one ships a set
            of tools — and, if it likes, a UI panel — that the agent can call directly.
          </>}
        />

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18,
        }}>
          {exts.map((e) => (
            <div key={e.n} style={{
              background: H.paperLight, border: `1px solid ${H.line}`,
              padding: '20px 22px', position: 'relative',
              minHeight: 180, display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                <span style={{
                  fontFamily: H.mono, fontSize: 9, color: H.sepia, letterSpacing: 1.4,
                  fontWeight: 600,
                }}>№{e.n}</span>
                <span style={{
                  fontFamily: H.mono, fontSize: 14, color: H.ink, fontWeight: 500,
                }}>{e.name}</span>
                <div style={{ flex: 1 }}/>
                <Tag color={H.olive}>{e.tag}</Tag>
              </div>

              <div style={{
                fontFamily: H.mono, fontSize: 12, color: H.inkMid, lineHeight: 1.65,
                flex: 1,
              }}>{e.d}</div>

              <div style={{
                marginTop: 16, paddingTop: 12, borderTop: `1px solid ${H.lineSoft}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontFamily: H.mono, fontSize: 10,
              }}>
                <span style={{ color: H.inkSoft, fontStyle: 'italic' }}>
                  rose-extension.json
                </span>
                {e.installed ? (
                  <span style={{
                    color: H.olive, fontWeight: 600, letterSpacing: 1.2,
                    display: 'flex', gap: 6, alignItems: 'center',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: H.olive }}/>
                    INSTALLED
                  </span>
                ) : (
                  <span style={{ color: H.inkSoft, letterSpacing: 1.2 }}>+ INSTALL</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* providers row */}
        <div style={{ marginTop: 56 }}>
          <PlateLabel
            n="VI"
            title="SUPPORTED AI PROVIDERS"
            right="LOCAL OR CLOUD · YOUR CHOICE"
          />
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
          }}>
            {[
              { name: 'Anthropic',     models: 'Claude Opus · Sonnet · Haiku' },
              { name: 'OpenAI',        models: 'GPT-4o · GPT-4 · others' },
              { name: 'Amazon Bedrock',models: 'Claude · Llama · Titan · etc.' },
              { name: 'Ollama',        models: 'Any local model — Llama, Mistral, Gemma…', accent: true },
            ].map((p) => (
              <div key={p.name} style={{
                background: p.accent ? H.ink : H.paperLight,
                color: p.accent ? H.paperLight : H.ink,
                border: `1px solid ${p.accent ? H.ink : H.line}`,
                padding: '20px 22px', position: 'relative',
              }}>
                {p.accent && (
                  <div style={{
                    position: 'absolute', top: -1, right: 16,
                    fontFamily: H.mono, fontSize: 9, fontWeight: 500, letterSpacing: 1.6,
                    background: H.sepia, color: H.paperLight,
                    padding: '3px 10px',
                  }}>RUN LOCALLY</div>
                )}
                <div style={{
                  fontFamily: H.mono, fontSize: 9, letterSpacing: 1.6,
                  color: p.accent ? H.ochreSoft : H.inkSoft, marginBottom: 8,
                }}>PROVIDER</div>
                <div style={{
                  fontFamily: H.mono, fontSize: 18, fontWeight: 500,
                  marginBottom: 10, letterSpacing: -0.2,
                }}>{p.name}</div>
                <div style={{
                  fontFamily: H.mono, fontSize: 11,
                  color: p.accent ? '#cebca0' : H.inkMid, lineHeight: 1.6, fontStyle: 'italic',
                }}>{p.models}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════
// INSTALL — terminal-style
// ═════════════════════════════════════════════════════════════
function InstallSection() {
  const [tab, setTab] = useState('mac');
  const cmds = {
    mac: [
      { p: '$', t: 'git clone https://github.com/RoseAgent/ProjectRose' },
      { p: '$', t: 'cd ProjectRose/ProjectRose' },
      { p: '$', t: 'pnpm install && pnpm dev' },
      { c: '# or download the .dmg from GitHub Releases' },
    ],
    win: [
      { p: 'PS>', t: 'git clone https://github.com/RoseAgent/ProjectRose' },
      { p: 'PS>', t: 'cd ProjectRose\\ProjectRose' },
      { p: 'PS>', t: 'pnpm install; pnpm dev' },
      { c: '# or grab the .exe installer from GitHub Releases' },
    ],
    linux: [
      { p: '$', t: 'git clone https://github.com/RoseAgent/ProjectRose' },
      { p: '$', t: 'cd ProjectRose/ProjectRose' },
      { p: '$', t: 'pnpm install && pnpm dev' },
      { c: '# .AppImage and .deb available on GitHub Releases' },
    ],
    source: [
      { p: '$', t: 'git clone https://github.com/RoseAgent/ProjectRose' },
      { p: '$', t: 'cd ProjectRose/ProjectRose' },
      { p: '$', t: 'pnpm install && pnpm dev' },
    ],
  };
  const tabs = [
    { id: 'mac',    n: '01', l: 'macOS' },
    { id: 'win',    n: '02', l: 'Windows' },
    { id: 'linux',  n: '03', l: 'Linux' },
    { id: 'source', n: '04', l: 'From source' },
  ];

  return (
    <section id="install" style={{ background: H.paper, padding: '88px 40px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <PlateLabel
          n="VII"
          title="CULTIVATION"
          right="GET PROJECTROSE RUNNING LOCALLY"
          sub={<>
            ProjectRose is an open-source Electron app. Install it like any other,
            or build it from the repo.
          </>}
        />

        <div style={{
          display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 28, alignItems: 'flex-start',
        }}>
          {/* terminal */}
          <div style={{
            background: H.ink, color: H.paperLight,
            boxShadow: H.shadow, fontFamily: H.mono,
          }}>
            {/* terminal titlebar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderBottom: `1px solid #3a2e22`,
              background: '#1f1810',
            }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e76d67' }}/>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e4b24d' }}/>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#7fb372' }}/>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#a89a82', letterSpacing: 0.4 }}>
                ~/projects/rose · zsh
              </div>
            </div>

            {/* tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid #3a2e22`, background: '#1a140b' }}>
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding: '10px 16px', background: tab === t.id ? H.ink : 'transparent',
                  color: tab === t.id ? H.paperLight : '#9c8c6e',
                  border: 'none', cursor: 'pointer',
                  fontFamily: H.mono, fontSize: 10, fontWeight: 500, letterSpacing: 1.4,
                  borderRight: '1px solid #3a2e22',
                  borderTop: tab === t.id ? `2px solid ${H.sepia}` : '2px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 8, color: tab === t.id ? H.ochreSoft : '#6b5c44' }}>№{t.n}</span>
                  <span>{t.l}</span>
                </button>
              ))}
            </div>

            {/* body */}
            <div style={{ padding: '20px 18px 24px', minHeight: 220, fontSize: 13, lineHeight: 1.9 }}>
              {cmds[tab].map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  {line.p && <span style={{ color: H.ochreSoft }}>{line.p}</span>}
                  {line.c
                    ? <span style={{ color: '#9c8c6e', fontStyle: 'italic' }}>{line.c}</span>
                    : <span style={{ color: H.paperLight }}>{line.t}</span>}
                </div>
              ))}
              <div style={{ marginTop: 16, color: '#7fb372', display: 'flex', gap: 10 }}>
                <span style={{ color: H.ochreSoft }}>$</span>
                <span>projectrose .</span>
                <span style={{
                  display: 'inline-block', width: 8, height: 14, background: H.paperLight,
                  animation: 'roseBlink 1s steps(2) infinite', verticalAlign: 'middle',
                }}/>
              </div>
            </div>
          </div>

          {/* requirements */}
          <div style={{
            background: H.paperLight, border: `1px solid ${H.line}`, padding: '28px 30px',
          }}>
            <div style={{
              fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.6,
              marginBottom: 12,
            }}>REQUIREMENTS · GROWING CONDITIONS</div>

            <div style={{
              display: 'flex', flexDirection: 'column', gap: 12,
              fontFamily: H.mono, fontSize: 12, color: H.inkMid,
            }}>
              {[
                { k: 'OS',         v: 'macOS 12+ · Win 10+ · any Linux w/ glibc' },
                { k: 'RAM',        v: '8 GB minimum, 16 GB recommended' },
                { k: 'NODE',       v: '20.x (only if building from source)' },
                { k: 'OLLAMA',     v: 'optional · for fully local LLMs' },
                { k: 'GIT',        v: 'required for the heartbeat auto-commit flow' },
              ].map((r) => (
                <div key={r.k} style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 12 }}>
                  <span style={{ color: H.sepia, fontStyle: 'italic', letterSpacing: 0.5 }}>{r.k}</span>
                  <span style={{ color: H.ink }}>{r.v}</span>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: 22, paddingTop: 16, borderTop: `1px solid ${H.lineSoft}`,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <a href="https://github.com/RoseAgent/ProjectRose/releases" target="_blank" rel="noopener noreferrer" style={{
                padding: '12px 14px', textDecoration: 'none',
                background: H.sepia, color: H.paperLight,
                fontFamily: H.mono, fontSize: 11, fontWeight: 500, letterSpacing: 1.2,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>↓ LATEST RELEASE · v0.1.0</span>
                <span>↗</span>
              </a>
              <a href="https://github.com/RoseAgent/ProjectRose#readme" target="_blank" rel="noopener noreferrer" style={{
                padding: '12px 14px', textDecoration: 'none',
                background: 'transparent', color: H.ink,
                border: `1px solid ${H.line}`,
                fontFamily: H.mono, fontSize: 11, fontWeight: 500, letterSpacing: 1.2,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>READ THE FIELD GUIDE</span>
                <span style={{ color: H.inkSoft }}>↗</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════
// FOOTER · COLOPHON
// ═════════════════════════════════════════════════════════════
function Colophon() {
  return (
    <footer style={{
      background: H.paperDark, borderTop: `1px solid ${H.line}`,
      padding: '48px 40px 36px',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 36,
          paddingBottom: 32, borderBottom: `1px solid ${H.line}`,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <RoseMark size={36} />
              <div>
                <div style={{
                  fontFamily: H.mono, fontSize: 16, fontWeight: 500, color: H.ink, letterSpacing: 0.2,
                }}>
                  Project<span style={{ color: H.sepia, fontStyle: 'italic' }}>Rose</span>
                </div>
                <div style={{
                  fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.6, marginTop: 2,
                }}>HERBARIUM · № 01 · v0.1.0</div>
              </div>
            </div>
            <p style={{
              fontFamily: H.mono, fontSize: 11, color: H.inkMid, lineHeight: 1.7,
              maxWidth: 360, fontStyle: 'italic',
            }}>
              An AI-native desktop IDE and agent harness. Open source, MIT-licensed,
              cultivated in the open.
            </p>
          </div>

          {[
            {
              h: 'PROJECT',
              links: [
                { l: 'GitHub',     href: 'https://github.com/RoseAgent/ProjectRose' },
                { l: 'Releases',   href: 'https://github.com/RoseAgent/ProjectRose/releases' },
                { l: 'Issues',     href: 'https://github.com/RoseAgent/ProjectRose/issues' },
                { l: 'Discussions', href: 'https://github.com/RoseAgent/ProjectRose/discussions' },
              ],
            },
            {
              h: 'DOCS',
              links: [
                { l: 'README',         href: 'https://github.com/RoseAgent/ProjectRose#readme' },
                { l: 'Extensions API', href: 'https://github.com/RoseAgent/ProjectRose' },
                { l: 'Heartbeat',      href: '#heartbeat' },
                { l: 'Providers',      href: '#extensions' },
              ],
            },
            {
              h: 'COMMUNITY',
              links: [
                { l: 'Contributing',  href: 'https://github.com/RoseAgent/ProjectRose' },
                { l: 'Code of Conduct', href: 'https://github.com/RoseAgent/ProjectRose' },
                { l: 'License · MIT', href: 'https://github.com/RoseAgent/ProjectRose' },
              ],
            },
          ].map((col) => (
            <div key={col.h}>
              <div style={{
                fontFamily: H.mono, fontSize: 9, color: H.inkSoft, letterSpacing: 1.6,
                marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${H.line}`,
              }}>{col.h}</div>
              {col.links.map((lnk) => (
                <a key={lnk.l} href={lnk.href} target="_blank" rel="noopener noreferrer" style={{
                  display: 'block', padding: '5px 0', textDecoration: 'none',
                  fontFamily: H.mono, fontSize: 12, color: H.ink,
                }}>
                  <span style={{ color: H.sepia, marginRight: 8 }}>—</span>{lnk.l}
                </a>
              ))}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 22, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 12,
          fontFamily: H.mono, fontSize: 10, color: H.inkSoft, letterSpacing: 1.4,
        }}>
          <span>
            COLOPHON · set in <i>IBM Plex Mono</i> · bone paper · sepia, olive, ochre
          </span>
          <span style={{ color: H.sepia, fontStyle: 'italic' }}>Rosa gallica × cogitans · MIT</span>
        </div>
      </div>
    </footer>
  );
}

// ═════════════════════════════════════════════════════════════
// PAGE
// ═════════════════════════════════════════════════════════════
function Page() {
  return (
    <div style={{
      background: H.paper, color: H.ink, fontFamily: H.mono, minHeight: '100vh',
    }}>
      <NavBar />
      <Hero />
      <StatStrip />
      <EditorSection />
      <AgentSection />
      <HeartbeatSection />
      <ExtensionsSection />
      <InstallSection />
      <Colophon />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Page />);
