const axios = require('axios');
const fs = require('fs');

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
        timeout: 30000
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
  // Test 1: Full original prompt
  await testVariation("Original Prompt", "neo-brutalist, 8k, vertical, a stylized human brain glowing, tech, neon");

  // Test 2: Without "human"
  await testVariation("Without human", "neo-brutalist, 8k, vertical, a stylized brain glowing, tech, neon");

  // Test 3: Without "brain"
  await testVariation("Without brain", "neo-brutalist, 8k, vertical, a stylized glowing structure, tech, neon");

  // Test 4: With "cybernetic core" instead of "human brain"
  await testVariation("With cybernetic core", "neo-brutalist, 8k, vertical, a stylized cybernetic core glowing, tech, neon");

  // Test 5: Simple "brain"
  await testVariation("Simple brain", "a brain");

  // Test 6: Simple "human brain"
  await testVariation("Simple human brain", "a human brain");
}

runTests();
