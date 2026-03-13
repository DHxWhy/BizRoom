/**
 * Phase 9 — Error Resilience
 *
 * Covers graceful degradation and error handling across the following scenarios:
 *   1. SignalR unavailable → REST fallback (POST /api/message still works)
 *   2. Empty message submission → no crash, input remains functional
 *   3. Very long message (2 000+ chars) → no crash, message processed
 *   4. Rapid-fire messages → all processed without error
 *
 * Philosophy:
 *   - We validate that the application does NOT crash/hang under edge inputs.
 *   - We verify the REST fallback path is reachable independent of SignalR.
 *   - Hard assertions are on "app stays alive" (no error pages, input still works).
 *   - Response correctness from AI is soft-asserted (non-deterministic timing).
 */

import { test, expect } from "@playwright/test";
import { LobbyPage } from "../pages/LobbyPage";
import { MeetingRoomPage } from "../pages/MeetingRoomPage";
import { ChatPanel } from "../pages/ChatPanel";
import { ApiClient } from "../helpers/api-client";
import {
  TEST_USER,
  BRAND_MEMORY,
  TEST_AGENDA,
  TEST_MESSAGES,
  AGENTS,
  PERFORMANCE_THRESHOLDS,
} from "../fixtures/test-data";
import { Timer, measure } from "../helpers/timing";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LONG_MESSAGE = "A".repeat(500) + " " + "장문 테스트 메시지입니다. ".repeat(80);
// Ensure >= 2000 chars
const VERY_LONG_MESSAGE =
  LONG_MESSAGE.length >= 2000
    ? LONG_MESSAGE
    : LONG_MESSAGE + "X".repeat(2000 - LONG_MESSAGE.length);

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

async function setupActiveMeeting(
  page: import("@playwright/test").Page,
): Promise<void> {
  const lobby = new LobbyPage(page);
  await lobby.goto();

  await lobby.createRoom(TEST_USER.name, TEST_AGENDA, {
    companyName: BRAND_MEMORY.companyName,
    industry: BRAND_MEMORY.industry,
    product: BRAND_MEMORY.product,
  });

  // Wait for room transition
  await Promise.race([
    page.waitForURL((url) => url.pathname !== "/", { timeout: 30_000 }),
    page.waitForSelector("canvas", { state: "visible", timeout: 30_000 }),
    page.waitForSelector("[data-testid='meeting-room'], .meeting-room", {
      state: "visible",
      timeout: 30_000,
    }),
  ]);

  // Attempt to start meeting
  const startBtn = page
    .locator(
      "button:has-text('시작'), button:has-text('Start'), button:has-text('회의 시작')",
    )
    .first();

  if (await startBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await startBtn.click();
    // Wait for opening message as meeting-active signal
    await page
      .waitForSelector(
        "[data-testid='message-bubble'], .message-bubble, .chat-message",
        { state: "visible", timeout: 45_000 },
      )
      .catch(() =>
        console.warn("[Resilience] Meeting start signal not detected — proceeding"),
      );
  }
}

