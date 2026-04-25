var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// renderer.ts
var renderer_exports = {};
__export(renderer_exports, {
  EmailView: () => EmailView,
  PageView: () => EmailView,
  SettingsView: () => EmailSettings,
  manifest: () => rose_extension_default
});
module.exports = __toCommonJS(renderer_exports);

// rose-extension.json
var rose_extension_default = {
  id: "rose-email",
  name: "Email",
  version: "1.0.0",
  description: "IMAP email management",
  author: "ProjectRose",
  navItem: { label: "Email", iconName: "email" },
  provides: {
    pageView: true,
    globalSettings: true,
    agentTools: true,
    main: true,
    tools: [
      {
        name: "list_emails",
        displayName: "List Emails",
        description: "List emails from the configured inbox with folder classification"
      },
      {
        name: "read_email",
        displayName: "Read Email",
        description: "Read the full sanitized body of an email by UID"
      },
      {
        name: "move_email_to_folder",
        displayName: "Move Email to Folder",
        description: "Move an email to inbox, spam, or quarantine"
      },
      {
        name: "delete_email",
        displayName: "Delete Email",
        description: "Permanently delete an email by UID"
      }
    ]
  }
};

// src/renderer/EmailView.tsx
var import_react2 = require("react");

// ../../node_modules/clsx/dist/clsx.mjs
function r(e) {
  var t, f, n = "";
  if ("string" == typeof e || "number" == typeof e) n += e;
  else if ("object" == typeof e) if (Array.isArray(e)) {
    var o = e.length;
    for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
  } else for (f in e) e[f] && (n && (n += " "), n += f);
  return n;
}
function clsx() {
  for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
  return n;
}
var clsx_default = clsx;

// ../../node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = ((createState) => createState ? createStoreImpl(createState) : createStoreImpl);

