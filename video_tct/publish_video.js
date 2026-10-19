/**
 * publish_video.js
 * Orquestador Multi-Plataforma unificado para Talento con Tarifa:
 *   1. Facebook Reels (Meta Graph API v21.0 - video_reels con fallback a videos)
 *   2. Instagram Reels (Meta Graph API v21.0 - Resumable Upload)
 *   3. TikTok (API v2 oficial - Video completo con audio masterizado y SFX)
 *   4. YouTube Shorts (YouTube Data API v3 - Resumable Upload)
 *
 * Incluye:
 *   - Soporte para `--check-config` (valida credenciales sin publicar).
 *   - Soporte para `--dry-run` (simulación sin llamadas externas ni escritura de estado).
 *   - Verificación criptográfica SHA-256 contra `out/render-manifest.json`.
 *   - Persistencia por plataforma en `publication-state.json` (evita dobles publicaciones).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const FormData = require('form-data');

let axios;
try {
  axios = require('axios');
} catch (e) {
  axios = require(path.join(__dirname, 'node_modules', 'axios'));
}

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { settings, createMetaClient } = require('./lib/meta');
const { publishTargets } = require('./lib/publication');
const { publishVideoToTikTok } = require('../tiktok_publisher');
const { publishReelToInstagram, getInstagramAccountId } = require('../instagram_publisher');
const { publishVideoToYouTube } = require('../youtube_publisher');
const { formatMarkdownForSocial, stripMarkdown } = require('../news_sources');

const VIDEO_PATH = path.join(__dirname, 'out', 'video_final_tct.mp4');
const MANIFEST_PATH = path.join(__dirname, 'out', 'render-manifest.json');
const NEWS_DATA_PATH = path.join(__dirname, 'src', 'news_data.json');
const STATE_PATH = path.join(__dirname, 'publication-state.json');
const HISTORY_PATH = path.join(__dirname, 'used_video_news.json');

/**
 * Construye títulos, descripción y caption unificados a partir de src/news_data.json
 */
function getMediaContent(rawData = null) {
  let data = rawData;
  if (!data && fs.existsSync(NEWS_DATA_PATH)) {
    try {
      data = JSON.parse(fs.readFileSync(NEWS_DATA_PATH, 'utf-8'));
    } catch (e) {
      console.warn('⚠️ No se pudo parsear src/news_data.json:', e.message);
    }
  }
  data = data || {};

  const scenes = Array.isArray(data.scenes) ? data.scenes : [];
  const hook = stripMarkdown([scenes[0]?.text1, scenes[0]?.text2].filter(Boolean).join(' — ').trim());
  const topic = stripMarkdown((data.topic || hook || 'IA para Emprendedores').trim());
  const title = topic.toLowerCase().includes('talento con tarifa')
    ? topic
    : `${topic} | Talento con Tarifa`;
  const shortTitle = title.length > 90 ? title.substring(0, 87) + '...' : title;

  const narration = formatMarkdownForSocial((
    data.script ||
    scenes.map(s => s.voice_text).filter(Boolean).join(' ')
  ).trim());

  const keyPoints = scenes
    .filter(s => s.type === 'image_text' && Array.isArray(s.key_points))
    .flatMap(s => s.key_points)
    .slice(0, 6)
    .map(p => `✅ ${formatMarkdownForSocial(String(p).replace(/^\s*\d+[.)-]\s*/, '').trim())}`)
    .join('\n');

  const hasValidSourceUrl =
    typeof data.source_url === 'string' &&
    /^https?:\/\//.test(data.source_url) &&
    !data.source_url.includes(' | ');

  const blocks = [
    hook ? `🔥 ${formatMarkdownForSocial(`**${hook}**`)}` : `🔥 ${formatMarkdownForSocial(`**${topic}**`)}`,
    narration || null,
    keyPoints || null,
    hasValidSourceUrl ? `🔗 Fuente: ${data.source_url}` : null,
    '─────────────────────────',
    '🤖 Este contenido fue creado y publicado de manera automática con Inteligencia Artificial.',
    '⚡ Imagina lo que este superpoder puede hacer por tu local, negocio o emprendimiento.',
    '👉 Conéctate con nosotros: https://talentocontarifa.lat',
    '#TalentoConTarifa #InteligenciaArtificial #IAparaEmprendedores #Automatizacion #NegociosLocales #MarketingDigital #Shorts #Reels'
  ].filter(Boolean);

  const caption = blocks.join('\n\n').slice(0, 2200);

  return {
    title,
    shortTitle,
    caption,
    hook: hook || topic
  };
}

/**
 * Fallback de subida a Facebook Videos si el endpoint de Reels falla por permisos/formato
 */
