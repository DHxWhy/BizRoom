// backend/src/functions/voiceTranscribe.ts
// STT endpoint: receives audio blob, transcribes via OpenAI Whisper API
// Ref: Design Spec §7.3 — PTT fallback when Voice Live WebSocket is unavailable

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import OpenAI from "openai";
import { Readable } from "stream";
import { toFile } from "openai/uploads";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB — Whisper API hard limit

// Lazy singleton — avoids cold-start penalty when API key is missing
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "",
    });
  }
  return openaiClient;
}

/**
 * POST /api/voice/transcribe
 *
 * Accepts raw audio as multipart/form-data (field: "audio") or
 * application/octet-stream body. Returns { transcript: string }.
 *
 * Query params:
 *  - lang: BCP-47 language hint (default "en"), forwarded to Whisper
 *  - prompt: optional context hint to improve accuracy
 */
async function transcribeAudio(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  // Reject immediately if no API key is configured
  if (!process.env.OPENAI_API_KEY) {
    context.warn("[voiceTranscribe] OPENAI_API_KEY not set — transcription disabled");
    return {
      status: 503,
      jsonBody: { error: "STT service not configured" },
    };
  }

  const lang = request.query.get("lang") ?? "en";
  const promptHint = request.query.get("prompt") ?? "";

  let audioBuffer: ArrayBuffer;

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      // Browser FormData upload: audio file in "audio" field
      const form = await request.formData();
      const file = form.get("audio");
      if (!file || typeof file === "string") {
        return { status: 400, jsonBody: { error: "Missing 'audio' field in form data" } };
      }
      audioBuffer = await (file as File).arrayBuffer();
    } else {
      // Raw octet-stream / audio/* body
      audioBuffer = await request.arrayBuffer();
    }
  } catch (err) {
    context.error("[voiceTranscribe] Failed to read request body:", err);
    return { status: 400, jsonBody: { error: "Could not read audio body" } };
  }

  if (audioBuffer.byteLength === 0) {
    return { status: 400, jsonBody: { error: "Empty audio body" } };
  }

  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return { status: 413, jsonBody: { error: "Audio too large (max 25 MB)" } };
  }

  try {
    const openai = getOpenAI();

    // Wrap ArrayBuffer in a Node.js Readable so openai SDK can stream it
    const uint8 = new Uint8Array(audioBuffer);
    const readable = Readable.from(Buffer.from(uint8));

    // toFile wraps the readable into a File-like object the SDK accepts
    const audioFile = await toFile(readable, "audio.webm", {
      type: "audio/webm",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: lang,
      response_format: "json",
      // Optional grounding prompt: helps Whisper recognize domain vocabulary
      ...(promptHint ? { prompt: promptHint } : {}),
    });

    context.log(
      `[voiceTranscribe] OK — lang=${lang} chars=${transcription.text.length}`,
    );

    return {
      status: 200,
      jsonBody: { transcript: transcription.text },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    context.error("[voiceTranscribe] Whisper API error:", msg);
    return {
      status: 502,
      jsonBody: { error: "Transcription failed", detail: msg },
    };
  }
}

app.http("voiceTranscribe", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/voice/transcribe",
  handler: transcribeAudio,
});
