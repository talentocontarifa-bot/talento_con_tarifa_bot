/**
 * Top 10 Trending AI: Hugging Face & GitHub
 * Recopila semanalmente los 5 modelos más populares de Hugging Face y los 5 repositorios
 * de IA con más crecimiento en GitHub para su publicación y difusión.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PAGE_ID = process.env.META_PAGE_ID;
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

async function fetchHuggingFaceTrending() {
  console.log("🤗 Consultando Top 5 Modelos en Hugging Face...");
  try {
    const res = await axios.get('https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=5', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return res.data.map(m => ({
      name: m.id,
      type: m.pipeline_tag || 'ai-model',
      likes: m.likes || 0,
      downloads: m.downloads || 0,
      url: `https://huggingface.co/${m.id}`
    }));
  } catch (e) {
    console.warn("⚠️ Error consultando Hugging Face API:", e.message);
    return [];
  }
}

async function fetchGitHubTrending() {
  console.log("🐙 Consultando Top 5 Repositorios de IA en GitHub...");
  try {
    const headers = { 'User-Agent': 'TalentoConTarifa-Bot/1.0' };
    if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN || process.env.GH_TOKEN}`;
    }
    const res = await axios.get(
      'https://api.github.com/search/repositories?q=topic:artificial-intelligence+created:>2026-01-01&sort=stars&order=desc&per_page=5',
      { headers, timeout: 10000 }
    );
    return (res.data.items || []).map(r => ({
      name: r.full_name,
      description: r.description || 'Herramienta de inteligencia artificial de código abierto.',
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      url: r.html_url
    }));
  } catch (e) {
    console.warn("⚠️ Error consultando GitHub Search API:", e.message);
    return [];
  }
}

async function generateExecutiveSummary(hfModels, ghRepos) {
  if (!GEMINI_API_KEY) {
    return "Esta semana el ecosistema open source destaca con potentes avances en agentes autónomos, modelos de visión y herramientas locales de IA.";
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `
Eres el analista de tecnología de 'Talento con Tarifa'. Redacta una introducción ejecutiva concisa (máximo 3 oraciones de alto impacto) resumiendo las tendencias clave de estos 10 proyectos de IA de la semana:

Modelos Hugging Face:
${hfModels.map(m => `- ${m.name} (${m.type})`).join('\n')}

Repositorios GitHub:
${ghRepos.map(r => `- ${r.name}: ${r.description}`).join('\n')}

Enfócate en cómo los emprendedores y profesionales de software pueden aprovechar esta ola para automatizar y cobrar más por su tarifa. No uses saludos largos.
`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (e) {
    console.warn("⚠️ Error generando resumen con Gemini:", e.message);
    return "Los modelos de generación visual y los frameworks de agentes autónomos dominan las tendencias de código abierto esta semana.";
  }
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("ℹ️ Variables de Telegram no configuradas. Omitiendo envío a Telegram.");
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    });
    console.log("✅ Reporte Top 10 publicado en Telegram exitosamente.");
  } catch (err) {
    console.warn("⚠️ Falló envío HTML a Telegram, intentando texto plano:", err.message);
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      await axios.post(url, {
        chat_id: TELEGRAM_CHAT_ID,
        text: text.replace(/<[^>]*>?/gm, '')
      });
      console.log("✅ Reporte Top 10 entregado en Telegram como texto plano.");
    } catch (e2) {
      console.error("❌ Error final enviando a Telegram:", e2.message);
    }
  }
}

async function publishToFacebook(text) {
  if (!PAGE_ID || !PAGE_ACCESS_TOKEN) {
    console.log("ℹ️ Variables de Meta no configuradas. Omitiendo envío a Facebook.");
    return;
  }
  try {
    const cleanText = text.replace(/<[^>]*>?/gm, '');
    const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/feed`;
    await axios.post(url, null, {
      params: {
        message: cleanText,
        access_token: PAGE_ACCESS_TOKEN
      }
    });
    console.log("✅ Reporte Top 10 publicado en página de Facebook exitosamente.");
  } catch (err) {
    console.warn("⚠️ Error publicando en Facebook:", err.response?.data?.error?.message || err.message);
  }
}

async function main() {
  console.log("=========================================");
  console.log("🌟 GENERANDO TOP 10 TRENDING (HF & GITHUB) 🌟");
  console.log("=========================================");

  const [hfModels, ghRepos] = await Promise.all([
    fetchHuggingFaceTrending(),
    fetchGitHubTrending()
  ]);

  const summary = await generateExecutiveSummary(hfModels, ghRepos);

  // Formato HTML para Telegram
  let reportHtml = `🚀 <b>TOP 10 TRENDING EN IA DE LA SEMANA</b> 🚀\n`;
  reportHtml += `<i>Talento con Tarifa • Radar Open Source</i>\n\n`;
  reportHtml += `💡 <b>Visión Ejecutiva:</b>\n${summary}\n\n`;

  reportHtml += `🤗 <b>TOP 5 MODELOS EN HUGGING FACE:</b>\n`;
  hfModels.forEach((m, i) => {
    reportHtml += `${i + 1}. <b><a href="${m.url}">${m.name}</a></b>\n`;
    reportHtml += `   🏷️ <i>${m.type}</i> • ❤️ ${m.likes.toLocaleString()} likes • 📥 ${m.downloads.toLocaleString()} descargas\n`;
  });

  reportHtml += `\n🐙 <b>TOP 5 REPOSITORIOS EN GITHUB:</b>\n`;
  ghRepos.forEach((r, i) => {
    reportHtml += `${i + 1}. <b><a href="${r.url}">${r.name}</a></b> (⭐ ${r.stars.toLocaleString()} stars)\n`;
    reportHtml += `   📝 ${r.description.substring(0, 110)}...\n`;
  });

  reportHtml += `\n🌐 Conoce más en <b>talentocontarifa.lat</b>\n#InteligenciaArtificial #OpenSource #GitHub #HuggingFace #TechTrends`;

  console.log("\n--- VISTA PREVIA DEL REPORTE ---");
  console.log(reportHtml.replace(/<[^>]*>?/gm, ''));
  console.log("--------------------------------\n");

  // Guardar archivo JSON estructurado para archivo o producción de video
  const outputData = {
    date: new Date().toISOString(),
    summary,
    huggingface: hfModels,
    github: ghRepos
  };
  const jsonOutPath = path.join(__dirname, 'trending_top10.json');
  fs.writeFileSync(jsonOutPath, JSON.stringify(outputData, null, 2));
  console.log(`💾 Datos guardados en ${jsonOutPath}`);

  // Publicar si se ejecuta en GitHub Actions / Producción
  await sendTelegram(reportHtml);
  await publishToFacebook(reportHtml);

  console.log("\n🎉 TOP 10 TRENDING COMPLETADO CON ÉXITO.");
}

if (require.main === module) {
  main().catch(err => {
    console.error("❌ Error crítico en trending_top10:", err);
    process.exit(1);
  });
}

module.exports = { fetchHuggingFaceTrending, fetchGitHubTrending, generateExecutiveSummary };
