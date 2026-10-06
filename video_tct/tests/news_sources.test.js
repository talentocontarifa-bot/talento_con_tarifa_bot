const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ns = require('../../news_sources');

const NOW = Date.parse('2026-10-06T12:00:00Z');
const hoursAgo = h => new Date(NOW - h * 3600000).toUTCString();

test('palabras clave IA respetan límites de palabra (ia no coincide con media)', () => {
  assert.deepEqual(ns.matchedAiKeywords('La media de los salarios sube'), []);
  assert.deepEqual(ns.matchedAiKeywords('Shanghai y Hawaii'), []);
  assert.ok(ns.matchedAiKeywords('La IA ya decide precios').includes('ia'));
  assert.ok(ns.matchedAiKeywords('Inteligencia Artificial en México').includes('inteligencia artificial'));
  assert.ok(ns.matchedAiKeywords('Empresas que automatizan procesos').includes('automatiz'));
  assert.ok(ns.matchedAiKeywords('Lanzan GPT-5 hoy').includes('gpt'));
  assert.ok(!ns.matchedAiKeywords('Nuevo ChatGPT').includes('gpt'), 'gpt no debe coincidir dentro de chatgpt');
  assert.ok(ns.matchedAiKeywords('Nuevo ChatGPT').includes('chatgpt'));
  assert.ok(ns.matchedAiKeywords('Los agentes autónomos llegan').includes('agentes'));
  assert.ok(ns.matchedAiKeywords('NVIDIA y Anthropic firman').includes('anthropic'));
});

test('aiRelevanceScore prioriza el título y descarta noticias ajenas a IA', () => {
  const ai = ns.aiRelevanceScore('OpenAI lanza un agente para empresas', '');
  const other = ns.aiRelevanceScore('5 errores al hacer una presentación', 'Consejos de oratoria para emprendedores');
  assert.ok(ai >= 8, `score IA esperado alto, fue ${ai}`);
  assert.equal(other, 0);
  assert.ok(ns.aiRelevanceScore('Titular neutro', 'habla de inteligencia artificial') < ns.aiRelevanceScore('Inteligencia artificial', ''));
});

test('frescura: rechaza items de más de 72h y acepta los que no traen fecha', () => {
  assert.equal(ns.isFresh({ pubDate: hoursAgo(10) }, { now: NOW }), true);
  assert.equal(ns.isFresh({ pubDate: hoursAgo(80) }, { now: NOW }), false);
  assert.equal(ns.isFresh({ pubDate: hoursAgo(80) }, { now: NOW, maxAgeHours: 96 }), true);
  assert.equal(ns.isFresh({}, { now: NOW }), true);
  assert.equal(ns.isFresh({ pubDate: 'fecha rota' }, { now: NOW }), true);
});

test('normalizeUrl unifica protocolo, www, tracking, hash y slash final', () => {
  const a = ns.normalizeUrl('https://www.Xataka.com/robotica-e-ia/nota/?utm_source=fb&utm_medium=x#comentarios');
  const b = ns.normalizeUrl('http://xataka.com/robotica-e-ia/nota');
  assert.equal(a, b);
  assert.equal(ns.normalizeUrl('https://site.com/a?id=2&fbclid=xx'), 'site.com/a?id=2');
  assert.notEqual(ns.normalizeUrl('https://site.com/a?id=2'), ns.normalizeUrl('https://site.com/a?id=3'));
});

test('titlesMatch detecta títulos iguales o casi iguales', () => {
  assert.ok(ns.titlesMatch('OpenAI lanza GPT-6: ¿qué cambia?', 'openai lanza gpt 6 que cambia'));
  assert.ok(ns.titlesMatch('Nvidia presenta su nuevo chip para centros de datos de IA', 'Nvidia presenta nuevo chip para centros de datos de IA'));
  assert.ok(!ns.titlesMatch('Nvidia presenta su chip', 'Apple presenta su iPhone'));
});

test('historial compartido: dedupe por URL normalizada o título, filtro por canal y tope', () => {
  let h = [];
  h = ns.addToHistory(h, { url: 'https://www.a.com/x?utm_source=1', title: 'Noticia uno sobre IA generativa', channel: 'fb_article', date: '2026-10-01T00:00:00Z' });
  assert.ok(ns.isInHistory(h, { url: 'http://a.com/x/' }));
  assert.ok(ns.isInHistory(h, { url: 'https://otra.com/y', title: 'Noticia uno sobre IA generativa' }));
  assert.ok(!ns.isInHistory(h, { url: 'https://a.com/x' }, { channels: ['video_news'] }));
  h = ns.addToHistory(h, { url: 'https://a.com/x', title: 'dup', channel: 'fb_article', date: '2026-10-02T00:00:00Z' });
  assert.equal(h.length, 1, 'misma URL y canal no se duplica');
  for (let i = 0; i < 250; i++) h = ns.addToHistory(h, { url: `https://b.com/${i}`, title: `t${i}`, channel: 'video_news', date: new Date(NOW + i * 1000).toISOString() });
  assert.equal(h.length, ns.HISTORY_MAX);
  assert.equal(h[h.length - 1].url, 'b.com/249');
});

