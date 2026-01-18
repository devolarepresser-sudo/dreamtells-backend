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

// ✅ Diagnóstico Emocional (Nova Feature)
app.post("/api/emotional-diagnosis", async (req, res) => {
    try {
        const body = req.body || {};
        const response = await openaiClient.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: [
                { role: "system", content: "Você é um analista emocional. Retorne apenas JSON de diagnóstico conforme o padrão DreamTells." },
                { role: "user", content: JSON.stringify(body) }
            ],
            temperature: 0.7
        });
        const content = response.choices[0].message.content;
        const firstBrace = content.indexOf("{");
        const lastBrace = content.lastIndexOf("}");
        const cleanJson = content.slice(firstBrace, lastBrace + 1);
        res.json({ success: true, data: JSON.parse(cleanJson) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ✅ Mensagem do Dia (Nova Feature)
app.post("/api/daily-message", async (req, res) => {
    try {
        const { language = "pt", dreams = [] } = req.body;
        const response = await openaiClient.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "Gere uma mensagem do dia curta e profunda baseada no inconsciente." },
                { role: "user", content: `Idioma: ${language}, Sonhos: ${JSON.stringify(dreams)}` }
            ]
        });
        res.json({ success: true, message: response.choices[0].message.content.trim() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.use("/api/dreams", dreamRoutes);
app.get("/healthz", (req, res) => res.status(200).json({ ok: true }));
app.get("/", (req, res) => res.send("DreamTells Backend is running (Robust Version)."));

app.listen(port, () => {
    console.log(`[BOOT] DreamTells Backend running on port ${port}`);
});
