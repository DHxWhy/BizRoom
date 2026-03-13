/**
 * Centralized API base URL for all backend calls.
 *
 * - Local dev: empty string (relative URLs → local Functions emulator)
 * - Production: full Functions app URL (set via VITE_API_BASE_URL env var)
 *
 * Usage: `fetch(\`\${API_BASE}/api/message\`, ...)`
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
    /\/$/,
    "",
  ) ?? "";
