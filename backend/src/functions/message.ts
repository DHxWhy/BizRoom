import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { turnManager, determineAgentOrder } from "../orchestrator/TurnManager.js";
import { classifyTopic, parseMentions } from "../orchestrator/TopicClassifier.js";
import {
  getContextForAgent,
  addMessage,
  getOrCreateRoom,
  getBrandMemory,
} from "../orchestrator/ContextBroker.js";
import { invokeAgentStream, getAgentMeta } from "../agents/AgentFactory.js";
import { MAX_AGENTS_PER_TURN } from "../constants/turnConfig.js";
import { parseStructuredOutput } from "../orchestrator/ResponseParser.js";
import { sophiaAgent } from "../agents/SophiaAgent.js";
import { searchBing, formatSearchContext } from "../services/BingSearchService.js";
import {
  getModelForTask,
  getAnthropicClient,
  getOpenAIClient as getOpenAIClientFromRouter,
  getFoundryClient,
} from "../services/ModelRouter.js";
import { SOPHIA_VISUAL_SYSTEM_PROMPT } from "../agents/prompts/sophia.js";
import type { AgentRole, Message, VisualHint, BigScreenRenderData } from "../models/index.js";
import { v4 as uuidv4 } from "uuid";

// Azure Functions v4: HTTP 스트리밍 활성화
app.setup({ enableHttpStream: true });

interface MessageRequest {
  content: string;
  roomId: string;
  senderId: string;
  senderName: string;
  mentions?: AgentRole[];
  isChairman?: boolean;
  mode?: string;
  dmTarget?: string | null;
}

/** SSE 이벤트 한 줄을 UTF-8 인코딩하여 반환 */
function sseEncode(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

export async function message(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Message received");

  let body: MessageRequest;
  try {
    body = (await request.json()) as MessageRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  if (!body.content?.trim()) {
    return { status: 400, jsonBody: { error: "Message content is required" } };
  }

  const roomId = body.roomId ?? "room-default";

  // Build user message object
  const userMessage: Message = {
    id: uuidv4(),
    roomId,
    senderId: body.senderId ?? "user-1",
    senderType: "human",
    senderName: body.senderName ?? "Chairman",
    senderRole: "chairman",
    content: body.content,
    timestamp: new Date().toISOString(),
  };

  // stream=true 쿼리 파라미터 확인
  const streamParam = request.query.get("stream");
  const isStream = streamParam === "true";

  if (!isStream) {
    // Voice Live mode: route to TurnManager state machine
    // TurnManager handles timing, buffering, and triggers agents via events
    // Chairman detection: match against the userId registered at meeting start
    // (body.isChairman from frontend, or fallback to senderId-based check)
    const isChairman = body.isChairman === true || body.senderId === "chairman" || !body.senderId;
    turnManager.onChatMessage(
      roomId,
      userMessage.senderId,
      userMessage.senderName,
      userMessage.content,
      isChairman,
    );
    // Return 202 Accepted — agent responses arrive via SignalR events, not HTTP response
    return { status: 202, jsonBody: { accepted: true, mode: "voiceLive" } };
  }

  // ── SSE 스트리밍 응답 ──
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 사용자 메시지를 컨텍스트에 저장
        const room = getOrCreateRoom(roomId);
        addMessage(roomId, userMessage);

        // 토픽 분류 및 @멘션 파싱
        const mentions = parseMentions(userMessage.content);
        const { primaryAgent, secondaryAgents } = classifyTopic(userMessage.content);

        // 에이전트 응답 순서 결정
        const turnOrder = determineAgentOrder(
          userMessage.content,
          mentions,
          primaryAgent,
          secondaryAgents,
        ).slice(0, MAX_AGENTS_PER_TURN);

        // ── 순차 스트리밍: 한 에이전트가 끝나야 다음 에이전트 시작 ──
        // 실시간 delta 전송으로 사용자가 텍스트 타이핑을 볼 수 있음
        for (const entry of turnOrder) {
          const messageId = uuidv4();
          const meta = getAgentMeta(entry.role);
          const contextStr = getContextForAgent(roomId, entry.role);

          let fullContent = "";
          try {
            const agentStream = invokeAgentStream(entry.role, userMessage.content, {
              participants: "Chairman (사용자), Hudson (COO), Amelia (CFO), Yusef (CMO), Kelvin (CTO), Jonas (CDO), Bradley (CLO)",
              agenda: room.agenda || userMessage.content,
              history: contextStr,
              brandMemory: getBrandMemory(roomId),
            });

            for await (const delta of agentStream) {
              fullContent += delta;
              const sseData = JSON.stringify({
                messageId,
                role: meta.role,
                name: meta.name,
                delta,
              });
              controller.enqueue(sseEncode(sseData));
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
            context.log(`Agent ${entry.role} stream failed: ${errMsg}`);
            controller.enqueue(sseEncode(JSON.stringify({
              messageId, role: meta.role, name: meta.name,
              delta: `[Error: ${meta.name} 응답 실패 — ${errMsg}]`,
            })));
          }

          // Parse structured output and save speech-only to context
          if (fullContent) {
            const parsed = parseStructuredOutput(fullContent, meta.role);
            const msg: Message = {
              id: messageId,
              roomId,
              senderId: `agent-${meta.role}`,
              senderType: "agent",
              senderName: meta.name,
              senderRole: meta.role,
              content: parsed.data.speech || fullContent,
              timestamp: new Date().toISOString(),
            };
            addMessage(roomId, msg);

            // ── Sophia task processing in SSE path ──
            const hasSearch = parsed.data.sophia_request?.type === "search";
            const hasVisual = !!parsed.data.visual_hint;

            // Step 1: Sophia announces what she'll do
            if (hasSearch || hasVisual) {
              const tasks: string[] = [];
              if (hasSearch) tasks.push("웹 자료 조사");
              if (hasVisual) tasks.push("시각화 생성");
              const sophiaAnnounce = uuidv4();
              controller.enqueue(sseEncode(JSON.stringify({
                messageId: sophiaAnnounce, role: "sophia", name: "Sophia",
                delta: `${tasks.join(" 후 ")}을 진행하겠습니다.`,
              })));
            }

            // Step 2: Web search (if requested)
            if (hasSearch) {
              const req = parsed.data.sophia_request!;
              try {
                const results = await searchBing(req.query, 3);
                if (results.length > 0) {
                  const searchContext = formatSearchContext(results);
                  addMessage(roomId, {
                    id: uuidv4(), roomId,
                    senderId: "sophia", senderType: "agent",
                    senderName: "Sophia", senderRole: "sophia" as AgentRole,
                    content: `[검색 완료] ${req.query}\n${searchContext}`,
                    timestamp: new Date().toISOString(),
                  });
                  const sophiaSearchId = uuidv4();
                  controller.enqueue(sseEncode(JSON.stringify({
                    messageId: sophiaSearchId, role: "sophia", name: "Sophia",
                    delta: `조사 완료: ${req.query}\n${results.map((r, i) => `${i + 1}. ${r.name}: ${r.snippet}`).join("\n")}`,
                  })));
                }
              } catch (err) {
                context.log("Sophia search failed:", err);
              }
            }

            // Step 3: Visual generation (if requested)
            if (hasVisual) {
              const hint = parsed.data.visual_hint!;
              try {
                const renderData = await callSophiaVisualInSSE(roomId, hint, context);
                // Stream the visual result notification
                const sophiaVisId = uuidv4();
                controller.enqueue(sseEncode(JSON.stringify({
                  messageId: sophiaVisId, role: "sophia", name: "Sophia",
                  delta: `${hint.title} 시각화를 빅스크린에 표시했습니다.`,
                })));
                // Send bigScreenUpdate as SSE event for frontend
                controller.enqueue(sseEncode(JSON.stringify({
                  messageId: uuidv4(), role: "sophia", name: "Sophia",
                  delta: `[BIGSCREEN]${JSON.stringify({ visualType: hint.type, title: hint.title, renderData })}`,
                })));
              } catch (err) {
                context.log("Sophia visual generation failed:", err);
                controller.enqueue(sseEncode(JSON.stringify({
                  messageId: uuidv4(), role: "sophia", name: "Sophia",
                  delta: `시각화 생성에 실패했습니다. 다시 시도해 주세요.`,
                })));
              }
            }
          }
        }

        // 모든 에이전트 응답 완료
        controller.enqueue(sseEncode("[DONE]"));
        controller.close();
      } catch (err: unknown) {
        context.log("SSE stream orchestration error:", err);
        controller.enqueue(sseEncode("[DONE]"));
        controller.close();
      }
    },
  });

  return {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    body: stream,
  };
}

