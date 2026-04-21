import type { editor } from 'monaco-editor'

export const roseDarkTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'cba6f7' },
    { token: 'string', foreground: 'a6e3a1' },
    { token: 'number', foreground: 'fab387' },
    { token: 'type', foreground: 'f9e2af' },
    { token: 'function', foreground: '89b4fa' },
    { token: 'variable', foreground: 'cdd6f4' },
    { token: 'constant', foreground: 'fab387' },
    { token: 'operator', foreground: '89dceb' }
  ],
  colors: {
    'editor.background': '#1e1e2e',
    'editor.foreground': '#cdd6f4',
    'editor.lineHighlightBackground': '#313244',
    'editor.selectionBackground': '#45475a',
    'editor.inactiveSelectionBackground': '#313244',
    'editorCursor.foreground': '#f5e0dc',
    'editorWhitespace.foreground': '#45475a',
    'editorIndentGuide.background': '#313244',
    'editorIndentGuide.activeBackground': '#45475a',
    'editorLineNumber.foreground': '#6c7086',
    'editorLineNumber.activeForeground': '#cdd6f4',
    'editor.findMatchBackground': '#f9e2af40',
    'editor.findMatchHighlightBackground': '#f9e2af20',
    'editorGutter.background': '#1e1e2e',
    'minimap.background': '#181825',
    'scrollbarSlider.background': '#31324480',
    'scrollbarSlider.hoverBackground': '#45475a80',
    'scrollbarSlider.activeBackground': '#585b7080'
  }
}

// Herbarium palette — bone paper, sepia ink, olive & ochre accents
// All colors derived strictly from the Herbarium design token set
export const roseHerbariumTheme: editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: false,
  rules: [
    { token: '',          foreground: '2e2418' },                       // ink — base text
    { token: 'comment',  foreground: '9c8c6e', fontStyle: 'italic' },   // inkSoft
    { token: 'keyword',  foreground: '7a2a20', fontStyle: 'bold' },     // sepia
    { token: 'string',   foreground: '5a6a30' },                        // olive
    { token: 'number',   foreground: 'a06a20' },                        // ochre
    { token: 'type',     foreground: 'a06a20', fontStyle: 'italic' },   // ochre italic
    { token: 'function', foreground: '6b5c44' },                        // inkMid
    { token: 'variable', foreground: '2e2418' },                        // ink
    { token: 'constant', foreground: 'a06a20' },                        // ochre
    { token: 'operator', foreground: '7a2a20' },                        // sepia
    { token: 'regexp',   foreground: 'b23838' },                        // error red
    { token: 'tag',      foreground: '7a2a20' },                        // sepia
    { token: 'attribute.name',  foreground: '6b5c44' },                 // inkMid
    { token: 'attribute.value', foreground: '5a6a30' },                 // olive
  ],
  colors: {
    'editor.background':                '#f1ebdf',  // paper
    'editor.foreground':                '#2e2418',  // ink
    'editor.lineHighlightBackground':   '#e8e0d0',  // paperDark
    'editor.selectionBackground':       '#d6cbaf',  // line
    'editor.inactiveSelectionBackground': '#e4dbc6', // lineSoft
    'editorCursor.foreground':          '#7a2a20',  // sepia
    'editorWhitespace.foreground':      '#d6cbaf',  // line
    'editorIndentGuide.background1':    '#e4dbc6',  // lineSoft
    'editorIndentGuide.activeBackground1': '#d6cbaf', // line
    'editorLineNumber.foreground':      '#9c8c6e',  // inkSoft
    'editorLineNumber.activeForeground': '#6b5c44', // inkMid
    'editor.findMatchBackground':       '#a06a2040',
    'editor.findMatchHighlightBackground': '#a06a2020',
    'editorGutter.background':          '#f1ebdf',  // paper
    'minimap.background':               '#e8e0d0',  // paperDark
    'scrollbarSlider.background':       '#d6cbaf80', // line
    'scrollbarSlider.hoverBackground':  '#b8ac9480', // lineStrong
    'scrollbarSlider.activeBackground': '#9c8c6e80', // inkSoft
    'editorBracketMatch.background':    '#d6cbaf',  // line
    'editorBracketMatch.border':        '#7a2a20',  // sepia
    'editor.wordHighlightBackground':   '#e8e0d0',  // paperDark
    'editor.wordHighlightStrongBackground': '#e4dbc6', // lineSoft
    'editorError.foreground':           '#b23838',
    'editorWarning.foreground':         '#a06a20',  // ochre
    'editorInfo.foreground':            '#5a6a30',  // olive
  }
}
