const axios = require('axios');
const fs = require('fs');

async function testVariation(label, payload) {
  const nvapiKey = process.env.NVIDIA_API_KEY;
  console.log(`\n--- Testing: ${label} ---`);
  console.log("Payload:", JSON.stringify(payload));

  try {
    const response = await axios.post(
      "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
      payload,
      {
        headers: {
          "Authorization": `Bearer ${nvapiKey}`,
          "accept": "application/json",
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    console.log(`Status Code: ${response.status}`);
    if (response.data && response.data.artifacts && response.data.artifacts[0]) {
      const base64Str = response.data.artifacts[0].base64;
      const buffer = Buffer.from(base64Str, 'base64');
      console.log(`Success! Base64 length: ${base64Str.length}, decoded buffer: ${buffer.length} bytes`);
      const filename = `out_${label.replace(/\s+/g, '_')}.png`;
      fs.writeFileSync(filename, buffer);
      console.log(`Saved to ${filename}`);
    } else {
      console.error("Unexpected response data:", response.data);
    }
  } catch (error) {
    console.error("Error:");
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error("Response data:", error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

async function runTests() {
  // Test 1: Simple prompt, no steps, no seed, standard resolution
  await testVariation("simple prompt no steps no seed 1024", {
    prompt: "a cute cat sitting on a couch",
    height: 1024,
    width: 1024
  });

  // Test 2: Standard prompt, steps 4, seed 42, resolution 768x1344
  await testVariation("city sunset steps 4 seed 42 768x1344", {
    prompt: "A cinematic shot of a futuristic city at sunset, neo-brutalist style",
    height: 1344,
    width: 768,
    steps: 4,
    seed: 42
  });

  // Test 3: Brain prompt, steps 4, seed 12345, resolution 768x1344
  await testVariation("brain steps 4 seed 12345 768x1344", {
    prompt: "neo-brutalist, 8k, vertical, a stylized human brain glowing, tech, neon",
    height: 1344,
    width: 768,
    steps: 4,
    seed: 12345
  });

  // Test 4: Same as Test 3, but with steps: 1
  await testVariation("brain steps 1 seed 12345 768x1344", {
    prompt: "neo-brutalist, 8k, vertical, a stylized human brain glowing, tech, neon",
    height: 1344,
    width: 768,
    steps: 1,
    seed: 12345
  });
}

runTests();
