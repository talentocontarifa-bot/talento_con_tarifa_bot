'use strict';
/**
 * news_sources.js — Módulo compartido (CERO dependencias) para seleccionar y extraer noticias.
 *
 * Lo usan:
 *   - master_pipeline.js (post diario de Facebook, workflow publisher.yml)
 *   - video_tct/create_daily_news.js (video diario "NOTICIAS IA", workflow crear_video_tct.yml)
 *
 * Responsabilidades:
 *   1. Leer feeds RSS/Atom en paralelo con timeouts (fetch global de Node 22 + AbortController).
 *   2. Filtrar por relevancia IA (palabras clave ES/EN con límites de palabra) y frescura (~72h).
 *   3. Deduplicar contra un historial compartido (published_news.json, últimas ~200 entradas).
 *   4. Extraer el texto: contenido completo del RSS -> Jina Reader endurecido -> fallback opcional.
 *   5. Detectar "basura" (páginas de Cloudflare/403 que Jina devuelve con HTTP 200).
 *   6. Filtrar imágenes (logos, avatares, iconos, píxeles, svg, tamaños mínimos).
 *
 * CLI: node news_sources.js merge-history <archivo.json>   (fusiona otro historial en published_news.json)
 */
const fs = require('fs');
const path = require('path');

const HISTORY_PATH = path.join(__dirname, 'published_news.json');
const HISTORY_MAX = 200;
const DEFAULT_MAX_AGE_HOURS = 72;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const JINA_REMOVE_SELECTOR = 'header, footer, nav, aside, .related, .comments, script, style';
const JINA_USER_AGENT = 'TalentoConTarifa-Bot/1.0 (+https://talentocontarifa.lat)';

// ─────────────────────────────────────────
// HTTP con timeout
// ─────────────────────────────────────────
async function fetchText(url, options = {}, timeoutMs = 15000) {
  const { fetchImpl = globalThis.fetch, headers = {}, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      ...rest,
      headers: { 'User-Agent': USER_AGENT, ...headers },
      signal: controller.signal
    });
    const text = await res.text(); // se lee dentro del timeout para que un body lento no cuelgue el proceso
    return { ok: res.ok, status: res.status, url: res.url || url, text };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`Timeout de ${timeoutMs}ms consultando ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────
// Texto / HTML
// ─────────────────────────────────────────
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', hellip: '…',
  mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', iexcl: '¡', iquest: '¿',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  ccedil: 'ç', copy: '©', reg: '®', trade: '™', euro: '€', middot: '·', bull: '•', deg: '°'
};

function decodeEntities(str) {
  return String(str || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    return NAMED_ENTITIES[e] ?? NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

function stripCdata(str) {
  return String(str || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/** Convierte HTML a texto limpio conservando párrafos. */
function htmlToText(html) {
  if (!html) return '';
  let s = stripCdata(html);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|iframe|svg|form|button|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?(p|div|h[1-6]|ul|ol|li|tr|table|section|article|blockquote|figure|figcaption|header|footer|main|aside|pre)\b[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/[ \t\f\v\u00a0]+/g, ' ');
  s = s.split('\n').map(l => l.trim()).join('\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** Longitud de "texto real": sin imágenes/links markdown, URLs ni símbolos de formato. */
function realTextLength(text) {
  return String(text || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_>`|=\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/** Minúsculas y sin acentos, para comparar. */
