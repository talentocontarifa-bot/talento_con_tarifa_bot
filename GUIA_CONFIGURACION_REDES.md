# 🤖 Guía de Configuración: Publicador Multi-Plataforma
### Instagram Reels + TikTok + YouTube Shorts + Facebook

Este sistema permite que tus **GitHub Actions** (o tu máquina local) publiquen automáticamente el video vertical generado en **Instagram Reels**, **TikTok** y **YouTube Shorts** mediante las APIs oficiales, de forma desatendida y sin riesgo de baneo.

---

## 📋 Arquitectura de Publicación

| Red Social | Módulo / Archivo | Método Oficial | Credenciales Necesarias |
| :--- | :--- | :--- | :--- |
| **Instagram Reels** | [`instagram_publisher.js`](./instagram_publisher.js) | Meta Graph API (Resumable Upload) | `META_PAGE_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID` |
| **TikTok** | [`tiktok_publisher.js`](./tiktok_publisher.js) | TikTok API v2 (Direct / Inbox) | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN` |
| **YouTube Shorts** | [`youtube_publisher.js`](./youtube_publisher.js) | YouTube Data API v3 (Resumable) | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` |
| **Facebook** | [`video_tct/publish_video.js`](./video_tct/publish_video.js) | Meta Graph API Videos | `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN` |

---

## 1. 📸 Configuración de Instagram Reels

Meta exige que la cuenta de Instagram sea **Profesional (Creador o Empresa)** y esté vinculada a una Página de Facebook.

### Pasos:
1. En la app de Instagram, ve a **Configuración** > **Tipo de cuenta y herramientas** > **Cambiar a cuenta profesional**.
2. En tu Página de Facebook (o Meta Business Suite), ve a **Configuración** > **Cuentas vinculadas** > **Instagram** y conecta tu cuenta.
3. Asegúrate de tener en tu `.env` (o en consola) tu `META_PAGE_ACCESS_TOKEN`.
4. Ejecuta el script asistente para obtener tu ID de Instagram:
   ```bash
   npm run get:instagram-id
   ```
5. El script detectará automáticamente tu cuenta y guardará `INSTAGRAM_ACCOUNT_ID` en tu `.env`.

---

## 2. ▶️ Configuración de YouTube Shorts

YouTube permite subidas desatendidas ilimitadas usando un **OAuth2 Refresh Token** (que nunca expira mientras la app esté activa).

### Pasos:
1. Ve a [Google Cloud Console](https://console.cloud.google.com).
2. Crea un proyecto (o usa uno existente) y habilita la **YouTube Data API v3**.
3. En **Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Externo**.
   - Completa el nombre y agrega tu correo de Gmail en **Usuarios de prueba** (Test users).
4. En **Credenciales**:
   - Haz clic en **Crear credenciales** > **ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - En **URI de redireccionamiento autorizados**, añade:
     `http://localhost:3000/oauth2callback`
   - Guarda y copia tu **Client ID** y **Client Secret**.
5. Ejecuta en tu terminal el asistente automático:
   ```bash
   npm run auth:youtube
   ```
6. El script abrirá el navegador para que autorices a tu canal y capturará automáticamente el `YOUTUBE_REFRESH_TOKEN`, guardándolo en tu `.env`.

---

## 3. 🎵 Configuración de TikTok

El bot ya cuenta con `tiktok_publisher.js` implementado para la API oficial v2:
- Utiliza `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` y `TIKTOK_REFRESH_TOKEN`.
- Auto-renueva el access token en cada ejecución de GitHub Actions.
- Si la aplicación de TikTok está en modo Sandbox o cuenta pública, realiza un fallback automático enviando el video a tu bandeja de entrada de TikTok (`SEND_TO_USER_INBOX`) listo para publicar con 1 clic desde el móvil.

---

## 4. 🔐 Secretos en GitHub Actions

Para que el workflow [`.github/workflows/crear_video_tct.yml`](./.github/workflows/crear_video_tct.yml) publique automáticamente todos los días:

1. Ve a tu repositorio en GitHub: `Settings` > `Secrets and variables` > `Actions`.
2. Añade los siguientes **Repository Secrets**:

```env
# Meta / Instagram / Facebook
META_PAGE_ID=...
META_PAGE_ACCESS_TOKEN=...
INSTAGRAM_ACCOUNT_ID=...

# TikTok
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=...
TIKTOK_ACCESS_TOKEN=...
TIKTOK_REFRESH_TOKEN=...
TIKTOK_OPEN_ID=...

# YouTube
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
YOUTUBE_PRIVACY_STATUS=public   # (o 'unlisted' para pruebas)
```

---

## 5. 🚀 Cómo Probar Localmente

Puedes probar cada red de forma individual o todas juntas:

```bash
# Probar solo TikTok con el último video generado
npm run publish:tiktok

# Probar solo Instagram Reels
npm run publish:instagram

# Probar solo YouTube Shorts
npm run publish:youtube

# Probar la orquestación completa (todas las plataformas a la vez)
npm run publish:all
```
