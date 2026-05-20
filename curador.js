require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

// 1. Inicializar herramientas
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const parser = new Parser();

// 2. Fuentes de noticias (Podemos añadir o cambiar estas)
const FEEDS = [
    'https://www.entrepreneur.com/es/feed', // Emprendimiento y negocios
    'https://feeds.weblogssl.com/xataka2',  // Xataka (Tecnología general)
    'https://feeds.weblogssl.com/genbeta',  // Genbeta (Software e IA)
    'https://wwwhatsnew.com/feed/'          // WWWhat's new (Herramientas y tecnología)
];

const QUEUE_FILE = path.join(__dirname, 'talento_queue.json');

async function extractLatestNews(count = 3) {
    console.log(`🕵️ Buscando hasta ${count} noticias frescas...`);
    
    // Leemos la cola actual para saber qué hemos publicado
    const queueData = fs.readFileSync(QUEUE_FILE, 'utf8');
    const queue = JSON.parse(queueData);
    const publishedLinks = queue.map(post => post.link);
    let foundNews = [];

    for (const feedUrl of FEEDS) {
        if (foundNews.length >= count) break;
        try {
            const feed = await parser.parseURL(feedUrl);
            console.log(`\n📚 Revisando: ${feed.title}`);

            for (const item of feed.items) {
                if (!publishedLinks.includes(item.link)) {
                    console.log(`✅ ¡Nueva noticia encontrada!: ${item.title}`);
                    foundNews.push(item);
                    publishedLinks.push(item.link); // evitar duplicados en la misma corrida
                    if (foundNews.length >= count) break;
                }
            }
        } catch (error) {
            console.error(`❌ Error leyendo el feed ${feedUrl}:`, error.message);
        }
    }
    
    if (foundNews.length === 0) {
        console.log("🤷‍♂️ No hay noticias nuevas que no hayamos publicado ya.");
    }
    return foundNews;
}

async function generatePostWithAI(newsItem) {
    const prompt = `
    Actúa como el copywriter estrella de una agencia de marketing llamada "Talento con Tarifa". 
    Tu estilo es Neo-Brutalista: directo, al grano, sarcástico pero inteligente, y muy orientado a resultados. No usas lenguaje corporativo aburrido.
    
    Acabo de encontrar esta noticia:
    Título: "${newsItem.title}"
    Resumen/Fragmento: "${newsItem.contentSnippet}"
    
    Tu objetivo es redactar un post para Facebook (máximo 3 párrafos cortos) donde tomes esta noticia y le des un enfoque obligatorio sobre Inteligencia Artificial para emprendedores. 
    Incluso si la noticia no habla de IA directamente, encuéntrale el ángulo: ¿Cómo la IA cambiaría esto? ¿Cómo pueden los emprendedores usar la IA para sacar ventaja de esto?
    
    Usa emojis con estilo (⚡, 🧠, 🚀, 💀, etc.).
    Al final de tu texto, invita sutilmente a seguir a Talento con Tarifa, y luego incluye estrictamente la fuente original de esta manera:
    
    "🔗 Lee la nota completa aquí: ${newsItem.link}"
    
    Responde ÚNICAMENTE con el texto del post, sin explicaciones extras.
    `;

    // 1. Intentar con Groq si está disponible
    if (process.env.GROQ_API_KEY) {
        console.log("🧠 Despertando a Groq (Llama 3.3 70B)...");
        const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
        for (const model of models) {
            let attempts = 0;
            while (attempts < 3) {
                try {
                    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [
                                { role: "user", content: prompt }
                            ],
                            temperature: 0.7
                        })
                    });
                    const data = await response.json();
                    if (response.ok) {
                        console.log(`✅ Post generado exitosamente con Groq (${model})`);
                        return data.choices[0].message.content.trim();
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

    // 2. Respaldo a Gemini
    console.log("🧠 Despertando a Gemini AI...");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    let attempts = 0;
    while (true) {
        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (e) {
            attempts++;
            const err_msg = e.message || '';
            console.log(`⚠️ Intento Gemini fallido: ${err_msg}`);
            if (attempts >= 5) {
                throw e;
            }
            let waitTime = attempts * 5000 + 10000;
            if (err_msg.includes("429") || err_msg.toLowerCase().includes("quota")) {
                waitTime = 65000;
                console.log("Rate limit o Cuota detectada en Gemini. Esperando 65s...");
            } else {
                console.log(`Esperando ${waitTime / 1000}s antes de reintentar...`);
            }
            await new Promise(r => setTimeout(r, waitTime));
        }
    }
}

async function curadorMain() {
    try {
        const newsList = await extractLatestNews(3); // Buscar 3 noticias
        if (newsList.length === 0) return;

        const queueData = fs.readFileSync(QUEUE_FILE, 'utf8');
        const queue = JSON.parse(queueData);

        for (let i = 0; i < newsList.length; i++) {
            const news = newsList[i];
            const aiPostText = await generatePostWithAI(news);
            console.log(`\n✍️ POST ${i+1} GENERADO POR IA:\n`);
            console.log(aiPostText);
            console.log("\n-----------------------------------\n");

            const newPost = {
                id: `ai_post_${Date.now()}_${i}`,
                message: aiPostText,
                link: news.link, // Guardamos el link original para que Meta publique la vista previa
                status: "pending"
            };

            queue.push(newPost);
        }

        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
        console.log(`💾 ¡${newsList.length} nuevos posts encolados y listos para ser programados!`);

    } catch (error) {
        console.error("💥 Error fatal en el curador:", error);
    }
}

// Ejecutar si se llama directamente
curadorMain();
