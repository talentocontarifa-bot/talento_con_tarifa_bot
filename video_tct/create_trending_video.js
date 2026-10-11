const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { validateScript, createTimeline } = require('./lib/content');
const { restoreContactEnding } = require('./lib/ending');
const { compose } = require('./scripts/compose');
const axios = require('axios');
let GoogleGenerativeAI;
let getAudioDurationInSeconds;
let googleTTS;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'TX3LPaxmHKxFdv7VOQHJ';
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_v4_turbo';

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!GoogleGenerativeAI) {
    GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
  }
  return new GoogleGenerativeAI(key);
}

function getAudioDuration(file) {
  if (!getAudioDurationInSeconds) {
    try {
      getAudioDurationInSeconds = require('get-audio-duration').getAudioDurationInSeconds;
    } catch (e) {
      // Fallback a ffprobe si get-audio-duration no está disponible
      const { execFileSync } = require('child_process');
      const out = execFileSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' });
      return parseFloat(out.trim());
    }
  }
  return getAudioDurationInSeconds(file);
}

function getGoogleTTS() {
  if (!googleTTS) googleTTS = require('google-tts-api');
  return googleTTS;
}

// ─────────────────────────────────────────
// 0. OBTENER DATOS TRENDING (LOCAL O REMOTO)
// ─────────────────────────────────────────
async function getTrendingData() {
  const jsonPath = path.join(__dirname, '..', 'trending_top10.json');
  const forceFresh = process.argv.includes('--fresh');

  if (!forceFresh && fs.existsSync(jsonPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (cached.huggingface?.length && cached.github?.length) {
        console.log(`📋 Usando datos existentes de ${jsonPath} (${new Date(cached.date).toLocaleString()})`);
        return cached;
      }
    } catch (e) {
      console.warn('⚠️ Error leyendo trending_top10.json:', e.message);
    }
  }

  console.log('📡 Obteniendo datos frescos de Hugging Face y GitHub...');
  const { fetchHuggingFaceTrending, fetchGitHubTrending, generateExecutiveSummary } = require('../trending_top10');
  const [hfModels, ghRepos] = await Promise.all([
    fetchHuggingFaceTrending(),
    fetchGitHubTrending()
  ]);

  const summary = await generateExecutiveSummary(hfModels, ghRepos);
  const freshData = {
    date: new Date().toISOString(),
    summary,
    huggingface: hfModels,
    github: ghRepos
  };

  try {
    fs.writeFileSync(jsonPath, JSON.stringify(freshData, null, 2));
    console.log(`💾 Guardado en ${jsonPath}`);
  } catch (err) {
    console.warn('⚠️ No se pudo guardar trending_top10.json:', err.message);
  }

  return freshData;
}

