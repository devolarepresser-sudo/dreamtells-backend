const { Router } = require("express");
const {
    interpretDream,
    generateDeepQuestions,
    generateDeepAnalysis,
    generateGlobalAnalysis
} = require("../services/dreamInterpreter.cjs");

const router = Router();

/* =========================
   INTERPRETAÇÃO SIMPLES
========================= */
router.post("/interpret", async (req, res) => {
    try {
        const { text, dreamText, language = "pt" } = req.body;

        const finalText = text || dreamText;
        if (!finalText || typeof finalText !== "string") {
            return res.status(400).json({ error: "Campo 'text' ou 'dreamText' é obrigatório." });
        }

        console.log(`[API] /interpret usando campo: ${text ? "text" : "dreamText"}`);

        const interpretation = await interpretDream(finalText, language);
        return res.json({ interpretation });
    } catch (error) {
        console.error("Erro na rota /interpret:", error);
        return res.status(500).json({ error: "Erro ao interpretar o sonho." });
    }
});

/* =========================
   PERGUNTAS PROFUNDAS
========================= */
router.post("/deep-questions", async (req, res) => {
    try {
        const { text, dreamText, language = "pt" } = req.body;

        const finalText = text || dreamText;
        if (!finalText) {
            return res.status(400).json({ error: "Texto do sonho obrigatório." });
        }

        console.log(`[API] /deep-questions usando campo: ${text ? "text" : "dreamText"}`);

        const questions = await generateDeepQuestions(finalText, language);
        return res.json({ questions });
    } catch (error) {
        console.error("Erro na rota /deep-questions:", error);
        return res.status(500).json({ error: "Erro ao gerar perguntas." });
    }
});

/* =========================
   ANÁLISE PROFUNDA
========================= */
router.post("/analyze-deep", async (req, res) => {
    try {
        const {
            dreamText,
            text,
            initialInterpretation,
            userAnswers,
            language = "pt"
        } = req.body;

        const finalText = dreamText || text;
        if (!finalText) {
            return res.status(400).json({ error: "Texto do sonho obrigatório." });
        }

        console.log(`[API] /analyze-deep usando campo: ${dreamText ? "dreamText" : "text"}`);

        const analysis = await generateDeepAnalysis(
            finalText,
            initialInterpretation,
            userAnswers,
            language
        );

        return res.json({ analysis });
    } catch (error) {
        console.error("Erro na rota /analyze-deep:", error);
        return res.status(500).json({
            error: "Erro ao gerar análise aprofundada.",
            details: error.message
        });
    }
});

/* =========================
   ANÁLISE GLOBAL / FASES
========================= */
router.post("/global-analysis", async (req, res) => {
    try {
        const { dreams, language = "pt" } = req.body;

        if (!dreams || !Array.isArray(dreams)) {
            return res.status(400).json({ error: "Lista de sonhos obrigatória." });
        }

        const analysis = await generateGlobalAnalysis(dreams, language);
        return res.json({ analysis });
    } catch (error) {
        console.error("Erro na rota /global-analysis:", error);
        return res.status(500).json({
            error: "Erro ao gerar análise global do inconsciente.",
            details: error.message
        });
    }
});

module.exports = router;
