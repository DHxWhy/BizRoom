// backend/src/functions/meeting-voice.ts
// Audio relay: client WebSocket → Listener session
// Ref: Design Spec §7.3

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { voiceLiveManager } from "../services/VoiceLiveSessionManager.js";

// 500ms of PCM16 mono at 24kHz = 24000 bytes → ~32KB base64
const MAX_AUDIO_BASE64_LENGTH = 65_536;
const ROOM_ID_PATTERN = /^[A-Z0-9-]{4,12}$/i;

/** POST /api/voice/audio — relay audio chunk to Listener session */
async function relayAudio(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { roomId, audioBase64 } = (await request.json()) as {
    roomId: string;
    audioBase64: string;
  };

  if (!roomId || !audioBase64) {
    return { status: 400, jsonBody: { error: "roomId and audioBase64 required" } };
  }

  if (!ROOM_ID_PATTERN.test(roomId)) {
    return { status: 400, jsonBody: { error: "invalid roomId format" } };
  }

  if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    return { status: 413, jsonBody: { error: "audio chunk too large" } };
  }

  voiceLiveManager.relayAudio(roomId, audioBase64);
  return { status: 200, jsonBody: { success: true } };
}

app.http("voiceAudioRelay", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/voice/audio",
  handler: relayAudio,
});
