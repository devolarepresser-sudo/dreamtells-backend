require('dotenv').config({ path: './server/.env' });
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAI Configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Prompt Template
const SYSTEM_PROMPT = `Você é uma inteligência especializada em interpretação de sonhos.
Interprete o sonho abaixo com profundidade psicológica, emocional e simbólica.
Organize a resposta no formato JSON:
{
  "dreamTitle": "título sugerido",
  "interpretationMain": "significado principal",
  "symbols": [{"name":"", "meaning":""}],
  "emotions": ["lista de emoções"],
  "lifeAreas": ["áreas da vida mais impactadas"],
  "advice": "orientação prática e realista"
}
Se o usuário for FREE, gere uma interpretação MAIS CURTA e simplificada.
Se for PREMIUM, gere interpretação COMPLETA e detalhada.`;

app.post('/api/interpretarSonho', async (req, res) => {
    try {
        const { uid, dreamText, premium } = req.body;

        if (!dreamText) {
            return res.status(400).json({ success: false, error: 'Texto do sonho é obrigatório.' });
        }

        console.log(`[API] Interpretando sonho para usuário ${uid} (Premium: ${premium})`);

        const completion = await openai.chat.completions.create({
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
            data: result
        });

    } catch (error) {
        console.error('[API Error]', error);
        res.status(500).json({
            success: false,
            error: 'Não consegui interpretar seu sonho agora. Tente novamente.'
        });
    }
});

app.listen(port, () => {
    console.log(`DreamTells Backend rodando em http://localhost:${port}`);
});
