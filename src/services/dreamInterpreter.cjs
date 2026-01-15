
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

async function interpretDream(dreamText, language = "pt") {
    const model = resolveModel();

    // =========================
    // Prompt MAIS PROFUNDO (sem mudar schema)
    // =========================
    const systemPrompt = `
Você NÃO é um explicador genérico de sonhos.
Você é um analista psicológico profundo, com base em psicologia simbólica, comportamento humano, conflitos inconscientes e padrões repetitivos.

MISSÃO:
Interpretar o sonho de forma ESPECÍFICA, DIRETA, PSICOLOGICAMENTE SIGNIFICATIVA e ÚTIL para mudança real.
Evite interpretações genéricas que poderiam servir para qualquer pessoa.

REGRAS OBRIGATÓRIAS (não quebre):
1) NÃO recontar o sonho. Interprete.
2) NÃO usar linguagem vaga: "pode indicar", "talvez", "em geral", "normalmente".
3) NÃO ser só positivo/fofo. Se houver conflito, mostre o conflito.
4) NÃO teoria/jargão. Nada de aula.
5) ARRISQUE uma leitura clara: tensão interna, necessidade real, defesa emocional, decisão evitada.
6) Seja específico: decisões evitadas, medo principal, desejo principal, padrão repetido.

PROFUNDIDADE MÍNIMA:
- interpretationMain deve ter pelo menos 2 parágrafos (separados por linha em branco).
- Primeiro parágrafo: eixo do conflito (desejo vs medo / impulso vs bloqueio) + o que isso denuncia no agora.
- Segundo parágrafo: padrão emocional + o que a pessoa faz para evitar sentir/agir + consequência disso.
- Symbols: 3 a 6 símbolos (não 1 só), com significado psicológico específico.
- Emotions: 4 a 8 emoções específicas.
- LifeAreas: 3 a 6 áreas (ex.: trabalho, relacionamentos, identidade, propósito, corpo, finanças).
- Advice: 3 ações concretas (24–72h) em lista + terminar com 1 pergunta de reflexão.

ESTRUTURA OBRIGATÓRIA DA RESPOSTA (JSON):
Responda APENAS com JSON válido (sem markdown).

{
  "dreamTitle": "Um título curto, impactante e coerente com o eixo central do sonho",
  "interpretationMain": "Interpretação profunda em texto corrido com 2+ parágrafos (linha em branco entre eles).",
  "symbols": [
    { "name": "Símbolo", "meaning": "Significado emocional/psicológico específico." }
  ],
  "emotions": ["..."],
  "lifeAreas": ["..."],
  "advice": "Inclua 3 ações concretas (24–72h) em lista + termine com uma pergunta.",
  "tags": ["..."],
  "language": "${language}"
}

IMPORTANTE:
Responda no idioma: ${language}
`.trim();

    const userPrompt = `Sonho: ${dreamText}\n\nIdioma da resposta: ${language}`;

    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7
        });

        let result = safeJsonParse(response.choices[0].message.content);

        // ========= Normalização sem quebrar =========
        if (result && typeof result === "object") {
            if (!result.language) result.language = language;

            if (!Array.isArray(result.symbols)) result.symbols = [];
            if (!Array.isArray(result.emotions)) result.emotions = [];
            if (!Array.isArray(result.lifeAreas)) result.lifeAreas = [];
            if (!Array.isArray(result.tags)) result.tags = [];

            if (!result.dreamTitle) result.dreamTitle = "Sonho sem título";
            if (!result.interpretationMain) result.interpretationMain = "";
            if (!result.advice) result.advice = "";
        }

        // ========= Validação de profundidade =========
        const paragraphs =
            (typeof result?.interpretationMain === "string" && result.interpretationMain.trim())
                ? result.interpretationMain.split(/\n\s*\n/g).map(s => s.trim()).filter(Boolean).length
                : 0;

        const has3Actions =
            typeof result?.advice === "string" &&
            ((result.advice.match(/(^|\n)\s*[-•]\s+/g)?.length || 0) >= 3 ||
             (result.advice.match(/(^|\n)\s*\d+\s*[\)\.]\s+/g)?.length || 0) >= 3) &&
            result.advice.includes("?");

        const tooShallow =
            !result ||
            paragraphs < 2 ||
            result.symbols.length < 3 ||
            result.emotions.length < 4 ||
            result.lifeAreas.length < 3 ||
            !has3Actions;

        // ========= 1 retry controlado se vier raso =========
        if (tooShallow) {
            console.warn("[Backend] interpretDream veio raso/incompleto. Executando 1 retry de correção...");

            const repairPrompt = `
Seu JSON veio raso/incompleto. Refaça mantendo o MESMO schema.
Obrigatório:
- interpretationMain com 2+ parágrafos (linha em branco)
- symbols 3–6 itens
- emotions 4–8 itens
- lifeAreas 3–6 itens
- advice com 3 ações (24–72h) em lista + terminar com pergunta
Sem frases genéricas.
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

            const repaired = safeJsonParse(response2.choices[0].message.content);
            if (repaired && typeof repaired === "object") {
                result = repaired;

                // normaliza de novo (sem quebrar)
                if (!result.language) result.language = language;
                if (!Array.isArray(result.symbols)) result.symbols = [];
                if (!Array.isArray(result.emotions)) result.emotions = [];
                if (!Array.isArray(result.lifeAreas)) result.lifeAreas = [];
                if (!Array.isArray(result.tags)) result.tags = [];
                if (!result.dreamTitle) result.dreamTitle = "Sonho sem título";
                if (!result.interpretationMain) result.interpretationMain = "";
                if (!result.advice) result.advice = "";
            }
        }

        return result;

    } catch (error) {
        console.error("Erro ao interpretar sonho:", error);
        return { error: error.message };
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
