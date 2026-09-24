const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { HfInference } = require('@huggingface/inference');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const Parser = require('rss-parser');
const axios = require('axios');
const googleTTS = require('google-tts-api');


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ELEVENLABS_VOICE_ID = 'pVSoAhDpVO8HBRVURsj5';
const FPS = 30;

const parser = new Parser();
const FEEDS = [
  'https://www.entrepreneur.com/es/feed',
  'https://feeds.weblogssl.com/xataka2',
  'https://feeds.weblogssl.com/genbeta',
  'https://wwwhatsnew.com/feed/'
];

// Variables globales para la noticia procesada y sus imágenes reales
let processedNewsLink = null;
let extractedArticleImages = [];

if (!GEMINI_API_KEY && !GROQ_API_KEY) {
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
  const images = [];

  // 1. De enclosure / media:content en el feed RSS
  if (feedItem?.enclosure?.url && feedItem.enclosure.url.startsWith('http')) {
    images.push(feedItem.enclosure.url);
  }
  if (feedItem?.['media:content']?.['$']?.url && feedItem['media:content']['$'].url.startsWith('http')) {
    images.push(feedItem['media:content']['$'].url);
  }

  // 2. Extraer de las imágenes markdown de Jina Reader (![alt](url))
  if (jinaText) {
    const markdownImgRegex = /!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
    let match;
    while ((match = markdownImgRegex.exec(jinaText)) !== null) {
      const imgUrl = match[1];
      if (!images.includes(imgUrl) && !imgUrl.includes('.svg') && !imgUrl.includes('avatar') && !imgUrl.includes('pixel') && !imgUrl.includes('icon')) {
        images.push(imgUrl);
      }
    }
  }

  // 3. Consultar la página web directamente para extraer og:image y twitter:image
  if (articleUrl) {
    try {
      const res = await axios.get(articleUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
        timeout: 8000
      });
      const html = res.data;
      if (typeof html === 'string') {
        const ogMatch = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i) ||
                        html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i);
        if (ogMatch && ogMatch[1] && ogMatch[1].startsWith('http')) {
          const ogUrl = ogMatch[1];
          if (!images.includes(ogUrl)) {
            images.unshift(ogUrl);
          }
        }

        // Buscar imágenes de contenido dentro de <img>
        const imgTags = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi)];
        for (const t of imgTags) {
          const u = t[1];
          if (!images.includes(u) && !u.includes('logo') && !u.includes('icon') && !u.includes('avatar') && !u.includes('pixel') && !u.includes('advert')) {
            images.push(u);
          }
        }
      }
    } catch (e) {
      console.log(`⚠️ No se pudo obtener HTML directo para og:image: ${e.message}`);
    }
  }

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
        const chosen = recentPosts[recentPosts.length - 1];

        // Verificar si el post seleccionado ya tiene un video publicado en Facebook
        const isUsedInFb = recentVideoTexts.some(text => {
          if (chosen.link && text.includes(chosen.link)) return true;
          const cleanMsg = (chosen.message || '').trim().toLowerCase();
          const keywords = cleanMsg.split(/\s+/).filter(w => w.length > 4).slice(0, 3);
          if (keywords.length > 0) {
            return keywords.every(kw => text.toLowerCase().includes(kw));
          }
          return false;
        });

        if (isUsedInFb) {
          console.log(`⏭️ El post de hoy ya tiene un video publicado en Facebook. Saltando al flujo RSS.`);
        } else {
          const contextText = (chosen.message || '').substring(0, 600); // máx 600 chars
          console.log(`📋 Contexto reciente encontrado en queue.json (ID: ${chosen.id}): "${contextText.substring(0, 100)}..."`);
          processedNewsLink = chosen.link || '';
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

  const historyPath = path.join(__dirname, 'used_video_news.json');
  let usedLinks = [];
  if (fs.existsSync(historyPath)) {
    try {
      usedLinks = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    } catch (e) {
      console.log('⚠️ Error al leer used_video_news.json:', e.message);
    }
  }

  let selectedItem = null;
  for (const feedUrl of FEEDS) {
    try {
      console.log(`📡 Consultando feed: ${feedUrl}`);
      const feed = await parser.parseURL(feedUrl);
      for (const item of feed.items) {
        if (item.link) {
          // Comprobar si ya se usó en el historial local
          if (usedLinks.includes(item.link)) continue;

          // Comprobar si ya se usó en los videos recientes de Facebook
          const isUsedInFb = recentVideoTexts.some(text => {
            if (text.includes(item.link)) return true;
            const cleanTitle = (item.title || '').trim().toLowerCase();
            const keywords = cleanTitle.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
            if (keywords.length > 0) {
              return keywords.every(kw => text.toLowerCase().includes(kw));
            }
            return false;
          });

          if (isUsedInFb) {
            console.log(`⏭️ Saltando noticia (detectada en videos recientes de Facebook): "${item.title}"`);
            continue;
          }

          selectedItem = item;
          console.log(`📰 Noticia seleccionada: "${item.title}" (${item.link})`);
          break;
        }
      }
      if (selectedItem) break;
    } catch (err) {
      console.log(`⚠️ Error leyendo el feed ${feedUrl}:`, err.message);
    }
  }

  if (!selectedItem) {
    console.log('🤷 No hay noticias nuevas en los feeds RSS. Usando fallback genérico de tendencias.');
    return null;
  }

  // Scrapear el contenido limpio con Jina Reader
  const articleUrl = selectedItem.link;
  console.log(`📄 Scrapeando con Jina Reader: ${articleUrl}`);
  try {
    const response = await axios.get(`https://r.jina.ai/${articleUrl}`, { timeout: 15000 });
    const scrapedText = response.data || '';
    processedNewsLink = articleUrl;
    extractedArticleImages = await extractArticleImages(articleUrl, selectedItem, scrapedText);
    return {
      message: scrapedText.substring(0, 10000),
      link: articleUrl
    };
  } catch (e) {
    console.log(`⚠️ Error scrapeando con Jina Reader: ${e.message}. Intentando Scrapling local...`);
    try {
      const { execSync } = require('child_process');
      const escapedUrl = articleUrl.replace(/"/g, '\\"');
      const helperPath = path.join(__dirname, '..', 'scrapling_helper.py');
      const output = execSync(`python "${helperPath}" --url "${escapedUrl}"`, { encoding: 'utf-8' });
      const parsed = JSON.parse(output);
      if (parsed.success && parsed.text && parsed.text.length > 50) {
        console.log(`✅ Scrapling extrajo exitosamente el contenido.`);
        processedNewsLink = articleUrl;
        extractedArticleImages = await extractArticleImages(articleUrl, selectedItem, null);
        return {
          message: parsed.text.substring(0, 10000),
          link: articleUrl
        };
      }
    } catch (scraplingErr) {
      console.log(`⚠️ Scrapling falló: ${scraplingErr.message}. Usando el fragmento del RSS.`);
    }
    
    processedNewsLink = articleUrl;
    extractedArticleImages = await extractArticleImages(articleUrl, selectedItem, null);
    return {
      message: `${selectedItem.title}\n\n${selectedItem.contentSnippet || selectedItem.content || ''}`,
      link: articleUrl
    };
  }
}

// ─────────────────────────────────────────
// 1. GEMINI — Genera guion + estructura de escenas
// ─────────────────────────────────────────
async function generateScriptAndScenes() {
  console.log("🤖 [1/4] Consultando a Gemini para guion y estructura de escenas...");

  const queueContext = await getTodaysContext();
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
1. "theme_color": elige entre: #FF3300, #CCFF00, #00FFFF, #FF00FF, #00FF66
2. Cada escena DEBE tener su propio 'voice_text' sincronizado con el contenido visual mostrado.

Responde ÚNICAMENTE con JSON válido:
{
  "theme_color": "#FF3300",
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
      console.log("🧠 Intentando generar guion con Groq (Llama 3.3 70B)...");
      const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
      for (const modelName of models) {
          let attempts = 0;
          while (attempts < 3) {
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
                      console.log(`✅ Guion: "${parsed.script.substring(0, 80)}..."`);
                      console.log(`✅ Color del día: ${parsed.theme_color} | Escenas: ${parsed.scenes.length}`);
                      return parsed;
                  } else {
                      throw new Error(data.error?.message || "Error de Groq");
                  }
              } catch (e) {
                  attempts++;
                  console.log(`⚠️ Intento ${attempts} con Groq (${modelName}) fallido: ${e.message}`);
                  await new Promise(r => setTimeout(r, 2000));
              }
          }
      }
      console.log("❌ Todos los intentos con Groq fallaron. Pasando a Gemini como respaldo...");
  }

  // 2. Respaldo a Gemini
  if (!genAI) {
      throw new Error("No hay API Key de Groq ni de Gemini disponible.");
  }
  console.log("🧠 Usando Gemini (gemini-2.5-flash) para generar guion...");
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  let attempts = 0;
  const maxRetries = 4;
  while (attempts < maxRetries) {
    try {
      const result = await model.generateContent(prompt);
      const data = JSON.parse(result.response.text());
      console.log(`✅ Guion: "${data.script.substring(0, 80)}..."`);
      console.log(`✅ Color del día: ${data.theme_color} | Escenas: ${data.scenes.length}`);
      return data;
    } catch (e) {
      attempts++;
      console.warn(`⚠️ Intento ${attempts} con Gemini fallido: ${e.message}`);
      if (attempts >= maxRetries) {
        throw e;
      }
      const waitTime = e.message.includes("429") || attempts > 2 ? 25000 : (attempts * 5000 + 5000);
      console.log(`   Esperando ${waitTime / 1000}s antes de reintentar con Gemini...`);
      await new Promise(r => setTimeout(r, waitTime));
    }
  }
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
          model_id: 'eleven_multilingual_v2',
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

  // 2. edge-tts (voz neuronal es-MX-JorgeNeural, gratuita y de alta fidelidad)
  try {
    const { execSync } = require('child_process');
    const escaped = clean.replace(/"/g, '\\"');
    execSync(`python -m edge_tts --voice "es-MX-JorgeNeural" --rate "+6%" --text "${escaped}" --write-media "${targetPath}"`, { stdio: 'pipe' });
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000) {
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
    currentTime += dur + 0.15; // 150ms pausa natural entre escenas
  }

  const totalDurationSec = Math.ceil(currentTime + 0.5);
  const totalFrames = totalDurationSec * FPS;

  // Concatenar snippets de audio en news_voice.mp3
  const listFile = path.join(tempDir, 'concat_list.txt');
  fs.writeFileSync(listFile, sceneFiles.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'));
  const finalAudioPath = path.join(__dirname, 'public', 'news_voice.mp3');
  const { execSync } = require('child_process');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${finalAudioPath}"`, { stdio: 'pipe' });

  // Actualizar hyperframes.json con la duración real
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
      console.log(`    ℹ️ Usando imagen de respaldo local para ${filename}...`);
      if (!fs.existsSync(targetPath)) {
        const fallbackSrc = path.join(__dirname, 'public', k === 0 ? 'agent_robot.png' : 'cerebro.webp');
        if (fs.existsSync(fallbackSrc)) {
          fs.copyFileSync(fallbackSrc, targetPath);
          console.log(`    💾 Copiado fallback local a ${filename}.`);
        } else {
          const emptyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
          fs.writeFileSync(targetPath, emptyPng);
          console.log(`    💾 Escrito pixel de fallback en ${filename}.`);
        }
      } else {
        console.log(`    ℹ️ Imagen previa existente conservada en ${filename}.`);
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
      theme_color: data.theme_color,
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
    }

    // PASO 5: Generar imágenes
    await generateImages(scenesWithFrames);

    console.log('\n🚀 Todo listo. Remotion puede renderizar ahora.');
  } catch (error) {
    console.error("❌ Error crítico:", error);
    process.exit(1);
  }
}

main();
