require('dotenv').config({ path: './.env' });
const { execSync } = require('child_process');
const path = require('path');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const news = require('./news_sources');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const PAGE_ID = process.env.META_PAGE_ID?.trim();
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN?.trim();
// DRY_RUN=1: selecciona y extrae la noticia, imprime el resultado y se detiene ANTES del LLM y de Facebook
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase());
const HISTORY_CHANNEL = 'fb_article';

const FEEDS = [
    'https://www.xataka.com/tag/inteligencia-artificial/rss2.xml', // la URL /categoria/.../rss redirige a HTML
    'https://feeds.weblogssl.com/genbeta',
    'https://feeds.weblogssl.com/xataka2',
    'https://www.entrepreneur.com/es/feed'
];

/**
 * 1. OBTENER FUENTE DE CONTENIDO (Prioridad: Issues > RSS)
 */
function getIssueSource() {
    try {
        const output = execSync('gh issue list --state open --limit 30 --json number,title,body,labels', { encoding: 'utf-8', timeout: 30000 });
        const issues = JSON.parse(output);
        // Solo issues que parecen solicitudes de contenido (ver README: label "publicar"/"articulo"/"noticia" o título [POST])
        const issue = issues.find(news.isContentRequestIssue);
        if (issue) {
            const url = news.extractFirstUrl(issue.body) || news.extractFirstUrl(issue.title);
            console.log(`✅ [MODO HUMANO] Issue #${issue.number} detectado. Prioridad Alta activada.`);
            return {
                type: 'issue',
                url,
                title: issue.title,
                instruction: news.issueInstruction(issue.title), // El título del issue funciona como comando maestro
                issueNumber: issue.number
            };
        }
        if (issues.length > 0) console.log(`ℹ️ ${issues.length} issue(s) abiertos, pero ninguno es una solicitud de artículo.`);
    } catch (e) {
        console.log("⚠️ No hay issues pendientes o no hay acceso a GitHub CLI.");
    }
    return null;
}

async function getContentSource() {
    console.log("🔍 1. Buscando fuente de contenido...");

    // Prioridad Alta: Revisar Issues Abiertos
    const issueSource = getIssueSource();
    if (issueSource) {
        const extracted = await extractText(issueSource.url);
        if (extracted) return { ...issueSource, ...extracted };
        console.log(`⚠️ No se pudo leer la URL del Issue #${issueSource.issueNumber}. Continuando con RSS.`);
    }

    // Piloto Automático: Lector RSS (en paralelo, filtrado por IA + frescura + historial compartido)
    console.log("🤖 [MODO PILOTO AUTOMÁTICO] Leyendo feeds de RSS...");
    const { items } = await news.fetchFeeds(FEEDS);
    const history = news.loadHistory();
    const { candidates, stats } = news.rankCandidates(items, { history, allowNonAi: true, log: console.log });
    console.log(`📊 Items: ${stats.total} | duplicados: ${stats.duplicates} | viejos: ${stats.stale} | ya publicados: ${stats.inHistory} | poco relevantes IA: ${stats.lowScore} | candidatos: ${candidates.length}`);

    const picked = await news.pickArticle(candidates, { fallback: extractWithScrapling });
    if (!picked) {
        throw new Error("No se pudo obtener ninguna noticia fresca, nueva y legible de los feeds RSS.");
    }
    console.log(`📰 Noticia seleccionada: "${picked.item.title}" (método: ${picked.method})`);

    return {
        type: 'rss',
        url: picked.item.link,
        title: picked.item.title,
        text: picked.text,
        method: picked.method,
        instruction: 'Ninguna', // Estilo base por defecto
        issueNumber: null
    };
}

/**
 * 2. SCRAPER (Transforma URLs en texto legible para la IA usando Jina Reader)
 */
async function resolveUrl(url) {
    try {
        const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) });
        return response.url;
    } catch (e) {
        return url;
    }
}

