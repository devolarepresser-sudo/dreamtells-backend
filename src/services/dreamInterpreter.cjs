// src/services/dreamInterpreter.cjs
const { openaiClient } = require("./openaiClient.cjs");

function resolveModel() {
    const raw = process.env.OPENAI_MODEL;
    const model = raw ? String(raw).trim() : "gpt-4o"; // ✅ default agora é GPT-4o

    // Log explícito pra pegar espaço/enter/aspas invisíveis
    console.log(`[Backend] OPENAI_MODEL raw: ${JSON.stringify(raw)} | resolved: ${JSON.stringify(model)}`);

    return model || "gpt-4o"; // ✅ fallback agora é GPT-4o
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

// =====================
// Helpers locais (mínimos)
// =====================
function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
}

function ensureArray(v) {
    return Array.isArray(v) ? v : [];
}

function countParagraphs(text) {
    if (!isNonEmptyString(text)) return 0;
    // conta blocos separados por linha em branco
    return text
        .split(/\n\s*\n/g)
        .map(s => s.trim())
        .filter(Boolean).length;
}

function guidanceHas3ActionsAndQuestion(guidance) {
    if (!isNonEmptyString(guidance)) return false;
    const hasQuestion = /[?]\s*$/.test(guidance.trim()) || guidance.includes("?");
    // tenta detectar 3 ações por marcadores ou por "1) 2) 3)" etc
    const bullets = guidance.match(/(^|\n)\s*[-•]\s+/g)?.length || 0;
    const numbered = guidance.match(/(^|\n)\s*\d+\s*[\)\.]\s+/g)?.length || 0;
    return (bullets >= 3 || numbered >= 3) && hasQuestion;
}

function looksGenericText(txt) {
    if (!isNonEmptyString(txt)) return true;
    const t = txt.toLowerCase();
    const banned = [
        "pode indicar",
        "talvez",
        "em geral",
        "geralmente",
        "isso simboliza",
        "isso representa",
        "isso reflete"
    ];
    return banned.some(b => t.includes(b));
}

function normalizeInterpretationResult(result, language) {
    if (!result || typeof result !== "object") return result;

    if (!result.language) result.language = language;
    if (!result.dreamTitle) result.dreamTitle = "Sonho sem título";
    if (!result.interpretationMain) result.interpretationMain = "";
    if (!result.advice) result.advice = "";

    result.symbols = ensureArray(result.symbols);
    result.emotions = ensureArray(result.emotions);
    result.lifeAreas = ensureArray(result.lifeAreas);
    result.tags = ensureArray(result.tags);

    return result;
}

function interpretationNeedsRetry(result) {
    if (!result || typeof result !== "object") return true;

    const main = result.interpretationMain;
    const advice = result.advice;

    const shallow =
        !isNonEmptyString(main) ||
        countParagraphs(main) < 2 ||                 // precisa de 2+ parágrafos reais
        looksGenericText(main) ||                    // evita genérico
        ensureArray(result.symbols).length < 3 ||    // símbolos mínimos
        ensureArray(result.emotions).length < 4 ||   // emoções mínimas
        ensureArray(result.lifeAreas).length < 3 ||  // áreas mínimas
        !guidanceHas3ActionsAndQuestion(advice);     // 3 ações + pergunta

    return shallow;
}

