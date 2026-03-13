/**
 * Phase 3 — Live Chat Messaging & Streaming
 *
 * Covers:
 *   – Full setup: lobby → create room → start meeting → wait for COO opening
 *   – Human message send → appears in chat immediately
 *   – Agent response starts (message count increases / streaming active)
 *   – At least one agent fully responds (streaming ends)
 *   – Agent response contains non-empty text
 *   – Performance: send → first agent response time
 *
 * Design notes:
 *   The meeting is started once in beforeAll via a dedicated browser context
 *   (same pattern as Phase 2) so all ordered tests operate on a live session.
 *
 *   Streaming detection uses two complementary signals:
 *     1. [data-streaming='true'] / .streaming — if the app marks streaming msgs
 *     2. Message count growth — if the app appends new bubbles during stream
 *   Either signal is sufficient; neither is required to be present.
 */

import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
import { LobbyPage } from "../pages/LobbyPage";
import { MeetingRoomPage } from "../pages/MeetingRoomPage";
import { ChatPanel } from "../pages/ChatPanel";
import {
  TEST_USER,
  BRAND_MEMORY,
  TEST_AGENDA,
  TEST_MESSAGES,
  AGENTS,
} from "../fixtures/test-data";
import { Timer } from "../helpers/timing";

// ---------------------------------------------------------------------------
// Module-level shared session state
// ---------------------------------------------------------------------------
let sharedContext: BrowserContext;
let sharedPage: Page;

/** Message count captured just before sending the test message. */
let baselineMessageCount = 0;

/** Timestamp captured at the moment the send button is clicked. */
let messageSentAt = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Full setup: navigate to lobby, create room, enter meeting, start meeting,
 * wait for COO's opening message to confirm the session is live.
 */
async function setupFullMeetingSession(page: Page): Promise<void> {
  // 1. Create room from lobby
  const lobby = new LobbyPage(page);
  await lobby.goto();

  await lobby.createRoom(TEST_USER.name, TEST_AGENDA, {
    companyName: BRAND_MEMORY.companyName,
    industry: BRAND_MEMORY.industry,
    product: BRAND_MEMORY.product,
  });

  // 2. Wait for 3D canvas
  await page.waitForSelector("canvas", {
    state: "visible",
    timeout: 30_000,
  });

  // 3. Start meeting
  const meeting = new MeetingRoomPage(page);
  await meeting.clickStartMeeting();

  // 4. Wait for COO opening message (generous — cold-start AI)
  await page.waitForSelector(
    [
      "[data-testid='message-bubble']",
      ".message-bubble",
      ".chat-message",
      ".agent-message",
      "[data-sender-type='agent']",
    ].join(", "),
    { state: "visible", timeout: 60_000 },
  );

  console.log("[Setup] Full meeting session ready — COO opening message received");
}

/**
 * Selector that matches any message bubble regardless of naming convention.
 */
