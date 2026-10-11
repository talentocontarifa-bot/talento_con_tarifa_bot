const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { HfInference } = require('@huggingface/inference');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const axios = require('axios');
const googleTTS = require('google-tts-api');
const news = require('../news_sources');


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'TX3LPaxmHKxFdv7VOQHJ';
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_v4_turbo';
const FPS = 30;
const BRAND_COLOR = '#CCFF00'; // Limón TCT (identidad Neo-Brutalista bloqueada)

const FEEDS = [
  'https://www.xataka.com/tag/inteligencia-artificial/rss2.xml',
  'https://www.entrepreneur.com/es/feed',
  'https://feeds.weblogssl.com/xataka2',
  'https://feeds.weblogssl.com/genbeta',
  'https://wwwhatsnew.com/feed/'
];
const HISTORY_CHANNEL = 'video_news';

// Variables globales para la noticia procesada y sus imágenes reales
let processedNewsLink = null;
let processedNewsTitle = '';
let extractedArticleImages = [];

// DRY_RUN=1: solo selecciona/extrae la noticia y sus imágenes; no llama al LLM, TTS ni escribe archivos
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase());

if (!GEMINI_API_KEY && !GROQ_API_KEY && !DRY_RUN) {
  console.error("❌ Faltan variables de entorno: necesitas GEMINI_API_KEY o GROQ_API_KEY");
  process.exit(1);
}
if (!ELEVENLABS_API_KEY) {
  console.warn("⚠️ ELEVENLABS_API_KEY no encontrado. Se usará Google TTS como fallback.");
}

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const hf = HF_API_KEY ? new HfInference(HF_API_KEY) : null;

// ─────────────────────────────────────────
// EXTRAER IMÁGENES REALES DEL ARTÍCULO
// ─────────────────────────────────────────
async function extractArticleImages(articleUrl, feedItem, jinaText) {
  let ogImage = null;
  const leadImages = [];
  const bodyImages = [];

  // 1. Consultar la página web directamente: og:image/twitter:image + imágenes DENTRO del cuerpo del artículo
  if (articleUrl) {
    try {
      const res = await axios.get(articleUrl, {
        headers: { 'User-Agent': news.USER_AGENT },
        timeout: 8000
      });
      const html = res.data;
      if (typeof html === 'string') {
        ogImage = news.extractOgImage(html);
        // Solo <article>, [itemprop=articleBody], .article-content o <main> (nada de header/sidebar/footer)
        const bodyHtml = news.extractArticleBodyHtml(html);
        if (bodyHtml) bodyImages.push(...news.extractImagesFromHtml(bodyHtml, articleUrl));
      }
    } catch (e) {
      console.log(`⚠️ No se pudo obtener HTML directo para og:image: ${e.message}`);
    }
  }

  // 2. De enclosure / media:content en el feed RSS (imagen principal de la nota)
  for (const u of [feedItem?.enclosureUrl, feedItem?.mediaUrl]) {
    if (u && news.isUsefulImageUrl(u)) leadImages.push(u);
  }

  // 3. Imágenes del contenido completo del RSS (content:encoded / description = cuerpo del artículo)
  const rssImages = feedItem?.contentHtml ? news.extractImagesFromHtml(feedItem.contentHtml, articleUrl) : [];

  // 4. Último recurso: imágenes markdown de Jina Reader (ya filtradas)
  const jinaImages = jinaText ? news.imagesFromMarkdown(jinaText) : [];

  let images = news.dedupeImages([
    ...(ogImage && news.isUsefulImageUrl(ogImage) ? [ogImage] : []),
    ...leadImages, ...rssImages, ...bodyImages
  ]);
  if (images.length < 2) images = news.dedupeImages([...images, ...jinaImages]);

  console.log(`📸 Imágenes reales encontradas para el artículo: ${images.length}`);
  images.slice(0, 3).forEach((img, idx) => console.log(`   [${idx + 1}] ${img.substring(0, 80)}...`));
  return images;
}