test('recordPublished y mergeHistories persisten y fusionan sin duplicados', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tct-hist-'));
  const file = path.join(dir, 'h.json');
  ns.recordPublished({ url: 'https://a.com/1', title: 'Uno', channel: 'fb_article', date: '2026-10-01T00:00:00Z' }, file);
  ns.recordPublished({ url: 'https://a.com/2', title: 'Dos', channel: 'video_news', date: '2026-10-02T00:00:00Z' }, file);
  const saved = ns.loadHistory(file);
  assert.equal(saved.length, 2);
  const merged = ns.mergeHistories(saved, [{ url: 'https://a.com/2', title: 'Dos', channel: 'video_news', date: '2026-10-02T00:00:00Z' }, { url: 'https://a.com/3', title: 'Tres', channel: 'fb_article', date: '2026-10-03T00:00:00Z' }]);
  assert.deepEqual(merged.map(e => e.url), ['a.com/1', 'a.com/2', 'a.com/3']);
  assert.deepEqual(ns.loadHistory(path.join(dir, 'no-existe.json')), []);
});

test('detectGarbage rechaza bloqueos de Cloudflare/403 y textos cortos', () => {
  const article = 'La inteligencia artificial está cambiando la forma en que trabajan las pymes. '.repeat(10);
  assert.equal(ns.detectGarbage(article), null);
  assert.match(ns.detectGarbage('Title: x\n\nWarning: Target URL returned error 403: Forbidden\n\n' + article), /bloqueo/);
  assert.match(ns.detectGarbage('Just a moment...\nEnable JavaScript and cookies to continue'), /bloqueo|corto/);
  assert.match(ns.detectGarbage('Attention Required! | Cloudflare ' + article), /bloqueo/);
  assert.match(ns.detectGarbage('Access denied. ' + 'x '.repeat(300)), /error\/bloqueo|corto/);
  assert.match(ns.detectGarbage('Hola'), /corto/);
  assert.match(ns.detectGarbage(''), /vacío/);
  // Un artículo largo que menciona captcha en el cuerpo no es basura
  assert.equal(ns.detectGarbage(article.repeat(4) + ' Google cambia su captcha.'), null);
});

test('cleanCapturedUrl y extractFirstUrl quitan puntuación final', () => {
  assert.equal(ns.cleanCapturedUrl('https://a.com/nota).'), 'https://a.com/nota');
  assert.equal(ns.cleanCapturedUrl('https://a.com/nota],'), 'https://a.com/nota');
  assert.equal(ns.cleanCapturedUrl('https://es.wikipedia.org/wiki/IA_(desambiguación)'), 'https://es.wikipedia.org/wiki/IA_(desambiguación)');
  assert.equal(ns.extractFirstUrl('Mira esto (https://a.com/x?y=1).'), 'https://a.com/x?y=1');
  assert.equal(ns.extractFirstUrl('Ver [nota](https://a.com/md) ahora'), 'https://a.com/md');
  assert.equal(ns.extractFirstUrl('sin enlaces'), null);
});

test('htmlToText limpia HTML, entidades y conserva párrafos', () => {
  const html = '<![CDATA[<p>Hola <a href="#">mundo</a> &amp; <strong>IA</strong></p><script>alert(1)</script><p>Segundo&nbsp;p&aacute;rrafo &#x00ED; &#8364;</p><ul><li>uno</li></ul>]]>';
  const text = ns.htmlToText(html);
  assert.equal(text, 'Hola mundo & IA\n\nSegundo párrafo í €\n\n- uno');
});

