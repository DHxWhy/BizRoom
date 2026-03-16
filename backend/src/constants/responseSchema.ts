// JSON schema for Chat Completions response_format (strict mode)
// Ref: Spec §2.2

export const CSUITE_RESPONSE_SCHEMA = {
  name: "csuite_response",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      speech: { type: "string" as const, description: "Spoken text in English, 30-80 words" },
      key_points: { type: "array" as const, items: { type: "string" as const } },
      mention: {
        anyOf: [
          { type: "null" as const },
          {
            type: "object" as const,
            properties: {
              target: { type: "string" as const },
              intent: { type: "string" as const, enum: ["opinion", "confirm"] },
              options: {
                anyOf: [
                  { type: "null" as const },
                  { type: "array" as const, items: { type: "string" as const } },
                ],
              },
            },
            required: ["target", "intent", "options"] as const,
            additionalProperties: false,
          },
        ],
      },
      visual_hint: {
        anyOf: [
          { type: "null" as const },
          {
            type: "object" as const,
            properties: {
              type: {
                type: "string" as const,
                enum: ["comparison", "pie-chart", "bar-chart", "timeline", "checklist", "summary", "architecture"],
              },
              title: { type: "string" as const },
            },
            required: ["type", "title"] as const,
            additionalProperties: false,
          },
        ],
      },
      sophia_request: {
        anyOf: [
          { type: "null" as const },
          {
            type: "object" as const,
            properties: {
              type: {
                type: "string" as const,
                enum: ["search", "visualize", "analyze"],
              },
              query: { type: "string" as const, description: "Search query or analysis topic for Sophia" },
            },
            required: ["type", "query"] as const,
            additionalProperties: false,
          },
        ],
      },
    },
    required: ["speech", "key_points", "mention", "visual_hint", "sophia_request"] as const,
    additionalProperties: false,
  },
} as const;