// ─────────────────────────────────────────
// 0. QUEUE/RSS — Lee el contexto del post programado del día o feeds RSS
// ─────────────────────────────────────────
async function getTodaysContext() {
  const PAGE_ID = process.env.META_PAGE_ID;
  const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

  // A. Obtener descripciones de los videos publicados recientemente en Facebook para evitar duplicados
  let recentVideoTexts = [];
  if (PAGE_ID && ACCESS_TOKEN) {
    try {
      console.log("📊 Consultando videos publicados recientemente en Facebook para evitar duplicados...");
      const fbUrl = `https://graph.facebook.com/v19.0/${PAGE_ID}/videos?fields=description,title&limit=15&access_token=${ACCESS_TOKEN}`;
      const res = await axios.get(fbUrl, { timeout: 10000 });
      if (res.data && res.data.data) {
        recentVideoTexts = res.data.data.map(v => `${v.title || ''} ${v.description || ''}`);
        console.log(`✅ Obtenidas descripciones de los últimos ${recentVideoTexts.length} videos de Facebook.`);
      }
    } catch (fbErr) {
      console.warn("⚠️ Error conectando con API de Meta para verificar videos duplicados:", fbErr.message);
    }
  }

  // Leer historial de links ya procesados en videos
  const historyPath = path.join(__dirname, 'used_video_news.json');
  let usedLinks = [];
  if (fs.existsSync(historyPath)) {
    try {
      usedLinks = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    } catch (e) {
      console.log('⚠️ Error al leer used_video_news.json:', e.message);
    }
  }
  const usedLinkKeys = new Set(usedLinks.map(news.normalizeUrl));
  // Historial compartido con el publicador diario de artículos (published_news.json)
  const sharedHistory = news.loadHistory();

  const queuePath = path.join(__dirname, '..', 'talento_queue.json');
  if (fs.existsSync(queuePath)) {
    try {
      const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
      const items = Array.isArray(queue) ? queue : (queue.value || []);

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Filtrar posts de las últimas 24 horas (ya sean publicados o programados para hoy)
      const recentPosts = items.filter(p => {
        if (!p.publishedAt) return false;
        const pDate = new Date(p.publishedAt);
        return pDate >= oneDayAgo;
      });

      if (recentPosts.length > 0) {
        // Buscar de más reciente a más antiguo uno que no haya sido usado en video
        let chosen = null;
        for (let i = recentPosts.length - 1; i >= 0; i--) {
          const candidate = recentPosts[i];
          // Solo el canal de video: los posts del queue SON el contenido del día y se espera su video
          const isUsedInHistory = candidate.link && (usedLinkKeys.has(news.normalizeUrl(candidate.link)) ||
            news.isInHistory(sharedHistory, { url: candidate.link }, { channels: [HISTORY_CHANNEL] }));
          const isUsedInFb = recentVideoTexts.some(text => {
            if (candidate.link && text.includes(candidate.link)) return true;
            const cleanMsg = (candidate.message || '').trim().toLowerCase();
            const keywords = cleanMsg.split(/\s+/).filter(w => w.length > 4).slice(0, 3);
            if (keywords.length > 0) {
              return keywords.every(kw => text.toLowerCase().includes(kw));
            }
            return false;
          });

          if (!isUsedInHistory && !isUsedInFb) {
            chosen = candidate;
            break;
          }
        }

        if (!chosen) {
          console.log(`⏭️ Todos los posts recientes de queue ya tienen video. Saltando al flujo RSS.`);
        } else {
          const contextText = (chosen.message || '').substring(0, 600); // máx 600 chars
          console.log(`📋 Contexto reciente encontrado en queue.json (ID: ${chosen.id}): "${contextText.substring(0, 100)}..."`);
          processedNewsLink = chosen.link || '';
          processedNewsTitle = contextText.split('\n')[0].substring(0, 140);
          if (chosen.link) {
            extractedArticleImages = await extractArticleImages(chosen.link, null, chosen.message);
          }
          return { message: contextText, link: chosen.link || '' };
        }
      }
    } catch (e) {
      console.log('⚠️ Error al leer talento_queue.json:', e.message);
    }
  }

  // Fallback / Piloto automático: Buscar en feeds RSS una noticia no utilizada
  console.log('🤖 Buscando noticia fresca en feeds RSS...');

  // Comprobar si ya se usó en los videos recientes de Facebook (heurística por link / palabras del título)
  const isUsedInFb = item => recentVideoTexts.some(text => {
    if (text.includes(item.link)) return true;
    const cleanTitle = (item.title || '').trim().toLowerCase();
    const keywords = cleanTitle.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
    if (keywords.length > 0) {
      return keywords.every(kw => text.toLowerCase().includes(kw));
    }
    return false;
  });
  const isSeen = item => {
    // Comprobar si ya se usó en el historial local
    if (usedLinkKeys.has(news.normalizeUrl(item.link))) return true;
    if (isUsedInFb(item)) {
      console.log(`⏭️ Saltando noticia (detectada en videos recientes de Facebook): "${item.title}"`);
      return true;
    }
    return false;
  };

  // Feeds en paralelo + filtro IA/frescura + historial compartido (todas las fuentes: artículo FB y video)
  const { items } = await news.fetchFeeds(FEEDS);
  const { candidates, stats } = news.rankCandidates(items, { history: sharedHistory, isSeen, log: console.log });
  console.log(`📊 Items: ${stats.total} | duplicados: ${stats.duplicates} | viejos: ${stats.stale} | ya publicados: ${stats.inHistory} | ya en video: ${stats.seen} | poco relevantes IA: ${stats.lowScore} | candidatos: ${candidates.length}`);

  if (!candidates.length) {
    console.log('🤷 No hay noticias nuevas en los feeds RSS. Usando fallback genérico de tendencias.');
    return null;
  }

  // Extraer texto: contenido completo del RSS -> Jina Reader endurecido -> Scrapling ligero
  const picked = await news.pickArticle(candidates, { fallback: extractWithScrapling });
  if (picked) {
    console.log(`📰 Noticia seleccionada: "${picked.item.title}" (${picked.item.link}) [método: ${picked.method}]`);
    processedNewsLink = picked.item.link;
    processedNewsTitle = picked.item.title;
    extractedArticleImages = await extractArticleImages(picked.item.link, picked.item, picked.method.startsWith('jina') ? picked.text : null);
    return {
      message: picked.text.substring(0, 10000),
      link: picked.item.link
    };
  }

  // Ninguna candidata legible: usamos el fragmento del RSS de la mejor candidata
  const selectedItem = candidates[0];
  console.log(`⚠️ No se pudo extraer texto completo. Usando el fragmento del RSS de: "${selectedItem.title}"`);
  processedNewsLink = selectedItem.link;
  processedNewsTitle = selectedItem.title;
  extractedArticleImages = await extractArticleImages(selectedItem.link, selectedItem, null);
  return {
    message: `${selectedItem.title}\n\n${selectedItem.contentSnippet || ''}`,
    link: selectedItem.link
  };
}

