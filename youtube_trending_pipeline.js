/**
 * youtube_trending_pipeline.js
 * 
 * Pipeline de Talento con Tarifa para:
 * 1. Buscar los videos de Inteligencia Artificial más vistos/tendencia de la semana en YouTube.
 * 2. Extraer la transcripción completa (subtítulos hablados) del video viral seleccionado.
 * 3. Procesar la transcripción con Google Gemini para sintetizar los aprendizajes clave,
 *    herramientas y oportunidades para profesionales, freelancers y creadores de tecnología.
 * 4. Generar y publicar el contenido en las redes de Talento con Tarifa (Facebook / Telegram).
 */

require('dotenv').config({ path: './.env' });
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ytSearch = require('yt-search');
const { YoutubeTranscript } = require('youtube-transcript');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PAGE_ID = process.env.META_PAGE_ID;
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

// Permite ejecutar en modo simulación (node youtube_trending_pipeline.js --dry-run)
const IS_DRY_RUN = process.argv.includes('--dry-run') || !GEMINI_API_KEY;

/**
 * 1. Busca videos de IA de la última semana ordenados por relevancia/vistas
 */
async function findWeeklyAITrendingVideos(query = 'inteligencia artificial', maxResults = 10) {
  console.log(`🔎 1. Buscando videos en tendencia sobre "${query}"...`);
  try {
    const searchResult = await ytSearch(query);
    const allVideos = searchResult.videos || [];

    // Filtrar videos de los últimos 7 días (horas, días o 1 semana)
    const recentVideos = allVideos.filter(v => {
      const ago = (v.ago || '').trim().toLowerCase();
      return (
        /^\d+\s*(m|min|h|d)\b/i.test(ago) || 
        /^\d+\s*(hora|día|dia)/i.test(ago) || 
        /^1\s*(w|week|semana)/i.test(ago) ||
        ago.includes('hoy') ||
        ago.includes('ayer')
      );
    });

    // Si el filtro semanal fue muy restrictivo, tomamos los más recientes disponibles
    const candidates = recentVideos.length > 0 ? recentVideos : allVideos.slice(0, 10);

    // Ordenar por vistas descendente
    candidates.sort((a, b) => (b.views || 0) - (a.views || 0));

    return candidates.slice(0, maxResults).map(v => ({
      id: v.videoId,
      title: v.title,
      channel: v.author?.name || 'Desconocido',
      views: v.views || 0,
      duration: v.timestamp || '',
      uploadedAgo: v.ago || '',
      url: `https://www.youtube.com/watch?v=${v.videoId}`
    }));
  } catch (error) {
    console.error("❌ Error buscando videos en YouTube:", error.message);
    return [];
  }
}

/**
 * 2. Extrae la transcripción completa de un video de YouTube
 */
async function extractTranscript(videoId) {
  console.log(`🎙️ 2. Extrayendo transcripción del video ${videoId}...`);
  try {
    // Primero intenta extraer en español, si falla extrae el idioma predeterminado/inglés
    let transcriptItems;
    try {
      transcriptItems = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'es' });
    } catch (_) {
      transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
    }

    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error("La transcripción está vacía.");
    }

    const fullText = transcriptItems
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      success: true,
      itemCount: transcriptItems.length,
      charCount: fullText.length,
      text: fullText
    };
  } catch (error) {
    console.warn(`⚠️ No se pudo obtener subtítulos del video ${videoId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 3. Analiza la transcripción con Gemini y redacta el post editorial para Talento con Tarifa
 */
async function generateEditorialPostWithGemini(videoMeta, transcriptText) {
  console.log(`🤖 3. Analizando transcripción y redactando post con Gemini...`);

  if (!GEMINI_API_KEY) {
    console.log("ℹ️ No hay GEMINI_API_KEY local configurada. Creando vista previa estructurada...");
    return `🚀 [RADAR YOUTUBE IA: TENDENCIA DE LA SEMANA]\n\n` +
      `📌 Video analizado: "${videoMeta.title}" (${videoMeta.channel})\n` +
      `👀 Vistas: ${videoMeta.views.toLocaleString()} | Publicado: ${videoMeta.uploadedAgo}\n\n` +
      `💡 Análisis de Transcripción (${transcriptText.length.toLocaleString()} caracteres analizados):\n` +
      `El video profundiza en la evolución práctica de los modelos de IA y su impacto directo en el trabajo técnico. Destaca la necesidad de que los desarrolladores y creadores adopten herramientas generativas no como curiosidad, sino como aceleradores de entrega para cotizar proyectos con mayor margen.\n\n` +
      `🔑 Puntos Clave:\n` +
      `1. Automatización aplicada al flujo de trabajo real.\n` +
      `2. El cambio en la demanda de habilidades técnicas.\n` +
      `3. Cómo posicionar tu servicio por valor y no por horas.\n\n` +
      `🎥 Video original: ${videoMeta.url}\n` +
      `🌐 Más análisis y herramientas en talentocontarifa.lat\n#InteligenciaArtificial #TalentoConTarifa #TechTrends`;
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Truncar a máximo 80,000 caracteres de transcripción si es extremadamente largo (para velocidad y eficiencia)
    const contextText = transcriptText.length > 80000 
      ? transcriptText.substring(0, 80000) + '... [Transcripción truncada para análisis]'
      : transcriptText;

    const prompt = `
Eres el analista jefe de 'Talento con Tarifa', una plataforma y comunidad orientada a freelancers, programadores, creadores digitales y consultores tecnológicos que buscan dominar la Inteligencia Artificial para cobrar más por su trabajo y optimizar sus servicios.

Hemos analizado el video de YouTube que fue tendencia esta semana:
- TÍTULO: "${videoMeta.title}"
- CANAL: ${videoMeta.channel}
- ENLACE: ${videoMeta.url}

A continuación tienes la TRANSCRIPCIÓN LITERAL completa de lo que se habló en el video:
"""
${contextText}
"""

TU TAREA:
Redacta un post editorial de alto impacto para nuestra comunidad (LinkedIn / Facebook / Telegram).
Requisitos:
1. TITULAR POTENTE: Atractivo y profesional, mencionando de qué trata la tendencia o debate de la semana.
2. EL NÚCLEO (Sin relleno): Resume en 2 o 3 párrafos fluidos qué se explicó o reveló en el video, eliminando saludos, intros de patrocinadores y frases vacías.
3. 3 LECCIONES / INSIGHTS TÁCTICOS: Puntos concretos que un profesional de tecnología pueda aplicar hoy mismo (herramientas mencionadas, flujos de trabajo, cambios de paradigma).
4. EL ÁNGULO DE TARIFA: Explica cómo esta tendencia impacta el mercado laboral y cómo un profesional puede usarlo para cotizar mejor su tarifa o crear nuevos servicios.
5. CIERRE Y FUENTE: Concluye invitando a la reflexión, dando crédito al canal/creador original con el enlace al video, e invitando a visitar talentocontarifa.lat.
6. Agrega hashtags relevantes (#InteligenciaArtificial #TalentoConTarifa #Productividad #TechTrends).
`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error("❌ Error en Gemini:", err.message);
    throw err;
  }
}

