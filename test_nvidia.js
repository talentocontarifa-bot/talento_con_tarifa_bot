const axios = require('axios');

async function listModels() {
  const nvapiKey = process.env.NVIDIA_API_KEY;
  if (!nvapiKey) {
    console.error("❌ NVIDIA_API_KEY is not defined.");
    process.exit(1);
  }

  try {
    const response = await axios.get(
      "https://integrate.api.nvidia.com/v1/models",
      {
        headers: {
          "Authorization": `Bearer ${nvapiKey}`
        }
      }
    );

    console.log("Status Code:", response.status);
    if (response.data && response.data.data) {
      console.log("Available models:");
      response.data.data.forEach(model => {
        console.log(`- ${model.id}`);
      });
    } else {
      console.log("Response data:", response.data);
    }
  } catch (error) {
    console.error("Error listing models:");
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

listModels();
