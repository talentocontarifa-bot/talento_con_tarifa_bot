require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  if (!process.env.GEMINI_API_KEY) {
      console.log("No hay GEMINI_API_KEY en el .env local.");
      return;
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  console.log("--- PROBANDO gemini-1.5-flash (El que le puse al bot) ---");
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hola, esto es una prueba. Responde 'Ok'");
    console.log("✅ ÉXITO con 1.5-flash:", result.response.text());
  } catch(e) {
    console.log("❌ Error con 1.5-flash:", e.message);
  }

  console.log("\n--- PROBANDO gemini-2.5-flash (El que tenía antes) ---");
  try {
    const model2 = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result2 = await model2.generateContent("Hola, responde 'Ok'");
    console.log("✅ ÉXITO con 2.5-flash:", result2.response.text());
  } catch(e) {
    console.log("❌ Error con 2.5-flash:", e.message);
  }
}
test();
