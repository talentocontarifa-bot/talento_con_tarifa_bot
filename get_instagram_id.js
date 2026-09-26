/**
 * get_instagram_id.js
 * Consulta la API de Meta Graph para encontrar el ID de tu cuenta de Instagram Business o Creator.
 * 
 * Requisitos:
 *  - Tu cuenta de Instagram debe ser Profesional (Business o Creator).
 *  - Debe estar vinculada a una Página de Facebook.
 *  - Tener en tu .env: META_PAGE_ID y META_PAGE_ACCESS_TOKEN (o pasarlo por consola).
 */

const fs = require('fs');
const path = require('path');
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

const GRAPH_API_VERSION = 'v21.0';

async function main() {
  console.log('====================================================');
  console.log('📸 CONSULTOR DE INSTAGRAM_ACCOUNT_ID (META GRAPH)');
  console.log('====================================================\n');

  const pageId = process.env.META_PAGE_ID;
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_USER_ACCESS_TOKEN;

  if (!accessToken) {
    console.error('❌ Falta META_PAGE_ACCESS_TOKEN en tu archivo .env');
    process.exit(1);
  }

  // 1. Si tenemos META_PAGE_ID, consultar directo esa página
  if (pageId) {
    console.log(`🔍 Consultando Instagram vinculado a la página de Facebook ID: ${pageId}...`);
    try {
      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}?fields=name,instagram_business_account{id,username,name}&access_token=${accessToken}`;
      const res = await axios.get(url);
      
      const ig = res.data?.instagram_business_account;
      if (ig?.id) {
        console.log('\n🎉 ¡CUENTA DE INSTAGRAM ENCONTRADA!');
        console.log(`   Página de Facebook: ${res.data.name}`);
        console.log(`   Usuario Instagram:  @${ig.username || 'N/A'}`);
        console.log(`   Nombre:             ${ig.name || 'N/A'}`);
        console.log(`   INSTAGRAM_ACCOUNT_ID=${ig.id}`);
        saveToEnv('INSTAGRAM_ACCOUNT_ID', ig.id);
        return;
      } else {
        console.log('⚠️ La página existe pero no tiene una cuenta de Instagram Business/Creator vinculada.');
      }
    } catch (err) {
      console.warn('⚠️ Error al consultar la página específica:', err.response?.data?.error?.message || err.message);
    }
  }

  // 2. Intentar buscar en todas las cuentas/páginas del usuario
  console.log('\n🔍 Buscando en todas las páginas administradas por este Token...');
  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,instagram_business_account{id,username,name}&access_token=${accessToken}`;
    const res = await axios.get(url);
    const pages = res.data?.data || [];

    let found = false;
    for (const page of pages) {
      if (page.instagram_business_account) {
        const ig = page.instagram_business_account;
        console.log(`\n✅ Encontrada vinculación:`);
        console.log(`   Página: Facebook "${page.name}" (ID: ${page.id})`);
        console.log(`   Instagram: @${ig.username || 'N/A'} (ID: ${ig.id})`);
        console.log(`   👉 INSTAGRAM_ACCOUNT_ID=${ig.id}`);
        saveToEnv('INSTAGRAM_ACCOUNT_ID', ig.id);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log('\n❌ No se encontró ninguna cuenta de Instagram vinculada a tus páginas.');
      console.log('💡 Recuerda: En la configuración de tu página de Facebook, ve a "Cuentas vinculadas" -> "Instagram" y conecta tu cuenta.');
    }
  } catch (err) {
    console.error('❌ Error al consultar cuentas de Meta:', err.response?.data?.error?.message || err.message);
  }
}

function saveToEnv(key, val) {
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${val}`);
  } else {
    envContent += `\n${key}=${val}`;
  }
  fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
  console.log(`\n💾 Guardado ${key} en tu archivo .env local.`);
  console.log(`📌 Recuerda agregarlo a tus GitHub Secrets.`);
}

main();