function normalizeText(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ─────────────────────────────────────────
// Relevancia IA
// ─────────────────────────────────────────
// term: texto normalizado (sin acentos). prefix: true => coincide como prefijo (automatiz -> automatización).
const AI_KEYWORDS = [
  { term: 'inteligencia artificial', weight: 3 }, { term: 'artificial intelligence', weight: 3 },
  { term: 'ia generativa', weight: 3 }, { term: 'generative ai', weight: 3 },
  { term: 'openai', weight: 3 }, { term: 'chatgpt', weight: 3 }, { term: 'gpt', weight: 3 },
  { term: 'gemini', weight: 3 }, { term: 'claude', weight: 3 }, { term: 'anthropic', weight: 3 },
  { term: 'llm', weight: 3 }, { term: 'llms', weight: 3 }, { term: 'deepseek', weight: 3 },
  { term: 'copilot', weight: 3 }, { term: 'mistral', weight: 2 }, { term: 'grok', weight: 2 },
  { term: 'perplexity', weight: 2 }, { term: 'midjourney', weight: 3 }, { term: 'sora', weight: 2 },
  { term: 'hugging face', weight: 3 }, { term: 'machine learning', weight: 3 },
  { term: 'aprendizaje automatico', weight: 3 }, { term: 'deep learning', weight: 3 },
  { term: 'red neuronal', weight: 3 }, { term: 'redes neuronales', weight: 3 },
  { term: 'chatbot', weight: 3, prefix: true }, { term: 'qwen', weight: 3 },
  { term: 'modelo de lenguaje', weight: 3 }, { term: 'modelos de lenguaje', weight: 3 },
  { term: 'agente de ia', weight: 3 }, { term: 'agentes de ia', weight: 3 },
  { term: 'ai agent', weight: 3, prefix: true },
  { term: 'ia', weight: 2 }, { term: 'ai', weight: 2 }, { term: 'nvidia', weight: 2 },
  { term: 'agente', weight: 2 }, { term: 'agentes', weight: 2 }, { term: 'agentic', weight: 2 },
  { term: 'automatiz', weight: 2, prefix: true }, { term: 'automation', weight: 2 },
  { term: 'modelo', weight: 1 }, { term: 'modelos', weight: 1 }, { term: 'algoritmo', weight: 1, prefix: true },
  { term: 'robot', weight: 1, prefix: true }, { term: 'gpu', weight: 1 }, { term: 'gpus', weight: 1 }
];

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEYWORD_REGEXES = AI_KEYWORDS.map(k => ({
  ...k,
  re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(k.term)}${k.prefix ? '' : '(?![\\p{L}\\p{N}])'}`, 'u')
}));

/** Devuelve los términos IA presentes (distintos) en un texto. */
function matchedAiKeywords(text) {
  const norm = normalizeText(text);
  return KEYWORD_REGEXES.filter(k => k.re.test(norm)).map(k => k.term);
}

function keywordScore(text) {
  const norm = normalizeText(text);
  return KEYWORD_REGEXES.reduce((acc, k) => acc + (k.re.test(norm) ? k.weight : 0), 0);
}

/** Puntuación de relevancia IA: el título pesa el doble que el resumen (resumen con tope). */
function aiRelevanceScore(title, body = '') {
  return keywordScore(title) * 2 + Math.min(keywordScore(String(body).slice(0, 2000)), 8);
}

// ─────────────────────────────────────────
// Frescura
// ─────────────────────────────────────────
function itemDate(item) {
  const raw = item && (item.isoDate || item.pubDate || item.published || item.updated);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ageHours(item, now = Date.now()) {
  const d = itemDate(item);
  return d ? (now - d.getTime()) / 3600000 : null;
}

/** Sin fecha => se considera fresco (no se puede verificar). */
function isFresh(item, { maxAgeHours = DEFAULT_MAX_AGE_HOURS, now = Date.now() } = {}) {
  const age = ageHours(item, now);
  return age === null || age <= maxAgeHours;
}

// ─────────────────────────────────────────
// Normalización y deduplicación
// ─────────────────────────────────────────
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|dclid|mc_cid|mc_eid|igshid|ref|ref_src|source|_ga|_gl|cmpid|ncid|ito)$/i;

/** URL canónica para comparar: sin protocolo, www, tracking, hash ni slash final. */
function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(cleanCapturedUrl(String(url).trim()));
    const host = u.hostname.toLowerCase().replace(/^(www|m|amp)\./, '');
    const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const pathname = (u.pathname.replace(/\/amp\/?$/i, '').replace(/\/+$/, '') || '');
    const qs = params.length ? `?${new URLSearchParams(params).toString()}` : '';
    return `${host}${pathname}${qs}`.toLowerCase();
  } catch {
    return String(url).trim().toLowerCase();
  }
}

function normalizeTitle(title) {
  return normalizeText(decodeEntities(title)).replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function titleTokens(title) {
  return new Set(normalizeTitle(title).split(' ').filter(w => w.length > 2));
}

/** Títulos iguales tras normalizar, o muy parecidos (Jaccard >= 0.8 con 4+ palabras). */
function titlesMatch(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size < 4 || tb.size < 4) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter) >= 0.8;
}

/** Limpia URLs capturadas de texto libre: quita ) ] . , ; : ! ? comillas finales y < > envolventes. */
function cleanCapturedUrl(url) {
  let u = String(url || '').trim().replace(/^<|>$/g, '');
  for (;;) {
    const before = u;
    u = u.replace(/[.,;:!?'"’”»]+$/, '');
    // Paréntesis/corchetes de cierre sin su apertura (p.ej. "(ver https://x.com/a)")
    if (u.endsWith(')') && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length) u = u.slice(0, -1);
    if (u.endsWith(']') && (u.match(/\[/g) || []).length < (u.match(/\]/g) || []).length) u = u.slice(0, -1);
    if (u.endsWith('}') && (u.match(/\{/g) || []).length < (u.match(/\}/g) || []).length) u = u.slice(0, -1);
    if (u === before) break;
  }
  return u;
}

/** Primera URL de un texto (markdown incluido), ya limpia. */
function extractFirstUrl(text) {
  const md = String(text || '').match(/\]\((https?:\/\/[^\s)]+)\)/);
  if (md) return cleanCapturedUrl(md[1]);
  const m = String(text || '').match(/https?:\/\/[^\s<>"'`]+/);
  return m ? cleanCapturedUrl(m[0]) : null;
}

