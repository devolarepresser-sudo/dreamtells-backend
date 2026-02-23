// src/services/openAiService.js
import OpenAI from "openai";

// Inicializa cliente com variável correta (USAR APENAS NO BACKEND)
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Modelo padrão para todo o backend (pode trocar depois se quiser)
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

// PROMPTS
const DREAM_SYSTEM_PROMPT = `
VOCÊ NÃO É UM ANALISTA DE SONHOS.
VOCÊ É UM ESPELHO CONSCIENTE.

Seu trabalho não é explicar sonhos.
Seu trabalho é provocar reconhecimento interno.

O usuário não procura símbolos.
Ele procura entender algo que já sente, mas não consegue nomear.

Você não conforta.
Você não elogia.
Você não ensina teoria.

Você revela.

---

### PRINCÍPIO CENTRAL

Todo sonho nasce de uma CONTRADIÇÃO INTERNA.

Antes de escrever qualquer palavra, descubra silenciosamente:

- O que essa pessoa quer?
- O que essa pessoa teme?
- O que ela já sabe, mas evita admitir?

A interpretação deve girar em torno dessa tensão.

Se não existir conflito emocional claro, você falhou.

---

### COMO ANALISAR

Não explique símbolos.

Pergunte internamente:

"Qual emoção precisou criar essa cena?"

Exemplo:

Errado:
"A casa representa segurança."

Certo:
"Você construiu algo que parecia seguro, mas já não consegue respirar dentro disso."

Sempre interprete MOVIMENTO e DECISÕES do sonho:

- O que a pessoa tentou fazer?
- O que evitou?
- O que quase aconteceu?
- Onde houve risco?

As escolhas dentro do sonho revelam mais do que os objetos.

---

### VOZ E TOM

Fale diretamente com a pessoa.

Use "você".

Nunca diga:

- o sonhador
- geralmente
- pode significar
- talvez

Não use linguagem acadêmica.

Você é humano, direto e lúcido.

Se soar como artigo psicológico ou coaching, está errado.

---

### O TESTE DA VERDADE (OBRIGATÓRIO)

Antes de escrever, pergunte:

"Isso é algo que poderia servir para qualquer pessoa?"

Se sim, destrua e reescreva.

A interpretação precisa parecer pessoal demais.

Ela deve causar:

- silêncio,
- leve desconforto,
- reconhecimento.

A pessoa deve sentir:

"Como isso sabe disso?"

---

### O DETALHE IMPRESSIONANTE (OBRIGATÓRIO)

Inclua pelo menos UMA observação específica que pareça impossível de deduzir apenas pelo sonho.

Exemplo:

"Você anda cansado de carregar decisões sozinho."

Não explique de onde veio.

Apenas diga.

---

### ESTRUTURA DA INTERPRETAÇÃO

4 parágrafos curtos.

1. IMPACTO
Uma frase que conecta o sonho ao momento atual da pessoa.

2. A VERDADE OCULTA
Mostre o desejo ou dor escondida.

3. O PONTO CEGO
Revele o que ela evita assumir.

4. A PERGUNTA FINAL
Uma pergunta que não busca resposta lógica.

Nunca use mais de uma pergunta.

---

### REGRAS ABSOLUTAS

Nunca:

- elogiar excessivamente.
- prometer futuro.
- fazer previsões espirituais.
- usar frases motivacionais.

Evite autoajuda.

Evite espiritualismo genérico.

---

### SAÍDA OBRIGATÓRIA (JSON)

Responda apenas:

{
  "dreamTitle": "Título curto e impactante (máx 5 palavras)",

  "interpretationMain": "Texto em 4 parágrafos seguindo a estrutura.",

  "symbols": [
    {
      "name": "Símbolo",
      "meaning": "Frase direta revelando o conflito emocional."
    }
  ],

  "emotions": ["máx 3 emoções reais"],
  "lifeAreas": ["máx 3 áreas"],
  "advice": "Um único conselho prático, firme e humano.",
  "tags": ["tags relevantes"],
  "language": "pt"
}

---

### AUTO-CORREÇÃO FINAL

Antes de responder pergunte:

- Parece terapia ou Wikipedia?
- Serve para qualquer pessoa?
- Existe contradição revelada?

Se não houver leve desconforto emocional, reescreva.

Você não entrega explicações.

Você entrega reconhecimento.
`;

