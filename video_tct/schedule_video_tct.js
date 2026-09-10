require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { publishVideoToTikTok } = require('../tiktok_publisher');

const PAGE_ID = process.env.META_PAGE_ID;
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

async function scheduleVideo() {

    const videoPath = path.join(__dirname, 'public', 'video_final_tct.mp4');
    
    if (!fs.existsSync(videoPath)) {
        console.error("No se encuentra el video:", videoPath);
        process.exit(1);
    }

    // Mañana a las 8:00 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    const scheduledTimeUnix = Math.floor(tomorrow.getTime() / 1000);

    const message = "🚀 ¡La Inteligencia Artificial ya no es para jugar!\n\nConoce cómo los Agentes Autónomos están reduciendo hasta el 50% de los costos operativos en las startups latinas. No busques verte moderno, busca ser rentable.\n\n#InteligenciaArtificial #Startups #Negocios #TalentoConTarifa";

    console.log("📅 Programando video para:", tomorrow.toLocaleString());
    console.log("Subiendo el video... esto puede tardar unos minutos dependiendo de tu conexión.");

    if (ACCESS_TOKEN && PAGE_ID) {
        try {
            const form = new FormData();
            form.append('access_token', ACCESS_TOKEN);
            form.append('description', message);
            form.append('published', 'false');
            form.append('scheduled_publish_time', scheduledTimeUnix.toString());
            form.append('source', fs.createReadStream(videoPath));

            const response = await axios.post(`https://graph.facebook.com/v21.0/${PAGE_ID}/videos`, form, {
                headers: form.getHeaders(),
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            });

            console.log('✅ ¡Video programado con éxito en Facebook!');
            console.log('Video ID:', response.data.id);
        } catch (error) {
            console.error('❌ Error al programar el video en Facebook:');
            if (error.response) {
                console.error(error.response.data);
            } else {
                console.error(error.message);
            }
        }
    } else {
        console.log('ℹ️ Omitiendo Facebook: No se encontró META_PAGE_ACCESS_TOKEN o META_PAGE_ID');
    }

    // Publicar en TikTok
    try {
        console.log('\n🎵 Enviando video a TikTok...');
        const tiktokRes = await publishVideoToTikTok(videoPath, {
            title: message
        });
        console.log('✅ Video procesado en TikTok:', tiktokRes.status);
    } catch (e) {
        console.error('❌ Error al enviar a TikTok:', e.message);
    }
}

scheduleVideo();
