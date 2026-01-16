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

function ensureMinArrays(result) {
    if (!result || typeof result !== "object") return result;

    result.symbols = ensureArray(result.symbols);
    result.emotions = ensureArray(result.emotions);
    result.lifeAreas = ensureArray(result.lifeAreas);
    result.tags = ensureArray(result.tags);

    return result;
}

/**
 * Detectores suaves (SEM travar a alma do texto):
 * - Não proíbe palavras "naturais"; só evita resposta curta demais e genérica demais.
 *
 * AJUSTE (mais liberdade):
 * - Antes estava marcando como raso por frases comuns ("este sonho sugere") e por tamanho.
 * - Agora só sinaliza "raso" quando for curto demais OU tiver muitos sinais de texto genérico.
 */
function looksGenericOrThin(text) {
    if (!isNonEmptyString(text)) return true;
    const t = text.toLowerCase();

    // muito curto quase sempre é raso
    if (t.length < 360) return true;

    // sinais de "texto internet" (não é proibido, só sinaliza quando em excesso)
    const genericHits = [
        "este sonho sugere",
        "este sonho indica",
        "pode indicar",
        "talvez",
        "em geral",
        "normalmente",
        "geralmente",
        "simboliza",
        "representa"
    ];

    const hits = genericHits.reduce((acc, g) => (t.includes(g) ? acc + 1 : acc), 0);

    // Ajuste: tolerância maior (antes >=3). Agora só sinaliza se estiver MUITO genérico.
    // Isso evita o retry forçar “modo checklist” quando o conteúdo já está bom.
    return hits >= 5;
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

/**
 * Qualidade "como definimos":
 * - Profundo, junguiano quando fizer sentido, técnico sem aula.
 * - Sem rigidez matemática: 2–3 parágrafos REAIS (com linha em branco).
 * - Advice acionável: 3 ações (24–72h) + 1 pergunta.
 */
function meetsInterpretationQuality(result) {
    if (!result || typeof result !== "object") return false;

    const interpretationMain = result.interpretationMain;
    const advice = result.advice;

    const paragraphsOk = countParagraphs(interpretationMain) >= 2; // 2+ parágrafos reais
    const adviceOk = adviceHas3ActionsAndQuestion(advice);

    // conteúdo: evita raso e genérico
    const contentOk = !looksGenericOrThin(interpretationMain);

    // schema mínimo (sem inflar)
    const arraysOk =
        ensureArray(result.symbols).length >= 3 &&
        ensureArray(result.emotions).length >= 4 &&
        ensureArray(result.lifeAreas).length >= 3;

    return paragraphsOk && adviceOk && contentOk && arraysOk;
}

/**
 * Formatação suave:
 * Se veio tudo num bloco, tenta inserir \n\n em pontos naturais.
 * Não muda sentido. Só melhora a separação visual e a contagem.
 */
function enforceParagraphBreaksSoft(text) {
    if (!isNonEmptyString(text)) return text;
    if (countParagraphs(text) >= 2) return text;

    const t = text.trim();

    // Quebra por sentenças e reagrupa em 3 parágrafos (se der)
    const sentences = t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);

    if (sentences.length < 6) return t; // muito curto, não inventa quebra

    const third = Math.ceil(sentences.length / 3);
    const p1 = sentences.slice(0, third).join(" ");
    const p2 = sentences.slice(third, third * 2).join(" ");
    const p3 = sentences.slice(third * 2).join(" ");

    return `${p1}\n\n${p2}\n\n${p3}`.trim();
}

