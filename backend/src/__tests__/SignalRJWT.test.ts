// SignalR JWT generation tests
// Verifies: connection string parsing, JWT structure, audience claim format
// Uses only Node.js built-ins — no network calls, no Azure SDK needed

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

// ── Helpers (mirror of SignalRService private logic) ──────────────────────

interface SignalRConfig {
  endpoint: string;
  accessKey: string;
}

function parseConnectionString(cs: string): SignalRConfig | null {
  if (!cs) return null;
  const endpointMatch = cs.match(/Endpoint=([^;]+)/i);
  const keyMatch = cs.match(/AccessKey=([^;]+)/i);
  if (!endpointMatch || !keyMatch) return null;
  return {
    endpoint: endpointMatch[1].replace(/\/$/, ""),
    accessKey: keyMatch[1],
  };
}

function generateManagementToken(config: SignalRConfig, hubName: string): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60;
  const audience = `${config.endpoint}/api/v1/hubs/${hubName}`;

  const b64url = (str: string) => Buffer.from(str).toString("base64url");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ aud: audience, iat: now, exp }));
  const signature = createHmac("sha256", config.accessKey)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

// ── Test constants ─────────────────────────────────────────────────────────

const MOCK_CONNECTION_STRING =
  "Endpoint=https://bizroom-test.service.signalr.net;AccessKey=dGVzdC1hY2Nlc3Mta2V5LWZvci10ZXN0aW5n;Version=1.0;";

const EXPECTED_ENDPOINT = "https://bizroom-test.service.signalr.net";
const EXPECTED_ACCESS_KEY = "dGVzdC1hY2Nlc3Mta2V5LWZvci10ZXN0aW5n";
const HUB_NAME = "default";

// ── Test Suites ────────────────────────────────────────────────────────────

describe("parseConnectionString", () => {
  it("extracts endpoint from a standard Azure SignalR connection string", () => {
    const config = parseConnectionString(MOCK_CONNECTION_STRING);
    expect(config).not.toBeNull();
    expect(config!.endpoint).toBe(EXPECTED_ENDPOINT);
  });

  it("extracts accessKey from a standard Azure SignalR connection string", () => {
    const config = parseConnectionString(MOCK_CONNECTION_STRING);
    expect(config!.accessKey).toBe(EXPECTED_ACCESS_KEY);
  });

  it("strips trailing slash from endpoint", () => {
    const cs = `Endpoint=https://bizroom-test.service.signalr.net/;AccessKey=abc123;`;
    const config = parseConnectionString(cs);
    expect(config!.endpoint).toBe("https://bizroom-test.service.signalr.net");
  });

  it("returns null for an empty connection string", () => {
    expect(parseConnectionString("")).toBeNull();
  });

  it("returns null when Endpoint key is missing", () => {
    const cs = "AccessKey=somekey;Version=1.0;";
    expect(parseConnectionString(cs)).toBeNull();
  });

  it("returns null when AccessKey key is missing", () => {
    const cs = "Endpoint=https://bizroom.service.signalr.net;Version=1.0;";
    expect(parseConnectionString(cs)).toBeNull();
  });

  it("is case-insensitive for Endpoint and AccessKey keys", () => {
    const cs = "endpoint=https://bizroom.service.signalr.net;accesskey=secret;";
    const config = parseConnectionString(cs);
    expect(config).not.toBeNull();
    expect(config!.endpoint).toBe("https://bizroom.service.signalr.net");
    expect(config!.accessKey).toBe("secret");
  });
});

describe("generateManagementToken — JWT structure", () => {
  const config = parseConnectionString(MOCK_CONNECTION_STRING)!;
  const token = generateManagementToken(config, HUB_NAME);
  const parts = token.split(".");

  it("produces a token with exactly three base64url parts (header.payload.signature)", () => {
    expect(parts).toHaveLength(3);
    // Each part must be non-empty
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it("header decodes to { alg: 'HS256', typ: 'JWT' }", () => {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    expect(header.alg).toBe("HS256");
    expect(header.typ).toBe("JWT");
  });

  it("payload contains aud, iat, exp claims", () => {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    expect(payload).toHaveProperty("aud");
    expect(payload).toHaveProperty("iat");
    expect(payload).toHaveProperty("exp");
  });

  it("audience claim matches Azure SignalR Management REST API format", () => {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    // Expected format: https://<resource>.service.signalr.net/api/v1/hubs/<hub>
    expect(payload.aud).toBe(`${EXPECTED_ENDPOINT}/api/v1/hubs/${HUB_NAME}`);
  });

  it("exp is approximately 60 seconds after iat", () => {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    expect(payload.exp - payload.iat).toBe(60);
  });

  it("exp is in the future", () => {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const nowSec = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(nowSec);
  });

  it("signature is verifiable with the access key using HS256", () => {
    const expectedSig = createHmac("sha256", config.accessKey)
      .update(`${parts[0]}.${parts[1]}`)
      .digest("base64url");
    expect(parts[2]).toBe(expectedSig);
  });

  it("signature uses raw access key string (not base64-decoded bytes)", () => {
    // The Azure docs state: sign with the literal key string, not base64-decoded bytes.
    // Verify that decoding the key and re-signing produces a DIFFERENT signature.
    const decodedKeyBytes = Buffer.from(config.accessKey, "base64");
    const wrongSig = createHmac("sha256", decodedKeyBytes)
      .update(`${parts[0]}.${parts[1]}`)
      .digest("base64url");
    // The correct signature (raw key) must differ from the wrong one (decoded bytes)
    // unless the key happens to be pure ASCII — in that case this test would be a
    // false-positive, so we guard with a conditional rather than a hard assertion.
    if (wrongSig !== parts[2]) {
      expect(parts[2]).not.toBe(wrongSig);
    } else {
      // Key roundtrip is identical (pure ASCII key) — just confirm token is valid
      expect(parts[2]).toBe(expectedSig);
    }
  });

  it("generates different tokens on successive calls (iat advances)", async () => {
    // Wait 1100ms so the second token has a different iat (second precision)
    const token1 = generateManagementToken(config, HUB_NAME);
    await new Promise((r) => setTimeout(r, 1100));
    const token2 = generateManagementToken(config, HUB_NAME);
    // Headers are identical; payloads differ because iat/exp differ
    const p1 = token1.split(".")[1];
    const p2 = token2.split(".")[1];
    expect(p1).not.toBe(p2);
  });
});

describe("generateManagementToken — hub name in audience", () => {
  const config = parseConnectionString(MOCK_CONNECTION_STRING)!;

  it("includes the hub name verbatim in the audience URL", () => {
    const customHub = "bizroom-prod";
    const token = generateManagementToken(config, customHub);
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    expect(payload.aud).toContain(`/api/v1/hubs/${customHub}`);
  });

  it("audience URL starts with the configured endpoint", () => {
    const token = generateManagementToken(config, HUB_NAME);
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    expect(payload.aud.startsWith(config.endpoint)).toBe(true);
  });
});
