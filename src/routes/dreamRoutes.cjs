const { Router } = require("express");
const {
    interpretDream,
    generateDeepQuestions,
    generateDeepAnalysis,
    generateGlobalAnalysis,
    analyzeSymbol
} = require("../services/dreamInterpreter.cjs");

const router = Router();

router.post("/analyze-symbol", async (req, res) => {
    try {
        const { symbol, userId, language = "pt" } = req.body;
        const result = await analyzeSymbol(symbol, userId, language);
        return res.json({ analysis: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/interpret", async (req, res) => {
    try {
        const { text, dreamText, language = "pt" } = req.body;
        const finalText = text || dreamText;
        if (!finalText) return res.status(400).json({ error: "Texto obrigatório." });
        const result = await interpretDream(finalText, language);
        return res.json({ interpretation: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/deep-questions", async (req, res) => {
    try {
        const { text, dreamText, language = "pt" } = req.body;
        const result = await generateDeepQuestions(text || dreamText, language);
        return res.json({ questions: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/analyze-deep", async (req, res) => {
    try {
        const { dreamText, text, initialInterpretation, userAnswers, language = "pt" } = req.body;
        const result = await generateDeepAnalysis(dreamText || text, initialInterpretation, userAnswers, language);
        return res.json({ analysis: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/global-analysis", async (req, res) => {
    try {
        const { dreams, language = "pt" } = req.body;
        const result = await generateGlobalAnalysis(dreams, language);
        return res.json({ analysis: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
