// src/services/dreamInterpreter.cjs
const { openaiClient } = require("./openaiClient.cjs");

function resolveModel() {
    const raw = process.env.OPENAI_MODEL;
    const model = raw ? String(raw).trim() : "gpt-4.1-mini";

    // Log explícito pra pegar espaço/enter/aspas invisíveis
    console.log(`[Backend] OPENAI_MODEL raw: ${JSON.stringify(raw)} | resolved: ${JSON.stringify(model)}`);

    return model || "gpt-4.1-mini";
}

function safeJsonParse(raw) {
    if (!raw || typeof raw !== "string") return raw;

    try {
        // Remove fences markdown: ```json ... ``` ou ``` ... ```
        let s = raw.trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/```$/i, "")
            .trim();

        // Se vier com texto extra, recorta do primeiro { ao último }
        const firstBrace = s.indexOf("{");
        const lastBrace = s.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            s = s.slice(firstBrace, lastBrace + 1);
        }

        return JSON.parse(s);
    } catch (e) {
        console.error("[Backend] Falha grave no parsing do JSON da OpenAI:", e);
        console.error("[Backend] Conteúdo bruto que falhou:", raw);
        throw e;
    }
}

// Helper seguro para pegar texto da nova API (Mesma lógica do openAiService.js)
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
        throw new Error("Resposta da OpenAI veio sem output esperado (Global/Deep).");
    }

    const txt = item.text;
    if (typeof txt === "string") return txt;
    if (txt && typeof txt.value === "string") return txt.value;

    throw new Error("Formato de texto inesperado na resposta da OpenAI (Global/Deep).");
}

async function interpretDream(dreamText, language = "pt") {
    const model = resolveModel();

    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: `
Você NÃO é um explicador genérico de sonhos.
Você é um analista psicológico profundo, com base em psicologia simbólica, comportamento humano e conflitos inconscientes.

MISSÃO:
Interpretar o sonho de forma ESPECÍFICA, DIRETA e PSICOLOGICAMENTE SIGNIFICATIVA.
Evite qualquer interpretação genérica que poderia servir para qualquer pessoa.

REGRAS OBRIGATÓRIAS:
1. NÃO descreva o sonho. Interprete.
2. NÃO use frases vagas como “isso pode indicar”, “talvez signifique”, “em geral”.
3. NÃO seja excessivamente positivo ou reconfortante.
4. NÃO espiritualize demais nem racionalize demais.
5. ARRISQUE uma leitura psicológica clara, mesmo que seja desconfortável.
6. Seja específico: fale de conflitos internos concretos, decisões evitadas e tensões emocionais reais.

ESTRUTURA OBRIGATÓRIA DA RESPOSTA (JSON):
Responda APENAS com JSON.

{
  "dreamTitle": "Um título curto, impactante e coerente com o eixo central do sonho",
  "interpretationMain": "Uma interpretação completa, profunda e envolvente, integrando as camadas do método em texto corrido.",
  "symbols": [
    { "name": "Nome de um símbolo importante", "meaning": "Significado emocional/psicológico especifico." }
  ],
  "emotions": ["Lista das principais emoções percebidas"],
  "lifeAreas": ["Áreas da vida afetadas"],
  "advice": "Orientações práticas e acolhedoras. Termine com: 'Esta orientação foi gerada pelo Método de Interpretação Profunda DreamTells.' (traduza se necessário).",
  "tags": ["palavras-chave"],
  "language": "${language}"
}

IMPORTANTE:
Responda no idioma: ${language}`
                },
                {
                    role: "user",
                    content: `Sonho: ${dreamText}\n\nIdioma da resposta: ${language}`
                }
            ]
        });

        const content = response.choices[0].message.content;
        return safeJsonParse(content);

    } catch (error) {
        console.error("Erro ao interpretar sonho:", error);
        return { error: error.message };
    }
}

async function generateDeepQuestions(dreamText, language = "pt") {
    const model = resolveModel();

    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: `Você é um terapeuta junguiano experiente. 
Gere perguntas profundas para ajudar o sonhador a refletir.
REGRAS:
1. Gere exatamente 6 perguntas.
2. A PRIMEIRA pergunta deve ser sobre se o sonho reflete o momento atual.
3. As outras 5 perguntas devem ser específicas sobre os símbolos e emoções do sonho.
4. Responda APENAS com JSON no formato: { "questions": ["pergunta 1", "pergunta 2", ...] }
5. Idioma da resposta: ${language}`
                },
                {
                    role: "user",
                    content: `Sonho: ${dreamText}\nIdioma: ${language}`
                }
            ],
            temperature: 0.7
        });

        const content = response.choices[0].message.content;
        const json = safeJsonParse(content);
        return json.questions || [];

    } catch (error) {
        console.error("Erro ao gerar perguntas de aprofundamento:", error);
        return [
            "Esse sonho se parece com algo que você está vivendo hoje?",
            "Qual o sentimento mais forte que ficou ao acordar?",
            "Há algum símbolo que chamou sua atenção?"
        ];
    }
}

async function generateDeepAnalysis(dreamText, initialInterpretation, userAnswers, language = "pt") {
    const model = resolveModel();

    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: `
Você é um analista especializado em Shadow Work, Psicologia Analítica e padrões inconscientes de comportamento.

MISSÃO:
Produzir uma análise profunda que vá ALÉM da interpretação inicial, integrando:
- O sonho
- A interpretação inicial
- As respostas conscientes do usuário

REGRAS CRÍTICAS:
1. NÃO repita a interpretação inicial.
2. NÃO suavize conflitos.
3. NÃO use linguagem genérica ou motivacional.
4. NÃO explique teoria.
5. ARRISQUE leituras claras sobre padrões inconscientes.
6. Seja específico, direto e psicológico.

OBJETIVO DA ANÁLISE:
- Revelar padrões emocionais repetitivos
- Evidenciar conflitos não resolvidos
- Mostrar incoerências entre desejo e ação
- Apontar decisões evitadas

ESTRUTURA OBRIGATÓRIA DA RESPOSTA (JSON):

{
  "deepInsights": [
    {
      "title": "Nome claro do insight",
      "content": "Texto profundo, direto e confrontativo em markdown."
    }
  ],
  "patterns": [
    "Padrão psicológico identificado"
  ],
  "finalIntegration": "Síntese prática que conecta consciência e ação."
}

IMPORTANTE:
Responda estritamente no idioma: ${language}`
                },
                {
                    role: "user",
                    content: `
DADOS DE ENTRADA:
SONHO: ${dreamText}
INTERPRETAÇÃO INICIAL: ${JSON.stringify(initialInterpretation)}
RESPOSTAS DO USUÁRIO: ${JSON.stringify(userAnswers, null, 2)}
IDIOMA SOLICITADO: ${language}`
                }
            ],
            temperature: 0.7
        });

        const content = response.choices[0].message.content;
        return safeJsonParse(content);

    } catch (error) {
        console.error("Erro CRÍTICO na Deep Analysis (OpenAI):", error);
        throw error;
    }
}

async function generateGlobalAnalysis(dreams, language = "pt") {
    const model = resolveModel();
    console.log(`[Backend] Iniciando Análise Global com ${dreams.length} sonhos usando modelo: ${model} e idioma: ${language}`);

    try {
        if (!dreams || dreams.length === 0) {
            throw new Error("Nenhum sonho fornecido para análise global.");
        }

        const dreamSummary = dreams.slice(0, 10).map(d => ({
            title: d.dreamTitle || "Sem título",
            mainInsight: (d.interpretationMain || d.interpretation || "").substring(0, 300),
            emotions: d.emotions || []
        }));

        console.log(`[Backend] Enviando resumo de sonhos para OpenAI...`);

        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: `
Você é um Analista Arquetípico Sênior e Mentor Transpessoal.
Sua missão é olhar para o histórico de sonhos de um usuário e identificar o "Arco de Jornada" em que ele se encontra.

REGRAS CRÍTICAS:
1. IDENTIFIQUE uma "Fase de Vida" (ex: "O Despertar da Sombra", "A Travessia do Deserto", "O Chamado do Herói").
2. ANALISE os padrões de emoção e símbolos recorrentes.
3. FORNEÇA uma orientação de mestre para o momento atual.
4. O tom deve ser profundo, empoderador e sábio, como um ancião ou guia espiritual.
5. NÃO repita interpretações individuais. Fale do TODO.

ESTRUTURA OBRIGATÓRIA (JSON):
{
  "phaseTitle": "Título impactante da fase atual",
  "summary": "Explicação profunda de 2 a 3 parágrafos sobre o que o inconsciente está tentando processar agora.",
  "archetype": "O arquétipo dominante presente no momento (ex: O Explorador, O Mago, O Orfão).",
  "mainChallenge": "O maior desafio interno identificado no momento.",
  "advice": "Orientação prática e espiritual para navegar nesta fase."
}

IMPORTANTE:
Responda estritamente no idioma: ${language}`
                },
                {
                    role: "user",
                    content: `HISTÓRICO DE SONHOS E INTERPRETAÇÕES:\n${JSON.stringify(dreamSummary, null, 2)}\n\nIDIOMA: ${language}`
                }
            ],
            temperature: 0.7
        });

        const content = response.choices[0].message.content;
        return safeJsonParse(content);

    } catch (error) {
        console.error("Erro na Análise Global:", error);
        throw error;
    }
}

module.exports = { interpretDream, generateDeepQuestions, generateDeepAnalysis, generateGlobalAnalysis };
