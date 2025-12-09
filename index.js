import 'dotenv/config';
import express from 'express';
import cors from 'cors';


const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

app.get('/api/debug/routes', (req, res) => {
    const routes = [];
    app._router.stack.forEach((middleware) => {
        if (middleware.route) { // routes registered directly on the app
            routes.push({
                path: middleware.route.path,
                methods: middleware.route.methods
            });
        }
    });
    res.json(routes);
});

// OpenAI Configuration
import { interpretDreamWithGPT5, analyzeLifeContextWithGPT5, generateDailyMessageWithGPT5 } from './services/openAiService.js';

app.post('/api/interpretarSonho', async (req, res) => {
    try {
        const { uid, dreamText, premium } = req.body;

        if (!dreamText) {
            return res.status(400).json({ success: false, error: 'Texto do sonho é obrigatório.' });
        }

        console.log(`[API] Interpretando sonho para usuário ${uid} (Premium: ${premium})`);

        const result = await interpretDreamWithGPT5(dreamText, uid, premium);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('[API Error]', error);
        // Return 500 to ensure frontend stub fallback triggers
        res.status(500).json({
            success: false,
            error: 'Não consegui interpretar seu sonho agora. Tente novamente.'
        });
    }
});

app.post('/api/life-context', async (req, res) => {
    try {
        const { uid, lifeText, recentDreams, language = 'pt' } = req.body;

        if (!lifeText) {
            return res.status(400).json({ success: false, error: 'Texto do contexto é obrigatório.' });
        }

        console.log(`[API] Analisando contexto para usuário ${uid} (${language})`);

        const analysis = await analyzeLifeContextWithGPT5(lifeText, recentDreams, uid, language);

        res.json({
            success: true,
            message: analysis // Standardizing response format to { message: string } for generic text
        });

    } catch (error) {
        console.error('[API Error - Context]', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao analisar contexto.'
        });
    }
});

app.post('/api/daily-message', async (req, res) => {
    try {
        const { uid, recentDreams, language } = req.body;

        console.log(`[API] Gerando mensagem do dia para usuário ${uid}`);

        const message = await generateDailyMessageWithGPT5(recentDreams, uid, language);

        res.json({
            success: true,
            // Provide both fields to ensure compatibility if frontend looks for data.message or root message
            message: message
        });

    } catch (error) {
        console.error('[API Error - DailyMessage]', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao gerar mensagem do dia.'
        });
    }
});

app.listen(port, () => {
    console.log(`DreamTells Backend rodando em http://localhost:${port}`);
});
