import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { invokeAgent } from "../agents/AgentFactory.js";
import {
  getOrCreateRoom,
  getContextForAgent,
  setPhase,
  getBrandMemory,
} from "../orchestrator/ContextBroker.js";
import { v4 as uuidv4 } from "uuid";
import type { Message, ArtifactFileType } from "../models/index.js";
import { sophiaAgent, type SophiaState } from "../agents/SophiaAgent.js";
import { SOPHIA_MINUTES_SYSTEM_PROMPT } from "../agents/prompts/sophia.js";
import {
  generatePPT,
  generateExcel,
  type MeetingMinutesData,
} from "../services/ArtifactGenerator.js";
import { uploadToOneDrive, createPlannerTasks } from "../services/GraphService.js";
import { broadcastEvent } from "../services/SignalRService.js";
import {
  getModelForTask,
  getAnthropicClient,
  getOpenAIClient,
  getFoundryClient,
} from "../services/ModelRouter.js";

interface MeetingEndRequest {
  roomId: string;
  summary?: string;
}

/** Generate structured meeting minutes via multi-provider LLM from Sophia's conversation buffer */
async function generateMeetingMinutesLLM(state: SophiaState): Promise<MeetingMinutesData> {
  const transcript = state.buffer.map((e) => `[${e.role}] ${e.speaker}: ${e.speech}`).join("\n");
  const userContent = `회의 기록:\n${transcript}\n\n결정사항: ${state.decisions.join(", ") || "없음"}\n\n위 내용을 바탕으로 회의록 JSON을 작성하세요.`;
  const selection = getModelForTask("minutes");

  let content: string;

  if (selection.provider === "anthropic") {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: selection.model,
      max_tokens: selection.maxTokens,
      temperature: selection.temperature,
      system: SOPHIA_MINUTES_SYSTEM_PROMPT + "\n\nRespond with valid JSON only.",
      messages: [{ role: "user", content: userContent }],
    });
    const block = response.content[0];
    content = block.type === "text" ? block.text : "{}";
  } else {
    const client =
      selection.provider === "foundry" ? getFoundryClient() : getOpenAIClient();
    const response = await client.chat.completions.create({
      model: selection.model,
      temperature: selection.temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SOPHIA_MINUTES_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });
    content = response.choices[0]?.message?.content ?? "{}";
  }

  const parsed = JSON.parse(content) as Record<string, unknown>;
  return {
    meetingInfo:
      parsed.meetingInfo && typeof parsed.meetingInfo === "object"
        ? parsed.meetingInfo
        : { title: "회의록", date: new Date().toISOString(), participants: [] },
    agendas: Array.isArray(parsed.agendas) ? parsed.agendas : [],
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
    budgetData: Array.isArray(parsed.budgetData) ? parsed.budgetData : [],
  } as MeetingMinutesData;
}

export async function meetingEnd(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Meeting end request");

  let body: MeetingEndRequest;
  try {
    body = (await request.json()) as MeetingEndRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  if (!body.roomId?.trim()) {
    return { status: 400, jsonBody: { error: "roomId is required" } };
  }

  const roomId = body.roomId;
  const room = getOrCreateRoom(roomId);
  setPhase(roomId, "closing");

  // Get full conversation context for summary
  const historyContext = getContextForAgent(roomId, "coo");

  let closingMessage: Message | null = null;
  try {
    const cooResponse = await invokeAgent(
      "coo",
      "회의를 종료합니다. 오늘 논의된 내용을 요약하고 액션아이템을 정리해주세요.",
      {
        participants: "CEO, Hudson (COO), Amelia (CFO), Yusef (CMO)",
        agenda: room.agenda || "회의 종료",
        history: historyContext,
        brandMemory: getBrandMemory(roomId),
      },
      "summary",
    );

    closingMessage = {
      id: uuidv4(),
      roomId,
      senderId: "agent-coo",
      senderType: "agent",
      senderName: cooResponse.name,
      senderRole: "coo",
      content: cooResponse.content,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    context.log("COO closing failed:", err);
  }

  // Sophia artifact pipeline — generate minutes, PPT, Excel, Planner tasks
  try {
    const sophiaState = sophiaAgent.getRoomState(roomId);
    if (sophiaState && sophiaState.buffer.length > 0) {
      const minutesData = await generateMeetingMinutesLLM(sophiaState);

      // Process any queued post-meeting requests (e.g., "write as a report")
      const postMeetingRequests = sophiaAgent.drainPostMeetingQueue(roomId);
      if (postMeetingRequests.length > 0) {
        context.log(
          `[Sophia] Post-meeting queue (${postMeetingRequests.length}):`,
          postMeetingRequests,
        );
      }

      const [pptResult, excelResult] = await Promise.allSettled([
        generatePPT(minutesData),
        minutesData.budgetData?.length ? generateExcel(minutesData) : Promise.resolve(null),
      ]);

      const files: Array<{
        name: string;
        type: ArtifactFileType;
        webUrl: string;
        driveItemId?: string;
      }> = [];

      if (pptResult.status === "fulfilled" && pptResult.value) {
        const upload = await uploadToOneDrive(`${roomId}-minutes.pptx`, pptResult.value);
        files.push({
          name: "회의록.pptx",
          type: "pptx",
          webUrl: upload?.webUrl ?? "",
          driveItemId: upload?.driveItemId,
        });
      }

      if (excelResult.status === "fulfilled" && excelResult.value) {
        const upload = await uploadToOneDrive(`${roomId}-data.xlsx`, excelResult.value);
        files.push({
          name: "데이터.xlsx",
          type: "xlsx",
          webUrl: upload?.webUrl ?? "",
          driveItemId: upload?.driveItemId,
        });
      }

      if (minutesData.actionItems.length > 0) {
        const planId = process.env.PLANNER_PLAN_ID;
        if (planId) {
          await createPlannerTasks(planId, minutesData.actionItems);
          files.push({
            name: "Planner 태스크",
            type: "planner",
            webUrl: "",
          });
        }
      }

      if (files.length > 0) {
        broadcastEvent(roomId, {
          type: "artifactsReady",
          payload: { files },
        });
      }

      // Drain any remaining visual queue items (meeting ended, no point processing)
      while (sophiaAgent.dequeueVisual(roomId)) {
        // discard remaining visual generation requests
      }

      sophiaAgent.destroyRoom(roomId);

      // Clean up VoiceLive sessions + TurnManager + event listeners
      const { unwireVoiceLiveForRoom } = await import("../orchestrator/VoiceLiveOrchestrator.js");
      unwireVoiceLiveForRoom(roomId);
    }
  } catch (err) {
    context.log("Sophia artifact pipeline failed:", err);
  }

  return {
    status: 200,
    jsonBody: {
      phase: "closing",
      closingMessage,
      decisions: room.decisions,
      actionItems: room.actionItems,
    },
  };
}

app.http("meetingEnd", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/end",
  handler: meetingEnd,
});