// Fallback local (modo ligero HTTP, sin navegadores). Requiere `pip install -r requirements-scraper.txt`.
function extractWithScrapling(url) {
  try {
    const { execSync } = require('child_process');
    const escapedUrl = url.replace(/"/g, '\\"');
    const helperPath = path.join(__dirname, '..', 'scrapling_helper.py');
    const output = execSync(`python "${helperPath}" --url "${escapedUrl}" --timeout 20`, { encoding: 'utf-8', timeout: 60000 });
    const parsed = JSON.parse(output);
    if (parsed.success && parsed.text && parsed.text.length > 50) {
      console.log(`✅ Scrapling extrajo el contenido (${parsed.engine}).`);
      return parsed.text;
    }
    console.log(`⚠️ Scrapling sin texto útil: ${parsed.error || 'texto muy corto'}`);
  } catch (scraplingErr) {
    console.log(`⚠️ Scrapling falló: ${scraplingErr.message}`);
  }
  return null;
}

// ─────────────────────────────────────────
// 1. GEMINI — Genera guion + estructura de escenas
// ─────────────────────────────────────────
async function generateScriptAndScenes() {
  console.log("🤖 [1/4] Consultando a Gemini para guion y estructura de escenas...");

  const queueContext = await getTodaysContext();
  if (DRY_RUN) {
    console.log('\n🧪 DRY_RUN: deteniendo antes del LLM.');
    console.log(`   Título: ${processedNewsTitle}`);
    console.log(`   URL: ${queueContext?.link || '(fallback genérico)'}`);
    console.log(`   Imágenes: ${extractedArticleImages.length}`);
    console.log(`   Texto (primeros 500):\n-----------------\n${(queueContext?.message || '').substring(0, 500)}\n-----------------`);
    process.exit(0);
  }
  const contextSection = queueContext
    ? `\nCONTEXTO DEL DÍA (úsalo como base del video — adapta el tono y la idea central):
"""
${queueContext.message}
"""
Fuente: ${queueContext.link}
`
    : `\nCONTEXTO DEL DÍA: No hay posts programados. Usa una tendencia real y verificable de IA 2025 para emprendedores latinoamericanos.\n`;

  const prompt = `Actúa como director de arte y curador de "Talento con Tarifa".
Tu misión: convertir el contexto del día en un video narrativo de impacto para emprendedores latinoamericanos.
${contextSection}
Tienes 4 tipos de escena (debes crear exactamente 5 escenas en este orden):
1. "title": Inicio impactante. Requiere:
   - 'text1' y 'text2' (máximo 12 letras cada uno, mayúsculas).
   - 'tag': frase corta de contexto (ej: "✦ INTELIGENCIA ARTIFICIAL ✦").
   - 'voice_text': frase hablada exacta (12-16 palabras en español neutro de locutor profesional).
   - 'subtitle': subtítulo corto para la barra inferior (máx 10 palabras).
2. "image_text": Imagen del artículo con IDEAS CLAVE superpuestas. Requiere:
   - 'title': titular de la escena (máx 22 letras, mayúsculas).
   - 'key_points': array de EXACTAMENTE 3 frases de impacto (máx 5 palabras cada una).
   - 'voice_text': frase hablada exacta que menciona los 3 puntos (15-20 palabras).
   - 'subtitle': subtítulo corto para la barra inferior (máx 10 palabras).
3. "big_percentage": Estadística gigante del mercado. Requiere:
   - 'number': porcentaje numérico real (1-99).
   - 'label': texto descriptivo de la cifra (máx 20 letras).
   - 'voice_text': frase hablada exacta explicando la estadística (12-16 palabras).
   - 'subtitle': subtítulo corto para la barra inferior (máx 10 palabras).
4. "image_text": Segunda imagen / revelación estratégica. Requiere:
   - 'title': titular de impacto (máx 22 letras, mayúsculas).
   - 'voice_text': frase hablada exacta de reflexión o estrategia (12-16 palabras).
   - 'subtitle': subtítulo corto para la barra inferior (máx 10 palabras).
5. "cta": Cierre y llamado a la acción. Requiere:
   - 'headline': titular de cierre (ej: "¿LISTO PARA DOMINAR?").
   - 'sub': bajada explicativa (ej: "Tu talento amplificado con agentes de IA.").
   - 'btn': "TALENTOCONTARIFA.LAT".
   - 'voice_text': frase de cierre invitando a visitar talentocontarifa.lat (12-16 palabras).
   - 'subtitle': subtítulo corto (ej: "Visita hoy talentocontarifa.lat y transforma tu futuro.").

Reglas Obligatorias:
1. La identidad visual es fija (Limón #CCFF00 / Negro / Off-White): NO elijas colores.
2. Cada escena DEBE tener su propio 'voice_text' sincronizado con el contenido visual mostrado.
3. 'text1', 'text2' y los 'title' van en MAYÚSCULAS y respetan los límites de letras (se leen en un celular).

Responde ÚNICAMENTE con JSON válido:
{
  "layout_type": "neo_brutalist",
  "scenes": [
    { "type": "title", "text1": "AGENTES IA", "text2": "NUEVA ERA", "tag": "✦ REVOLUCIÓN TECNOLÓGICA ✦", "voice_text": "¡Atención emprendedor! Los agentes de inteligencia artificial llegaron para cambiar todas las reglas del juego.", "subtitle": "¡Atención emprendedor! Los agentes de IA cambiaron las reglas." },
    { "type": "image_text", "title": "AUTOMATIZACIÓN EXTREMA", "key_points": ["Multiplican tu alcance", "Operan 24 horas continuas", "Reducen costos operativos"], "voice_text": "Automatización extrema: multiplican tu alcance, operan veinticuatro siete y reducen tus costos operativos.", "subtitle": "Automatización extrema: multiplican tu alcance y operan 24/7." },
    { "type": "big_percentage", "number": 85, "label": "Empresas Adaptadas", "voice_text": "El ochenta y cinco por ciento de las empresas líderes en el mercado ya integraron agentes autónomos a sus equipos.", "subtitle": "El 85% de las empresas líderes ya integraron agentes autónomos." },
    { "type": "image_text", "title": "COBRA POR TU VALOR", "voice_text": "Quienes dominan esta tecnología no compiten por precio: cobran por el verdadero valor de su talento.", "subtitle": "No compitas por precio: cobra por el valor de tu talento." },
    { "type": "cta", "headline": "¿LISTO PARA DOMINAR?", "sub": "Tu talento amplificado con agentes de IA.", "btn": "TALENTOCONTARIFA.LAT", "voice_text": "¿Listo para escalar tu negocio? Visita hoy mismo talento con tarifa punto lat y transforma tu futuro.", "subtitle": "Visita hoy talentocontarifa.lat y transforma tu futuro." }
  ]
}`;

  // 1. Intentar con Groq si está disponible
  if (process.env.GROQ_API_KEY) {
      console.log("🧠 Intentando generar guion con Groq...");
      const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
      for (const modelName of models) {
          let attempts = 0;
          while (attempts < 2) {
              try {
                  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                      method: "POST",
                      headers: {
                          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                          "Content-Type": "application/json"
                      },
                      body: JSON.stringify({
                          model: modelName,
                          response_format: { type: "json_object" },
                          messages: [
                              { role: "user", content: prompt }
                          ],
                          temperature: 0.7
                      })
                  });
                  const data = await response.json();
                  if (response.ok) {
                      const parsed = JSON.parse(data.choices[0].message.content.trim());
                      console.log(`✅ Guion generado exitosamente con Groq (${modelName})`);
                      const sampleText = parsed.script || parsed.scenes?.[0]?.voice_text || '';
                      console.log(`✅ Guion: "${sampleText.substring(0, 80)}..."`);
                      console.log(`✅ Color del día: ${parsed.theme_color} | Escenas: ${parsed.scenes?.length || 0}`);
                      return parsed;
                  } else {
                      throw new Error(data.error?.message || "Error de Groq");
                  }
              } catch (e) {
                  attempts++;
                  console.log(`⚠️ Intento ${attempts} con Groq (${modelName}) fallido: ${e.message}`);
                  if (e.message.includes("does not exist") || e.message.includes("do not have access")) {
                      break;
                  }
                  await new Promise(r => setTimeout(r, 2000));
              }
          }
      }
      console.log("❌ Todos los intentos con Groq fallaron. Pasando a Gemini como respaldo...");
  }

  // 2. Respaldo a Gemini con múltiples modelos y reintentos robustos
  if (!genAI) {
      throw new Error("No hay API Key de Groq ni de Gemini disponible.");
  }
  
  const geminiModels = ["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-2.5-flash"];
  let lastGeminiError = null;

  for (const modelName of geminiModels) {
    let attempts = 0;
    const maxRetries = 2;
    while (attempts < maxRetries) {
      try {
        console.log(`🧠 Consultando Gemini (${modelName}) - intento ${attempts + 1}/${maxRetries}...`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: "application/json" }
        });
        const result = await model.generateContent(prompt);
        const data = JSON.parse(result.response.text());
        const sampleText = data.script || data.scenes?.[0]?.voice_text || '';
        console.log(`✅ Guion generado exitosamente con Gemini (${modelName}): "${sampleText.substring(0, 80)}..."`);
        console.log(`✅ Color del día: ${data.theme_color} | Escenas: ${data.scenes?.length || 0}`);
        return data;
      } catch (e) {
        attempts++;
        lastGeminiError = e;
        console.warn(`⚠️ Intento ${attempts} con ${modelName} fallido: ${e.message}`);
        
        if (e.message.includes("404") || e.message.includes("not found")) {
          console.log(`⏩ Modelo ${modelName} no disponible, pasando al siguiente...`);
          break;
        }

        if (e.message.includes("429") || e.message.includes("Quota exceeded")) {
          console.log(`⏩ Cuota excedida para ${modelName}, probando siguiente modelo de inmediato...`);
          break;
        }

        if (attempts >= maxRetries) {
          console.log(`⏩ Agotados los reintentos para ${modelName}, probando siguiente modelo...`);
          break;
        }

        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  console.warn(`⚠️ Todos los modelos de IA fallaron (${lastGeminiError?.message}). Activando guion de contingencia para asegurar la generación del video.`);
  return {
    theme_color: BRAND_COLOR,
    layout_type: "neo_brutalist",
    scenes: [
      {
        type: "title",
        text1: "NOTICIA IA",
        text2: "NUEVA ERA",
        tag: "✦ TALENTO CON TARIFA ✦",
        voice_text: "¡Atención emprendedor! La inteligencia artificial y la automatización están redefiniendo el mercado hoy.",
        subtitle: "La inteligencia artificial está redefiniendo el mercado."
      },
      {
        type: "image_text",
        title: "CLAVES DE IMPACTO",
        key_points: ["Multiplican alcance", "Operan veinticuatro siete", "Reducen costos"],
        voice_text: "Automatización extrema: multiplican tu alcance, operan veinticuatro siete y reducen costos en tu negocio.",
        subtitle: "Automatización extrema: multiplican tu alcance y operan 24/7."
      },
      {
        type: "big_percentage",
        number: 85,
        label: "Empresas Adaptadas",
        voice_text: "El ochenta y cinco por ciento de las empresas líderes en la región ya integran herramientas inteligentes.",
        subtitle: "El 85% de las empresas líderes integran herramientas inteligentes."
      },
      {
        type: "image_text",
        title: "COBRA TU VALOR",
        voice_text: "Quienes dominan esta tecnología no compiten por precio: cobran por el verdadero valor de su trabajo.",
        subtitle: "No compitas por precio: cobra por el valor de tu talento."
      },
      {
        type: "cta",
        headline: "¿LISTO PARA ESCALAR?",
        sub: "Tu talento amplificado con agentes de IA.",
        btn: "TALENTOCONTARIFA.LAT",
        voice_text: "¿Listo para transformar tu futuro profesional? Visita hoy talento con tarifa punto lat y domina la nueva era.",
        subtitle: "Visita hoy talentocontarifa.lat y domina la nueva era."
      }
    ]
  };
}


