require('dotenv').config();
const axios = require('axios');

const PAGE_ID = process.env.META_PAGE_ID;
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8817838735:AAEg6mTjqW7h_xVd-HHHLjpdEc0ng1OKoZA';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8552499385';

async function fetchFacebookData(endpoint) {
  try {
    const url = `https://graph.facebook.com/v19.0${endpoint}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`⚠️ Error fetching FB data for ${endpoint}:`, errorMsg);
    return null;
  }
}

async function getPageMetrics() {
  if (!PAGE_ID || !ACCESS_TOKEN) {
    throw new Error('Missing META_PAGE_ID or META_PAGE_ACCESS_TOKEN environment variables.');
  }

  console.log('📊 [1/5] Obteniendo información general de la página...');
  const pageInfo = await fetchFacebookData(`/${PAGE_ID}?fields=name,followers_count,fan_count&access_token=${ACCESS_TOKEN}`);
  
  console.log('📝 [2/5] Obteniendo publicaciones recientes del feed...');
  const feed = await fetchFacebookData(`/${PAGE_ID}/feed?fields=id,message,created_time,shares,reactions.summary(total_count),comments.limit(30){message,like_count}&limit=15&access_token=${ACCESS_TOKEN}`);

  console.log('🎥 [3/5] Obteniendo videos recientes...');
  const videos = await fetchFacebookData(`/${PAGE_ID}/videos?fields=id,title,description,created_time,comments.limit(30){message}&limit=8&access_token=${ACCESS_TOKEN}`);

  const processedVideos = [];
  if (videos && videos.data) {
    for (const video of videos.data) {
      console.log(`   ⏱️ Obteniendo insights para el video ID: ${video.id}...`);
      const insights = await fetchFacebookData(`/${video.id}/video_insights?metric=post_video_views,post_video_views_organic,post_video_views_10s,post_video_view_time&access_token=${ACCESS_TOKEN}`);
      
      const metricsObj = {};
      if (insights && insights.data) {
        insights.data.forEach(item => {
          if (item.values && item.values.length > 0) {
            metricsObj[item.name] = item.values[0].value;
          }
        });
      }

      processedVideos.push({
        id: video.id,
        title: video.title || video.description?.substring(0, 50) || 'Sin título',
        created_time: video.created_time,
        comments: video.comments ? video.comments.data.map(c => c.message) : [],
        metrics: metricsObj
      });
    }
  }

  return {
    pageName: pageInfo ? pageInfo.name : 'Página de Facebook',
    followers: pageInfo ? pageInfo.followers_count : 'N/A',
    likes: pageInfo ? pageInfo.fan_count : 'N/A',
    feed: feed && feed.data ? feed.data.map(item => ({
      id: item.id,
      message: item.message || 'Sin texto',
      created_time: item.created_time,
      shares: item.shares ? item.shares.count : 0,
      reactions: item.reactions && item.reactions.summary ? item.reactions.summary.total_count : 0,
      comments: item.comments ? item.comments.data.map(c => ({
        message: c.message,
        likes: c.like_count
      })) : []
    })) : [],
    videos: processedVideos
  };
}

async function analyzeWithGroq(data) {
  if (!GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY environment variable.');
  }

  console.log('🧠 [4/5] Enviando datos a Groq (Llama 3.3 70B) para análisis...');
  
  const prompt = `Actúa como un experto Analista de Growth Marketing y Estratega de Redes Sociales para la página de Facebook "${data.pageName}".
Analiza los siguientes datos de rendimiento de la última semana (posts, videos, comentarios y reacciones).

DATOS GENERALES DE LA PÁGINA:
- Seguidores totales: ${data.followers}
- Likes de la página: ${data.likes}

FEED DE PUBLICACIONES (ÚLTIMOS POSTS):
${JSON.stringify(data.feed, null, 2)}

VIDEOS E INSIGHTS DE VIDEO RECIENTES:
${JSON.stringify(data.videos, null, 2)}

Tu objetivo es realizar un análisis estratégico profundo semanal. 

Genera un reporte conciso y accionable formateado en Markdown para Telegram. El reporte debe estructurarse estrictamente de la siguiente manera:

📊 *REPORTE DE RENDIMIENTO SEMANAL*

1. 📈 *Métricas Clave*:
   - Seguidores: ${data.followers} | Likes: ${data.likes}
   - Resumen del nivel de engagement (alto, medio, bajo) y comentarios recibidos.

2. 🏆 *Publicaciones Estrella*:
   - El post/video que mejor funcionó esta semana.
   - Explicación de por qué conectó con la audiencia (tema, gancho, formato).

3. 💬 *Lectura de la Comunidad (Comentarios y Sentimiento)*:
   - Análisis rápido del sentimiento (positivo, negativo, neutral).
   - Dudas recurrentes, críticas o sugerencias detectadas en los comentarios.

4. 🧠 *Lectura Estratégica e Insights*:
   - Qué temas, layouts o formatos visuales (minimal_clean, neo_brutalist, glassmorphism) muestran mejor retención y engagement.

5. 🛠️ *Estrategia y Acciones a Aplicar*:
   - Tres acciones ultra-concretas que el bot aplicará en los guiones, imágenes y layouts para la próxima semana para optimizar resultados.

Por favor, sé directo, estratégico y enfocado al crecimiento. No inventes datos. Usa emojis para facilitar la lectura rápida en móvil.`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }]
    },
    {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.choices[0].message.content;
}

async function sendTelegramMessage(text) {
  console.log('📤 [5/5] Enviando reporte a Telegram...');
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  
  const response = await axios.post(url, {
    chat_id: CHAT_ID,
    text: text,
    parse_mode: 'Markdown'
  });
  
  return response.data;
}

async function main() {
  try {
    const data = await getPageMetrics();
    const analysisReport = await analyzeWithGroq(data);
    await sendTelegramMessage(analysisReport);
    console.log('✅ ¡Proceso de análisis semanal completado con éxito!');
  } catch (error) {
    console.error('❌ Error en el proceso de análisis:', error.message);
    process.exit(1);
  }
}

main();
