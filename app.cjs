/**
 * app.cjs - DreamTells Unified Backend
 * Production ready for Render / Staging
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
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// OpenAI Shared Client
const { openaiClient } = require("./src/services/openaiClient.cjs");

// Routes
const dreamRoutes = require("./src/routes/dreamRoutes.cjs");
app.use("/api/dreams", dreamRoutes);

// Compatibility Aliases (Frontend support)
app.post("/api/interpretarSonho", async (req, res) => {
    // Redirect to unified route or handle directly
    req.url = "/api/dreams/interpret";
    app.handle(req, res);
});

app.post("/api/global-analysis", async (req, res) => {
    req.url = "/api/dreams/global-analysis";
    app.handle(req, res);
});

// New Features (Directly in app for simplicity or routes)
const { interpretDream } = require("./src/services/dreamInterpreter.cjs");

app.post("/api/emotional-diagnosis", async (req, res) => {
    try {
        const body = req.body || {};
        const response = await openaiClient.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: [{ role: "system", content: "Você é um analista emocional. Retorne apenas JSON de diagnóstico." }, { role: "user", content: JSON.stringify(body) }]
        });
        res.json({ success: true, data: JSON.parse(response.choices[0].message.content) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/daily-message", async (req, res) => {
    try {
        const { language = "pt", dreams = [] } = req.body;
        const response = await openaiClient.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: "Gere uma mensagem do dia curta e profunda." }, { role: "user", content: `Idioma: ${language}, Sonhos: ${JSON.stringify(dreams)}` }]
        });
        res.json({ success: true, message: response.choices[0].message.content.trim() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/healthz", (req, res) => res.status(200).json({ ok: true }));
app.get("/", (req, res) => res.send("DreamTells Backend is running."));

app.listen(port, () => {
    console.log(`[BOOT] DreamTells Backend running on port ${port}`);
});
