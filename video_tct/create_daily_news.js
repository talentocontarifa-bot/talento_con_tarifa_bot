const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { HfInference } = require('@huggingface/inference');
const { getAudioDurationInSeconds } = require('get-audio-duration');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = '9F4C8ztpNUmXkdDDbz3J';
const FPS = 30;

if (!GEMINI_API_KEY || !HF_API_KEY || !ELEVENLABS_API_KEY) {
  console.error("❌ Faltan variables de entorno: GEMINI_API_KEY, HF_API_KEY, ELEVENLABS_API_KEY");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const hf = new HfInference(HF_API_KEY);

// ─────────────────────────────────────────
// 1. GEMINI — Genera guion + estructura de escenas
// ─────────────────────────────────────────
async function generateScriptAndScenes() {
  console.log("🤖 [1/4] Consultando a Gemini para guion y estructura de escenas...");

  const prompt = `Actúa como un director de arte y curador de contenido de "Talento con Tarifa".
Tu misión: diseñar un video de noticias de IA para emprendedores latinoamericanos.

Tienes 4 tipos de escena:
- "title": Inicio impactante. Requiere 'text1' y 'text2' (máximo 10 letras cada uno, solo mayúsculas).
- "image_text": Imagen de IA + subtítulo. Requiere 'text' (max 25 letras) y 'image_prompt' en inglés (detallado, neo-brutalist, 8k).
- "big_percentage": Estadística en pantalla gigante. Requiere 'number' (1-99) y 'text' (max 20 letras). Usa un número REAL y RELEVANTE.
- "cta": Cierre con logo y llamada a la acción. Requiere 'text' (frase corta de impacto).

Reglas estrictas:
1. "theme_color": elige UNO aleatoriamente entre: #CCFF00, #FF00FF, #00FFFF, #FF3300, #00FF66
2. Mezcla las escenas creativamente — el orden puede variar cada vez.
3. NO definas 'durationInFrames' — el sistema lo calculará automáticamente desde el audio.
4. "script": El guion de voz en español. Exactamente 60-70 palabras, ritmo dinámico, NO menciones el color ni el diseño.
5. Los porcentajes y datos deben ser reales y verificables de tendencias actuales de IA.

Responde ÚNICAMENTE con JSON válido:
{
  "theme_color": "#CCFF00",
  "script": "Guion de 60-70 palabras aquí...",
  "scenes": [
    { "type": "title", "text1": "AGENTES", "text2": "IA HOY", "image_prompt": null },
    { "type": "image_text", "text": "Automatiza tu empresa", "image_prompt": "Futuristic cyberpunk entrepreneur..." },
    { "type": "big_percentage", "number": 73, "text": "Más productivo" },
    { "type": "cta", "text": "¿Ya lo usas?" }
  ]
}`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  const result = await model.generateContent(prompt);
  const data = JSON.parse(result.response.text());
  console.log(`✅ Guion: "${data.script.substring(0, 80)}..."`);
  console.log(`✅ Color del día: ${data.theme_color} | Escenas: ${data.scenes.length}`);
  return data;
}

// ─────────────────────────────────────────
// 2. ELEVENLABS — Genera el audio de alta calidad
// ─────────────────────────────────────────
async function generateVoice(script) {
  console.log(`\n🎙️ [2/4] Generando voz con ElevenLabs (voz: ${ELEVENLABS_VOICE_ID})...`);

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.82,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error: ${response.status} — ${err}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const audioPath = path.join(__dirname, 'public', 'news_voice.mp3');
  fs.writeFileSync(audioPath, Buffer.from(audioBuffer));

  // Medir duración REAL del MP3 generado
  const durationSeconds = await getAudioDurationInSeconds(audioPath);
  const totalFrames = Math.ceil(durationSeconds * FPS) + 30; // +30 frames (1 seg) de cola al final

  console.log(`✅ Audio ElevenLabs guardado. Duración: ${durationSeconds.toFixed(2)}s → ${totalFrames} frames`);
  return { audioPath, durationSeconds, totalFrames };
}

// ─────────────────────────────────────────
// 3. Distribuir frames entre escenas según peso relativo
// ─────────────────────────────────────────
function distributeFrames(scenes, totalFrames) {
  // Pesos base por tipo de escena
  const weights = { title: 1, image_text: 2, big_percentage: 1.5, cta: 1.5 };
  const totalWeight = scenes.reduce((acc, s) => acc + (weights[s.type] || 1), 0);

  let framesLeft = totalFrames;
  const distributed = scenes.map((scene, i) => {
    const isLast = i === scenes.length - 1;
    const frames = isLast
      ? framesLeft
      : Math.round((weights[scene.type] || 1) / totalWeight * totalFrames);
    framesLeft -= frames;
    return { ...scene, durationInFrames: Math.max(frames, 60) }; // mínimo 60 frames = 2 seg
  });

  console.log(`✅ Frames distribuidos:`, distributed.map(s => `${s.type}:${s.durationInFrames}`).join(' | '));
  return distributed;
}

// ─────────────────────────────────────────
// 4. HUGGING FACE — Genera imágenes para escenas image_text
// ─────────────────────────────────────────
async function generateImages(scenes) {
  console.log(`\n🎨 [3/4] Generando imágenes con Stable Diffusion XL...`);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (scene.type !== 'image_text' || !scene.image_prompt) continue;

    const filename = `scene_${i}.png`;
    console.log(`  → Imagen ${filename}: "${scene.image_prompt.substring(0, 60)}..."`);

    try {
      const blob = await hf.textToImage({
        model: 'stabilityai/stable-diffusion-xl-base-1.0',
        inputs: scene.image_prompt + ', neo-brutalist, high contrast, dramatic lighting, 9:16 vertical',
        parameters: { width: 768, height: 1344 } // vertical nativo para Reels
      });
      const arrayBuffer = await blob.arrayBuffer();
      fs.writeFileSync(path.join(__dirname, 'public', filename), Buffer.from(arrayBuffer));
      console.log(`  ✅ ${filename} guardado.`);
    } catch (e) {
      console.error(`  ❌ Error generando ${filename}:`, e.message);
    }
  }
}

// ─────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────
async function main() {
  try {
    // PASO 1: Gemini genera el contenido
    const data = await generateScriptAndScenes();

    // PASO 2: ElevenLabs genera la voz y medimos duración real
    const { totalFrames } = await generateVoice(data.script);

    // PASO 3: Distribuir frames reales entre las escenas
    const scenesWithFrames = distributeFrames(data.scenes, totalFrames);

    // PASO 4: Guardar el JSON final (con frames reales) para Remotion
    const newsData = {
      theme_color: data.theme_color,
      script: data.script,
      scenes: scenesWithFrames,
    };
    const jsonPath = path.join(__dirname, 'src', 'news_data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(newsData, null, 2));
    console.log(`\n✅ [4/4] news_data.json actualizado (${totalFrames} frames totales)`);

    // PASO 5: Generar imágenes
    await generateImages(scenesWithFrames);

    console.log('\n🚀 Todo listo. Remotion puede renderizar ahora.');
  } catch (error) {
    console.error("❌ Error crítico:", error);
    process.exit(1);
  }
}

main();
