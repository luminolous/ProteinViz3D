/* ── State ───────────────────────────────────────────────── */
let viewer        = null;
let surfaceShown  = false;
let currentStyle  = 'cartoon';
let currentColor  = 'spectrum';
let surfaceObj    = null;

/* ── 3Dmol style map ─────────────────────────────────────── */
function buildStyle(style, color) {
  const colorMap = {
    spectrum: { color: 'spectrum' },
    chain:    { colorscheme: 'chain' },
    residue:  { colorscheme: 'amino' },
    element:  { colorscheme: 'Jmol' },
  };
  const c = colorMap[color] || colorMap.spectrum;
  switch (style) {
    case 'cartoon': return { cartoon: { ...c } };
    case 'stick':   return { stick:   { ...c, radius: 0.12 } };
    case 'sphere':  return { sphere:  { ...c, scale: 0.28 } };
    case 'line':    return { line:    { ...c, linewidth: 1.5 } };
    default:        return { cartoon: { ...c } };
  }
}

/* ── DOM helpers ─────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const show = id => $( id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');

function setState(name) {
  ['emptyState', 'loadingState', 'errorState'].forEach(id => hide(id));
  hide('molViewer');
  if (name === 'empty')   { show('emptyState');   return; }
  if (name === 'loading') { show('loadingState');  return; }
  if (name === 'error')   { show('errorState');    return; }
  if (name === 'viewer')  { show('molViewer');     return; }
}

function resetToEmpty() {
  setState('empty');
  hide('controlsPanel');
  hide('metaPanel');
  if (viewer) { viewer.clear(); viewer = null; }
}
window.resetToEmpty = resetToEmpty;   // referenced in HTML

/* ── Metadata renderer ───────────────────────────────────── */
function renderMeta(meta) {
  const fields = [
    { key: 'PDB ID',     val: meta.id,         mono: true, badge: true },
    { key: 'Title',      val: meta.title },
    { key: 'Method',     val: meta.method },
    { key: 'Resolution', val: meta.resolution ? `${meta.resolution} Å` : '—', mono: true },
    { key: 'Chains',     val: meta.chains },
    { key: 'Atoms',      val: meta.atoms !== '—' ? Number(meta.atoms).toLocaleString() : '—', mono: true },
    { key: 'Deposited',  val: meta.date ? meta.date.split('T')[0] : '—' },
  ];

  $('metaContent').innerHTML = fields.map(f => {
    const valClass = f.mono ? 'meta-val mono' : 'meta-val';
    const valHtml  = f.badge
      ? `<span class="meta-badge">${f.val || '—'}</span>`
      : `<span class="${valClass}">${f.val || '—'}</span>`;
    return `<div class="meta-item">
      <span class="meta-key">${f.key}</span>
      ${valHtml}
    </div>`;
  }).join('');

  show('metaPanel');
}

/* ── Viewer ──────────────────────────────────────────────── */
function initViewer(pdbData) {
  const el = $('molViewer');

  // Destroy old instance if exists
  if (viewer) { viewer.clear(); viewer = null; }
  el.innerHTML = '';

  viewer = $3Dmol.createViewer(el, {
    backgroundColor: '#020811',
    antialias: true,
  });

  viewer.addModel(pdbData, 'pdb');
  applyStyle();
  viewer.zoomTo();
  viewer.render();
  viewer.zoom(0.85, 500);

  surfaceShown = false;
  surfaceObj   = null;
  $('surfaceToggle').checked = false;
  hide('surfaceOpacityRow');
}

function applyStyle() {
  if (!viewer) return;
  viewer.setStyle({}, buildStyle(currentStyle, currentColor));

  if (surfaceShown) {
    removeSurface();
    addSurface();
  }
  viewer.render();
}

function addSurface() {
  if (!viewer) return;
  const opacity = parseInt($('surfaceOpacity').value) / 100;
  surfaceObj = viewer.addSurface(
    $3Dmol.SurfaceType.VDW,
    { opacity, color: 'white', wireframe: false },
    {}
  );
  viewer.render();
}

