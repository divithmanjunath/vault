(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const els = {
    list: $('#noteList'), search: $('#search'), newBtn: $('#newNote'),
    exportBtn: $('#exportBtn'), importInput: $('#importInput'), menuBtn: $('#menuBtn'),
    title: $('#title'), modeBtn: $('#modeBtn'), deleteBtn: $('#deleteBtn'),
    editor: $('#editor'), preview: $('#preview'), backlinks: $('#backlinks'),
    backlinkList: $('#backlinkList'), empty: $('#empty'), net: $('#net'),
    scrim: $('#scrim'), toast: $('#toast'), swState: $('#swState'),
  };

  // ---------- storage (IndexedDB: everything stays on this device) ----------
  const DB_NAME = 'vault-db', STORE = 'notes';
  let db = null;
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const store = {
    open: () => new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }),
    all: () => db ? req(db.transaction(STORE).objectStore(STORE).getAll()) : Promise.resolve([]),
    put: n => db ? req(db.transaction(STORE, 'readwrite').objectStore(STORE).put(n)) : Promise.resolve(),
    del: id => db ? req(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)) : Promise.resolve(),
  };

  // ---------- state ----------
  const notes = new Map();
  let currentId = null, mode = 'edit', saveTimer = null, listTimer = null, toastTimer = null;
  const dirty = new Set();

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const byTitle = t => { const k = t.trim().toLowerCase(); for (const n of notes.values()) if (n.title.toLowerCase() === k) return n; return null; };
  const cleanTitle = t => String(t).replace(/[\\/:*?"<>|[\]#^]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled';
  const uniqueTitle = (base, exceptId) => {
    let t = base, i = 2;
    for (;;) { const hit = byTitle(t); if (!hit || hit.id === exceptId) return t; t = `${base} ${i++}`; }
  };
  const sorted = () => [...notes.values()].sort((a, b) => b.updated - a.updated);
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function markDirty(n) {
    delete n.sample;          // once edited, a sample note is the user's own
    n.updated = Date.now();
    dirty.add(n.id);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }
  async function flush() {
    clearTimeout(saveTimer);
    const ids = [...dirty]; dirty.clear();
    for (const id of ids) { const n = notes.get(id); if (n) await store.put(n); }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  async function createNote(title = 'Untitled', open = true, body = '') {
    const now = Date.now();
    const n = { id: uid(), title: uniqueTitle(cleanTitle(title)), body, created: now, updated: now };
    notes.set(n.id, n);
    await store.put(n);
    renderList();
    if (open) { openNote(n.id); if (!body) { els.title.focus(); els.title.select(); } }
    return n;
  }

  // ---------- rendering ----------
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function relTime(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function snippet(n, q) {
    const plain = n.body.replace(/[#*_>`=~[\]]/g, '').replace(/\s+/g, ' ').trim();
    if (q) {
      const i = plain.toLowerCase().indexOf(q);
      if (i > 20) return '…' + plain.slice(i - 20, i + 70);
    }
    return plain.slice(0, 90) || 'Empty note';
  }

  function renderList() {
    const q = els.search.value.trim().toLowerCase();
    const items = sorted().filter(n => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
    els.list.innerHTML = '';
    for (const n of items) {
      const li = document.createElement('li');
      li.dataset.id = n.id;
      if (n.id === currentId) li.classList.add('active');
      const t = document.createElement('div'); t.className = 't'; t.textContent = n.title;
      const s = document.createElement('div'); s.className = 's'; s.textContent = snippet(n, q);
      const d = document.createElement('div'); d.className = 'd'; d.textContent = relTime(n.updated);
      li.append(t, s, d);
      els.list.append(li);
    }
    if (!items.length) {
      const li = document.createElement('li'); li.className = 'none';
      li.textContent = q ? 'No matches' : 'No notes yet';
      els.list.append(li);
    }
  }

  function renderPreview() {
    const n = notes.get(currentId);
    els.preview.innerHTML = n ? MD.render(n.body, t => !!byTitle(t)) : '';
  }

  function renderBacklinks() {
    const cur = notes.get(currentId);
    els.backlinkList.innerHTML = '';
    if (!cur) return;
    const k = cur.title.toLowerCase();
    const linksHere = text => MD.extractLinks(text).some(t => t.toLowerCase() === k);
    let count = 0;
    for (const n of sorted()) {
      if (n.id === cur.id || !linksHere(n.body)) continue;
      count++;
      const li = document.createElement('li');
      li.dataset.id = n.id;
      const t = document.createElement('div'); t.className = 't'; t.textContent = n.title;
      const ctx = document.createElement('div'); ctx.className = 's';
      ctx.textContent = (n.body.split('\n').find(linksHere) || '').trim().slice(0, 140);
      li.append(t, ctx);
      els.backlinkList.append(li);
    }
    els.backlinks.querySelector('h4').textContent = `Backlinks (${count})`;
    if (!count) {
      const li = document.createElement('li'); li.className = 'none';
      li.textContent = 'No notes link here yet.';
      els.backlinkList.append(li);
    }
  }

  function setMode(m) {
    mode = m;
    const has = !!currentId;
    els.editor.hidden = !has || mode !== 'edit';
    els.preview.hidden = !has || mode !== 'preview';
    els.modeBtn.textContent = mode === 'edit' ? 'Preview' : 'Edit';
    if (mode === 'preview') renderPreview();
  }

  function openNote(id) {
    const n = notes.get(id);
    if (!n) return;
    currentId = id;
    try { localStorage.setItem('vault:last', id); } catch (_) {}
    els.title.value = n.title;
    els.editor.value = n.body;
    els.empty.hidden = true;
    els.backlinks.hidden = false;
    [els.title, els.modeBtn, els.deleteBtn].forEach(x => (x.disabled = false));
    setMode(mode);
    renderBacklinks();
    renderList();
    closeSidebar();
    els.editor.scrollTop = 0; els.preview.scrollTop = 0;
  }

  function showEmpty() {
    currentId = null;
    els.title.value = ''; els.editor.value = '';
    els.empty.hidden = false;
    els.backlinks.hidden = true;
    [els.title, els.modeBtn, els.deleteBtn].forEach(x => (x.disabled = true));
    setMode(mode);
  }

  // ---------- actions ----------
  async function renameCurrent(raw) {
    const n = notes.get(currentId);
    if (!n) return;
    const old = n.title;
    const next = uniqueTitle(cleanTitle(raw), n.id);
    els.title.value = next;
    if (next === old) return;
    n.title = next;
    markDirty(n);

    // Keep [[links]] pointing at the renamed note, like Obsidian does
    const re = new RegExp('\\[\\[\\s*' + escRe(old) + '\\s*((?:#[^\\]|\\n]*)?(?:\\|[^\\]\\n]*)?)\\]\\]', 'gi');
    let touched = 0;
    for (const o of notes.values()) {
      if (o.id === n.id) continue;
      const nb = o.body.replace(re, (_, rest) => `[[${next}${rest}]]`);
      if (nb !== o.body) { o.body = nb; markDirty(o); touched++; }
    }
    await flush();
    renderList();
    if (mode === 'preview') renderPreview();
    if (touched) toast(`Updated links in ${touched} note${touched > 1 ? 's' : ''}`);
  }

  async function followLink(target) {
    const n = byTitle(target) || await createNote(target, false);
    openNote(n.id);
  }

  async function deleteCurrent() {
    const n = notes.get(currentId);
    if (!n || !confirm(`Delete “${n.title}”? This can't be undone.`)) return;
    dirty.delete(n.id);
    notes.delete(n.id);
    await store.del(n.id);
    const next = sorted()[0];
    next ? openNote(next.id) : showEmpty();
    renderList();
  }

  async function exportVault() {
    await flush();
    const enc = new TextEncoder();
    const used = new Set(), files = [];
    for (const n of sorted()) {
      let name = n.title, i = 2;
      while (used.has(name.toLowerCase())) name = `${n.title} ${i++}`;
      used.add(name.toLowerCase());
      files.push({ name: `Vault/${name}.md`, data: enc.encode(n.body), date: new Date(n.updated) });
    }
    if (!files.length) { toast('Nothing to export'); return; }
    const blob = ZIP.make(files);
    const fname = `vault-${new Date().toISOString().slice(0, 10)}.zip`;
    const file = new File([blob], fname, { type: 'application/zip' });

    // On iPhone/iPad the share sheet is the reliable way to save or AirDrop a file
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Vault export' }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`Exported ${files.length} notes`);
  }

  async function importFiles(fileList) {
    const incoming = [];
    for (const f of fileList) {
      try {
        if (/\.zip$/i.test(f.name)) incoming.push(...await ZIP.read(await f.arrayBuffer()));
        else if (/\.(md|markdown|txt)$/i.test(f.name)) incoming.push({ name: f.name, text: await f.text() });
      } catch (err) { toast(`Couldn't read ${f.name}: ${err.message}`); }
    }
    if (!incoming.length) { toast('No Markdown files found'); return; }

    // Untouched sample notes make way for the user's real vault
    for (const n of [...notes.values()]) if (n.sample) { notes.delete(n.id); await store.del(n.id); }

    const parsed = incoming.map(it => ({
      title: cleanTitle(it.name.split('/').pop().replace(/\.(md|markdown|txt)$/i, '')),
      body: it.text.replace(/\r\n?/g, '\n'),
    }));
    const clashes = parsed.filter(p => { const e = byTitle(p.title); return e && e.body !== p.body; }).length;
    const overwrite = clashes > 0 && confirm(
      `${clashes} note${clashes > 1 ? 's' : ''} already exist here with different content.\n\n` +
      `OK — replace with the imported version\nCancel — keep both copies`);

    let added = 0, updated = 0, first = null;
    for (const p of parsed) {
      const e = byTitle(p.title);
      if (e && e.body === p.body) continue;
      if (e && overwrite) { e.body = p.body; markDirty(e); updated++; first = first || e; continue; }
      const n = await createNote(p.title, false, p.body);
      added++; first = first || n;
    }
    await flush();
    renderList();
    if (first) openNote(first.id);
    toast(`Imported ${added} new, ${updated} updated`);
  }

  // ---------- sidebar (mobile drawer) ----------
  const openSidebar = () => document.body.classList.add('nav-open');
  const closeSidebar = () => document.body.classList.remove('nav-open');

  // ---------- events ----------
  els.newBtn.addEventListener('click', () => createNote());
  els.search.addEventListener('input', renderList);
  els.list.addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) openNote(li.dataset.id); });
  els.backlinkList.addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) openNote(li.dataset.id); });
  els.menuBtn.addEventListener('click', () => document.body.classList.contains('nav-open') ? closeSidebar() : openSidebar());
  els.scrim.addEventListener('click', closeSidebar);
  els.modeBtn.addEventListener('click', () => setMode(mode === 'edit' ? 'preview' : 'edit'));
  els.deleteBtn.addEventListener('click', deleteCurrent);
  els.exportBtn.addEventListener('click', exportVault);
  els.importInput.addEventListener('change', async () => {
    const files = [...els.importInput.files];
    els.importInput.value = '';
    await importFiles(files);
  });

  els.editor.addEventListener('input', () => {
    const n = notes.get(currentId);
    if (!n) return;
    n.body = els.editor.value;
    markDirty(n);
    clearTimeout(listTimer);
    listTimer = setTimeout(renderList, 300);
  });

  els.title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); els.title.blur(); } });
  els.title.addEventListener('change', () => renameCurrent(els.title.value));

  els.preview.addEventListener('click', e => {
    const a = e.target.closest('a.wikilink');
    if (a) { e.preventDefault(); followLink(a.dataset.target); return; }
    const tag = e.target.closest('.tag');
    if (tag) { els.search.value = tag.textContent; renderList(); openSidebar(); }
  });

  document.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'e' && currentId) { e.preventDefault(); setMode(mode === 'edit' ? 'preview' : 'edit'); }
    else if (k === 'k') { e.preventDefault(); openSidebar(); els.search.focus(); els.search.select(); }
    else if (k === 'j') { e.preventDefault(); createNote(); }
  });

  // ---------- online / offline ----------
  function updateNet() {
    const on = navigator.onLine;
    els.net.textContent = on ? 'Online' : 'Offline';
    els.net.className = 'net ' + (on ? 'on' : 'off');
  }
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);

  function setupServiceWorker() {
    const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!('serviceWorker' in navigator) || !secure) {
      els.swState.textContent = secure ? 'Offline mode not supported here' : 'Offline mode needs HTTPS or localhost';
      return;
    }
    navigator.serviceWorker.register('sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => { els.swState.textContent = '✓ Available offline'; })
      .catch(() => { els.swState.textContent = 'Offline setup failed'; });
  }

  // ---------- first run ----------
  async function seed() {
    const t = Date.now();
    const mk = (title, body, ago) => {
      const n = { id: uid(), title, body, created: t - ago, updated: t - ago, sample: true };
      notes.set(n.id, n); return store.put(n);
    };
    await mk('How linking works',
`This note is linked from [[Welcome]], so Welcome shows up in the **Backlinks** panel below.

Rename a note and every [[Welcome|link]] pointing to it is updated for you.

## Formatting
- [x] Task lists
- [ ] ==Highlights==, ~~strikethrough~~, \`inline code\`
- [External links](https://obsidian.md)

\`\`\`
code blocks work too
\`\`\`

#guide`, 60000);
    await mk('Welcome',
`# Your offline vault

Everything here is saved **on this device only**. No account, no server.

- Link notes with double brackets, like [[How linking works]]
- Add #tags anywhere; tap one in Preview to search for it
- Link to a note that doesn't exist yet, like [[Ideas]], and it's created when you open it

> Move notes between your Mac and iPhone with **Export .zip** and **Import**.`, 0);
  }

  async function init() {
    updateNet();
    setupServiceWorker();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    try {
      db = await store.open();
      for (const n of await store.all()) notes.set(n.id, n);
    } catch (err) {
      console.error(err);
      toast("Storage unavailable. Notes won't be saved in this window.");
    }
    if (!notes.size) await seed();
    let last = null;
    try { last = localStorage.getItem('vault:last'); } catch (_) {}
    const target = notes.get(last) || sorted()[0];
    target ? openNote(target.id) : showEmpty();
    renderList();
  }

  init();
})();