function extractWithScrapling(url) {
    try {
        console.log(`   [Scrapling] Ejecutando extracción local (modo ligero HTTP) para: ${url}`);
        const escapedUrl = url.replace(/"/g, '\\"');
        const helperPath = path.join(__dirname, 'scrapling_helper.py');
        const output = execSync(`python "${helperPath}" --url "${escapedUrl}" --timeout 20`, { encoding: 'utf-8', timeout: 60000 });
        const parsed = JSON.parse(output);
        if (parsed.success && parsed.text && parsed.text.length > 50) {
            return parsed.text;
        } else {
            console.warn(`   [Scrapling] Texto insuficiente o error: ${parsed.error || 'Texto muy corto'}`);
            return null;
        }
    } catch (e) {
        console.error(`   [Scrapling] Error en ejecución: ${e.message}`);
        return null;
    }
}

/** Extrae texto de una URL suelta (modo Issue): Jina endurecido -> URL resuelta -> Scrapling. */
async function extractText(url) {
    console.log(`📄 2. Extrayendo texto limpio de: ${url}`);
    let result = await news.extractArticleContent({ link: url }, { useRss: false, fallback: null });
    let finalUrl = url;
    if (!result) {
        const resolvedUrl = await resolveUrl(url);
        if (resolvedUrl !== url) {
            console.log(`   URL redireccionada: ${resolvedUrl}`);
            finalUrl = resolvedUrl;
            result = await news.extractArticleContent({ link: resolvedUrl }, { useRss: false, fallback: null });
        }
    }
    if (!result) {
        // Fallback absoluto: Scrapling (modo ligero, sin navegadores)
        const scraplingText = extractWithScrapling(finalUrl);
        const reason = scraplingText ? news.detectGarbage(scraplingText) : 'sin texto';
        if (!reason) result = { text: scraplingText, method: 'scrapling' };
        else console.log(`   [Scrapling] Descartado: ${reason}`);
    }
    if (!result) {
        console.log("⚠️ Jina Reader y Scrapling fallaron (anti-bot, página de error o link inválido).");
        return null;
    }
    console.log(`✅ Texto extraído (método: ${result.method}).`);
    return { text: result.text, method: result.method };
}

async function callGeminiWithRetry(model, content, maxRetries = 3) {
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            return await model.generateContent(content);
        } catch (error) {
            attempts++;
            console.warn(`⚠️ Intento ${attempts} fallido al llamar a Gemini: ${error.message}`);
            if (attempts >= maxRetries) {
                throw error;
            }
            let waitTime = Math.min(Math.pow(2, attempts) * 1000 + 5000, 30000);
            if (error.message.includes("429") || error.message.toLowerCase().includes("quota exceeded")) {
                waitTime = 30000; // Máximo 30s si es cuota (antes 65s)
                console.log(`Rate limit detectado. Esperando 30s para enfriar la API...`);
            } else {
                console.log(`Espera de ${waitTime/1000}s antes del próximo intento...`);
            }
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}
/**
 * 3. CEREBRO (Generación de Copy con Groq + Fallback a Gemini)
 */
async function generateAIContent(markdown, customInstruction) {
    let systemPrompt = `Eres el Director Creativo de "Talento con Tarifa", una agencia de automatización de marketing y automatización con agentes autónomos para empresas.
Vas a recibir el texto de una página web o noticia sobre IA o Negocios.
Tu objetivo es redactar un post para Facebook (máximo 2 párrafos).
TONO BASE: Irreverente, al grano, Neo-Brutalista. Enfócate en cómo esto reduce costos o impacta a las startups latinas. Usa un par de emojis agresivos (🚀, 🔥, 💀, 💰). NO uses hashtags aquí.

💥 ATENCIÓN - INSTRUCCIÓN SUPERIOR DEL JEFE 💥
Si la instrucción a continuación NO dice "Ninguna", debes OBEDECERLA por encima del estilo base y adoptarla como tu línea editorial para este post.
INSTRUCCIÓN DEL JEFE: "${customInstruction}"`;

    const userPrompt = `CONTENIDO DE LA WEB:\n${markdown}`;

    // 1. Intentar con Groq si está disponible
    if (process.env.GROQ_API_KEY) {
        console.log("🧠 3. Procesando con Groq (Llama 3.3 70B)...");
        const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
        for (const model of models) {
            let attempts = 0;
            while (attempts < 3) {
                try {
                    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                        method: "POST",
                        signal: AbortSignal.timeout(60000),
                        headers: {
                            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: userPrompt }
                            ],
                            temperature: 0.7
                        })
                    });
                    const data = await response.json();
                    if (response.ok) {
                        console.log(`✅ Copy generado exitosamente con Groq (${model})`);
                        return data.choices[0].message.content;
                    } else {
                        throw new Error(data.error?.message || "Error de Groq");
                    }
                } catch (e) {
                    attempts++;
                    console.log(`⚠️ Intento ${attempts} con Groq (${model}) fallido: ${e.message}`);
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }
        console.log("❌ Todos los intentos con Groq fallaron. Pasando a Gemini como respaldo...");
    }

    console.log("🧠 3. Procesando con Gemini... Aplicando tono Neo-Brutalista.");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const result = await callGeminiWithRetry(model, [
        { text: systemPrompt },
        { text: userPrompt }
    ]);
    return result.response.text();
}

