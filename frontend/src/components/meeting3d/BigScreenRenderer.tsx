// SVG-based template renderer for BigScreen visualization
// Converts BigScreenRenderData to Canvas texture for ArtifactScreen3D mesh
// Ref: Spec §5

import type { BigScreenRenderData, BigScreenUpdateEvent } from "../../types";

const SCREEN_WIDTH = 1024;
const SCREEN_HEIGHT = 576;

/** Escape text for safe SVG interpolation — prevents XSS from LLM output */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderComparisonSVG(data: Extract<BigScreenRenderData, { type: "comparison" }>): string {
  const columns = Array.isArray(data.columns) ? data.columns : [];
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (columns.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}"><rect width="100%" height="100%" fill="#0d1117"/><text x="50%" y="50%" text-anchor="middle" fill="#e6edf3" font-size="20">비교 데이터 준비 중...</text></svg>`;
  }
  const colWidth = SCREEN_WIDTH / columns.length;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  columns.forEach((col, i) => {
    svg += `<text x="${i * colWidth + colWidth / 2}" y="40" text-anchor="middle" fill="#58a6ff" font-size="20" font-weight="bold">${esc(col)}</text>`;
  });
  svg += `<line x1="0" y1="55" x2="${SCREEN_WIDTH}" y2="55" stroke="#30363d" stroke-width="1"/>`;
  rows.forEach((row, ri) => {
    const y = 90 + ri * 45;
    row.forEach((cell, ci) => {
      svg += `<text x="${ci * colWidth + colWidth / 2}" y="${y}" text-anchor="middle" fill="#e6edf3" font-size="16">${esc(cell)}</text>`;
    });
  });
  svg += `</svg>`;
  return svg;
}

function renderPieChartSVG(data: Extract<BigScreenRenderData, { type: "pie-chart" }>): string {
  const cx = SCREEN_WIDTH / 2;
  const cy = SCREEN_HEIGHT / 2;
  const r = 150;
  const items = Array.isArray(data.items) ? data.items : [];
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  let startAngle = 0;
  items.forEach((item) => {
    const angle = (item.value / total) * 360;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos((Math.PI / 180) * startAngle);
    const y1 = cy + r * Math.sin((Math.PI / 180) * startAngle);
    const x2 = cx + r * Math.cos((Math.PI / 180) * endAngle);
    const y2 = cy + r * Math.sin((Math.PI / 180) * endAngle);
    const largeArc = angle > 180 ? 1 : 0;
    svg += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${item.color}"/>`;
    startAngle = endAngle;
  });
  items.forEach((item, i) => {
    const ly = 40 + i * 25;
    svg += `<rect x="20" y="${ly - 10}" width="12" height="12" fill="${item.color}"/>`;
    svg += `<text x="38" y="${ly}" fill="#e6edf3" font-size="13">${esc(item.label)} (${item.value}%)</text>`;
  });
  svg += `</svg>`;
  return svg;
}

