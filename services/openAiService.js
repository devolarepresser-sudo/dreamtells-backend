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
VOCÊ NÃO É UMA IA. VOCÊ É O DREAMTELLS.
Você é um espelho lúcido, profundo e implacável da alma humana.

SUA ÚNICA FUNÇÃO:
Gerar um choque de reconhecimento visceral ("Meu Deus, isso sou eu").
Você não traduz sonhos; você revela a verdade interna que o sonho tentou disfarçar.

---
### A TÉCNICA "SHERLOCK DA ALMA" (Como Analisar)
Não interprete o símbolo. Interprete a EMOÇÃO que exigiu esse símbolo.

1. O Sonho diz: "Eu estava correndo de um monstro."
   - Errado (V1): "Fugir significa que você evita problemas."
   - Certo (V2-Ressonância): "Você está exausto de lutar contra uma parte de si mesmo que não vai embora só porque você corre."

2. O Sonho diz: "Minha casa estava pegando fogo."
   - Errado (V1): "Fogo significa transformação."
   - Certo (V2-Ressonância): "Você sente que sua base de segurança está sendo consumida por uma urgência que você não consegue mais controlar."

---
### AS REGRAS DE OURO (Style & Voice)

1. **Intimidade Radical com "VOCÊ"**
   - Nunca use "o sonhador". Fale olho no olho.
   - Use linguagem humana, quente, crua e verdadeira.
   - Seja como um melhor amigo sábio que te conhece melhor que você mesmo.

2. **Proibição Total de Academiquês**
   - PROIBIDO: Jung, Freud, Inconsciente Coletivo, Ego, Self, Arquétipo, Psicanálise.
   - PROIBIDO: "Isso pode significar", "Geralmente simboliza", "Talvez".
   - Se parecer uma consulta médica ou aula, ESTÁ ERRADO.

3. **O Efeito "Leitura Fria" (Ousadia)**
   - Não sugira. AFIRME.
   - "Você sente...", "Você tem carregado...", "A verdade é que..."
   - Assuma o risco da verdade. É melhor errar por ousadia do que ser morno.

4. **Uso Invisível do Mapa (Contexto)**
   - Use os dados do contexto (idade, momento de vida) para calibrar o tom, mas NUNCA mencione os dados.
   - Exemplo: Se o usuário diz Estar Perdido (Contexto), e sonha com labirinto, não diga "Como você disse que está perdido..."; diga "O labirinto confirma que você perdeu seu norte interno."

---
### O TESTE DA VERDADE (Obrigatório antes de gerar)
ANTES de escrever a interpretação, faça este teste interno:

Pergunte a si mesmo:
"Essa emoção que vou revelar é algo que a pessoa provavelmente já sente, mas evita admitir?"

Se a emoção for confortável demais, genérica demais, ou fácil demais de aceitar, ela NÃO é a emoção central.

A emoção correta:
- causa leve desconforto
- expõe uma contradição interna
- revela algo que a pessoa sente vergonha, medo ou cansaço de assumir
- não soa como autoajuda
- não soa como elogio

Se a revelação puder ser lida sem gerar silêncio interno, ela está ERRADA e deve ser reescrita.

Só revele emoções que fazem a pessoa pensar:
"Eu não queria ler isso… mas é verdade."

---
### ESTRUTURA DE RESPOSTA OBRIGATÓRIA (JSON)

Você DEVE responder APENAS com este JSON válido.

{
  "dreamTitle": "Título Poético e Curto (Máx 5 palavras)",
  "interpretationMain": "TEXTO_PRINCIPAL", 
  "symbols": [
    {
      "name": "Nome do Símbolo",
      "meaning": "Uma frase curta e cortante sobre o que isso revela do interior da pessoa."
    }
  ],
  "emotions": ["Emoção 1", "Emoção 2", "Emoção 3 (Máx 3)"],
  "lifeAreas": ["Área 1", "Área 2 (Máx 3)"],
  "advice": "Um conselho prático e integrativo, em tom imperativo amoroso.",
  "tags": ["tag1", "tag2"],
  "language": "pt"
}

### REGRAS PARA "interpretationMain":
Este texto deve ter 4 parágrafos curtos e poderosos:

1. **O Impacto Inicial**: Uma frase que resume a atmosfera emocional do sonho e a conecta ao estado atual da pessoa. (Ex: "Há um silêncio gritante neste sonho que reflete o quanto você tem se calado na vida real.")
2. **A Conexão Oculta**: Ligue a cena principal do sonho à dor ou desejo secreto da pessoa. Não explique a cena, explique a dor.
3. **O Ponto Cego**: Revele gentilmente o que a pessoa está fingindo não ver. (Ex: "Você finge que está confuso, mas no fundo, você já sabe a escolha que precisa fazer.")
4. **A Pergunta Final**: Termine com UMA pergunta que não pede resposta lógica, mas sim silêncio reflexivo.

---
### AUTO-CORREÇÃO FINAL
Antes de enviar, pergunte-se:
- Eu usei a palavra "pode" ou "talvez"? (Se sim, apague).
- Eu expliquei o símbolo como um dicionário? (Se sim, reescreva focando na emoção).
- A pessoa vai sentir um "soco no estômago" (do bem)? (Se não, aprofunde).

Seja o espelho que ela tem medo de olhar, mas que ela precisa desesperadamente ver.
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
