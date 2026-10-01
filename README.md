# Talento con Tarifa · Motores de video

Esta actualización integra los cambios remotos hasta `ea9ce2d` de `main`, incluidos Instagram, YouTube, TikTok y el motor editorial. El sitio de `docs/` conserva su versión original.

## Dos motores

- **Noticias (`video_tct/`)**: cinco escenas, fuente RSS o cola reciente, guion validado, locución por escena y diseño tecnológico cinematográfico. El gancho, el contexto, la idea central, la aplicación y el cierre se generan a partir de la fuente. Ya no se obliga al modelo a inventar un porcentaje.
- **Editorial (`video_editorial/`)**: admite cualquier tema. Conserva el guion íntegro, reparte capítulos y produce locución. Las frases mostradas son resúmenes por capítulo, no transcripción con sincronización palabra por palabra.

TCT usa **imágenes y motion graphics cyberpunk**: lima, fucsia y naranja, Inter de peso 900, CCTV con REC y contador de tiempo, scanlines, grano y gráficos desgastados. Conserva la cortinilla de contacto **TALENTOCONTARIFA.LAT** y la firma hablada original; se aplican después de generar el guion para que el modelo no las sustituya por otro CTA. El editorial conserva su diseño cinematográfico anterior, oscuro y cian, con tipografía limpia y movimiento pausado. Sus estilos y animación están separados de TCT.

`VIDEO_VISUAL_MODE=hybrid` es el valor predeterminado en ambos Actions. TCT recupera las imágenes del artículo y las combina con escenas gráficas; editorial conserva su preparación de ilustraciones. Si no se obtiene una imagen válida, la escena sigue con gráficos. `graphics` permite desactivar las descargas. No utiliza WebGL, partículas, videos de fondo ni fuentes remotas. El guion y la voz siguen utilizando sus proveedores configurados.

La selección visual usa reglas locales en `video_shared/motion.js`: el tipo de escena, sus puntos clave y palabras del titular/resumen eligen entre lista, pasos, contraste, foco, afirmación o cierre. No se solicita otra respuesta de IA. Son reglas de presentación, no comprensión semántica completa; los titulares largos usan una tipografía menor.

Los efectos incidentales de TCT se sintetizan con `video_shared/synthesize_sfx.py`, usando solo la biblioteca estándar de Python. Produce tres WAV cortos y deterministas: golpe, barrido y toque. Se colocan en los cambios de escena y las entradas de listas, con volumen reducido respecto de la narración. No requieren claves ni descargas. `PYTHON_PATH` permite indicar el ejecutable local; los Actions ya configuran Python. Se conserva la exportación de TikTok con solo voz.

## Vista previa local

Requisitos: Node.js 22+, Python 3.11+, FFmpeg y FFprobe. La demo visual no necesita claves.

```sh
npm ci
npm ci --prefix video_tct
npm run video:preview
```

Las muestras están marcadas `preview_only`; el publicador las rechaza. Se incluyen sus voces de ejemplo para que una copia nueva pueda abrir la vista previa sin llamadas externas. `npm run video:demo` vuelve a crear una muestra visual sin locución y sobrescribe los datos generados del motor corto. Usa una copia o guarda el guion antes si ya generaste contenido real. Los videos de producción vuelven a generar sus voces y tiempos a partir del guion.

Para el editorial:

```sh
npm ci --prefix video_editorial
cd video_editorial
npx hyperframes preview
```

## Generación y publicación

Copia `.env.example` a `.env`. Conservamos el nombre remoto **`INSTAGRAM_ACCOUNT_ID`** y las llamadas existentes de Instagram con formulario y subida binaria. Si falta el ID, se intenta descubrir la cuenta vinculada a `META_PAGE_ID`.

```sh
npm run generate --prefix video_tct
npm run check --prefix video_tct
```

Después de revisar la composición, renderiza desde `video_tct/`:

```sh
npx hyperframes render -o out/render.mp4
ffmpeg -y -i out/render.mp4 -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -ar 48000 -movflags +faststart out/video_final_tct.mp4
node scripts/seal-render.js
node publish_video.js --dry-run
```

