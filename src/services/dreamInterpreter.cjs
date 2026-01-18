// src/services/dreamInterpreter.cjs
const { openaiClient } = require("./openaiClient.cjs");

function resolveModel() {
    const raw = process.env.OPENAI_MODEL;
    const model = raw ? String(raw).trim() : "gpt-4o";
    return model || "gpt-4o";
}

function safeJsonParse(raw) {
    if (!raw || typeof raw !== "string") return raw;
    try {
        // Limpeza agressiva
        let s = raw.trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/```$/i, "")
            .trim();

        // Tenta encontrar o primeiro { e o último }
        const firstBrace = s.indexOf("{");
        const lastBrace = s.lastIndexOf("}");

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            s = s.slice(firstBrace, lastBrace + 1);
        }

        return JSON.parse(s);
    } catch (e) {
        console.error("[Backend] Falha grave no parsing do JSON:", e);
        console.error("[Backend] Conteúdo bruto recebido:", raw);
        // Fallback: se não for JSON, tenta transformar o texto em um objeto básico
        if (raw.length > 50) {
            return {
                dreamTitle: "Sonho",
                interpretationMain: raw,
                advice: "Tente refletir sobre esses pontos."
            };
        }
        throw new Error(`Resposta inválida da IA: ${e.message}`);
    }
}

function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
}

function ensureArray(v) {
    return Array.isArray(v) ? v : [];
}

function countParagraphs(text) {
    if (!isNonEmptyString(text)) return 0;
    return text.split(/\n\s*\n/g).map(s => s.trim()).filter(Boolean).length;
}

function ensureMinArrays(result) {
    if (!result || typeof result !== "object") return result;
    result.symbols = ensureArray(result.symbols);
    result.emotions = ensureArray(result.emotions);
    result.lifeAreas = ensureArray(result.lifeAreas);
    result.tags = ensureArray(result.tags);
    return result;
}

function looksGenericOrThin(text) {
    if (!isNonEmptyString(text)) return true;
    const t = text.toLowerCase();
    if (t.length < 360) return true;
    const genericHits = ["este sonho sugere", "este sonho indica", "pode indicar", "talvez", "em geral", "simboliza"];
    const hits = genericHits.reduce((acc, g) => (t.includes(g) ? acc + 1 : acc), 0);
    return hits >= 5;
}

function adviceHas3ActionsAndQuestion(advice) {
    if (!isNonEmptyString(advice)) return false;
    const hasQuestion = advice.includes("?");
    const bullets = advice.match(/(^|\n)\s*[-•]\s+/g)?.length || 0;
    const numbered = advice.match(/(^|\n)\s*\d+\s*[\)\.]\s+/g)?.length || 0;
    return (bullets >= 3 || numbered >= 3) && hasQuestion;
}

function guidanceHas3ActionsAndQuestion(guidance) {
    return adviceHas3ActionsAndQuestion(guidance);
}

function meetsInterpretationQuality(result) {
    if (!result || typeof result !== "object") return false;
    const interpretationMain = result.interpretationMain;
    const advice = result.advice;
    const paragraphsOk = countParagraphs(interpretationMain) >= 2;
    const adviceOk = adviceHas3ActionsAndQuestion(advice);
    const contentOk = !looksGenericOrThin(interpretationMain);
    const arraysOk = ensureArray(result.symbols).length >= 3 && ensureArray(result.emotions).length >= 4;
    return paragraphsOk && adviceOk && contentOk && arraysOk;
}

function enforceParagraphBreaksSoft(text) {
    if (!isNonEmptyString(text)) return text;
    if (countParagraphs(text) >= 2) return text;
    const t = text.trim();
    const sentences = t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    if (sentences.length < 6) return t;
    const third = Math.ceil(sentences.length / 3);
    const p1 = sentences.slice(0, third).join(" ");
    const p2 = sentences.slice(third, third * 2).join(" ");
    const p3 = sentences.slice(third * 2).join(" ");
    return `${p1}\n\n${p2}\n\n${p3}`.trim();
}

// 1. Interpretação Principal
async function interpretDream(dreamText, language = "pt") {
    const model = resolveModel();
    const systemPrompt = `Você é uma equipe clínica de interpretação de sonhos (terapeuta sênior), com base em Psicologia Analítica (Jung) e Psicodinâmica contemporânea.
MISSÃO: Gerar uma interpretação profunda (D.D.I.P.), tratando o sonho como material do inconsciente.
REGRAS: 1 hipótese central + 1 alternativa, nomeie uma defesa psicológica, conecte símbolos à tensão.
FORMATO JSON (OBRIGATÓRIO): {
  "dreamTitle": "...",
  "interpretationMain": "2-3 parágrafos profundos (mínimo 900 caracteres)",
  "symbols": [{"name":"", "meaning":""}],
  "emotions": [],
  "lifeAreas": [],
  "advice": "3 ações em lista + 1 pergunta + frase DreamTells",
  "tags": [],
  "language": "${language}"
}
Responda em: ${language}`;

    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: dreamText }],
            temperature: 0.82,
            response_format: { type: "json_object" }
        });
        let result = ensureMinArrays(safeJsonParse(response.choices[0].message.content));

        if (!meetsInterpretationQuality(result)) {
            const repairPrompt = `Refaça com mais PROFUNDIDADE. Garanta 2-3 parágrafos reais (mínimo 900 chars) e 3 ações práticas em lista. Retorne APENAS JSON.`;
            const response2 = await openaiClient.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: dreamText },
                    { role: "assistant", content: JSON.stringify(result) },
                    { role: "user", content: repairPrompt }
                ],
                temperature: 0.68,
                response_format: { type: "json_object" }
            });
            result = ensureMinArrays(safeJsonParse(response2.choices[0].message.content));
        }

        if (isNonEmptyString(result.interpretationMain)) {
            result.interpretationMain = enforceParagraphBreaksSoft(result.interpretationMain);
        }
        return result;
    } catch (error) {
        throw error;
    }
}

// 2. Perguntas Iniciais
async function generateDeepQuestions(dreamText, language = "pt") {
    const model = resolveModel();
    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: `Você é um terapeuta junguiano. Gere exatamente 6 perguntas profundas de autoconhecimento. Retorne APENAS JSON: { "questions": ["...", "..."] }. Idioma: ${language}`
                },
                { role: "user", content: dreamText }
            ],
            response_format: { type: "json_object" }
        });
        const json = safeJsonParse(response.choices[0].message.content);
        return json.questions || [];
    } catch (e) { return ["Como você se sente com esse sonho?"]; }
}

// 3. ANÁLISE PROFUNDA (FIX: Restoring Robust Prompt and JSON structure)
async function generateDeepAnalysis(dreamText, initialInterpretation, userAnswers, language = "pt") {
    const model = resolveModel();
    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: `Você é um analista especializado em Shadow Work e Psicologia Analítica.
MISSÃO: Produzir uma análise profunda que vá ALÉM da interpretação inicial, integrando sonho, interpretação inicial e respostas do usuário.
REGRAS CRÍTICAS: NÃO repita a interpretação. NÃO suavize conflitos. Seja específico e confrontativo.
ESTRUTURA OBRIGATÓRIA (JSON apenas):
{
  "deepInsights": [
    { "title": "Nome do insight", "content": "Texto profundo em markdown." }
  ],
  "patterns": ["Padrão identificado"],
  "finalIntegration": "Síntese prática consciente."
}
Idioma: ${language}`
                },
                {
                    role: "user",
                    content: JSON.stringify({ dreamText, initialInterpretation, userAnswers })
                }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" }
        });
        const content = response.choices[0].message.content;
        return safeJsonParse(content);
    } catch (e) {
        console.error("Erro generateDeepAnalysis:", e);
        throw e;
    }
}

// 4. ANÁLISE GLOBAL (FIX: Restoring Robust Prompt)
async function generateGlobalAnalysis(dreams, language = "pt") {
    const model = resolveModel();
    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: `Você é um Analista Arquetípico Sênior. Sua missão é identificar a "Fase de Vida" do usuário baseada no histórico de sonhos.
ESTRUTURA JSON (OBRIGATÓRIO):
{
  "phaseTitle": "Título impactante",
  "phaseName": "Nome da fase",
  "archetype": "Arquétipo",
  "description": "Análise densa de 2-4 parágrafos.",
  "keyChallenges": [],
  "strengths": [],
  "guidance": "3 ações + 1 pergunta.",
  "tags": [],
  "language": "${language}"
}
Idioma: ${language}`
                },
                { role: "user", content: JSON.stringify(dreams) }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" }
        });
        let result = safeJsonParse(response.choices[0].message.content);

        // Normalização mínima
        if (result && typeof result === "object") {
            if (!result.phaseName && result.phaseTitle) result.phaseName = result.phaseTitle;
            result.keyChallenges = ensureArray(result.keyChallenges);
            result.strengths = ensureArray(result.strengths);
            result.tags = ensureArray(result.tags);
        }

        return result;
    } catch (e) {
        console.error("Erro generateGlobalAnalysis:", e);
        throw e;
    }
}

// 5. ANÁLISE DE SÍMBOLO
async function analyzeSymbol(symbol, userId, language = "pt") {
    const model = resolveModel();
    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: `Você é um dicionário de símbolos psicológicos. Explique o símbolo de forma profunda. Idioma: ${language}` },
                { role: "user", content: `Símbolo: ${symbol}` }
            ]
        });
        return response.choices[0].message.content.trim();
    } catch (e) {
        return `O símbolo "${symbol}" representa processos de transformação do inconsciente.`;
    }
}

// 6. ORÁCULO DIÁRIO (Mensagem do Dia Profunda)
async function generateDailyOracle(language = "pt") {
    const model = resolveModel();
    const systemPrompt = `Você é um Terapeuta Junguiano e Analista Arquetípico Sênior.
MISSÃO: Gerar uma "Semente de Sabedoria" para o dia que seja clinicamente útil e transformadora.
QUALIDADE: Evite clichês gratuitos. O texto deve soar como uma intervenção terapêutica real.

DIRETRIZES PARA O CONTEÚDO (Obrigatório):
1. POR QUE: Explique a mecânica psicológica ou o padrão arquetípico por trás do insight.
2. COMO: Dê uma direção clara e prática de como aplicar isso hoje.
3. RESULTADO: Diga o que acontece se o usuário fizer isso (ganho de clareza, força ou integração).

ESTRUTURA JSON (OBRIGATÓRIO):
{
  "title": "Título Oracular",
  "reflection": "A interpretação psicológica do tema do dia (mínimo 450 caracteres).",
  "practice": "A instrução específica de 'como' e 'quando' agir hoje.",
  "archetype": "Arquétipo regente do dia"
}
Idioma: ${language}`;

    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [{ role: "system", content: systemPrompt }],
            temperature: 0.85,
            response_format: { type: "json_object" }
        });
        return safeJsonParse(response.choices[0].message.content);
    } catch (e) {
        console.error("Erro generateDailyOracle:", e);
        return {
            title: "O Silêncio Fecundo",
            reflection: "Às vezes, o crescimento ocorre no escuro, antes que qualquer broto rompa a superfície. Honre a pausa.",
            practice: "Observe um momento de silêncio antes de falar pela primeira vez hoje.",
            archetype: "O Eremita"
        };
    }
}

module.exports = { interpretDream, generateDeepQuestions, generateDeepAnalysis, generateGlobalAnalysis, analyzeSymbol, generateDailyOracle };