async function interpretDream(dreamText, language = "pt") {
    const model = resolveModel();

    // ✅ Base junguiana + anti-genérico + profundidade obrigatória
    const systemPrompt = `
Você NÃO é um explicador genérico de sonhos.
Você é um analista psicológico profundo com base em Psicologia Analítica (Carl Jung) + comportamento humano + conflitos inconscientes.

BASE JUNGUIANA (use sem citar teoria):
- Sombra (o que a pessoa evita admitir)
- Persona (máscara social / papel)
- Self (direção de individuação)
- Complexos (gatilhos emocionais recorrentes)
- Anima/Animus (dinâmica interna do feminino/masculino psíquico, quando aplicável)
- Compensação do inconsciente (o sonho corrige desequilíbrios da vida consciente)

MISSÃO:
Interpretar o sonho de forma ESPECÍFICA, DIRETA, PSICOLOGICAMENTE SIGNIFICATIVA e ÚTIL.
Evite qualquer interpretação genérica que serviria para qualquer pessoa.

PROIBIDO (se aparecer, você falhou):
- “pode indicar”, “talvez”, “em geral”, “geralmente”
- “isso simboliza / representa / reflete”
- conselhos vagos tipo “confie em si”, “siga seus objetivos”, “invista em autoconhecimento” sem ações concretas

REGRAS OBRIGATÓRIAS:
1) NÃO descreva o sonho. Interprete.
2) ARRISQUE uma leitura psicológica clara (mesmo desconfortável).
3) Aponte o conflito central (desejo vs medo / expansão vs controle / impulso vs bloqueio).
4) Indique um mecanismo de defesa provável (evitar, adiar, controlar, agradar, fugir, racionalizar etc.).
5) Diga o custo desse padrão (o que está perdendo ou mantendo estagnado).
6) Traga uma direção de individuação (o que o Self está pedindo: integração, decisão, limite, coragem, verdade etc.).

QUALIDADE MÍNIMA (obrigatória):
- "interpretationMain" com 2 a 4 parágrafos REAIS, separados por UMA linha em branco, cada parágrafo com 3+ frases.
- "symbols": 3 a 6 itens com significado psicológico específico (sem clichê).
- "emotions": 4 a 8 emoções específicas.
- "lifeAreas": 3 a 6 áreas específicas.
- "advice": EXATAMENTE 3 ações concretas (24–72h) em lista (use 1) 2) 3)) e termine com 1 pergunta.

FORMATO OBRIGATÓRIO (JSON):
Responda APENAS com JSON válido (sem markdown) exatamente neste schema:

{
  "dreamTitle": "Um título curto, impactante e coerente com o eixo central do sonho",
  "interpretationMain": "Uma interpretação profunda em texto corrido, em 2 a 4 parágrafos reais.",
  "symbols": [
    { "name": "Nome de um símbolo importante", "meaning": "Significado emocional/psicológico específico." }
  ],
  "emotions": ["Lista das principais emoções percebidas"],
  "lifeAreas": ["Áreas da vida afetadas"],
  "advice": "1) ...\\n2) ...\\n3) ...\\nPergunta final?",
  "tags": ["palavras-chave"],
  "language": "${language}"
}

IMPORTANTE:
Responda no idioma: ${language}
`.trim();

    const userPrompt = `Sonho: ${dreamText}\nIdioma da resposta: ${language}`;

    try {
        // 1) Primeira tentativa
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.75
        });

        const content = response.choices[0].message.content;
        let result = normalizeInterpretationResult(safeJsonParse(content), language);

        // 2) Se vier raso/genérico, faz 1 retry controlado
        if (interpretationNeedsRetry(result)) {
            console.warn("[Backend] interpretDream veio raso/genérico. Executando 1 retry de correção de qualidade...");

            const repairPrompt = `
Você retornou um JSON que não atende aos requisitos. Corrija e retorne APENAS JSON VÁLIDO.
Requisitos obrigatórios:
- interpretationMain com 2 a 4 parágrafos REAIS (linha em branco entre parágrafos), 3+ frases por parágrafo
- symbols 3–6 itens
- emotions 4–8 itens
- lifeAreas 3–6 itens
- advice com EXATAMENTE:
  1) ação concreta (24–72h)
  2) ação concreta (24–72h)
  3) ação concreta (24–72h)
  e terminar com uma pergunta
Proibido usar: "pode indicar", "talvez", "em geral", "geralmente", "isso simboliza", "isso representa", "isso reflete".
Idioma: ${language}
`.trim();

            const response2 = await openaiClient.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                    { role: "assistant", content: JSON.stringify(result || {}) },
                    { role: "user", content: repairPrompt }
                ],
                temperature: 0.65
            });

            const content2 = response2.choices[0].message.content;
            result = normalizeInterpretationResult(safeJsonParse(content2), language);
        }

        return result;

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
Você é um analista especializado em Shadow Work, Psicologia Analítica (Jung) e padrões inconscientes de comportamento.

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
Responda estritamente no idioma: ${language}`.trim()
                },
                {
                    role: "user",
                    content: `
DADOS DE ENTRADA:
SONHO: ${dreamText}
INTERPRETAÇÃO INICIAL: ${JSON.stringify(initialInterpretation)}
RESPOSTAS DO USUÁRIO: ${JSON.stringify(userAnswers, null, 2)}
IDIOMA SOLICITADO: ${language}`.trim()
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

        const systemPrompt = `
Você é um Analista Arquetípico Sênior + terapeuta de elite (clínico, direto, profundo, útil).
Sua missão é analisar o histórico de sonhos e identificar a "Fase de Vida" / "Arco de Jornada" atual do usuário.

REGRAS DE PROFUNDIDADE (não negociáveis):
1) Seja específico e baseado em evidências do histórico (emoções recorrentes, temas, tensão central). Não use frases genéricas.
2) "description" precisa ter 2 a 4 parágrafos REAIS (separados por linha em branco), cada parágrafo com pelo menos 3 linhas.
3) Traga o eixo do conflito: desejo vs medo, impulso vs bloqueio, necessidade vs padrão.
4) Mostre o risco (sombra) e o potencial (força) desta fase.
5) "guidance" deve conter:
   - 3 ações concretas (24–72h) em lista (marcadores ou 1) 2) 3))
   - e terminar com 1 pergunta de reflexão.
