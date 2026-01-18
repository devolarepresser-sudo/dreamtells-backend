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
        console.error("[Backend] Falha no parsing do JSON:", e);
        throw e;
    }
}

function ensureArray(v) {
    return Array.isArray(v) ? v : [];
}

function ensureMinArrays(result) {
    if (!result || typeof result !== "object") return result;
    result.symbols = ensureArray(result.symbols);
    result.emotions = ensureArray(result.emotions);
    result.lifeAreas = ensureArray(result.lifeAreas);
    result.tags = ensureArray(result.tags);
    return result;
}

async function interpretDream(dreamText, language = "pt") {
    const model = resolveModel();
    const systemPrompt = `Você é o interpretador oficial do DreamTells. Produza uma interpretação profunda (D.D.I.P.).
    Retorne JSON: {
      "dreamTitle": "...",
      "interpretationMain": "...",
      "symbols": [{"name":"", "meaning":""}],
      "emotions": [],
      "lifeAreas": [],
      "advice": "...",
      "tags": [],
      "language": "${language}"
    }`;

    const userPrompt = `Sonho: ${dreamText}`;

    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.8
        });
        const content = response.choices[0].message.content;
        return ensureMinArrays(safeJsonParse(content));
    } catch (error) {
        console.error("Erro interpretDream:", error);
        throw error;
    }
}

async function generateDeepQuestions(dreamText, language = "pt") {
    const model = resolveModel();
    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: `Gere 6 perguntas profundas. Idioma: ${language}` },
                { role: "user", content: dreamText }
            ],
            temperature: 0.7
        });
        const json = safeJsonParse(response.choices[0].message.content);
        return json.questions || [];
    } catch (error) {
        return ["Como você se sentiu?"];
    }
}

async function generateDeepAnalysis(dreamText, initialInterpretation, userAnswers, language = "pt") {
    const model = resolveModel();
    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: `Análise profunda Shadow Work. Idioma: ${language}` },
                { role: "user", content: JSON.stringify({ dreamText, initialInterpretation, userAnswers }) }
            ],
            temperature: 0.7
        });
        return safeJsonParse(response.choices[0].message.content);
    } catch (error) {
        throw error;
    }
}

async function generateGlobalAnalysis(dreams, language = "pt") {
    const model = resolveModel();
    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: `Análise de Fase de Vida (Global). Idioma: ${language}` },
                { role: "user", content: JSON.stringify(dreams) }
            ],
            temperature: 0.7
        });
        return safeJsonParse(response.choices[0].message.content);
    } catch (error) {
        throw error;
    }
}

module.exports = { interpretDream, generateDeepQuestions, generateDeepAnalysis, generateGlobalAnalysis };
