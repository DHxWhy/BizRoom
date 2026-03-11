// COO Hudson's meeting minutes generation plugin
// Generates structured Markdown from meeting context

import { v4 as uuidv4 } from "uuid";
import { saveArtifact } from "../services/ArtifactService.js";

interface MinutesInput {
  roomId: string;
  agenda: string;
  participants: string[];
  discussions: { speaker: string; content: string }[];
  decisions: { description: string; decidedBy: string }[];
  actionItems: { description: string; assignee: string; deadline?: string }[];
  date: string;
}

export function generateMeetingMinutes(input: MinutesInput): { id: string; markdown: string } {
  const id = uuidv4();

  const discussionLines = input.discussions
    .map((d) => `**${d.speaker}:** ${d.content}`)
    .join("\n\n");

  const decisionLines = input.decisions.length
    ? input.decisions
        .map((d, i) => `${i + 1}. ${d.description} (결정: ${d.decidedBy})`)
        .join("\n")
    : "- 없음";

  const actionItemRows = input.actionItems.length
    ? input.actionItems
        .map(
          (a, i) =>
            `| ${i + 1} | ${a.description} | ${a.assignee} | ${a.deadline ?? "미정"} |`,
        )
        .join("\n")
    : "| - | 없음 | - | - |";

  const markdown = `# 회의록

**일시:** ${input.date}
**안건:** ${input.agenda}
**참석자:** ${input.participants.join(", ")}

---

## 논의 내용

${discussionLines}

---

## 결정사항

${decisionLines}

---

## 액션아이템

| #   | 항목   | 담당자   | 기한   |
| --- | ------ | -------- | ------ |
${actionItemRows}

---

*이 회의록은 BizRoom.ai COO Hudson에 의해 자동 생성되었습니다.*
`;

  saveArtifact({
    id,
    type: "markdown",
    name: `회의록_${input.date}.md`,
    content: markdown,
    mimeType: "text/markdown",
    createdBy: "coo",
    createdAt: new Date().toISOString(),
  });

  return { id, markdown };
}
