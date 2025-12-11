// src/services/openAiService.js
import OpenAI from "openai";

// Inicializa cliente com variável correta (USAR APENAS NO BACKEND)
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Modelo padrão para todo o backend (pode trocar depois se quiser)
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

// PROMPTS
const DREAM_SYSTEM_PROMPT = `Você é uma inteligência especializada em interpretação de sonhos, emoção, traumas, padrões da psique e contexto espiritual suave.
Entregue respostas claras, profundas, empáticas e estruturadas no formato JSON exato solicitado.
Campos obrigatórios no JSON:
{
  "dreamTitle": "título sugerido",
  "interpretationMain": "Resumo profundo e significado principal",
  "symbols": [{"name": "Símbolo", "meaning": "Significado"}],
  "emotions": ["Emoção1", "Emoção2"],
  "lifeAreas": ["Área1"],
  "advice": "Ações práticas e pontos de atenção",
  "tags": ["tag1", "tag2"],
  "language": "pt"
}
Analise o conteúdo com profundidade.`;

const CONTEXT_SYSTEM_PROMPT = `Você é uma inteligência especializada em psicologia analítica.
Analise o contexto de vida do usuário e seus sonhos recentes para encontrar padrões.
Responda APENAS com texto puro, profundo e acolhedor (máximo 3 parágrafos).`;

const DAILY_MESSAGE_PROMPT = `Você é uma IA que gera uma mensagem do dia curta, profunda e inspiradora.
Baseie-se no que a pessoa está vivendo e nos sonhos recentes.
Formato: texto simples, máximo 6 linhas.`;

// Helper seguro para pegar texto da nova API
function extractTextFromResponse(response) {
    // 1) Tenta usar output_text (forma nova simplificada)
    const ot = response?.output_text;
    if (ot) {
        if (Array.isArray(ot)) {
            const first = ot[0];
            if (typeof first === "string") return first;
            if (first && typeof first.text === "string") return first.text;
        } else if (typeof ot === "string") {
            return ot;
        }
    }

    // 2) Fallback para estrutura detalhada: response.output[0].content[0].text
    const item = response?.output?.[0]?.content?.[0];
    if (!item) {
        throw new Error("Resposta da OpenAI veio sem output esperado.");
    }

    const txt = item.text;
    if (typeof txt === "string") return txt;
    if (txt && typeof txt.value === "string") return txt.value;

    throw new Error("Formato de texto inesperado na resposta da OpenAI.");
}

// =============================
// FUNÇÃO 1 — INTERPRETAR SONHO
// =============================
export const interpretDreamWithGPT5 = async (dreamText, userId, isPremium = false) => {
    try {
        console.log(`[OpenAI] interpretando sonho para ${userId} (premium: ${isPremium})`);

        const response = await client.responses.create({
            model: DEFAULT_MODEL,
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: DREAM_SYSTEM_PROMPT }]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `Sonho do usuário ${userId} (${isPremium ? "PREMIUM" : "FREE"}): ${dreamText}`
                        }
                    ]
                }
            ]
        });

        const jsonText = extractTextFromResponse(response);

        // Alguns modelos podem devolver com ```json ... ``` → limpar
        const cleaned = jsonText
            .replace(/^```json/i, "")
            .replace(/^```/i, "")
            .replace(/```$/i, "")
            .trim();

        const result = JSON.parse(cleaned);

        if (!result.language) {
            result.language = "pt";
        }

        return result;
    } catch (err) {
        console.error("[OpenAI ERROR interpretDream]", err);
        throw err;
    }
};

// =============================
// FUNÇÃO 2 — CONTEXTO DE VIDA
// =============================
export const analyzeLifeContextWithGPT5 = async (lifeText, recentDreams, userId, language = "pt") => {
    try {
        console.log(`[OpenAI] analisando contexto de vida de ${userId}`);

        const dreamsSummary =
            recentDreams?.length
                ? recentDreams
                      .map((d) => `- ${d.dreamTitle || "Sem título"}: ${d.interpretationMain || ""}`)
                      .join("\n")
                : "Nenhum sonho recente.";

        const response = await client.responses.create({
            model: DEFAULT_MODEL,
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: CONTEXT_SYSTEM_PROMPT }]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `Contexto:\n${lifeText}\n\nSonhos recentes:\n${dreamsSummary}\n\nIdioma: ${language}`
                        }
                    ]
                }
            ]
        });

        const text = extractTextFromResponse(response);
        return text;
    } catch (err) {
        console.error("[OpenAI ERROR lifeContext]", err);
        throw err;
    }
};

// =============================
// FUNÇÃO 3 — MENSAGEM DO DIA
// =============================
export const generateDailyMessageWithGPT5 = async (recentDreams, userId, language = "pt") => {
    try {
        console.log(`[OpenAI] gerando mensagem do dia para ${userId}`);

        const dreamsSummary =
            recentDreams?.length
                ? recentDreams
                      .map((d) => `- ${d.dreamTitle || "Sonho"}: ${d.interpretationMain || ""}`)
                      .join("\n")
                : "Nenhum sonho recente.";

        const response = await client.responses.create({
            model: DEFAULT_MODEL,
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: DAILY_MESSAGE_PROMPT }]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `Resumo dos sonhos:\n${dreamsSummary}\nIdioma: ${language}`
                        }
                    ]
                }
            ]
        });

        const text = extractTextFromResponse(response);
        return text;
    } catch (err) {
        console.error("[OpenAI ERROR dailyMessage]", err);
        throw err;
    }
};