// ─────────────────────────────────────────
// 2. ELEVENLABS — Genera el audio de alta calidad
// ─────────────────────────────────────────
// Firma de audio fija que se añade al final de CADA video
const AI_SIGNATURE_AUDIO =
  'Este video fue creado y publicado de manera completamente automática por inteligencia artificial. ' +
  'Imagina el impacto que este superpoder podría tener en tu negocio. ' +
  'Conéctate con nosotros en Talento con Tarifa punto lat.';

function sanitizeTtsText(text) {
  return text
    // Reemplazar elipsis con un punto simple para evitar tropezones en ElevenLabs
    .replace(/\.{3,}/g, '.')
    .replace(/\.{2,}/g, '.')
    // Reemplazar dos puntos y punto y coma con puntos para pausas más naturales
    .replace(/[;:]/g, '.')
    // Quitar comas repetidas
    .replace(/,{2,}/g, ',')
    // Eliminar caracteres especiales/emojis, dejando letras, números, espacios y puntuación básica
    .replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ.,¡!¿?]/g, ' ')
    // Limpiar espacios alrededor de puntuación
    .replace(/\s+([.,;:!?])/g, '$1')
    // Garantizar un único espacio después de cada signo de puntuación
    .replace(/([.,;:!?])\s*/g, '$1 ')
    // Eliminar espacios múltiples
    .replace(/\s+/g, ' ')
    .trim();
}

