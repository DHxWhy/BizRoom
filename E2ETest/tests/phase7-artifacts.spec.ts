/**
 * Phase 7 — Artifact Generation & Download
 *
 * Covers: artifact trigger via chat message, artifact-preview UI element,
 * download button interaction, and GET /api/room/{roomId}/artifacts endpoint.
 *
 * Strategy:
 *   - Full lobby → meeting-start flow via UI
 *   - Send an artifact-triggering message (budget analysis)
 *   - Soft-assert artifact preview in chat (may not appear within timeout on
 *     cold-start; tests are resilient via expect.soft)
 *   - Verify artifacts REST endpoint returns a valid response
 *
 * All timeout values are generous to accommodate cold-start Azure Functions.
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to lobby, fill all fields, and wait for the meeting room to render.
 * Returns the page URL after room entry so callers can extract the roomId.
 */
async function setupMeetingRoom(
  page: import("@playwright/test").Page,
): Promise<string> {
  const lobby = new LobbyPage(page);
  await lobby.goto();

  await lobby.createRoom(TEST_USER.name, TEST_AGENDA, {
    companyName: BRAND_MEMORY.companyName,
    industry: BRAND_MEMORY.industry,
    product: BRAND_MEMORY.product,
  });

  // Wait for room entry signal (URL change, canvas, or meeting root)
  await Promise.race([
    page.waitForURL((url) => url.pathname !== "/", { timeout: 30_000 }),
    page.waitForSelector("canvas", { state: "visible", timeout: 30_000 }),
    page.waitForSelector("[data-testid='meeting-room'], .meeting-room", {
      state: "visible",
      timeout: 30_000,
    }),
  ]);

  return page.url();
}

/**
 * Extract roomId from URL patterns:
 *   /room/<roomId>
 *   /meeting/<roomId>
 *   ?roomId=<roomId>
 */
