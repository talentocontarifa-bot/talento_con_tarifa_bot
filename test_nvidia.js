const axios = require('axios');

async function testVariation(label, prompt) {
  const nvapiKey = process.env.NVIDIA_API_KEY;
  console.log(`\n--- Testing: ${label} ---`);
  console.log(`Prompt: "${prompt}"`);

  try {
    const response = await axios.post(
      "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
      {
        prompt: prompt,
        height: 1024,
        width: 1024
      },
      {
        headers: {
          "Authorization": `Bearer ${nvapiKey}`,
          "accept": "application/json",
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    console.log(`Status Code: ${response.status}`);
    if (response.data && response.data.artifacts && response.data.artifacts[0]) {
      const base64Str = response.data.artifacts[0].base64;
      const buffer = Buffer.from(base64Str, 'base64');
      console.log(`Success! Base64 length: ${base64Str.length}, decoded buffer: ${buffer.length} bytes`);
    } else {
      console.error("Unexpected response data:", response.data);
    }
  } catch (error) {
    console.error("Error calling API:", error.message);
  }
}

async function runTests() {
  await testVariation("neo-brutalist", "neo-brutalist");
  await testVariation("8k", "8k");
  await testVariation("vertical", "vertical");
  await testVariation("glowing", "glowing");
  await testVariation("tech", "tech");
  await testVariation("neon", "neon");
}

runTests();