async function synthesizeSnippet(text, targetPath) {
  const clean = sanitizeTtsText(text);

  // 1. ElevenLabs si hay API key
  if (ELEVENLABS_API_KEY) {
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: clean,
          model_id: ELEVENLABS_MODEL_ID,
          voice_settings: { stability: 0.65, similarity_boost: 0.85 }
        })
      });
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(targetPath, Buffer.from(buffer));
        return;
      }
    } catch (e) {
      console.warn(`⚠️ ElevenLabs error en snippet: ${e.message}`);
    }
  }

  // 2. edge-tts (voz neuronal masculina es-MX-JorgeNeural, broadcast mastering)
  try {
    const { execFileSync } = require('child_process');
    const rawSnippet = targetPath.replace(/\.mp3$/, '_raw.mp3');
    const pythonBin = process.env.PYTHON_PATH || 'python';
    execFileSync(pythonBin, ['-m', 'edge_tts', '--voice', 'es-MX-JorgeNeural', '--rate', '+8%', '--text', clean, '--write-media', rawSnippet], { stdio: 'pipe', timeout: 60000 });
    if (fs.existsSync(rawSnippet) && fs.statSync(rawSnippet).size > 1000) {
      // Cadena de Masterización Vocal Broadcast (Highpass, Warmth, Presence, Compresor y Loudnorm a -14 LUFS)
      const filterChain = "highpass=f=80,equalizer=f=140:width_type=h:width=60:g=3.5,equalizer=f=3600:width_type=h:width=1200:g=4.0,acompressor=threshold=-16dB:ratio=4:attack=10:release=120:makeup=2.5dB,loudnorm=I=-14:TP=-1.0:LRA=7";
      const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';
      execFileSync(ffmpegBin, ['-y', '-i', rawSnippet, '-af', filterChain, '-c:a', 'libmp3lame', '-b:a', '192k', targetPath], { stdio: 'pipe', timeout: 60000 });
      try { fs.unlinkSync(rawSnippet); } catch (e) {}
      return;
    }
  } catch (edgeErr) {
    // Si falla edge-tts, continuar al fallback
  }

  // 3. Fallback a Google TTS
  const base64s = await googleTTS.getAllAudioBase64(clean, { lang: 'es', slow: false });
  const buffer = Buffer.concat(base64s.map(chunk => Buffer.from(chunk.base64, 'base64')));
  fs.writeFileSync(targetPath, buffer);
}

