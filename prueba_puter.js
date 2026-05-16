const { init, getAuthToken } = require("@heyputer/puter.js/src/init.cjs");
const fs = require('fs');

async function probarPuter() {
    console.log("⏳ Iniciando sesión en Puter...");
    console.log("👉 Si se abre tu navegador, por favor dale permisos (es gratis).");
    
    try {
        // Esto abrirá el navegador del usuario para autenticarse si no tiene token
        const authToken = await getAuthToken();
        const puter = init(authToken);

        const prompt = "A neo-brutalist dog wearing sunglasses, 4k resolution";
        console.log(`🎨 Generando imagen: "${prompt}"...`);

        // Generar la imagen usando Puter (teóricamente usa Dall-e o Flux gratis)
        const imageResponse = await puter.ai.txt2img(prompt);
        
        // Puter devuelve un objeto imagen o blob, dependiendo de la SDK
        // Para simplificar, guardamos si es base64 o URL
        console.log("✅ Imagen generada, respuesta:", typeof imageResponse);
        
        // El resultado a veces es un blob u objeto HTMLImageElement, en Node suele ser una URL o Buffer
        // Lo imprimimos para que el usuario pueda verlo
        console.log("Resultado de Puter:", imageResponse);

    } catch (error) {
        console.error("❌ Error con Puter:", error);
    }
}

probarPuter();
