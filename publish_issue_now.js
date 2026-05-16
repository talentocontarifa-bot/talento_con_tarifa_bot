const { execSync } = require('child_process');
const axios = require('axios');
require('dotenv').config({ path: './.env' }); // estamos en talento_bot

const PAGE_ID = process.env.META_PAGE_ID;
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

async function run() {
    console.log("🤖 Conectando con GitHub...");
    const output = execSync('gh issue list --state open --json number,title,body', { encoding: 'utf-8' });
    const issues = JSON.parse(output);

    if (issues.length === 0) {
        return console.log('📭 No hay issues pendientes.');
    }

    const issue = issues[0];
    const urlMatch = issue.body.match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : null;

    if (!url) {
        return console.log('❌ No se encontró URL.');
    }

    const message = `🤖 [PRUEBA DE AUTOMATIZACIÓN]\n\nEsta publicación fue generada de forma 100% autónoma leyendo directamente un Issue de GitHub enviado desde un celular.\n\nAquí está el recurso compartido:\n${url}\n\n#TalentoConTarifa #InteligenciaArtificial #Startups`;

    console.log("🌐 Publicando Inmediatamente en la página de Talento con Tarifa...");

    try {
        const response = await axios.post(`https://graph.facebook.com/v21.0/${PAGE_ID}/feed`, {
            message: message,
            link: url, // Adjuntamos el link para que Facebook genere la vista previa
            access_token: ACCESS_TOKEN
        });

        console.log('✅ ¡Publicado en Facebook con éxito!');
        console.log('Post ID:', response.data.id);

        console.log('🔒 Cerrando el Issue en GitHub...');
        execSync(`gh issue close ${issue.number} -m "🤖 Procesado y publicado automáticamente en Meta. Post ID: ${response.data.id}"`);
        console.log('✅ Issue cerrado y archivado.');

    } catch (error) {
        console.error('❌ Error publicando en Meta:');
        if (error.response) {
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

run();
