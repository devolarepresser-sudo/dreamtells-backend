// src/services/openaiClient.cjs
const path = require("path");
const dotenv = require("dotenv");

// Carrega variáveis do .env da raiz (padrão)
dotenv.config();

// Carrega/Sobrescreve com variáveis específicas do servidor (server/.env), se existir
// Isso garante que este módulo pegue a MESMA chave que o index.js está usando com sucesso
try {
  // Tenta resolver relativo ao __dirname para garantir que ache o arquivo dentro de 'server'
  const serverEnvPath = path.resolve(__dirname, "../../.env");
  dotenv.config({ path: serverEnvPath, override: true });
} catch (e) {
  // Apenas ignora se não existir
}

const OpenAI = require("openai");

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();

if (!OPENAI_API_KEY) {
  console.error("[CRÍTICO] OpenAI API Key não encontrada no processo do backend!");
}

const openaiClient = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

module.exports = { openaiClient };
