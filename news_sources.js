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
// Feeds Curados (Español + Fuentes Primarias Técnicas/B2B en Inglés)
// ─────────────────────────────────────────
const DEFAULT_FEEDS = [
  // Fuentes primarias técnicas, agentes, automatización y B2B (alta densidad de "carnita")
  'https://blog.n8n.io/rss/',
  'https://simonwillison.net/atom/everything/',
  'https://huggingface.co/blog/feed.xml',
  'https://techcrunch.com/category/artificial-intelligence/feed/',
  'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
  'https://hnrss.org/newest?q=AI+OR+LLM+OR+agent&points=80',
  // Medios en español filtrados por IA y tecnología práctica
  'https://www.xataka.com/tag/inteligencia-artificial/rss2.xml',
  'https://wwwhatsnew.com/feed/',
  'https://feeds.weblogssl.com/genbeta',
  'https://feeds.weblogssl.com/xataka2',
  'https://www.entrepreneur.com/es/feed'
];

// ─────────────────────────────────────────
// Relevancia IA y Densidad Práctica ("Carnita")
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
  { term: 'mcp', weight: 3 }, { term: 'model context protocol', weight: 3 },
  { term: 'n8n', weight: 3 }, { term: 'langchain', weight: 3 }, { term: 'llamaindex', weight: 3 },
  { term: 'ollama', weight: 3 }, { term: 'vllm', weight: 3 }, { term: 'fine tuning', weight: 3 },
  { term: 'ia', weight: 2 }, { term: 'ai', weight: 2 }, { term: 'nvidia', weight: 2 },
  { term: 'agente', weight: 2 }, { term: 'agentes', weight: 2 }, { term: 'agentic', weight: 2 },
  { term: 'automatiz', weight: 2, prefix: true }, { term: 'automation', weight: 2 },
  { term: 'open source', weight: 2 }, { term: 'codigo abierto', weight: 2 }, { term: 'open weights', weight: 2 },
  { term: 'rag', weight: 2 }, { term: 'workflow', weight: 2, prefix: true },
  { term: 'modelo', weight: 1 }, { term: 'modelos', weight: 1 }, { term: 'algoritmo', weight: 1, prefix: true },
  { term: 'robot', weight: 1, prefix: true }, { term: 'gpu', weight: 1 }, { term: 'gpus', weight: 1 }
];

// Términos que indican "carnita" práctica (herramientas, costos, benchmarks, APIs, casos de uso reales)
const MEAT_KEYWORDS = [
  { term: 'api', weight: 2 }, { term: 'apis', weight: 2 }, { term: 'sdk', weight: 2 },
  { term: 'open source', weight: 2.5 }, { term: 'codigo abierto', weight: 2.5 }, { term: 'open weights', weight: 2.5 },
  { term: 'benchmark', weight: 2, prefix: true }, { term: 'workflow', weight: 2.5, prefix: true },
  { term: 'flujo de trabajo', weight: 2.5 }, { term: 'flujos de trabajo', weight: 2.5 },
  { term: 'caso de uso', weight: 2.5 }, { term: 'casos de uso', weight: 2.5 }, { term: 'use case', weight: 2, prefix: true },
  { term: 'mcp', weight: 2.5 }, { term: 'rag', weight: 2 }, { term: 'n8n', weight: 3 },
  { term: 'precio', weight: 1.5, prefix: true }, { term: 'pricing', weight: 2 }, { term: 'cost', weight: 1.5, prefix: true },
  { term: 'ahorr', weight: 1.5, prefix: true }, { term: 'produccion', weight: 1.5 }, { term: 'postgres', weight: 1.5 },
  { term: 'token', weight: 1.5, prefix: true }, { term: 'latencia', weight: 2 }, { term: 'latency', weight: 2 },
  { term: 'productividad', weight: 1.5 }, { term: 'herramienta', weight: 1.5, prefix: true },
  { term: 'github', weight: 1.5 }, { term: 'repositorio', weight: 1.5, prefix: true },
  { term: 'b2b', weight: 2 }, { term: 'saas', weight: 2 }, { term: 'enterprise', weight: 1.5 },
  { term: 'pyme', weight: 2, prefix: true }, { term: 'freelance', weight: 2, prefix: true },
  { term: 'agencia', weight: 1.5, prefix: true }, { term: 'codigo', weight: 1.5 }, { term: 'coding', weight: 1.5 }
];

