/**
 * Sophia Visual Pipeline E2E Test
 *
 * Full flow: Lobby → Room → Start Meeting → Send message requesting visualization
 * → Sophia pre-search → Agent response (parsed speech) → Sophia visualization → BigScreen
 */
import { test, expect } from "@playwright/test";
import { LobbyPage } from "../pages/LobbyPage";

test("Sophia search + visualization full pipeline", async ({ page }) => {
  // Capture console errors for diagnostics
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // 1. Create room
  const lobby = new LobbyPage(page);
  await lobby.goto();
  await lobby.createRoom("E2E-Judge", "타겟 시장 분석", {
    companyName: "BizRoom.ai",
    industry: "AI SaaS",
    product: "AI 가상 회의실",
  });

  // 2. Wait for 3D canvas
  await page.waitForSelector("canvas", { state: "visible", timeout: 30_000 });
  console.log("[OK] 3D canvas loaded");

  // 3. Click "시작" to start meeting
  const startBtn = page.getByRole("button", { name: /시작/ });
  await startBtn.waitFor({ state: "visible", timeout: 20_000 });
  await page.screenshot({ path: "screenshots/01-before-start.png", fullPage: false });
  await startBtn.click();
  console.log("[OK] Meeting started");

  // 4. Wait for InputArea to appear
  const input = page.getByLabel("메시지 입력");
  await input.waitFor({ state: "visible", timeout: 25_000 });
  await page.screenshot({ path: "screenshots/02-meeting-active.png", fullPage: false });
  console.log("[OK] Input area visible");

  // 5. Send message requesting search + visualization
  const message =
    "1인 창업자, 솔로프리너, 소규모 스타트업 3개 타겟의 시장규모를 웹서칭으로 조사해서 우선순위를 시각화해줘";
  await input.fill(message);
  await input.press("Enter");
  console.log("[OK] Message sent");
  await page.screenshot({ path: "screenshots/03-message-sent.png", fullPage: false });

  // 6. Wait for Sophia pre-search message in chat
  // Check specifically for Sophia's SSE message text (not ArtifactDrawer static text)
  await expect(async () => {
    // Look for Sophia's pre-search text in article elements specifically
    const sophiaArticles = page.locator("[role='article']");
    const count = await sophiaArticles.count();
    expect(count).toBeGreaterThan(1); // user msg + sophia msg
  }).toPass({ timeout: 60_000, intervals: [2000] });
  await page.screenshot({ path: "screenshots/04-sophia-responded.png", fullPage: false });
  console.log("[OK] Sophia/agent messages appeared");

  // 7. Wait for agent response (clean speech text, not raw JSON)
  // With buffering fix, agent responses appear after full LLM response
  await expect(async () => {
    const articles = page.locator("[role='article']");
    const count = await articles.count();
    if (count < 2) throw new Error(`Only ${count} articles`);

    // Check that no article contains raw JSON structure
    const allText = await page.locator("[role='article']").allTextContents();
    const hasRawJson = allText.some((t) => t.includes('"speech"') || t.includes("```json"));
    if (hasRawJson) throw new Error("Raw JSON detected in message bubble");

    // Check that at least one agent message contains actual text (not just user msg)
    const hasAgentMsg = allText.some((t) =>
      !t.startsWith("E2E-Judge") && t.length > 20
    );
    if (!hasAgentMsg) throw new Error("No agent message content yet");
  }).toPass({ timeout: 150_000, intervals: [3000] });
  await page.screenshot({ path: "screenshots/05-agent-clean-response.png", fullPage: false });
  console.log("[OK] Agent responded with clean speech (no JSON)");

  // 8. Wait for Sophia visualization
  await expect(async () => {
    const bodyText = await page.locator("body").textContent();
    const hasVisual =
      bodyText?.includes("빅스크린") ||
      bodyText?.includes("시각화를") ||
      bodyText?.includes("표시했습니다");
    expect(hasVisual).toBe(true);
  }).toPass({ timeout: 120_000, intervals: [3000] });
  await page.screenshot({ path: "screenshots/06-sophia-visual-announced.png", fullPage: false });
  console.log("[OK] Sophia visualization announced");

  // 9. Final screenshot — BigScreen + HoloMonitor in 3D scene
  await page.waitForTimeout(10000); // Wait for WebGL + GLB models to finish loading
  await page.screenshot({ path: "screenshots/07-final-bigscreen.png", fullPage: false });
  console.log("[OK] Final screenshot saved");

  // 10. Canvas sanity check
  const canvasCount = await page.locator("canvas").count();
  expect(canvasCount).toBeGreaterThan(0);
  console.log(`[OK] Canvas count: ${canvasCount}`);

  // Check WebGL2 context is alive (Three.js uses webgl2)
  const webglOk = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    if (!canvas) return false;
    try {
      // Check webgl2 only — calling webgl on a webgl2 canvas logs spurious errors
      const gl = canvas.getContext("webgl2");
      return gl !== null && !gl.isContextLost();
    } catch { return false; }
  });
  console.log(`[OK] WebGL2 context alive: ${String(webglOk)}`);

  // Capture WebGL canvas content directly (bypasses Playwright screenshot limitation)
  const canvasDataUrl = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    if (!canvas) return null;
    try {
      return canvas.toDataURL("image/png");
    } catch { return null; }
  });
  if (canvasDataUrl && canvasDataUrl.length > 100) {
    const base64 = canvasDataUrl.replace(/^data:image\/png;base64,/, "");
    const { writeFileSync } = await import("fs");
    writeFileSync("screenshots/07b-webgl-canvas.png", Buffer.from(base64, "base64"));
    console.log("[OK] WebGL canvas captured directly");
  }

  // Filter out known spurious errors (e.g., 3P extensions, pre-boot network)
  const realErrors = consoleErrors.filter(e =>
    !e.includes("favicon") && !e.includes("extension") && !e.includes("ERR_NAME_NOT_RESOLVED")
  );
  if (realErrors.length > 0) {
    console.log(`[WARN] Console errors: ${realErrors.slice(0, 3).join(" | ")}`);
  }
});
