// OpenAI Realtime API benchmark via WebSocket
import WebSocket from "ws";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("OPENAI_API_KEY not set");
  process.exit(1);
}

const MODEL = process.env.RT_MODEL || "gpt-4o-realtime-preview";
const URL = `wss://api.openai.com/v1/realtime?model=${MODEL}`;
const PROMPT = "Q2 marketing budget 30M KRW, suggest channel allocation strategy. Answer in Korean, 3 sentences.";
const SYSTEM = "You are Hudson, COO of a company. Respond concisely in Korean.";

async function benchmark() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let firstDeltaTime = 0;
    let fullText = "";
    let tokenCount = 0;

    const ws = new WebSocket(URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Timeout 30s"));
    }, 30000);

    ws.on("open", () => {
      // Configure session
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text"],
          instructions: SYSTEM,
          temperature: 0.6,
        },
      }));

      // Send user message
      ws.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: PROMPT }],
        },
      }));

      // Request response
      ws.send(JSON.stringify({ type: "response.create" }));
    });

    ws.on("message", (data) => {
      const event = JSON.parse(data.toString());

      if (event.type === "response.text.delta") {
        if (!firstDeltaTime) firstDeltaTime = Date.now();
        fullText += event.delta || "";
        tokenCount++;
      }

      if (event.type === "response.text.done") {
        fullText = event.text || fullText;
      }

      if (event.type === "response.done") {
        clearTimeout(timeout);
        ws.close();
        const totalTime = Date.now() - t0;
        const ttfb = firstDeltaTime ? firstDeltaTime - t0 : totalTime;
        resolve({ totalTime, ttfb, fullText, tokenCount, model: MODEL });
      }

      if (event.type === "error") {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(JSON.stringify(event.error)));
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

console.log(`=== OpenAI Realtime: ${MODEL} ===`);
try {
  const result = await benchmark();
  console.log(`TTFB: ${result.ttfb}ms`);
  console.log(`Total: ${result.totalTime}ms`);
  console.log(`Deltas: ${result.tokenCount}`);
  console.log(`Output: ${result.fullText.slice(0, 200)}`);
} catch (err) {
  console.log(`Error: ${err.message}`);
}
