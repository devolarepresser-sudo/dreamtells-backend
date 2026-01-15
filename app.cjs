console.log("BOOT VERSION: 2026-01-13 ROBUST CLIENT FIX");

process.on("uncaughtException", (err) => {
    console.error("[FATAL] uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] unhandledRejection:", reason);
});

/*
 * app.cjs — DreamTells Backend (Render-ready)
 * - Anti-Crash para falta de OPENAI_API_KEY
 * - Compatível com SDK OpenAI (responses vs chat.completions)
 * - Rota híbrida /api/global-analysis (array vs single text)
 */

const fs = require("fs");
const path = require("path");

// Carrega .env apenas se existir localmente
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
    require("dotenv").config({ path: envPath });
} else {
    // No Render, as variáveis já estão no ambiente
    // Não forçamos .env se não existir
}

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// =========================
// OpenAI Client Init (Robust)
// =========================
let client = null;

if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 5) {
    try {
        client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        console.log("[BOOT] OpenAI client inicializado com sucesso.");
    } catch (e) {
        console.error("[BOOT ERROR] Falha ao iniciar OpenAI client:", e.message);
    }
} else {
    console.warn("[BOOT WARNING] OPENAI_API_KEY não encontrada ou vazia. Rotas de IA retornarão erro controlado.");
}

// =========================
// Health / Root
// =========================
app.get("/", (req, res) => {
    res.status(200).send("DreamTells backend OK");
});

app.get("/health", (req, res) => {
    res.status(200).json({ ok: true });
});

// Render Health Check
app.get("/healthz", (req, res) => {
    res.status(200).json({ ok: true });
});

// =========================
// Prompts & Logic
// =========================
const SYSTEM_PROMPT = `Você é o interpretador oficial do aplicativo DreamTells, utilizando o Método de Interpretação Profunda DreamTells (D.D.I.P.). 
Seu papel é criar interpretações de sonhos ricas e estruturadas.
Retorne APENAS formato JSON obrigatório:
{
  "dreamTitle": "...",
  "interpretationMain": "...",
  "symbols": [{"name":"", "meaning":""}],
  "emotions": [],
  "lifeAreas": [],
  "advice": "...",
  "tags": [],
  "language": "pt"
}
`;

const GLOBAL_ANALYSIS_PROMPT = `Você é um Analista Arquetípico.
Analise o HISTÓRICO de sonhos e defina a "Fase de Vida".
Retorne APENAS JSON:
{
  "phaseTitle": "...",
  "phaseName": "...",
  "archetype": "...",
  "description": "...",
  "keyChallenges": [],
  "strengths": [],
  "guidance": "...",
  "tags": [],
  "language": "pt"
}
`;

function getModel() {
    return process.env.OPENAI_MODEL || "gpt-4o";
}

function stripMarkdownFences(rawText) {
    if (!rawText || typeof rawText !== "string") return rawText;
    return rawText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
}

function parseJsonSafely(rawText) {
    const cleaned = stripMarkdownFences(rawText);
    if (!cleaned || typeof cleaned !== "string") {
        throw new Error("Resposta vazia da IA.");
    }
    try {
        return JSON.parse(cleaned);
    } catch (_) { }

    // Fallback: extrair bloco JSON
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Não foi possível parsear JSON da IA.");
}

// =========================
// Chamada OpenAI Segura
// =========================
async function callOpenAIText({ systemPrompt, userPrompt, model }) {
    if (!client) {
        throw new Error("OPENAI_API_KEY não configurada no servidor.");
    }

    const finalModel = model || getModel();

    // Compatibilidade com diferentes versões do SDK
    // 1. Responses API (Beta/Novo)
    if (client.responses && typeof client.responses.create === "function") {
        const response = await client.responses.create({
            model: finalModel,
            input: [
                { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
                { role: "user", content: [{ type: "input_text", text: userPrompt }] },
            ],
        });
        return response.output_text || response.output?.[0]?.content?.[0]?.text || "";
    }

    // 2. Chat Completions (Padrão)
    if (client.chat && client.chat.completions && typeof client.chat.completions.create === "function") {
        const response = await client.chat.completions.create({
            model: finalModel,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
        });
        return response.choices?.[0]?.message?.content || "";
    }

    throw new Error("SDK OpenAI incompatível: métodos responses/chat não encontrados.");
}

// =========================
// Funções de Negócio
// =========================
async function interpretarSonhoIA(textoSonho, uid) {
    const raw = await callOpenAIText({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: `Usuário PREMIUM (ID: ${uid || "desconhecido"}) enviou: ${textoSonho}`,
    });
    const result = parseJsonSafely(raw);
    if (!result.language) result.language = "pt";
    return result;
}

async function analyzeGlobalDreamsLegacy(dreams, userId, language = "pt") {
    const payload = { userId, language, dreams };
    const raw = await callOpenAIText({
        systemPrompt: GLOBAL_ANALYSIS_PROMPT,
        userPrompt: `Analise este histórico:\n${JSON.stringify(payload)}`,
    });
    const result = parseJsonSafely(raw);
    if (!result.language) result.language = language;
    if (!result.phaseName && result.phaseTitle) result.phaseName = result.phaseTitle;
    return result;
}

// =========================
// Rotas
// =========================
const dreamRoutes = require("./src/routes/dreamRoutes.cjs");
app.use("/api/dreams", dreamRoutes);

// Compatibility Aliases
app.post("/api/analyze-deep", (req, res, next) => { req.url = "/analyze-deep"; dreamRoutes(req, res, next); });

app.post("/api/global-analysis", async (req, res) => {
    try {
        const body = req.body || {};
        // Híbrido: Array (App) vs String (Teste)
        if (Array.isArray(body.dreams)) {
            const result = await analyzeGlobalDreamsLegacy(body.dreams, body.userId || body.uid, body.language);
            return res.json({ success: true, analysis: result, data: result });
        }

        const text = body.dreamText || body.text || body.dream || body.sonho;
        if (!text) return res.status(400).json({ success: false, error: "Texto obrigatório." });

        const result = await interpretarSonhoIA(text, body.uid || body.userId);
        return res.json({ success: true, data: result });

    } catch (error) {
        console.error("[API Error /api/global-analysis]", error.message);
        const isAdminError = error.message.includes("OPENAI_API_KEY");
        return res.status(500).json({
            success: false,
            error: isAdminError ? error.message : "Erro ao processar análise."
        });
    }
});

// Legacy Interpretation Routes
const interpretHandler = async (req, res) => {
    try {
        const body = req.body || {};
        const text = body.dreamText || body.text;
        if (!text) return res.status(400).json({ error: "Texto obrigatório." });

        const result = await interpretarSonhoIA(text, body.uid);
        return req.path.includes("/api/")
            ? res.json({ success: true, data: result })
            : res.json(result);

    } catch (error) {
        console.error(`[API Error ${req.path}]`, error.message);
        res.status(500).json({ error: error.message || "Erro na interpretação." });
    }
};

app.post("/api/interpretarSonho", interpretHandler);
app.post("/interpretarSonho", interpretHandler);
app.post("/dreams/interpret", interpretHandler);

// 404 Fallback
app.use((req, res) => {
    res.status(404).json({ success: false, error: "Rota não encontrada." });
});

app.listen(port, () => {
    console.log(`DreamTells Backend running on port ${port}`);
});