async function interpretDream(dreamText, language = "pt") {
    const model = resolveModel();
    console.log('[Backend] interpretDream ACTIVE dreamInterpreter.cjs vDepth');

    // Prompt: profundo + com liberdade; sem checklist que mata a escrita
    const systemPrompt = `
Você é uma equipe clínica de interpretação de sonhos (terapeuta sênior), com base em Psicologia Analítica (Jung) e Psicodinâmica contemporânea.

MISSÃO:
Gerar uma interpretação profunda e útil, tratando o sonho como material do inconsciente que tenta regular uma tensão real (conflito, defesa, desejo, medo). Você deve formular uma leitura CLARA, e não apenas descrever símbolos.

POSTURA (importante):
- Seja específico e direto, sem “texto de internet”.
- Autorize hipóteses: você pode inferir dinâmicas psicológicas a partir do sonho, DESDE que não invente fatos da vida do usuário.
- Evite linguagem vaga (ex.: "pode indicar", "talvez", "em geral"). Prefira: "isso aponta para..." / "isso sugere um conflito entre...".
- Use Jung somente quando o sonho sustentar (Sombra, Persona, Complexos, Compensação, Projeção, Individuação). Não force teoria e não dê aula.

O QUE NÃO PODE:
- Inventar acontecimentos biográficos.
- Romantizar ou espiritualizar sem base.
- Fazer palestra motivacional.

REQUISITOS DE SUBSTÂNCIA (o que não pode faltar):
- Traga 1 hipótese central (tensão principal) + 1 hipótese alternativa plausível (mais curta).
- Nomeie uma defesa provável (ex.: evitação, controle, racionalização, dissociação, compulsão à repetição, ambivalência).
- Explique o custo provável na vida desperta (ansiedade, bloqueio, repetição, conflito, exaustão).
- Conecte 3–6 símbolos diretamente à tensão (não como dicionário genérico).

FORMATO (JSON apenas, sem markdown):
{
  "dreamTitle": "Título curto e impactante",
  "interpretationMain": "2–3 parágrafos REAIS, com \\n\\n entre eles",
  "symbols": [
    { "name": "Símbolo", "meaning": "Significado psicológico específico ligado à tensão central" }
  ],
  "emotions": ["mínimo 4 emoções específicas (ex.: vigilância, culpa, impotência, raiva contida...)"],
  "lifeAreas": ["mínimo 3 áreas (ex.: relacionamento, trabalho, identidade, decisões, saúde emocional...)"],
  "advice": "3 ações concretas para 24–72h em lista + 1 pergunta final + frase DreamTells",
  "tags": ["6 a 10 tags curtas"],
  "language": "${language}"
}

ADVICE (obrigatório):
- 3 ações concretas (24–72h) EM LISTA (1) 2) 3) ou -)
- Finaliza com 1 pergunta de reflexão
- Termina com: "Esta orientação foi gerada pelo Método de Interpretação Profunda DreamTells."

Responda estritamente no idioma: ${language}
`.trim();

    const userPrompt = `SONHO (texto bruto): ${dreamText}\nIDIOMA: ${language}`;

    try {
        const response = await openaiClient.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.82
        });

        const content = response.choices?.[0]?.message?.content || "";
        let result = ensureMinArrays(safeJsonParse(content));

        if (result && typeof result === "object" && !result.language) result.language = language;

        // formatação suave pra evitar Count=1
        if (result && typeof result === "object" && isNonEmptyString(result.interpretationMain)) {
            result.interpretationMain = enforceParagraphBreaksSoft(result.interpretationMain);
        }

        // ✅ Retry inteligente (só se realmente estiver raso/sem formato/sem advice acionável)
        if (!meetsInterpretationQuality(result)) {
            console.warn("[Backend] interpretDream veio raso/incompleto. Executando 1 retry inteligente...");

            const repairPrompt = `
Refaça a resposta mantendo o MESMO schema JSON.
Foque em PROFUNDIDADE CLÍNICA (sem enrolar) e garanta:
- interpretationMain com 2–3 parágrafos reais (\\n\\n)
- 1 hipótese central + 1 hipótese alternativa (curta)
- Nomeie a defesa psicológica predominante e o custo na vida desperta
- Conecte símbolos à tensão (não “dicionário de símbolos”)
- Advice com 3 ações (24–72h) EM LISTA + 1 pergunta final + frase DreamTells
- Sem inventar fatos sobre a vida do usuário
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
                temperature: 0.68
            });

            const content2 = response2.choices?.[0]?.message?.content || "";
            const repaired = ensureMinArrays(safeJsonParse(content2));

            if (repaired && typeof repaired === "object") {
                if (!repaired.language) repaired.language = language;
                if (isNonEmptyString(repaired.interpretationMain)) {
                    repaired.interpretationMain = enforceParagraphBreaksSoft(repaired.interpretationMain);
                }
                result = repaired;
            }
        }

        // ✅ Garantias finais de schema (sem quebrar front)
        if (!result || typeof result !== "object") {
            return { error: "Resposta inválida da IA." };
        }

        if (!isNonEmptyString(result.dreamTitle)) result.dreamTitle = "Sonho";
        if (!isNonEmptyString(result.interpretationMain)) result.interpretationMain = "Interpretação indisponível no momento.";

        // advice fallback (garante formato)
        if (!isNonEmptyString(result.advice) || !adviceHas3ActionsAndQuestion(result.advice)) {
            result.advice =
                "1) Escreva em 10 linhas qual é a tensão central do seu momento (o que você quer vs o que você teme perder).\n" +
                "2) Escolha UMA decisão evitada e faça um micro-passo em 48h (mensagem, conversa, definição de limite, tarefa).\n" +
                "3) Observe por 24h quando surge a vontade de fugir (distração/adiamento) e anote o gatilho + a emoção exata.\n" +
                "O que você está protegendo ao evitar encarar isso — e qual preço você está pagando por essa proteção?\n" +
                "Esta orientação foi gerada pelo Método de Interpretação Profunda DreamTells.";
        } else {
            // garante frase final do método, sem duplicar se já tiver
            if (!result.advice.includes("Método de Interpretação Profunda DreamTells")) {
                result.advice = `${result.advice.trim()}\nEsta orientação foi gerada pelo Método de Interpretação Profunda DreamTells.`;
            }
        }

        // arrays mínimos finais (sem inflar demais)
        result = ensureMinArrays(result);

        // mínimos tolerantes (sem inventar demais; só garante estabilidade do front)
        if (ensureArray(result.symbols).length < 3) result.symbols = ensureArray(result.symbols).slice(0, 3);
        if (ensureArray(result.emotions).length < 4) {
            const base = ["ansiedade", "vigilância", "medo", "tensão"];
            result.emotions = Array.from(new Set([...ensureArray(result.emotions), ...base])).slice(0, 6);
        }
        if (ensureArray(result.lifeAreas).length < 3) {
            const base = ["emocional", "decisões", "identidade"];
            result.lifeAreas = Array.from(new Set([...ensureArray(result.lifeAreas), ...base])).slice(0, 6);
        }
        if (ensureArray(result.tags).length < 6) {
            const base = ["inconsciente", "tensão", "defesa", "sombra", "decisão", "autoconhecimento", "ansiedade"];
            result.tags = Array.from(new Set([...ensureArray(result.tags), ...base])).slice(0, 10);
        }

        return result;

    } catch (error) {
        console.error("Erro ao interpretar sonho:", error);
        return { error: error.message };
    }
}

async function generateDeepQuestions(dreamText, language = "pt") {
    const model = resolveModel();
    console.log('[Backend] interpretDream ACTIVE dreamInterpreter.cjs vDepth');

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
    console.log('[Backend] interpretDream ACTIVE dreamInterpreter.cjs vDepth');

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
    console.log('[Backend] interpretDream ACTIVE dreamInterpreter.cjs vDepth');
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