/** Generate BigScreenRenderData from visual hint — SSE path version */
async function callSophiaVisualInSSE(
  roomId: string,
  hint: VisualHint,
  context: InvocationContext,
): Promise<BigScreenRenderData> {
  const recentContext = sophiaAgent.getRecentSpeeches(roomId, 5).join("\n");
  const userContent = `visual_hint: ${JSON.stringify(hint)}\n\n최근 대화:\n${recentContext}\n\ntype="${hint.type}"에 맞는 BigScreenRenderData JSON을 생성하세요.`;

  // Use fast model for simple visuals, balanced for complex
  const fastTypes = new Set(["summary", "checklist"]);
  const taskType = fastTypes.has(hint.type) ? "visual-gen-fast" as const : "visual-gen" as const;
  const selection = getModelForTask(taskType);

  let content: string;

  if (selection.provider === "anthropic") {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: selection.model,
      max_tokens: selection.maxTokens,
      temperature: selection.temperature,
      system: SOPHIA_VISUAL_SYSTEM_PROMPT + "\n\nRespond with valid JSON only.",
      messages: [{ role: "user", content: userContent }],
    });
    const block = response.content[0];
    content = block.type === "text" ? block.text : "{}";
  } else {
    const client =
      selection.provider === "foundry" ? getFoundryClient() : getOpenAIClientFromRouter();
    const response = await client.chat.completions.create({
      model: selection.model,
      temperature: selection.temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SOPHIA_VISUAL_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });
    content = response.choices[0]?.message?.content ?? "{}";
  }

  context.log(`[Sophia Visual] Generated for "${hint.title}" via ${selection.provider}/${selection.model}`);

  const parsed = JSON.parse(content) as Record<string, unknown>;
  if (typeof parsed.type !== "string") parsed.type = hint.type;
  return parsed as unknown as BigScreenRenderData;
}

app.http("message", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/message",
  handler: message,
});
