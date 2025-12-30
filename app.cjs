require('dotenv').config({ path: './server/.env' });
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
// >>> ALTERADO AQUI: porta dinâmica para Render <<<
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAI Configuration (API nova)
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Import Dream Routes
const dreamRoutes = require('./src/routes/dreamRoutes.cjs');

const SYSTEM_PROMPT = `Você é uma inteligência especializada em interpretação de sonhos.
Interprete o sonho abaixo com profundidade psicológica, emocional e simbólica.
Organize a resposta no formato JSON:
{
  "dreamTitle": "título sugerido",
  "interpretationMain": "significado principal",
  "symbols": [{"name":"", "meaning":""}],
  "emotions": ["lista de emoções"],
  "lifeAreas": ["áreas da vida mais impactadas"],
  "advice": "orientação prática e realista",
  "tags": ["tag1", "tag2"],
  "language": "pt"
}
Se o usuário for FREE, gere uma interpretação MAIS CURTA e simplificada.
Se for PREMIUM, gere interpretação COMPLETA e detalhada.`;

// Helper para escolher modelo
function getModel() {
    return process.env.OPENAI_MODEL || 'gpt-4.1-mini';
}

// Helper para chamar a OpenAI e devolver JSON
async function interpretarSonhoIA(textoSonho, premium, uid) {
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
                        text: `O usuário é ${premium ? 'PREMIUM' : 'FREE'} (ID: ${uid || 'desconhecido'}). O sonho é: ${textoSonho}`,
                    },
                ],
            },
        ],
    });

    // Tenta pegar texto da forma mais simples possível
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

app.use("/api/dreams", dreamRoutes);
// 🔁 Alias para compatibilidade com o app mobile (/api/analyze-deep)
// Encaminha para /api/dreams/analyze-deep
app.post('/api/analyze-deep', (req, res, next) => {
    req.url = '/analyze-deep';
    dreamRoutes(req, res, next);
});

// =========================
// ROTA 1 – /api/interpretarSonho
// =========================
app.post('/api/interpretarSonho', async (req, res) => {
    try {
        const { uid, dreamText, premium } = req.body;

        if (!dreamText) {
            return res
                .status(400)
                .json({ success: false, error: 'Texto do sonho é obrigatório.' });
        }

        console.log(
            `[API] /api/interpretarSonho para usuário ${uid} (Premium: ${premium})`
        );

        const completion = await client.chat.completions.create({
            model: "gpt-5.1",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `O usuário é ${premium ? 'PREMIUM' : 'FREE'}. O sonho é: ${dreamText}` }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
        });

        const result = JSON.parse(completion.choices[0].message.content);

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
        const { uid, dreamText, premium, text } = req.body;

        const finalText = dreamText || text;
        if (!finalText) {
            return res
                .status(400)
                .json({ error: 'Texto do sonho é obrigatório.' });
        }

        console.log(
            `[API] /interpretarSonho chamado para usuário ${uid} (Premium: ${premium})`
        );

        const result = await interpretarSonhoIA(finalText, premium, uid);

        // Rota compatível com o front: retorna o objeto direto
        return res.json(result);
    } catch (error) {
        console.error('[API Error /interpretarSonho]', error);
        return res.status(500).json({
            error: 'Não consegui interpretar seu sonho agora. Tente novamente.',
        });
    }
});

// =========================
// ROTA 3 – /dreams/interpret (usada pelo frontend novo)
// =========================
app.post('/dreams/interpret', async (req, res) => {
    try {
        const { uid, dreamText, premium, text } = req.body;

        const finalText = dreamText || text;
        if (!finalText) {
            return res
                .status(400)
                .json({ error: 'Texto do sonho é obrigatório.' });
        }

        console.log(
            `[API] /dreams/interpret chamado para usuário ${uid} (Premium: ${premium})`
        );

        const result = await interpretarSonhoIA(finalText, premium, uid);

        // Compatível com o padrão que o front espera
        return res.json(result);
    } catch (error) {
        console.error('[API Error /dreams/interpret]', error);
        return res.status(500).json({
            error: 'Não consegui interpretar seu sonho agora. Tente novamente.',
        });
    }
});

app.post('/interpretarSonho', async (req, res) => {
    try {
        const { uid, dreamText, premium, text } = req.body;

        const finalText = dreamText || text;
        if (!finalText) {
            return res.status(400).json({ error: 'Texto do sonho é obrigatório.' });
        }

        console.log(`[API] /interpretarSonho chamado para usuário ${uid} (Premium: ${premium})`);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `O usuário é ${premium ? 'PREMIUM' : 'FREE'}. O sonho é: ${finalText}` }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
        });

        const result = JSON.parse(completion.choices[0].message.content);

        // Rota compatível com o front: retorna o objeto direto
        return res.json(result);

    } catch (error) {
        console.error('[API Error /interpretarSonho]', error);
        return res.status(500).json({
            error: 'Não consegui interpretar seu sonho agora. Tente novamente.'
        });
    }
});

app.listen(port, () => {
    console.log(`DreamTells Backend rodando na porta ${port}`);
});
