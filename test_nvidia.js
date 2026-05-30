const axios = require('axios');
const fs = require('fs');

async function testNvidia() {
  const nvapiKey = process.env.NVIDIA_API_KEY;
  if (!nvapiKey) {
    console.error("❌ NVIDIA_API_KEY is not defined in environment variables.");
    process.exit(1);
  }

  const prompt = "neo-brutalist, 8k, vertical, a stylized human brain glowing, tech, neon";
  console.log(`Sending request to NVIDIA FLUX API with prompt: "${prompt}"...`);

  try {
    const response = await axios.post(
      "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
      {
        prompt: prompt,
        height: 1344,
        width: 768,
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
    console.log("Response headers:", response.headers);
    console.log("Response data keys:", Object.keys(response.data));

    if (response.data && response.data.artifacts && response.data.artifacts[0]) {
      const artifact = response.data.artifacts[0];
      console.log("Artifact keys:", Object.keys(artifact));
      const base64Str = artifact.base64;
      console.log(`Base64 string length: ${base64Str.length}`);
      console.log(`First 100 chars of base64: ${base64Str.substring(0, 100)}`);
      
      const buffer = Buffer.from(base64Str, 'base64');
      console.log(`Decoded buffer byte length: ${buffer.length}`);
      
      // Let's write it to test_nvidia_output.png
      fs.writeFileSync("test_nvidia_output.png", buffer);
      console.log("Saved image to test_nvidia_output.png");
    } else {
      console.error("❌ Unexpected response structure from Nvidia:", response.data);
    }
  } catch (error) {
    console.error("❌ Error calling Nvidia API:");
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error("Response data:", error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

testNvidia();