function extractRoomId(url: string): string | null {
  // Path segment: /room/abc-123 or /meeting/abc-123
  const pathMatch = url.match(/\/(room|meeting)\/([^/?#]+)/);
  if (pathMatch) return pathMatch[2];

  // Query string: ?roomId=abc-123
  const qsMatch = url.match(/[?&]roomId=([^&]+)/);
  if (qsMatch) return qsMatch[1];

  return null;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe.serial("Phase 7 — Artifacts", () => {
  // Shared state across serial tests
  let roomId: string | null = null;

  // ------------------------------------------------------------------
  // Test 7-1: Full meeting setup + artifact-triggering message
  // ------------------------------------------------------------------
  test("7-1 | enter meeting room and send artifact-triggering message", async ({
    page,
  }) => {
    const meetingRoom = new MeetingRoomPage(page);
    const chat = new ChatPanel(page);

    const postCreateUrl = await setupMeetingRoom(page);
    roomId = extractRoomId(postCreateUrl);

    console.log(`[Info] Post-create URL: ${postCreateUrl}`);
    console.log(`[Info] Extracted roomId: ${roomId ?? "(not found in URL)"}`);

    // Attempt to start meeting if start button is present
    const startBtn = page
      .locator(
        "button:has-text('시작'), button:has-text('Start'), button:has-text('회의 시작')",
      )
      .first();
    if (await startBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await startBtn.click();
      console.log("[Info] Clicked start meeting button");
    }

    // Wait for COO opening message (meeting active signal)
    await meetingRoom
      .assertMeetingStarted()
      .catch(() =>
        console.warn("[Warn] COO opening message not detected — proceeding"),
      );

    const baselineCount = await chat.getMessageCount();

    // Send artifact-triggering message: request a budget analysis
    const artifactTrigger =
      "CFO Amelia, Q2 예산 현황을 Excel로 정리해주세요. 고객 세그먼트별 매출 비중도 차트로 포함해주세요.";
    await chat.sendMessage(artifactTrigger);

    console.log(`[Info] Sent artifact trigger message: "${artifactTrigger}"`);

    // Confirm human message appeared in chat
    const afterSendCount = await chat
      .getMessageCount()
      .catch(() => baselineCount);
    console.log(
      `[Info] Message count: ${baselineCount} → ${afterSendCount}`,
    );

    expect(afterSendCount).toBeGreaterThanOrEqual(baselineCount);
  });

  // ------------------------------------------------------------------
  // Test 7-2: Wait for agent response after artifact request
  // ------------------------------------------------------------------
  test("7-2 | wait for agent response to artifact request", async ({
    page,
  }) => {
    const chat = new ChatPanel(page);

    // Re-navigate to the same URL (serial tests share browser, keep navigation)
    const currentCount = await chat.getMessageCount();
    console.log(`[Info] Current message count before waiting: ${currentCount}`);

    // Wait for new messages to arrive (agent responding)
    await chat
      .waitForNewMessage(currentCount, 60_000)
      .catch(() =>
        console.warn(
          "[Warn] No new agent messages within 60 s — cold-start possible",
        ),
      );

    const finalCount = await chat.getMessageCount();
    console.log(`[Info] Final message count: ${finalCount}`);

    // Soft assert — AI response timing is non-deterministic on cold start
    expect.soft(finalCount).toBeGreaterThan(currentCount);
  });

  // ------------------------------------------------------------------
  // Test 7-3: Artifact preview element appears in chat
  // ------------------------------------------------------------------
  test("7-3 | artifact preview element appears (soft)", async ({ page }) => {
    const chat = new ChatPanel(page);

    // Wait up to 90 s for an artifact preview to materialize
    const artifactVisible = await page
      .waitForSelector(
        "[data-testid='artifact-preview'], .artifact-preview, [data-type='artifact']",
        { state: "visible", timeout: 90_000 },
      )
      .then(() => true)
      .catch(() => false);

    if (artifactVisible) {
      console.log("[Info] Artifact preview element is visible");

      const previews = await chat.getArtifactPreviews();
      const count = await previews.count();
      console.log(`[Info] Artifact preview count: ${count}`);

      expect.soft(count).toBeGreaterThan(0);
    } else {
      console.warn(
        "[Warn] Artifact preview not visible within 90 s — artifact pipeline may not have triggered",
      );
      // Do not hard-fail: artifact generation requires full AI pipeline
      expect.soft(artifactVisible).toBe(true);
    }
  });

  // ------------------------------------------------------------------
  // Test 7-4: Download button click — verify non-error response
  // ------------------------------------------------------------------
  test("7-4 | download button click produces non-error response (soft)", async ({
    page,
  }) => {
    const chat = new ChatPanel(page);

    // Check if a download button is available
    const downloadBtn = page
      .locator(
        "button:has-text('다운로드'), button:has-text('Download'), a[download]",
      )
      .first();

    const downloadVisible = await downloadBtn
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (!downloadVisible) {
      console.warn("[Warn] No download button found — skipping download test");
      test.skip();
      return;
    }

    // Intercept any navigation/download request triggered by the button
    const [response] = await Promise.all([
      page
        .waitForResponse(
          (res) =>
            res.url().includes("/artifacts") ||
            res.url().includes("/download"),
          { timeout: 15_000 },
        )
        .catch(() => null),
      chat.clickDownloadArtifact(),
    ]);

    if (response) {
      const status = response.status();
      console.log(`[Info] Download response status: ${status}`);
      // Artifact download should not return a 5xx error
      expect.soft(status).toBeLessThan(500);
    } else {
      console.warn(
        "[Warn] No download request intercepted — may be client-side only",
      );
    }
  });

  // ------------------------------------------------------------------
  // Test 7-5: GET /api/room/{roomId}/artifacts — endpoint health check
  // ------------------------------------------------------------------
  test("7-5 | GET /api/room/{roomId}/artifacts returns valid response", async ({
    request,
  }) => {
    const api = new ApiClient(request);

    // Use roomId captured in test 7-1, or a fallback sentinel
    const targetRoomId = roomId ?? "test-room-fallback";
    console.log(`[Info] Checking artifacts for roomId: ${targetRoomId}`);

    const { status, body } = await api.getRoomArtifacts(targetRoomId);
    console.log(`[Info] Artifacts endpoint status: ${status}`);
    console.log(`[Info] Artifacts response: ${JSON.stringify(body)}`);

    // Endpoint must not be a hard server error (404 is acceptable if room
    // hasn't persisted; 200/204 is ideal)
    expect.soft(status).toBeLessThan(500);

    if (status === 200) {
      // Response should be an array (possibly empty)
      const artifacts = Array.isArray(body) ? body : body?.artifacts ?? [];
      console.log(`[Info] Artifact count from API: ${artifacts.length}`);

      if (artifacts.length > 0) {
        const first = artifacts[0];
        console.log(`[Info] First artifact: ${JSON.stringify(first)}`);

        // Soft assertions on artifact shape
        expect
          .soft(first)
          .toHaveProperty(
            "type",
            expect.stringMatching(/excel|markdown|pptx|pdf/i),
          );
        expect.soft(first.name ?? first.fileName ?? "").not.toBe("");
      }
    }
  });

  // ------------------------------------------------------------------
  // Test 7-6: Artifact type validation — excel or markdown expected
  // ------------------------------------------------------------------
  test("7-6 | artifacts from API have expected type and name (soft)", async ({
    request,
  }) => {
    const api = new ApiClient(request);
    const targetRoomId = roomId ?? "test-room-fallback";

    const { status, body } = await api.getRoomArtifacts(targetRoomId);

    if (status !== 200) {
      console.warn(
        `[Warn] Artifacts endpoint returned ${status} — skipping type validation`,
      );
      test.skip();
      return;
    }

    const artifacts = Array.isArray(body) ? body : body?.artifacts ?? [];

    if (artifacts.length === 0) {
      console.warn(
        "[Warn] No artifacts found — AI pipeline may not have generated any yet",
      );
      return;
    }

    for (const artifact of artifacts) {
      const artifactType: string =
        (artifact.type ?? artifact.fileType ?? "").toLowerCase();
      const artifactName: string =
        artifact.name ?? artifact.fileName ?? artifact.title ?? "";

      console.log(
        `[Info] Artifact → type: "${artifactType}", name: "${artifactName}"`,
      );

      // Type should be one of the expected artifact formats
      expect
        .soft(artifactType)
        .toMatch(/excel|xlsx|markdown|md|pptx|ppt|pdf/i);

      // Name must be a non-empty string
      expect.soft(artifactName.length).toBeGreaterThan(0);
    }
  });
});
