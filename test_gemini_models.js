require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  if (!process.env.GEMINI_API_KEY) {
      console.log("No hay GEMINI_API_KEY en el .env local.");
      return;
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  const modelsToTest = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash"
  ];

  for (const modelName of modelsToTest) {
    console.log(`\n--- PROBANDO ${modelName} ---`);
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Hola, esto es una prueba. Responde 'Ok'");
      console.log(`✅ ÉXITO con ${modelName}:`, result.response.text().trim());
    } catch(e) {
      console.log(`❌ Error con ${modelName}:`, e.message);
    }
  }
}
test();
