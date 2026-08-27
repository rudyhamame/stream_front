<script setup>
import { computed, onMounted, ref, watch } from "vue";

const base = (import.meta.env.VITE_API_BASE_URL || "https://rh-stream-backend.onrender.com").replace(/\/$/, "");
const api = path => `${base}${path}`;
const imageUrl = value => {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? api(`/api/xtream/logo?url=${encodeURIComponent(url)}`) : url;
};
async function request(path, options = {}) {
  const response = await fetch(api(path), options);
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

const online = ref(false), sources = ref([]), sourceId = ref("");
const name = ref(""), url = ref(""), editing = ref(null), busy = ref(false), loading = ref(false), message = ref("");
const kind = ref("channel"), items = ref([]), categories = ref([]), languages = ref([]), category = ref("all"), titleLanguage = ref("all"), query = ref("");
const selectedKeys = ref([]), savedItems = ref([]), archivedItems = ref([]), knownItems = ref({}), view = ref("library"), page = ref(1), pages = ref(1), total = ref(0);
const sortBy = ref("name"), selectionFilter = ref("all");
const savedKind = ref("series");
const selectedCount = computed(() => selectedKeys.value.length);
const visibleItems = computed(() => {
  const filtered = items.value.filter(item => selectionFilter.value === "all"
    || (selectionFilter.value === "selected" && selectedKeys.value.includes(item.key))
    || (selectionFilter.value === "available" && !selectedKeys.value.includes(item.key)));
  return [...filtered].sort((a, b) => {
    if (sortBy.value === "recent") return String(b.added || "").localeCompare(String(a.added || ""));
    if (sortBy.value === "category") return String(a.categoryId || "").localeCompare(String(b.categoryId || "")) || a.title.localeCompare(b.title);
    return String(a.title || "").localeCompare(String(b.title || ""), undefined, { numeric: true, sensitivity: "base" });
  });
});
const typeCounts = computed(() => Object.fromEntries(["series", "movie", "channel"].map(value => [value, savedItems.value.filter(item => item.kind === value).length])));
const archiveCounts = computed(() => Object.fromEntries(["series", "movie", "channel"].map(value => [value, archivedItems.value.filter(item => item.kind === value).length])));
const savedItemsForTab = computed(() => savedItems.value.filter(item => item.kind === savedKind.value));

function typeLabel(value) { return value === "series" ? "Series" : value === "movie" ? "Movies" : "Channels"; }
function typeIcon(value) { return value === "series" ? "▦" : value === "movie" ? "▶" : "◉"; }

function applySource(source) {
  if (!source) return;
  selectedKeys.value = [...(source.enabledKeys || [])];
  savedItems.value = [...(source.enabledItems || [])];
  archivedItems.value = [...(source.archivedItems || [])];
  rememberItems([...savedItems.value, ...archivedItems.value]);
  sources.value = sources.value.map(item => item.id === source.id ? source : item);
}

function rememberItems(entries = []) {
  const next = { ...knownItems.value };
  for (const item of entries) if (item?.key) next[item.key] = item;
  knownItems.value = next;
}

async function loadSources(preferred = sourceId.value) {
  const data = await request("/api/xtream/sources");
  sources.value = data.items || [];
  sourceId.value = sources.value.some(item => item.id === preferred) ? preferred : (sources.value[0]?.id || "");
  const source = sources.value.find(item => item.id === sourceId.value);
  selectedKeys.value = [...(source?.enabledKeys || [])];
  savedItems.value = [...(source?.enabledItems || [])];
  archivedItems.value = [...(source?.archivedItems || [])];
  rememberItems([...savedItems.value, ...archivedItems.value]);
  if (source) await Promise.all([loadCatalog(), loadSaved()]);
  else { items.value = []; savedItems.value = []; archivedItems.value = []; }
}

async function loadCatalog(reset = true) {
  if (!sourceId.value) return;
  if (reset) page.value = 1;
  loading.value = true;
  message.value = "";
  try {
    const params = new URLSearchParams({ sourceId: sourceId.value, kind: kind.value, category: category.value, titleLanguage: titleLanguage.value, q: query.value.trim(), page: String(page.value), limit: "50" });
    const data = await request(`/api/xtream/catalog?${params}`);
    items.value = data.items || [];
    rememberItems(items.value);
    categories.value = data.categories || [];
    languages.value = data.languages || [];
    page.value = data.pagination?.page || 1;
    pages.value = data.pagination?.pageCount || 1;
    total.value = data.pagination?.total || 0;
    selectedKeys.value = [...(data.source?.enabledKeys || selectedKeys.value)];
  } catch (error) { message.value = error.message; }
  finally { loading.value = false; }
}

async function loadSaved() {
  const data = await request(`/api/xtream/sources/${sourceId.value}/enabled`);
  applySource(data.source);
  savedItems.value = data.items || [];
}

async function saveSource() {
  busy.value = true;
  try {
    const isEditing = Boolean(editing.value);
    const data = await request(isEditing ? `/api/xtream/sources/${editing.value}` : "/api/xtream/sources", {
      method: isEditing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.value, url: url.value }),
    });
    name.value = ""; url.value = ""; editing.value = null;
    await loadSources(data.id);
    message.value = "Source saved.";
  } catch (error) { message.value = error.message; }
  finally { busy.value = false; }
}

