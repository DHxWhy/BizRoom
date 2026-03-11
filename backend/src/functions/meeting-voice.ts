// backend/src/functions/meeting-voice.ts
// Audio relay: client WebSocket → Listener session
// Ref: Design Spec §7.3

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { voiceLiveManager } from "../services/VoiceLiveSessionManager.js";

/** POST /api/voice/audio — relay audio chunk to Listener session */
async function relayAudio(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { roomId, audioBase64 } = (await request.json()) as {
    roomId: string;
    audioBase64: string;
  };

  if (!roomId || !audioBase64) {
    return { status: 400, jsonBody: { error: "roomId and audioBase64 required" } };
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
