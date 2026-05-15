require('dotenv').config();

const PAGE_ID = process.env.META_PAGE_ID;
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

async function publishPost(message, link = null) {
  if (!PAGE_ID || !ACCESS_TOKEN) {
    console.error('Faltan credenciales META_PAGE_ID o META_PAGE_ACCESS_TOKEN en el archivo .env');
    return null;
  }

  const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/feed`;
  
  const params = new URLSearchParams({
    message: message,
    access_token: ACCESS_TOKEN
  });
  
  if (link) {
    params.append('link', link);
  }

  try {
    console.log(`Publicando post en la página de Talento con Tarifa...`);
    const response = await fetch(url, {
      method: 'POST',
      body: params
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Error al publicar:', data.error);
      return null;
    }
    
    console.log(`¡Post publicado con éxito! ID: ${data.id}`);
    return data;
  } catch (error) {
    console.error('Error de red o de ejecución al publicar:', error);
    return null;
  }
}

// Exportar para usar en el procesador de cola
module.exports = {
  publishPost
};
