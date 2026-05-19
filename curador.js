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
    console.log("🧠 Despertando a Gemini AI...");
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return text.trim();
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
