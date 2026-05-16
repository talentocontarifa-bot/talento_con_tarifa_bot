require('dotenv').config();
const { HfInference } = require('@huggingface/inference');
const fs = require('fs');

async function generarMemeSD() {
    const prompt = process.argv.slice(2).join(' ') || "Un perrito pug con lentes oscuros trabajando en una macbook en la playa, estilo realista";
    
    console.log(`\n🎨 Generando meme con STABLE DIFFUSION...`);
    console.log(`📝 Prompt: "${prompt}"`);
    console.log(`⏳ Por favor espera unos segundos...`);

    const hfToken = process.env.HF_API_KEY;
    if (!hfToken) {
        console.log("\n❌ ERROR: Falta tu Token de Hugging Face en el archivo .env\n");
        return;
    }

    // Inicializamos el cliente oficial de Hugging Face
    const hf = new HfInference(hfToken);

    try {
        // Pedimos la imagen al modelo de FLUX (El rey actual de los textos)
        const blob = await hf.textToImage({
            model: 'black-forest-labs/FLUX.1-schnell',
            inputs: prompt
        });

        // Convertimos el Blob (formato web) a un Buffer de Node.js para guardarlo
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const filename = `meme_flux_${Date.now()}.jpg`;
        fs.writeFileSync(filename, buffer);
        
        console.log(`\n✅ ¡Meme generado con éxito usando el modelo FLUX.1!`);
        console.log(`📁 Se guardó en tu carpeta como: ${filename}\n`);

    } catch (error) {
        console.error("\n❌ Error al generar:", error.message);
    }
}

generarMemeSD();