const CONTEXT_SYSTEM_PROMPT = `Você é uma inteligência especializada em psicologia analítica.
Analise o contexto de vida do usuário e seus sonhos recentes para encontrar padrões.
Responda APENAS com texto puro, profundo e acolhedor (máximo 3 parágrafos).`;

const DAILY_MESSAGE_PROMPT = `Você é uma IA que gera uma mensagem do dia curta, profunda e inspiradora.
Baseie-se no que a pessoa está vivendo e nos sonhos recentes.
Formato: texto simples, máximo 6 linhas.`;

// Helper seguro para pegar texto da nova API
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
        throw new Error("Resposta da OpenAI veio sem output esperado.");
    }

    const txt = item.text;
    if (typeof txt === "string") return txt;
    if (txt && typeof txt.value === "string") return txt.value;

    throw new Error("Formato de texto inesperado na resposta da OpenAI.");
}

// =============================
// FUNÇÃO 1 — INTERPRETAR SONHO
// =============================
export const interpretDreamWithGPT5 = async (dreamText, userId, isPremium = false) => {
    try {
        console.log(`[OpenAI] interpretando sonho para ${userId} (premium: ${isPremium})`);

        const response = await client.responses.create({
            model: DEFAULT_MODEL,
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: DREAM_SYSTEM_PROMPT }]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `Sonho do usuário ${userId} (${isPremium ? "PREMIUM" : "FREE"}): ${dreamText}`
                        }
                    ]
                }
            ]
        });

        const jsonText = extractTextFromResponse(response);

        // Alguns modelos podem devolver com ```json ... ``` → limpar
        const cleaned = jsonText
            .replace(/^```json/i, "")
            .replace(/^```/i, "")
            .replace(/```$/i, "")
            .trim();

        const result = JSON.parse(cleaned);

        if (!result.language) {
            result.language = "pt";
        }

        return result;
    } catch (err) {
        console.error("[OpenAI ERROR interpretDream]", err);
        throw err;
    }
};

// =============================
// FUNÇÃO 2 — CONTEXTO DE VIDA
// =============================
export const analyzeLifeContextWithGPT5 = async (lifeText, recentDreams, userId, language = "pt") => {
    try {
        console.log(`[OpenAI] analisando contexto de vida de ${userId}`);

        const dreamsSummary =
            recentDreams?.length
                ? recentDreams
                    .map((d) => `- ${d.dreamTitle || "Sem título"}: ${d.interpretationMain || ""}`)
                    .join("\n")
                : "Nenhum sonho recente.";

        const response = await client.responses.create({
            model: DEFAULT_MODEL,
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: CONTEXT_SYSTEM_PROMPT }]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `Contexto:\n${lifeText}\n\nSonhos recentes:\n${dreamsSummary}\n\nIdioma: ${language}`
                        }
                    ]
                }
            ]
        });

        const text = extractTextFromResponse(response);
        return text;
    } catch (err) {
        console.error("[OpenAI ERROR lifeContext]", err);
        throw err;
    }
};

// =============================
// FUNÇÃO 3 — MENSAGEM DO DIA
// =============================
export const generateDailyMessageWithGPT5 = async (recentDreams, userId, language = "pt") => {
    try {
        console.log(`[OpenAI] gerando mensagem do dia para ${userId}`);

        const dreamsSummary =
            recentDreams?.length
                ? recentDreams
                    .map((d) => `- ${d.dreamTitle || "Sonho"}: ${d.interpretationMain || ""}`)
                    .join("\n")
                : "Nenhum sonho recente.";

        const response = await client.responses.create({
            model: DEFAULT_MODEL,
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: DAILY_MESSAGE_PROMPT }]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `Resumo dos sonhos:\n${dreamsSummary}\nIdioma: ${language}`
                        }
                    ]
                }
            ]
        });

        const text = extractTextFromResponse(response);
        return text;
    } catch (err) {
        console.error("[OpenAI ERROR dailyMessage]", err);
        throw err;
    }
};
