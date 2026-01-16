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

function hasTooGenericLanguage(text) {
    if (!isNonEmptyString(text)) return true;
    const t = text.toLowerCase();

    // sinais clássicos de genericão
    const genericHits = [
        "sugere que",
        "isso pode",
        "pode indicar",
        "talvez",
        "em geral",
        "normalmente",
        "geralmente",
        "pode representar"
    ];
    return genericHits.some(g => t.includes(g));
}

function adviceHas3ActionsAndQuestion(advice) {
    if (!isNonEmptyString(advice)) return false;

    const hasQuestion = advice.includes("?");

    // detectar 3 ações por marcadores ou numeração
    const bullets = advice.match(/(^|\n)\s*[-•]\s+/g)?.length || 0;
    const numbered = advice.match(/(^|\n)\s*\d+\s*[\)\.]\s+/g)?.length || 0;

    // detectar 3 ações por linhas com prefixo (fallback)
    const lines = advice.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const actionLines = lines.filter(l => /^(\d+\s*[\)\.]\s+|[-•]\s+)/.test(l));
    const has3ActionLines = actionLines.length >= 3;

    return ((bullets >= 3 || numbered >= 3 || has3ActionLines) && hasQuestion);
}

function ensureMinArrays(result) {
    if (!result || typeof result !== "object") return result;

    result.symbols = ensureArray(result.symbols);
    result.emotions = ensureArray(result.emotions);
    result.lifeAreas = ensureArray(result.lifeAreas);
    result.tags = ensureArray(result.tags);

    return result;
}

/**
 * Interpretação PREMIUM: profundidade real e formato consistente.
 * Regras fortes para resolver o problema "Count=1" e o texto raso.
 */
function meetsInterpretationQuality(result) {
    if (!result || typeof result !== "object") return false;

    const interpretationMain = result.interpretationMain;
    const advice = result.advice;

    // ✅ Validação de densidade mínima (pelo menos 3 parágrafos reais)
    const paragraphsOk = countParagraphs(interpretationMain) >= 3;

    // ✅ advice: pelo menos 3 ações e uma pergunta
    const adviceOk = adviceHas3ActionsAndQuestion(advice);

    // ✅ anti-vagueza (não pode ser puramente genérico)
    const notGeneric = isNonEmptyString(interpretationMain) && interpretationMain.length > 400;

    // ✅ schema mínimo (garantir que arrays existam)
    const arraysOk =
        ensureArray(result.symbols).length >= 2 &&
        ensureArray(result.emotions).length >= 3;

    return paragraphsOk && adviceOk && notGeneric && arraysOk;
}

