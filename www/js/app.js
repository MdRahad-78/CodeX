import {
  EditorView, basicSetup, keymap
} from 'https://esm.sh/@codemirror/view@6.34.1';
import { EditorState } from 'https://esm.sh/@codemirror/state@6.4.1';
import {
  defaultKeymap, history, historyKeymap, indentWithTab
} from 'https://esm.sh/@codemirror/commands@6.7.0';
import {
  syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput
} from 'https://esm.sh/@codemirror/language@6.10.3';
import {
  autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap
} from 'https://esm.sh/@codemirror/autocomplete@6.18.0';
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript@6.2.2';
import { python } from 'https://esm.sh/@codemirror/lang-python@6.1.6';
import { cpp } from 'https://esm.sh/@codemirror/lang-cpp@6.0.2';
import { html } from 'https://esm.sh/@codemirror/lang-html@6.4.9';

// ===== STATE =====
const state = {
  editorView: null,
  tabs: new Map(),
  activeTabId: null,
  fileContents: new Map(),
  sidebarOpen: true,
  currentPath: '',
};

// ===== FILE SYSTEM =====
async function listDirectory(path) {
  return new Promise((resolve, reject) => {
    window.resolveLocalFileSystemURL(path, (dirEntry) => {
      const reader = dirEntry.createReader();
      reader.readEntries((entries) => {
        const files = entries.map(e => ({
          name: e.name,
          path: e.toURL(),
          isDirectory: e.isDirectory,
          entry: e,
        }));
        resolve(files.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        }));
      }, reject);
    }, reject);
  });
}

async function readFile(path) {
  return new Promise((resolve, reject) => {
    window.resolveLocalFileSystemURL(path, (fileEntry) => {
      fileEntry.file((file) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
      }, reject);
    }, reject);
  });
}

async function writeFile(path, content) {
  return new Promise((resolve, reject) => {
    window.resolveLocalFileSystemURL(path, (fileEntry) => {
      fileEntry.createWriter((writer) => {
        writer.onwriteend = resolve;
        writer.onerror = reject;
        writer.truncate(0);
        writer.write(new Blob([content], { type: 'text/plain' }));
      }, reject);
    }, reject);
  });
}

function detectLanguage(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map = {
    js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    py: 'python', c: 'c', cpp: 'cpp', h: 'cpp', hpp: 'cpp',
    html: 'html', htm: 'html', css: 'css', json: 'json', md: 'markdown', txt: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

function generateTabId(path) {
  return btoa(path).replace(/[^a-zA-Z0-9]/g, '');
}

function getLanguageExtension(language) {
  switch (language) {
    case 'javascript': return javascript();
    case 'typescript': return javascript({ typescript: true });
    case 'python': return python();
    case 'c': case 'cpp': return cpp();
    case 'html': return html();
    default: return [];
  }
}

// ===== EDITOR =====
function createEditor(content = '', language = 'plaintext') {
  const container = document.getElementById('editor-container');
  if (!container) return;

  if (state.editorView) {
    state.editorView.destroy();
  }

  const extensions = [
    basicSetup,
    history(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle),
    getLanguageExtension(language),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...closeBracketsKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && state.activeTabId) {
        const tab = state.tabs.get(state.activeTabId);
        if (tab) {
          tab.isModified = true;
          updateTabUI(tab);
        }
      }
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      updateStatusBar(line.number, pos - line.from + 1, update.state.doc.lines, language);
    }),
    EditorView.theme({
      '&': { backgroundColor: '#202020', color: '#D4D4D4' },
      '&.cm-focused': { outline: 'none' },
      '.cm-content': { padding: '8px 0', caretColor: '#0078D4' },
      '.cm-gutters': { backgroundColor: '#1C1C1C', color: '#808080', border: 'none' },
      '.cm-activeLineGutter': { backgroundColor: '#2D2D2D', color: '#D4D4D4' },
      '.cm-activeLine': { backgroundColor: '#2A2D2E' },
      '.cm-selectionBackground': { backgroundColor: '#264F78' },
      '.cm-cursor': { borderLeftColor: '#0078D4' },
    }),
  ];

  state.editorView = new EditorView({
    state: EditorState.create({ doc: content, extensions }),
    parent: container,
  });
}

function insertText(text) {
  if (!state.editorView) return;
  const sel = state.editorView.state.selection.main;
  const insert = text === 'Tab' ? '    ' : text;
  state.editorView.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: { anchor: sel.from + insert.length },
  });
  state.editorView.focus();
}

// ===== TABS =====
function addTab(tab) {
  state.tabs.set(tab.id, tab);
  renderTabs();
  setActiveTab(tab.id);
}

function removeTab(id) {
  if (state.activeTabId === id) {
    const tabs = Array.from(state.tabs.keys());
    const idx = tabs.indexOf(id);
    state.activeTabId = tabs[idx - 1] ?? tabs[idx + 1] ?? null;
    if (state.activeTabId) {
      setActiveTab(state.activeTabId);
    } else if (state.editorView) {
      state.editorView.dispatch({
        changes: { from: 0, to: state.editorView.state.doc.length, insert: '' },
      });
    }
  }
  state.tabs.delete(id);
  state.fileContents.delete(id);
  renderTabs();
}