// Términos de "salseo / humo / clickbait" sin utilidad práctica para el emprendedor o builder
const FLUFF_KEYWORDS = [
  { term: 'demanda', weight: 2.5 }, { term: 'demandan', weight: 3 }, { term: 'lawsuit', weight: 3 },
  { term: 'juicio', weight: 2.5 }, { term: 'tribunal', weight: 2.5 }, { term: 'policia', weight: 3 },
  { term: 'arresto', weight: 2.5 }, { term: 'polemica', weight: 2.5 }, { term: 'escandalo', weight: 2.5 },
  { term: 'homicidio', weight: 3.5 }, { term: 'adolescente', weight: 3, prefix: true },
  { term: 'crisis mental', weight: 3.5 }, { term: 'suicidio', weight: 4 }, { term: 'catastrofe', weight: 2.5 },
  { term: 'apocalipsis', weight: 3 }, { term: 'extincion', weight: 3 }, { term: 'famoso', weight: 2, prefix: true },
  { term: 'celebridad', weight: 2.5, prefix: true }, { term: 'novio', weight: 2.5, prefix: true },
  { term: 'horoscopo', weight: 3 }
];

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const buildRegexList = list => list.map(k => ({
  ...k,
  re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(k.term)}${k.prefix ? '' : '(?![\\p{L}\\p{N}])'}`, 'u')
}));

const KEYWORD_REGEXES = buildRegexList(AI_KEYWORDS);
const MEAT_REGEXES = buildRegexList(MEAT_KEYWORDS);
const FLUFF_REGEXES = buildRegexList(FLUFF_KEYWORDS);

/** Devuelve los términos IA presentes (distintos) en un texto. */
function matchedAiKeywords(text) {
  const norm = normalizeText(text);
  return KEYWORD_REGEXES.filter(k => k.re.test(norm)).map(k => k.term);
}

function keywordScore(text) {
  const norm = normalizeText(text);
  return KEYWORD_REGEXES.reduce((acc, k) => acc + (k.re.test(norm) ? k.weight : 0), 0);
}

/** Puntuación de "carnita" práctica (positiva por herramientas/métricas, negativa por salseo/demandas). */
function meatScore(title, body = '') {
  const normTitle = normalizeText(title);
  const normBody = normalizeText(String(body).slice(0, 2000));
  const meatTitle = MEAT_REGEXES.reduce((acc, k) => acc + (k.re.test(normTitle) ? k.weight * 1.5 : 0), 0);
  const meatBody = MEAT_REGEXES.reduce((acc, k) => acc + (k.re.test(normBody) ? k.weight * 0.8 : 0), 0);
  const hasHardNumbers = /(\b\d+(?:[.,]\d+)?\s*(?:%|ms|gb|tb|x|usd|eur|tokens|millones|billion|million)\b|\$\s*\d+)/i.test(`${title} ${body}`);
  const numberBonus = hasHardNumbers ? 2 : 0;
  const fluffTitle = FLUFF_REGEXES.reduce((acc, k) => acc + (k.re.test(normTitle) ? k.weight * 1.8 : 0), 0);
  const fluffBody = FLUFF_REGEXES.reduce((acc, k) => acc + (k.re.test(normBody) ? k.weight * 0.8 : 0), 0);
  return Math.min(meatTitle + Math.min(meatBody, 6) + numberBonus, 14) - Math.min(fluffTitle + fluffBody, 12);
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

// Entidades principales para evitar hablar 4 veces seguidas de la misma marca (fatiga temática)
const MAJOR_ENTITIES = [
  { id: 'openai', re: /\b(openai|chatgpt|gpt-?\d|sam altman|sora)\b/i },
  { id: 'anthropic', re: /\b(anthropic|claude)\b/i },
  { id: 'google', re: /\b(google|gemini|deepmind)\b/i },
  { id: 'meta', re: /\b(meta|llama|muse wonder|zuckerberg)\b/i },
  { id: 'nvidia', re: /\b(nvidia|rtx|cuda|jensen huang)\b/i },
  { id: 'microsoft', re: /\b(microsoft|copilot|nadella)\b/i },
  { id: 'apple', re: /\b(apple|siri|apple intelligence)\b/i },
  { id: 'xai', re: /\b(xai|grok|elon musk|spacex)\b/i }
];

function detectEntities(text) {
  const norm = normalizeText(text);
  return MAJOR_ENTITIES.filter(e => e.re.test(norm)).map(e => e.id);
}

/**
 * Penaliza ligeramente una noticia si su protagonista principal ya apareció en las últimas entradas del historial,
 * forzando rotación de ecosistemas, herramientas open-source y casos de negocio.
 */
function entityFatiguePenalty(title, history = [], windowSize = 4) {
  if (!history || !history.length) return 0;
  const itemEntities = detectEntities(title);
  if (!itemEntities.length) return 0;
  const recent = history.slice(-windowSize);
  let penalty = 0;
  recent.forEach((h, idx) => {
    const recencyWeight = (idx + 1) / recent.length; // más reciente = mayor peso
    const histEntities = detectEntities(h.title || h.url || '');
    if (itemEntities.some(e => histEntities.includes(e))) {
      penalty += 2.2 * recencyWeight;
    }
  });
  return Math.min(penalty, 5.5);
}

/**
 * Filtra y ordena candidatos: frescos, no publicados, relevantes para IA y con alta densidad práctica ("carnita").
 * Orden: relevancia IA + bonus de carnita - penalización por fatiga de marca - antigüedad; desempate por orden del feed.
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
    const meat = meatScore(item.title, item.contentSnippet);
    const fatigue = entityFatiguePenalty(item.title, history);
    const age = ageHours(item, now);
    const rank = Math.min(aiScore, 14) + meat - fatigue - (age === null ? 12 : age) / 12;
    pool.push({
      ...item,
      aiScore,
      meatScore: meat,
      meat: Number(meat.toFixed(1)),
      score: Number(rank.toFixed(1)),
      fatiguePenalty: fatigue,
      ageHours: age,
      rank
    });
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

// ─────────────────────────────────────────
// Curaduría Editorial: Datos Duros, Ángulos Rotativos y Anti-Clichés
// ─────────────────────────────────────────
const BANNED_CLICHES = [
  'atención emprendedor',
  'cambiar todas las reglas del juego',
  'cambiar las reglas del juego',
  'reescribir las reglas del juego',
  'operan veinticuatro siete',
  'operan 24 horas continuas',
  'ochenta y cinco por ciento de las empresas',
  '85% de las empresas',
  'no compiten por precio: cobran por el verdadero valor',
  'no compitas por precio: cobra por el valor',
  'mientras los dinosaurios',
  'el momento perfecto no existe'
];

const EDITORIAL_ANGLES = [
  {
    id: 'tactical_tool',
    name: 'DESTRIPE TÁCTICO Y STACK',
    tag: '✦ DESTRIPE TÁCTICO ✦',
    matchRe: /\b(lanz[ao]|release|api|sdk|open[\s-]source|codigo abierto|open[\s-]weights|github|herramienta|tool|workflow|n8n|mcp|plugin|extension|browser|navegador|app)\b/i,
    directive: 'Enfócate en DESTRIPAR LA HERRAMIENTA O TECNOLOGÍA: explica exactamente qué hace bajo el capó, qué limitación anterior supera y describe 1 flujo de trabajo concreto (paso a paso) donde una agencia, dev o negocio puede conectarla esta misma semana.',
    fbDirective: 'Enfócate en DESTRIPAR LA HERRAMIENTA O TECNOLOGÍA: explica exactamente qué hace bajo el capó, qué limitación anterior supera y describe 1 flujo de trabajo concreto (paso a paso) donde una agencia, dev o negocio puede conectarla esta misma semana.',
    videoDirective: 'Ángulo de DESTRIPE TÁCTICO: En lugar de hablar en abstracto, explica qué hace exactamente esta herramienta/modelo, cómo funciona su mecanismo técnico y en qué flujo concreto de automatización o desarrollo se conecta hoy.'
  },
  {
    id: 'roi_tear_down',
    name: 'RADIOGRAFÍA DE COSTOS Y TARIFA',
    tag: '✦ RADIOGRAFÍA DE ROI ✦',
    matchRe: /\b(precio|cost|dolar|euro|millon|billion|gratis|free|barat|tarifa|sueldo|salario|ahorr|token|finops|rentab|ingresos|revenue|credito)\b/i,
    directive: 'Enfócate en la MATEMÁTICA Y EL MARGEN: desglosa los números reales del artículo (precios, ahorro en tokens/hardware, salarios o inversión) y explica cómo esta caída de costos o nuevo modelo permite empaquetar un servicio B2B con mayor margen de ganancia.',
    fbDirective: 'Enfócate en la MATEMÁTICA Y EL MARGEN: desglosa los números reales del artículo (precios, ahorro en tokens/hardware, salarios o inversión) y explica cómo esta caída de costos o nuevo modelo permite empaquetar un servicio B2B con mayor margen de ganancia.',
    videoDirective: 'Ángulo de RADIOGRAFÍA DE ROI: Destaca las cifras económicas o de eficiencia reales del artículo y explica cómo un consultor o negocio usa esta ventaja de costos para vender soluciones de alto margen.'
  },
  {
    id: 'contrarian_truth',
    name: 'DETECTOR DE HUMO (CONTRARIAN)',
    tag: '✦ REALIDAD VS HUMO ✦',
    matchRe: /\b(fall[oa]|error|limit|riesgo|seguridad|privacidad|bloque[oa]|alucinaci|humo|problema|falsa|comprometid|corta|rechaz|restring)\b/i,
    directive: 'Enfócate en el ANÁLISIS CONTRARIAN ANTI-HUMO: desinfla el hype corporativo. Explica cuál es el cuello de botella técnico real que revela la nota (alucinaciones, seguridad, privacidad, lock-in) y cómo un arquitecto de IA serio diseña guardarraíles o usa modelos locales para no depender a ciegas.',
    fbDirective: 'Enfócate en el ANÁLISIS CONTRARIAN ANTI-HUMO: desinfla el hype corporativo. Explica cuál es el cuello de botella técnico real que revela la nota (alucinaciones, seguridad, privacidad, lock-in) y cómo un arquitecto de IA serio diseña guardarraíles o usa modelos locales para no depender a ciegas.',
    videoDirective: 'Ángulo CONTRARIAN ANTI-HUMO: Señala con bisturí dónde está fallando la promesa de las Big Tech en esta noticia, por qué usar IA sin arquitectura ni control sale caro, y cuál es la jugada profesional para blindar un negocio.'
  },
  {
    id: 'architecture_shift',
    name: 'ARQUITECTURA Y AGENTES',
    tag: '✦ ARQUITECTURA IA ✦',
    matchRe: /\b(agente|agentic|autonom|razonamiento|reasoning|arquitectura|modular|benchmark|chip|gpu|inferencia|local|memoria|contexto)\b/i,
    directive: 'Enfócate en el CAMBIO DE ARQUITECTURA: explica la diferencia técnica real (por ejemplo, pasar de simples prompts de chat a sistemas multi-agente, memoria persistente, inferencia local o verificación) y qué procesos operativos complejos ya se pueden delegar.',
    fbDirective: 'Enfócate en el CAMBIO DE ARQUITECTURA: explica la diferencia técnica real (por ejemplo, pasar de simples prompts de chat a sistemas multi-agente, memoria persistente, inferencia local o verificación) y qué procesos operativos complejos ya se pueden delegar.',
    videoDirective: 'Ángulo de ARQUITECTURA DE AGENTES: Explica el salto técnico que describe la noticia (por qué ya no hablamos de un simple chatbot) y cómo cambia la forma de construir software y automatizaciones.'
  },
  {
    id: 'market_play',
    name: 'JUGADA DE MERCADO B2B',
    tag: '✦ JUGADA DE MERCADO ✦',
    matchRe: /.*/,
    directive: 'Enfócate en la OPORTUNIDAD DE NICHO B2B: traduce esta movida de la industria en un servicio o producto específico que un freelancer, consultor o pyme en Latinoamérica puede ofrecer a clientes reales (clínicas, e-commerce, despachos, logística) antes que su competencia.',
    fbDirective: 'Enfócate en la OPORTUNIDAD DE NICHO B2B: traduce esta movida de la industria en un servicio o producto específico que un freelancer, consultor o pyme en Latinoamérica puede ofrecer a clientes reales (clínicas, e-commerce, despachos, logística) antes que su competencia.',
    videoDirective: 'Ángulo de JUGADA DE MERCADO: Traduce esta noticia en una oportunidad concreta de negocio o servicio B2B aplicable en Latinoamérica, especificando qué problema real de clientes resuelve.'
  }
];

/**
 * Extrae oraciones con cifras duras, porcentajes reales, montos en $/€ o métricas técnicas del texto
 * para inyectarlas al LLM y evitar que invente datos genéricos ("85% de las empresas").
 */
function extractHardFacts(text, maxFacts = 5) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const defaultMetric = { type: 'badge', label: 'IA B2B', badge: 'IA B2B', number: null, raw: 'IA B2B', context: '' };
  if (!clean) return { facts: [], primaryMetric: defaultMetric };

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 30 && s.length <= 240 && !/cookie|suscr[ií]b|newsletter|derechos reservados/i.test(s));

  const metricRegex = /(\b\d+(?:[.,]\d+)?\s*(?:%|por ciento|percent|millones|billones|million|billion|mil\b|k\b|d[oó]lares|euros|usd|eur|d[ií]as|horas|segundos|ms|veces|x\b|par[aá]metros|tokens|gb|tb|modelos|agentes|usuarios|empresas|pa[ií]ses|plataformas|platforms|tools|herramientas))|([\$€]\s*\d+(?:[.,]\d+)?\s*(?:M|B|K|mil|millones)?)/i;

  const facts = [];
  for (const s of sentences) {
    if (metricRegex.test(s) && facts.length < maxFacts) {
      facts.push(s);
    }
  }

  const contextSentence = facts[0] || sentences[0] || clean.slice(0, 140);

  // Detectar una métrica real corta para la Escena 3 si existe en el texto
  let primaryMetric = null;
  const pctMatch = clean.match(/\b([1-9]\d?(?:[.,]\d)?)\s*(?:%|por ciento\b|percent\b)/i);
  const moneyMatch = clean.match(/(?:[\$€]\s*(\d+(?:[.,]\d+)?)\s*(mil|M|B|K|millones)?)|(\b\d+(?:[.,]\d+)?)\s*(?:mil\s+)?(d[oó]lares|euros|USD|EUR)\b/i);
  const multMatch = clean.match(/\b([2-9]\d?)\s*(?:x|veces\s+m[aá]s)\b/i);
  const countMatch = clean.match(/\b(\d{1,4})\s+(manuscritos|modelos|agentes|navegadores|d[ií]as|empresas|estados|pa[ií]ses|usuarios|best|mejores|plataformas|platforms|tools|herramientas|workflows|flujos)\b/i);

  if (pctMatch) {
    const num = Math.round(parseFloat(pctMatch[1].replace(',', '.')));
    if (num >= 1 && num <= 99 && num !== 85) {
      primaryMetric = { type: 'percentage', label: `${num}%`, badge: `${num}%`, number: num, raw: pctMatch[0], context: contextSentence };
    }
  }
  if (!primaryMetric && moneyMatch) {
    const rawNum = (moneyMatch[1] || moneyMatch[3] || '').replace(/[.,]\d+$/, '');
    const suffix = (moneyMatch[2] || '').toUpperCase().startsWith('M') ? 'M' : (moneyMatch[2] ? 'K' : '');
    const sym = moneyMatch[0].includes('€') || /euro/i.test(moneyMatch[0]) ? '€' : '$';
    if (rawNum && rawNum.length <= 4) {
      const lbl = `${sym}${rawNum}${suffix}`;
      primaryMetric = { type: 'money', label: lbl, badge: lbl, number: null, raw: moneyMatch[0], context: contextSentence };
    }
  }
  if (!primaryMetric && multMatch) {
    const lbl = `${multMatch[1]}X`;
    primaryMetric = { type: 'multiplier', label: lbl, badge: lbl, number: null, raw: multMatch[0], context: contextSentence };
  }
  if (!primaryMetric && countMatch) {
    const lbl = `${countMatch[1]}`;
    primaryMetric = { type: 'count', label: lbl, badge: lbl, number: null, raw: countMatch[0], context: contextSentence };
  }
  if (!primaryMetric) {
    const fallbackLabel = /\bopen[\s-]?source\b|codigo abierto/i.test(clean) ? 'OPEN' : (/\bapi\b|\bsdk\b|\bmcp\b/i.test(clean) ? 'API' : 'IA B2B');
    primaryMetric = { type: 'badge', label: fallbackLabel, badge: fallbackLabel, number: null, raw: fallbackLabel, context: contextSentence };
  }

  return { facts, primaryMetric };
}

/**
 * Selecciona el mejor ángulo editorial para una noticia y rota si varios ángulos aplican.
 */
function selectEditorialAngle(item = {}, text = '', history = []) {
  const sample = `${item.title || ''} ${String(text || item.contentSnippet || '').slice(0, 1500)}`;
  const matched = EDITORIAL_ANGLES.filter(a => a.id !== 'market_play' && a.matchRe.test(sample));
  const candidates = matched.length ? matched : EDITORIAL_ANGLES;

  // Usar el tamaño del historial y el hash del título para rotar determinísticamente entre los ángulos candidatos
  const histLen = Array.isArray(history) ? history.length : 0;
  const titleSeed = String(item.title || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const chosen = candidates[(histLen + titleSeed) % candidates.length] || EDITORIAL_ANGLES[0];
  return chosen;
}

/**
 * Devuelve un array con los últimos títulos publicados para inyectar memoria anti-repetición en el prompt.
 */
function getRecentHistorySummary(history = [], limit = 6) {
  return (history || []).filter(h => h && h.title).slice(-limit).reverse().map(h => h.title);
}

/**
 * Convierte texto plano en Unicode Sans-Serif Bold (ej: "Cairn" -> "𝗖𝗮𝗶𝗿𝗻") para Facebook/Instagram/TikTok/YouTube,
 * preservando tildes y ñ mediante descomposición NFD.
 */
function toUnicodeBold(str) {
  return Array.from(String(str || '').normalize('NFD')).map(ch => {
    const code = ch.codePointAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + (code - 65)); // A-Z
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + (code - 97)); // a-z
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + (code - 48)); // 0-9
    return ch;
  }).join('');
}

/**
 * Convierte texto plano en Unicode Sans-Serif Italic (ej: "sandboxed" -> "𝘴𝘢𝘯𝘥𝘣𝘰𝘹𝘦𝘥") para redes sociales.
 */
function toUnicodeItalic(str) {
  return Array.from(String(str || '').normalize('NFD')).map(ch => {
    const code = ch.codePointAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D608 + (code - 65)); // A-Z
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D622 + (code - 97)); // a-z
    return ch;
  }).join('');
}

/**
 * Intérprete de Markdown (**negrita** y *cursiva*) para publicaciones en redes sociales (Facebook, IG, TikTok, YouTube).
 * Transforma **texto** -> 𝘁𝗲𝘅𝘁𝗼 y *texto* -> 𝘵𝘦𝘹𝘵𝘰, eliminando asteriscos huérfanos o encabezados #.
 */
function formatMarkdownForSocial(text) {
  if (!text) return '';
  return String(text)
    // **negrita** o __negrita__ -> Unicode Sans-Serif Bold
    .replace(/\*\*([^*\n]+?)\*\*/g, (_, inner) => toUnicodeBold(inner))
    .replace(/__([^_\n]+?)__/g, (_, inner) => toUnicodeBold(inner))
    // *cursiva* (sin afectar listas al inicio de línea "* item") -> Unicode Sans-Serif Italic
    .replace(/(^|[^\w*])\*([^*\s][^*\n]*?)\*(?=$|[^\w*])/gm, (_, prefix, inner) => `${prefix}${toUnicodeItalic(inner)}`)
    // `código` -> Unicode Bold limpio
    .replace(/`([^`\n]+?)`/g, (_, inner) => toUnicodeBold(inner))
    // Quitar encabezados markdown al inicio de línea (### Título -> Título en negrita)
    .replace(/^\s*#{1,6}\s+(.+)$/gm, (_, heading) => toUnicodeBold(heading.trim()))
    // Limpiar cualquier ** residual mal cerrado
    .replace(/\*{2,}/g, '')
    .trim();
}

/**
 * Limpia marcas Markdown (**negrita**, *cursiva*, `código`) dejando texto plano puro para locución TTS y gráficos.
 */
function stripMarkdown(text) {
  if (!text) return '';
  return String(text)
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    .replace(/(^|[^\w*])\*([^*\s][^*\n]*?)\*(?=$|[^\w*])/gm, '$1$2')
    .replace(/`([^`\n]+?)`/g, '$1')
    .replace(/\*{2,}/g, '')
    .trim();
}

module.exports = {
  HISTORY_PATH, HISTORY_MAX, DEFAULT_MAX_AGE_HOURS, USER_AGENT, JINA_REMOVE_SELECTOR,
  DEFAULT_FEEDS, AI_KEYWORDS, MEAT_KEYWORDS, FLUFF_KEYWORDS, BANNED_CLICHES, EDITORIAL_ANGLES,
  fetchText, decodeEntities, htmlToText, realTextLength, normalizeText,
  matchedAiKeywords, aiRelevanceScore, meatScore, entityFatiguePenalty, itemDate, ageHours, isFresh,
  normalizeUrl, normalizeTitle, titlesMatch, cleanCapturedUrl, extractFirstUrl,
  loadHistory, isInHistory, addToHistory, mergeHistories, saveHistory, recordPublished,
  parseFeed, fetchFeed, fetchFeeds, rankCandidates,
  detectGarbage, isUsefulImageUrl, dedupeImages, extractImagesFromHtml, extractOgImage, imagesFromMarkdown,
  extractArticleBodyHtml, getFullRssText, fetchJina, extractWithJina, extractArticleContent, pickArticle,
  isContentRequestIssue, issueInstruction,
  extractHardFacts, selectEditorialAngle, getRecentHistorySummary,
  toUnicodeBold, toUnicodeItalic, formatMarkdownForSocial, stripMarkdown
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