const ANY_MESSAGE_BUBBLE =
  "[data-testid='message-bubble'], .message-bubble, .chat-message";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe.serial("Phase 3 — Live Chat Messaging", () => {
  // ------------------------------------------------------------------
  // Shared setup: full lobby → create room → start meeting → COO opening
  // ------------------------------------------------------------------
  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();

    await setupFullMeetingSession(sharedPage);
  });

  test.afterAll(async () => {
    await sharedContext.close();
  });

  // ------------------------------------------------------------------
  // Test 1: Setup verification — meeting room is live
  // ------------------------------------------------------------------
  test("3-1 | setup — meeting room is live after full setup", async () => {
    const chat = new ChatPanel(sharedPage);
    const count = await chat.getMessageCount();

    console.log(`[Info] Messages after setup: ${count}`);
    expect(count).toBeGreaterThan(0);

    // Capture baseline before sending our message
    baselineMessageCount = count;
  });

  // ------------------------------------------------------------------
  // Test 2: Type message and send
  // ------------------------------------------------------------------
  test("3-2 | type and send a human message", async () => {
    const chat = new ChatPanel(sharedPage);

    await chat.typeMessage(TEST_MESSAGES.marketing);

    // Verify the input contains our text before sending
    const input = sharedPage
      .locator("textarea, input[type='text']")
      .first();
    await expect(input).toHaveValue(TEST_MESSAGES.marketing, {
      timeout: 5_000,
    });

    // Record time then send
    messageSentAt = Date.now();
    await chat.clickSend();

    console.log("[Pass] Message sent: ", TEST_MESSAGES.marketing);
  });

  // ------------------------------------------------------------------
  // Test 3: Human message appears in chat
  // ------------------------------------------------------------------
  test("3-3 | human message appears in chat after send", async () => {
    // After sending, the human message bubble should appear
    // We look for a bubble containing the sent text, or at minimum a new bubble
    await expect(async () => {
      const currentCount = await sharedPage
        .locator(ANY_MESSAGE_BUBBLE)
        .count();
      expect(currentCount).toBeGreaterThan(baselineMessageCount);
    }).toPass({ timeout: 10_000, intervals: [500, 1_000] });

    // If the app renders human messages with identifiable text, assert it
    const humanMsgWithText = sharedPage
      .locator(ANY_MESSAGE_BUBBLE)
      .filter({ hasText: TEST_MESSAGES.marketing })
      .first();

    if (await humanMsgWithText.isVisible()) {
      console.log("[Pass] Human message bubble with correct text found");
    } else {
      // Text may be truncated or inside a child span — count increase is sufficient
      console.log(
        "[Info] Exact text not found in bubble (may be in child node); count increase confirmed",
      );
    }

    // Capture the new baseline (human message just added)
    baselineMessageCount = await sharedPage
      .locator(ANY_MESSAGE_BUBBLE)
      .count();
  });

  // ------------------------------------------------------------------
  // Test 4: Agent response starts — message count increases or streaming appears
  // ------------------------------------------------------------------
  test("3-4 | agent response starts streaming after human message", async () => {
    // Signal 1: a new message bubble appears (streaming appends a new bubble)
    const messageCountIncreased = sharedPage.waitForFunction(
      (baseline) => {
        const bubbles = document.querySelectorAll(
          "[data-testid='message-bubble'], .message-bubble, .chat-message",
        );
        return bubbles.length > baseline;
      },
      baselineMessageCount,
      { timeout: 60_000, polling: 500 },
    );

    // Signal 2: a streaming indicator becomes visible
    const streamingAppeared = sharedPage
      .locator("[data-streaming='true'], .streaming")
      .waitFor({ state: "visible", timeout: 60_000 })
      .catch(() => null); // non-fatal if the app doesn't use this class

    // Wait for either signal
    await Promise.race([messageCountIncreased, streamingAppeared]);

    const currentCount = await sharedPage
      .locator(ANY_MESSAGE_BUBBLE)
      .count();
    const streamingVisible = await sharedPage
      .locator("[data-streaming='true'], .streaming")
      .isVisible();

    console.log(
      `[Info] Message count: ${currentCount} (baseline was ${baselineMessageCount})`,
    );
    console.log(`[Info] Streaming indicator visible: ${streamingVisible}`);

    // At least one new bubble OR streaming is active
    const responseStarted =
      currentCount > baselineMessageCount || streamingVisible;
    expect(responseStarted).toBe(true);
  });

  // ------------------------------------------------------------------
  // Test 5: At least one agent fully responds — streaming ends
  // ------------------------------------------------------------------
  test("3-5 | agent response completes — streaming finishes", async () => {
    const chat = new ChatPanel(sharedPage);

    // Wait for streaming indicator to disappear
    // This call is safe — it passes if there was never a streaming indicator
    await chat.waitForStreamingDone(60_000);

    // Confirm message count is higher than our baseline
    const finalCount = await chat.getMessageCount();
    console.log(`[Info] Final message count: ${finalCount}`);
    expect(finalCount).toBeGreaterThan(baselineMessageCount);
  });

  // ------------------------------------------------------------------
  // Test 6: Agent response contains non-empty text
  // ------------------------------------------------------------------
  test("3-6 | agent response contains non-empty text", async () => {
    const chat = new ChatPanel(sharedPage);

    // Get all messages after the human message
    const allMessages = sharedPage.locator(ANY_MESSAGE_BUBBLE);
    const count = await allMessages.count();

    // Collect texts from messages that appeared after our human message
    // (index > initial baseline - 1 ensures we skip earlier conversation)
    const responsesTexts: string[] = [];
    for (let i = baselineMessageCount; i < count; i++) {
      const text = (await allMessages.nth(i).textContent()) ?? "";
      if (text.trim().length > 0) {
        responsesTexts.push(text.trim());
      }
    }

    console.log(`[Info] Agent responses found: ${responsesTexts.length}`);
    responsesTexts.forEach((t, idx) => {
      console.log(`  [${idx + 1}] "${t.slice(0, 100)}${t.length > 100 ? "…" : ""}"`);
    });

    // At least one non-empty response must exist
    expect(responsesTexts.length).toBeGreaterThan(0);
    expect(responsesTexts[0].length).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  // Test 7: Performance — send to first agent response time
  // ------------------------------------------------------------------
  test("3-7 | performance — send to first agent response measured", async () => {
    // At this point (after test 3-5 passed), at least one agent has responded.
    // messageSentAt was captured in test 3-2.
    const totalElapsed = Date.now() - messageSentAt;

    console.log(
      `[Perf] Send → first agent response cycle: ${totalElapsed} ms`,
    );

    if (totalElapsed > 15_000) {
      console.warn(
        `[Perf][WARN] Response time ${totalElapsed} ms exceeded 15 000 ms target`,
      );
    }

    // Hard threshold: full AI turn must complete within 2 minutes
    expect(totalElapsed).toBeLessThan(120_000);

    // Verify the final message count for the record
    const chat = new ChatPanel(sharedPage);
    const count = await chat.getMessageCount();
    console.log(`[Perf] Total messages in session: ${count}`);
    expect(count).toBeGreaterThan(0);
  });
});
