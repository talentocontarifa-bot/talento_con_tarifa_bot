const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;

if (!GEMINI_API_KEY || !HF_API_KEY) {
  console.error("❌ Faltó GEMINI_API_KEY o HF_API_KEY en las variables de entorno.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function generateNews() {
  console.log("🤖 Consultando a Gemini para las noticias del día...");
  
  const prompt = `Actúa como un experto en negocios e Inteligencia Artificial en Latinoamérica. Eres el curador de contenido de "Talento con Tarifa".
Genera una noticia corta, impactante y agresiva (estilo neo-brutalista, directa al grano) sobre una tendencia real o noticia reciente de IA que impacte a las empresas (por ejemplo: la caída de costos de IA, modelos open source superando a los privados, robots humanoides, o agentes autónomos).
  
Reglas:
1. El guion de audio (script) debe durar unos 25-30 segundos leído (aprox 70-80 palabras). Debe empezar enganchando al emprendedor.
2. Genera los textos cortos para la pantalla del video que tengan concordancia con la noticia.
3. El formato de salida DEBE SER ÚNICAMENTE JSON válido, sin bloques de código markdown, con la siguiente estructura:

{
  "script": "Texto completo para ser leído por el sintetizador de voz...",
  "image_prompt_1": "Prompt en inglés para Stable Diffusion detallando la primera escena de la noticia (ej: A humanoid robot working in a factory, cyberpunk style, high contrast, green and black)",
  "image_prompt_2": "Prompt en inglés para Stable Diffusion para la segunda escena (ej: Data servers glowing in neon green, high tech abstract, ultra realistic)",
  "title_line1": "PALABRA 1 (Max 10 letras)",
  "title_line2": "PALABRA 2 (Max 12 letras)",
  "bullet_points": "Punto clave corto (Max 25 letras)",
  "percentage": 90,
  "percentage_sub": "Explicación corta del %",
  "data_text": "Dato clave corto",
  "data_sub": "Subtítulo del dato",
  "cta_text": "¿Pregunta final corta?"
}`;

  try {
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });
    
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const newsData = JSON.parse(responseText);

    console.log("✅ Guion generado:", newsData.script);

    // 1. Guardar el JSON para React/Remotion
    const jsonPath = path.join(__dirname, 'src', 'news_data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(newsData, null, 2));
    console.log("✅ Archivo src/news_data.json actualizado.");

    // 2. Generar el Audio con Edge TTS
    const voz = "es-MX-DaliaNeural"; 
    const outputPath = path.join(__dirname, 'public', 'news_voice.mp3');
    const comando = `edge-tts --voice ${voz} --rate=+0% --text "${newsData.script.replace(/"/g, '\\"')}" --write-media "${outputPath}"`;

    console.log("🎤 Generando audio con Edge TTS...");
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error al generar la voz: ${error.message}`);
        return;
      }
      console.log(`✅ ¡Éxito! Audio guardado en public/news_voice.mp3`);
    });

    // 3. Generar Imágenes con Hugging Face (Stable Diffusion)
    async function generateImage(prompt, filename) {
        console.log(`🎨 Generando imagen para: ${filename}...`);
        try {
            const hfResponse = await fetch(
                "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
                {
                    headers: { 
                        "Authorization": `Bearer ${HF_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    method: "POST",
                    body: JSON.stringify({ inputs: prompt }),
                }
            );
            
            if(!hfResponse.ok) throw new Error(`HF API error: ${hfResponse.statusText}`);
            
            const buffer = await hfResponse.arrayBuffer();
            const imgPath = path.join(__dirname, 'public', filename);
            fs.writeFileSync(imgPath, Buffer.from(buffer));
            console.log(`✅ Imagen guardada en public/${filename}`);
        } catch(e) {
            console.error(`❌ Error al generar imagen ${filename}:`, e);
        }
    }

    await generateImage(newsData.image_prompt_1, 'agent_robot.png');
    await generateImage(newsData.image_prompt_2, 'data_structure.png');

  } catch (error) {
    console.error("❌ Error en el proceso:", error);
  }
}

generateNews();
