// backend/src/agents/SophiaAgent.ts
// Sophia secretary agent — buffer management, visual hint detection
// Ref: Spec §4

import type {
  VisualHint,
  VisualType,
  StructuredAgentOutput,
  BigScreenRenderData,
} from "../models/index.js";

export interface SophiaBufferEntry {
  speaker: string;
  role: string;
  speech: string;
  keyPoints: string[];
  visualHint: VisualHint | null;
  timestamp: number;
}

export interface VisualArtifact {
  type: VisualType;
  title: string;
  renderData: BigScreenRenderData;
  timestamp: number;
  agendaItem: string;
}

export interface VisualQueueItem {
  hint: VisualHint;
  addedAt: number;
}

interface ActionItemDraft {
  description: string;
  assignee: string;
  deadline?: string;
}

export interface SophiaState {
  roomId: string;
  buffer: SophiaBufferEntry[];
  decisions: string[];
  actionItems: ActionItemDraft[];
  visualHistory: VisualArtifact[];
  visualQueue: VisualQueueItem[];
  postMeetingQueue: string[];
}

const MAX_BUFFER_SIZE = 200;

export class SophiaAgent {
  private rooms = new Map<string, SophiaState>();
  private processingVisual = new Set<string>();

  initRoom(roomId: string): void {
    this.rooms.set(roomId, {
      roomId,
      buffer: [],
      decisions: [],
      actionItems: [],
      visualHistory: [],
      visualQueue: [],
      postMeetingQueue: [],
    });
  }

  getRoomState(roomId: string): SophiaState | undefined {
    return this.rooms.get(roomId);
  }

  destroyRoom(roomId: string): void {
    this.processingVisual.delete(roomId);
    this.rooms.delete(roomId);
  }

  addToBuffer(roomId: string, entry: SophiaBufferEntry): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    if (state.buffer.length >= MAX_BUFFER_SIZE) {
      state.buffer = state.buffer.slice(-150);
    }
    state.buffer.push(entry);
  }

  addDecision(roomId: string, decision: string): void {
    const state = this.rooms.get(roomId);
    if (state) state.decisions.push(decision);
  }

  hasVisualHint(output: StructuredAgentOutput): boolean {
    return output.visual_hint !== null;
  }

  getRecentSpeeches(roomId: string, count: number = 3): string[] {
    const state = this.rooms.get(roomId);
    if (!state) return [];
    return state.buffer.slice(-count).map((e) => `${e.speaker}: ${e.speech}`);
  }

  enqueueVisual(roomId: string, hint: VisualHint): void {
    const state = this.rooms.get(roomId);
    if (!state) return;
    state.visualQueue.push({ hint, addedAt: Date.now() });
  }

  dequeueVisual(roomId: string): VisualQueueItem | undefined {
    const state = this.rooms.get(roomId);
    if (!state) return undefined;
    return state.visualQueue.shift();
  }

  isProcessingVisual(roomId: string): boolean {
    return this.processingVisual.has(roomId);
  }

  setProcessingVisual(roomId: string, processing: boolean): void {
    if (processing) {
      this.processingVisual.add(roomId);
    } else {
      this.processingVisual.delete(roomId);
    }
  }

  addPostMeetingRequest(roomId: string, request: string): void {
    const state = this.rooms.get(roomId);
    if (state) state.postMeetingQueue.push(request);
  }

  drainPostMeetingQueue(roomId: string): string[] {
    const state = this.rooms.get(roomId);
    if (!state) return [];
    const items = [...state.postMeetingQueue];
    state.postMeetingQueue = [];
    return items;
  }

  addVisualToHistory(roomId: string, artifact: VisualArtifact): void {
    const state = this.rooms.get(roomId);
    if (state) state.visualHistory.push(artifact);
  }
}

export const sophiaAgent = new SophiaAgent();
