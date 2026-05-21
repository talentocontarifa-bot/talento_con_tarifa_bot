const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { HfInference } = require('@huggingface/inference');
const { getAudioDurationInSeconds } = require('get-audio-duration');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ELEVENLABS_VOICE_ID = '4XUsiqPDK4UACIM2BILe';
const FPS = 30;

if ((!GEMINI_API_KEY && !GROQ_API_KEY) || !HF_API_KEY || !ELEVENLABS_API_KEY) {
  console.error("❌ Faltan variables de entorno: (GEMINI_API_KEY o GROQ_API_KEY), HF_API_KEY, ELEVENLABS_API_KEY");
  process.exit(1);
}

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const hf = new HfInference(HF_API_KEY);

// ─────────────────────────────────────────
// 0. QUEUE — Lee el contexto del post programado del día
// ─────────────────────────────────────────
function getTodaysContext() {
  const queuePath = path.join(__dirname, '..', 'talento_queue.json');
  if (!fs.existsSync(queuePath)) {
    console.log('⚠️  No se encontró talento_queue.json — Gemini generará contenido sin contexto.');
    return null;
  }

  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
  const items = Array.isArray(queue) ? queue : (queue.value || []);

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Filtrar posts de las últimas 24 horas (ya sean publicados o programados para hoy)
  const recentPosts = items.filter(p => {
    if (!p.publishedAt) return false;
    const pDate = new Date(p.publishedAt);
    return pDate >= oneDayAgo;
  });

  if (recentPosts.length === 0) {
    console.log('⚠️ No hay posts recientes (últimas 24h) en el queue — Gemini usará tendencias actuales.');
    return null;
  }

  // Tomar el más relevante (el último del array para agarrar el más reciente)
  const chosen = recentPosts[recentPosts.length - 1];
  const contextText = (chosen.message || '').substring(0, 600); // máx 600 chars
  console.log(`📋 Contexto reciente encontrado (ID: ${chosen.id}): "${contextText.substring(0, 100)}..."`);
  return { message: contextText, link: chosen.link || '' };
}

// ─────────────────────────────────────────
// 1. GEMINI — Genera guion + estructura de escenas
// ─────────────────────────────────────────
async function generateScriptAndScenes() {
  console.log("🤖 [1/4] Consultando a Gemini para guion y estructura de escenas...");

  const queueContext = getTodaysContext();
  const contextSection = queueContext
    ? `\nCONTEXTO DEL DÍA (úsalo como base del video — adapta el tono y la idea central):
"""
${queueContext.message}
"""
Fuente: ${queueContext.link}
`
    : `\nCONTEXTO DEL DÍA: No hay posts programados. Usa una tendencia real y verificable de IA 2025 para emprendedores latinoamericanos.\n`;

  const prompt = `Actúa como director de arte y curador de "Talento con Tarifa".
Tu misión: convertir el contexto del día en un video narrativo de impacto para emprendedores latinoamericanos.
${contextSection}
Tienes 4 tipos de escena:
- "title": Inicio impactante. Requiere 'text1' y 'text2' (máximo 10 letras cada uno, solo mayúsculas).
- "image_text": Imagen de IA con IDEAS CLAVE superpuestas. Requiere:
    'text': título de la escena (max 20 letras)
    'image_prompt': prompt detallado en inglés para SDXL (neo-brutalist, 8k, vertical)
    'key_points': array de EXACTAMENTE 3 frases cortas e impactantes en español (max 6 palabras cada una).
      DEBEN ser datos concretos del tema del día, no frases genéricas.
- "big_percentage": Estadística gigante. Requiere 'number' (1-99 REAL del tema) y 'text' (max 20 letras).
- "cta": Cierre. Solo requiere 'text' (frase de 3-5 palabras).

Reglas de Storytelling Obligatorias:
1. Las escenas DEBEN seguir un hilo lógico (Gancho -> Problema/Dato -> Solución/IA -> Cierre). NO las mezcles al azar.
2. "script": guion hablado en español, 55-65 palabras. Debe ser contundente, contando una historia o revelando una verdad basada en el contexto. Las visuales deben coincidir con la narrativa del guion.
3. Los datos (porcentajes, key_points) deben estar directamente conectados al mensaje principal.
4. "theme_color": elige aleatoriamente entre: #CCFF00, #FF00FF, #00FFFF, #FF3300, #00FF66
5. NO definas 'durationInFrames'.

Responde ÚNICAMENTE con JSON válido:
{
  "theme_color": "#FF3300",
  "script": "El guion coherente de 55-65 palabras con un mensaje fuerte...",
  "scenes": [
    { "type": "title", "text1": "EL FIN", "text2": "DEL SEO" },
    { "type": "big_percentage", "number": 80, "text": "Caída de tráfico" },
    {
      "type": "image_text",
      "text": "LA SOLUCIÓN",
      "image_prompt": "Neon brutalist robot working fast in a cyberpunk office...",
      "key_points": ["IA Generativa domina", "Agentes autónomos", "Eficiencia total"]
    },
    { "type": "cta", "text": "Adáptate hoy" }
  ]
}`;

  // 1. Intentar con Groq si está disponible
  if (process.env.GROQ_API_KEY) {
      console.log("🧠 Intentando generar guion con Groq (Llama 3.3 70B)...");
      const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
      for (const modelName of models) {
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
                          model: modelName,
                          response_format: { type: "json_object" },
                          messages: [
                              { role: "user", content: prompt }
                          ],
                          temperature: 0.7
                      })
                  });
                  const data = await response.json();
                  if (response.ok) {
                      const parsed = JSON.parse(data.choices[0].message.content.trim());
                      console.log(`✅ Guion generado exitosamente con Groq (${modelName})`);
                      console.log(`✅ Guion: "${parsed.script.substring(0, 80)}..."`);
                      console.log(`✅ Color del día: ${parsed.theme_color} | Escenas: ${parsed.scenes.length}`);
                      return parsed;
                  } else {
                      throw new Error(data.error?.message || "Error de Groq");
                  }
              } catch (e) {
                  attempts++;
                  console.log(`⚠️ Intento ${attempts} con Groq (${modelName}) fallido: ${e.message}`);
                  await new Promise(r => setTimeout(r, 2000));
              }
          }
      }
      console.log("❌ Todos los intentos con Groq fallaron. Pasando a Gemini como respaldo...");
  }

  // 2. Respaldo a Gemini
  if (!genAI) {
      throw new Error("No hay API Key de Groq ni de Gemini disponible.");
  }
  console.log("🧠 Usando Gemini para generar guion...");
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
// Firma de audio fija que se añade al final de CADA video
const AI_SIGNATURE_AUDIO =
  'Este video fue creado y publicado de manera completamente automática por inteligencia artificial. ' +
  'Imagina el impacto que este superpoder podría tener en tu negocio. ' +
  'Conéctate con nosotros en Talento con Tarifa punto lat.';

async function generateVoice(script) {
  // El audio completo = guion de Gemini + firma de IA siempre fija
  const fullScript = script.trim() + ' ... ' + AI_SIGNATURE_AUDIO;
  console.log(`\n🎙️ [2/4] Generando voz con ElevenLabs (voz: ${ELEVENLABS_VOICE_ID})...`);
  console.log(`   Script completo (${fullScript.split(' ').length} palabras)`);


  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: fullScript,
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