test('filtro de imágenes descarta logos, avatares, svg, píxeles y tamaños chicos', () => {
  assert.ok(ns.isUsefulImageUrl('https://i.blogs.es/abc/foto/1366_2000.jpg'));
  assert.ok(!ns.isUsefulImageUrl('https://i.blogs.es/abc/foto/100_100.jpg'));
  assert.ok(!ns.isUsefulImageUrl('https://site.com/static/logo.png'));
  assert.ok(!ns.isUsefulImageUrl('https://site.com/u/avatar-juan.jpg'));
  assert.ok(!ns.isUsefulImageUrl('https://site.com/img/hero.svg'));
  assert.ok(!ns.isUsefulImageUrl('https://site.com/p.gif?track=1'));
  assert.ok(!ns.isUsefulImageUrl('https://site.com/wp-content/uploads/foto-150x150.jpg'));
  assert.ok(!ns.isUsefulImageUrl('https://site.com/foto.jpg', { width: '80', height: '80' }));
  assert.ok(!ns.isUsefulImageUrl('https://cdn.com/img.jpg?w=64'));
  assert.ok(!ns.isUsefulImageUrl('data:image/png;base64,xxx'));
  assert.ok(ns.isUsefulImageUrl('https://site.com/wp-content/uploads/foto-1200x675.jpg'));
});

test('extractImagesFromHtml usa el cuerpo del artículo, lazy-src y dedupe', () => {
  const page = `<html><head><meta property="og:image" content="https://cdn.com/og.jpg"></head><body>
    <header><img src="https://cdn.com/logo.png"></header>
    <article class="related"><img src="https://cdn.com/related.jpg"></article>
    <article><p>${'texto '.repeat(50)}</p>
      <img data-src="https://cdn.com/a.jpg" src="data:image/gif;base64,R0">
      <img src="/rel/b.jpg?x=1"><img src="https://cdn.com/a.jpg?v=2">
      <img src="https://cdn.com/avatar.jpg"><img src="https://cdn.com/c.jpg" width="40" height="40">
      <article><img src="https://cdn.com/nested.jpg"></article>
    </article><aside><img src="https://cdn.com/side.jpg"></aside></body></html>`;
  assert.equal(ns.extractOgImage(page), 'https://cdn.com/og.jpg');
  const body = ns.extractArticleBodyHtml(page);
  assert.ok(!body.includes('side.jpg') && !body.includes('logo.png') && !body.includes('related.jpg'));
  assert.deepEqual(ns.extractImagesFromHtml(body, 'https://site.com/nota'), ['https://cdn.com/a.jpg', 'https://site.com/rel/b.jpg?x=1', 'https://cdn.com/nested.jpg']);
  assert.deepEqual(ns.imagesFromMarkdown('![x](https://cdn.com/a.jpg) ![y](https://cdn.com/icon.png)'), ['https://cdn.com/a.jpg']);
  assert.deepEqual(ns.dedupeImages([
    'https://i.blogs.es/abc/foto/1366_2000.jpg', 'https://i.blogs.es/abc/foto/1024_2000.jpg',
    'https://s.com/wp-content/uploads/f.jpg', 'https://s.com/wp-content/uploads/f-768x414.jpg'
  ]), ['https://i.blogs.es/abc/foto/1366_2000.jpg', 'https://s.com/wp-content/uploads/f.jpg']);
});

test('parseFeed lee RSS con contenido completo y getFullRssText evita scrapear', () => {
  const longHtml = `<p><img src="https://i.blogs.es/x/foto/1024_2000.jpg"></p>${'<p>La inteligencia artificial generativa transforma a las empresas latinas. </p>'.repeat(20)}`;
  const xml = `<rss><channel><title>F</title>
    <item><title><![CDATA[OpenAI &amp; la IA]]></title><link>https://www.xataka.com/a?utm_source=rss</link>
      <pubDate>${hoursAgo(2)}</pubDate><description><![CDATA[${longHtml}]]></description></item>
    <item><title>Corta</title><link>https://site.com/b</link><pubDate>${hoursAgo(1)}</pubDate>
      <description>Resumen breve</description><content:encoded><![CDATA[<p>poco</p>]]></content:encoded>
      <enclosure url="https://site.com/e.jpg" type="image/jpeg"/></item>
  </channel></rss>`;
  const items = ns.parseFeed(xml, 'feed');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'OpenAI & la IA');
  assert.ok(ns.getFullRssText(items[0]).length > 800);
  assert.deepEqual(ns.extractImagesFromHtml(items[0].contentHtml, items[0].link), ['https://i.blogs.es/x/foto/1024_2000.jpg']);
  assert.equal(ns.getFullRssText(items[1]), null);
  assert.equal(items[1].enclosureUrl, 'https://site.com/e.jpg');
  const atom = ns.parseFeed('<feed><entry><title>A</title><link rel="alternate" href="https://a.com/1"/><updated>2026-10-06T00:00:00Z</updated><content type="html">&lt;p&gt;Hola&lt;/p&gt;</content></entry></feed>');
  assert.equal(atom[0].link, 'https://a.com/1');
  assert.equal(ns.htmlToText(atom[0].contentHtml), 'Hola');
});