// ../../node_modules/zustand/esm/react.mjs
var import_react = __toESM(require("react"), 1);
var identity = (arg) => arg;
function useStore(api, selector = identity) {
  const slice = import_react.default.useSyncExternalStore(
    api.subscribe,
    import_react.default.useCallback(() => selector(api.getState()), [api, selector]),
    import_react.default.useCallback(() => selector(api.getInitialState()), [api, selector])
  );
  import_react.default.useDebugValue(slice);
  return slice;
}
var createImpl = (createState) => {
  const api = createStore(createState);
  const useBoundStore = (selector) => useStore(api, selector);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
var create = ((createState) => createState ? createImpl(createState) : createImpl);

// src/renderer/store.ts
var useEmailStore = create((set, get) => ({
  messages: [],
  selectedUid: null,
  body: null,
  loading: false,
  bodyLoading: false,
  error: null,
  activeFolder: "inbox",
  filters: null,
  fetchMessages: async () => {
    set({ loading: true, error: null });
    try {
      const messages = await window.api.invoke("rose-email:fetchMessages");
      set({ messages, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },
  fetchMessage: async (uid) => {
    set({ selectedUid: uid, bodyLoading: true });
    try {
      const result = await window.api.invoke("rose-email:fetchBody", uid);
      set({ body: result.body, bodyLoading: false });
    } catch (err) {
      set({ body: null, bodyLoading: false, error: err.message });
    }
  },
  deleteMessage: async (uid) => {
    await window.api.invoke("rose-email:deleteMessage", uid);
    set((state) => ({
      messages: state.messages.filter((m) => m.uid !== uid),
      selectedUid: state.selectedUid === uid ? null : state.selectedUid,
      body: state.selectedUid === uid ? null : state.body
    }));
  },
  setActiveFolder: (folder) => {
    set({ activeFolder: folder, selectedUid: null, body: null });
  },
  moveToFolder: async (uid, folder) => {
    await window.api.invoke("rose-email:setMessageFolder", uid, folder);
    set((state) => ({
      messages: state.messages.map((m) => m.uid === uid ? { ...m, folder } : m)
    }));
  },
  loadFilters: async () => {
    const filters = await window.api.invoke("rose-email:loadFilters");
    set({ filters });
  },
  saveFilters: async (patch) => {
    const filters = await window.api.invoke("rose-email:saveFilters", patch);
    set({ filters });
  }
}));

// src/renderer/EmailView.tsx
var import_useSettingsStore = require("@renderer/stores/useSettingsStore");
var import_useViewStore = require("@renderer/stores/useViewStore");

// src/renderer/EmailView.module.css
var EmailView_default = {
  container: "EmailView_container",
  toolbar: "EmailView_toolbar",
  toolbarAccount: "EmailView_toolbarAccount",
  toolbarBtn: "EmailView_toolbarBtn",
  toolbarBtnDanger: "EmailView_toolbarBtnDanger",
  split: "EmailView_split",
  sidebar: "EmailView_sidebar",
  folderItem: "EmailView_folderItem",
  folderItemActive: "EmailView_folderItemActive",
  folderItemBtn: "EmailView_folderItemBtn",
  folderName: "EmailView_folderName",
  folderCount: "EmailView_folderCount",
  folderDeleteBtn: "EmailView_folderDeleteBtn",
  folderDivider: "EmailView_folderDivider",
  newFolderRow: "EmailView_newFolderRow",
  newFolderInput: "EmailView_newFolderInput",
  newFolderBtn: "EmailView_newFolderBtn",
  messageSubjectRow: "EmailView_messageSubjectRow",
  injectionBadge: "EmailView_injectionBadge",
  contextMenu: "EmailView_contextMenu",
  contextMenuLabel: "EmailView_contextMenuLabel",
  contextMenuItem: "EmailView_contextMenuItem",
  listPane: "EmailView_listPane",
  listHeader: "EmailView_listHeader",
  list: "EmailView_list",
  messageRow: "EmailView_messageRow",
  messageRowActive: "EmailView_messageRowActive",
  messageSubject: "EmailView_messageSubject",
  messageSubjectUnread: "EmailView_messageSubjectUnread",
  messageMeta: "EmailView_messageMeta",
  bodyPane: "EmailView_bodyPane",
  bodyHeader: "EmailView_bodyHeader",
  bodyHeaderRow: "EmailView_bodyHeaderRow",
  bodyHeaderLabel: "EmailView_bodyHeaderLabel",
  bodyHeaderValue: "EmailView_bodyHeaderValue",
  bodyHeaderSubject: "EmailView_bodyHeaderSubject",
  bodyScroll: "EmailView_bodyScroll",
  bodyText: "EmailView_bodyText",
  empty: "EmailView_empty",
  emptyBtn: "EmailView_emptyBtn",
  errorBanner: "EmailView_errorBanner",
  spinner: "EmailView_spinner",
  bodyEmpty: "EmailView_bodyEmpty"
};

// src/renderer/EmailView.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}
var BUILTIN_FOLDERS = [
  { id: "inbox", name: "Inbox" },
  { id: "spam", name: "Spam" },
  { id: "quarantine", name: "Quarantine" }
];
function EmailView() {
  const imapHost = (0, import_useSettingsStore.useSettingsStore)((s2) => s2.imapHost);
  const imapUser = (0, import_useSettingsStore.useSettingsStore)((s2) => s2.imapUser);
  const setActiveView = (0, import_useViewStore.useViewStore)((s2) => s2.setActiveView);
  const {
    messages,
    selectedUid,
    body,
    loading,
    bodyLoading,
    error,
    activeFolder,
    filters,
    fetchMessages,
    fetchMessage,
    deleteMessage,
    setActiveFolder,
    moveToFolder,
    loadFilters,
    saveFilters
  } = useEmailStore();
  const [contextMenu, setContextMenu] = (0, import_react2.useState)(null);
  const [newFolderInput, setNewFolderInput] = (0, import_react2.useState)("");
  const contextMenuRef = (0, import_react2.useRef)(null);
  const isConfigured = Boolean(imapHost && imapUser);
  (0, import_react2.useEffect)(() => {
    if (isConfigured) {
      fetchMessages();
      loadFilters();
    }
  }, [isConfigured]);
  (0, import_react2.useEffect)(() => {
    function handleClick() {
      setContextMenu(null);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);
  const customFolders = filters?.customFolders ?? [];
  const allFolders = [...BUILTIN_FOLDERS, ...customFolders];
  const filteredMessages = messages.filter((m) => m.folder === activeFolder);
  const selectedMessage = filteredMessages.find((m) => m.uid === selectedUid) ?? null;
  function handleSelectMessage(uid) {
    fetchMessage(uid);
  }
  async function handleDelete() {
    if (selectedUid == null) return;
    await deleteMessage(selectedUid);
  }
  function handleRightClick(e, uid) {
    e.preventDefault();
    setContextMenu({ uid, x: e.clientX, y: e.clientY });
  }
  async function handleMoveToFolder(uid, folder) {
    setContextMenu(null);
    await moveToFolder(uid, folder);
  }
  async function handleAddFolder() {
    const name = newFolderInput.trim();
    if (!name || !filters) return;
    const id = `cf-${Date.now()}`;
    const updated = [...filters.customFolders ?? [], { id, name }];
    await saveFilters({ customFolders: updated });
    setNewFolderInput("");
  }
  async function handleDeleteFolder(id) {
    if (!filters) return;
    const updated = filters.customFolders.filter((f) => f.id !== id);
    await saveFilters({ customFolders: updated });
    const moved = messages.filter((m) => m.folder === id).map((m) => window.api.invoke("rose-email:setMessageFolder", m.uid, "inbox"));
    await Promise.all(moved);
    if (activeFolder === id) setActiveFolder("inbox");
  }
  function getFolderCount(folderId) {
    return messages.filter((m) => m.folder === folderId).length;
  }
  if (!isConfigured) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.container, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.empty, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Configure IMAP credentials in Settings to view email." }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: EmailView_default.emptyBtn, onClick: () => setActiveView("settings"), children: "Open Settings" })
    ] }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.container, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: EmailView_default.toolbarAccount, children: imapUser }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: EmailView_default.toolbarBtn, onClick: () => fetchMessages(), disabled: loading, children: "Refresh" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          className: clsx_default(EmailView_default.toolbarBtn, EmailView_default.toolbarBtnDanger),
          onClick: handleDelete,
          disabled: selectedUid == null || loading,
          children: "Delete"
        }
      )
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.errorBanner, children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.split, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.sidebar, children: [
        BUILTIN_FOLDERS.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            className: clsx_default(EmailView_default.folderItem, activeFolder === f.id && EmailView_default.folderItemActive),
            onClick: () => setActiveFolder(f.id),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: EmailView_default.folderName, children: f.name }),
              getFolderCount(f.id) > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: EmailView_default.folderCount, children: getFolderCount(f.id) })
            ]
          },
          f.id
        )),
        customFolders.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.folderDivider }),
        customFolders.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: clsx_default(EmailView_default.folderItem, activeFolder === f.id && EmailView_default.folderItemActive), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              className: EmailView_default.folderItemBtn,
              onClick: () => setActiveFolder(f.id),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: EmailView_default.folderName, children: f.name }),
                getFolderCount(f.id) > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: EmailView_default.folderCount, children: getFolderCount(f.id) })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: EmailView_default.folderDeleteBtn, onClick: () => handleDeleteFolder(f.id), title: "Remove folder", children: "\u2715" })
        ] }, f.id)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.folderDivider }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.newFolderRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: EmailView_default.newFolderInput,
              placeholder: "New folder\u2026",
              value: newFolderInput,
              onChange: (e) => setNewFolderInput(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") handleAddFolder();
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: EmailView_default.newFolderBtn, onClick: handleAddFolder, disabled: !newFolderInput.trim(), children: "+" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.listPane, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.listHeader, children: allFolders.find((f) => f.id === activeFolder)?.name ?? activeFolder }),
        loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.spinner, children: "Loading\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.list, children: [
          filteredMessages.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.spinner, children: "No messages" }),
          filteredMessages.map((msg) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              className: clsx_default(EmailView_default.messageRow, selectedUid === msg.uid && EmailView_default.messageRowActive),
              onClick: () => handleSelectMessage(msg.uid),
              onContextMenu: (e) => handleRightClick(e, msg.uid),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.messageSubjectRow, children: [
                  msg.injectionDetected && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: EmailView_default.injectionBadge, title: "Potential prompt injection", children: "\u26A0" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: clsx_default(EmailView_default.messageSubject, !msg.read && EmailView_default.messageSubjectUnread), children: msg.subject })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.messageMeta, children: [
                  msg.from,
                  " \xB7 ",
                  formatDate(msg.date)
                ] })
              ]
            },
            msg.uid
          ))
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.bodyPane, children: selectedMessage ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.bodyHeader, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.bodyHeaderSubject, children: selectedMessage.subject }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.bodyHeaderRow, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: EmailView_default.bodyHeaderLabel, children: "From" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: EmailView_default.bodyHeaderValue, children: selectedMessage.from })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: EmailView_default.bodyHeaderRow, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: EmailView_default.bodyHeaderLabel, children: "Date" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: EmailView_default.bodyHeaderValue, children: formatDate(selectedMessage.date) })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.bodyScroll, children: bodyLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.spinner, children: "Loading\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: EmailView_default.bodyText, children: body ?? "" }) })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.bodyEmpty, children: "Select a message to read it" }) })
    ] }),
    contextMenu && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        ref: contextMenuRef,
        className: EmailView_default.contextMenu,
        style: { top: contextMenu.y, left: contextMenu.x },
        onClick: (e) => e.stopPropagation(),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: EmailView_default.contextMenuLabel, children: "Move to folder" }),
          allFolders.filter((f) => f.id !== messages.find((m) => m.uid === contextMenu.uid)?.folder).map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: EmailView_default.contextMenuItem,
              onClick: () => handleMoveToFolder(contextMenu.uid, f.id),
              children: f.name
            },
            f.id
          ))
        ]
      }
    )
  ] });
}

