const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let axios;
try {
  axios = require('axios');
} catch (e) {
  try {
    axios = require(path.join(__dirname, 'node_modules', 'axios'));
  } catch (e2) {
    try {
      axios = require(path.join(__dirname, '..', 'node_modules', 'axios'));
    } catch (e3) {
      throw e;
    }
  }
}

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const { publishReelToInstagram } = require('../instagram_publisher');
const { publishVideoToTikTok } = require('../tiktok_publisher');
const { publishVideoToYouTube } = require('../youtube_publisher');

const VIDEO_PATH = path.join(__dirname, 'out', 'video_editorial.mp4');
const DATA_PATH = path.join(__dirname, 'editorial_data.json');
const ISSUE_PATH = path.join(__dirname, 'current_issue.txt');

if (!fs.existsSync(VIDEO_PATH)) {
  console.error('❌ No se encontró el video en:', VIDEO_PATH);
  process.exit(1);
}

function buildMetadata() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    const title = data.title || "El día que vendieron el perdón por kilo";
    const fullSpeech = (data.timeline || []).map(sc => sc.voice_text).join('\n\n');

    const cleanTitle = title.replace(/[^\w\s#áéíóúÁÉÍÓÚñÑ.,:!-]/g, '').trim();
    const shortTitle = cleanTitle.substring(0, 90);

    const caption = 
      `📖 ${title.toUpperCase()}\n\n` +
      `${fullSpeech.substring(0, 1000)}\n\n` +
      `💡 Una reflexión sobre instituciones, trámites y tarifas a lo largo de la historia.\n\n` +
      `🔗 Más reflexiones y ensayos en talentocontarifa.com\n\n` +
      `#TalentoConTarifa #Historia #Filosofia #Economia #Sociedad #Shorts #Reels #TikTok`;

    return {
      title,
      cleanTitle,
      shortTitle,
      caption,
      duration: data.duration || 60
    };
  } catch (e) {
    return {
      title: "El día que vendieron el perdón por kilo",
      cleanTitle: "El día que vendieron el perdón por kilo",
      shortTitle: "El día que vendieron el perdón por kilo",
      caption: "📖 Reflexión sobre instituciones y tarifas a lo largo de la historia.\n\n#TalentoConTarifa #Shorts",
      duration: 60
    };
  }
}

async function publishAll() {
  const meta = buildMetadata();
  const videoSizeKB = Math.round(fs.statSync(VIDEO_PATH).size / 1024);

  console.log('====================================================');
  console.log('🚀 PUBLICADOR MULTI-PLATAFORMA — TALENTO CON TARIFA EDITORIAL');
  console.log(`📁 Video: ${VIDEO_PATH} (${videoSizeKB} KB)`);
  console.log(`📌 Título: "${meta.title}"`);
  console.log('====================================================');

  const results = {
    tiktok: null,
    instagram: null,
    youtube: null
  };

  // 1. TIKTOK
  try {
    console.log('\n--- 1/3: TIKTOK ---');
    results.tiktok = await publishVideoToTikTok(VIDEO_PATH, {
      title: `${meta.shortTitle} #TalentoConTarifa #Historia`
    });
  } catch (err) {
    console.error('❌ Error en TikTok:', err.message);
    results.tiktok = { success: false, error: err.message };
  }

  // 2. INSTAGRAM REELS
  try {
    console.log('\n--- 2/3: INSTAGRAM REELS ---');
    results.instagram = await publishReelToInstagram(VIDEO_PATH, {
      caption: meta.caption,
      share_to_feed: true
    });
  } catch (err) {
    const errDetail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('❌ Error en Instagram Reels:', errDetail);
    results.instagram = { success: false, error: errDetail };
  }

  // 3. YOUTUBE SHORTS
  try {
    console.log('\n--- 3/3: YOUTUBE SHORTS ---');
    results.youtube = await publishVideoToYouTube(VIDEO_PATH, {
      title: `${meta.shortTitle} #Shorts`,
      description: meta.caption,
      tags: ['TalentoConTarifa', 'Historia', 'Filosofia', 'Economia', 'Ensayos', 'Documental', 'Shorts']
    });
  } catch (err) {
    console.error('❌ Error en YouTube Shorts:', err.message);
    results.youtube = { success: false, error: err.message };
  }

  console.log('\n====================================================');
  console.log('📊 REPORTE DE PUBLICACIÓN FINAL — EDITORIAL');
  console.log('====================================================');
  console.log(`🎵 TikTok:          ${results.tiktok?.success ? '✅ PUBLICADO' : (results.tiktok?.error ? `❌ ERROR (${results.tiktok.error})` : '⚠️ OMITIDO')}`);
  console.log(`📸 Instagram Reels:  ${results.instagram?.success ? '✅ PUBLICADO' : (results.instagram?.error ? `❌ ERROR (${results.instagram.error})` : '⚠️ OMITIDO')}`);
  console.log(`▶️  YouTube Shorts:   ${results.youtube?.success ? '✅ PUBLICADO' : (results.youtube?.error ? `❌ ERROR (${results.youtube.error})` : '⚠️ OMITIDO')}`);
  console.log('====================================================\n');

  // Si vino de un Issue, comentar y cerrar
  if (fs.existsSync(ISSUE_PATH)) {
    try {
      const issueNum = fs.readFileSync(ISSUE_PATH, 'utf-8').trim();
      if (issueNum) {
        console.log(`💬 Actualizando y cerrando Issue #${issueNum}...`);
        const ytLink = results.youtube?.url ? `[Ver en YouTube Shorts](${results.youtube.url})` : (results.youtube?.success ? 'Publicado en canal oficial' : 'Pendiente / error');
        const igStatus = results.instagram?.success ? 'Publicado en [@talentocontarifa](https://instagram.com/talentocontarifa)' : 'Error / omitido';
        const ttStatus = results.tiktok?.success ? 'Enviado a bandeja de entrada de TikTok' : 'Error / omitido';

        const commentBody = 
          `### 🎬 Video Editorial Generado y Publicado\n\n` +
          `**Título:** ${meta.title}\n\n` +
          `- ▶️ **YouTube Shorts:** ${ytLink}\n` +
          `- 📸 **Instagram Reels:** ${igStatus}\n` +
          `- 🎵 **TikTok:** ${ttStatus}\n\n` +
          `*Procesado automáticamente con el motor Hyperframes de Talento con Tarifa.*`;

        const safeComment = commentBody.replace(/"/g, '\\"');
        execSync(`gh issue comment ${issueNum} --body "${safeComment}"`, { stdio: 'inherit' });
        execSync(`gh issue close ${issueNum}`, { stdio: 'inherit' });
        console.log(`✅ Issue #${issueNum} comentado y cerrado exitosamente.`);
      }
    } catch (e) {
      console.warn(`⚠️ No se pudo actualizar el issue:`, e.message);
    }
  }
}

publishAll();