// ─────────────────────────────────────────
// Historial compartido (published_news.json)
// ─────────────────────────────────────────
function loadHistory(file = HISTORY_PATH) {
  try {
    if (!fs.existsSync(file)) return [];
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const arr = Array.isArray(data) ? data : (data.entries || []);
    return arr.filter(e => e && (e.url || e.title));
  } catch (e) {
    console.log(`⚠️ Error al leer historial ${path.basename(file)}: ${e.message}`);
    return [];
  }
}

/**
 * ¿Ya se publicó? Compara URL normalizada o título similar.
 * channels: limita a ciertos canales (p.ej. ['video_news']); por defecto todos.
 */
function isInHistory(history, { url, title } = {}, { channels = null } = {}) {
  const nu = url ? normalizeUrl(url) : '';
  return (history || []).some(e => {
    if (channels && !channels.includes(e.channel)) return false;
    if (nu && e.url && normalizeUrl(e.url) === nu) return true;
    return Boolean(title && e.title && titlesMatch(title, e.title));
  });
}

function addToHistory(history, { url, title = '', channel = 'unknown', date = new Date().toISOString() }, max = HISTORY_MAX) {
  const nu = normalizeUrl(url);
  const rest = (history || []).filter(e => !(normalizeUrl(e.url) === nu && e.channel === channel));
  rest.push({ url: nu, link: url, title: String(title || '').trim(), date, channel });
  rest.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return rest.slice(-max);
}

function mergeHistories(a, b, max = HISTORY_MAX) {
  let merged = [...(a || [])];
  for (const e of b || []) merged = addToHistory(merged, e, max * 2);
  return merged.slice(-max);
}

function saveHistory(history, file = HISTORY_PATH) {
  fs.writeFileSync(file, `${JSON.stringify(history.slice(-HISTORY_MAX), null, 2)}\n`);
}

