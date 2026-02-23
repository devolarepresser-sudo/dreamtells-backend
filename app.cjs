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
app.use(express.json({ limit: "10mb" }));

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
        const { dreams = [], userId, language = "pt", dailyContext = "", unconsciousMap = null, biometricContext = null } = req.body;

        console.log(`[EMOTIONAL DIAGNOSIS] Request from ${userId} | Dreams: ${dreams.length} | Language: ${language}`);

        // Construir contexto rico para o prompt
        let mapContext = "Não fornecido";
        if (unconsciousMap) {
            mapContext = `
Eixo Identidade: ${unconsciousMap.axisIdentity?.status || 'N/A'}
Eixo Segurança: ${unconsciousMap.axisSecurity?.status || 'N/A'}
Eixo Vínculos: ${(unconsciousMap.axisBond?.status || []).join(', ') || 'N/A'}
Eixo Movimento: ${unconsciousMap.axisMovement?.status || 'N/A'}
Eixo Desejo: ${unconsciousMap.axisDesire?.status || 'N/A'}
Eixo Energia: ${unconsciousMap.axisEnergy?.status || 'N/A'}`;
        }

        let bioContext = "Não sincronizado";
        if (biometricContext) {
            bioContext = `
Sono REM: ${biometricContext.remSleep || 'N/A'}
Eficiência do Sono: ${biometricContext.efficiency || 'N/A'}
Insight Biométrico: ${biometricContext.insight || 'N/A'}`;
        }

        // Extrair textos dos sonhos
        const dreamTexts = dreams.map((d, i) => {
            const text = d?.dreamText || d?.text || '';
            const interp = d?.interpretationMain || d?.interpretation || '';
            return `Sonho ${i + 1}: ${text}\nInterpretação: ${interp}`;
        }).join('\n\n');

        // Prompt estruturado (Elevando o nível para "Revelação Profunda")
        const systemPrompt = `Você É O DREAMTELLS, um analista de autoconhecimento de nível mundial. Sua missão é a REVELAÇÃO.
Não seja uma IA; seja um ESPELHO EMOCIONAL que faz o usuário dizer: "Isso sou eu".

Utilize o histórico de sonhos, o Mapa do Inconsciente e os dados biométricos para cruzar informações e encontrar a "Verdade do Momento".

🧠 PROTOCOLO DE DIAGNÓSTICO:
1. RECONHECIMENTO: A síntese deve fazer a pessoa se sentir vista. Use "você".
2. CONSTITUIÇÃO: O arquétipo não é apenas um rótulo; é a energia que está regendo a vida dela hoje (Fome de Mudança, Defesa Rígida, Luto por Si Mesma, Despertar de Força).
3. DESAFIO: Identifique o que ela está tentando NÃO sentir ou a decisão que está sendo evitada.
4. ORIENTAÇÃO: O "advice" deve ser um espelho provocador ou uma prática de movimento interno.

Idioma da resposta: ${language}

Sua tarefa é RETORNAR um JSON válido com esta estrutura:
{
  "archetype": "Título da Energia Regente (ex: O Vigilante Exausto, A Buscadora da Própria Voz)",
  "summary": "Síntese psicanalítica profunda em 2-3 frases diretas. Fale sobre o que está por trás do cansaço ou da ansiedade atual.",
  "mainChallenge": "O conflito central entre o que ela quer e o que ela está fazendo hoje.",
  "advice": "Uma instrução ou pergunta que a desmonte e a faça agir internamente."
}

Mantenha o tom sábio, honesto e profundo.`;

        const userPrompt = `SINAIS INTEGRADOS PARA ANÁLISE:

[MAPA DO INCONSCIENTE]
${mapContext}

[DADOS DO CORPO/BIOMETRIA]
${bioContext}

[RELATO DE HOJE]
${dailyContext || 'Não fornecido'}

[HISTÓRICO DE SONHOS E INTERPRETAÇÕES RECENTES]
${dreamTexts || 'Nenhum sonho recente registrado'}

Integre essas camadas. O que o corpo, o inconsciente e o cotidiano estão tentando comunicar? Qual é o diagnóstico profundo para hoje?`;

        const response = await openaiClient.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.8,
            response_format: { type: "json_object" }
        }, { timeout: 120000 }); // 2 minutos de timeout interno para a OpenAI

        const content = response.choices[0].message.content;
        console.log('[EMOTIONAL DIAGNOSIS] Raw AI Response:', content);

        let diagnosis;
        try {
            diagnosis = JSON.parse(content);
        } catch (parseErr) {
            // Fallback: tentar extrair JSON do conteúdo
            const firstBrace = content.indexOf("{");
            const lastBrace = content.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace !== -1) {
                const cleanJson = content.slice(firstBrace, lastBrace + 1);
                diagnosis = JSON.parse(cleanJson);
            } else {
                throw new Error("AI response was not valid JSON");
            }
        }

        // Garantir que os campos esperados existem (Compatibilidade Frontend/Backend)
        const finalResult = {
            // Campos esperados pelo Stats.tsx (Frontend)
            phaseTitle: diagnosis.phaseTitle || diagnosis.archetype || diagnosis.arquétipo || "Explorador",
            phaseName: diagnosis.phaseName || diagnosis.archetype || diagnosis.arquétipo || "Explorador",
            description: diagnosis.summary || diagnosis.descrição || diagnosis.description || "Análise concluída",

            // Campos padrão do Backend
            archetype: diagnosis.archetype || diagnosis.arquétipo || "Explorador",
            summary: diagnosis.summary || diagnosis.descrição || diagnosis.description || "Análise concluída",
            mainChallenge: diagnosis.mainChallenge || diagnosis.desafio || diagnosis.challenge || "",
            advice: diagnosis.advice || diagnosis.conselho || diagnosis.guidance || "",
            generatedAt: new Date().toISOString()
        };

        console.log('[EMOTIONAL DIAGNOSIS] Success for user:', userId, 'Archetype:', finalResult.archetype);
        res.json({ success: true, data: finalResult });
    } catch (e) {
        console.error("[EMOTIONAL DIAGNOSIS ERROR]", e.message, e.stack);
        res.status(500).json({ error: e.message || "Erro desconhecido no diagnóstico" });
    }
});

