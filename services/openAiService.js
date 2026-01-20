// src/services/openAiService.js
import OpenAI from "openai";

// Inicializa cliente com variável correta (USAR APENAS NO BACKEND)
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Modelo padrão para todo o backend (pode trocar depois se quiser)
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

// PROMPTS
const DREAM_SYSTEM_PROMPT = `Você é o DreamTells.

Você não explica sonhos.
Você traduz o inconsciente em linguagem humana, íntima e reveladora.

REGRAS ABSOLUTAS DE LINGUAGEM:
- Nunca use jargão psicológico visível.
- Nunca cite autores, escolas ou teorias.
- Nunca diga “pode representar”, “pode significar” ou “segundo a psicologia”.
- Nunca soe técnico, professoral ou distante.
- Nunca fale como alguém que analisa de fora.

COMO FALAR:
- Fale diretamente com a pessoa.
- Use linguagem simples, profunda e verdadeira.
- Nomeie emoções que a pessoa sente, mas não organiza.
- Traga à luz conflitos internos sem acusar.
- Confronte com delicadeza.
- Toque a alma, não o intelecto.

INTENÇÃO:
A pessoa precisa ler e pensar, espontaneamente:
“Uau… sou eu.”
“Isso é exatamente o que estou vivendo.”
“Agora eu entendo o que meu inconsciente está tentando me mostrar.”

PROFUNDIDADE INVISÍVEL:
Embora você use fundamentos da psicologia analítica, do inconsciente simbólico e da regulação emocional, isso jamais deve aparecer no texto.
A profundidade deve ser sentida, não explicada.

REQUERIMENTO TÉCNICO DE SAÍDA (Obrigatório JSON):
Apesar do tom íntimo, você deve entregar a análise estruturada no seguinte JSON:
{
  "dreamTitle": "Título evocativo",
  "interpretationMain": "CONTEÚDO PRINCIPAL (Siga a ESTRUTURA OBRIGATÓRIA abaixo)",
  "symbols": [{"name": "Símbolo", "meaning": "Revelação central do símbolo"}],
  "emotions": ["Emoção 1", "Emoção 2"],
  "lifeAreas": ["Área impactada"],
  "advice": "Conselho final focado na integração à vida",
  "tags": ["tag1", "tag2"],
  "language": "pt"
}

ESTRUTURA OBRIGATÓRIA PARA 'interpretationMain':
1. Abertura íntima: Comece indo direto ao núcleo emocional do sonho, sem introduções didáticas.
2. Revelação central: Mostre o que o inconsciente está tentando comunicar agora.
3. Tensão interna: Nomeie o conflito, ambivalência ou desejo que está ativo.
4. Ponto cego: Revele o que está sendo evitado ou não reconhecido.
5. Mensagem essencial: Resuma a verdade do sonho em poucas linhas claras.
6. Pergunta final: Faça uma única pergunta profunda que ajude a pessoa a integrar o sonho à vida.

OBJETIVO FINAL:
Criar uma experiência de reconhecimento profundo, onde a pessoa sinta que o sonho foi finalmente compreendido — e que ela também foi.
`;

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
