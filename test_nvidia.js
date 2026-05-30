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
  const prompt = "neo-brutalist, 8k, vertical, a stylized human brain glowing, tech, neon";

  // Test 1: 1024x1024, steps 4, seed 42
  await testVariation("brain 1024 steps 4 seed 42", {
    prompt: prompt,
    height: 1024,
    width: 1024,
    steps: 4,
    seed: 42
  });

  // Test 2: 1024x1024, steps 4, seed 0
  await testVariation("brain 1024 steps 4 seed 0", {
    prompt: prompt,
    height: 1024,
    width: 1024,
    steps: 4,
    seed: 0
  });

  // Test 3: 1024x1024, no steps, no seed
  await testVariation("brain 1024 no steps no seed", {
    prompt: prompt,
    height: 1024,
    width: 1024
  });

  // Test 4: 1344x768, no steps, no seed
  await testVariation("brain 768x1344 no steps no seed", {
    prompt: prompt,
    height: 1344,
    width: 768
  });
}

runTests();
