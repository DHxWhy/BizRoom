import { describe, it, expect } from "vitest";
import { getModelForTask, getTemperatureForTask } from "../services/ModelRouter.js";

describe("getModelForTask", () => {
  it("returns ModelSelection with provider, model, temperature, maxTokens", () => {
    const selection = getModelForTask("agent-response");
    expect(selection).toHaveProperty("provider");
    expect(selection).toHaveProperty("model");
    expect(selection).toHaveProperty("temperature");
    expect(selection).toHaveProperty("maxTokens");
    expect(typeof selection.model).toBe("string");
    expect(selection.model.length).toBeGreaterThan(0);
  });

  it("returns different model for visual-gen vs agent-response", () => {
    const visual = getModelForTask("visual-gen");
    const agent = getModelForTask("agent-response");
    expect(visual.model).not.toBe(agent.model);
  });

  it("returns same model tier for minutes and agent-response", () => {
    const minutes = getModelForTask("minutes");
    const agent = getModelForTask("agent-response");
    expect(minutes.provider).toBe(agent.provider);
    expect(minutes.model).toBe(agent.model);
  });

  it("supports legacy chat type (backward compat)", () => {
    const selection = getModelForTask("chat");
    expect(selection.model).toBeTruthy();
  });

  it("returns valid provider for all task types", () => {
    const tasks = [
      "agent-response",
      "visual-gen",
      "minutes",
      "parse-fallback",
      "deep-analysis",
      "realtime-voice",
      "chat",
      "artifact",
      "research",
      "summary",
    ] as const;
    for (const task of tasks) {
      const selection = getModelForTask(task);
      expect(["foundry", "anthropic", "openai"]).toContain(selection.provider);
    }
  });
});

describe("getTemperatureForTask (backward compat)", () => {
  it("returns 0.5 for agent-response", () => {
    expect(getTemperatureForTask("agent-response")).toBe(0.5);
  });

  it("returns 0.2 for visual-gen", () => {
    expect(getTemperatureForTask("visual-gen")).toBe(0.2);
  });

  it("returns 0.4 for minutes", () => {
    expect(getTemperatureForTask("minutes")).toBe(0.4);
  });

  it("returns 0.1 for parse-fallback", () => {
    expect(getTemperatureForTask("parse-fallback")).toBe(0.1);
  });
});