// src/renderer/EmailSettings.tsx
var import_react3 = require("react");
var import_useSettingsStore2 = require("@renderer/stores/useSettingsStore");
var import_jsx_runtime2 = require("react/jsx-runtime");
var s = {
  section: { marginBottom: 24 },
  title: { fontSize: 11, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 12 },
  card: { display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md, 6px)", background: "var(--color-bg-secondary)" },
  label: { fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginTop: 4 },
  desc: { fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.5 },
  input: { width: "100%", padding: "6px 10px", background: "var(--color-input-bg, var(--color-bg))", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm, 4px)", color: "var(--color-text-primary)", fontSize: 13, boxSizing: "border-box" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0" },
  rowFlex: { display: "flex", gap: 8, alignItems: "center" },
  btn: { padding: "6px 14px", background: "var(--color-button-bg, var(--color-bg-secondary))", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm, 4px)", color: "var(--color-text-primary)", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
  btnDanger: { color: "var(--color-error, #e55)" },
  tagBadge: { fontSize: 11, padding: "2px 8px", background: "var(--color-bg-tertiary, var(--color-bg-secondary))", border: "1px solid var(--color-border)", borderRadius: "3px", color: "var(--color-text-muted)" },
  testOk: { fontSize: 12, color: "var(--color-success, #3a3)", fontWeight: 500 },
  testFail: { fontSize: 12, color: "var(--color-error, #e55)" },
  checkbox: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", cursor: "pointer" },
  select: { padding: "6px 10px", background: "var(--color-input-bg, var(--color-bg))", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm, 4px)", color: "var(--color-text-primary)", fontSize: 13 }
};
function EmailSettings() {
  const { imapHost, imapPort, imapUser, imapPassword, imapTLS, update } = (0, import_useSettingsStore2.useSettingsStore)();
  const [testState, setTestState] = (0, import_react3.useState)("idle");
  const [testError, setTestError] = (0, import_react3.useState)("");
  const [filters, setFilters] = (0, import_react3.useState)(null);
  const [newSpamType, setNewSpamType] = (0, import_react3.useState)("sender");
  const [newSpamValue, setNewSpamValue] = (0, import_react3.useState)("");
  const [newInjectionPattern, setNewInjectionPattern] = (0, import_react3.useState)("");
  const [newInjectionIsRegex, setNewInjectionIsRegex] = (0, import_react3.useState)(false);
  const loadFilters = (0, import_react3.useCallback)(async () => {
    try {
      const f = await window.api.invoke("rose-email:loadFilters");
      setFilters(f);
    } catch {
    }
  }, []);
  (0, import_react3.useEffect)(() => {
    loadFilters();
  }, [loadFilters]);
  async function saveFilters(patch) {
    const updated = await window.api.invoke("rose-email:saveFilters", patch);
    setFilters(updated);
  }
  async function testConnection() {
    setTestState("testing");
    setTestError("");
    const result = await window.api.invoke("rose-email:testConnection");
    setTestState(result.ok ? "ok" : "fail");
    if (!result.ok) setTestError(result.error ?? "Connection failed");
  }
  const spamRules = filters?.spamRules ?? [];
  const injectionPatterns = filters?.injectionPatterns ?? [];
  const customFolders = filters?.customFolders ?? [];
  async function addSpamRule() {
    const value = newSpamValue.trim();
    if (!value) return;
    await saveFilters({ spamRules: [...spamRules, { id: `sr-${Date.now()}`, type: newSpamType, value, enabled: true }] });
    setNewSpamValue("");
  }
  async function addInjectionPattern() {
    const value = newInjectionPattern.trim();
    if (!value) return;
    await saveFilters({ injectionPatterns: [...injectionPatterns, { id: `ip-${Date.now()}`, pattern: value, isRegex: newInjectionIsRegex, enabled: true, builtin: false }] });
    setNewInjectionPattern("");
    setNewInjectionIsRegex(false);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: s.section, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: s.title, children: "Email (IMAP)" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: s.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: s.label, children: "Server" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "input",
            {
              style: { ...s.input, flex: 1 },
              type: "text",
              placeholder: "imap.gmail.com",
              value: imapHost,
              onChange: (e) => {
                update({ imapHost: e.target.value });
                setTestState("idle");
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "input",
            {
              style: { ...s.input, width: 80 },
              type: "number",
              placeholder: "993",
              value: imapPort,
              onChange: (e) => {
                update({ imapPort: Number(e.target.value) });
                setTestState("idle");
              }
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: s.label, children: "Email Address" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            style: s.input,
            type: "text",
            placeholder: "you@example.com",
            value: imapUser,
            onChange: (e) => {
              update({ imapUser: e.target.value });
              setTestState("idle");
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: s.label, children: "Password / App Password" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            style: s.input,
            type: "password",
            placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
            value: imapPassword,
            onChange: (e) => {
              update({ imapPassword: e.target.value });
              setTestState("idle");
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: s.checkbox, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: imapTLS, onChange: (e) => update({ imapTLS: e.target.checked }) }),
          "Use TLS (recommended)"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: s.rowFlex, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { style: s.btn, onClick: testConnection, disabled: testState === "testing" || !imapHost || !imapUser, children: testState === "testing" ? "Testing\u2026" : "Test Connection" }),
          testState === "ok" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: s.testOk, children: "Connected" }),
          testState === "fail" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: s.testFail, children: testError })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: s.section, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: s.title, children: "Spam Rules" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { ...s.desc, marginBottom: 10 }, children: "Emails matching any rule go to Spam immediately, skipping AI classification." }),
      spamRules.map((rule) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: s.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center", flex: 1 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: s.tagBadge, children: rule.type }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 13, color: "var(--color-text-primary)" }, children: rule.value })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: s.rowFlex, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { style: s.btn, onClick: () => saveFilters({ spamRules: spamRules.map((r2) => r2.id === rule.id ? { ...r2, enabled: !r2.enabled } : r2) }), children: rule.enabled ? "Disable" : "Enable" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { style: { ...s.btn, ...s.btnDanger }, onClick: () => saveFilters({ spamRules: spamRules.filter((r2) => r2.id !== rule.id) }), children: "Remove" })
        ] })
      ] }, rule.id)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...s.rowFlex, marginTop: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { style: s.select, value: newSpamType, onChange: (e) => setNewSpamType(e.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "sender", children: "Sender" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "domain", children: "Domain" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "subject", children: "Subject" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            style: { ...s.input, flex: 1 },
            type: "text",
            placeholder: newSpamType === "domain" ? "example.com" : newSpamType === "sender" ? "spam@example.com" : "limited time offer",
            value: newSpamValue,
            onChange: (e) => setNewSpamValue(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") addSpamRule();
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { style: s.btn, onClick: addSpamRule, disabled: !newSpamValue.trim(), children: "+ Add" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: s.section, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: s.title, children: "Injection Filters" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { ...s.desc, marginBottom: 10 }, children: "Emails matching any pattern are quarantined. Built-in patterns detect common prompt injection phrases." }),
      injectionPatterns.map((p) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: s.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { flex: 1, fontSize: 13, color: "var(--color-text-primary)", display: "flex", gap: 6, alignItems: "center" }, children: [
          p.pattern,
          p.isRegex && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: s.tagBadge, children: "regex" }),
          p.builtin && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: s.tagBadge, children: "built-in" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: s.rowFlex, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { style: s.btn, onClick: () => saveFilters({ injectionPatterns: injectionPatterns.map((ip) => ip.id === p.id ? { ...ip, enabled: !ip.enabled } : ip) }), children: p.enabled ? "Disable" : "Enable" }),
          !p.builtin && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { style: { ...s.btn, ...s.btnDanger }, onClick: () => saveFilters({ injectionPatterns: injectionPatterns.filter((ip) => ip.id !== p.id) }), children: "Remove" })
        ] })
      ] }, p.id)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...s.rowFlex, marginTop: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            style: { ...s.input, flex: 1, minWidth: 180 },
            type: "text",
            placeholder: "Pattern text or regex\u2026",
            value: newInjectionPattern,
            onChange: (e) => setNewInjectionPattern(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") addInjectionPattern();
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: s.checkbox, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: newInjectionIsRegex, onChange: (e) => setNewInjectionIsRegex(e.target.checked) }),
          "Regex"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { style: s.btn, onClick: addInjectionPattern, disabled: !newInjectionPattern.trim(), children: "+ Add" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: s.section, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: s.title, children: "Folders" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: s.desc, children: [
        "Custom folders are created and managed from the folder sidebar in the Email view.",
        customFolders.length === 0 ? " No custom folders yet." : ` ${customFolders.length} custom folder${customFolders.length === 1 ? "" : "s"}: ${customFolders.map((f) => f.name).join(", ")}.`
      ] })
    ] })
  ] });
}
