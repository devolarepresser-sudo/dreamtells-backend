/**
 * app.cjs - DreamTells Unified Backend
 * Production ready for Render / Staging
 * Fix: Removed git conflict markers and ensured backward compatibility
 */
process.on("uncaughtException", (err) => console.error("[FATAL] uncaughtException:", err));
process.on("unhandledRejection", (reason) => console.error("[FATAL] unhandledRejection:", reason));

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

// Load Environment
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

const app = express();
const port = process.env.PORT || 10000;

// GLOBAL DAILY CACHE
let globalDailyCache = {
    date: null,
    oracle: null
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Log Middleware
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
});

// OpenAI Shared Client
const { openaiClient } = require("./src/services/openaiClient.cjs");

// Routes
const dreamRoutes = require("./src/routes/dreamRoutes.cjs");
const { interpretDream } = require("./src/services/dreamInterpreter.cjs");

// ✅ Rota Legada (Play Store antiga)
app.post("/interpretarSonho", async (req, res) => {
    try {
        const { text, dreamText, language = "pt" } = req.body;
        const result = await interpretDream(text || dreamText, language);
        return res.json(result); // Formato direto que o app antigo espera
    } catch (e) {
        console.error("[LEGACY ERROR] /interpretarSonho:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ✅ Rota compatível com /api/ (App transição)
app.post("/api/interpretarSonho", async (req, res) => {
    try {
        const { text, dreamText, language = "pt" } = req.body;
        const result = await interpretDream(text || dreamText, language);
        return res.json({ success: true, data: result });
    } catch (e) {
        console.error("[API ERROR] /api/interpretarSonho:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/deep-questions", async (req, res) => {
    req.url = "/api/dreams/deep-questions";
    app.handle(req, res);
});

app.post("/api/analyze-deep", async (req, res) => {
    req.url = "/api/dreams/analyze-deep";
    app.handle(req, res);
});

app.post("/api/analyze-symbol", async (req, res) => {
    req.url = "/api/dreams/analyze-symbol";
    app.handle(req, res);
});

// ✅ Análise Global (Play Store)
app.post("/api/global-analysis", async (req, res) => {
    try {
        const { dreams, language = "pt" } = req.body;
        if (Array.isArray(dreams)) {
            const { generateGlobalAnalysis } = require("./src/services/dreamInterpreter.cjs");
            const result = await generateGlobalAnalysis(dreams, language);
            return res.json({ success: true, analysis: result, data: result });
        }
        res.status(400).json({ error: "Lista de sonhos obrigatória." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ✅ Diagnóstico Emocional (Nova Feature - Cruzamento Biometria + Sonhos + Mapa)
app.post("/api/emotional-diagnosis", async (req, res) => {
    try {
        const { dailyContext, dreams, unconsciousMap, language = "pt", biometricContext } = req.body;

        const systemPrompt = `Você é o MENTOR DREAMTELLS. Você é um analista de alma e biometria.
Sua missão é gerar um DIAGNÓSTICO EMOCIONAL que una o corpo (biometria), a mente (sonhos) e a vida (mapa).

ESTRUTURA JSON (OBRIGATÓRIO):
{
  "phaseTitle": "Título que define o momento",
  "archetype": "Arquétipo regente (Ex: O Guerreiro Exausto, A Buscadora do Solo Sagrado)",
  "summary": "Uma verdade cortante sobre o estado emocional atual (2-3 parágrafos).",
  "mainChallenge": "O 'Elefante na Sala' que a pessoa está evitando enfrentar.",
  "advice": "Uma direção prática + uma pergunta que force a decisão interna.",
  "biometricInsight": "Como os dados físicos (sono/eficiência) estão refletidos no psicológico."
}

CONTEXTO:
- Biometria: ${JSON.stringify(biometricContext || "Não disponível")}
- Mapa do Inconsciente: ${JSON.stringify(unconsciousMap || "Não disponível")}
- Sonhos Recentes: ${JSON.stringify(dreams || [])}
- Reflexão de hoje: ${dailyContext || "Nenhuma registrada"}

TONALIDADE: Sóbria, honesta, oracular. Responda em: ${language}`;

        const response = await openaiClient.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }],
            temperature: 0.75,
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        res.json({ success: true, data: JSON.parse(content) });
    } catch (e) {
        console.error("[DIAGNOSTIC ERROR]", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ✅ Mensagem do Dia (Oráculo Arquetípico) com Personalização
app.post("/api/daily-message", async (req, res) => {
    try {
        const { language = "pt", dreams, unconsciousMap, userId } = req.body;
        const today = new Date().toDateString();

        // Se NÃO houver contexto (sonhos ou mapa), usamos o Cache Global (App Play Store / Legado)
        const hasContext = (Array.isArray(dreams) && dreams.length > 0) || (unconsciousMap && typeof unconsciousMap === 'object' && Object.keys(unconsciousMap).length > 0);

        if (!hasContext && globalDailyCache.date === today && globalDailyCache.oracle) {
            console.log("[CACHE GLOBAL] Retornando Oráculo genérico do dia.");
            return res.json({ success: true, data: globalDailyCache.oracle, message: globalDailyCache.oracle.reflection });
        }

        const { generateDailyOracle } = require("./src/services/dreamInterpreter.cjs");

        // Se tiver contexto, geramos algo único. Se não, geramos o global e salvamos no cache.
        const oracle = await generateDailyOracle(language, dreams, unconsciousMap);

        if (!hasContext) {
            console.log("[CACHE] Atualizando Oráculo global do dia.");
            globalDailyCache = {
                date: today,
                oracle: oracle
            };
        } else {
            console.log(`[PERSONALIZADO] Gerada mensagem única para usuário ${userId || 'guest'}`);
        }

        res.json({ success: true, data: oracle, message: oracle.reflection });
    } catch (e) {
        console.error("[ORACLE ERROR]", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ✅ Transcrição de Áudio (OpenAI Audio Transcriptions)
app.post("/api/audio/transcribe", async (req, res) => {
    try {
        const { audio, mimeType = 'audio/aac', language = 'pt' } = req.body;

        if (!audio) {
            return res.status(400).json({ error: "Audio data is required" });
        }

        console.log('[TRANSCRIBE] Received audio transcription request');
        console.log('[TRANSCRIBE] MimeType:', mimeType);
        console.log('[TRANSCRIBE] Language:', language);

        // Converter base64 para Buffer
        const audioBuffer = Buffer.from(audio, 'base64');
        console.log('[TRANSCRIBE] Audio buffer size:', audioBuffer.length, 'bytes');

        // Determinar extensão do arquivo baseado no mimeType
        let fileExtension = 'aac';
        if (mimeType.includes('m4a')) fileExtension = 'm4a';
        else if (mimeType.includes('wav')) fileExtension = 'wav';
        else if (mimeType.includes('mp3')) fileExtension = 'mp3';
        else if (mimeType.includes('webm')) fileExtension = 'webm';

        // Salvar temporariamente
        const tmpPath = path.join(__dirname, `temp_audio_${Date.now()}.${fileExtension}`);
        fs.writeFileSync(tmpPath, audioBuffer);

        try {
            // Enviar para OpenAI Audio Transcriptions
            const FormData = require('form-data');
            const form = new FormData();
            form.append('file', fs.createReadStream(tmpPath));
            form.append('model', 'whisper-1'); // ou 'gpt-4o-transcribe' se disponível
            form.append('language', language === 'pt' ? 'pt' : language);

            const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    ...form.getHeaders(),
                },
                body: form,
            });

            const transcriptionData = await transcriptionResponse.json();

            // Limpar arquivo temporário
            fs.unlinkSync(tmpPath);

            if (!transcriptionResponse.ok) {
                console.error('[TRANSCRIBE] OpenAI error:', transcriptionData);
                throw new Error(transcriptionData.error?.message || 'Transcription failed');
            }

            console.log('[TRANSCRIBE] Success:', transcriptionData.text);

            res.json({
                success: true,
                text: transcriptionData.text || '',
            });
        } catch (transcribeError) {
            // Limpar arquivo em caso de erro
            if (fs.existsSync(tmpPath)) {
                fs.unlinkSync(tmpPath);
            }
            throw transcribeError;
        }
    } catch (e) {
        console.error("[TRANSCRIBE ERROR]", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.use("/api/dreams", dreamRoutes);
app.get("/healthz", (req, res) => res.status(200).json({ ok: true }));
app.get("/", (req, res) => res.send("DreamTells Backend is running (Robust Version)."));

app.listen(port, () => {
    console.log(`[BOOT] DreamTells Backend running on port ${port}`);
});
