import { SettingsView } from "@/components/SettingsView";
import { isMissingTableError } from "@/lib/db-errors";
import { getIcpConfigRow, getMasterPromptRow, getScoringWeightsRow } from "@/lib/settings";

export const dynamic = "force-dynamic";

const MIGRATION_SNIPPET = `alter table companies add column if not exists customer_fit text;
alter table companies add column if not exists activity_score text;
alter table companies add column if not exists activity_score_numeric numeric;
alter table companies add column if not exists industry text;
alter table companies add column if not exists employee_count_range text;
alter table companies add column if not exists preferred_technology text;
alter table companies add column if not exists country text;

create table if not exists settings (
  id             uuid primary key default gen_random_uuid(),
  section        text not null,
  config_version integer not null,
  config         jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists idx_settings_section_version on settings(section, config_version);
create index if not exists idx_settings_section_latest on settings(section, config_version desc);`;

export default async function SettingsPage() {
  try {
    const [
      { weights, version: weightsVersion },
      { config: icp, version: icpVersion },
      { masterPrompt, version: masterPromptVersion },
    ] = await Promise.all([getScoringWeightsRow(), getIcpConfigRow(), getMasterPromptRow()]);

    return (
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <SettingsView
          initialWeights={weights}
          initialWeightsVersion={weightsVersion}
          initialIcp={icp}
          initialIcpVersion={icpVersion}
          initialMasterPrompt={masterPrompt}
          initialMasterPromptVersion={masterPromptVersion}
        />
      </div>
    );
  } catch (err) {
    if (!isMissingTableError(err)) throw err;

    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h1 className="mb-1 text-lg font-semibold text-persian-blue">
            Settings table not found
          </h1>
          <p className="mb-3 text-sm text-zinc-600">
            Run this once in your Supabase SQL editor, then reload this page:
          </p>
          <pre className="overflow-x-auto rounded bg-zinc-900 p-3 text-xs text-zinc-100">
            {MIGRATION_SNIPPET}
          </pre>
        </div>
      </div>
    );
  }
}