`node publish_video.js` sí publica. El manifiesto comprueba que el MP4 y el JSON corresponden al conjunto sellado después del render. El modo `--dry-run` no carga videos ni modifica el registro; puede consultar el ID de Instagram si no está configurado.

En Actions:

- `Crear y publicar Reel TCT` (`crear_video_tct.yml`): conserva íntegramente sus 3 ejecuciones diarias automáticas para noticias de la cola/RSS.
- `Crear Video Editorial` (`crear_video_editorial.yml`): conserva el procesamiento de ensayos y documentales a partir de issues o manual.
- `Top 10 Trending IA Semanal` (`trending_semanal.yml`): conserva el reporte de texto a Telegram y Facebook de los viernes.
- `Análisis Semanal de Redes` (`analisis_semanal.yml`): conserva el reporte analítico de desempeño de los lunes.
- `Crear Video Reel Top 10 Trending` (`crear_video_trending.yml`): **nueva función complementaria** que se ejecuta los **lunes y viernes** a las 09:00 AM CDMX (`0 15 * * 1,5`) para generar y publicar el video Reel de los 5 modelos de Hugging Face y 5 repositorios de GitHub.
- Los workflows validan la composición antes del render, normalizan el MP4 y guardan resultados como artefactos incluso si falla una red.

Comandos para Top 10 Trending:
```sh
# Consultar datos y publicar resumen en texto a Telegram / Facebook:
node trending_top10.js

# Generar composición de video Reel del Top 10:
npm run video:trending
# O proceso completo (datos + video):
npm run trending:all
```

`PUBLISH_PLATFORMS` permite elegir una lista separada por comas. Si está vacía, se solicitan Facebook e Instagram; se añaden TikTok y YouTube cuando sus credenciales están presentes. Las integraciones existentes de TikTok y YouTube se conservan. TikTok recibe una versión con la pista de voz reconstruida con los mismos tiempos del video, sin música de fondo.

## Estado y recuperación

Cada motor guarda `publication-state.json` por fuente y cuenta. Una red ya confirmada se omite al repetir el mismo contenido. TikTok en bandeja de entrada se registra como `submitted`, no como publicación pública.

Si una operación falla después de iniciarse, queda en `requires_review`; el proceso no vuelve a enviar a ciegas. El informe conserva identificadores de video o contenedor cuando estuvieron disponibles. Revisa en la plataforma si la publicación existe. Si está confirmada, actualiza su entrada a `published` con su ID; si has comprobado que no existe, elimina únicamente esa entrada antes de reintentar. Conserva siempre las entradas confirmadas de las otras redes.

El historial de noticias se escribe después de completar las entregas solicitadas. Los issues editoriales solo se cierran cuando todas las redes seleccionadas han confirmado publicación; una entrega a la bandeja de TikTok mantiene el issue abierto.

Los workflows intentan guardar estos registros mediante un commit. Si la protección de rama o un cambio concurrente impide ese push, recupera primero el registro del artefacto; no repitas la publicación sin recuperarlo. Para reintentar exactamente un video usa el MP4, el manifiesto y el JSON del artefacto, no regeneres otro guion por accidente.

## Pruebas y límites

```sh
npm test
python -m unittest discover -s video_editorial/tests -v
```

Las pruebas cubren tiempos y pausas, conservación del guion, escape de texto, configuración, modo de prueba, fallos parciales, duplicados, estados de procesamiento y las llamadas reales del adaptador de Instagram con respuestas simuladas. La comprobación visual se realiza con HyperFrames y capturas de las escenas.

No se han ejecutado publicaciones reales ni llamadas de generación con las claves del propietario. El funcionamiento de permisos, cuotas y credenciales debe comprobarse en una ejecución autorizada del entorno real. Esta revisión no cambia los publicadores de texto ni elimina los proyectos Remotion anteriores.

## Referencias

- [Ejemplo oficial de publicación de Reels de Meta](https://github.com/fbsamples/reels_publishing_apis/tree/main/insta_reels_publishing_api_sample).
- [Colección oficial de Facebook Reels](https://github.com/fbsamples/Facebook-Reels-Publishing-API-Postman-Collection).
- `GUIA_CONFIGURACION_REDES.md` conserva la guía añadida en la actualización remota.
