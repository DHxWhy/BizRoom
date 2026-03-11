// CFO Amelia's Excel generation plugin
// Uses SheetJS (xlsx) to generate .xlsx files

import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { saveArtifact } from "../services/ArtifactService.js";

interface BudgetRow {
  category: string;
  budget: number;
  actual: number;
  variance: number;
  note?: string;
}

interface ExcelInput {
  title: string;
  data: BudgetRow[];
  summary?: { totalBudget: number; totalActual: number; totalVariance: number };
}

export function generateBudgetExcel(input: ExcelInput): { id: string; buffer: Buffer } {
  const id = uuidv4();

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData: (string | number)[][] = [
    ["BizRoom.ai 재무 보고서"],
    [""],
    ["제목", input.title],
    ["생성일", new Date().toLocaleDateString("ko-KR")],
    [""],
  ];

  if (input.summary) {
    summaryData.push(
      ["총 예산", input.summary.totalBudget],
      ["총 실적", input.summary.totalActual],
      ["차이", input.summary.totalVariance],
    );
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, "요약");

  // Detail sheet
  const detailData: (string | number)[][] = [
    ["항목", "예산", "실적", "차이", "비고"],
    ...input.data.map((row) => [
      row.category,
      row.budget,
      row.actual,
      row.variance,
      row.note ?? "",
    ]),
  ];
  const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
  XLSX.utils.book_append_sheet(wb, detailSheet, "상세");

  // Generate buffer
  const xlsxOutput: ArrayBuffer = XLSX.write(wb, {
    bookType: "xlsx",
    type: "buffer",
  }) as ArrayBuffer;
  const buffer = Buffer.from(xlsxOutput);

  saveArtifact({
    id,
    type: "excel",
    name: `${input.title}.xlsx`,
    content: buffer,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    createdBy: "cfo",
    createdAt: new Date().toISOString(),
  });

  return { id, buffer };
}
