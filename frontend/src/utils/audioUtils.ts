// Audio utilities for Voice Live integration
// Ref: Design Spec §7.3 (PCM16 encoding), §8.3 (playback)

const TARGET_SAMPLE_RATE = 24000; // Voice Live API requirement

/**
 * Convert Float32Array audio samples to PCM16 Int16Array.
 * Voice Live API requires PCM16 at 24kHz mono.
 */
export function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

/**
 * Convert Int16Array PCM16 to base64 string for WebSocket transmission.
 */
export function pcm16ToBase64(pcm16: Int16Array): string {
  // Use byteOffset/byteLength to handle subarray views correctly
  const bytes = new Uint8Array(
    pcm16.buffer,
    pcm16.byteOffset,
    pcm16.byteLength,
  );
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decode base64 PCM16 audio to Float32Array for Web Audio API playback.
 */
export function base64ToPcm16Float32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

/**
 * Create an AudioContext configured for Voice Live audio playback.
 * PCM16 24kHz mono.
 */
export function createPlaybackContext(): AudioContext {
  return new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
}

/**
 * Play a Float32Array audio chunk through an AudioContext.
 * Returns a promise that resolves when playback finishes.
 */
export function playAudioChunk(
  ctx: AudioContext,
  float32: Float32Array,
): Promise<void> {
  return new Promise((resolve) => {
    const buffer = ctx.createBuffer(1, float32.length, TARGET_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => resolve();
    source.start();
  });
}
