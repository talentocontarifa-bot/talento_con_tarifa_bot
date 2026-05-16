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
  console.log("🤖 Consultando a Gemini para la estructura dinámica del video...");
  
  const prompt = `Actúa como un director de arte y curador de "Talento con Tarifa".
Diseña un video corto (30 seg) sobre una noticia reciente o tendencia agresiva de IA para emprendedores.

Tu trabajo es definir la ESTRUCTURA COMPLETA DEL VIDEO usando "escenas".
Tienes 4 tipos de escena disponibles:
- "title": Un título gigante para el inicio. Requiere 'text1' y 'text2' (máximo 12 letras cada uno).
- "image_text": Muestra una imagen generada con un texto corto. Requiere 'text' (Max 25 letras) y 'image_prompt' (Prompt super detallado en inglés para Stable Diffusion).
- "big_percentage": Muestra un número grande que crece. Requiere 'number' (1-99) y 'text' (Max 20 letras).
- "cta": El llamado a la acción final con el logo de Talento con Tarifa. Requiere 'text' (ej. "¿Estás listo?").

Reglas:
1. "theme_color" debe ser un color neón vibrante neo-brutalista (elige aleatoriamente: #CCFF00, #FF00FF, #00FFFF, #FF3300, #00FF66).
2. Tienes total libertad de mezclar las escenas. Ejemplo de flujo: title -> image_text -> big_percentage -> image_text -> cta. O diferente.
3. La suma de "durationInFrames" de todas las escenas debe ser exactamente 900 (30 segundos a 30fps).
4. El guion ("script") debe durar unos 25-30 segundos leído (aprox 75 palabras).

Ejemplo de JSON esperado:
{
  "theme_color": "#FF00FF",
  "script": "Emprendedor, despierta. El monopolio se acabó...",
  "scenes": [
    { "type": "title", "text1": "AGENTE", "text2": "SECRETO", "durationInFrames": 150 },
    { "type": "image_text", "text": "Datos seguros 24/7", "image_prompt": "Cyberpunk server room glowing neon green, ultra realistic 8k", "durationInFrames": 250 },
    { "type": "big_percentage", "number": 95, "text": "Precisión", "durationInFrames": 200 },
    { "type": "cta", "text": "¿Listo para el salto?", "durationInFrames": 300 }
  ]
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

    // 3. Generar Imágenes con Hugging Face (FLUX.1)
    const { HfInference } = require('@huggingface/inference');
    const hf = new HfInference(HF_API_KEY);

    async function generateImage(prompt, filename) {
        console.log(`🎨 Generando imagen para: ${filename} (Prompt: ${prompt})...`);
        try {
            const blob = await hf.textToImage({
                model: 'stabilityai/stable-diffusion-xl-base-1.0',
                inputs: prompt
            });
            const arrayBuffer = await blob.arrayBuffer();
            const imgPath = path.join(__dirname, 'public', filename);
            fs.writeFileSync(imgPath, Buffer.from(arrayBuffer));
            console.log(`✅ Imagen guardada en public/${filename}`);
        } catch(e) {
            console.error(`❌ Error al generar imagen ${filename}:`, e);
        }
    }

    for (let i = 0; i < newsData.scenes.length; i++) {
        const scene = newsData.scenes[i];
        if (scene.type === 'image_text' && scene.image_prompt) {
            await generateImage(scene.image_prompt, `scene_${i}.png`);
        }
    }

  } catch (error) {
    console.error("❌ Error en el proceso:", error);
  }
}

generateNews();
