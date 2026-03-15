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
import type { AgentRole, Message } from "../models/index.js";
import { v4 as uuidv4 } from "uuid";

// Azure Functions v4: HTTP 스트리밍 활성화
app.setup({ enableHttpStream: true });

interface MessageRequest {
  content: string;
  roomId: string;
  senderId: string;
  senderName: string;
  mentions?: AgentRole[];
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
        );

        // ── 병렬 에이전트 호출: 모든 에이전트를 동시에 시작 ──
        // 각 에이전트의 delta를 수집한 후 에이전트 순서대로 SSE 전송
        const agentJobs = turnOrder.map((entry) => {
          const messageId = uuidv4();
          const meta = getAgentMeta(entry.role);
          const contextStr = getContextForAgent(roomId, entry.role);

          // Collect all deltas from this agent into a buffer
          const job = (async () => {
            const deltas: string[] = [];
            try {
              const agentStream = invokeAgentStream(entry.role, userMessage.content, {
                participants: "Chairman (사용자), Hudson (COO), Amelia (CFO), Yusef (CMO), Kelvin (CTO), Jonas (CDO), Bradley (CLO)",
                agenda: room.agenda || userMessage.content,
                history: contextStr,
                brandMemory: getBrandMemory(roomId),
              });

              for await (const delta of agentStream) {
                deltas.push(delta);
              }
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
              context.log(`Agent ${entry.role} stream failed: ${errMsg}`);
              deltas.push(`[Error: ${meta.name} 응답 실패 — ${errMsg}]`);
            }
            return { messageId, meta, deltas, fullContent: deltas.join("") };
          })();

          return job;
        });

        // Wait for ALL agents to complete in parallel
        const results = await Promise.all(agentJobs);

        // Stream results to client in turn order (agent-by-agent)
        for (const { messageId, meta, deltas, fullContent } of results) {
          // Send all deltas for this agent
          for (const delta of deltas) {
            const sseData = JSON.stringify({
              messageId,
              role: meta.role,
              name: meta.name,
              delta,
            });
            controller.enqueue(sseEncode(sseData));
          }

          // Save completed message to context
          if (fullContent) {
            const msg: Message = {
              id: messageId,
              roomId,
              senderId: `agent-${meta.role}`,
              senderType: "agent",
              senderName: meta.name,
              senderRole: meta.role,
              content: fullContent,
              timestamp: new Date().toISOString(),
            };
            addMessage(roomId, msg);
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

app.http("message", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/message",
  handler: message,
});
