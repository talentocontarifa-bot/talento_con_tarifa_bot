require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { HfInference } = require('@huggingface/inference');

// Inicializar clientes
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const hf = new HfInference(process.env.HF_API_KEY);

const QUEUE_FILE = './talento_queue.json';

async function generarMemeContextual() {
    console.log("🤖 1. Analizando los temas del día en el queue...");
    
    // 1. Leer el queue y buscar posts recientes/programados
    let queue = [];
    if (fs.existsSync(QUEUE_FILE)) {
        queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
    }
    
    // Tomamos los últimos 3 posts para dar contexto
    const recientes = queue.slice(-3).map(p => p.message || p.title).join('\n- ');
    
    if (!recientes) {
        console.log("❌ No hay posts en el queue para sacar contexto.");
        return;
    }

    console.log("🧠 2. Pasando contexto a Gemini para idear el meme...");
    const promptGemini = `
    Eres el community manager de una agencia de marketing disruptiva llamada "Talento con Tarifa".
    Hoy hemos publicado o programado estas noticias/temas:
    ${recientes}

    Inventa la idea visual para un meme irónico, gracioso o de humor negro emprendedor/tech que tenga relación con alguno de estos temas.
    
    REGLA DE ORO PARA LA IMAGEN: 
    - Debe ser UN SOLO PANEL (una sola escena, nada de cómics).
    - Si incluyes texto en la imagen (letrero, cartel, etc.), debe ser EXTREMADAMENTE CORTO (Máximo 3 o 4 palabras). Si le pones más, la IA fallará al dibujarlo.
    - El prompt debe estar en INGLES.
    - Estilo visual: Neo-Brutalist, high contrast, flat colors, thick black borders, 90s web punk.

    Devuelve ÚNICAMENTE un JSON válido con esta estructura:
    {
      "flux_prompt": "El prompt en INGLES para generar la imagen (siguiendo la regla de oro).",
      "facebook_copy": "El copy largo y sarcástico en ESPAÑOL para publicar el meme en Facebook, con emojis y hashtags."
    }
    `;

    try {
        const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
        const response = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: promptGemini }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        
        const text = response.response.text();
        const data = JSON.parse(text);
        console.log(`\n💡 Idea de Gemini:\nPrompt FLUX: ${data.flux_prompt}\nCopy FB: ${data.facebook_copy}\n`);

        console.log("🎨 3. Generando la imagen con FLUX.1...");
        const blob = await hf.textToImage({
            model: 'black-forest-labs/FLUX.1-schnell',
            inputs: data.flux_prompt
        });

        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const filename = `meme_del_dia_${Date.now()}.jpg`;
        fs.writeFileSync(filename, buffer);
        console.log(`✅ Imagen guardada como: ${filename}`);

        // Opcional: El paso 4 sería subirlo a Facebook Graph API usando META_PAGE_ACCESS_TOKEN
        console.log("\n🚀 ¡Meme listo para publicarse contextualmente!");

    } catch (error) {
        console.error("❌ Error en el proceso:", error.message);
    }
}

generarMemeContextual();