async function publishFacebookVideoFallback(target, file, caption, title) {
  const form = new FormData();
  form.append('access_token', target.token);
  form.append('description', caption);
  form.append('title', title);
  form.append('file', fs.createReadStream(file), {
    filename: 'video_tct.mp4',
    contentType: 'video/mp4'
  });

  const version = process.env.META_GRAPH_VERSION || 'v21.0';
  const url = `https://graph.facebook.com/${version}/${target.account}/videos`;
  const response = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: 300000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true
  });

  if (response.data?.error || !response.data?.id) {
    throw new Error(response.data?.error?.message || 'Facebook no devolvió ID de video.');
  }
  return { id: response.data.id };
}

/**
 * Orquestador Principal Multi-Redes
 */
async function publishAll() {
  if (!process.env.INSTAGRAM_ACCOUNT_ID && !process.env.INSTAGRAM_USER_ID) {
    const foundIgId = await getInstagramAccountId(
      process.env.META_PAGE_ID,
      process.env.META_PAGE_ACCESS_TOKEN || process.env.META_USER_ACCESS_TOKEN
    );
    if (foundIgId) process.env.INSTAGRAM_ACCOUNT_ID = foundIgId;
  }

  const config = settings(process.env);
  if (process.argv.includes('--check-config')) {
    console.log('✅ Configuración presente y validada para:', config.targets.map(t => t.platform).join(', '));
    return { checked: true, platforms: config.targets.map(t => t.platform) };
  }

  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(NEWS_DATA_PATH)) {
    throw new Error(`No se encontró el archivo de datos del video: ${NEWS_DATA_PATH}`);
  }
  const rawData = JSON.parse(fs.readFileSync(NEWS_DATA_PATH, 'utf-8'));
  if (!Array.isArray(rawData.scenes) || rawData.scenes.length === 0) {
    throw new Error('src/news_data.json no contiene escenas válidas.');
  }

  if (!dryRun) {
    if (!fs.existsSync(VIDEO_PATH) || fs.statSync(VIDEO_PATH).size < 1000) {
      throw new Error(`Falta un render válido en ${VIDEO_PATH}. Ejecuta primero el paso de renderizado.`);
    }

    if (fs.existsSync(MANIFEST_PATH)) {
      const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
      const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (manifest.video_sha256 !== sha256(VIDEO_PATH) || manifest.data_sha256 !== sha256(NEWS_DATA_PATH)) {
        throw new Error('El video en out/video_final_tct.mp4 no coincide con el guion sellado en render-manifest.json.');
      }
    }
  }

  // Asegurar que exista un source_url determinista para el registro de estado (incluso en guion de contingencia)
  const effectiveSourceUrl =
    rawData.source_url ||
    `tct-reel:${crypto.createHash('sha256').update(JSON.stringify(rawData.scenes.map(s => s.voice_text))).digest('hex').slice(0, 24)}`;

  const dataForState = {
    ...rawData,
    preview_only: Boolean(rawData.preview_only),
    source_url: effectiveSourceUrl
  };

  const content = getMediaContent(rawData);
  const videoSizeKB = fs.existsSync(VIDEO_PATH) ? Math.round(fs.statSync(VIDEO_PATH).size / 1024) : 0;

  console.log('====================================================');
  console.log('🚀 ORQUESTADOR MULTI-PLATAFORMA DE CONTENIDO');
  console.log(`📁 Video: ${VIDEO_PATH} (${videoSizeKB} KB)`);
  console.log(`📌 Título: "${content.shortTitle}"`);
  console.log(`🔗 Fuente: ${effectiveSourceUrl}`);
  console.log(`🌐 Redes objetivo: ${config.targets.map(t => t.platform).join(', ')}`);
  console.log('====================================================');

  const metaClient = createMetaClient({ axios, version: config.version });

  const report = await publishTargets({
    data: dataForState,
    targets: config.targets,
    stateFile: STATE_PATH,
    historyFile: HISTORY_PATH,
    dryRun,
    publish: async (target, checkpoint) => {
      // 1. FACEBOOK REELS (con fallback a Facebook Videos)
      if (target.platform === 'facebook') {
        console.log('\n--- FACEBOOK REELS ---');
        try {
          const fbRes = await metaClient.publish(target, {
            file: VIDEO_PATH,
            caption: content.caption,
            checkpoint
          });
          console.log(`✅ [Facebook Reel] Publicado exitosamente! ID: ${fbRes.id}`);
          return fbRes;
        } catch (reelErr) {
          console.warn(`⚠️ [Facebook Reel] Falló subida como Reel (${reelErr.message}), intentando subida estándar a /videos...`);
          const fbFallback = await publishFacebookVideoFallback(target, VIDEO_PATH, content.caption, content.title);
          console.log(`✅ [Facebook Video] Publicado exitosamente! ID: ${fbFallback.id}`);
          return fbFallback;
        }
      }

      // 2. INSTAGRAM REELS
      if (target.platform === 'instagram') {
        console.log('\n--- INSTAGRAM REELS ---');
        const igRes = await publishReelToInstagram(VIDEO_PATH, {
          caption: content.caption,
          share_to_feed: true,
          checkpoint
        });
        return { id: igRes.mediaId };
      }

      // 3. YOUTUBE SHORTS
      if (target.platform === 'youtube') {
        console.log('\n--- YOUTUBE SHORTS ---');
        const ytRes = await publishVideoToYouTube(VIDEO_PATH, {
          title: content.shortTitle,
          description: content.caption,
          tags: ['TalentoConTarifa', 'Inteligencia Artificial', 'Emprendimiento', 'Automatización', 'Shorts']
        });
        if (!ytRes.success || !ytRes.videoId) {
          throw new Error('YouTube no confirmó la carga del Short.');
        }
        return { id: ytRes.videoId };
      }

      // 4. TIKTOK (envía el mismo video completo con música/SFX salvo que TIKTOK_VOICE_ONLY=true)
      if (target.platform === 'tiktok') {
        console.log('\n--- TIKTOK ---');
        let tiktokVideoPath = VIDEO_PATH;
        const voicePath = path.join(__dirname, 'public', 'news_voice.mp3');

        if (process.env.TIKTOK_VOICE_ONLY === 'true' && fs.existsSync(voicePath)) {
          try {
            const voiceOnlyVideo = path.join(path.dirname(VIDEO_PATH), 'video_tiktok_voiceonly.mp4');
            console.log('🎙️ TIKTOK_VOICE_ONLY=true: Generando versión solo voz para TikTok...');
            execFileSync(
              process.env.FFMPEG_PATH || 'ffmpeg',
              ['-y', '-i', VIDEO_PATH, '-i', voicePath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', voiceOnlyVideo],
              { stdio: 'pipe', timeout: 120000 }
            );
            if (fs.existsSync(voiceOnlyVideo) && fs.statSync(voiceOnlyVideo).size > 1000) {
              tiktokVideoPath = voiceOnlyVideo;
            }
          } catch (ffmpegErr) {
            console.warn('⚠️ No se pudo aislar la voz para TikTok, usando video completo:', ffmpegErr.message);
          }
        }

        const tiktokTitle = `${content.shortTitle} — ${content.caption}`.slice(0, 2000);
        const ttRes = await publishVideoToTikTok(tiktokVideoPath, {
          title: tiktokTitle
        });
        if (ttRes.publishId) {
          checkpoint({ id: ttRes.publishId, mode: ttRes.mode });
        }
        if (!ttRes.success || !ttRes.publishId) {
          throw new Error(ttRes.reason || 'TikTok no confirmó la recepción del video.');
        }
        const isInboxOrProcessing = ttRes.status === 'SEND_TO_USER_INBOX' || ttRes.status === 'PROCESSING';
        return {
          id: ttRes.publishId,
          status: isInboxOrProcessing ? 'submitted' : 'published'
        };
      }

      throw new Error(`Plataforma no soportada: ${target.platform}`);
    }
  });

  if (!dryRun) {
    fs.mkdirSync(path.dirname(VIDEO_PATH), { recursive: true });
    fs.writeFileSync(
      path.join(path.dirname(VIDEO_PATH), 'publication-report.json'),
      JSON.stringify(report, null, 2)
    );
  }

  console.log('\n====================================================');
  console.log('📊 REPORTE DE PUBLICACIÓN FINAL');
  console.log('====================================================');
  for (const [platform, res] of Object.entries(report.results)) {
    const icon = ['published', 'submitted'].includes(res.status) ? '✅' : (res.status === 'preview' ? '🧪' : '❌');
    const detail = res.id ? ` (ID: ${res.id})` : '';
    const skipped = res.skipped ? ' [YA PUBLICADO - OMITIDO]' : '';
    const errText = res.error ? ` — ${res.error}` : '';
    console.log(`${icon} ${platform.toUpperCase().padEnd(12)}: ${res.status}${detail}${skipped}${errText}`);
  }
  console.log('====================================================\n');

  const succeededCount = Object.values(report.results).filter(r => ['published', 'submitted', 'preview'].includes(r.status)).length;
  if (succeededCount === 0 && !dryRun) {
    process.exitCode = 1;
  }

  return report;
}

if (require.main === module) {
  publishAll().catch(e => {
    console.error('❌ Error fatal en el publicador:', e.message);
    process.exitCode = 1;
  });
}

module.exports = {
  publishAll,
  getMediaContent
};
