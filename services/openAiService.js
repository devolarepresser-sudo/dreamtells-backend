import OpenAI from 'openai';

// Initialize OpenAI client
// Ensure the process.env.OPENAI_API_KEY is loaded by the main entry point (app.js/index.js)
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

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

/**
 * Interprets a dream using GPT-5.1
 * @param {string} dreamText 
 * @param {string} userId 
 * @param {boolean} isPremium 
 * @returns {Promise<object>} JSON InterpretationResult
 */
export const interpretDreamWithGPT5 = async (dreamText, userId, isPremium = false) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY not configured on server.");
    }

    try {
        console.log(`[OpenAiService] Calling GPT-5.1 for user ${userId}...`);

        const completion = await openai.chat.completions.create({
            model: "gpt-5.1", // Using the requested model
            messages: [
                { role: "system", content: DREAM_SYSTEM_PROMPT },
                { role: "user", content: `Contexto do usuário: ID ${userId}, Plano ${isPremium ? 'Premium' : 'Free'}.\n\nSonho: ${dreamText}` }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
        });

        const content = completion.choices[0].message.content;
        const result = JSON.parse(content);

        // Ensure language is set if model forgot
        if (!result.language) result.language = 'pt';

        return result;

    } catch (error) {
        console.error("[OpenAiService] Error interpreting dream:", error);
        throw error; // Propagate to controller for 500 response
    }
};

/**
 * Analyzes life context with recent dreams using GPT-5.1
 * @param {string} lifeText 
 * @param {Array} recentDreams 
 * @param {string} userId 
 * @returns {Promise<string>} Analysis text
 */
export const analyzeLifeContextWithGPT5 = async (lifeText, recentDreams, userId, language = 'pt') => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY not configured on server.");
    }

    try {
        console.log(`[OpenAiService] Analyzing context for user ${userId} (${language})...`);

        const dreamsSummary = recentDreams && recentDreams.length > 0
            ? recentDreams.map(d => `- ${d.dreamTitle || 'Sem título'}: ${d.interpretationMain || ''}`).join('\n')
            : 'Nenhum sonho recente registrado.';

        const completion = await openai.chat.completions.create({
            model: "gpt-5.1",
            messages: [
                { role: "system", content: CONTEXT_SYSTEM_PROMPT },
                { role: "user", content: `Contexto de vida: ${lifeText}\n\nResumo dos sonhos recentes:\n${dreamsSummary}\n\nIdioma da resposta: ${language}` }
            ],
            temperature: 0.7,
        });

        return completion.choices[0].message.content;

    } catch (error) {
        console.error("[OpenAiService] Error analyzing context:", error);
        throw error;
    }
};
const DAILY_MESSAGE_PROMPT = `Você é uma IA que gera uma MENSAGEM DO DIA curta, profunda, objetiva e inspiradora.
Baseie-se no que a pessoa está vivendo e nos sonhos recentes (se houver).
A mensagem deve:
- Validar a dor e os desafios.
- Destacar 1 a 3 pontos principais de força / aprendizado.
- Entregar uma frase/convite para ação concreta e positiva.
- Ter linguagem simples, direta e empática.
NÃO use formatação markdown complexa, apenas texto limpo. Máximo 6 linhas.`;

export const generateDailyMessageWithGPT5 = async (recentDreams, userId, language = 'pt') => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY not configured on server.");
    }

    try {
        console.log(`[OpenAiService] Generating daily message for user ${userId}...`);

        const dreamsSummary = recentDreams && recentDreams.length > 0
            ? recentDreams.map(d => `- ${d.dreamTitle || 'Sonho'}: ${d.interpretationMain || ''}`).join('\n')
            : 'Nenhum sonho recente.';

        const completion = await openai.chat.completions.create({
            model: "gpt-5.1",
            messages: [
                { role: "system", content: DAILY_MESSAGE_PROMPT },
                { role: "user", content: `Contexto dos Sonhos Recentes:\n${dreamsSummary}\n\nIdioma preferido: ${language}` }
            ],
            temperature: 0.8,
        });

        return completion.choices[0].message.content;

    } catch (error) {
        console.error("[OpenAiService] Error generating daily message:", error);
        throw error;
    }
};
