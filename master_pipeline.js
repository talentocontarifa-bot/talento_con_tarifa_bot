require('dotenv').config({ path: './.env' });
const { execSync } = require('child_process');
const axios = require('axios');
const Parser = require('rss-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const parser = new Parser();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const PAGE_ID = process.env.META_PAGE_ID;
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

/**
 * 1. OBTENER FUENTE DE CONTENIDO (Prioridad: Issues > RSS)
 */
async function getContentSource() {
    console.log("🔍 1. Buscando fuente de contenido...");
    
    // Prioridad Alta: Revisar Issues Abiertos
    try {
        const output = execSync('gh issue list --state open --json number,title,body', { encoding: 'utf-8' });
        const issues = JSON.parse(output);
        
        if (issues.length > 0) {
            const issue = issues[0];
            const urlMatch = issue.body.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                console.log(`✅ [MODO HUMANO] Issue #${issue.number} detectado. Prioridad Alta activada.`);
                return {
                    type: 'issue',
                    url: urlMatch[0],
                    instruction: issue.title, // El título del issue funciona como comando maestro
                    issueNumber: issue.number
                };
            }
        }
    } catch (e) {
        console.log("⚠️ No hay issues pendientes o no hay acceso a GitHub CLI.");
    }

    // Piloto Automático: Lector RSS
    console.log("🤖 [MODO PILOTO AUTOMÁTICO] Leyendo feeds de RSS...");
    const feed = await parser.parseURL('https://www.xataka.com/inteligencia-artificial/feed');
    const latestItem = feed.items[0];
    console.log(`📰 Noticia seleccionada: ${latestItem.title}`);
    
    return {
        type: 'rss',
        url: latestItem.link,
        instruction: 'Ninguna', // Estilo base por defecto
        issueNumber: null
    };
}

/**
 * 2. SCRAPER (Transforma URLs en texto legible para la IA usando Jina Reader)
 */
async function extractText(url) {
    console.log(`📄 2. Extrayendo texto limpio de: ${url}`);
    try {
        const response = await axios.get(`https://r.jina.ai/${url}`);
        return response.data;
    } catch (e) {
        throw new Error("El anti-bot de la página bloqueó la lectura, o el link es inválido.");
    }
}

async function callGeminiWithRetry(model, content, maxRetries = 5) {
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
            let waitTime = Math.pow(2, attempts) * 1000;
            if (error.message.includes("429") || error.message.toLowerCase().includes("quota exceeded")) {
                waitTime = 40000; // Espera 40 segundos si es cuota/rate limit
                console.log(`Rate limit (429) detectado. Esperando 40s para limpiar la cuota...`);
            } else {
                console.log(`Espera de ${waitTime/1000}s antes del próximo intento...`);
            }
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

/**
 * 3. CEREBRO (Generación de Copy con Gemini + Instrucciones)
 */
async function generateAIContent(markdown, customInstruction) {
    console.log("🧠 3. Procesando con Gemini... Aplicando tono Neo-Brutalista.");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    let systemPrompt = `Eres el Director Creativo de "Talento con Tarifa", una agencia de automatización de marketing y automatización con agentes autónomos para empresas.
Vas a recibir el texto de una página web o noticia sobre IA o Negocios.
Tu objetivo es redactar un post para Facebook (máximo 2 párrafos).
TONO BASE: Irreverente, al grano, Neo-Brutalista. Enfócate en cómo esto reduce costos o impacta a las startups latinas. Usa un par de emojis agresivos (🚀, 🔥, 💀, 💰). NO uses hashtags aquí.

💥 ATENCIÓN - INSTRUCCIÓN SUPERIOR DEL JEFE 💥
Si la instrucción a continuación NO dice "Ninguna", debes OBEDECERLA por encima del estilo base y adoptarla como tu línea editorial para este post.
INSTRUCCIÓN DEL JEFE: "${customInstruction}"`;

    const result = await callGeminiWithRetry(model, [
        { text: systemPrompt },
        { text: `CONTENIDO DE LA WEB:\n${markdown}` }
    ]);
    return result.response.text();
}

/**
 * 4. PUBLICADOR (Sube el resultado a Facebook)
 */
async function publishToMeta(message, url) {
    console.log("🌐 4. Publicando en Facebook...");
    const response = await axios.post(`https://graph.facebook.com/v21.0/${PAGE_ID}/feed`, {
        message: `${message}\n\nFuente completa: ${url}\n\n#TalentoConTarifa #Automatizacion #IA #Startups`,
        link: url,
        access_token: ACCESS_TOKEN
    });
    return response.data.id;
}

/**
 * FLUJO PRINCIPAL
 */
async function run() {
    try {
        console.log("=========================================");
        console.log("🚀 INICIANDO MASTER PIPELINE T.C.T 🚀");
        console.log("=========================================\n");

        // 1. Decidir origen
        const source = await getContentSource();
        
        // 2. Extraer información (cortamos a 10,000 caracteres para no saturar tokens)
        const rawText = await extractText(source.url);
        const shortText = rawText.substring(0, 10000); 
        
        // 3. Crear el post con Gemini
        const aiPost = await generateAIContent(shortText, source.instruction);
        console.log("\n📝 POST FINAL GENERADO:\n-----------------\n", aiPost, "\n-----------------\n");
        
        // 4. Publicar
        const postId = await publishToMeta(aiPost, source.url);
        console.log(`✅ ¡Post publicado exitosamente en Talento con Tarifa! ID: ${postId}`);
        
        // 5. Limpieza (Manejo de estado)
        if (source.type === 'issue') {
            console.log(`\n🔒 Cerrando el Issue #${source.issueNumber} para evitar reciclaje...`);
            execSync(`gh issue close ${source.issueNumber} -m "✅ Post generado por Gemini y publicado. Post ID: ${postId}"`);
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
