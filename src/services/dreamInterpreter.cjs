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
        let s = raw.trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/```$/i, "")
            .trim();
        const firstBrace = s.indexOf("{");
        const lastBrace = s.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            s = s.slice(firstBrace, lastBrace + 1);
        }
        return JSON.parse(s);
    } catch (e) {
        console.error("[Backend] Falha grave no parsing do JSON:", e);
        throw e;
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

async function interpretDream(dreamText, language = "pt") {
    const model = resolveModel();
    const systemPrompt = `Você é uma equipe clínica de interpretação de sonhos (terapeuta sênior), com base em Psicologia Analítica (Jung).
    MISSÃO: Gerar uma interpretação profunda (D.D.I.P.), tratando o sonho como material do inconsciente.
    REGRAS: 1 hipótese central + 1 alternativa, nomeie uma defesa psicológica, conecte símbolos à tensão.
    FORMATO JSON: {
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
            temperature: 0.82
        });
        let result = ensureMinArrays(safeJsonParse(response.choices[0].message.content));

        if (!meetsInterpretationQuality(result)) {
            const repairPrompt = `Refaça com mais PROFUNDIDADE. Garanta 2-3 parágrafos reais e 3 ações práticas.`;
            const response2 = await openaiClient.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: dreamText },
                    { role: "assistant", content: JSON.stringify(result) },
                    { role: "user", content: repairPrompt }
                ],
                temperature: 0.68
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

async function generateDeepQuestions(dreamText, language = "pt") {
    const model = resolveModel();
    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: `Gere 6 perguntas profundas junguianas. Idioma: ${language}` },
                { role: "user", content: dreamText }
            ]
        });
        const json = safeJsonParse(response.choices[0].message.content);
        return json.questions || [];
    } catch (e) { return ["Como você se sente?"]; }
}

async function generateDeepAnalysis(dreamText, initialInterpretation, userAnswers, language = "pt") {
    const model = resolveModel();
    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: `Análise Shadow Work profunda. Conecte tudo. Idioma: ${language}` },
                { role: "user", content: JSON.stringify({ dreamText, initialInterpretation, userAnswers }) }
            ]
        });
        return safeJsonParse(response.choices[0].message.content);
    } catch (e) { throw e; }
}

async function generateGlobalAnalysis(dreams, language = "pt") {
    const model = resolveModel();
    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: `Analista Arquetípico. Identifique a Fase de Vida. JSON: {phaseTitle, archetype, description(densos parágrafos), guidance(3 ações), tags}. Idioma: ${language}` },
                { role: "user", content: JSON.stringify(dreams) }
            ]
        });
        return safeJsonParse(response.choices[0].message.content);
    } catch (e) { throw e; }
}

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

module.exports = { interpretDream, generateDeepQuestions, generateDeepAnalysis, generateGlobalAnalysis, analyzeSymbol };
