import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { turnManager, determineAgentOrder } from "../orchestrator/TurnManager.js";
import { classifyTopic, parseMentions } from "../orchestrator/TopicClassifier.js";
import {
  getContextForAgent,
  addMessage,
  getOrCreateRoom,
  getBrandMemory,
  addSearchResult,
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

        // H1: Initialize Sophia room state for buffer tracking in SSE path
        sophiaAgent.initRoom(roomId);

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
            const sophiaReqType = parsed.data.sophia_request?.type;
            const hasSophiaReq = !!sophiaReqType;
            const hasVisual = !!parsed.data.visual_hint;

            // H1: Buffer agent speech into SophiaAgent for context
            sophiaAgent.addToBuffer(roomId, {
              speaker: meta.name,
              role: meta.role,
              speech: parsed.data.speech || fullContent,
              keyPoints: parsed.data.key_points || [],
              visualHint: parsed.data.visual_hint || null,
              timestamp: Date.now(),
            });

            // Step 1: Sophia announces what she'll do
            if (hasSophiaReq || hasVisual) {
              const tasks: string[] = [];
              if (sophiaReqType === "search") tasks.push("웹 자료 조사");
              if (sophiaReqType === "analyze") tasks.push("분석 조사");
              if (sophiaReqType === "visualize" || hasVisual) tasks.push("시각화 생성");
              const sophiaAnnounce = uuidv4();
              controller.enqueue(sseEncode(JSON.stringify({
                messageId: sophiaAnnounce, role: "sophia", name: "Sophia",
                delta: `${tasks.join(" 후 ")}을 진행하겠습니다.`,
              })));
            }

            // Step 2: Sophia request processing (search / analyze / visualize)
            if (parsed.data.sophia_request) {
              const req = parsed.data.sophia_request;

              if (req.type === "search" || req.type === "analyze") {
                // Both search and analyze use Bing search; analyze formats as analysis context
                try {
                  const results = await searchBing(req.query, 3);
                  if (results.length > 0) {
                    const searchContext = formatSearchContext(results);

                    // C3: Inject search results into ContextBroker for subsequent agents
                    addSearchResult(roomId, req.query, results);

                    addMessage(roomId, {
                      id: uuidv4(), roomId,
                      senderId: "sophia", senderType: "agent",
                      senderName: "Sophia", senderRole: "sophia" as AgentRole,
                      content: req.type === "analyze"
                        ? `[분석 완료] ${req.query}\n${searchContext}`
                        : `[검색 완료] ${req.query}\n${searchContext}`,
                      timestamp: new Date().toISOString(),
                    });
                    const sophiaSearchId = uuidv4();
                    controller.enqueue(sseEncode(JSON.stringify({
                      messageId: sophiaSearchId, role: "sophia", name: "Sophia",
                      delta: req.type === "analyze"
                        ? `분석 완료: ${req.query}\n${results.map((r, i) => `${i + 1}. ${r.name}: ${r.snippet}`).join("\n")}`
                        : `조사 완료: ${req.query}\n${results.map((r, i) => `${i + 1}. ${r.name}: ${r.snippet}`).join("\n")}`,
                    })));
                  }
                } catch (err) {
                  context.log(`Sophia ${req.type} failed:`, err);
                }
              }

              if (req.type === "visualize" && !hasVisual) {
                // Create a visual_hint from the sophia_request query and generate visual
                const synthHint: VisualHint = { type: "summary", title: req.query };
                try {
                  const renderData = await callSophiaVisualInSSE(roomId, synthHint, context);
                  const sophiaVisId = uuidv4();
                  controller.enqueue(sseEncode(JSON.stringify({
                    messageId: sophiaVisId, role: "sophia", name: "Sophia",
                    delta: `${synthHint.title} 시각화를 빅스크린에 표시했습니다.`,
                  })));
                  controller.enqueue(sseEncode(JSON.stringify({
                    messageId: uuidv4(), role: "sophia", name: "Sophia",
                    delta: `[BIGSCREEN]${JSON.stringify({ visualType: synthHint.type, title: synthHint.title, renderData })}`,
                  })));
                } catch (err) {
                  context.log("Sophia visualize (from sophia_request) failed:", err);
                  controller.enqueue(sseEncode(JSON.stringify({
                    messageId: uuidv4(), role: "sophia", name: "Sophia",
                    delta: `시각화 생성에 실패했습니다. 다시 시도해 주세요.`,
                  })));
                }
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

        // ── Fallback: if user asked for visualization but no agent included visual_hint ──
        const VISUAL_KEYWORDS = /시각화|차트|그래프|보여줘|정리해줘|파이차트|막대|비교.*표|visualize|chart|graph/i;
        if (VISUAL_KEYWORDS.test(userMessage.content)) {
          // Check if any visual was generated in this turn
          const anyVisualGenerated = turnOrder.some(() => false); // placeholder — check via flag
          // Simple fallback: always generate a summary visual from the conversation
          try {
            const fallbackHint: VisualHint = { type: "summary", title: userMessage.content.slice(0, 30) };
            const renderData = await callSophiaVisualInSSE(roomId, fallbackHint, context);
            if (renderData && JSON.stringify(renderData) !== '{}') {
              controller.enqueue(sseEncode(JSON.stringify({
                messageId: uuidv4(), role: "sophia", name: "Sophia",
                delta: `요청하신 시각화를 빅스크린에 표시했습니다.`,
              })));
              controller.enqueue(sseEncode(JSON.stringify({
                messageId: uuidv4(), role: "sophia", name: "Sophia",
                delta: `[BIGSCREEN]${JSON.stringify({ visualType: fallbackHint.type, title: fallbackHint.title, renderData })}`,
              })));
            }
          } catch (err) {
            context.log("Fallback visual generation failed:", err);
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
  // Combine Sophia buffer (agent speeches) + room context for rich grounding
  const recentSpeeches = sophiaAgent.getRecentSpeeches(roomId, 5).join("\n");
  const roomContext = getContextForAgent(roomId, "coo" as AgentRole); // use COO's full context as fallback
  const combinedContext = recentSpeeches || roomContext || "컨텍스트 없음";
  const userContent = `visual_hint: ${JSON.stringify(hint)}\n\n최근 대화:\n${combinedContext}\n\ntype="${hint.type}"에 맞는 BigScreenRenderData JSON을 생성하세요. items 배열에 반드시 3-7개의 데이터를 포함하세요.`;

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

  // H2: Graceful fallback if LLM returns invalid JSON
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (typeof parsed.type !== "string") parsed.type = hint.type;
    return parsed as unknown as BigScreenRenderData;
  } catch {
    return { type: hint.type, title: hint.title, items: [] } as unknown as BigScreenRenderData;
  }
}

app.http("message", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/message",
  handler: message,
});