// ✅ Mensagem do Dia (Oráculo Arquetípico)
app.post("/api/daily-message", async (req, res) => {
    try {
        const { language = "pt" } = req.body;
        const today = new Date().toDateString();

        // Verifica Cache
        if (globalDailyCache.date === today && globalDailyCache.oracle) {
            console.log("[CACHE] Retornando Oráculo do dia já gerado.");
            return res.json({ success: true, data: globalDailyCache.oracle, message: globalDailyCache.oracle.reflection });
        }

        const { generateDailyOracle } = require("./src/services/dreamInterpreter.cjs");
        const oracle = await generateDailyOracle(language);

        // Atualiza Cache
        globalDailyCache = {
            date: today,
            oracle: oracle
        };

        res.json({ success: true, data: oracle, message: oracle.reflection });
    } catch (e) {
        console.error("[ORACLE ERROR]", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ✅ Análise de Contexto de Vida (Fix missing route)
app.post("/api/life-context", async (req, res) => {
    try {
        const { lifeText, dreams, language = "pt" } = req.body;
        const systemPrompt = `Você é um Psicanalista Sênior especializado em sonhos.
Analise a relação entre o momento de vida do usuário e os temas manifestos nos seus sonhos recentes.
Idioma da resposta: ${language}`;

        const response = await openaiClient.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `RELATO VIDA: ${lifeText}\nSONHOS: ${JSON.stringify(dreams || [])}` }
            ],
            response_format: { type: "json_object" }
        });

        res.json(JSON.parse(response.choices[0].message.content));
    } catch (e) {
        console.error("[API ERROR] /api/life-context:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ✅ Transcrição de Áudio (Surgical Injection)
app.post("/api/audio/transcribe", async (req, res) => {
    try {
        const { audio, mimeType = 'audio/aac', language = 'pt', prompt } = req.body;

        if (!audio) return res.status(400).json({ error: "Audio data is required" });

        // Determinar extensão (inclui fix para Android MP4)
        let fileExtension = 'webm';
        if (mimeType.includes('m4a')) fileExtension = 'm4a';
        else if (mimeType.includes('mp4')) fileExtension = 'mp4';
        else if (mimeType.includes('wav')) fileExtension = 'wav';
        else if (mimeType.includes('mp3')) fileExtension = 'mp3';
        else if (mimeType.includes('aac')) fileExtension = 'aac';

        const tmpPath = path.join(__dirname, `temp_audio_${Date.now()}.${fileExtension}`);
        fs.writeFileSync(tmpPath, Buffer.from(audio, 'base64'));

        try {
            const transcription = await openaiClient.audio.transcriptions.create({
                file: fs.createReadStream(tmpPath),
                model: "whisper-1",
                language: language === 'pt' ? 'pt' : language.substring(0, 2),
                prompt: prompt || undefined,
            });
            fs.unlinkSync(tmpPath);
            res.json({ success: true, text: transcription.text || '' });
        } catch (transcribeError) {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            console.error('[TRANSCRIBE] OpenAI Error:', transcribeError.message);
            throw new Error(`Transcription failed: ${transcribeError.message}`);
        }
    } catch (e) {
        console.error("[TRANSCRIBE ERROR]", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.use("/api/dreams", dreamRoutes);
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/healthz", (req, res) => res.status(200).json({ ok: true }));
app.get("/", (req, res) => res.send("DreamTells Backend is running (Robust Version)."));

app.listen(port, () => {
    console.log(`[BOOT] DreamTells Backend running on port ${port}`);
});