test('rankCandidates elige la mejor noticia IA fresca y no publicada de todos los feeds', () => {
  const items = [
    { title: '5 errores al presentar', link: 'https://e.com/1', pubDate: hoursAgo(1), feedIndex: 0 },
    { title: 'OpenAI lanza agentes para pymes', link: 'https://x.com/old', pubDate: hoursAgo(100), feedIndex: 0 },
    { title: 'Anthropic presenta Claude 5', link: 'https://x.com/pub', pubDate: hoursAgo(2), feedIndex: 1 },
    { title: 'La IA de Google llega a México', link: 'https://x.com/ok', pubDate: hoursAgo(5), feedIndex: 2 },
    { title: 'La IA de Google llega a México', link: 'https://y.com/dup', pubDate: hoursAgo(5), feedIndex: 3 }
  ];
  const history = ns.addToHistory([], { url: 'https://x.com/pub', title: 'Anthropic presenta Claude 5', channel: 'video_news' });
  const { candidates, stats } = ns.rankCandidates(items, { history, now: NOW });
  assert.deepEqual(candidates.map(c => c.link), ['https://x.com/ok']);
  assert.equal(stats.stale, 1);
  assert.equal(stats.inHistory, 1);
  assert.equal(stats.duplicates, 1);
  const seen = ns.rankCandidates(items, { history, now: NOW, isSeen: i => i.link === 'https://x.com/ok' });
  assert.equal(seen.candidates.length, 0);
  const fallback = ns.rankCandidates(items, { history, now: NOW, isSeen: i => i.link === 'https://x.com/ok', allowNonAi: true });
  assert.equal(fallback.candidates[0].link, 'https://e.com/1');
});

test('pickArticle salta candidatas cuyo Jina devuelve basura y usa la siguiente', async () => {
  const good = 'Los agentes de inteligencia artificial reducen costos operativos en startups. '.repeat(10);
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: opts.headers });
    const body = url.includes('bloqueado') ? 'Title: x\nWarning: Target URL returned error 403: Forbidden\nJust a moment...' : good;
    return { ok: true, status: 200, url, text: async () => body };
  };
  const logs = [];
  const res = await ns.pickArticle([
    { title: 'A', link: 'https://bloqueado.com/a', contentHtml: '<p>corto</p>' },
    { title: 'B', link: 'https://bien.com/b', contentHtml: '' }
  ], { fetchImpl, apiKey: 'k', log: m => logs.push(m) });
  assert.equal(res.item.link, 'https://bien.com/b');
  assert.equal(res.method, 'jina:article');
  assert.equal(calls.filter(c => c.url.includes('bloqueado')).length, 2, 'reintenta sin X-Target-Selector antes de descartar');
  assert.equal(calls[0].headers['X-Target-Selector'], 'article');
  assert.equal(calls[1].headers['X-Target-Selector'], undefined);
  assert.equal(calls[0].headers.Authorization, 'Bearer k');
  assert.equal(calls[0].headers['X-Return-Format'], 'markdown');
  assert.ok(!/Chrome/.test(calls[0].headers['User-Agent']), 'Jina no debe recibir un UA de navegador');
});

test('isContentRequestIssue solo acepta solicitudes de artículo', () => {
  assert.ok(ns.isContentRequestIssue({ title: 'Hazlo irreverente', body: 'https://a.com/x', labels: [] }));
  assert.ok(ns.isContentRequestIssue({ title: '[POST] Enfócate en pymes', body: 'link: https://a.com/x', labels: [] }));
  assert.ok(ns.isContentRequestIssue({ title: 'Nota', body: 'https://a.com/x', labels: [{ name: 'publicar' }] }));
  assert.ok(!ns.isContentRequestIssue({ title: 'Nota', body: 'https://a.com/x', labels: [{ name: 'bug' }] }));
  assert.ok(!ns.isContentRequestIssue({ title: 'Video', body: 'GUION: hola https://a.com/x', labels: [] }));
  assert.ok(!ns.isContentRequestIssue({ title: '[EDITORIAL] ensayo', body: 'https://a.com/x', labels: [] }));
  assert.ok(!ns.isContentRequestIssue({ title: 'TÍTULO: sin link', body: 'texto', labels: [] }));
  assert.equal(ns.issueInstruction('[POST] Hazlo corto'), 'Hazlo corto');
  assert.equal(ns.issueInstruction('Tono serio'), 'Tono serio');
});