function recordPublished(entry, file = HISTORY_PATH) {
  if (!entry || !entry.url) return null;
  const updated = addToHistory(loadHistory(file), entry);
  saveHistory(updated, file);
  return updated;
}

// ─────────────────────────────────────────
// RSS / Atom (parser mínimo)
// ─────────────────────────────────────────
function getTag(block, name) {
  const re = new RegExp(`<${escapeRegex(name)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegex(name)}>`, 'i');
  const m = block.match(re);
  return m ? stripCdata(m[1]).trim() : '';
}

function getAttr(tag, attr) {
  const m = String(tag || '').match(new RegExp(`\\s${escapeRegex(attr)}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

function parseFeed(xml, feedUrl = '') {
  const src = String(xml || '');
  const blocks = src.match(/<item\b[\s\S]*?<\/item>/gi) || src.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map(b => {
    let link = decodeEntities(getTag(b, 'link'));
    if (!/^https?:\/\//i.test(link)) {
      const atomLinks = b.match(/<link\b[^>]*>/gi) || [];
      const alt = atomLinks.find(t => !/rel=["'](?!alternate)/i.test(t)) || atomLinks[0];
      link = alt ? getAttr(alt, 'href') : '';
    }
    const unescapeHtml = s => (/&lt;\/?[a-z]/i.test(s) && !/<[a-z]/i.test(s) ? decodeEntities(s) : s);
    const encoded = unescapeHtml(getTag(b, 'content:encoded') || getTag(b, 'content'));
    const description = unescapeHtml(getTag(b, 'description') || getTag(b, 'summary'));
    // weblogssl (xataka/genbeta) mete el artículo completo en <description>: usamos el más largo
    const contentHtml = encoded.length >= description.length ? encoded : description;
    const enclosureTag = (b.match(/<enclosure\b[^>]*>/i) || [])[0];
    const mediaTag = (b.match(/<media:(?:content|thumbnail)\b[^>]*>/i) || [])[0];
    const pubDate = getTag(b, 'pubDate') || getTag(b, 'dc:date') || getTag(b, 'published') || getTag(b, 'updated');
    return {
      title: htmlToText(getTag(b, 'title')),
      link: link.trim(),
      pubDate,
      isoDate: pubDate && !Number.isNaN(new Date(pubDate).getTime()) ? new Date(pubDate).toISOString() : null,
      contentHtml,
      contentSnippet: htmlToText(description || encoded).slice(0, 1500),
      enclosureUrl: enclosureTag ? getAttr(enclosureTag, 'url') : '',
      mediaUrl: mediaTag ? getAttr(mediaTag, 'url') : '',
      feedUrl
    };
  }).filter(i => i.link);
}

async function fetchFeed(url, { timeoutMs = 12000, fetchImpl } = {}) {
  const res = await fetchText(url, { fetchImpl, headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' } }, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseFeed(res.text, url);
  if (!items.length) throw new Error('El feed no contiene items (¿HTML en lugar de RSS?)');
  return items;
}

/** Lee todos los feeds en paralelo (Promise.allSettled). Nunca lanza. */
async function fetchFeeds(urls, { timeoutMs = 12000, fetchImpl, log = console.log } = {}) {
  const results = await Promise.allSettled(urls.map(u => fetchFeed(u, { timeoutMs, fetchImpl })));
  const items = [];
  const errors = [];
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled') {
      r.value.forEach(item => items.push({ ...item, feedIndex: idx }));
      log(`📡 Feed OK (${r.value.length} items): ${urls[idx]}`);
    } else {
      errors.push({ url: urls[idx], error: r.reason?.message || String(r.reason) });
      log(`⚠️ Error al leer feed ${urls[idx]}: ${r.reason?.message || r.reason}`);
    }
  });
  return { items, errors };
}

/**
 * Filtra y ordena candidatos: frescos, no publicados, relevantes para IA.
 * Orden: relevancia IA (con tope) menos penalización por antigüedad; desempate por orden del feed.
 */
function rankCandidates(items, {
  history = [], historyChannels = null, isSeen = () => false, maxAgeHours = DEFAULT_MAX_AGE_HOURS,
  minScore = 4, allowNonAi = false, now = Date.now(), log = () => {}
} = {}) {
  const seenKeys = new Set();
  const seenTitles = [];
  const stats = { total: 0, duplicates: 0, stale: 0, inHistory: 0, seen: 0, lowScore: 0 };
  const pool = [];
  for (const item of items || []) {
    if (!item || !item.link) continue;
    stats.total++;
    const key = normalizeUrl(item.link);
    if (seenKeys.has(key) || seenTitles.some(t => titlesMatch(t, item.title))) { stats.duplicates++; continue; }
    seenKeys.add(key);
    if (item.title) seenTitles.push(item.title);
    if (!isFresh(item, { maxAgeHours, now })) { stats.stale++; continue; }
    if (isInHistory(history, { url: item.link, title: item.title }, { channels: historyChannels })) { stats.inHistory++; log(`⏭️ Ya publicada (historial compartido): "${item.title}"`); continue; }
    if (isSeen(item)) { stats.seen++; continue; }
    const aiScore = aiRelevanceScore(item.title, item.contentSnippet);
    const age = ageHours(item, now);
    const rank = Math.min(aiScore, 14) - (age === null ? 12 : age) / 12;
    pool.push({ ...item, aiScore, ageHours: age, rank });
  }
  const byRank = (a, b) => (b.rank - a.rank) || ((a.feedIndex ?? 0) - (b.feedIndex ?? 0));
  const relevant = pool.filter(c => c.aiScore >= minScore).sort(byRank);
  stats.lowScore = pool.length - relevant.length;
  if (relevant.length || !allowNonAi) return { candidates: relevant, stats };
  // Sin noticias IA: se permite la más reciente de negocios (solo si el caller lo autoriza)
  const fallback = pool.sort((a, b) => ((a.ageHours ?? 999) - (b.ageHours ?? 999)));
  return { candidates: fallback, stats };
}

// ─────────────────────────────────────────
// Detección de basura (Jina devuelve 200 aunque el sitio responda 403/Cloudflare)
// ─────────────────────────────────────────
const HARD_GARBAGE = [
  /target url returned error/i, /just a moment\.\.\./i, /attention required!?\s*\|?\s*cloudflare/i,
  /attention required/i, /checking your browser/i, /verify you are human/i, /cf-browser-verification/i,
  /error 10(?:06|10|12|15|20)\b/i, /ddos protection by/i
];
const SOFT_GARBAGE = [
  /access denied/i, /acceso denegado/i, /captcha/i, /enable javascript/i, /habilita javascript/i,
  /are you a robot/i, /request blocked/i, /403 forbidden/i, /404 not found/i, /page not found/i,
  /p[aá]gina no encontrada/i, /please enable cookies/i
];

/** Devuelve el motivo si el texto es basura, o null si parece un artículo real. */
function detectGarbage(text, { minChars = 400 } = {}) {
  const t = String(text || '');
  if (!t.trim()) return 'texto vacío';
  const head = t.slice(0, 1500);
  const hard = HARD_GARBAGE.find(re => re.test(head));
  if (hard) return `bloqueo detectado (${hard.source})`;
  const len = realTextLength(t);
  if (len < minChars) return `texto demasiado corto (${len} caracteres reales)`;
  if (len < 2500) {
    const soft = SOFT_GARBAGE.find(re => re.test(head));
    if (soft) return `posible página de error/bloqueo (${soft.source})`;
  }
  return null;
}

// ─────────────────────────────────────────
// Imágenes
// ─────────────────────────────────────────
const BAD_IMAGE = /(logo|avatar|icon|favicon|sprite|pixel|tracking|tracker|spacer|blank\.|badge|emoji|gravatar|placeholder|advert|\/ads?\/|doubleclick|googlesyndication|facebook\.com\/tr|\/1x1|author|profile|newsletter|banner-ad|loading|lazy-?load)/i;
const MIN_IMAGE_SIDE = 200;

function isUsefulImageUrl(url, { width, height } = {}) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  const p = `${u.pathname}${u.search}`;
  if (/\.(svg|gif|ico)(?:$|[?#])/i.test(u.pathname)) return false;
  if (BAD_IMAGE.test(p)) return false;
  const w = parseInt(width, 10);
  const h = parseInt(height, 10);
  if ((w && w < MIN_IMAGE_SIDE) || (h && h < MIN_IMAGE_SIDE)) return false;
  const dims = p.match(/(?:^|[^0-9])(\d{2,4})[x×](\d{2,4})(?:[^0-9]|$)/i);
  if (dims && (parseInt(dims[1], 10) < MIN_IMAGE_SIDE || parseInt(dims[2], 10) < MIN_IMAGE_SIDE)) return false;
  const blogs = u.pathname.match(/\/(\d{2,4})_(\d{2,4})\.[a-z]+$/i); // i.blogs.es/<id>/<w>_<h>.jpg
  if (blogs && parseInt(blogs[1], 10) < MIN_IMAGE_SIDE) return false;
  const qw = u.searchParams.get('w') || u.searchParams.get('width');
  if (qw && parseInt(qw, 10) < MIN_IMAGE_SIDE) return false;
  return true;
}

function imageKey(url) {
  try {
    const u = new URL(url);
    const p = u.pathname
      .replace(/\/\d{2,4}_\d{2,4}(\.\w+)$/, '$1') // i.blogs.es/<id>/<slug>/1024_2000.jpg
      .replace(/-\d{2,4}x\d{2,4}(\.\w+)$/, '$1'); // wp-content/uploads/foto-768x414.jpg
    return `${u.hostname.replace(/^www\./, '')}${p}`.toLowerCase();
  } catch { return String(url).toLowerCase(); }
}

function dedupeImages(urls) {
  const seen = new Set();
  return (urls || []).filter(u => {
    if (!u) return false;
    const k = imageKey(u);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Imágenes <img> útiles de un fragmento HTML (src, data-src, data-lazy-src o primera de srcset). */
function extractImagesFromHtml(html, baseUrl) {
  const out = [];
  for (const tag of String(html || '').match(/<img\b[^>]*>/gi) || []) {
    let src = getAttr(tag, 'data-src') || getAttr(tag, 'data-lazy-src') || getAttr(tag, 'data-original') || getAttr(tag, 'src');
    if (!src || src.startsWith('data:')) {
      const srcset = getAttr(tag, 'srcset') || getAttr(tag, 'data-srcset');
      src = srcset ? srcset.split(',').map(s => s.trim().split(/\s+/)[0]).pop() : '';
    }
    if (!src) continue;
    try { src = new URL(src, baseUrl || undefined).href; } catch { continue; }
    if (isUsefulImageUrl(src, { width: getAttr(tag, 'width'), height: getAttr(tag, 'height') })) out.push(src);
  }
  return dedupeImages(out);
}

function extractOgImage(html) {
  const s = String(html || '');
  const m = s.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
            s.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i) ||
            s.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i) ||
            s.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i);
  const url = m ? decodeEntities(m[1]) : '';
  return /^https?:\/\//i.test(url) ? url : null;
}

function imagesFromMarkdown(md) {
  const out = [];
  const re = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
  let m;
  while ((m = re.exec(String(md || ''))) !== null) if (isUsefulImageUrl(m[1])) out.push(m[1]);
  return dedupeImages(out);
}

/** Recorta un bloque balanceado <tag ...>...</tag> a partir de la posición del tag de apertura. */
function sliceBalanced(html, start, tagName) {
  const re = new RegExp(`<(\\/?)${tagName}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].endsWith('/>')) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}