// ─────────────────────────────────────────
// 1. PLANTILLA DETERMINISTA DE ESCENAS
// ─────────────────────────────────────────
function buildFallbackTrendingScenes(data) {
  const hf = data.huggingface || [];
  const gh = data.github || [];

  const hfKeyPoints = hf.slice(0, 3).map((m, i) => {
    const rawName = (m.name || '').split('/')[1] || m.name || 'Modelo IA';
    const tag = (m.type || 'ai').replace(/^(text-|image-|audio-)/, '');
    const text = `${i + 1}. ${rawName} (${tag})`;
    return text.length > 36 ? text.substring(0, 33) + '...' : text;
  });

  const ghKeyPoints = gh.slice(0, 3).map((r, i) => {
    const rawName = (r.name || '').split('/')[1] || r.name || 'Repo IA';
    const starsK = r.stars >= 1000 ? `${(r.stars / 1000).toFixed(1)}k` : `${r.stars}`;
    const text = `${i + 1}. ${rawName} (⭐${starsK})`;
    return text.length > 36 ? text.substring(0, 33) + '...' : text;
  });

  const hfLead = hf[0]?.name ? (hf[0].name.split('/')[1] || hf[0].name) : 'modelos avanzados';
  const ghLead = gh[0]?.name ? (gh[0].name.split('/')[1] || gh[0].name) : 'nuevas herramientas';

  const cleanSummary = (data.summary || 'El código abierto acelera la adopción de agentes y modelos locales.')
    .replace(/\s+/g, ' ')
    .trim();
  const insightBody = cleanSummary.length > 118 ? cleanSummary.substring(0, 115) + '...' : cleanSummary;

  return {
    scenes: [
      {
        type: 'title',
        text1: 'TOP 10 IA EN TENDENCIA',
        text2: 'GITHUB Y HUGGING FACE',
        voice_text: 'Esta semana el radar open source destaca con proyectos clave de inteligencia artificial en Hugging Face y GitHub.'
      },
      {
        type: 'image_text',
        title: 'TOP MODELOS EN HUGGING FACE',
        key_points: hfKeyPoints.length ? hfKeyPoints : ['1. Vision & LLMs', '2. Agentes locales', '3. Modelos ligeros'],
        voice_text: `En Hugging Face lideran modelos de código abierto y visión, con alta tracción en proyectos como ${hfLead}.`
      },
      {
        type: 'insight',
        title: 'EL PATRÓN DE LA SEMANA',
        body: insightBody,
        voice_text: 'La tendencia clara es la autonomía y los modelos locales para reducir costes operativos y automatizar procesos.'
      },
      {
        type: 'image_text',
        title: 'TOP REPOSITORIOS EN GITHUB',
        key_points: ghKeyPoints.length ? ghKeyPoints : ['1. Frameworks de agentes', '2. Herramientas dev', '3. Automatización'],
        voice_text: `En GitHub destacan repositorios clave como ${ghLead}, sumando miles de estrellas en automatización.`
      },
      {
        type: 'cta',
        headline: '¿LISTO PARA DOMINAR?',
        sub: 'Tu talento amplificado con agentes de IA.',
        btn: 'TALENTOCONTARIFA.LAT',
        voice_text: 'Este video fue creado y publicado de manera completamente automática por inteligencia artificial. Imagina el impacto que este superpoder podría tener en tu negocio. Conéctate con nosotros en Talento con Tarifa punto lat.'
      }
    ]
  };
}

// ─────────────────────────────────────────
// 2. GENERAR GUION CON IA O RESPALDO
// ─────────────────────────────────────────
async function generateTrendingScript(data) {
  const hf = data.huggingface || [];
  const gh = data.github || [];

  const hfSummary = hf.map((m, i) => `${i + 1}. ${m.name} (${m.type}, likes: ${m.likes})`).join('\n');
  const ghSummary = gh.map((r, i) => `${i + 1}. ${r.name} (${r.stars} estrellas): ${r.description}`).join('\n');

  const prompt = `Eres el editor audiovisual de Talento con Tarifa. Crea un Reel en español de 35 a 55 segundos para emprendedores y programadores.
Tema: El Top 10 de Inteligencia Artificial de la semana (5 modelos en Hugging Face y 5 repositorios en GitHub).

DATOS DE HUGGING FACE:
${hfSummary}

DATOS DE GITHUB:
${ghSummary}

RESUMEN ANALÍTICO:
${data.summary || ''}

REGLAS ESTRICTAS DE FORMATO Y LONGITUD (IMPORTANTE):
Devuelve solo JSON con exactamente 5 escenas en este orden:
1. type "title":
   - "text1": Máximo 26 caracteres (ej: "TOP 10 IA EN TENDENCIA")
   - "text2": Máximo 26 caracteres (ej: "GITHUB Y HUGGING FACE")
   - "voice_text": Locución de 12 a 18 palabras. Gancho directo sobre la semana.
2. type "image_text":
   - "title": Máximo 45 caracteres (ej: "TOP MODELOS EN HUGGING FACE")
   - "key_points": Lista de exactamente 3 strings. CADA STRING MÁXIMO 35 CARACTERES (ej: ["1. Qwen 2.5 (Vision)", "2. Laya (Classification)", "3. Bonsai (Text-Gen)"])
   - "voice_text": Locución de 12 a 20 palabras resumiendo qué modelos destacan.
3. type "insight":
   - "title": Máximo 45 caracteres (ej: "EL PATRÓN DE LA SEMANA")
   - "body": EXACTAMENTE MÁXIMO 115 CARACTERES. Conclusión estratégica sobre cómo monetizar o aplicar esto.
   - "voice_text": Locución de 12 a 20 palabras explicando la oportunidad técnica o de negocio.
4. type "image_text":
   - "title": Máximo 45 caracteres (ej: "TOP REPOSITORIOS EN GITHUB")
   - "key_points": Lista de exactamente 3 strings. CADA STRING MÁXIMO 35 CARACTERES (ej: ["1. holaOS (Agentic)", "2. Sphere SDK (Wallet)", "3. Awesome AI (Curated)"])
   - "voice_text": Locución de 12 a 20 palabras sobre los repositorios más prometedores.
5. type "cta":
   - "headline": "DOMINA LAS HERRAMIENTAS"
   - "sub": "Tu talento amplificado con agentes de IA."
   - "btn": "TALENTOCONTARIFA.LAT"
   - "voice_text": "Conéctate con nosotros en talento con tarifa punto lat."

Devuelve ÚNICAMENTE el objeto JSON con formato: {"scenes": [...]}.`;

  // 1. Probar con Groq si está configurado
  if (GROQ_API_KEY) {
    try {
      console.log('🧠 Intentando generar guion de Top 10 con Groq...');
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.6
        })
      });
      const resData = await response.json();
      if (response.ok && resData.choices?.[0]?.message?.content) {
        const rawJson = JSON.parse(resData.choices[0].message.content.trim());
        // Ajustar límites de seguridad
        sanitizeSceneLengths(rawJson);
        const validated = validateScript(rawJson);
        console.log('✅ Guion de Top 10 generado exitosamente con Groq.');
        return validated;
      }
    } catch (e) {
      console.warn('⚠️ Falló generación con Groq:', e.message);
    }
  }

  // 2. Probar con Gemini si está configurado
  const genAI = getGenAI();
  if (genAI) {
    try {
      console.log('🧠 Intentando generar guion de Top 10 con Gemini...');
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });
      const result = await model.generateContent(prompt);
      const rawJson = JSON.parse(result.response.text());
      sanitizeSceneLengths(rawJson);
      const validated = validateScript(rawJson);
      console.log('✅ Guion de Top 10 generado exitosamente con Gemini.');
      return validated;
    } catch (e) {
      console.warn('⚠️ Falló generación con Gemini:', e.message);
    }
  }

  // 3. Fallback determinista seguro
  console.log('🛡️ Usando plantilla estructurada de respaldo para el Top 10...');
  const fallback = buildFallbackTrendingScenes(data);
  sanitizeSceneLengths(fallback);
  return validateScript(fallback);
}

