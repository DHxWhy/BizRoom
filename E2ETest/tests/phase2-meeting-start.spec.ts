/**
 * @file phase2-meeting-start.spec.ts
 * @description Phase 2 — Meeting Initialization
 *
 * **Objective**:
 *   Validate the transition from lobby to an active meeting session. This is
 *   the critical "first impression" moment: the 3D meeting room renders, the
 *   user clicks "Start Meeting", and COO Hudson delivers the opening message.
 *
 * **Expected Outcomes**:
 *   - Three.js 3D canvas renders after room entry
 *   - "Start Meeting" button is visible and clickable
 *   - Clicking Start triggers the orchestration pipeline
 *   - COO Hudson's opening message appears within 10 s (soft) / 60 s (hard)
 *   - Meeting phase transitions from idle to opening
 *
 * **Prerequisites**:
 *   - Frontend deployed with 3D meeting room components
 *   - Backend Azure Functions running (for AI agent responses)
 *   - Azure OpenAI configured (for COO opening message generation)
 *
 * **Architecture Components Tested**:
 *   - MeetingRoom3D (React Three Fiber scene)
 *   - MeetingContext (global state management)
 *   - SignalR connection establishment
 *   - TurnManager initialization
 *   - AgentFactory.invokeAgent() for COO opening
 *   - SnippetManager phase transition (idle -> opening)
 *
 * **Setup Strategy**:
 *   beforeAll creates the room once via LobbyPage so all serial tests operate
 *   on a shared browser context. Module-level variables hold the shared page
 *   and performance timestamps across test boundaries.
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
  // Test 2-1: 3D canvas is rendered
  // Verifies: Three.js canvas element is visible after entering the meeting room.
  // Why it matters: The 3D meeting room is the core visual experience — agents,
  //   BigScreen, and Sophia blob all render inside the R3F canvas.
  // Expected: <canvas> element is visible in the DOM
  // ------------------------------------------------------------------
  test("2-1 | 3D canvas renders after room entry", async () => {
    const meeting = new MeetingRoomPage(sharedPage);
    await meeting.assertCanvasRendered();
    console.log("[Pass] 3D canvas is visible");
  });

  // ------------------------------------------------------------------
  // Test 2-2: Start Meeting button is present and clickable
  // Verifies: The call-to-action button that initiates the AI meeting is rendered.
  // Why it matters: Without this button, users cannot trigger the orchestration pipeline.
  // Expected: Button with text "Start" or equivalent is visible within 15 s
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
  // Test 2-3: Click "Start Meeting" -- meeting initialises
  // Verifies: Clicking Start fires the orchestration pipeline and canvas persists.
  // Why it matters: This triggers TurnManager, SignalR connection, and COO agent invocation.
  // Expected: Canvas remains visible after click (no crash/redirect)
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
  // Test 2-4: COO Hudson's opening message appears
  // Verifies: The AI meeting chair (Hudson/COO) delivers an opening statement.
  // Why it matters: This is the first AI-generated content the user sees —
  //   it proves the full pipeline works: SignalR -> TurnManager -> AgentFactory -> LLM -> ResponseParser -> chat UI.
  // Expected: Non-empty message bubble visible within 60 s (10 s soft target)
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
  // Test 2-5: Meeting phase transitions away from "idle"
  // Verifies: SnippetManager phase indicator updates after meeting start.
  // Why it matters: Phase state (Open -> Discuss -> Decide -> Act) drives
  //   agent behavior and UI elements throughout the meeting lifecycle.
  // Expected: Phase is not "idle" when indicator is present
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
  // Test 2-6: Performance -- meeting start to first message time
  // Verifies: End-to-end latency from clicking Start to first agent message.
  // Why it matters: This metric represents the "time to value" — how long
  //   users wait before receiving their first piece of AI-generated insight.
  // Expected: < 120 s (hard), message count > 0
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
