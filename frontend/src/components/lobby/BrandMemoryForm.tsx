import { useState, useCallback, memo } from "react";
import { S } from "../../constants/strings";
import { BRAND_PRESETS } from "../../constants/brandPresets";
import type { BrandMemorySet } from "../../types";

interface BrandMemoryFormProps {
  value: BrandMemorySet;
  onChange: (bm: BrandMemorySet) => void;
  onNext: () => void;
  onBack: () => void;
}

export const BrandMemoryForm = memo(function BrandMemoryForm({
  value,
  onChange,
  onNext,
  onBack,
}: BrandMemoryFormProps) {
  const [presetApplied, setPresetApplied] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  const handlePreset = useCallback(() => {
    const preset = BRAND_PRESETS.maestiq;
    if (preset) {
      onChange(preset.data);
      setPresetApplied(true);
      setTimeout(() => setPresetApplied(false), 2000);
    }
  }, [onChange]);

  const updateField = useCallback(
    <K extends keyof BrandMemorySet>(key: K, val: BrandMemorySet[K]) => {
      onChange({ ...value, [key]: val });
    },
    [value, onChange],
  );

  const isValid =
    value.companyName.trim() !== "" &&
    value.industry.trim() !== "" &&
    value.productName.trim() !== "";

  const toggleSection = useCallback((section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-white">{S.brandMemory.stepTitle}</h2>
        <p className="text-neutral-400 text-sm mt-1">{S.brandMemory.stepSubtitle}</p>
      </div>

      {/* Preset button */}
      <button
        type="button"
        onClick={handlePreset}
        className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-purple-300 text-sm font-medium transition-all"
      >
        {presetApplied ? S.brandMemory.presetApplied : S.brandMemory.presetButton}
      </button>

      {/* Required fields */}
      <div className="space-y-3">
        <RequiredInput
          label={S.brandMemory.companyName}
          value={value.companyName}
          onChange={(v) => updateField("companyName", v)}
        />
        <RequiredInput
          label={S.brandMemory.industry}
          value={value.industry}
          onChange={(v) => updateField("industry", v)}
        />
        <RequiredInput
          label={S.brandMemory.productName}
          value={value.productName}
          onChange={(v) => updateField("productName", v)}
        />
      </div>

      {/* Accordion sections */}
      <AccordionSection
        title={S.brandMemory.sectionBasic}
        isOpen={openSection === "basic"}
        onToggle={() => toggleSection("basic")}
      >
        <OptionalInput
          label={S.brandMemory.foundedDate}
          value={value.foundedDate ?? ""}
          onChange={(v) => updateField("foundedDate", v || undefined)}
        />
        <OptionalInput
          label={S.brandMemory.founderName}
          value={value.founderName ?? ""}
          onChange={(v) => updateField("founderName", v || undefined)}
        />
        <OptionalInput
          label={S.brandMemory.teamSize}
          value={value.teamSize ?? ""}
          onChange={(v) => updateField("teamSize", v || undefined)}
        />
        <OptionalInput
          label={S.brandMemory.mission}
          value={value.mission ?? ""}
          onChange={(v) => updateField("mission", v || undefined)}
        />
        <OptionalInput
          label={S.brandMemory.vision}
          value={value.vision ?? ""}
          onChange={(v) => updateField("vision", v || undefined)}
        />
      </AccordionSection>

      <AccordionSection
        title={S.brandMemory.sectionProduct}
        isOpen={openSection === "product"}
        onToggle={() => toggleSection("product")}
      >
        <OptionalInput
          label={S.brandMemory.productDescription}
          value={value.productDescription ?? ""}
          onChange={(v) => updateField("productDescription", v || undefined)}
        />
        <OptionalInput
          label={S.brandMemory.targetCustomer}
          value={value.targetCustomer ?? ""}
          onChange={(v) => updateField("targetCustomer", v || undefined)}
        />
        <OptionalInput
          label={S.brandMemory.techStack}
          value={value.techStack ?? ""}
          onChange={(v) => updateField("techStack", v || undefined)}
        />
        <OptionalInput
          label={S.brandMemory.revenueModel}
          value={value.revenueModel ?? ""}
          onChange={(v) => updateField("revenueModel", v || undefined)}
        />
      </AccordionSection>

      <AccordionSection
        title={S.brandMemory.sectionMarket}
        isOpen={openSection === "market"}
        onToggle={() => toggleSection("market")}
      >
        <OptionalInput
          label={S.brandMemory.marketSize}
          value={value.marketSize ?? ""}
          onChange={(v) => updateField("marketSize", v || undefined)}
        />
      </AccordionSection>

      <AccordionSection
        title={S.brandMemory.sectionFinance}
        isOpen={openSection === "finance"}
        onToggle={() => toggleSection("finance")}
      >
        <OptionalInput
          label={S.brandMemory.currentStage}
          value={value.currentStage ?? ""}
          onChange={(v) => updateField("currentStage", v || undefined)}
        />
        <OptionalInput
          label={S.brandMemory.funding}
          value={value.funding ?? ""}
          onChange={(v) => updateField("funding", v || undefined)}
        />
        <OptionalInput
          label={S.brandMemory.goals}
          value={value.goals ?? ""}
          onChange={(v) => updateField("goals", v || undefined)}
        />
      </AccordionSection>

      <AccordionSection
        title={S.brandMemory.sectionBrand}
        isOpen={openSection === "brand"}
        onToggle={() => toggleSection("brand")}
      >
        <OptionalInput
          label={S.brandMemory.brandCopy}
          value={value.brandCopy ?? ""}
          onChange={(v) => updateField("brandCopy", v || undefined)}
        />
        <OptionalInput
          label={S.brandMemory.positioning}
          value={value.positioning ?? ""}
          onChange={(v) => updateField("positioning", v || undefined)}
        />
      </AccordionSection>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-300 font-medium transition-all"
        >
          {S.brandMemory.back}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!isValid}
          className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-500 rounded-xl text-white font-semibold transition-all"
        >
          {S.brandMemory.next}
        </button>
      </div>

      {/* Skip link */}
      <button
        type="button"
        onClick={onNext}
        className="w-full text-center text-neutral-500 text-xs hover:text-neutral-400 transition-colors"
      >
        {S.brandMemory.skip}
      </button>
    </div>
  );
});

/** Required field input with badge */
function RequiredInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
        {label} <span className="text-red-400 text-[10px]">{S.brandMemory.required}</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-neutral-900/60 border border-neutral-700/40 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all text-sm"
      />
    </div>
  );
}

/** Optional field input */
function OptionalInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1 tracking-wider">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-neutral-900/40 border border-neutral-800/40 rounded-lg text-white/80 placeholder-neutral-700 focus:outline-none focus:border-indigo-500/30 transition-all text-sm"
      />
    </div>
  );
}

/** Collapsible section */
function AccordionSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-neutral-800/40 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center justify-between bg-neutral-900/30 hover:bg-neutral-900/50 transition-colors"
      >
        <span className="text-sm text-neutral-300 font-medium">{title}</span>
        <span className="text-neutral-500 text-xs">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen && <div className="px-4 py-3 space-y-2.5">{children}</div>}
    </div>
  );
}
