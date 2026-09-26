/**
 * publish_video.js
 * Orquestador Multi-Plataforma: Publica el video renderizado en:
 *   1. TikTok (API v2 oficial)
 *   2. Instagram Reels (Meta Graph API v21.0 - Resumable Upload)
 *   3. YouTube Shorts (YouTube Data API v3 - Resumable Upload)
 *   4. Facebook Video (Meta Graph API)
 * 
 * Cada red social se ejecuta de manera independiente y tolerante a fallos.
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
let axios;
try {
  axios = require('axios');
} catch (e) {
  try {
    axios = require(path.join(__dirname, 'node_modules', 'axios'));
  } catch (e2) {
    throw e;
  }
}
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { publishVideoToTikTok } = require('../tiktok_publisher');
const { publishReelToInstagram } = require('../instagram_publisher');
const { publishVideoToYouTube } = require('../youtube_publisher');

const PAGE_ID = process.env.META_PAGE_ID;
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_USER_ACCESS_TOKEN;

let VIDEO_PATH = path.join(__dirname, 'out', 'video_final_tct.mp4');
if (!fs.existsSync(VIDEO_PATH)) {
  VIDEO_PATH = path.join(__dirname, 'public', 'video_final_tct.mp4');
}
const NEWS_DATA_PATH = path.join(__dirname, 'src', 'news_data.json');

if (!fs.existsSync(VIDEO_PATH)) {
  console.error('❌ No se encontró el video en out/ ni en public/:', VIDEO_PATH);
  process.exit(1);
}

// ─────────────────────────────────────────
// Construir títulos y descripciones optimizados por plataforma
// ─────────────────────────────────────────
function getMediaContent() {
  let title = 'IA para Emprendedores — Talento con Tarifa';
  let script = '';
  let keyPoints = '';

  try {
    if (fs.existsSync(NEWS_DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(NEWS_DATA_PATH, 'utf-8'));
      if (data.topic) title = `${data.topic} — Talento con Tarifa`;
      script = data.script || '';

      if (Array.isArray(data.scenes)) {
        keyPoints = data.scenes
          .filter(s => s.type === 'image_text' && s.key_points)
          .flatMap(s => s.key_points)
          .slice(0, 4)
          .map(p => `✅ ${p}`)
          .join('\n');
      }
    }
  } catch (e) {
    console.warn('⚠️ No se pudo leer news_data.json, usando valores por defecto.');
  }

  const baseCaption =
    (script ? `${script}\n\n` : '') +
    (keyPoints ? `${keyPoints}\n\n` : '') +
    `─────────────────────────\n` +
    `🤖 Este video fue creado y publicado de manera completamente automática por Inteligencia Artificial.\n` +
    `👉 Conéctate con nosotros: https://talentocontarifa.lat\n\n` +
    `#TalentoConTarifa #InteligenciaArtificial #IAparaEmprendedores #Automatización #MarketingDigital #Shorts #Reels`;

  return {
    title: title,
    caption: baseCaption,
    shortTitle: title.length > 90 ? title.substring(0, 87) + '...' : title
  };
}

// ─────────────────────────────────────────
// Publicar en Facebook Page (Videos)
// ─────────────────────────────────────────
async function publishToFacebook(caption, title) {
  if (!PAGE_ID || !ACCESS_TOKEN) {
    console.log('ℹ️ [Facebook] Omitido: No se configuró META_PAGE_ID o META_PAGE_ACCESS_TOKEN');
    return { status: 'SKIPPED', message: 'Credenciales ausentes' };
  }

  try {
    console.log('\n📘 Publicando video en Facebook Page...');
    const form = new FormData();
    form.append('access_token', ACCESS_TOKEN);
    form.append('description', caption);
    form.append('title', title);
    form.append('file', fs.createReadStream(VIDEO_PATH), {
      filename: 'video_tct.mp4',
      contentType: 'video/mp4',
    });

    const url = `https://graph.facebook.com/v21.0/${PAGE_ID}/videos`;
    const response = await axios.post(url, form, {
      headers: form.getHeaders(),
      validateStatus: () => true
    });

    if (response.data?.error) {
      console.error('❌ [Facebook] Error:', response.data.error.message);
      return { status: 'FAILED', error: response.data.error.message };
    }

    console.log(`✅ [Facebook] Video publicado exitosamente! ID: ${response.data.id}`);
    return { status: 'SUCCESS', id: response.data.id };
  } catch (err) {
    console.error('❌ [Facebook] Error:', err.message);
    return { status: 'FAILED', error: err.message };
  }
}

// ─────────────────────────────────────────
// Orquestador Principal Multi-Redes
// ─────────────────────────────────────────
async function publishAll() {
  const content = getMediaContent();
  const videoSizeKB = Math.round(fs.statSync(VIDEO_PATH).size / 1024);

  console.log('====================================================');
  console.log('🚀 ORQUESTADOR MULTI-PLATAFORMA DE CONTENIDO');
  console.log(`📁 Video: ${VIDEO_PATH} (${videoSizeKB} KB)`);
  console.log(`📌 Título: "${content.shortTitle}"`);
  console.log('====================================================');

  const results = {
    tiktok: null,
    instagram: null,
    youtube: null,
    facebook: null
  };

  // 1. PUBLICAR EN TIKTOK
  try {
    console.log('\n--- 1/4: TIKTOK ---');
    const tiktokTitle = `${content.title.substring(0, 150)} #TalentoConTarifa #InteligenciaArtificial #Emprendedores`;
    results.tiktok = await publishVideoToTikTok(VIDEO_PATH, {
      title: tiktokTitle
    });
  } catch (err) {
    console.error('❌ Error en TikTok:', err.message);
    results.tiktok = { success: false, error: err.message };
  }

  // 2. PUBLICAR EN INSTAGRAM REELS
  try {
    console.log('\n--- 2/4: INSTAGRAM REELS ---');
    results.instagram = await publishReelToInstagram(VIDEO_PATH, {
      caption: content.caption,
      share_to_feed: true
    });
  } catch (err) {
    const errorDetails = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('❌ Error en Instagram Reels:', errorDetails);
    results.instagram = { success: false, error: errorDetails };
  }

  // 3. PUBLICAR EN YOUTUBE SHORTS
  try {
    console.log('\n--- 3/4: YOUTUBE SHORTS ---');
    results.youtube = await publishVideoToYouTube(VIDEO_PATH, {
      title: content.shortTitle,
      description: content.caption,
      tags: ['TalentoConTarifa', 'Inteligencia Artificial', 'Emprendimiento', 'Automatización', 'Shorts']
    });
  } catch (err) {
    console.error('❌ Error en YouTube Shorts:', err.message);
    results.youtube = { success: false, error: err.message };
  }

  // 4. PUBLICAR EN FACEBOOK
  try {
    console.log('\n--- 4/4: FACEBOOK PAGE ---');
    results.facebook = await publishToFacebook(content.caption, content.title);
  } catch (err) {
    console.error('❌ Error en Facebook:', err.message);
    results.facebook = { success: false, error: err.message };
  }

  // ─────────────────────────────────────────
  // Resumen Final
  // ─────────────────────────────────────────
  console.log('\n====================================================');
  console.log('📊 REPORTE DE PUBLICACIÓN FINAL');
  console.log('====================================================');
  console.log(`🎵 TikTok:          ${results.tiktok?.success ? '✅ PUBLICADO' : (results.tiktok?.error ? `❌ ERROR (${results.tiktok.error})` : '⚠️ OMITIDO')}`);
  console.log(`📸 Instagram Reels:  ${results.instagram?.success ? '✅ PUBLICADO' : (results.instagram?.error ? `❌ ERROR (${results.instagram.error})` : '⚠️ OMITIDO')}`);
  console.log(`▶️  YouTube Shorts:   ${results.youtube?.success ? `✅ PUBLICADO (${results.youtube.shortUrl})` : (results.youtube?.error ? `❌ ERROR (${results.youtube.error})` : '⚠️ OMITIDO')}`);
  console.log(`📘 Facebook Page:    ${results.facebook?.status === 'SUCCESS' ? '✅ PUBLICADO' : (results.facebook?.status === 'FAILED' ? `❌ ERROR (${results.facebook.error})` : '⚠️ OMITIDO')}`);
  console.log('====================================================\n');
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  publishAll().catch(e => {
    console.error('Error fatal en el publicador:', e);
  });
}

module.exports = {
  publishAll,
  getMediaContent
};