function editSource(source) { editing.value = source.id; name.value = source.name; url.value = ""; }
function cancelEdit() { editing.value = null; name.value = ""; url.value = ""; }
async function deleteSource(source) {
  if (!confirm(`Delete “${source.name}”?`)) return;
  await request(`/api/xtream/sources/${source.id}`, { method: "DELETE" });
  await loadSources();
}
async function chooseSource(id) { sourceId.value = id; category.value = "all"; titleLanguage.value = "all"; await loadSources(id); }
async function chooseKind(value) { kind.value = value; category.value = "all"; titleLanguage.value = "all"; query.value = ""; await loadCatalog(); }
function toggle(item) { rememberItems([item]); selectedKeys.value = selectedKeys.value.includes(item.key) ? selectedKeys.value.filter(key => key !== item.key) : [...selectedKeys.value, item.key]; }
function selectPage() { rememberItems(items.value); selectedKeys.value = [...new Set([...selectedKeys.value, ...items.value.map(item => item.key)])]; }
function clearType() { const prefix = `${kind.value}:`; selectedKeys.value = selectedKeys.value.filter(key => !key.startsWith(prefix)); }
async function movePage(delta) { page.value += delta; await loadCatalog(false); }
async function saveSelection() {
  busy.value = true;
  try {
    const enabledItems = selectedKeys.value.map(key => knownItems.value[key]).filter(Boolean);
    const missing = selectedKeys.value.length - enabledItems.length;
    if (missing) throw new Error(`${missing} selected item(s) are no longer available. Reload their catalog page and save again.`);
    const data = await request(`/api/xtream/sources/${sourceId.value}/selection`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabledKeys: selectedKeys.value, enabledItems }),
    });
    applySource(data);
    message.value = `${data.selectedCount} item(s) enabled on Roku.`;
  } catch (error) { message.value = error.message; }
  finally { busy.value = false; }
}
async function removeSaved(item) { selectedKeys.value = selectedKeys.value.filter(key => key !== item.key); await saveSelection(); }
async function archiveSaved(item) {
  busy.value = true;
  try {
    applySource(await request(`/api/xtream/sources/${sourceId.value}/archive/${encodeURIComponent(item.key)}`, { method: "POST" }));
    message.value = "Item archived and removed from Roku.";
  } catch (error) { message.value = error.message; }
  finally { busy.value = false; }
}
async function restoreArchived(item) {
  busy.value = true;
  try {
    applySource(await request(`/api/xtream/sources/${sourceId.value}/archive/${encodeURIComponent(item.key)}/restore`, { method: "POST" }));
    message.value = "Item restored to the Roku library.";
  } catch (error) { message.value = error.message; }
  finally { busy.value = false; }
}

let searchTimer;
watch(query, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadCatalog(), 350); });
watch(category, () => loadCatalog());
watch(titleLanguage, () => loadCatalog());
onMounted(async () => {
  try { await request("/api/health"); online.value = true; await loadSources(); }
  catch (error) { online.value = false; message.value = error.message; }
});
</script>