function removeSurface() {
  if (viewer && surfaceObj !== null) {
    viewer.removeSurface(surfaceObj);
    surfaceObj = null;
  }
}

/* ── API calls ───────────────────────────────────────────── */
async function loadById(pdbId) {
  pdbId = pdbId.trim().toUpperCase();
  if (!pdbId) return;
  if (!/^[A-Z0-9]{4}$/.test(pdbId)) {
    showError('PDB ID harus tepat 4 karakter alfanumerik (contoh: 1HHO)');
    return;
  }

  setState('loading');
  $('loadingText').textContent = `Fetching ${pdbId} from RCSB…`;

  try {
    const res  = await fetch(`/api/pdb/${pdbId}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || 'Gagal mengambil data');

    initViewer(body.pdb_data);
    renderMeta(body.meta);
    show('controlsPanel');
    setState('viewer');
  } catch (err) {
    showError(err.message || 'Terjadi kesalahan yang tidak diketahui');
  }
}

async function loadFile(file) {
  setState('loading');
  $('loadingText').textContent = `Uploading ${file.name}…`;

  const form = new FormData();
  form.append('file', file);

  try {
    const res  = await fetch('/api/upload', { method: 'POST', body: form });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || 'Upload gagal');

    initViewer(body.pdb_data);
    renderMeta(body.meta);
    show('controlsPanel');
    setState('viewer');
  } catch (err) {
    showError(err.message || 'Terjadi kesalahan saat upload');
  }
}

function showError(msg) {
  $('errorText').textContent = msg;
  hide('controlsPanel');
  hide('metaPanel');
  setState('error');
}

/* ── Event bindings ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  // Load button
  $('loadBtn').addEventListener('click', () => {
    loadById($('pdbInput').value);
  });

  // Enter key in input
  $('pdbInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadById($('pdbInput').value);
  });

  // Auto-uppercase input
  $('pdbInput').addEventListener('input', e => {
    const pos = e.target.selectionStart;
    e.target.value = e.target.value.toUpperCase();
    e.target.setSelectionRange(pos, pos);
  });

  // File upload
  $('fileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadFile(file);
    e.target.value = '';   // reset so same file can be re-selected
  });

  // Quick-load tags
  document.querySelectorAll('.ex-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const id = tag.dataset.id;
      $('pdbInput').value = id;
      loadById(id);
    });
  });

  // Style chips
  $('styleGroup').addEventListener('click', e => {
    const btn = e.target.closest('[data-style]');
    if (!btn || !viewer) return;
    document.querySelectorAll('[data-style]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStyle = btn.dataset.style;
    applyStyle();
  });

  // Color chips
  $('colorGroup').addEventListener('click', e => {
    const btn = e.target.closest('[data-color]');
    if (!btn || !viewer) return;
    document.querySelectorAll('[data-color]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.dataset.color;
    applyStyle();
  });

  // Surface toggle
  $('surfaceToggle').addEventListener('change', e => {
    if (!viewer) return;
    surfaceShown = e.target.checked;
    if (surfaceShown) {
      addSurface();
      show('surfaceOpacityRow');
    } else {
      removeSurface();
      hide('surfaceOpacityRow');
      viewer.render();
    }
  });

  // Surface opacity slider
  $('surfaceOpacity').addEventListener('input', e => {
    $('opacityVal').textContent = `${e.target.value}%`;
    if (surfaceShown && viewer) {
      removeSurface();
      addSurface();
    }
  });

  // Reset view
  $('resetBtn').addEventListener('click', () => {
    if (!viewer) return;
    viewer.zoomTo();
    viewer.render();
    viewer.zoom(0.85, 500);
  });

  // Drag & drop onto viewer area
  const viewerArea = document.querySelector('.viewer-area');
  viewerArea.addEventListener('dragover', e => { e.preventDefault(); });
  viewerArea.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.pdb')) loadFile(file);
  });
});
