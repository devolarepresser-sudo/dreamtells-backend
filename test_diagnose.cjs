const { openaiClient } = require("./src/services/openaiClient.cjs");

async function test() {
    console.log("Starting OpenAI Chat Diagnostic...");
    try {
        const response = await openaiClient.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: "Hello, can you hear me?" }],
            max_tokens: 10
        });
        console.log("Success! Response:", response.choices[0].message.content);
    } catch (e) {
        console.error("FAILED. Error:", e);
        if (e.response) {
            console.error("Data:", e.response.data);
            console.error("Status:", e.response.status);
        }
    }
}

test();
