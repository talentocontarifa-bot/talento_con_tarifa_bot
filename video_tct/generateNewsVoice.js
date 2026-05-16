const { exec } = require('child_process');
const path = require('path');

const voz = "es-MX-DaliaNeural"; 
const outputPath = path.join(__dirname, 'public', 'news_voice.mp3');

const texto = "¿Qué tal emprendedores? Hoy es 16 de mayo de 2026 y la noticia más relevante no es un nuevo modelo de lenguaje, sino cómo las empresas tradicionales están aplastando a su competencia usando Agentes Autónomos. Ya no se trata de chatear con una IA, se trata de delegar operaciones enteras. Desde servicio al cliente hasta gestión de inventario, los agentes están trabajando 24/7. En Talento con Tarifa, nuestra recomendación de hoy es: deja de usar la IA como un buscador caro y empieza a integrarla en los procesos aburridos de tu negocio. El que automatiza primero, gana el doble. ¿Qué proceso vas a delegar hoy?";

const comando = `edge-tts --voice ${voz} --rate=+0% --text "${texto}" --write-media "${outputPath}"`;

exec(comando, (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Error al generar la voz de Edge: ${error.message}`);
    return;
  }
  console.log(`✅ ¡Éxito! El audio se ha guardado en: public/news_voice.mp3`);
});
