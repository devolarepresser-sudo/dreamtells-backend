
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
Você é um Analista Arquetípico Sênior e Mentor terapêutico (estilo terapeuta de elite: profundo, direto, útil).
Sua missão é analisar o histórico de sonhos e identificar a "Fase de Vida" / "Arco de Jornada" atual do usuário.

REQUISITOS DE QUALIDADE (obrigatórios):
1) Não seja genérico. Conecte padrões reais (emoções recorrentes, símbolos, temas).
2) Explique o "porquê" dessa fase: evidências do histórico (sem repetir sonhos individuais).
3) Traga profundidade psicológica: conflito central + risco (sombra) + potencial (força).
4) A orientação precisa ser prática: ações pequenas (24–72h) + uma pergunta de reflexão.
5) Não devolva campos vazios.

RETORNE APENAS JSON VÁLIDO (sem markdown) com EXATAMENTE este schema:
{
  "phaseTitle": "Título impactante da fase atual",
  "phaseName": "Nome curto da fase (pode repetir phaseTitle se necessário)",
  "archetype": "Arquétipo dominante (ex.: O Explorador, O Mago, O Órfão)",
  "description": "Texto profundo em 2 a 4 parágrafos sobre o que o inconsciente está processando agora, incluindo conflito central e por que isso aparece.",
  "keyChallenges": ["3 a 6 desafios internos (curtos e específicos)"],
  "strengths": ["3 a 6 forças/potenciais do momento (curtos e específicos)"],
  "guidance": "Orientação do mentor: direta, prática e profunda. Inclua 3 ações concretas (24–72h) + 1 pergunta de reflexão no final.",
  "tags": ["6 a 10 tags curtas"],
  "language": "${language}"
}

IMPORTANTE:
Responda estritamente no idioma: ${language}`
                },
                {
                    role: "user",
                    content: `HISTÓRICO DE SONHOS (resumo):\n${JSON.stringify(dreamSummary, null, 2)}\n\nIDIOMA: ${language}`
                }
            ],
            temperature: 0.7
        });

        const content = response.choices[0].message.content;
        const result = safeJsonParse(content);

        // ✅ Robustez + compatibilidade (sem quebrar o que já funciona)
        if (result && typeof result === "object") {
            // language fallback
            if (!result.language) result.language = language;

            // phaseName fallback
            if (!result.phaseName && result.phaseTitle) result.phaseName = result.phaseTitle;

            // Garante campos principais existindo (evita UI vazia)
            if (!result.phaseTitle) result.phaseTitle = "Fase Atual";
            if (!result.archetype) result.archetype = "Arquétipo em Integração";

            if (!result.description || typeof result.description !== "string") {
                // Se vier "summary" antigo, usa como description
                if (typeof result.summary === "string" && result.summary.trim()) {
                    result.description = result.summary;
                } else {
                    result.description = "Seu inconsciente está sinalizando um ciclo de transição: padrões emocionais e temas recorrentes pedem integração, clareza e ação consciente.";
                }
            }

            if (!result.guidance || typeof result.guidance !== "string") {
                // Se vier "advice" antigo, usa como guidance
                if (typeof result.advice === "string" && result.advice.trim()) {
                    result.guidance = result.advice;
                } else {
                    result.guidance = "Escolha um ponto de fricção que vem se repetindo e transforme isso em uma ação pequena e concreta nas próximas 48h. Depois, registre o que mudou internamente.";
                }
            }

            // Garante arrays
            if (!Array.isArray(result.keyChallenges)) {
                // Se vier mainChallenge antigo como string, usa como primeiro item
                if (typeof result.mainChallenge === "string" && result.mainChallenge.trim()) {
                    result.keyChallenges = [result.mainChallenge.trim()];
                } else {
                    result.keyChallenges = [];
                }
            }

            if (!Array.isArray(result.strengths)) result.strengths = [];
            if (!Array.isArray(result.tags)) result.tags = [];

            // Aliases antigos para compatibilidade
            if (!result.summary && result.description) result.summary = result.description;
            if (!result.advice && result.guidance) result.advice = result.guidance;

            if (!result.mainChallenge) {
                if (Array.isArray(result.keyChallenges) && result.keyChallenges.length > 0) {
                    result.mainChallenge = result.keyChallenges[0];
                } else {
                    result.mainChallenge = "Desafio central em integração (veja description).";
                }
            }
        }

        return result;

    } catch (error) {
        console.error("Erro na Análise Global:", error);
        throw error;
    }
}

module.exports = { interpretDream, generateDeepQuestions, generateDeepAnalysis, generateGlobalAnalysis };