function sanitizeSceneLengths(data) {
  if (!data?.scenes || !Array.isArray(data.scenes)) return;
  data.scenes.forEach((s, i) => {
    if (s.type === 'title') {
      if (s.text1 && s.text1.length > 28) s.text1 = s.text1.substring(0, 27);
      if (s.text2 && s.text2.length > 28) s.text2 = s.text2.substring(0, 27);
    }
    if (s.title && s.title.length > 50) s.title = s.title.substring(0, 48);
    if (s.body && s.body.length > 120) s.body = s.body.substring(0, 117) + '...';
    if (s.sub && s.sub.length > 120) s.sub = s.sub.substring(0, 117) + '...';
    if (s.btn && s.btn.length > 40) s.btn = s.btn.substring(0, 38);
    if (s.voice_text && s.voice_text.length > (s.type === 'cta' ? 300 : 200)) {
      s.voice_text = s.voice_text.substring(0, s.type === 'cta' ? 295 : 195) + '...';
    }
    if (Array.isArray(s.key_points)) {
      s.key_points = s.key_points.slice(0, 3).map(p => {
        const str = String(p || '');
        return str.length > 36 ? str.substring(0, 33) + '...' : str;
      });
    }
  });
}

// ─────────────────────────────────────────
// 3. SÍNTESIS DE VOZ Y TIMELINE
// ─────────────────────────────────────────
function sanitizeTtsText(text) {
  return text
    .replace(/\.{3,}/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/[;:]/g, '.')
    .replace(/,{2,}/g, ',')
    .replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ.,¡!¿?]/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/([.,;:!?])\s*/g, '$1 ')
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
        signal: AbortSignal.timeout(60000),
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

  // 2. edge-tts (es-MX-JorgeNeural a +8%, con masterización broadcast)
  try {
    const { execFileSync } = require('child_process');
    const rawSnippet = targetPath.replace(/\.mp3$/, '_raw.mp3');
    const pythonBin = process.env.PYTHON_PATH || 'python';
    execFileSync(pythonBin, ['-m', 'edge_tts', '--voice', 'es-MX-JorgeNeural', '--rate', '+8%', '--text', clean, '--write-media', rawSnippet], { stdio: 'pipe', timeout: 120000 });
    if (fs.existsSync(rawSnippet) && fs.statSync(rawSnippet).size > 1000) {
      const filterChain = 'highpass=f=80,equalizer=f=140:width_type=h:width=60:g=3.5,equalizer=f=3600:width_type=h:width=1200:g=4.0,acompressor=threshold=-16dB:ratio=4:attack=10:release=120:makeup=2.5dB,loudnorm=I=-14:TP=-1.0:LRA=7';
      const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';
      execFileSync(ffmpegBin, ['-y', '-i', rawSnippet, '-af', filterChain, '-c:a', 'libmp3lame', '-b:a', '192k', targetPath], { stdio: 'pipe', timeout: 120000 });
      try { fs.unlinkSync(rawSnippet); } catch (e) {}
      return;
    }
  } catch (edgeErr) {
    // Continuar a fallback
  }

  // 3. Fallback Google TTS
  const gTTS = getGoogleTTS();
  const base64s = await gTTS.getAllAudioBase64(clean, { lang: 'es', slow: false });
  const buffer = Buffer.concat(base64s.map(chunk => Buffer.from(chunk.base64, 'base64')));
  fs.writeFileSync(targetPath, buffer);
}

