const fs = require('fs');
const path = require('path');
const { publishPost } = require('./meta_publisher');

const QUEUE_FILE = path.join(__dirname, 'talento_queue.json');

async function main() {
  console.log('Iniciando campaña automatizada de Talento con Tarifa...');

  if (!fs.existsSync(QUEUE_FILE)) {
    console.error('El archivo de cola talento_queue.json no existe.');
    process.exit(1);
  }

  const queueData = fs.readFileSync(QUEUE_FILE, 'utf-8');
  let queue = [];
  try {
    queue = JSON.parse(queueData);
  } catch (error) {
    console.error('Error al leer el archivo JSON:', error);
    process.exit(1);
  }

  // Buscar el primer post que esté pendiente
  const postIndex = queue.findIndex(p => p.status === 'pending');

  if (postIndex === -1) {
    console.log('No hay posts pendientes para publicar.');
    return;
  }

  const postToPublish = queue[postIndex];
  console.log(`Intentando publicar post [${postToPublish.id}]...`);

  // Llamar al publicador
  const result = await publishPost(postToPublish.message, postToPublish.link);

  if (result && result.id) {
    // Si la publicación fue exitosa, actualizamos el estado
    queue[postIndex].status = 'published';
    queue[postIndex].publishedAt = new Date().toISOString();
    queue[postIndex].metaId = result.id; // Guardamos el ID de Facebook

    // Guardar los cambios en el JSON
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
    console.log('✅ Archivo de cola actualizado exitosamente.');
  } else {
    console.error('❌ La publicación falló. El estado se mantiene como "pending".');
    process.exit(1); // Importante salir con error para que GitHub Actions marque el pipeline en rojo
  }
}

main();
