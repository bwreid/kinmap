/* ============================================================
   Kinmap — localStorage persistence
   ============================================================ */
const Storage = (() => {
  const NS      = 'kinmap';
  const KEY_AUTO = `${NS}:autosave`;
  const KEY_IDX  = `${NS}:saves:index`;
  const entryKey = k => `${NS}:saves:entry:${k}`;

  function serialize(name) {
    return {
      v: 1,
      name: name || 'Untitled',
      savedAt: new Date().toISOString(),
      data: {
        _n: FAM._n,
        people: FAM.people.map(p => ({ ...p })),
        unions: FAM.unions.map(u => ({
          id: u.id, partners: [...u.partners], type: u.type,
          children: [...u.children], ...(u.root ? { root: true } : {})
        })),
        rels: FAM.rels.map(r => ({ ...r }))
      }
    };
  }

  function hydrate(doc) {
    const d = doc.data;
    FAM._n     = d._n;
    FAM.people = d.people.map(p => ({ ...p }));
    FAM.unions = d.unions.map(u => ({ ...u, partners: [...u.partners], children: [...u.children] }));
    FAM.rels   = d.rels.map(r => ({ ...r }));
  }

  function autosave() {
    try { localStorage.setItem(KEY_AUTO, JSON.stringify(serialize('autosave'))); } catch (_) {}
  }
  function loadAutosave() {
    try { const s = localStorage.getItem(KEY_AUTO); return s ? JSON.parse(s) : null; } catch (_) { return null; }
  }

  function listSaves() {
    try { return JSON.parse(localStorage.getItem(KEY_IDX) || '[]'); } catch (_) { return []; }
  }
  function saveNamed(name) {
    const key = String(Date.now());
    const doc = serialize(name);
    try {
      localStorage.setItem(entryKey(key), JSON.stringify(doc));
      const idx = listSaves();
      idx.unshift({ key, name, savedAt: doc.savedAt });
      localStorage.setItem(KEY_IDX, JSON.stringify(idx));
    } catch (_) { return false; }
    return key;
  }
  function loadNamed(key) {
    try { const s = localStorage.getItem(entryKey(key)); return s ? JSON.parse(s) : null; } catch (_) { return null; }
  }
  function deleteNamed(key) {
    try {
      localStorage.removeItem(entryKey(key));
      const idx = listSaves().filter(e => e.key !== key);
      localStorage.setItem(KEY_IDX, JSON.stringify(idx));
    } catch (_) {}
  }

  function exportJSON() {
    const doc = serialize(null);
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (doc.name || 'kinmap') + '.json';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function renderSavesList(containerId) {
    const el = document.getElementById(containerId);
    const saves = listSaves();
    if (!saves.length) {
      el.innerHTML = `<p style="color:var(--ink-3);font-size:13px;text-align:center;padding:20px 0">No saved genograms yet.</p>`;
      return;
    }
    el.innerHTML = saves.map(e => {
      const date = new Date(e.savedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
      return `<div class="save-row">
        <div class="save-info">
          <span class="save-name">${e.name}</span>
          <span class="save-date">${date}</span>
        </div>
        <div class="save-actions">
          <button class="btn" data-act="load-entry" data-key="${e.key}">Open</button>
          <button class="btn ghost danger" data-act="delete-entry" data-key="${e.key}">Delete</button>
        </div>
      </div>`;
    }).join('');
  }

  return { serialize, hydrate, autosave, loadAutosave, listSaves, saveNamed, loadNamed, deleteNamed, exportJSON, renderSavesList };
})();