async function generateVoice(scenes) {
  const durations = [];
  for (let i = 0; i < scenes.length; i++) {
    const target = path.join(__dirname, 'public', `voice_scene_${i + 1}.mp3`);
    await synthesizeSnippet(scenes[i].voice_text, target);
    durations.push(await getAudioDuration(target));
  }
  const timeline = createTimeline(scenes, durations);

  // Mezcla de la pista completa para TikTok y archivo general
  const args = ['-y'];
  timeline.scenes.forEach(s => args.push('-i', path.join(__dirname, s.audio)));
  const delays = timeline.scenes.map((s, i) => `[${i}:a]adelay=${Math.round(s.start * 1000)}:all=1[a${i}]`);
  const mix = timeline.scenes.map((s, i) => `[a${i}]`).join('') + `amix=inputs=${scenes.length}:normalize=0,apad,atrim=duration=${timeline.total_duration_sec}[voice]`;
  args.push('-filter_complex', delays.concat(mix).join(';'), '-map', '[voice]', '-c:a', 'libmp3lame', '-b:a', '192k', path.join(__dirname, 'public/news_voice.mp3'));
  
  try {
    require('child_process').execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: 'pipe', timeout: 120000 });
  } catch (err) {
    console.warn('⚠️ No se pudo generar news_voice.mp3 con ffmpeg:', err.message);
  }

  return { totalFrames: timeline.total_frames, totalDurationSec: timeline.total_duration_sec, timelineScenes: timeline.scenes };
}

// ─────────────────────────────────────────
// 4. DESCARGA DE IMÁGENES OFICIALES (HF & GITHUB)
// ─────────────────────────────────────────
async function downloadImage(url, targetPath) {
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      maxContentLength: 15 * 1024 * 1024,
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const buffer = Buffer.from(res.data);
    const isImage = (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) ||
                    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
                    (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP');
    if (buffer.length > 3000 && isImage) {
      fs.writeFileSync(targetPath, buffer);
      return true;
    }
  } catch (e) {
    // Silencioso o advertencia leve
  }
  return false;
}

