const path = require("path");
const dotenv = require("dotenv");

// Carrega variáveis do .env da raiz (padrão)
dotenv.config();

// Carrega/Sobrescreve com variáveis específicas do servidor (.env na raiz ou subpasta), se existir
try {
  const envPath = path.resolve(__dirname, "../../.env");
  dotenv.config({ path: envPath, override: true });
} catch (e) {
  // Ignora se não existir
}

const OpenAI = require("openai");

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();

if (!OPENAI_API_KEY) {
  console.error("[CRÍTICO] OpenAI API Key não encontrada no ambiente do backend!");
}

const openaiClient = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

module.exports = { openaiClient };
