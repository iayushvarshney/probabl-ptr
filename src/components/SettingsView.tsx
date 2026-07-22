"use client";

import { useState } from "react";
import { Field, Section } from "@/components/ui";
import { PlusIcon, RefreshIcon, SaveIcon, XIcon } from "@/components/icons";
import { EMPLOYEE_COUNT_RANGE_OPTIONS, type IcpConfig } from "@/lib/icp.config";
import type { ScoringWeights } from "@/lib/scoring.config";
import type { RelationshipState, SignalType } from "@/lib/types";

function companyLabel(count: number): string {
  return count === 1 ? "company" : "companies";
}

function humanizeSignalType(type: string): string {
  return type.replace(/_/g, " ");
}

const RELATIONSHIP_STATE_LABELS: Record<RelationshipState, string> = {
  NEW_CONTACT_KNOWN_COMPANY: "New contact · known company",
  KNOWN_CONTACT_KNOWN_COMPANY: "Known contact",
  NET_NEW_CONTACT_NET_NEW_COMPANY: "Net new",
};

function clamp(value: number, min?: number, max?: number): number {
  let result = value;
  if (min !== undefined) result = Math.max(min, result);
  if (max !== undefined) result = Math.min(max, result);
  return result;
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const raw = Number(e.target.value);
          onChange(Number.isNaN(raw) ? 0 : clamp(raw, min, max));
        }}
        className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none"
      />
    </Field>
  );
}

