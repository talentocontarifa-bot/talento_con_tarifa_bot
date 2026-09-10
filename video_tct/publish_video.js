/**
 * publish_video.js
 * Publica el video renderizado en la página de Facebook de Talento con Tarifa.
 * Flujo Meta Graph API para video:
 *   1. POST /{page_id}/videos  — sube el archivo y lo publica
 * Se leen el caption y el tema desde news_data.json para hacer el post descriptivo.
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const { publishVideoToTikTok } = require('../tiktok_publisher');

const PAGE_ID = process.env.META_PAGE_ID;
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

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
// Construir el caption a partir del contenido generado
// ─────────────────────────────────────────
function buildCaption() {
  try {
    const data = JSON.parse(fs.readFileSync(NEWS_DATA_PATH, 'utf-8'));

    // Extraer key_points de todas las escenas image_text
    const keyPoints = data.scenes
      .filter(s => s.type === 'image_text' && s.key_points)
      .flatMap(s => s.key_points)
      .slice(0, 4)
      .map(p => `✅ ${p}`)
      .join('\n');

    const caption =
      `${data.script}\n\n` +
      (keyPoints ? `${keyPoints}\n\n` : '') +
      `─────────────────────────\n` +
      `🤖 Este video fue creado y publicado de manera completamente automática por Inteligencia Artificial.\n` +
      `Imagina lo que tu negocio podría lograr con este superpoder.\n\n` +
      `👉 Conéctate con nosotros: https://talentocontarifa.lat\n\n` +
      `#TalentoConTarifa #InteligenciaArtificial #IAparaEmprendedores #Automatización #MarketingDigital`;

    return caption;
  } catch (e) {
    console.warn('⚠️  No se pudo leer news_data.json, usando caption genérico.');
    return (
      '🤖 Video generado automáticamente con Inteligencia Artificial.\n\n' +
      'La IA ya está transformando los negocios. ¿El tuyo está listo?\n\n' +
      '👉 https://talentocontarifa.lat\n\n' +
      '#TalentoConTarifa #InteligenciaArtificial #Automatización'
    );
  }
}

// ─────────────────────────────────────────
// Publicar video en Facebook
// ─────────────────────────────────────────
async function publishVideo() {
  const caption = buildCaption();
  const videoSizeKB = Math.round(fs.statSync(VIDEO_PATH).size / 1024);

  // 1. Publicar en Facebook (si hay credenciales de Meta)
  if (PAGE_ID && ACCESS_TOKEN) {
    console.log(`\n📤 Publicando video en Facebook (${videoSizeKB} KB)...`);
    console.log(`📝 Caption (primeros 120 chars): "${caption.substring(0, 120)}..."`);

    const form = new FormData();
    form.append('access_token', ACCESS_TOKEN);
    form.append('description', caption);
    form.append('title', 'IA para Emprendedores — Talento con Tarifa');
    form.append('file', fs.createReadStream(VIDEO_PATH), {
      filename: 'video_tct.mp4',
      contentType: 'video/mp4',
    });

    const url = `https://graph.facebook.com/v21.0/${PAGE_ID}/videos`;

    try {
      const response = await axios.post(url, form, {
        headers: form.getHeaders(),
        validateStatus: () => true
      });

      const data = response.data;

      if (data.error) {
        console.error('❌ Error de Meta API:', JSON.stringify(data.error, null, 2));
      } else {
        console.log(`\n✅ ¡Video publicado con éxito en Facebook!`);
        console.log(`   Post ID: ${data.id}`);
        console.log(`   URL: https://www.facebook.com/${PAGE_ID}/videos/${data.id}`);
      }
    } catch (err) {
      console.error('❌ Error de red al publicar en Facebook:', err.message);
    }
  } else {
    console.log('ℹ️ Omitiendo Facebook: No se configuró META_PAGE_ID o META_PAGE_ACCESS_TOKEN');
  }

  // 2. Publicar en TikTok
  try {
    console.log(`\n🎵 Publicando video en TikTok (${videoSizeKB} KB)...`);
    const tiktokResult = await publishVideoToTikTok(VIDEO_PATH, {
      title: `${caption.split('\n')[0].substring(0, 180)} #TalentoConTarifa #InteligenciaArtificial #Emprendedores`
    });
    console.log('✅ Resultado TikTok:', tiktokResult.status);
  } catch (tiktokErr) {
    console.error('❌ Error al publicar en TikTok:', tiktokErr.message);
  }
}

publishVideo();