6) Não devolva campos vazios.

RETORNE APENAS JSON VÁLIDO (sem markdown) com EXATAMENTE este schema:
{
  "phaseTitle": "Título impactante da fase atual",
  "phaseName": "Nome curto da fase (pode repetir phaseTitle se necessário)",
  "archetype": "Arquétipo dominante (ex.: O Explorador, O Mago, O Órfão)",
  "description": "Texto profundo em 2 a 4 parágrafos...",
  "keyChallenges": ["3 a 6 desafios internos (curtos e específicos)"],
  "strengths": ["3 a 6 forças/potenciais do momento (curtos e específicos)"],
  "guidance": "Orientação prática com 3 ações (24–72h) + 1 pergunta no final.",
  "tags": ["6 a 10 tags curtas"],
  "language": "${language}"
}

IMPORTANTE:
Responda estritamente no idioma: ${language}`.trim();

        const userPrompt = `HISTÓRICO DE SONHOS (resumo):\n${JSON.stringify(dreamSummary, null, 2)}\n\nIDIOMA: ${language}`;

        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7
        });

        const content = response.choices[0].message.content;
        let result = safeJsonParse(content);

        // ✅ Normalização + compatibilidade (sem quebrar o que já funciona)
        if (result && typeof result === "object") {
            if (!result.language) result.language = language;

            if (!result.phaseName && result.phaseTitle) result.phaseName = result.phaseTitle;

            if (!result.phaseTitle) result.phaseTitle = "Fase Atual";
            if (!result.archetype) result.archetype = "Arquétipo em Integração";

            // Converte formatos errados em arrays
            result.keyChallenges = ensureArray(result.keyChallenges);
            result.strengths = ensureArray(result.strengths);
            result.tags = ensureArray(result.tags);

            // Fallbacks de texto
            if (!isNonEmptyString(result.description)) {
                if (isNonEmptyString(result.summary)) result.description = result.summary;
            }
            if (!isNonEmptyString(result.guidance)) {
                if (isNonEmptyString(result.advice)) result.guidance = result.advice;
            }

            // Aliases antigos
            if (!result.summary && isNonEmptyString(result.description)) result.summary = result.description;
            if (!result.advice && isNonEmptyString(result.guidance)) result.advice = result.guidance;

            if (!result.mainChallenge) {
                if (result.keyChallenges.length > 0) result.mainChallenge = result.keyChallenges[0];
                else result.mainChallenge = "Desafio central em integração (veja description).";
            }
        }

        // ✅ Validação de profundidade: se vier raso, 1 retry controlado pedindo correção
        const needsRetry =
            !result ||
            !isNonEmptyString(result.description) ||
            countParagraphs(result.description) < 2 ||
            !guidanceHas3ActionsAndQuestion(result.guidance);

        if (needsRetry) {
            console.warn("[Backend] GlobalAnalysis veio raso/incompleto. Executando 1 retry de correção de schema...");

            const repairPrompt = `
Você retornou um JSON que não atende aos requisitos. Corrija e retorne APENAS JSON VÁLIDO.
Requisitos obrigatórios:
- description com 2 a 4 parágrafos (separados por linha em branco)
- guidance com 3 ações concretas (24–72h) em lista + terminar com 1 pergunta
- keyChallenges 3–6 itens, strengths 3–6 itens, tags 6–10 itens
Use o mesmo schema.
Idioma: ${language}
`.trim();

            const response2 = await openaiClient.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                    { role: "assistant", content: JSON.stringify(result || {}) },
                    { role: "user", content: repairPrompt }
                ],
                temperature: 0.6
            });

            const content2 = response2.choices[0].message.content;
            const repaired = safeJsonParse(content2);

            if (repaired && typeof repaired === "object") {
                result = repaired;

                // Normaliza novamente
                if (!result.language) result.language = language;
                if (!result.phaseName && result.phaseTitle) result.phaseName = result.phaseTitle;

                if (!result.phaseTitle) result.phaseTitle = "Fase Atual";
                if (!result.archetype) result.archetype = "Arquétipo em Integração";

                result.keyChallenges = ensureArray(result.keyChallenges);
                result.strengths = ensureArray(result.strengths);
                result.tags = ensureArray(result.tags);

                if (!isNonEmptyString(result.description) && isNonEmptyString(result.summary)) result.description = result.summary;
                if (!isNonEmptyString(result.guidance) && isNonEmptyString(result.advice)) result.guidance = result.advice;

                if (!result.summary && isNonEmptyString(result.description)) result.summary = result.description;
                if (!result.advice && isNonEmptyString(result.guidance)) result.advice = result.guidance;

                if (!result.mainChallenge) {
                    if (result.keyChallenges.length > 0) result.mainChallenge = result.keyChallenges[0];
                    else result.mainChallenge = "Desafio central em integração (veja description).";
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