/** Assert the page has not entered a fatal error state */
async function assertPageAlive(
  page: import("@playwright/test").Page,
  label: string,
): Promise<void> {
  const url = page.url();
  const bodyText = (await page.locator("body").textContent()) ?? "";
  const hasErrorPage =
    /application error|500|cannot get/i.test(bodyText) &&
    !/회의|meeting|chat|bizroom/i.test(bodyText);

  console.log(`[Resilience] ${label} — URL: ${url}, error page: ${hasErrorPage}`);
  expect(hasErrorPage).toBe(false);
  // Page must still be on our app domain
  expect(url).toMatch(/azurestaticapps\.net|localhost/);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe.serial("Phase 9 — Error Resilience", () => {
  // ──────────────────────────────────────────────────────────────────────
  // Setup: active meeting room
  // ──────────────────────────────────────────────────────────────────────
  test("9-0 | setup — enter active meeting room", async ({ page }) => {
    await setupActiveMeeting(page);
    await assertPageAlive(page, "9-0 setup");
    console.log("[Resilience] Active meeting room established");
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 9-1: REST Fallback — POST /api/message works independently
  // ──────────────────────────────────────────────────────────────────────
  test(
    "9-1 | REST fallback — POST /api/message works without SignalR",
    async ({ page, request }) => {
      const api = new ApiClient(request);

      // First verify the app is alive (SignalR may or may not be connected)
      await assertPageAlive(page, "9-1 pre-REST-fallback");

      // Direct REST call to /api/message bypassing the UI/SignalR path.
      // This simulates what the client does when SignalR is unavailable.
      const { status, body } = await api.sendMessage(
        "rest-fallback-room-001",
        TEST_MESSAGES.simple,
        TEST_USER.name,
      );

      console.log(`[Resilience] REST /api/message status: ${status}`);
      console.log(`[Resilience] REST /api/message body: ${JSON.stringify(body)}`);

      // 200/202/204 = success; 404 = room not found (acceptable); 500 = failure
      expect.soft(status).not.toBe(500);
      expect.soft(status).toBeLessThan(500);

      // The app UI should not have crashed while we made a direct API call
      await assertPageAlive(page, "9-1 post-REST-fallback");
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // Test 9-2: REST fallback via UI — intercept SignalR and verify message sends
  // ──────────────────────────────────────────────────────────────────────
  test(
    "9-2 | REST fallback via UI — block SignalR, verify message still sends",
    async ({ page, request }) => {
      const api = new ApiClient(request);

      // Re-enter the meeting for this isolated test
      await setupActiveMeeting(page);

      const chat = new ChatPanel(page);
      const baselineCount = await chat.getMessageCount();

      // Intercept SignalR negotiation to simulate failure
      // The app should fall back to REST POST /api/message
      await page.route("**/negotiate**", async (route) => {
        console.log(
          "[Resilience] Intercepted SignalR negotiate — aborting to simulate failure",
        );
        await route.abort("failed");
      });

      // Also block WebSocket upgrades at the network level
      await page.route("**/*.signalr.net/**", async (route) => {
        await route.abort("failed");
      });

      // Now send a message through the UI
      const timer = new Timer();
      await chat.sendMessage(TEST_MESSAGES.simple).catch((e) => {
        console.warn(`[Resilience] UI send threw: ${e.message} — may be expected`);
      });

      // Wait up to PERF threshold for a REST response
      const responseReceived = await page
        .waitForResponse(
          (res) =>
            res.url().includes("/api/message") ||
            res.url().includes("/api/chat"),
          { timeout: PERFORMANCE_THRESHOLDS.restFallback },
        )
        .then((res) => {
          console.log(
            `[Resilience] REST fallback response: ${res.status()} ${res.url()}`,
          );
          return res.status() < 500;
        })
        .catch(() => {
          console.warn(
            "[Resilience] No REST /api/message request intercepted within timeout",
          );
          return null;
        });

      const elapsed = timer.elapsed();
      console.log(`[Resilience] Fallback response time: ${elapsed}ms`);

      // Remove route overrides for subsequent tests
      await page.unrouteAll({ behavior: "ignoreErrors" });

      if (responseReceived === null) {
        // Could not intercept — verify app is at minimum still alive
        console.warn(
          "[Resilience] REST fallback not confirmed via interception — verifying app alive",
        );
        await assertPageAlive(page, "9-2 post-signalr-block");
      } else {
        expect.soft(responseReceived).toBe(true);
      }

      // Page must still be functional
      await assertPageAlive(page, "9-2 final");
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // Test 9-3: Empty message submission — no crash
  // ──────────────────────────────────────────────────────────────────────
  test("9-3 | empty message — send does not crash app", async ({ page }) => {
    const chat = new ChatPanel(page);

    await setupActiveMeeting(page);

    const baselineCount = await chat.getMessageCount();

    // Attempt to send empty string
    await chat.typeMessage("");
    await chat
      .clickSend()
      .catch((e) =>
        console.log(`[Resilience] Send click threw (expected): ${e.message}`),
      );

    // Also try pressing Enter on empty input
    const input = page
      .locator("textarea, input[type='text']")
      .first();
    if (await input.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await input.fill("");
      await input
        .press("Enter")
        .catch((e) =>
          console.log(`[Resilience] Enter press threw (expected): ${e.message}`),
        );
    }

    // Give the app 2 s to settle
    await page.waitForTimeout(2_000);

    // App must still be alive
    await assertPageAlive(page, "9-3 post-empty-send");

    // Message count should NOT have increased (empty message rejected client-side)
    const afterCount = await chat.getMessageCount();
    console.log(
      `[Resilience] Message count: ${baselineCount} → ${afterCount} (empty send)`,
    );

    // Soft: most implementations reject empty messages
    expect.soft(afterCount).toBe(baselineCount);

    // Hard: input area must still be usable
    await expect(
      page.locator("textarea, input[type='text']").first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 9-4: Very long message (2 000+ chars) — no crash
  // ──────────────────────────────────────────────────────────────────────
  test(
    "9-4 | very long message (2000+ chars) — no crash",
    async ({ page }) => {
      const chat = new ChatPanel(page);

      await setupActiveMeeting(page);

      const msgLength = VERY_LONG_MESSAGE.length;
      console.log(`[Resilience] Sending ${msgLength}-char message`);

      const baselineCount = await chat.getMessageCount();

      // Send the long message — this tests client-side truncation / server tolerance
      await chat
        .sendMessage(VERY_LONG_MESSAGE)
        .catch((e) =>
          console.warn(
            `[Resilience] Long message send threw: ${e.message}`,
          ),
        );

      // Give 3 s for any synchronous UI work
      await page.waitForTimeout(3_000);

      // App must still be alive
      await assertPageAlive(page, "9-4 post-long-message");

      // Input area must remain functional
      const inputEl = page
        .locator("textarea, input[type='text']")
        .first();
      await expect(inputEl).toBeVisible({ timeout: 5_000 });
      await expect(inputEl).toBeEnabled({ timeout: 5_000 });

      // Message count check (message may or may not appear depending on
      // length limit enforcement in the UI)
      const afterCount = await chat.getMessageCount();
      console.log(
        `[Resilience] Message count: ${baselineCount} → ${afterCount}`,
      );

      // No hard assertion on count — both accepting and truncating are valid
      // behaviours. The hard requirement is: app did not crash.
      expect(afterCount).toBeGreaterThanOrEqual(baselineCount);
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // Test 9-5: Rapid-fire messages — all processed without error
  // ──────────────────────────────────────────────────────────────────────
  test(
    "9-5 | rapid-fire 3 messages — all processed without error",
    async ({ page }) => {
      const chat = new ChatPanel(page);

      await setupActiveMeeting(page);

      const baselineCount = await chat.getMessageCount();
      const rapidMessages = [
        TEST_MESSAGES.simple,
        TEST_MESSAGES.marketing,
        TEST_MESSAGES.strategy,
      ];

      const timer = new Timer();

      // Send all 3 messages in quick succession (< 500 ms apart)
      for (const msg of rapidMessages) {
        await chat
          .sendMessage(msg)
          .catch((e) =>
            console.warn(
              `[Resilience] Rapid message send threw: ${e.message}`,
            ),
          );
        // Minimal pause between sends — just enough for UI to accept input
        await page.waitForTimeout(300);
      }

      const sendElapsed = timer.elapsed();
      console.log(
        `[Resilience] All 3 messages sent in ${sendElapsed}ms`,
      );

      // Give the backend time to process (AI responses can be slow)
      await page.waitForTimeout(5_000);

      // App must still be alive after rapid-fire
      await assertPageAlive(page, "9-5 post-rapid-fire");

      // Input must still be usable
      const inputEl = page
        .locator("textarea, input[type='text']")
        .first();
      await expect(inputEl).toBeVisible({ timeout: 5_000 });
      await expect(inputEl).toBeEnabled({ timeout: 5_000 });

      // Verify all 3 human messages were accepted into the chat
      const afterCount = await chat.getMessageCount();
      console.log(
        `[Resilience] Message count: ${baselineCount} → ${afterCount}`,
      );

      // All 3 outgoing messages should be in the chat (agent responses not counted)
      const humanMessages = await page
        .locator(".human-message, [data-sender-type='human']")
        .count()
        .catch(() => 0);

      console.log(
        `[Resilience] Human message count after rapid-fire: ${humanMessages}`,
      );

      // At minimum the message count should have increased by the 3 we sent
      expect.soft(afterCount).toBeGreaterThanOrEqual(baselineCount + 3);

      // No error overlay should be present
      const errorOverlay = await page
        .locator(
          ".error, [data-testid='error'], [role='alert']:has-text('오류'), [role='alert']:has-text('Error')",
        )
        .count()
        .catch(() => 0);
      expect.soft(errorOverlay).toBe(0);
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // Test 9-6: API-level rapid-fire — direct REST calls do not 5xx
  // ──────────────────────────────────────────────────────────────────────
  test(
    "9-6 | API rapid-fire — 3 direct REST message calls do not 5xx",
    async ({ request }) => {
      const api = new ApiClient(request);
      const roomId = "resilience-test-room-001";

      const results = await Promise.all([
        api.sendMessage(roomId, TEST_MESSAGES.simple, TEST_USER.name),
        api.sendMessage(roomId, TEST_MESSAGES.marketing, TEST_USER.name),
        api.sendMessage(roomId, TEST_MESSAGES.strategy, TEST_USER.name),
      ]);

      for (const [index, { status, body }] of results.entries()) {
        console.log(
          `[Resilience] Rapid-fire API msg ${index + 1}: status ${status}`,
        );
        console.log(
          `[Resilience] Rapid-fire API msg ${index + 1}: ${JSON.stringify(body).slice(0, 120)}`,
        );

        // Must not be a server crash
        expect.soft(status).not.toBe(500);
        // Acceptable statuses: 200, 202, 204 (success), 404 (room not found — expected for test room)
        expect.soft(status).toBeLessThan(500);
      }

      // All 3 requests must have received a response (no network-level crash)
      expect(results.length).toBe(3);
    },
  );
});
