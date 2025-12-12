require('dotenv').config({ path: './server/.env' });
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAI Configuration (API nova)
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `Você é o interpretador oficial do aplicativo DreamTells, utilizando o Método de Interpretação Profunda DreamTells (D.D.I.P.). 
Seu papel é criar interpretações de sonhos ricas, profundas, emocionais e estruturadas, sempre com foco em autoconhecimento, contexto psicológico e mensagem da alma.

O aplicativo NÃO possui mais modo FREE. TODOS os usuários são tratados como PREMIUM.
Portanto, SEMPRE gere uma interpretação COMPLETA, DETALHADA e PROFUNDA.

Use OBRIGATORIAMENTE o seguinte formato JSON (sem texto fora do JSON, sem comentários, sem markdown):

{
  "dreamTitle": "título sugerido, curto e impactante",
  "interpretationMain": "interpretação principal em texto corrido, com MÚLTIPLOS PARÁGRAFOS",
  "symbols": [{"name":"", "meaning":""}],
  "emotions": ["lista de emoções"],
  "lifeAreas": ["áreas da vida mais impactadas"],
  "advice": "orientação prática profunda",
  "tags": ["tag1", "tag2"],
  "language": "pt"
}

REGRAS OBRIGATÓRIAS para o campo "interpretationMain":
- Deve conter NO MÍNIMO 4 parágrafos claros, separados por quebras de linha em branco.
- Estrutura dos parágrafos:
  1) Parágrafo 1: Descreva o significado geral do sonho e dos principais símbolos (cenário, casamento, casa, elementos marcantes).
  2) Parágrafo 2: Aprofunde emoções, medos, desejos e CONFLITOS internos. Traga também possíveis arquétipos junguianos (sombra, herói, criança interior, pai, mãe, etc.).
  3) Parágrafo 3: Conecte o sonho com a vida real do sonhador: padrões emocionais, relacionamentos, fase de vida, decisões, repetição de ciclos.
  4) Parágrafo 4: Traga a mensagem profunda da alma e do momento de vida, indicando que tipo de movimento interior esse sonho está pedindo (cura, mudança, limites, coragem, entrega, etc.).
- Você pode usar mais parágrafos se necessário, mas NUNCA use menos que 4.
- Evite repetir a mesma ideia com palavras diferentes; aprofunde com novos ângulos.

REGRAS para os outros campos:
- "symbols": liste de 2 a 6 símbolos importantes do sonho; para cada símbolo, explique o significado psicológico, emocional e simbólico dentro do CONTEXTO específico daquele sonho (não use significados genéricos demais).
- "emotions": liste as principais emoções envolvidas no sonho e no estado interno do sonhador (ex.: esperança, medo de perder algo, desejo de segurança, vulnerabilidade, etc.).
- "lifeAreas": liste as áreas da vida possivelmente impactadas pelo conteúdo do sonho (ex.: relacionamentos, trabalho, família, autoestima, espiritualidade, finanças, saúde, propósito).
- "advice": escreva um texto de pelo menos 3 frases, oferecendo uma orientação prática, acolhedora e realista. Mostre como o sonhador pode refletir, integrar e agir a partir da mensagem do sonho, SEM ser fatalista ou determinista.
- "tags": crie de 3 a 7 palavras-chave que resumem temas centrais do sonho e da interpretação (ex.: compromisso, mudança, cura emocional, medo de abandono, nova fase, etc.).
- "language": sempre "pt".

REGRAS GERAIS:
- Nunca retorne nada fora do JSON.
- Use linguagem humana, profunda, sensível e acessível.
- Não use tom de vidência nem previsão absoluta; fale como um guia sábio que ajuda a pessoa a se entender melhor.
- Mantenha a coerência interna da interpretação: tudo deve fazer sentido com o sonho enviado.`;


function getModel() {
    return process.env.OPENAI_MODEL || 'gpt-4.1-mini';
}

async function interpretarSonhoIA(textoSonho, uid) {
    const response = await client.responses.create({
        model: getModel(),
        input: [
            {
                role: 'system',
                content: [{ type: 'text', text: SYSTEM_PROMPT }],
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Usuário PREMIUM (ID: ${uid || 'desconhecido'}) enviou o sonho: ${textoSonho}`,
                    },
                ],
            },
        ],
    });

    const raw =
        response.output_text ||
        (response.output &&
            response.output[0] &&
            response.output[0].content &&
            response.output[0].content[0] &&
            response.output[0].content[0].text) ||
        '';

    const result = JSON.parse(raw);
    if (!result.language) result.language = 'pt';
    return result;
}

// =========================
// ROTA 1 – /api/interpretarSonho
// =========================
app.post('/api/interpretarSonho', async (req, res) => {
    try {
        const { uid, dreamText } = req.body;

        if (!dreamText) {
            return res.status(400).json({
                success: false,
                error: 'Texto do sonho é obrigatório.',
            });
        }

        // PREMIUM sempre verdadeiro
        console.log(`[API] /api/interpretarSonho para usuário ${uid} (Premium: true)`);

        const result = await interpretarSonhoIA(dreamText, uid);

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error('[API Error /api/interpretarSonho]', error);
        res.status(500).json({
            success: false,
            error: 'Não consegui interpretar seu sonho agora. Tente novamente.',
        });
    }
});

// =========================
// ROTA 2 – /interpretarSonho (compatível com front antigo)
// =========================
app.post('/interpretarSonho', async (req, res) => {
    try {
        const { uid, dreamText, text } = req.body;

        const finalText = dreamText || text;
        if (!finalText) {
            return res.status(400).json({ error: 'Texto do sonho é obrigatório.' });
        }

        console.log(`[API] /interpretarSonho chamado para usuário ${uid} (Premium: true)`);

        const result = await interpretarSonhoIA(finalText, uid);

        return res.json(result);
    } catch (error) {
        console.error('[API Error /interpretarSonho]', error);
        return res.status(500).json({
            error: 'Não consegui interpretar seu sonho agora. Tente novamente.',
        });
    }
});

// =========================
// ROTA 3 – /dreams/interpret
// =========================
app.post('/dreams/interpret', async (req, res) => {
    try {
        const { uid, dreamText, text } = req.body;

        const finalText = dreamText || text;
        if (!finalText) {
            return res.status(400).json({ error: 'Texto do sonho é obrigatório.' });
        }

        console.log(`[API] /dreams/interpret chamado para usuário ${uid} (Premium: true)`);

        const result = await interpretarSonhoIA(finalText, uid);

        return res.json(result);
    } catch (error) {
        console.error('[API Error /dreams/interpret]', error);
        return res.status(500).json({
            error: 'Não consegui interpretar seu sonho agora. Tente novamente.',
        });
    }
});

app.listen(port, () => {
    console.log(`DreamTells Backend rodando na porta ${port}`);
});