<template>
  <main class="shell">
    <nav class="topbar">
      <div class="brand"><span class="brand-mark">RH</span><span>Stream</span></div>
      <span class="status"><i :class="{offline:!online}"></i>{{ online ? "Backend online" : "Backend offline" }}</span>
    </nav>
    <header class="manager-hero">
      <div>
        <p class="eyebrow">ROKU PLAYLIST BUILDER</p>
        <h1>Build your<br><em>Roku library.</em></h1>
        <p>Select only what you want on the TV. Organize Series, Movies, and Channels here; archived items stay safely outside the Roku feed.</p>
      </div>
      <div class="hero-note"><span class="hero-note-icon">✓</span><strong>One focused workflow</strong><small>Choose · Filter · Save</small></div>
    </header>

    <section class="xtream-control-panel">
      <div class="section-heading"><div><p class="eyebrow">STEP 01 · CONNECTION</p><h2>Choose a catalog source</h2><p class="section-copy">Connect an Xtream source once, then manage exactly what Roku can see.</p></div><span class="section-count">{{ sources.length }} source{{ sources.length === 1 ? '' : 's' }}</span></div>
      <form class="xtream-source-form" @submit.prevent="saveSource">
        <label><span>Display name</span><input v-model="name" required placeholder="My provider"></label>
        <label class="source-url"><span>Xtream playlist URL</span><input v-model="url" :required="!editing" placeholder="http://provider/get.php?..." spellcheck="false"></label>
        <button class="primary-action" :disabled="busy">{{ editing ? "Save source" : "Add source" }}</button>
        <button v-if="editing" type="button" class="source-action" @click="cancelEdit">Cancel</button>
      </form>
      <div class="xtream-source-list">
        <article v-for="source in sources" :key="source.id" :class="{active:source.id===sourceId}">
          <button type="button" class="xtream-source-choice" @click="chooseSource(source.id)"><span class="source-pulse"></span><strong>{{source.name}}</strong><small>{{source.endpoint}}</small></button>
          <button class="source-action" @click="editSource(source)">Edit</button><button class="source-delete" @click="deleteSource(source)">Delete</button>
        </article>
      </div>

      <template v-if="sourceId">
        <div class="xtream-view-tabs">
          <button type="button" :class="{active:view==='library'}" @click="view='library'"><span class="tab-icon">▣</span>Roku library <span>{{ selectedCount }}</span></button>
          <button type="button" :class="{active:view==='archive'}" @click="view='archive'"><span class="tab-icon">⌁</span>Archive <span>{{ archivedItems.length }}</span></button>
        </div>

        <template v-if="view==='library'">
          <div class="workspace-heading"><div><p class="eyebrow">STEP 02 · CURATE CONTENT</p><h2>What should Roku show?</h2></div><div class="selection-summary"><strong>{{ selectedCount }}</strong><span>enabled on Roku</span></div></div>
          <div class="type-cards">
            <button type="button" v-for="value in ['series','movie','channel']" :key="value" :class="['type-card', {active:kind===value}]" @click="chooseKind(value)"><span class="type-icon">{{ typeIcon(value) }}</span><span><strong>{{ typeLabel(value) }}</strong><small>{{ typeCounts[value] || 0 }} enabled · {{ archiveCounts[value] || 0 }} archived</small></span><b>›</b></button>
          </div>
          <div class="xtream-toolbar">
            <label class="catalog-search"><span>⌕</span><input v-model="query" placeholder="Search this catalog…"></label>
            <select v-model="category"><option value="all">All categories</option><option v-for="item in categories" :key="item.id" :value="item.id">{{item.name}}</option></select>
            <select v-model="titleLanguage" aria-label="Filter by title language"><option value="all">Title language: All</option><option v-for="item in languages" :key="item" :value="item">Title language: {{item}}</option></select>
            <select v-model="sortBy"><option value="name">Sort: A–Z</option><option value="recent">Sort: Recently added</option><option value="category">Sort: Category</option></select>
            <select v-model="selectionFilter"><option value="all">Show: All items</option><option value="available">Show: Not selected</option><option value="selected">Show: Selected only</option></select>
            <div class="toolbar-actions"><button type="button" class="source-action" @click="selectPage">Select visible</button><button type="button" class="source-delete" @click="clearType">Clear {{ typeLabel(kind) }}</button></div>
            <button type="button" class="xtream-save" :disabled="busy" @click="saveSelection">Save {{ selectedCount }} to Roku</button>
          </div>
          <div v-if="loading" class="loading"><span class="loading-ring"></span><span>Loading {{ typeLabel(kind).toLowerCase() }}…</span></div>
          <div v-else-if="!visibleItems.length" class="loading empty-catalog"><span class="empty-icon">⌕</span><span>No matching {{ typeLabel(kind).toLowerCase() }} found.</span></div>
          <div v-else class="xtream-item-list">
            <label v-for="item in visibleItems" :key="item.key" :class="{enabled:selectedKeys.includes(item.key)}">
              <input type="checkbox" :checked="selectedKeys.includes(item.key)" @change="toggle(item)"><span class="item-poster"><img v-if="item.logo" :src="imageUrl(item.logo)" :alt="item.title"><span v-else>{{ typeIcon(kind) }}</span></span>
              <span class="item-copy"><strong>{{item.title}}</strong><small>{{item.categoryId || 'Uncategorized'}}</small></span><em>{{selectedKeys.includes(item.key)?"On Roku":"Not selected"}}</em>
            </label>
          </div>
          <div class="xtream-pagination"><button type="button" :disabled="page<=1" @click="movePage(-1)">‹ Previous</button><span>Page {{page}} / {{pages}} <b>·</b> {{total}} {{ typeLabel(kind).toLowerCase() }}</span><button type="button" :disabled="page>=pages" @click="movePage(1)">Next ›</button></div>
          <section class="xtream-enabled-section">
            <div class="saved-tabs" role="tablist" aria-label="Saved Roku content">
              <button type="button" v-for="value in ['series','movie','channel']" :key="value" :class="{active:savedKind===value}" @click="savedKind=value"><span>{{ typeIcon(value) }}</span>{{ typeLabel(value) }} <b>{{ typeCounts[value] || 0 }}</b></button>
            </div>
            <div v-if="savedItemsForTab.length" class="xtream-enabled-table"><div v-for="item in savedItemsForTab" :key="item.key" class="xtream-enabled-row"><div class="xtream-enabled-name"><span class="item-poster small"><img v-if="item.logo" :src="imageUrl(item.logo)" :alt="item.title"><span v-else>{{ typeIcon(item.kind) }}</span></span><strong>{{item.title}}</strong></div><span class="xtream-kind-badge">{{typeLabel(item.kind)}}</span><code>{{item.id}}</code><div class="xtream-row-actions"><button type="button" class="source-action" :disabled="busy" @click="archiveSaved(item)">Archive</button><button type="button" class="source-delete" :disabled="busy" @click="removeSaved(item)">Remove</button></div></div></div>
            <div v-else class="empty xtream-enabled-empty"><strong>No {{ typeLabel(savedKind).toLowerCase() }} items enabled.</strong><span>Select items above, then press “Save to Roku”.</span></div>
          </section>
        </template>

        <section v-else class="xtream-enabled-section archive-section">
          <div class="section-heading"><div><p class="eyebrow">STORED SAFELY · NOT ON ROKU</p><h2>Archive</h2><p class="section-copy">Keep items out of the Roku feed without deleting them. Restore them whenever you need.</p></div><span class="section-count accent-count">{{ archivedItems.length }}</span></div>
          <div v-if="archivedItems.length" class="archive-summary"><span v-for="value in ['series','movie','channel']" :key="value"><b>{{archiveCounts[value] || 0}}</b> {{typeLabel(value)}}</span></div>
          <div v-if="archivedItems.length" class="xtream-enabled-table"><div v-for="item in archivedItems" :key="item.key" class="xtream-enabled-row"><div class="xtream-enabled-name"><span class="item-poster small"><img v-if="item.logo" :src="imageUrl(item.logo)" :alt="item.title"><span v-else>{{ typeIcon(item.kind) }}</span></span><strong>{{item.title}}</strong></div><span class="xtream-kind-badge">{{typeLabel(item.kind)}}</span><code>{{item.id}}</code><div class="xtream-row-actions"><button type="button" class="xtream-save" :disabled="busy" @click="restoreArchived(item)">Restore to Roku</button></div></div></div>
          <div v-else class="empty xtream-enabled-empty"><strong>Your archive is empty.</strong><span>Archive an enabled item to keep it available without showing it on Roku.</span></div>
        </section>
      </template>
      <p v-if="message" class="xtream-message">{{message}}</p>
    </section>
  </main>
</template>

<style>
.saved-tabs{display:flex;gap:8px;margin:0 0 12px;padding:4px;border-bottom:1px solid #303c2d}.saved-tabs button{display:flex;align-items:center;gap:7px;border:1px solid transparent;border-radius:8px;background:transparent;color:#899786;padding:9px 13px;font-weight:700;cursor:pointer}.saved-tabs button:hover{color:#e8f0e4;background:#182218}.saved-tabs button.active{border-color:#668c3e;background:#263820;color:#d4f06a}.saved-tabs button span{color:#a7d65a;font-size:16px}.saved-tabs button b{min-width:18px;padding:2px 5px;border-radius:99px;background:#172117;color:#9ba997;font-size:11px}.saved-tabs button.active b{background:#b7ff32;color:#10150f}
@media(max-width:600px){.saved-tabs{overflow:auto}.saved-tabs button{flex:1;justify-content:center;min-width:104px;white-space:nowrap;padding:9px 7px}}
</style>
