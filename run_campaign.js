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

  // Buscar todos los posts pendientes
  const pendingPosts = queue.filter(p => p.status === 'pending');

  if (pendingPosts.length === 0) {
    console.log('No hay posts pendientes para publicar.');
    return;
  }

  let errorCount = 0;
  let successCount = 0;

  for (let i = 0; i < pendingPosts.length; i++) {
    const postToPublish = pendingPosts[i];
    console.log(`\nIntentando despachar post [${postToPublish.id}]...`);

    // El primer post (i=0) se publica inmediatamente.
    // Los siguientes se programan añadiendo 4 horas por cada post (i=1 -> +4h, i=2 -> +8h)
    let scheduledTime = null;
    if (i > 0) {
      const hoursToAdd = i * 4;
      // Meta requiere Unix Timestamp en segundos
      scheduledTime = Math.floor(Date.now() / 1000) + (hoursToAdd * 3600);
      console.log(`Programando para dentro de ${hoursToAdd} horas...`);
    }

    // Llamar al publicador
    const result = await publishPost(postToPublish.message, postToPublish.link, scheduledTime);

    if (result && result.id) {
      // Actualizamos el estado en la cola original
      const originalIndex = queue.findIndex(p => p.id === postToPublish.id);
      queue[originalIndex].status = scheduledTime ? 'scheduled' : 'published';
      queue[originalIndex].publishedAt = new Date().toISOString();
      queue[originalIndex].metaId = result.id; // Guardamos el ID de Facebook
      
      successCount++;
    } else {
      console.error(`❌ El despacho falló para el post ${postToPublish.id}.`);
      errorCount++;
    }
  }

  // Guardar los cambios en el JSON
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
  console.log(`\n✅ Resumen de ejecución: ${successCount} despachados, ${errorCount} errores.`);
  
  if (errorCount > 0) {
    process.exit(1); // Importante salir con error para que GitHub Actions marque el pipeline en rojo
  }
}

main();
