// Brand Memory → Layer 0 prompt builder
// Ref: Spec §3.2, §3.5

import type { BrandMemorySet } from "../../models/index.js";

const BRAND_MEMORY_MAX_CHARS = 3000;

/** Strip markdown headers and excessive newlines from user input */
function sanitizeForPrompt(value: string): string {
  return value
    .replace(/^#{1,6}\s/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Helper — append a labeled line only if value exists */
function line(label: string, value?: string): string {
  return value ? `${label}: ${sanitizeForPrompt(value)}\n` : "";
}

/** Helper — render a bulleted list from an array */
function list(items?: string[]): string {
  return items?.length ? items.map((i) => `- ${sanitizeForPrompt(i)}`).join("\n") + "\n" : "";
}

/** Build Layer 0 prompt from BrandMemorySet (null-safe for all optional fields) */
export function buildBrandMemoryPrompt(bm: BrandMemorySet): string {
  const sections: string[] = [];

  // Company info (required 3 + optional)
  let s = `## 당신이 속한 회사 정보\n\n`;
  s += `회사명: ${sanitizeForPrompt(bm.companyName)}\n`;
  s += `업종: ${sanitizeForPrompt(bm.industry)}\n`;
  s += line("설립일", bm.foundedDate);
  s += line("대표", bm.founderName);
  s += line("규모", bm.teamSize);
  s += line("미션", bm.mission);
  s += line("비전", bm.vision);
  sections.push(s);

  // Product/Service
  let p = `## 제품/서비스\n\n`;
  p += `제품명: ${sanitizeForPrompt(bm.productName)}\n`;
  p += line("설명", bm.productDescription);
  if (bm.coreFeatures?.length) p += `핵심 기능:\n${list(bm.coreFeatures)}`;
  p += line("타겟 고객", bm.targetCustomer);
  p += line("기술 스택", bm.techStack);
  p += line("수익 모델", bm.revenueModel);
  if (bm.pricing?.length) {
    p += `가격:\n${bm.pricing.map((t) => `- ${sanitizeForPrompt(t.name)} (${sanitizeForPrompt(t.price)}): ${sanitizeForPrompt(t.features)}`).join("\n")}\n`;
  }
  sections.push(p);

  // Market (optional — independent gates per Spec Review Fix #3)
  if (
    bm.marketSize ||
    bm.marketStats?.length ||
    bm.competitors?.length ||
    bm.differentiation?.length
  ) {
    let m = `## 시장\n\n`;
    m += line("시장 규모", bm.marketSize);
    if (bm.marketStats?.length) m += `주요 통계:\n${list(bm.marketStats)}`;
    if (bm.competitors?.length) {
      m += `경쟁사:\n${bm.competitors.map((c) => `- ${sanitizeForPrompt(c.name)}: ${sanitizeForPrompt(c.weakness)}`).join("\n")}\n`;
    }
    if (bm.differentiation?.length) m += `차별화:\n${list(bm.differentiation)}`;
    sections.push(m);
  }

  // Finance (optional — currentStage, funding, goals)
  if (bm.currentStage || bm.funding || bm.goals) {
    let f = `## 재무 현황\n\n`;
    f += line("현재 단계", bm.currentStage);
    f += line("투자 현황", bm.funding);
    f += line("목표", bm.goals);
    sections.push(f);
  }

  // Challenges & goals (optional — meetingObjective + quarterGoal independent gates)
  if (bm.challenges?.length || bm.meetingObjective || bm.quarterGoal) {
    let c = `## 현재 도전\n\n`;
    if (bm.challenges?.length) {
      c += bm.challenges.map((ch, i) => `${i + 1}. ${sanitizeForPrompt(ch)}`).join("\n") + "\n";
    }
    c += line("분기 목표", bm.quarterGoal);
    c += line("이번 회의 목표", bm.meetingObjective);
    sections.push(c);
  }

  // Brand positioning (optional — subCopy has independent gate)
  if (bm.brandCopy || bm.subCopy || bm.positioning) {
    let b = `## 브랜드 포지셔닝\n\n`;
    if (bm.brandCopy) b += `카피: "${sanitizeForPrompt(bm.brandCopy)}"\n`;
    if (bm.subCopy) b += `서브 카피: "${sanitizeForPrompt(bm.subCopy)}"\n`;
    b += line("포지셔닝", bm.positioning);
    sections.push(b);
  }

  // External links (optional)
  if (bm.links?.length) {
    let l = `## 참고 링크\n\n`;
    l += bm.links
      .map((lk) => `- ${sanitizeForPrompt(lk.label)}: ${sanitizeForPrompt(lk.url)}`)
      .join("\n");
    l += "\n";
    sections.push(l);
  }

  sections.push(
    `위 정보를 바탕으로 발언하되, 정보를 그대로 나열하지 말고 자연스럽게 맥락에 녹여서 사용하세요.`,
  );

  const result = sections.join("\n");

  // Token budget warning (no auto-truncation — demo safety)
  if (result.length > BRAND_MEMORY_MAX_CHARS) {
    console.warn(
      `[BrandMemory] Layer 0 prompt exceeds ${BRAND_MEMORY_MAX_CHARS} chars (${result.length}). Consider trimming optional fields.`,
    );
  }

  return result;
}