async function prepareTrendingImages(scenes, trendingData) {
  if (process.env.VIDEO_VISUAL_MODE === 'graphics') {
    scenes.forEach(s => { s.image = null; s.image_kind = 'graphics'; });
    return;
  }

  console.log('\n📸 Preparando tarjetas visuales para Hugging Face y GitHub...');

  // 1. Escena 1 (Hugging Face)
  const scene1Path = path.join(__dirname, 'public', 'scene_1.png');
  let hfSuccess = false;
  // Intentar descargar logo oficial de marca HF
  hfSuccess = await downloadImage('https://huggingface.co/datasets/huggingface/brand-assets/resolve/main/hf-logo.png', scene1Path);
  
  if (!hfSuccess && fs.existsSync(path.join(__dirname, 'public', 'agent_robot.png'))) {
    // Si no se descargó, usar asset robot/ia local
    fs.copyFileSync(path.join(__dirname, 'public', 'agent_robot.png'), scene1Path);
    hfSuccess = true;
  }

  scenes[1].image = hfSuccess ? 'public/scene_1.png' : null;
  scenes[1].image_kind = hfSuccess ? 'article' : 'illustration';

  // 2. Escena 3 (GitHub Trending Repo Card)
  const scene3Path = path.join(__dirname, 'public', 'scene_3.png');
  let ghSuccess = false;
  const topRepo = trendingData.github?.[0];
  if (topRepo?.name) {
    const ogUrl = `https://opengraph.githubassets.com/1/${topRepo.name}`;
    console.log(`  → Descargando OpenGraph card del repositorio #1 (${topRepo.name})...`);
    ghSuccess = await downloadImage(ogUrl, scene3Path);
  }

  if (!ghSuccess && fs.existsSync(path.join(__dirname, 'public', 'data_structure.png'))) {
    fs.copyFileSync(path.join(__dirname, 'public', 'data_structure.png'), scene3Path);
    ghSuccess = true;
  }

  scenes[3].image = ghSuccess ? 'public/scene_3.png' : null;
  scenes[3].image_kind = ghSuccess ? 'article' : 'illustration';

  // 3. Compartir visuales en escenas 0, 2 y 4 para coherencia
  for (const index of [0, 2, 4]) {
    const visual = scenes[index === 2 ? 3 : 1];
    scenes[index].image = visual.image;
    scenes[index].image_kind = visual.image_kind;
  }
}

// ─────────────────────────────────────────
// 5. FLUJO PRINCIPAL
// ─────────────────────────────────────────
async function main() {
  console.log('========================================================');
  console.log('🌟 GENERADOR DE VIDEO REEL: TOP 10 IA (HF & GITHUB) 🌟');
  console.log('========================================================');

  // Paso 1: Obtener datos
  const trendingData = await getTrendingData();

  // Paso 2: Generar guion y escenas validadas con el cierre oficial de marca
  const rawScript = await generateTrendingScript(trendingData);
  const data = validateScript(restoreContactEnding(rawScript));

  console.log(`\n🎬 Título: "${data.scenes[0].text1} - ${data.scenes[0].text2}"`);
  console.log(`💡 Enfoque HF: "${data.scenes[1].title}"`);
  console.log(`💡 Enfoque GitHub: "${data.scenes[3].title}"`);

  // Paso 3: Sintetizar audio y calcular timeline
  console.log('\n🎙️ Sintetizando locución sincronizada por escenas...');
  const { totalFrames, timelineScenes, totalDurationSec } = await generateVoice(data.scenes);
  console.log(`⏱️ Duración total: ${totalDurationSec.toFixed(1)}s (${totalFrames} frames)`);

  // Paso 4: Descargar e integrar imágenes reales
  await prepareTrendingImages(timelineScenes, trendingData);

  // Paso 5: Armar estructura para HyperFrames
  const newsData = {
    visual_mode: process.env.VIDEO_VISUAL_MODE === 'graphics' ? 'graphics' : 'hybrid',
    schema_version: 2,
    theme_color: '#00e5ff', // Cian neón tecnológico
    layout_type: 'cinematic',
    source_url: 'https://huggingface.co/models | https://github.com/trending',
    scenes: timelineScenes,
    total_duration_sec: totalDurationSec,
    total_frames: totalFrames
  };

  const newsDataPath = path.join(__dirname, 'src', 'news_data.json');
  fs.writeFileSync(newsDataPath, JSON.stringify(newsData, null, 2));
  console.log(`💾 Composición escrita en ${newsDataPath}`);

  // Paso 6: Componer HTML/GSAP/CCTV
  compose(newsData);

  console.log('\n✅ Composición completada con éxito.');
  console.log('🚀 Puedes ejecutar HyperFrames para previsualizar o renderizar:');
  console.log('   npx hyperframes preview   (o npm run video:preview)');
  console.log('   npx hyperframes render -o out/render.mp4');
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Error crítico en create_trending_video:', err);
    process.exit(1);
  });
}

module.exports = {
  getTrendingData,
  buildFallbackTrendingScenes,
  generateTrendingScript,
  sanitizeSceneLengths,
  main
};
