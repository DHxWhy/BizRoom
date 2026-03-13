// Artifact generation for meeting minutes
// PPT via pptxgenjs, Excel via exceljs
// Ref: Spec §7

import PptxGenJSModule from "pptxgenjs";
import ExcelJS from "exceljs";

// pptxgenjs exports a class as default, but TS module resolution may wrap it
const PptxGenJS = PptxGenJSModule as unknown as typeof PptxGenJSModule.default;

export interface MeetingMinutesData {
  meetingInfo: { title: string; date: string; participants: string[] };
  agendas: Array<{
    title: string;
    summary: string;
    keyPoints: string[];
    decisions: string[];
    visualRefs: string[];
  }>;
  actionItems: Array<{
    description: string;
    assignee: string;
    deadline?: string;
  }>;
  budgetData?: Array<{ label: string; value: number }>;
}

export async function generatePPT(
  data: MeetingMinutesData,
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.addText(data.meetingInfo.title, {
    x: 1,
    y: 1.5,
    w: 8,
    h: 1.5,
    fontSize: 28,
    bold: true,
    color: "1a1a2e",
  });
  titleSlide.addText(data.meetingInfo.date, {
    x: 1,
    y: 3,
    w: 8,
    h: 0.5,
    fontSize: 14,
    color: "666666",
  });
  titleSlide.addText(
    `참석자: ${data.meetingInfo.participants.join(", ")}`,
    {
      x: 1,
      y: 3.5,
      w: 8,
      h: 0.5,
      fontSize: 12,
      color: "888888",
    },
  );

  // Agenda slides
  for (const agenda of data.agendas) {
    const slide = pptx.addSlide();
    slide.addText(agenda.title, {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.8,
      fontSize: 22,
      bold: true,
      color: "1a1a2e",
    });
    slide.addText(agenda.summary, {
      x: 0.5,
      y: 1.2,
      w: 9,
      h: 1,
      fontSize: 14,
      color: "333333",
    });
    const bullets = agenda.keyPoints.map((kp) => ({
      text: kp,
      options: { fontSize: 12 },
    }));
    slide.addText(bullets, {
      x: 0.5,
      y: 2.5,
      w: 9,
      h: 2,
      bullet: true,
      color: "555555",
    });
  }

  // Action items slide
  if (data.actionItems.length > 0) {
    const actionSlide = pptx.addSlide();
    actionSlide.addText("액션 아이템", {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.8,
      fontSize: 22,
      bold: true,
      color: "1a1a2e",
    });
    const rows: Array<Array<{ text: string }>> = [
      [{ text: "항목" }, { text: "담당자" }, { text: "기한" }],
      ...data.actionItems.map((ai) => [
        { text: ai.description },
        { text: ai.assignee },
        { text: ai.deadline ?? "-" },
      ]),
    ];
    actionSlide.addTable(rows, {
      x: 0.5,
      y: 1.5,
      w: 9,
      fontSize: 11,
      border: { type: "solid", pt: 0.5, color: "CCCCCC" },
    });
  }

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return buffer as Buffer;
}

export async function generateExcel(
  data: MeetingMinutesData,
): Promise<Buffer | null> {
  if (!data.budgetData?.length) return null;

  const workbook = new ExcelJS.Workbook();

  // Budget sheet
  const budgetSheet = workbook.addWorksheet("예산 분석");
  budgetSheet.addRow(["항목", "금액"]);
  for (const item of data.budgetData) {
    budgetSheet.addRow([item.label, item.value]);
  }
  budgetSheet.columns = [{ width: 25 }, { width: 15 }];

  // Action items sheet
  const actionSheet = workbook.addWorksheet("액션아이템");
  actionSheet.addRow(["항목", "담당자", "기한", "상태"]);
  for (const item of data.actionItems) {
    actionSheet.addRow([
      item.description,
      item.assignee,
      item.deadline ?? "-",
      "대기",
    ]);
  }
  actionSheet.columns = [
    { width: 30 },
    { width: 15 },
    { width: 15 },
    { width: 10 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
