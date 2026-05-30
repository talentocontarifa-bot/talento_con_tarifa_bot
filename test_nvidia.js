const axios = require('axios');
const fs = require('fs');

async function testResolution(width, height, filename) {
  const nvapiKey = process.env.NVIDIA_API_KEY;
  const prompt = "neo-brutalist, 8k, vertical, a stylized human brain glowing, tech, neon";
  console.log(`\n--- Generating with resolution ${width}x${height} ---`);

  try {
    const response = await axios.post(
      "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
      {
        prompt: prompt,
        height: height,
        width: width,
        steps: 4,
        seed: 0
      },
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
  // Test 1: Requested aspect ratio 768x1344
  await testResolution(768, 1344, "output_768_1344.png");

  // Test 2: Standard resolution 1024x1024
  await testResolution(1024, 1024, "output_1024_1024.png");
}

runTests();
