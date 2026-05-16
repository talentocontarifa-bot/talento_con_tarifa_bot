const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const path = require('path');

const inputPath = path.join(__dirname, 'public', 'news_voice.mp3');
const outputPath = path.join(__dirname, 'public', 'news_voice_trimmed.mp3');

console.log('✂️ Cortando silencios con FFmpeg...');

// silenceremove:
// stop_periods=-1 (remueve silencios a lo largo de todo el archivo, no solo al inicio/fin)
// stop_duration=0.1 (cualquier silencio mayor a 0.1 segundos)
// stop_threshold=-35dB (se considera silencio si el volumen es menor a -35dB)
const cmd = `"${ffmpeg}" -y -i "${inputPath}" -af "silenceremove=stop_periods=-1:stop_duration=0.15:stop_threshold=-35dB" "${outputPath}"`;

try {
  execSync(cmd);
  console.log('✅ ¡Silencios eliminados! Archivo guardado como news_voice_trimmed.mp3');
} catch (e) {
  console.error('❌ Error al cortar el audio:', e.message);
}