function setActiveTab(id) {
  state.activeTabId = id;
  const tab = state.tabs.get(id);
  if (!tab) return;

  const content = state.fileContents.get(id) ?? '';
  if (state.editorView) {
    state.editorView.dispatch({
      changes: { from: 0, to: state.editorView.state.doc.length, insert: content },
    });
  }
  renderTabs();
}

function renderTabs() {
  const container = document.getElementById('tabs-container');
  if (!container) return;
  container.innerHTML = '';

  state.tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = `tab-item${tab.id === state.activeTabId ? ' active' : ''}`;
    el.innerHTML = `
      <span class="tab-name">${tab.name}</span>
      ${tab.isModified ? '<span class="tab-modified">*</span>' : ''}
      <button class="tab-close">&times;</button>
    `;
    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) setActiveTab(tab.id);
    });
    el.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      removeTab(tab.id);
    });
    container.appendChild(el);
  });
}

function updateTabUI(tab) {
  const el = document.querySelector(`.tab-item[data-tab-id="${tab.id}"]`);
  if (el) {
    const mod = el.querySelector('.tab-modified');
    if (mod) mod.style.display = tab.isModified ? 'inline' : 'none';
  }
}

// ===== STATUS BAR =====
function updateStatusBar(line, col, total, language) {
  document.getElementById('status-position').textContent = `Ln ${line}, Col ${col}`;
  document.getElementById('status-lines').textContent = `${total} lines`;
  document.getElementById('status-language').textContent = language;
}

// ===== SIDEBAR =====
async function loadDirectory(path) {
  state.currentPath = path;
  const tree = document.getElementById('file-tree');
  if (!tree) return;
  tree.innerHTML = '';

  try {
    const files = await listDirectory(path);
    files.forEach(file => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = `
        <span class="file-icon">${file.isDirectory ? '\u25B8' : '\u25A1'}</span>
        <span class="file-name">${file.name}</span>
      `;
      item.addEventListener('click', async () => {
        if (file.isDirectory) {
          await loadDirectory(file.path);
        } else {
          await openFile(file.path, file.name);
        }
      });
      tree.appendChild(item);
    });
  } catch (e) {
    tree.innerHTML = '<div style="padding:12px;color:#808080;">Cannot access directory</div>';
  }
}

async function openFile(path, name) {
  try {
    const content = await readFile(path);
    const language = detectLanguage(name);
    const id = generateTabId(path);

    if (!state.tabs.has(id)) {
      addTab({ id, name, path, isModified: false, language });
    } else {
      setActiveTab(id);
    }

    state.fileContents.set(id, content);
    if (state.editorView) {
      state.editorView.dispatch({
        changes: { from: 0, to: state.editorView.state.doc.length, insert: content },
      });
    }

    if (window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.add('collapsed');
      state.sidebarOpen = false;
    }
  } catch (e) {
    console.error('Failed to open file:', e);
  }
}

// ===== MOBILE HELPER =====
function initHelperBar() {
  const keys = ['Tab', '{', '}', '(', ')', '[', ']', '<', '>', ':', ';', '"', "'", '/', '\\', ',', '.', '='];
  const container = document.getElementById('helper-keys');
  if (!container) return;

  keys.forEach(key => {
    const btn = document.createElement('button');
    btn.className = 'helper-key';
    btn.textContent = key === 'Tab' ? '\u21E5' : key;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); insertText(key); });
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); insertText(key); });
    container.appendChild(btn);
  });
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  createEditor('// CodeX Editor\n// Start coding...', 'plaintext');
  initHelperBar();
  updateStatusBar(1, 1, 1, 'plaintext');

  const startPath = window.location.protocol === 'file:'
    ? 'cdvfile://localhost/persistent/'
    : '/';

  loadDirectory(startPath).catch(() => {
    loadDirectory('cdvfile://localhost/persistent/').catch(() => {
      document.getElementById('file-tree').innerHTML =
        '<div style="padding:12px;color:#808080;">Tap to browse files</div>';
    });
  });

  document.getElementById('btn-menu').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    state.sidebarOpen = !state.sidebarOpen;
    sidebar.classList.toggle('collapsed', !state.sidebarOpen);
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    loadDirectory(state.currentPath);
  });

  document.getElementById('btn-save').addEventListener('click', async () => {
    if (!state.activeTabId || !state.editorView) return;
    const tab = state.tabs.get(state.activeTabId);
    if (!tab) return;

    const content = state.editorView.state.doc.toString();
    await writeFile(tab.path, content);
    tab.isModified = false;
    updateTabUI(tab);
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); document.getElementById('btn-save').click(); }
    if (e.ctrlKey && e.key === 'b') { e.preventDefault(); document.getElementById('btn-menu').click(); }
  });
});