/**
 * 4. Publicadores (Telegram / Facebook)
 */
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    });
    console.log("✅ Publicado en Telegram exitosamente.");
  } catch (err) {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      await axios.post(url, {
        chat_id: TELEGRAM_CHAT_ID,
        text: text.replace(/<[^>]*>?/gm, '')
      });
      console.log("✅ Publicado en Telegram como texto plano.");
    } catch (e2) {
      console.warn("⚠️ Falló Telegram:", e2.message);
    }
  }
}

async function publishToFacebook(text) {
  if (!PAGE_ID || !PAGE_ACCESS_TOKEN) return;
  try {
    const cleanText = text.replace(/<[^>]*>?/gm, '');
    const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/feed`;
    await axios.post(url, null, {
      params: { message: cleanText, access_token: PAGE_ACCESS_TOKEN }
    });
    console.log("✅ Publicado en Facebook exitosamente.");
  } catch (err) {
    console.warn("⚠️ Falló Facebook:", err.response?.data?.error?.message || err.message);
  }
}

/**
 * Función Principal
 */
async function runYouTubeTrendingPipeline() {
  console.log("==================================================");
  console.log("🎬 RADAR SEMANAL DE IA EN YOUTUBE (TRANSCRIPCIONES)");
  console.log("==================================================");

  // 1. Buscar candidatos de la semana
  const candidates = await findWeeklyAITrendingVideos("inteligencia artificial novedades", 8);

  if (candidates.length === 0) {
    console.log("❌ No se encontraron videos de IA para analizar.");
    return;
  }

  console.log(`\n📋 Candidatos encontrados (${candidates.length}):`);
  candidates.forEach((c, idx) => {
    console.log(`   ${idx + 1}. [${c.views.toLocaleString()} vistas] ${c.title} (${c.uploadedAgo})`);
  });

  // 2. Probar candidatos hasta encontrar uno con transcripción válida disponible
  let selectedVideo = null;
  let transcriptData = null;

  for (const video of candidates) {
    console.log(`\nIntento con: "${video.title}"...`);
    const result = await extractTranscript(video.id);
    if (result.success && result.charCount > 1000) {
      selectedVideo = video;
      transcriptData = result;
      console.log(`🎯 Video seleccionado con éxito: "${video.title}"`);
      console.log(`   Longitud de la transcripción: ${result.charCount.toLocaleString()} caracteres (${result.itemCount} bloques de audio).`);
      break;
    }
  }

  if (!selectedVideo || !transcriptData) {
    console.log("⚠️ Ninguno de los videos recientes tuvo subtítulos disponibles.");
    return;
  }

  // 3. Generar el post con Gemini
  const postContent = await generateEditorialPostWithGemini(selectedVideo, transcriptData.text);

  console.log("\n==================================================");
  console.log("📝 CONTENIDO EDITORIAL GENERADO:");
  console.log("==================================================");
  console.log(postContent);
  console.log("==================================================\n");

  // Guardar archivo JSON estructurado para trazabilidad o para motores de video
  const reportPath = path.join(__dirname, 'youtube_trending_latest.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    video: selectedVideo,
    transcriptSnippet: transcriptData.text.substring(0, 1000) + '...',
    post: postContent
  }, null, 2));
  console.log(`💾 Reporte guardado en: ${reportPath}`);

  // 4. Si no es dry run y están las credenciales, publicar
  if (!IS_DRY_RUN) {
    console.log("\n🚀 Publicando en canales configurados...");
    await sendTelegram(postContent);
    await publishToFacebook(postContent);
  } else {
    console.log("\nℹ️ Modo Dry-Run activo: no se realizaron publicaciones en vivo.");
  }

  console.log("\n✨ Pipeline de YouTube completado.");
}

if (require.main === module) {
  runYouTubeTrendingPipeline().catch(console.error);
}

module.exports = {
  findWeeklyAITrendingVideos,
  extractTranscript,
  generateEditorialPostWithGemini,
  runYouTubeTrendingPipeline
};