async function interpretDream(dreamText, language = "pt") {
    const model = resolveModel();

    // Prompt principal (mais exigente, junguiano e anti-genérico)
    const systemPrompt = `
Você é um Analista Clínico de Sonhos especializado em Psicologia Analítica (Carl Jung) e Psicodinâmica Moderna.
Sua missão é fornecer interpretações de ALTO NÍVEL, objetivas e cientificamente embasadas.

DIRETRIZES TÉCNICAS:
1) ABORDAGEM JUNGUIANA: Use conceitos como Sombra, Persona, Compensação, Individuação ou Projeção apenas quando houver evidência clara nos símbolos ou narrativa. Não force a teoria.
2) PSICODINÂMICA: Identifique mecanismos de defesa (evitação, racionalização, dissociação), ambivalência emocional, e padrões de compulsão à repetição.
3) CLAREZA OBJETIVA: Não use jargão vazio. Os conceitos técnicos devem servir como ferramentas de clareza para o sonhador, não como uma aula teórica.
4) LINGUAGEM: Seja direto e clínico. Evite muletas como "isso pode indicar", "talvez". Arrisque uma leitura baseada na lógica interna do sonho e na resposta de ameaça/ansiedade percebida.

REQUISITOS DE CONTEÚDO:
- "interpretationMain": Deve ser uma análise densa e fluida (mínimo 3 parágrafos profundos).
- Conecte o símbolo ao conflito: O símbolo não é apenas uma imagem, é uma tentativa do inconsciente de regular uma tensão real.
- Analise a "tensão central" do sonho e as decisões que o sonhador parece estar evitando na vigília.

ESTRUTURA DA RESPOSTA (JSON):
{
  "dreamTitle": "Título clínico e impactante",
  "interpretationMain": "Análise profunda integrando conceitos psicológicos (\\n\\n entre parágrafos).",
  "symbols": [
    { "name": "Símbolo", "meaning": "Significado específico na dinâmica do sonho." }
  ],
  "emotions": ["Emoções específicas percebidas"],
  "lifeAreas": ["Áreas da vida afetadas pela dinâmica identificada"],
  "advice": "Lista de 3 ações concretas (24-72h) para integrar o insight, finalizada com uma pergunta reflexiva.",
  "tags": ["Tags psicológicas relevantes"],
  "language": "${language}"
}

IMPORTANTE: Responda estritamente em ${language}. Sem markdown extra, apenas o JSON.
`.trim();

    const userPrompt = `SONHO (texto bruto): ${dreamText}\nIDIOMA: ${language}`;

    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7
        });

        const content = response.choices?.[0]?.message?.content || "";
        let result = safeJsonParse(content);
        result = ensureMinArrays(result);
        if (result && typeof result === "object" && !result.language) result.language = language;

        // ✅ Se veio raso/genérico/incompleto => 1 retry controlado
        if (!meetsInterpretationQuality(result)) {
            console.warn("[Backend] interpretDream veio raso/genérico. Executando 1 retry de correção...");

            const repairPrompt = `
O JSON anterior não atingiu a profundidade psicológica ou densidade técnica esperada.
Por favor, refaça a análise garantindo:
1) Uso de conceitos de Jung ou Psicodinâmica para explicar o mecanismo interno do sonho.
2) Mínimo de 3 parágrafos densos em "interpretationMain".
3) 3 ações práticas e uma pergunta reflexiva no "advice".
Resposta em ${language}. APENAS JSON.
`.trim();

            const response2 = await openaiClient.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                    { role: "assistant", content: JSON.stringify(result || {}) },
                    { role: "user", content: repairPrompt }
                ],
                temperature: 0.55
            });

            const content2 = response2.choices?.[0]?.message?.content || "";
            const repaired = ensureMinArrays(safeJsonParse(content2));
            if (repaired && typeof repaired === "object" && !repaired.language) repaired.language = language;

            // se ainda assim não bateu tudo, devolve repaired (melhor que nada) sem quebrar schema
            result = repaired || result;
        }

        // ✅ Garantias finais de schema (sem quebrar front)
        if (!result || typeof result !== "object") {
            return { error: "Resposta inválida da IA." };
        }

        if (!isNonEmptyString(result.dreamTitle)) result.dreamTitle = "Sonho";

        // Se vier sem parágrafos, força formatação mínima (não muda sentido, só formata)
        if (isNonEmptyString(result.interpretationMain) && countParagraphs(result.interpretationMain) < 2) {
            // tenta quebrar em 4 blocos por pontuação como fallback suave
            const t = result.interpretationMain.trim();
            const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
            if (parts.length >= 8) {
                const p1 = parts.slice(0, 2).join(" ");
                const p2 = parts.slice(2, 4).join(" ");
                const p3 = parts.slice(4, 6).join(" ");
                const p4 = parts.slice(6).join(" ");
                result.interpretationMain = `${p1}\n\n${p2}\n\n${p3}\n\n${p4}`.trim();
            }
        }

        if (!isNonEmptyString(result.interpretationMain)) {
            result.interpretationMain = "Interpretação indisponível no momento.";
        }

        if (!isNonEmptyString(result.advice) || !adviceHas3ActionsAndQuestion(result.advice)) {
            result.advice =
                "1) Escreva em 8–10 linhas qual conflito você está evitando nomear, sem florear.\n" +
                "2) Escolha UMA ação pequena que você está adiando e execute nas próximas 48h (mensagem, decisão, conversa, tarefa).\n" +
                "3) Identifique sua principal fuga (ex.: evitar conversa, rolagem infinita, distração) e faça 24h de redução consciente observando a ansiedade.\n" +
                "Qual decisão você sabe que precisa tomar, mas está empurrando por medo do que vai sentir depois?\n" +
                "Esta orientação foi gerada pelo Método de Interpretação Profunda DreamTells.";
        }

        // tags fallback
        if (ensureArray(result.tags).length < 6) {
            const base = ["inconsciente", "sombra", "conflito", "evitação", "ansiedade", "decisão", "autoconhecimento"];
            result.tags = Array.from(new Set([...ensureArray(result.tags), ...base])).slice(0, 10);
        }

        // arrays mínimos finais
        result = ensureMinArrays(result);

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

function guidanceHas3ActionsAndQuestion(guidance) {
    if (!isNonEmptyString(guidance)) return false;
    const hasQuestion = guidance.includes("?");
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
Você é um Analista Arquetípico Sênior e Estrategista da Psique.
Sua missão é identificar a "Fase de Vida" / "Arco de Jornada" do usuário com base no histórico de sonhos, usando psicologia profunda.

DIRETRIZES:
1) Identifique padrões de Sombra, Persona ou mecanismos de defesa recorrentes nos sonhos.
2) Defina a fase atual de forma clínica, porém empoderadora (ex: Integração da Sombra, Fase de Confronto com a Persona, Processo de Individuação Ativo).
3) A "description" deve ter entre 2 a 4 parágrafos densos, conectando os pontos emocionais do histórico.
4) A "guidance" deve focar na transição de um padrão inconsciente (fuga/defesa) para uma ação consciente.

ESTRUTURA:
{
  "phaseTitle": "Título impactante da fase",
  "phaseName": "Nome curto da fase",
  "archetype": "Arquétipo dominante (ex: O Mago, O Herói, O Órfão)",
  "description": "Análise densa da jornada atual (\\n\\n entre parágrafos).",
  "keyChallenges": ["Desafios específicos da fase"],
  "strengths": ["Recursos internos disponíveis"],
  "guidance": "3 ações práticas (24-72h) + 1 pergunta reflexiva.",
  "tags": ["Tags de diagnóstico psicológico"],
  "language": "${language}"
}

IMPORTANTE: Responda estritamente em ${language}.`.trim();

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
