require('dotenv').config();
const { HfInference } = require('@huggingface/inference');
const fs = require('fs');
const axios = require('axios');

async function generarMemeSD() {
    const prompt = process.argv.slice(2).join(' ') || "Un perrito pug con lentes oscuros trabajando en una macbook en la playa, estilo realista";
    
    console.log(`\n🎨 Generando meme...`);
    console.log(`📝 Prompt: "${prompt}"`);
    console.log(`⏳ Por favor espera unos segundos...`);

    const nvapiKey = process.env.NVIDIA_API_KEY;
    const hfToken = process.env.HF_API_KEY;

    if (!nvapiKey && !hfToken) {
        console.log("\n❌ ERROR: Falta NVIDIA_API_KEY o HF_API_KEY en las variables de entorno.\n");
        return;
    }

    let buffer;
    let success = false;

    // 1. Intentar con Nvidia API
    if (nvapiKey) {
        try {
            console.log("🤖 Generando imagen con NVIDIA API (FLUX.1-schnell)...");
            const response = await axios.post(
                "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
                {
                    prompt: prompt,
                    height: 1024,
                    width: 1024,
                    steps: 4,
                    seed: 0
                },
                {
                    headers: {
                        "Authorization": `Bearer ${nvapiKey}`,
                        "accept": "application/json",
                        "Content-Type": "application/json"
                    },
                    timeout: 30000
                }
            );

            if (response.data && response.data.artifacts && response.data.artifacts[0]) {
                const base64Data = response.data.artifacts[0].base64;
                buffer = Buffer.from(base64Data, 'base64');
                success = true;
                console.log(`\n✅ ¡Meme generado con éxito usando NVIDIA API!`);
            } else {
                throw new Error("Formato de respuesta de Nvidia inesperado.");
            }
        } catch (error) {
            console.error("⚠️ Error con Nvidia API:", error.message);
            if (hfToken) {
                console.log("🔄 Intentando fallback con Hugging Face...");
            }
        }
    }

    // 2. Fallback a Hugging Face
    if (!success && hfToken) {
        try {
            console.log("🎨 Generando imagen con Hugging Face (FLUX.1-schnell)...");
            const hf = new HfInference(hfToken);
            const blob = await hf.textToImage({
                model: 'black-forest-labs/FLUX.1-schnell',
                inputs: prompt
            });

            const arrayBuffer = await blob.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            success = true;
            console.log(`\n✅ ¡Meme generado con éxito usando Hugging Face!`);
        } catch (error) {
            console.error("❌ Error con Hugging Face:", error.message);
        }
    }

    if (success && buffer) {
        const filename = `meme_flux_${Date.now()}.jpg`;
        fs.writeFileSync(filename, buffer);
        console.log(`📁 Se guardó en tu carpeta como: ${filename}\n`);
    } else {
        console.log("\n❌ ERROR: No se pudo generar la imagen con ningún servicio.\n");
    }
}

generarMemeSD();