async function generateVoice(scenes) {
  const tempDir = path.join(__dirname, 'temp_voice');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const sceneFiles = [];
  let currentTime = 0;
  const timelineScenes = [];

  console.log(`\n🎙️ [2/4] Generando locución sincronizada escena por escena...`);

  for (let idx = 0; idx < scenes.length; idx++) {
    const sc = scenes[idx];
    const textToSpeak = sc.voice_text || sc.text || `${sc.text1 || ''} ${sc.text2 || ''}`;
    const snipPath = path.join(tempDir, `scene_${idx + 1}.mp3`);
    await synthesizeSnippet(textToSpeak, snipPath);
    const dur = await getAudioDurationInSeconds(snipPath);
    sceneFiles.push(snipPath);

    const timing = {
      ...sc,
      start: Number(currentTime.toFixed(3)),
      audio_duration: Number(dur.toFixed(3)),
      end: Number((currentTime + dur).toFixed(3))
    };
    timelineScenes.push(timing);
    console.log(`  ✓ Escena ${idx + 1}: [${timing.start}s -> ${timing.end}s] (${dur.toFixed(2)}s) - "${sc.subtitle || textToSpeak.substring(0, 40)}"`);
    currentTime += dur + 0.40; // 400ms (12 frames a 30fps) pausa natural entre escenas para evitar colisión con SFX
  }

  const totalDurationSec = Math.ceil(currentTime + 1.5); // 1.5s (45 frames a 30fps) retención final para lectura de CTA
  const totalFrames = totalDurationSec * FPS;

  // Mezclar snippets en news_voice.mp3 colocando cada uno en su `start` exacto.
  // (El concat demuxer pegaba los audios sin las pausas de 0.4s que sí cuenta la timeline,
  //  y la voz se adelantaba ~0.4s por escena respecto a los gráficos.)
  const finalAudioPath = path.join(__dirname, 'public', 'news_voice.mp3');
  const { execSync, execFileSync: execFileSyncMix } = require('child_process');
  const mixArgs = ['-y'];
  sceneFiles.forEach(f => mixArgs.push('-i', f));
  const delays = timelineScenes.map((s, i) => `[${i}:a]aformat=sample_rates=48000:channel_layouts=mono,adelay=${Math.round(s.start * 1000)}:all=1[a${i}]`);
  const mix = timelineScenes.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${timelineScenes.length}:normalize=0:dropout_transition=0[voice]`;
  mixArgs.push('-filter_complex', delays.concat(mix).join(';'), '-map', '[voice]', '-c:a', 'libmp3lame', '-b:a', '192k', finalAudioPath);
  execFileSyncMix(process.env.FFMPEG_PATH || 'ffmpeg', mixArgs, { stdio: 'pipe' });

  // Procesar música temática con Sidechain Ducking automático
  const musicSrc = path.join(__dirname, 'public', 'music_shiny_tech.mp3');
  const duckedMusic = path.join(__dirname, 'public', 'tct_music.mp3');
  if (fs.existsSync(musicSrc)) {
    try {
      console.log('🎵 Aplicando Sidechain Audio Ducking a la música temática...');
      const duckingFilter = `[1:a]aformat=channel_layouts=stereo:sample_rates=48000[sc];[0:a]atrim=0:${totalDurationSec},aformat=channel_layouts=stereo:sample_rates=48000[music];[music][sc]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=350,volume=0.36[final_music]`;
      execSync(`ffmpeg -y -i "${musicSrc}" -i "${finalAudioPath}" -filter_complex "${duckingFilter}" -map "[final_music]" -c:a libmp3lame -b:a 192k "${duckedMusic}"`, { stdio: 'pipe' });
      console.log('✅ Música con Sidechain Ducking generada exitosamente.');
    } catch (duckErr) {
      console.warn('⚠️ Error en sidechain ducking, manteniendo música previa:', duckErr.message);
    }
  }

  // Actualizar hyperframes.json e index.html con la duración real exacta
  const hfConfigPath = path.join(__dirname, 'hyperframes.json');
  if (fs.existsSync(hfConfigPath)) {
    try {
      const hfConfig = JSON.parse(fs.readFileSync(hfConfigPath, 'utf-8'));
      hfConfig.compositions[0].duration = totalDurationSec;
      fs.writeFileSync(hfConfigPath, JSON.stringify(hfConfig, null, 2));
      console.log(`✅ hyperframes.json actualizado con duración: ${totalDurationSec}s`);
    } catch (e) {
      console.warn(`⚠️ Error actualizando hyperframes.json:`, e.message);
    }
  }

  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    try {
      let indexHtml = fs.readFileSync(indexPath, 'utf-8');
      indexHtml = indexHtml.replace(/data-duration="[\d.]+"/g, `data-duration="${totalDurationSec}"`);
      fs.writeFileSync(indexPath, indexHtml);
      console.log(`✅ index.html sincronizado con data-duration="${totalDurationSec}"`);
    } catch (e) {
      console.warn(`⚠️ Error actualizando index.html:`, e.message);
    }
  }

  console.log(`⏱️ Audio maestro ensamblado: ${currentTime.toFixed(2)}s -> ${totalFrames} frames`);
  return { finalAudioPath, totalDurationSec, totalFrames, timelineScenes };
}

// ─────────────────────────────────────────
// 4. DESCARGAR IMÁGENES REALES DEL ARTÍCULO
// ─────────────────────────────────────────
async function generateImages(scenes) {
  console.log(`\n📸 [3/4] Procesando imágenes reales de la nota para el video...`);

  const imageScenes = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(item => item.scene.type === 'image_text');

  console.log(`   Se requieren ${imageScenes.length} imágenes para las escenas del video.`);
  console.log(`   Imágenes reales extraídas disponibles: ${extractedArticleImages.length}`);

  for (let k = 0; k < imageScenes.length; k++) {
    const { index } = imageScenes[k];
    const filename = `scene_${index}.png`;
    const targetPath = path.join(__dirname, 'public', filename);
    const candidateUrl = extractedArticleImages[k] || extractedArticleImages[0];

    let downloaded = false;
    if (candidateUrl) {
      try {
        console.log(`  → Descargando imagen real para ${filename}: ${candidateUrl.substring(0, 80)}...`);
        const response = await axios.get(candidateUrl, {
          responseType: 'arraybuffer',
          timeout: 20000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          }
        });
        const buffer = Buffer.from(response.data);
        if (buffer.length > 5000) {
          fs.writeFileSync(targetPath, buffer);
          downloaded = true;
          console.log(`    ✅ ${filename} descargada y guardada con éxito (${(buffer.length / 1024).toFixed(1)} KB).`);
        } else {
          console.warn(`    ⚠️ Imagen descartada por ser demasiado pequeña o vacía (${buffer.length} bytes).`);
        }
      } catch (err) {
        console.warn(`    ⚠️ Error descargando imagen real (${candidateUrl}): ${err.message}`);
      }
    }

    if (!downloaded) {
      // Siempre sobrescribir: scene_*.png está versionado y conservarlo publicaría la imagen de otra noticia.
      console.log(`    ℹ️ Usando imagen de marca para ${filename}...`);
      const fallbackSrc = path.join(__dirname, 'public', k === 0 ? 'agent_robot.png' : 'cerebro.webp');
      if (fs.existsSync(fallbackSrc)) {
        fs.copyFileSync(fallbackSrc, targetPath);
        console.log(`    💾 Copiado fallback de marca a ${filename}.`);
      } else {
        const emptyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        fs.writeFileSync(targetPath, emptyPng);
        console.log(`    💾 Escrito pixel de fallback en ${filename}.`);
      }
    }
  }
}

// ─────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────
async function main() {
  try {
    // PASO 1: Gemini genera el contenido
    const data = await generateScriptAndScenes();

    // PASO 2: Generar voz sincronizada por escenas y medir timestamps exactos
    const { totalFrames, timelineScenes, totalDurationSec } = await generateVoice(data.scenes);

    // PASO 3: Guardar el JSON final para Remotion y news_data.js para HyperFrames
    const newsData = {
      theme_color: BRAND_COLOR,
      layout_type: data.layout_type || 'neo_brutalist',
      scenes: timelineScenes,
      total_duration_sec: totalDurationSec,
      total_frames: totalFrames
    };
    const jsonPath = path.join(__dirname, 'src', 'news_data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(newsData, null, 2));
    const jsPath = path.join(__dirname, 'news_data.js');
    fs.writeFileSync(jsPath, `window.NEWS_DATA = ${JSON.stringify(newsData, null, 2)};\n`);
    console.log(`\n✅ [3/4] news_data.json y news_data.js actualizados (${totalFrames} frames totales, ${totalDurationSec}s)`);

    // Guardar el link procesado en el historial de noticias utilizadas para video
    if (processedNewsLink) {
      const historyPath = path.join(__dirname, 'used_video_news.json');
      let usedLinks = [];
      if (fs.existsSync(historyPath)) {
        try {
          usedLinks = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        } catch (e) {
          console.log('⚠️ Error al leer used_video_news.json al guardar:', e.message);
        }
      }
      if (!usedLinks.includes(processedNewsLink)) {
        usedLinks.push(processedNewsLink);
        fs.writeFileSync(historyPath, JSON.stringify(usedLinks, null, 2));
        console.log(`💾 Link guardado en historial de videos: ${processedNewsLink}`);
      }
      // Historial compartido con el publicador de artículos (published_news.json)
      try {
        news.recordPublished({ url: processedNewsLink, title: processedNewsTitle, channel: HISTORY_CHANNEL });
      } catch (histErr) {
        console.log('⚠️ Error al guardar historial compartido:', histErr.message);
      }
    }

    // PASO 5: Generar imágenes
    await generateImages(timelineScenes);

    console.log('\n🚀 Todo listo. Remotion puede renderizar ahora.');
  } catch (error) {
    console.error("❌ Error crítico:", error);
    process.exit(1);
  }
}

main();
