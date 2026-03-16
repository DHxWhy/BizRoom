// Brand Memory presets for demo and quick setup
// Ref: Spec §2, §5.3

import type { BrandMemorySet } from "../types";

export const BRAND_PRESETS: Record<string, { label: string; data: BrandMemorySet }> = {
  maestiq: {
    label: "Maestiq (Demo)",
    data: {
      companyName: "Maestiq",
      industry: "AI SaaS / Productivity Tools",
      foundedDate: "2026-02-11",
      founderName: "",
      teamSize: "Solo Founder",
      mission: "Even a one-person company can operate like a Fortune 500",
      vision: "Democratizing executive-level decision-making with AI",
      productName: "BizRoom.ai",
      productDescription: "A 3D virtual meeting room where you hold real-time voice meetings with an AI C-Suite executive team",
      coreFeatures: [
        "Real-time voice meetings with AI executives + natural turn-taking",
        "6 built-in C-Suite roles (COO, CFO, CMO, CTO, CDO, CLO) — customizable by industry at scale",
        "Live data visualization on BigScreen",
        "Auto-generated meeting minutes / PPT / Excel → saved to OneDrive",
      ],
      targetCustomer: "Solo founders, micro-business owners, freelancers",
      techStack:
        "Azure Functions, OpenAI GPT Realtime 1.5 (voice), Whisper-1 (STT), Anthropic Claude (text), Azure SignalR, React Three Fiber, Microsoft Graph API",
      revenueModel: "Monthly subscription SaaS (Freemium → Pro → Team tiers)",
      pricing: [
        { name: "Freemium", price: "Free", features: "Basic trial" },
        { name: "Pro", price: "$39/mo", features: "Individual use" },
        { name: "Team", price: "$79/mo", features: "Team collaboration" },
      ],
      marketSize: "150M solo entrepreneurs globally, AI SaaS market $30.3B (2026)",
      marketStats: [
        "150M one-person businesses globally (2025)",
        "29.8M solo businesses in the US, generating $1.7T annually",
        "84% of all US businesses are non-employer firms",
        "AI SaaS market $30.3B (2026), CAGR 36.6%",
        "SMB software market $80.1B (2026)",
        "63% of SMBs use AI daily (2025 survey)",
      ],
      competitors: [
        {
          name: "ChatGPT",
          weakness: "General-purpose AI, no role specialization, text-only",
        },
        {
          name: "Microsoft Copilot",
          weakness: "1:1 assistant model, no meeting dynamics",
        },
        { name: "Notion AI", weakness: "Document-focused, no voice meetings" },
        {
          name: "Fireflies.ai",
          weakness: "Transcription only, no decision-making participation",
        },
      ],
      differentiation: [
        "Role-based AI executives, not a generic assistant",
        "Real-time voice meetings, not text chat",
        "Decision-making + artifact generation, not just note-taking",
        "Microsoft 365 native integration",
      ],
      currentStage: "MVP complete, submitted to hackathon",
      funding: "Bootstrapped (self-funded)",
      goals: "Win MS AI Dev Days → Launch on AppSource",
      links: [
        { label: "GitHub", url: "https://github.com/maestiq/bizroom" },
        { label: "AppSource", url: "(launching soon)" },
        { label: "Azure Portal", url: "https://portal.azure.com" },
        { label: "MS AI Dev Days", url: "https://devdays.microsoft.com" },
      ],
      challenges: [
        "Communicate value to hackathon judges within 3 minutes",
        "Ensure real-time demo stability",
        "Define AppSource launch roadmap",
      ],
      quarterGoal: "Win Microsoft AI Dev Days Hackathon",
      meetingObjective: "Prepare BizRoom.ai hackathon submission strategy",
      brandCopy: "Rent an executive team for $39/month",
      subCopy: "AI C-Suite + virtual office. You're not alone anymore.",
      positioning: "An experiential platform for LLMs — not an AI model, but an AI management experience",
    },
  },
};

/** Get default empty brand memory with only required fields */
export function createEmptyBrandMemory(): BrandMemorySet {
  return {
    companyName: "",
    industry: "",
    productName: "",
  };
}
