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

O usuário será informado como PREMIUM, pois o aplicativo não possui mais modo FREE.
Sempre gere uma interpretação COMPLETA, DETALHADA e PROFUNDA.

Use OBRIGATORIAMENTE o seguinte formato JSON (sem texto fora do JSON):

{
  "dreamTitle": "título sugerido",
  "interpretationMain": "interpretação profunda em vários parágrafos",
  "symbols": [{"name":"", "meaning":""}],
  "emotions": ["lista de emoções"],
  "lifeAreas": ["áreas da vida"],
  "advice": "orientação prática profunda",
  "tags": ["tema1", "tema2"],
  "language": "pt"
}

Siga estas 6 camadas do Método D.D.I.P.:

1) Simbolismo universal.
2) Arquétipos junguianos.
3) Emoção raiz e conflito interno.
4) Conexão com padrões da vida real.
5) Mensagem profunda da alma.
6) Direção prática final.

Regras:
- Nunca retorne nada fora do JSON.
- Linguagem humana, profunda e acolhedora.
- Múltiplos parágrafos detalhados para usuários PREMIUM (todos os usuários).`;

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
