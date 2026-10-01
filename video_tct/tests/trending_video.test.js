'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateScript } = require('../lib/content');
const { restoreContactEnding } = require('../lib/ending');
const {
  buildFallbackTrendingScenes,
  sanitizeSceneLengths,
  generateTrendingScript
} = require('../create_trending_video');

const sampleTrendingData = {
  date: '2026-09-26T00:00:00.000Z',
  summary: 'Los modelos ligeros de visión y los frameworks de agentes autónomos dominan las tendencias de código abierto esta semana.',
  huggingface: [
    { name: 'convaiinnovations/laya', type: 'text-classification', likes: 3128, downloads: 12000, url: 'https://huggingface.co/convaiinnovations/laya' },
    { name: 'Qwen/Qwen-Image-2.1', type: 'text-to-image', likes: 2040, downloads: 28407, url: 'https://huggingface.co/Qwen/Qwen-Image-2.1' },
    { name: 'prism-ml/Ternary-Bonsai-2-27B-gguf', type: 'text-generation', likes: 1957, downloads: 2815979, url: 'https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf' }
  ],
  github: [
    { name: 'holaboss-ai/holaOS', description: 'Open-source agentic workspace enterprises can make their own.', stars: 11370, forks: 725, url: 'https://github.com/holaboss-ai/holaOS' },
    { name: 'HenryNdubuaku/maths-cs-ai-compendium', description: 'Unconventional textbook covering maths, computing, and ML.', stars: 7546, forks: 930, url: 'https://github.com/HenryNdubuaku/maths-cs-ai-compendium' },
    { name: 'unicity-sphere/sphere-sdk', description: 'The SDK for autonomous economic agents.', stars: 5391, forks: 107, url: 'https://github.com/unicity-sphere/sphere-sdk' }
  ]
};

test('buildFallbackTrendingScenes produces 5 compliant scenes', () => {
  const result = buildFallbackTrendingScenes(sampleTrendingData);
  assert.equal(result.scenes.length, 5);
  assert.equal(result.scenes[0].type, 'title');
  assert.equal(result.scenes[1].type, 'image_text');
  assert.equal(result.scenes[2].type, 'insight');
  assert.equal(result.scenes[3].type, 'image_text');
  assert.equal(result.scenes[4].type, 'cta');

  // Must validate with validateScript after restoring contact ending
  const validated = validateScript(restoreContactEnding(result));
  assert.ok(validated);
  assert.equal(validated.scenes[4].btn, 'TALENTOCONTARIFA.LAT');
});

test('sanitizeSceneLengths guards against oversized LLM responses', () => {
  const oversizedData = {
    scenes: [
      {
        type: 'title',
        text1: 'ESTE ES UN TEXTO DE TITULO QUE SUPERA DEMASIADO EL LIMITE MAXIMO PERMITIDO',
        text2: 'SEGUNDO TEXTO EXCESIVAMENTE LARGO',
        voice_text: 'Voz inicial breve.'
      },
      {
        type: 'image_text',
        title: 'TITULO DE HUGGING FACE DEMASIADO EXTENSO PARA CABER EN PANTALLA CINEMATOGRAFICA',
        key_points: [
          '1. Un punto clave extremadamente largo que sobrepasa los 36 caracteres permitidos por el sistema',
          '2. Segundo punto clave que tambien es larguisimo y superaria las validaciones',
          '3. Tercer punto clave largo',
          '4. Punto cuatro que debe ser descartado'
        ],
        voice_text: 'Voz de escena dos.'
      },
      {
        type: 'insight',
        title: 'TITULO INSIGHT MUY LARGO',
        body: 'Este cuerpo de insight contiene una cantidad absurda de texto que supera los ciento veinte caracteres maximos permitidos en la interfaz y debe ser truncado obligatoriamente para cumplir las reglas.',
        voice_text: 'Voz de escena tres.'
      },
      {
        type: 'image_text',
        title: 'TITULO DE GITHUB MUY LARGO',
        key_points: ['1. Repo', '2. Repo dos', '3. Repo tres'],
        voice_text: 'Voz de escena cuatro.'
      },
      {
        type: 'cta',
        headline: 'TITULO CTA',
        sub: 'Subtitulo normal',
        btn: 'BOTON',
        voice_text: 'Voz de escena cinco.'
      }
    ]
  };

  sanitizeSceneLengths(oversizedData);

  assert.ok(oversizedData.scenes[0].text1.length <= 28);
  assert.ok(oversizedData.scenes[0].text2.length <= 28);
  assert.ok(oversizedData.scenes[1].title.length <= 50);
  assert.equal(oversizedData.scenes[1].key_points.length, 3);
  oversizedData.scenes[1].key_points.forEach(p => assert.ok(p.length <= 36));
  assert.ok(oversizedData.scenes[2].body.length <= 120);

  const validated = validateScript(restoreContactEnding(oversizedData));
  assert.ok(validated);
});

test('generateTrendingScript produces compliant scenes without throwing reference errors', async () => {
  const result = await generateTrendingScript(sampleTrendingData);
  assert.equal(result.scenes.length, 5);
  const validated = validateScript(restoreContactEnding(result));
  assert.ok(validated);
  assert.equal(validated.scenes[4].btn, 'TALENTOCONTARIFA.LAT');
});