function renderBarChartSVG(data: Extract<BigScreenRenderData, { type: "bar-chart" }>): string {
  const items = Array.isArray(data.items) ? data.items : [];
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  const barW = Math.min(80, (SCREEN_WIDTH - 100) / Math.max(items.length, 1) - 10);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  items.forEach((item, i) => {
    const barH = (item.value / maxVal) * 380;
    const x = 60 + i * (barW + 10);
    const y = SCREEN_HEIGHT - 80 - barH;
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="#58a6ff" rx="4"/>`;
    svg += `<text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" fill="#e6edf3" font-size="12">${item.value}</text>`;
    svg += `<text x="${x + barW / 2}" y="${SCREEN_HEIGHT - 55}" text-anchor="middle" fill="#8b949e" font-size="11">${esc(item.label)}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

function renderTimelineSVG(data: Extract<BigScreenRenderData, { type: "timeline" }>): string {
  const items = Array.isArray(data.items) ? data.items : [];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  const lineY = SCREEN_HEIGHT / 2;
  svg += `<line x1="40" y1="${lineY}" x2="${SCREEN_WIDTH - 40}" y2="${lineY}" stroke="#30363d" stroke-width="2"/>`;
  const step = (SCREEN_WIDTH - 120) / Math.max(items.length - 1, 1);
  const statusColors: Record<string, string> = {
    done: "#3fb950",
    current: "#58a6ff",
    pending: "#484f58",
  };
  items.forEach((item, i) => {
    const x = 60 + i * step;
    const color = statusColors[item.status] ?? "#484f58";
    svg += `<circle cx="${x}" cy="${lineY}" r="8" fill="${color}"/>`;
    svg += `<text x="${x}" y="${lineY - 20}" text-anchor="middle" fill="#e6edf3" font-size="12">${esc(item.label)}</text>`;
    svg += `<text x="${x}" y="${lineY + 30}" text-anchor="middle" fill="#8b949e" font-size="10">${esc(item.date)}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

function renderChecklistSVG(data: Extract<BigScreenRenderData, { type: "checklist" }>): string {
  const items = Array.isArray(data.items) ? data.items : [];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  if (items.length === 0) {
    svg += `<text x="50%" y="50%" text-anchor="middle" fill="#484f58" font-size="16">항목을 준비 중입니다...</text>`;
  } else {
    items.forEach((item, i) => {
      const y = 50 + i * 45;
      const color = item.checked ? "#3fb950" : "#484f58";
      const icon = item.checked ? "\u2713" : "\u25CB";
      svg += `<text x="40" y="${y}" fill="${color}" font-size="18">${icon}</text>`;
      svg += `<text x="70" y="${y}" fill="${item.checked ? "#e6edf3" : "#8b949e"}" font-size="16">${esc(item.text)}</text>`;
    });
  }
  svg += `</svg>`;
  return svg;
}

function renderSummarySVG(data: Extract<BigScreenRenderData, { type: "summary" }>): string {
  const items = Array.isArray(data.items) ? data.items : [];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  svg += `<text x="40" y="40" fill="#58a6ff" font-size="20" font-weight="bold">Summary</text>`;
  if (items.length === 0) {
    svg += `<text x="50%" y="50%" text-anchor="middle" fill="#484f58" font-size="16">내용을 준비 중입니다...</text>`;
  } else {
    items.forEach((item, i) => {
      const y = 80 + i * 40;
      svg += `<text x="50" y="${y}" fill="#e6edf3" font-size="15">\u2022 ${esc(item)}</text>`;
    });
  }
  svg += `</svg>`;
  return svg;
}

function renderArchitectureSVG(
  data: Extract<BigScreenRenderData, { type: "architecture" }>,
): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  const scaleX = (x: number) => 60 + (x / 100) * (SCREEN_WIDTH - 120);
  const scaleY = (y: number) => 60 + (y / 100) * (SCREEN_HEIGHT - 120);
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  edges.forEach((edge) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (from && to) {
      svg += `<line x1="${scaleX(from.x)}" y1="${scaleY(from.y)}" x2="${scaleX(to.x)}" y2="${scaleY(to.y)}" stroke="#30363d" stroke-width="2"/>`;
    }
  });
  nodes.forEach((node) => {
    const x = scaleX(node.x);
    const y = scaleY(node.y);
    svg += `<rect x="${x - 50}" y="${y - 18}" width="100" height="36" rx="6" fill="#161b22" stroke="#58a6ff" stroke-width="1"/>`;
    svg += `<text x="${x}" y="${y + 5}" text-anchor="middle" fill="#e6edf3" font-size="12">${esc(node.label)}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

export function renderToCanvas(
  canvas: HTMLCanvasElement,
  event: BigScreenUpdateEvent,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!event?.renderData) {
      reject(new Error("No renderData in event"));
      return;
    }

    let svgString: string;

    switch (event.renderData.type) {
      case "comparison":
        svgString = renderComparisonSVG(event.renderData);
        break;
      case "pie-chart":
        svgString = renderPieChartSVG(event.renderData);
        break;
      case "bar-chart":
        svgString = renderBarChartSVG(event.renderData);
        break;
      case "timeline":
        svgString = renderTimelineSVG(event.renderData);
        break;
      case "checklist":
        svgString = renderChecklistSVG(event.renderData);
        break;
      case "summary":
        svgString = renderSummarySVG(event.renderData);
        break;
      case "architecture":
        svgString = renderArchitectureSVG(event.renderData);
        break;
      default:
        svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}"><rect width="100%" height="100%" fill="#0d1117"/><text x="50%" y="50%" text-anchor="middle" fill="#e6edf3" font-size="20">${esc(event.title)}</text></svg>`;
    }

    // Inject title bar into SVG — skip types that already have headers at y≤40
    const skipTitleTypes = new Set(["comparison", "summary"]);
    if (event.title && !skipTitleTypes.has(event.renderData.type)) {
      const titleSVG = `<text x="${SCREEN_WIDTH / 2}" y="28" text-anchor="middle" fill="#58a6ff" font-size="18" font-weight="bold">${esc(event.title)}</text>`;
      svgString = svgString.replace('fill="#0d1117"/>', `fill="#0d1117"/>${titleSVG}`);
    }

    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    // Set dimensions BEFORE requesting the context — resizing after ctx acquisition
    // resets the context state, which can cause a blank frame on some browsers.
    img.onload = () => {
      // Reset canvas dimensions first (clears the canvas with a fresh context state)
      canvas.width = SCREEN_WIDTH;
      canvas.height = SCREEN_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}
