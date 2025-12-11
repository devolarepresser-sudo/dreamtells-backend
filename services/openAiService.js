import OpenAI from "openai";

// Cliente OpenAI usando a chave do ambiente
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Prompts de sistema
const DREAM_SYSTEM_PROMPT = `Você é uma inteligência especializada em interpretação de sonhos, emoção, traumas, padrões da psique e contexto espiritual suave.
Entregue respostas claras, profundas, empáticas e estruturadas no formato JSON exato solicitado.
Campos obrigatórios no JSON:
{
  "dreamTitle": "título sugerido",
  "interpretationMain": "Resumo profundo e significado principal",
  "symbols": [{"name": "Símbolo", "meaning": "Significado"}],
  "emotions": ["Emoção1", "Emoção2"],
  "lifeAreas": ["Área1", "Área2"],
  "advice": "Ações práticas e pontos de atenção",
  "tags": ["tag1", "tag2"],
  "language": "pt"
}
Analise o conteúdo com profundidade.`;

const CONTEXT_SYSTEM_PROMPT = `Você é uma inteligência especializada em psicologia analítica.
Analise o contexto de vida do usuário e seus sonhos recentes para encontrar padrões e conexões.
Responda APENAS com o texto da análise, de forma acolhedora, profunda e direta (máximo 3 parágrafos).
Foque em como o momento de vida explica os sonhos e vice-versa.`;

const DAILY_MESSAGE_PROMPT = `Você é uma IA que gera uma MENSAGEM DO DIA curta, profunda, objetiva e inspiradora.
Baseie-se no que a pessoa está vivendo e nos sonhos recentes (se houver).
A mensagem deve:
- Validar a dor e os desafios.
- Destacar 1 a 3 pontos principais de força / aprendizado.
- Entregar uma frase/convite para ação concreta e positiva.
- Ter linguagem simples, direta e empática.
NÃO use formatação markdown complexa, apenas texto limpo. Máximo 6 linhas.`;

// Escolhe modelo da env, com fallback para gpt-4.1-mini
const getModel = () => process.env.OPENAI_MODEL || "gpt-4.1-mini";

/**
 * Interpreta um sonho (retorna JSON estruturado)
 */
export const interpretDreamWithGPT5 = async (dreamText, userId, isPremium = false) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY not configured on server.");
    }

    try {
        console.log(`[OpenAiService] Interpretando sonho para usuário ${userId} (Premium: ${isPremium})...`);

        const response = await client.responses.create({
            model: getModel(),
            input: [
                {
                    role: "system",
                    content: [{ type: "text", text: DREAM_SYSTEM_PROMPT }]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Contexto do usuário: ID ${userId}, Plano: ${isPremium ? "Premium" : "Free"}.\n\nSonho: ${dreamText}`
                        }
                    ]
                }
            ]
        });

        // A nova API expõe o texto em output_text, já em string
        const raw = response.output_text ?? response.output?.[0]?.content?.[0]?.text;
        const result = JSON.parse(raw);

        if (!result.language) result.language = "pt";

        return result;
    } catch (error) {
        console.error("[OpenAiService] Error interpreting dream:", error);
        throw error;
    }
};

/**
 * Analisa contexto de vida + sonhos recentes (texto corrido)
 */
export const analyzeLifeContextWithGPT5 = async (lifeText, recentDreams, userId, language = "pt") => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY not configured on server.");
    }

    try {
        console.log(`[OpenAiService] Analisando contexto de vida para usuário ${userId} (${language})...`);

        const dreamsSummary =
            recentDreams && recentDreams.length > 0
                ? recentDreams
                      .map(
                          d =>
                              `- ${d.dreamTitle || "Sem título"}: ${
                                  d.interpretationMain || ""
                              }`
                      )
                      .join("\n")
                : "Nenhum sonho recente registrado.";

        const response = await client.responses.create({
            model: getModel(),
            input: [
                {
                    role: "system",
                    content: [{ type: "text", text: CONTEXT_SYSTEM_PROMPT }]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Contexto de vida: ${lifeText}\n\nResumo dos sonhos recentes:\n${dreamsSummary}\n\nIdioma da resposta: ${language}`
                        }
                    ]
                }
            ]
        });

        return response.output_text ?? response.output?.[0]?.content?.[0]?.text;
    } catch (error) {
        console.error("[OpenAiService] Error analyzing context:", error);
        throw error;
    }
};

/**
 * Gera mensagem do dia (texto curto)
 */
export const generateDailyMessageWithGPT5 = async (recentDreams, userId, language = "pt") => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY not configured on server.");
    }

    try {
        console.log(`[OpenAiService] Gerando mensagem do dia para usuário ${userId}...`);

        const dreamsSummary =
            recentDreams && recentDreams.length > 0
                ? recentDreams
                      .map(
                          d =>
                              `- ${d.dreamTitle || "Sonho"}: ${
                                  d.interpretationMain || ""
                              }`
                      )
                      .join("\n")
                : "Nenhum sonho recente.";

        const response = await client.responses.create({
            model: getModel(),
            input: [
                {
                    role: "system",
                    content: [{ type: "text", text: DAILY_MESSAGE_PROMPT }]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Contexto dos Sonhos Recentes:\n${dreamsSummary}\n\nIdioma preferido: ${language}`
                        }
                    ]
                }
            ]
        });

        return response.output_text ?? response.output?.[0]?.content?.[0]?.text;
    } catch (error) {
        console.error("[OpenAiService] Error generating daily message:", error);
        throw error;
    }
};
