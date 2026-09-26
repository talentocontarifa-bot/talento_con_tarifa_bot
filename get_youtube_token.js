/**
 * get_youtube_token.js
 * Script interactivo para autorizar tu canal de YouTube y obtener el YOUTUBE_REFRESH_TOKEN.
 * 
 * Uso:
 *  1. Crea un proyecto en Google Cloud Console (https://console.cloud.google.com).
 *  2. Habilita "YouTube Data API v3".
 *  3. En "Pantalla de consentimiento de OAuth", configúrala como Externa (o Interna) y agrega tu email como usuario de prueba.
 *  4. En "Credenciales", crea un ID de cliente OAuth 2.0 (Tipo: "Aplicación web" con URI de redirección http://localhost:3000/oauth2callback o "App de escritorio").
 *  5. Coloca tu YOUTUBE_CLIENT_ID y YOUTUBE_CLIENT_SECRET en el archivo .env o ingrésalos cuando el script te lo pida.
 *  6. Ejecuta: node get_youtube_token.js
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
let axios;
try {
  axios = require('axios');
} catch (e) {
  try {
    axios = require(path.join(__dirname, 'video_tct', 'node_modules', 'axios'));
  } catch (e2) {
    throw e;
  }
}
require('dotenv').config({ path: path.join(__dirname, '.env') });

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube'
].join(' ');

const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(question, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

async function main() {
  console.log('====================================================');
  console.log('🔑 GENERADOR DE YOUTUBE_REFRESH_TOKEN PARA BOT');
  console.log('====================================================\n');

  let clientId = process.env.YOUTUBE_CLIENT_ID;
  let clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId) {
    clientId = await ask('👉 Ingresa tu YOUTUBE_CLIENT_ID: ');
  }
  if (!clientSecret) {
    clientSecret = await ask('👉 Ingresa tu YOUTUBE_CLIENT_SECRET: ');
  }

  if (!clientId || !clientSecret) {
    console.error('❌ Es necesario contar con Client ID y Client Secret.');
    process.exit(1);
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(SCOPES)}&` +
    `access_type=offline&` +
    `prompt=consent`;

  console.log('\n1️⃣  Abre este enlace en tu navegador para autorizar al bot:');
  console.log('----------------------------------------------------');
  console.log(authUrl);
  console.log('----------------------------------------------------\n');
  console.log(`⏳ Esperando respuesta en ${REDIRECT_URI}...\n`);

  // Servidor temporal para capturar el código automáticamente
  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = url.parse(req.url, true);
      if (parsedUrl.pathname === '/oauth2callback') {
        const code = parsedUrl.query.code;
        const error = parsedUrl.query.error;

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>Error de autorización: ${error}</h1>`);
          console.error(`❌ Error recibido de Google: ${error}`);
          server.close();
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>✅ ¡Autorización exitosa!</h1><p>Puedes cerrar esta pestaña y volver a la terminal.</p>');
          server.close();

          console.log('📥 Código de autorización recibido. Intercambiando por Refresh Token...');
          await exchangeCodeForTokens(code, clientId, clientSecret);
        }
      }
    } catch (e) {
      console.error('Error en el servidor callback:', e);
    }
  });

  server.listen(REDIRECT_PORT);
}

async function exchangeCodeForTokens(code, clientId, clientSecret) {
  try {
    const params = new URLSearchParams({
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const res = await axios.post('https://oauth2.googleapis.com/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const tokenData = res.data;
    const refreshToken = tokenData.refresh_token;

    if (!refreshToken) {
      console.warn('⚠️ Google no devolvió un refresh_token nuevo. Si ya habías autorizado la app antes, Google solo devuelve refresh_token en la primera autorización o con prompt=consent.');
    }

    console.log('\n🎉 ¡CREDENCIALES OBTENIDAS CON ÉXITO!\n');
    console.log(`YOUTUBE_CLIENT_ID=${clientId}`);
    console.log(`YOUTUBE_CLIENT_SECRET=${clientSecret}`);
    console.log(`YOUTUBE_REFRESH_TOKEN=${refreshToken || 'Ya existente'}`);

    // Guardar en .env
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

    const updates = {
      YOUTUBE_CLIENT_ID: clientId,
      YOUTUBE_CLIENT_SECRET: clientSecret,
      YOUTUBE_REFRESH_TOKEN: refreshToken,
      YOUTUBE_PRIVACY_STATUS: 'public'
    };

    for (const [key, val] of Object.entries(updates)) {
      if (!val) continue;
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
    console.log('\n💾 Valores guardados en tu archivo local .env.');
    console.log('📌 Recuerda agregarlos también a GitHub Secrets de tu repositorio.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error intercambiando código por tokens:', err.response?.data || err.message);
    process.exit(1);
  }
}

main();