/**
 * 4. PUBLICADOR (Sube el resultado a Facebook)
 */
async function publishToMeta(message, url) {
    console.log("🌐 4. Publicando en Facebook...");
    // La URL va solo en `link` (genera la vista previa); no se repite en el texto del mensaje
    const response = await axios.post(`https://graph.facebook.com/v21.0/${PAGE_ID}/feed`, {
        message: `${message}\n\n#TalentoConTarifa #Automatizacion #IA #Startups`,
        link: url,
        access_token: ACCESS_TOKEN
    }, { timeout: 30000 });
    return response.data.id;
}

/**
 * FLUJO PRINCIPAL
 */
async function run() {
    try {
        console.log("=========================================");
        console.log(`🚀 INICIANDO MASTER PIPELINE T.C.T 🚀${DRY_RUN ? ' (DRY_RUN)' : ''}`);
        console.log("=========================================\n");

        // 1. Decidir origen y 2. extraer información (RSS completo / Jina / Scrapling)
        const source = await getContentSource();
        // Cortamos a 10,000 caracteres para no saturar tokens
        const shortText = source.text.substring(0, 10000); 

        if (DRY_RUN) {
            console.log("\n🧪 DRY_RUN: deteniendo antes del LLM y de Facebook.");
            console.log(`   Tipo: ${source.type}${source.issueNumber ? ` (#${source.issueNumber})` : ''}`);
            console.log(`   Título: ${source.title}`);
            console.log(`   URL: ${source.url}`);
            console.log(`   Método de extracción: ${source.method}`);
            console.log(`   Instrucción: ${source.instruction}`);
            console.log(`   Texto (${shortText.length} caracteres), primeros 500:\n-----------------\n${shortText.substring(0, 500)}\n-----------------`);
            return;
        }
        
        // 3. Crear el post con Gemini
        const aiPost = await generateAIContent(shortText, source.instruction);
        console.log("\n📝 POST FINAL GENERADO:\n-----------------\n", aiPost, "\n-----------------\n");
        
        // 4. Publicar
        const postId = await publishToMeta(aiPost, source.url);
        console.log(`✅ ¡Post publicado exitosamente en Talento con Tarifa! ID: ${postId}`);

        // Historial compartido con el video diario (evita repetir la noticia en reruns)
        try {
            news.recordPublished({ url: source.url, title: source.title, channel: HISTORY_CHANNEL });
            console.log(`💾 Noticia guardada en historial compartido (${path.basename(news.HISTORY_PATH)}).`);
        } catch (histErr) {
            console.warn(`⚠️ No se pudo guardar el historial compartido: ${histErr.message}`);
        }
        
        // 5. Limpieza (Manejo de estado)
        if (source.type === 'issue') {
            console.log(`\n🔒 Cerrando el Issue #${source.issueNumber} para evitar reciclaje...`);
            execSync(`gh issue close ${source.issueNumber} -c "✅ Post generado por IA y publicado. Post ID: ${postId}"`, { timeout: 30000 });
        } else {
            console.log(`\n✅ Flujo RSS terminado.`);
        }
        
    } catch (e) {
        console.error("\n❌ Error Crítico en el Pipeline:");
        if (e.response && e.response.data) {
            console.error("Detalles del Error (API):", JSON.stringify(e.response.data, null, 2));
        } else {
            console.error(e.stack || e);
        }
        process.exit(1); // Forzar fallo en GitHub Actions
    }
}

run();
