const axios = require('axios');

async function testAndInspect(label, payload) {
  const nvapiKey = process.env.NVIDIA_API_KEY;
  console.log(`\n--- Inspecting: ${label} ---`);

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
      const artifact = response.data.artifacts[0];
      console.log("Artifact properties (minus base64):");
      console.log(`- finishReason: ${artifact.finishReason}`);
      console.log(`- seed: ${artifact.seed}`);
      console.log(`- base64 string length: ${artifact.base64.length}`);
    } else {
      console.log("Unexpected response data:", JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.error("Error calling API:");
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error("Response data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

async function runTests() {
  // Test 1: Successful cute cat
  await testAndInspect("Cute cat (Should succeed)", {
    prompt: "a cute cat sitting on a couch",
    height: 1024,
    width: 1024
  });

  // Test 2: Black image brain
  await testAndInspect("Brain (Returns black image)", {
    prompt: "neo-brutalist, 8k, vertical, a stylized human brain glowing, tech, neon",
    height: 1024,
    width: 1024
  });
}

runTests();