/** HTML del cuerpo del artículo: <article> más largo, [itemprop=articleBody], .article-content o <main>. */
function extractArticleBodyHtml(html) {
  const s = String(html || '');
  const finders = [
    /<article\b[^>]*>/gi,
    /<(\w+)\b[^>]*itemprop=["']articleBody["'][^>]*>/gi,
    /<(\w+)\b[^>]*class=["'][^"']*\b(?:article-content|article-body|entry-content|post-content)\b[^"']*["'][^>]*>/gi,
    /<main\b[^>]*>/gi
  ];
  for (const re of finders) {
    const blocks = [];
    let m;
    while ((m = re.exec(s)) !== null) {
      const tagName = (m[1] || m[0].match(/^<(\w+)/)[1]).toLowerCase();
      blocks.push(sliceBalanced(s, m.index, tagName));
    }
    if (blocks.length) return blocks.sort((a, b) => b.length - a.length)[0];
  }
  return '';
}

// ─────────────────────────────────────────
// Extracción de texto
// ─────────────────────────────────────────
/** Texto completo del RSS (content:encoded/description) si supera minChars de texto real. */
function getFullRssText(item, minChars = 800) {
  if (!item || !item.contentHtml) return null;
  const text = htmlToText(item.contentHtml)
    .split('\n')
    .filter(l => !/appeared first on|fue publicada originalmente en|^la noticia .* fue publicada/i.test(l))
    .join('\n')
    .trim();
  return realTextLength(text) > minChars ? text : null;
}

async function fetchJina(url, { timeoutMs = 20000, apiKey = process.env.JINA_API_KEY, targetSelector = 'article', fetchImpl } = {}) {
  // OJO: no usar un User-Agent de navegador aquí; el Cloudflare de r.jina.ai responde 403 "Just a moment..."
  const headers = { 'User-Agent': JINA_USER_AGENT, 'X-Return-Format': 'markdown', 'X-Remove-Selector': JINA_REMOVE_SELECTOR, Accept: 'text/plain' };
  if (targetSelector) headers['X-Target-Selector'] = targetSelector;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetchText(`https://r.jina.ai/${url}`, { headers, fetchImpl }, timeoutMs);
  if (!res.ok) throw new Error(`Jina HTTP ${res.status}`);
  return res.text;
}

/** Jina Reader endurecido: primero con X-Target-Selector=article, luego sin él. Rechaza basura. */
async function extractWithJina(url, { minChars = 400, log = console.log, ...opts } = {}) {
  for (const targetSelector of ['article', null]) {
    try {
      const text = await fetchJina(url, { ...opts, targetSelector });
      const reason = detectGarbage(text, { minChars });
      if (!reason) return { text, method: targetSelector ? 'jina:article' : 'jina' };
      log(`   ⚠️ Jina (${targetSelector || 'página completa'}) descartado: ${reason}`);
    } catch (e) {
      log(`   ⚠️ Jina (${targetSelector || 'página completa'}) falló: ${e.message}`);
    }
  }
  return null;
}

/**
 * Extrae el texto de una noticia: RSS completo -> Jina -> fallback opcional (p.ej. Scrapling).
 * Devuelve { text, method, images } o null si todo falla o es basura.
 */
async function extractArticleContent(item, { minRssChars = 800, minChars = 400, useRss = true, fallback = null, log = console.log, ...jinaOpts } = {}) {
  if (useRss) {
    const rssText = getFullRssText(item, minRssChars);
    if (rssText) return { text: rssText, method: 'rss', images: extractImagesFromHtml(item.contentHtml, item.link) };
  }
  const jina = await extractWithJina(item.link, { minChars, log, ...jinaOpts });
  if (jina) return { ...jina, images: imagesFromMarkdown(jina.text) };
  if (typeof fallback === 'function') {
    try {
      const text = await fallback(item.link);
      const reason = text ? detectGarbage(text, { minChars }) : 'sin texto';
      if (!reason) return { text, method: 'scrapling', images: [] };
      log(`   ⚠️ Fallback descartado: ${reason}`);
    } catch (e) {
      log(`   ⚠️ Fallback falló: ${e.message}`);
    }
  }
  return null;
}

/** Recorre candidatos en orden hasta extraer uno válido (no alimenta basura al LLM). */
async function pickArticle(candidates, { maxAttempts = 5, log = console.log, ...opts } = {}) {
  for (const item of (candidates || []).slice(0, maxAttempts)) {
    log(`📰 Candidata: "${item.title}" (IA=${item.aiScore ?? '?'}, ${item.ageHours != null ? `${item.ageHours.toFixed(1)}h` : 'sin fecha'}) ${item.link}`);
    const extracted = await extractArticleContent(item, { log, ...opts });
    if (extracted) return { item, ...extracted };
    log('   ↪️ Sin texto utilizable; probando la siguiente candidata...');
  }
  return null;
}

/** ¿El issue parece una solicitud de contenido para el publicador de artículos? */
function isContentRequestIssue(issue) {
  if (!issue) return false;
  const labels = (issue.labels || []).map(l => normalizeText(typeof l === 'string' ? l : l.name));
  const title = String(issue.title || '');
  const body = String(issue.body || '');
  if (labels.some(l => ['bug', 'editorial', 'video'].includes(l))) return false;
  if (/GUION:/i.test(body) || /\[EDITORIAL\]/i.test(title)) return false;
  const hasUrl = Boolean(extractFirstUrl(body) || extractFirstUrl(title));
  if (!hasUrl) return false;
  if (labels.some(l => ['publicar', 'articulo', 'noticia', 'post'].includes(l))) return true;
  if (/^\s*\[(POST|ARTICULO|ARTÍCULO|NOTICIA|PUBLICAR)\]/i.test(title)) return true;
  return Boolean(extractFirstUrl(body));
}

/** Quita el prefijo [POST]/[ARTICULO]... del título para usarlo como instrucción. */
function issueInstruction(title) {
  return String(title || '').replace(/^\s*\[(POST|ARTICULO|ARTÍCULO|NOTICIA|PUBLICAR)\]\s*/i, '').trim() || 'Ninguna';
}

module.exports = {
  HISTORY_PATH, HISTORY_MAX, DEFAULT_MAX_AGE_HOURS, USER_AGENT, JINA_REMOVE_SELECTOR, AI_KEYWORDS,
  fetchText, decodeEntities, htmlToText, realTextLength, normalizeText,
  matchedAiKeywords, aiRelevanceScore, itemDate, ageHours, isFresh,
  normalizeUrl, normalizeTitle, titlesMatch, cleanCapturedUrl, extractFirstUrl,
  loadHistory, isInHistory, addToHistory, mergeHistories, saveHistory, recordPublished,
  parseFeed, fetchFeed, fetchFeeds, rankCandidates,
  detectGarbage, isUsefulImageUrl, dedupeImages, extractImagesFromHtml, extractOgImage, imagesFromMarkdown,
  extractArticleBodyHtml, getFullRssText, fetchJina, extractWithJina, extractArticleContent, pickArticle,
  isContentRequestIssue, issueInstruction
};

// CLI: fusionar historiales (lo usa .github/scripts/persist_state.sh para resolver conflictos de rebase)
if (require.main === module) {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === 'merge-history' && file) {
    const merged = mergeHistories(loadHistory(HISTORY_PATH), loadHistory(path.resolve(file)));
    saveHistory(merged);
    console.log(`✅ Historial fusionado: ${merged.length} entradas en ${path.basename(HISTORY_PATH)}`);
  } else {
    console.log('Uso: node news_sources.js merge-history <archivo.json>');
    process.exitCode = 1;
  }
}