function TagListField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setDraft("");
  }

  return (
    <Field label={label}>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-zinc-400 hover:text-zinc-700"
              aria-label={`Remove ${v}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-zinc-400">none — no constraint</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none"
        />
        <button
          type="button"
          onClick={addTag}
          className="flex items-center gap-1.5 rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </Field>
  );
}

function NeverTargetField({
  entries,
  onChange,
}: {
  entries: IcpConfig["neverTargetEntries"];
  onChange: (entries: IcpConfig["neverTargetEntries"]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addEntry() {
    const trimmed = draft.trim();
    if (trimmed && !entries.some((e) => e.domain === trimmed)) {
      onChange([...entries, { domain: trimmed, enabled: true }]);
    }
    setDraft("");
  }

  return (
    <Field label='"Never target" list'>
      <div className="mb-2 flex flex-col gap-1.5">
        {entries.map((entry, i) => (
          <div key={entry.domain} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={entry.enabled}
              onChange={(e) => {
                const next = [...entries];
                next[i] = { ...entry, enabled: e.target.checked };
                onChange(next);
              }}
              className="h-4 w-4 rounded border-zinc-300 text-persian-blue focus:ring-persian-blue"
            />
            <span className={`flex-1 ${entry.enabled ? "text-zinc-700" : "text-zinc-400 line-through"}`}>
              {entry.domain}
            </span>
            <button
              type="button"
              onClick={() => onChange(entries.filter((_, idx) => idx !== i))}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-600"
            >
              <XIcon className="h-3 w-3" />
              Remove
            </button>
          </div>
        ))}
        {entries.length === 0 && <span className="text-xs text-zinc-400">none</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEntry();
            }
          }}
          placeholder="domain.com"
          className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none"
        />
        <button
          type="button"
          onClick={addEntry}
          className="flex items-center gap-1.5 rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </Field>
  );
}

function SaveResetButtons({
  onSave,
  onReset,
  isSaving,
  saveLabel = "Save",
}: {
  onSave: () => void;
  onReset: () => void;
  isSaving: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className="flex items-center gap-1.5 rounded-full bg-sea-buckthorn px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <SaveIcon className="h-4 w-4" />
        {isSaving ? "Saving…" : saveLabel}
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={isSaving}
        className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
      >
        <RefreshIcon className="h-4 w-4" />
        Reset to defaults
      </button>
    </div>
  );
}

export function SettingsView({
  initialWeights,
  initialWeightsVersion,
  initialIcp,
  initialIcpVersion,
}: {
  initialWeights: ScoringWeights;
  initialWeightsVersion: number;
  initialIcp: IcpConfig;
  initialIcpVersion: number;
}) {
  const [activeTab, setActiveTab] = useState<"weights" | "icp">("weights");

  const [weights, setWeights] = useState(initialWeights);
  const [weightsVersion, setWeightsVersion] = useState(initialWeightsVersion);
  const [isSavingScoring, setIsSavingScoring] = useState(false);
  const [scoringMessage, setScoringMessage] = useState<string | null>(null);
  const [scoringError, setScoringError] = useState<string | null>(null);

  const [icp, setIcp] = useState(initialIcp);
  const [icpVersion, setIcpVersion] = useState(initialIcpVersion);
  const [isSavingIcp, setIsSavingIcp] = useState(false);
  const [icpMessage, setIcpMessage] = useState<string | null>(null);
  const [icpError, setIcpError] = useState<string | null>(null);

  async function handleSaveScoring() {
    setIsSavingScoring(true);
    setScoringError(null);
    setScoringMessage(null);
    try {
      const res = await fetch("/api/settings/scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setWeightsVersion(json.version);
      setScoringMessage(
        `Saved as v${json.version} — re-scored ${json.rescoredCount} ${companyLabel(json.rescoredCount)}.`
      );
    } catch (err) {
      setScoringError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSavingScoring(false);
    }
  }

  async function handleResetScoring() {
    setIsSavingScoring(true);
    setScoringError(null);
    setScoringMessage(null);
    try {
      const res = await fetch("/api/settings/scoring/reset", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Reset failed");
      setWeights(json.weights);
      setWeightsVersion(json.version);
      setScoringMessage(
        `Reset to defaults as v${json.version} — re-scored ${json.rescoredCount} ${companyLabel(json.rescoredCount)}.`
      );
    } catch (err) {
      setScoringError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setIsSavingScoring(false);
    }
  }

  async function handleSaveIcp() {
    setIsSavingIcp(true);
    setIcpError(null);
    setIcpMessage(null);
    try {
      const res = await fetch("/api/settings/icp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: icp }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setIcpVersion(json.version);
      setIcpMessage(
        `Saved as v${json.version} — re-evaluated ${json.evaluatedCompanies} companies ` +
          `(${json.changedCompanies} changed), re-scored ${json.rescoredCount} ${companyLabel(json.rescoredCount)}.`
      );
    } catch (err) {
      setIcpError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSavingIcp(false);
    }
  }

  async function handleResetIcp() {
    setIsSavingIcp(true);
    setIcpError(null);
    setIcpMessage(null);
    try {
      const res = await fetch("/api/settings/icp/reset", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Reset failed");
      setIcp(json.config);
      setIcpVersion(json.version);
      setIcpMessage(
        `Reset to defaults as v${json.version} — re-evaluated ${json.evaluatedCompanies} companies ` +
          `(${json.changedCompanies} changed), re-scored ${json.rescoredCount} ${companyLabel(json.rescoredCount)}.`
      );
    } catch (err) {
      setIcpError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setIsSavingIcp(false);
    }
  }

  const signalTypes = Object.keys(weights.signalTypeWeights) as SignalType[];
  const relationshipStates = Object.keys(weights.relationshipWeights) as RelationshipState[];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-persian-blue">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Scoring weights and ICP definition, applied everywhere signals get scored.
        </p>
      </header>

      <div className="flex items-center gap-1 border-b border-zinc-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("weights")}
          className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            activeTab === "weights"
              ? "bg-persian-blue/10 text-persian-blue"
              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
          }`}
        >
          Signal weights
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("icp")}
          className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            activeTab === "icp"
              ? "bg-persian-blue/10 text-persian-blue"
              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
          }`}
        >
          ICP definition
        </button>
      </div>

      {activeTab === "weights" && (
      <Section title={`Signal weights (v${weightsVersion})`}>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-1 text-sm font-medium text-zinc-700">Signal type weights</h3>
            <p className="mb-2 text-xs text-zinc-400">
              Scale of 0–100 (100 = highest signal strength, 0 = least).
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {signalTypes.map((type) => (
                <NumberField
                  key={type}
                  label={humanizeSignalType(type)}
                  value={weights.signalTypeWeights[type]}
                  min={0}
                  max={100}
                  onChange={(v) =>
                    setWeights((prev) => ({
                      ...prev,
                      signalTypeWeights: { ...prev.signalTypeWeights, [type]: v },
                    }))
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-700">Recency decay</h3>
            <div className="flex flex-col gap-2">
              {weights.recencyDecayTiers.map((tier, i) => {
                const isLast = i === weights.recencyDecayTiers.length - 1;
                return (
                  <div key={i} className="grid grid-cols-2 gap-3 sm:max-w-md">
                    <Field label={isLast ? "Beyond (days)" : "Within (days)"}>
                      {isLast ? (
                        <input
                          disabled
                          value="everything else"
                          className="w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-400"
                        />
                      ) : (
                        <input
                          type="number"
                          value={tier.maxDays}
                          onChange={(e) => {
                            const next = [...weights.recencyDecayTiers];
                            next[i] = { ...tier, maxDays: Number(e.target.value) };
                            setWeights((prev) => ({ ...prev, recencyDecayTiers: next }));
                          }}
                          className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none"
                        />
                      )}
                    </Field>
                    <NumberField
                      label="Multiplier"
                      step={0.1}
                      value={tier.multiplier}
                      onChange={(v) => {
                        const next = [...weights.recencyDecayTiers];
                        next[i] = { ...tier, multiplier: v };
                        setWeights((prev) => ({ ...prev, recencyDecayTiers: next }));
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-700">Relationship-state weights</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {relationshipStates.map((state) => (
                <NumberField
                  key={state}
                  label={RELATIONSHIP_STATE_LABELS[state]}
                  step={0.1}
                  value={weights.relationshipWeights[state]}
                  onChange={(v) =>
                    setWeights((prev) => ({
                      ...prev,
                      relationshipWeights: { ...prev.relationshipWeights, [state]: v },
                    }))
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-700">Multipliers</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <NumberField
                label="NET_NEW × ICP match bonus"
                step={0.1}
                value={weights.netNewIcpBonusMultiplier}
                onChange={(v) => setWeights((prev) => ({ ...prev, netNewIcpBonusMultiplier: v }))}
              />
              <NumberField
                label="Target account multiplier"
                step={0.1}
                value={weights.targetAccountMultiplier}
                onChange={(v) => setWeights((prev) => ({ ...prev, targetAccountMultiplier: v }))}
              />
              <NumberField
                label="Non-target account multiplier"
                step={0.1}
                value={weights.nonTargetAccountMultiplier}
                onChange={(v) => setWeights((prev) => ({ ...prev, nonTargetAccountMultiplier: v }))}
              />
            </div>
          </div>

          {scoringMessage && <p className="text-sm text-green-700">{scoringMessage}</p>}
          {scoringError && <p className="text-sm text-red-600">{scoringError}</p>}

          <SaveResetButtons
            onSave={handleSaveScoring}
            onReset={handleResetScoring}
            isSaving={isSavingScoring}
          />
        </div>
      </Section>
      )}

      {activeTab === "icp" && (
      <Section title={`ICP definition (v${icpVersion})`}>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-700">Company size</h3>
            <div className="flex flex-wrap gap-3">
              {EMPLOYEE_COUNT_RANGE_OPTIONS.map((range) => {
                const checked = icp.employeeCountRanges.includes(range);
                return (
                  <label key={range} className="flex items-center gap-1.5 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setIcp((prev) => ({
                          ...prev,
                          employeeCountRanges: e.target.checked
                            ? [...prev.employeeCountRanges, range]
                            : prev.employeeCountRanges.filter((r) => r !== range),
                        }))
                      }
                      className="h-4 w-4 rounded border-zinc-300 text-persian-blue focus:ring-persian-blue"
                    />
                    {range}
                  </label>
                );
              })}
            </div>
          </div>

          <TagListField
            label="Geography (countries / regions)"
            values={icp.geographies}
            onChange={(v) => setIcp((prev) => ({ ...prev, geographies: v }))}
            placeholder="United States"
          />

          <TagListField
            label="Industries to include"
            values={icp.includeIndustries}
            onChange={(v) => setIcp((prev) => ({ ...prev, includeIndustries: v }))}
            placeholder="Developer Tools"
          />

          <TagListField
            label="Technographics"
            values={icp.technographics}
            onChange={(v) => setIcp((prev) => ({ ...prev, technographics: v }))}
            placeholder="Python, scikit-learn, ML tooling"
          />

          <div className="border-t border-zinc-100 pt-4">
            <h3 className="mb-3 text-sm font-medium text-zinc-700">Exclusions</h3>
            <div className="flex flex-col gap-4">
              <TagListField
                label="Industries to exclude"
                values={icp.excludeIndustries}
                onChange={(v) => setIcp((prev) => ({ ...prev, excludeIndustries: v }))}
                placeholder="Government"
              />

              <Field label="Domains to exclude (competitors — one per line)">
                <textarea
                  value={icp.excludeDomains.join("\n")}
                  onChange={(e) =>
                    setIcp((prev) => ({
                      ...prev,
                      excludeDomains: e.target.value
                        .split("\n")
                        .map((d) => d.trim())
                        .filter(Boolean),
                    }))
                  }
                  rows={3}
                  placeholder={"competitor1.com\ncompetitor2.com"}
                  className="w-full rounded border border-zinc-300 px-3 py-1.5 font-mono text-sm focus:border-persian-blue focus:outline-none"
                />
              </Field>

              <NeverTargetField
                entries={icp.neverTargetEntries}
                onChange={(v) => setIcp((prev) => ({ ...prev, neverTargetEntries: v }))}
              />
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-4">
            <TagListField
              label="Always treat as ICP-match (named target accounts)"
              values={icp.alwaysMatchDomains}
              onChange={(v) => setIcp((prev) => ({ ...prev, alwaysMatchDomains: v }))}
              placeholder="big-target-account.com"
            />
          </div>

          {icpMessage && <p className="text-sm text-green-700">{icpMessage}</p>}
          {icpError && <p className="text-sm text-red-600">{icpError}</p>}

          <SaveResetButtons onSave={handleSaveIcp} onReset={handleResetIcp} isSaving={isSavingIcp} />
        </div>
      </Section>
      )}
    </div>
  );
}
