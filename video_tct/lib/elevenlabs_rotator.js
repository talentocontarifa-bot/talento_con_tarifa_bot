'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_KEY_POOL = [
  'sk_23049c20908c037dcaacd577ec4524ad4ef9674756d8f67c',
  'sk_7a19a6c786e6ce5b518337ad562c31bb673e61403c048c3b',
  'sk_9518cdd9e61bdf93f3e9d2ad8f129c455c108cf487881505'
];

let cachedKeyStates = null;

function maskKey(key) {
  const s = String(key || '').trim();
  if (s.length <= 14) return '***';
  return `${s.slice(0, 8)}...${s.slice(-4)}`;
}

/**
 * Reúne todas las API keys configuradas en variables de entorno + el pool de respaldo de 3 cuentas,
 * eliminando duplicados y valores vacíos.
 */
function getConfiguredKeys(env = process.env) {
  const rawList = [
    ...(env.ELEVENLABS_API_KEYS ? String(env.ELEVENLABS_API_KEYS).split(/[,;\s]+/) : []),
    env.ELEVENLABS_API_KEY,
    env.ELEVENLABS_API_KEY_1,
    env.ELEVENLABS_API_KEY_2,
    env.ELEVENLABS_API_KEY_3,
    ...DEFAULT_KEY_POOL
  ];
  const seen = new Set();
  const keys = [];
  for (const k of rawList) {
    const clean = String(k || '').trim();
    if (!clean || clean.length < 20 || clean.includes('tu_clave') || clean.includes('pon_tu_api')) continue;
    if (!seen.has(clean)) {
      seen.add(clean);
      keys.push(clean);
    }
  }
  return keys;
}

/**
 * Consulta en paralelo el saldo real de caracteres de cada cuenta de ElevenLabs
 * y las ordena poniendo primero las que tienen saldo disponible.
 */
async function refreshKeyPoolStates({ force = false, fetchImpl = globalThis.fetch } = {}) {
  if (cachedKeyStates && !force) return cachedKeyStates;

  const keys = getConfiguredKeys();
  const states = await Promise.all(
    keys.map(async (key, idx) => {
      try {
        const res = await fetchImpl('https://api.elevenlabs.io/v1/user/subscription', {
          method: 'GET',
          headers: { 'xi-api-key': key, 'User-Agent': 'TalentoConTarifa-Bot/2.0' },
          signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) {
          return { key, index: idx + 1, remaining: 0, limit: 10000, exhausted: res.status === 401, status: `HTTP ${res.status}` };
        }
        const sub = await res.json();
        const used = Number(sub.character_count || 0);
        const limit = Number(sub.character_limit || 10000);
        const remaining = Math.max(0, limit - used);
        return {
          key,
          index: idx + 1,
          used,
          limit,
          remaining,
          resetUnix: sub.next_character_count_reset_unix || null,
          exhausted: remaining < 25,
          status: 'ok'
        };
      } catch (err) {
        // Si falla la consulta de suscripción por red, aún permitimos intentar TTS con la llave
        return { key, index: idx + 1, remaining: 500, limit: 10000, exhausted: false, status: `unverified (${err.message})` };
      }
    })
  );

  // Ordenar: primero las no agotadas con mayor saldo restante
  states.sort((a, b) => {
    if (a.exhausted !== b.exhausted) return a.exhausted ? 1 : -1;
    return b.remaining - a.remaining;
  });

  console.log(`🔑 [ElevenLabs Pool] Estado de las ${states.length} API keys configuradas:`);
  for (const st of states) {
    const icon = !st.exhausted && st.remaining >= 100 ? '✅' : '⚠️';
    console.log(`   ${icon} Key #${st.index} (${maskKey(st.key)}): ${st.remaining.toLocaleString()} / ${st.limit.toLocaleString()} chars libres [${st.status}]`);
  }

  cachedKeyStates = states;
  return cachedKeyStates;
}

/**
 * Sintetiza un fragmento de voz probando en rotación automática las 3 llaves de ElevenLabs.
 * Incluye caché automática para la firma final de marca (Escena 5) para ahorrar ~215 chars por video.
 */
async function synthesizeWithElevenLabsRotation(cleanText, targetPath, {
  voiceId = process.env.ELEVENLABS_VOICE_ID || 'TX3LPaxmHKxFdv7VOQHJ',
  modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_v4_turbo',
  stability = 0.58,
  similarityBoost = 0.85,
  style = 0.18,
  cacheDir = path.join(__dirname, '..', 'public', 'voice_cache'),
  fetchImpl = globalThis.fetch
} = {}) {
  const neededChars = cleanText.length;
  const isBrandCta = /creado y publicado de manera autom[áa]tica/i.test(cleanText);

  if (isBrandCta && cacheDir) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      const hash = crypto.createHash('sha256').update(`${voiceId}|${modelId}|${cleanText}`).digest('hex').slice(0, 16);
      const cachedCtaPath = path.join(cacheDir, `eleven_cta_${hash}.mp3`);
      if (fs.existsSync(cachedCtaPath) && fs.statSync(cachedCtaPath).size > 2000) {
        fs.copyFileSync(cachedCtaPath, targetPath);
        console.log(`  ⚡ [ElevenLabs Cache] Cierre de marca recuperado de caché (ahorro: ${neededChars} chars).`);
        return { ok: true, cached: true };
      }
    } catch (e) {
      // Continuar a síntesis en vivo si falla la lectura de caché
    }
  }

  const states = await refreshKeyPoolStates({ fetchImpl });

  for (const st of states) {
    if (st.exhausted || st.remaining < Math.min(neededChars, 25)) {
      continue;
    }

    try {
      const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        signal: AbortSignal.timeout(45000),
        headers: {
          'xi-api-key': st.key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: modelId,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: true
          }
        })
      });

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 1000) {
          fs.writeFileSync(targetPath, buffer);
          st.remaining = Math.max(0, st.remaining - neededChars);
          if (st.remaining < 25) st.exhausted = true;
          console.log(`  🎙️ [ElevenLabs Key #${st.index} ${maskKey(st.key)}] Sintetizado (${neededChars} chars usados, quedan ~${st.remaining.toLocaleString()}).`);

          if (isBrandCta && cacheDir) {
            try {
              const hash = crypto.createHash('sha256').update(`${voiceId}|${modelId}|${cleanText}`).digest('hex').slice(0, 16);
              fs.copyFileSync(targetPath, path.join(cacheDir, `eleven_cta_${hash}.mp3`));
            } catch (e) {}
          }
          return { ok: true, keyIndex: st.index };
        }
      } else {
        const errBody = await response.text().catch(() => '');
        console.warn(`  ⚠️ [ElevenLabs Key #${st.index} ${maskKey(st.key)}] HTTP ${response.status}: ${errBody.slice(0, 120)} -> rotando a siguiente key...`);
        if (response.status === 401 || response.status === 402 || response.status === 429 || /quota|limit|credit/i.test(errBody)) {
          st.exhausted = true;
          st.remaining = 0;
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ [ElevenLabs Key #${st.index} ${maskKey(st.key)}] Error de red (${err.message}) -> rotando a siguiente key...`);
    }
  }

  return { ok: false };
}

module.exports = {
  DEFAULT_KEY_POOL,
  getConfiguredKeys,
  refreshKeyPoolStates,
  synthesizeWithElevenLabsRotation
};
