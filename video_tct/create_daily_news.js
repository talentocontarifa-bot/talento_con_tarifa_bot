const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { HfInference } = require('@huggingface/inference');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const axios = require('axios');
const googleTTS = require('google-tts-api');
const news = require('../news_sources');
const { restoreContactEnding, CONTACT_ENDING } = require('./lib/ending');


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'TX3LPaxmHKxFdv7VOQHJ';
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_v4_turbo';
const FPS = 30;
const BRAND_COLOR = '#CCFF00'; // Limón TCT (identidad Neo-Brutalista bloqueada)

const FEEDS = news.DEFAULT_FEEDS;
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
  console.log("🤖 [1/4] Consultando a Gemini/Groq para guion y estructura de escenas...");

  const queueContext = await getTodaysContext();
  const rawMessage = queueContext?.message || '';
  const sharedHistory = news.loadHistory();
  const angle = news.selectEditorialAngle({ title: processedNewsTitle }, rawMessage, sharedHistory);
  const hardFacts = news.extractHardFacts(`${processedNewsTitle}. ${rawMessage}`);
  const recentTitles = news.getRecentHistorySummary(sharedHistory, 5);

  if (DRY_RUN) {
    console.log('\n🧪 DRY_RUN: deteniendo antes del LLM.');
    console.log(`   Título: ${processedNewsTitle}`);
    console.log(`   URL: ${queueContext?.link || '(fallback genérico)'}`);
    console.log(`   Ángulo editorial: [${angle.id}] ${angle.name}`);
    console.log(`   Métrica/Dato primario: ${hardFacts.primaryMetric.label} — "${hardFacts.primaryMetric.context}"`);
    console.log(`   Imágenes: ${extractedArticleImages.length}`);
    console.log(`   Texto (primeros 500):\n-----------------\n${rawMessage.substring(0, 500)}\n-----------------`);
    process.exit(0);
  }
  const contextSection = queueContext
    ? `\nNOTICIA DEL DÍA (puede estar en inglés o español; tu guion SIEMPRE va en español):
Título: ${processedNewsTitle}
Contenido:
"""
${queueContext.message}
"""
Fuente: ${queueContext.link}
`
    : `\nCONTEXTO DEL DÍA: Usa un caso técnico real de agentes autónomos con MCP (Model Context Protocol) y automatización con n8n para operaciones B2B.\n`;

  const factsSection = hardFacts.facts.length > 0
    ? `\nDATOS DUROS REALES EXTRAÍDOS DEL ARTÍCULO (DEBES usarlos en las escenas 2 y 3; NO inventes porcentajes):\n- ${hardFacts.facts.join('\n- ')}\nMétrica sugerida para Escena 3: "${hardFacts.primaryMetric.label}" (${hardFacts.primaryMetric.context})`
    : `\nREGLA DE DATOS: Usa únicamente los hechos, herramientas y cifras reales mencionados en el artículo. PROHIBIDO inventar "85%".`;

  const historySection = recentTitles.length > 0
    ? `\nTEMAS RECIENTES YA CUBIERTOS (NO repitas las mismas frases de entrada ni el mismo enfoque):\n- ${recentTitles.join('\n- ')}`
    : '';

  console.log(`🎯 Ángulo de video: [${angle.name}] | Métrica detectada: ${hardFacts.primaryMetric.label}`);

  const prompt = `Actúa como Director Técnico y Locutor Estelar de "Talento con Tarifa".
Tu misión: convertir la noticia del día en un guion de video vertical en ESPAÑOL con sustancia técnica real ("con carnita"), datos concretos y un ritmo oral conversacional, fluido y natural (como si se lo contaras de tú a tú a un colega builder o dueño de negocio, sin sonar a traducción robótica ni folleto corporativo).

ÁNGULO EDITORIAL OBLIGATORIO: "${angle.name}"
Directriz: ${angle.directive}
${contextSection}${factsSection}${historySection}

PROHIBIDO USAR ESTAS FRASES QUEMADAS (penalización crítica si aparecen):
${news.BANNED_CLICHES.map(c => `- "${c}"`).join('\n')}
- Tampoco uses el porcentaje inventado "85%", ni hables de "usted" (usa SIEMPRE tuteo natural: "tú"), ni cierres la escena 4 diciendo "cobra por tu valor / no compitas por precio".

Debes crear exactamente 5 escenas en este orden:
1. "title": Gancho técnico/directo sobre la noticia real (entra directo con el nombre de la tecnología, empresa o hallazgo, con ritmo hablado natural). Requiere:
   - 'text1' y 'text2' (máximo 12 letras cada uno, MAYÚSCULAS, en español, ej: nombre del modelo/empresa + acción clave).
   - 'tag': categoría específica del ángulo (ej: "${angle.tag}").
   - 'voice_text': frase hablada fluida y directa con el hecho central de la noticia (13-18 palabras en español neutro).
   - 'subtitle': subtítulo corto para la barra inferior (máx 10 palabras).
2. "image_text": Desglose técnico / mecánico de la noticia. Requiere:
   - 'title': titular de lo que hace o cambia (máx 22 letras, MAYÚSCULAS).
   - 'key_points': array de EXACTAMENTE 3 datos o mecanismos concretos del artículo (máx 5 palabras cada uno, sin clichés).
   - 'voice_text': frase hablada natural explicando cómo funciona o qué resuelve (15-22 palabras).
   - 'subtitle': subtítulo corto para la barra inferior (máx 10 palabras).
3. "big_percentage": El DATO DURO o MÉTRICA REAL del artículo. Requiere:
   - 'metric': string corto (máx 6 caracteres) con la cifra o insignia real del artículo (ej: "${hardFacts.primaryMetric.label}", "3.5X", "$20/M", "OPEN", "API", "66%"). Si hay un porcentaje real en la nota, pon también 'number' con el entero; si NO es porcentaje, pon 'number': null y usa 'metric'.
   - 'label': qué significa esa cifra o hallazgo en el artículo (máx 22 letras).
   - 'voice_text': frase hablada natural explicando el dato duro real del artículo (13-18 palabras).
   - 'subtitle': subtítulo corto para la barra inferior (máx 10 palabras).
4. "image_text": La Jugada Práctica / Arquitectura aplicable. Requiere:
   - 'title': titular táctico específico al tema de hoy (máx 22 letras, MAYÚSCULAS; PROHIBIDO poner "COBRA POR TU VALOR").
   - 'voice_text': recomendación accionable y directa (hablando de "tú") derivada de esta noticia para quien construye o dirige un negocio (14-20 palabras).
   - 'subtitle': subtítulo corto para la barra inferior (máx 10 palabras).
5. "cta": Cierre y llamado a la acción fijo de marca. Requiere:
   - 'headline': "¿LISTO PARA DOMINAR?"
   - 'sub': "El superpoder de la IA para tu local o negocio."
   - 'btn': "TALENTOCONTARIFA.LAT"
   - 'voice_text': "Este contenido fue creado y publicado de manera automática con inteligencia artificial. Imagina lo que este superpoder puede hacer por tu local, negocio o emprendimiento. Conéctate con nosotros en talentocontarifa punto lat."
   - 'subtitle': "Visita talentocontarifa.lat y escala tu negocio."

Reglas de Formato:
1. Incluye en la raíz del JSON el campo "topic" con el titular de la noticia SIEMPRE traducido o redactado en ESPAÑOL atractivo (máx 80 caracteres, sin inglés crudo).
2. Todos los números o siglas de unidades que deban leerse en 'voice_text' escríbelos en palabras para locución fluida en español (ej: "ciento veintiocho gigas", " veinte dólares", "tres punto cinco veces"), pero en 'subtitle', 'key_points' y 'metric' usa dígitos cortos.
3. No pongas asteriscos (**) dentro de 'voice_text', 'subtitle', 'title' ni 'key_points'.

Responde ÚNICAMENTE con un objeto JSON válido con las claves "topic": "Titular en español", "layout_type": "neo_brutalist" y "scenes": [ ...5 escenas... ].`;

  // 1. Intentar con Groq si está disponible
  if (process.env.GROQ_API_KEY) {
      console.log("🧠 Intentando generar guion con Groq...");
      const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
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
                          temperature: 0.65
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
                  if (e.message.includes("does not exist") || e.message.includes("do not have access") || e.message.includes("decommissioned")) {
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
  
  const geminiModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-3.8-flash", "gemini-3.1-pro-preview"];
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

  console.warn(`⚠️ Todos los modelos de IA fallaron (${lastGeminiError?.message}). Construyendo guion extractivo real desde la noticia.`);
  const titleWords = (processedNewsTitle || 'ARQUITECTURA IA').toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const t1 = (titleWords.slice(0, 2).join(' ') || 'SISTEMA IA').substring(0, 12);
  const t2 = (titleWords.slice(2, 4).join(' ') || 'EN PRODUCCIÓN').substring(0, 12);
  const fact1 = hardFacts.facts[0] || processedNewsTitle || 'Nuevas herramientas de automatización e integración por API redefinen la operación técnica.';
  return {
    theme_color: BRAND_COLOR,
    layout_type: "neo_brutalist",
    scenes: [
      {
        type: "title",
        text1: t1,
        text2: t2,
        tag: angle.tag,
        voice_text: (processedNewsTitle || "Nueva actualización técnica en el ecosistema de inteligencia artificial aplicada.").substring(0, 140),
        subtitle: (processedNewsTitle || "Actualización clave en arquitectura de IA.").substring(0, 70)
      },
      {
        type: "image_text",
        title: "DESGLOSE TÉCNICO",
        key_points: [
          "Integración vía API",
          "Flujos automatizados",
          "Control de latencia"
        ],
        voice_text: fact1.substring(0, 160),
        subtitle: fact1.substring(0, 75)
      },
      {
        type: "big_percentage",
        number: hardFacts.primaryMetric.number || 100,
        metric: hardFacts.primaryMetric.label || "DATO",
        label: "Métrica del Reporte",
        voice_text: (hardFacts.primaryMetric.context || fact1).substring(0, 150),
        subtitle: (hardFacts.primaryMetric.context || fact1).substring(0, 75)
      },
      {
        type: "image_text",
        title: "JUGADA OPERATIVA",
        voice_text: "Evalúa cómo conectar esta capacidad en tus flujos actuales antes de escalar infraestructura o licencias.",
        subtitle: "Conecta esta capacidad en tus flujos antes de escalar costos."
      },
      {
        type: "cta",
        headline: "¿LISTO PARA DOMINAR?",
        sub: "El superpoder de la IA para tu local o negocio.",
        btn: "TALENTOCONTARIFA.LAT",
        voice_text: "Este contenido fue creado y publicado de manera automática con inteligencia artificial. Imagina lo que este superpoder puede hacer por tu local, negocio o emprendimiento. Conéctate con nosotros en talentocontarifa punto lat.",
        subtitle: "Visita talentocontarifa.lat y escala tu negocio."
      }
    ]
  };
}


// ─────────────────────────────────────────
// 2. ELEVENLABS — Genera el audio de alta calidad
// ─────────────────────────────────────────
// Firma de audio fija que se añade al final de CADA video
const AI_SIGNATURE_AUDIO =
  'Este contenido fue creado y publicado de manera automática con inteligencia artificial. ' +
  'Imagina lo que este superpoder puede hacer por tu local, negocio o emprendimiento. ' +
  'Conéctate con nosotros en talentocontarifa punto lat.';

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

  // 0. Intentar clonación en lote con ChatterboxMultilingualTTS local (voz Rufino_1)
  const cloneScript = path.join(__dirname, '..', 'toon_host', '01', 'clone_voice_tct.py');
  if (process.env.DISABLE_CHATTERBOX !== '1' && fs.existsSync(cloneScript)) {
    try {
      const { execFileSync } = require('child_process');
      const batchItems = scenes.map((sc, idx) => {
        const rawText = sc.voice_text || sc.text || `${sc.text1 || ''} ${sc.text2 || ''}`;
        const snipPath = path.join(tempDir, `scene_${idx + 1}.mp3`);
        try { if (fs.existsSync(snipPath)) fs.unlinkSync(snipPath); } catch (e) {}
        return { text: sanitizeTtsText(rawText), output: snipPath };
      });
      const batchJsonPath = path.join(tempDir, 'chatterbox_batch.json');
      fs.writeFileSync(batchJsonPath, JSON.stringify(batchItems, null, 2));
      const pythonBin = process.env.PYTHON_PATH || 'python';
      execFileSync(pythonBin, [cloneScript, '--batch-json', batchJsonPath], {
        stdio: 'inherit',
        timeout: 900000
      });
    } catch (cloneErr) {
      console.warn(`⚠️ Chatterbox local no disponible o falló (${cloneErr.message}), usando fallback TTS...`);
    }
  }

  for (let idx = 0; idx < scenes.length; idx++) {
    const sc = scenes[idx];
    const textToSpeak = sc.voice_text || sc.text || `${sc.text1 || ''} ${sc.text2 || ''}`;
    const snipPath = path.join(tempDir, `scene_${idx + 1}.mp3`);
    if (!fs.existsSync(snipPath) || fs.statSync(snipPath).size <= 1000) {
      await synthesizeSnippet(textToSpeak, snipPath);
    }
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
      indexHtml = indexHtml
        .replace(/(<div\s+id="root"[^>]*?\bdata-duration=")[\d.]+(")/, `$1${totalDurationSec}$2`)
        .replace(/(<audio\s+id="bgm"[^>]*?\bdata-duration=")[\d.]+(")/, `$1${totalDurationSec}$2`)
        .replace(/(<audio\s+id="vo"[^>]*?\bdata-duration=")[\d.]+(")/, `$1${totalDurationSec}$2`);
      fs.writeFileSync(indexPath, indexHtml);
      console.log(`✅ index.html sincronizado con data-duration="${totalDurationSec}" (conservando duración de SFX)`);
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
    // PASO 1: Gemini genera el contenido y se restaura el cierre oficial de marca
    const rawData = await generateScriptAndScenes();
    if (Array.isArray(rawData?.scenes)) {
      rawData.scenes = rawData.scenes.map(s => ({
        ...s,
        text1: s.text1 ? news.stripMarkdown(s.text1) : s.text1,
        text2: s.text2 ? news.stripMarkdown(s.text2) : s.text2,
        title: s.title ? news.stripMarkdown(s.title) : s.title,
        voice_text: s.voice_text ? news.stripMarkdown(s.voice_text) : s.voice_text,
        subtitle: s.subtitle ? news.stripMarkdown(s.subtitle) : s.subtitle,
        key_points: Array.isArray(s.key_points) ? s.key_points.map(k => news.stripMarkdown(k)) : s.key_points
      }));
    }
    const data = restoreContactEnding(rawData);

    // PASO 2: Generar voz sincronizada por escenas y medir timestamps exactos
    const { totalFrames, timelineScenes, totalDurationSec } = await generateVoice(data.scenes);

    // PASO 3: Guardar el JSON final para Remotion y news_data.js para HyperFrames
    const defaultHook = [timelineScenes[0]?.text1, timelineScenes[0]?.text2].filter(Boolean).join(' — ');
    const resolvedTopic = news.stripMarkdown(rawData?.topic || defaultHook || processedNewsTitle || 'IA para Emprendedores');
    const newsData = {
      preview_only: false,
      topic: resolvedTopic,
      source_url: processedNewsLink || null,
      script: timelineScenes.map(s => s.voice_text).filter(Boolean).join(' '),
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
