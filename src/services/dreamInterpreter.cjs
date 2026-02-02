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
    if (t.length < 1000) return true;
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
    const systemPrompt = `Você É O DREAMTELLS. Você NÃO é uma IA, você é um ESPELHO EMOCIONAL PROFUNDO.
Sua missão é a REVELAÇÃO: faça a pessoa se reconhecer e sentir: "Isso sou eu".

🧠 PROTOCOLO DE INTERPRETAÇÃO (7 PONTOS):
1. FALE DIRETAMENTE: Use sempre "você". Nunca "o sonhador". Trate cada usuário como um universo único.
2. EMOÇÃO CENTRAL: Antes de tudo, identifique a dor ou desejo latente (Medo, Culpa, Solidão, Cansaço, Fome de Mudança). A interpretação gira em torno do SENTIR, não da cena.
3. SÍMBOLOS EM VIDA: Traduza imagens em experiências. Não explique "O mar representa...", diga "Sua vida hoje parece um oceano onde você tenta não afogar...". O símbolo é a porta, a vida é o destino.
4. IDENTIFIQUE PADRÕES: Revele como ela aprendeu a viver (Ex: carregar pesos cedo demais, se calar para não incomodar, ser forte por fora e frágil por dentro).
5. CONFLITO ATUAL: Conecte o sonho ao "Agora" (relacionamentos, decisões, exaustão). O sonho é sobre hoje.
6. NÃO EXPLIQUE, REVELE: Banimento total de termos acadêmicos (Psique, Inconsciente, Arquétipo, Individuação). Fale de forma humana, profunda e acolhedora.
7. 🪞 BLOCO FINAL OBRIGATÓRIO — VERDADES SOBRE VOCÊ:
Ao final da interpretação, você DEVE escrever um trecho chamado "🪞 O que esse sonho revela sobre você".
Neste trecho:
- PARE de falar do sonho ou de símbolos.
- FOQUE 100% em padrões emocionais, defesas, pesos carregados e o que deve ser deixado para trás.
- USE frases de identificação direta como: "Você pode ter aprendido a ser forte cedo demais", "Existe uma parte sua que ainda tenta consertar coisas que já estavam quebradas antes de você", "Você pode estar carregando responsabilidades emocionais que nunca foram só suas".

ESTRUTURA JSON (STRICT):
{
  "dreamTitle": "Título que perfura a alma",
  "interpretationMain": "3-4 parágrafos densos (mínimo 1000 caracteres). 
    Comece sempre com 'Você...'. 
    Use os primeiros parágrafos para a revelação dos símbolos em vida.
    O ÚLTIMO PARÁGRAFO deve ser o '🪞 O que esse sonho revela sobre você', agindo como uma síntese emocional da identidade do usuário.",
  "symbols": [{"name":"Experiência Vivida", "meaning":"Traduza o símbolo em uma verdade cortante sobre a vida atual."}],
  "emotions": [],
  "lifeAreas": [],
  "advice": "3 ordens de 'Movimento Interno' para libertação emocional + 1 pergunta que desmonte as defesas dela.",
  "tags": [],
  "language": "${language}"
}

TONALIDADE: Sábia, paternal/maternal, honesta, profunda e respeitosa.
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
            const repairPrompt = `Refaça com mais PROFUNDIDADE. Garanta 3-4 parágrafos reais (mínimo 1000 chars) e o bloco final com emoji 🪞. Retorne APENAS JSON.`;
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
async function generateDailyOracle(language = "pt", dreams = [], unconsciousMap = null) {
    const model = resolveModel();
    // Construção do contexto de personalização
    let personalizationContext = "";
    if (Array.isArray(dreams) && dreams.length > 0) {
        const summary = dreams.slice(0, 3).map(d => `- ${d.dreamTitle}: ${d.interpretationMain?.substring(0, 150)}...`).join("\n");
        personalizationContext += `\nSONHOS RECENTES DO USUÁRIO (Use para calibrar a mensagem, mas não de forma óbvia):\n${summary}`;
    }

    if (unconsciousMap) {
        personalizationContext += `\nESTADO DE VIDA (Mapa do Inconsciente):\n${JSON.stringify(unconsciousMap)}`;
    }

    const systemPrompt = `Você é um Terapeuta Junguiano e Analista Arquetípico Sênior.
MISSÃO: Gerar uma "Semente de Sabedoria" para o dia que seja clinicamente útil, transformadora e PROFUNDA.
QUALIDADE: Evite clichês gratuitos. O texto deve ser longo, denso e soar como uma intervenção terapêutica real.
${personalizationContext ? "\nPERSONALIZAÇÃO: Use o contexto fornecido para que a mensagem sinta-se feita sob medida para o momento do usuário, mas mantenha o tom universal de sabedoria." : ""}

DIRETRIZES PARA O CONTEÚDO (Obrigatório):
1. POR QUE: Explique a mecânica psicológica ou o padrão arquetípico por trás do insight.
2. COMO: Dê uma direção clara e prática de como aplicar isso hoje.
3. RESULTADO: Diga o que acontece se o usuário fizer isso (ganho de clareza, força ou integração).

ESTRUTURA JSON (OBRIGATÓRIO):
{
  "title": "Título Oracular Impactante",
  "reflection": "A interpretação psicológica densa do tema do dia (mínimo 600 e máximo 1000 caracteres). Fale sobre a alma, sobre o que está oculto e sobre a necessidade de movimento real.",
  "practice": "A instrução específica e profunda de 'como' e 'quando' agir hoje.",
  "archetype": "Arquétipo regente do momento"
}
Responda em: ${language}`;

    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [{ role: "system", content: systemPrompt }],
            temperature: 0.88,
            response_format: { type: "json_object" }
        });
        return safeJsonParse(response.choices[0].message.content);
    } catch (e) {
        console.error("Erro generateDailyOracle:", e);
        return {
            title: "O Silêncio Fecundo",
            reflection: "Às vezes, o crescimento ocorre no escuro, antes que qualquer broto rompa a superfície. Honre a pausa e o que está sendo gestado no seu interior agora.",
            practice: "Observe um momento de silêncio antes de falar pela primeira vez hoje e sinta a direção que sua alma aponta.",
            archetype: "O Eremita"
        };
    }
}

module.exports = { interpretDream, generateDeepQuestions, generateDeepAnalysis, generateGlobalAnalysis, analyzeSymbol, generateDailyOracle };
