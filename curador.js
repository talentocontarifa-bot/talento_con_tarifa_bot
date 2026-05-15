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
    'https://www.entrepreneur.com/es/feed' // Emprendimiento y negocios
];

const QUEUE_FILE = path.join(__dirname, 'talento_queue.json');

async function extractLatestNews() {
    console.log("🕵️ Buscando noticias frescas...");
    
    // Leemos la cola actual para saber qué hemos publicado
    const queueData = fs.readFileSync(QUEUE_FILE, 'utf8');
    const queue = JSON.parse(queueData);
    const publishedLinks = queue.map(post => post.link);

    for (const feedUrl of FEEDS) {
        try {
            const feed = await parser.parseURL(feedUrl);
            console.log(`\n📚 Revisando: ${feed.title}`);

            // Buscamos la primera noticia que NO hayamos publicado
            for (const item of feed.items) {
                if (!publishedLinks.includes(item.link)) {
                    console.log(`✅ ¡Nueva noticia encontrada!: ${item.title}`);
                    return item; // Devolvemos la noticia cruda
                }
            }
        } catch (error) {
            console.error(`❌ Error leyendo el feed ${feedUrl}:`, error.message);
        }
    }
    
    console.log("🤷‍♂️ No hay noticias nuevas que no hayamos publicado ya.");
    return null;
}

async function generatePostWithAI(newsItem) {
    console.log("🧠 Despertando a Gemini AI...");
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
        const news = await extractLatestNews();
        if (!news) return;

        const aiPostText = await generatePostWithAI(news);
        console.log("\n✍️ POST GENERADO POR IA:\n");
        console.log(aiPostText);
        console.log("\n-----------------------------------\n");

        // Agregar a la cola
        const queueData = fs.readFileSync(QUEUE_FILE, 'utf8');
        const queue = JSON.parse(queueData);

        const newPost = {
            id: `ai_post_${Date.now()}`,
            message: aiPostText,
            link: news.link, // Guardamos el link original para que Meta publique la vista previa
            status: "pending"
        };

        queue.push(newPost);
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

        console.log("💾 ¡Nuevo post encolado y listo para ser despachado por el cronjob!");

    } catch (error) {
        console.error("💥 Error fatal en el curador:", error);
    }
}

// Ejecutar si se llama directamente
curadorMain();
