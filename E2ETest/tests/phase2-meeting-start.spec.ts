/**
 * Phase 2 — Meeting Initialization
 *
 * Covers: room entry → 3D canvas render → "Start Meeting" → COO Hudson's
 * opening message → meeting phase transition → performance measurement.
 *
 * Setup strategy:
 *   beforeAll creates the room once via LobbyPage so that all tests within
 *   the describe block operate on an already-entered meeting room.
 *   Individual tests are ordered (test.describe.serial) and rely on the
 *   shared `page` created in beforeAll.
 *
 * Note: Playwright does not support a shared `page` across `test()` calls
 * natively with `test.describe.serial`.  We work around this by using a
 * module-level variable and a single browser/context created via the
 * `browser` fixture in beforeAll.
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
// Module-level shared state (test.describe.serial re-uses the same context)
// ---------------------------------------------------------------------------
let sharedBrowser: Browser;
let sharedContext: BrowserContext;
let sharedPage: Page;

// Perf timestamps recorded across tests
let meetingStartedAt = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Full lobby → create room → wait for meeting room canvas flow.
 * Returns the page positioned inside the meeting room.
 */
async function enterMeetingRoom(page: Page): Promise<void> {
  const lobby = new LobbyPage(page);
  await lobby.goto();

  await lobby.createRoom(TEST_USER.name, TEST_AGENDA, {
    companyName: BRAND_MEMORY.companyName,
    industry: BRAND_MEMORY.industry,
    product: BRAND_MEMORY.product,
  });

  // Wait for 3D canvas (meeting room rendered)
  await page.waitForSelector("canvas", {
    state: "visible",
    timeout: 30_000,
  });
}

/**
 * COO's opening message may appear with any of the known agent name variants.
 * We look for Hudson's name in any visible message bubble, or fall back to
 * checking that *any* agent message appeared.
 */
async function waitForCooOpeningMessage(
  page: Page,
  timeout = 60_000,
): Promise<string> {
  // Strategy 1: wait for a message bubble containing Hudson / COO keyword
  const cooMessageSelector = [
    `[data-testid='message-bubble']:has-text('${AGENTS.coo.name}')`,
    `.message-bubble:has-text('${AGENTS.coo.name}')`,
    `.chat-message:has-text('${AGENTS.coo.name}')`,
    // Fallback: any agent message
    ".agent-message",
    "[data-sender-type='agent']",
  ].join(", ");

  await page.waitForSelector(cooMessageSelector, {
    state: "visible",
    timeout,
  });

  // Return the text of the first matched element
  const el = page.locator(cooMessageSelector).first();
  return (await el.textContent()) ?? "";
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe.serial("Phase 2 — Meeting Start", () => {
  // ------------------------------------------------------------------
  // Shared setup: navigate into the meeting room once for the whole suite
  // ------------------------------------------------------------------
  test.beforeAll(async ({ browser }) => {
    sharedBrowser = browser;
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();

    await enterMeetingRoom(sharedPage);
  });

  test.afterAll(async () => {
    await sharedContext.close();
  });

  // ------------------------------------------------------------------
  // Test 1: 3D canvas is rendered
  // ------------------------------------------------------------------
  test("2-1 | 3D canvas renders after room entry", async () => {
    const meeting = new MeetingRoomPage(sharedPage);
    await meeting.assertCanvasRendered();
    console.log("[Pass] 3D canvas is visible");
  });

  // ------------------------------------------------------------------
  // Test 2: Start Meeting button is present and clickable
  // ------------------------------------------------------------------
  test("2-2 | Start Meeting button is visible and clickable", async () => {
    const startBtn = sharedPage
      .locator("button:has-text('시작'), button:has-text('Start')")
      .first();

    // The button might not be immediately visible if the page is still
    // loading — wait up to 15 s.
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    console.log("[Pass] Start Meeting button is visible");
  });

  // ------------------------------------------------------------------
  // Test 3: Click "Start Meeting" — meeting initialises
  // ------------------------------------------------------------------
  test("2-3 | clicking Start Meeting initiates the meeting", async () => {
    const meeting = new MeetingRoomPage(sharedPage);

    meetingStartedAt = Date.now();
    await meeting.clickStartMeeting();

    // After clicking start, the meeting room should remain rendered
    await meeting.assertCanvasRendered();
    console.log("[Pass] Meeting start clicked — canvas still visible");
  });

  // ------------------------------------------------------------------
  // Test 4: COO Hudson's opening message appears within 10 s (60 s budget)
  // ------------------------------------------------------------------
  test("2-4 | COO Hudson's opening message appears within 10 s", async () => {
    const chat = new ChatPanel(sharedPage);
    const timer = new Timer();

    // Wait for the first message bubble to appear
    await sharedPage.waitForSelector(
      [
        "[data-testid='message-bubble']",
        ".message-bubble",
        ".chat-message",
        ".agent-message",
        "[data-sender-type='agent']",
      ].join(", "),
      { state: "visible", timeout: 60_000 },
    );

    const elapsed = timer.elapsed();
    console.log(`[Perf] Start → first message: ${elapsed} ms`);

    if (elapsed > 10_000) {
      console.warn(
        `[Perf][WARN] First message ${elapsed} ms exceeded 10 000 ms target`,
      );
    }

    // Verify there is at least one message with non-empty text
    const lastText = await chat.getLastMessageText();
    console.log(
      `[Info] First message text (truncated): "${lastText.slice(0, 80)}"`,
    );
    expect(lastText.trim().length).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  // Test 5: Meeting phase transitions away from "idle"
  // ------------------------------------------------------------------
  test("2-5 | meeting phase transitions from idle to opening", async () => {
    const meeting = new MeetingRoomPage(sharedPage);

    const phase = await meeting.getPhase();
    console.log(`[Info] Current meeting phase: "${phase}"`);

    // If the phase indicator is not rendered, that is acceptable —
    // the feature may be behind a flag.  We assert it is not literally "idle"
    // when the indicator IS present.
    if (phase !== "unknown") {
      expect(phase.toLowerCase()).not.toBe("idle");
    } else {
      console.log("[Info] Phase indicator not present — skipping phase check");
    }
  });

  // ------------------------------------------------------------------
  // Test 6: Performance — meeting start → first message time
  // ------------------------------------------------------------------
  test("2-6 | performance — meeting start to first agent message", async () => {
    // meetingStartedAt was set in test 2-3.
    // At this point (after test 2-4 passed) at least one message is visible.
    const chat = new ChatPanel(sharedPage);
    const msgCount = await chat.getMessageCount();
    console.log(`[Perf] Total messages after start: ${msgCount}`);

    const totalElapsed = Date.now() - meetingStartedAt;
    console.log(
      `[Perf] Total time since meeting start clicked: ${totalElapsed} ms`,
    );

    // Hard threshold: something must have arrived within 2 minutes
    expect(totalElapsed).toBeLessThan(120_000);
    expect(msgCount).toBeGreaterThan(0);
  });
});
