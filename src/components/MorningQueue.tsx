"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatRelativeTime } from "@/lib/format";
import type { QueueEntity } from "@/lib/queue";
import {
  RELATIONSHIP_STATE_BADGE_CLASSES,
  RELATIONSHIP_STATE_LABELS,
  RELATIONSHIP_STATE_ORDER,
} from "@/lib/relationship-state";
import type { RelationshipState } from "@/lib/types";

type StateFilter = "ALL" | RelationshipState;

export function MorningQueue({ entities }: { entities: QueueEntity[] }) {
  const [stateFilter, setStateFilter] = useState<StateFilter>("ALL");
  const [targetOnly, setTargetOnly] = useState(false);

  const counts = useMemo(() => {
    const byState: Record<RelationshipState, number> = {
      NEW_CONTACT_KNOWN_COMPANY: 0,
      KNOWN_CONTACT_KNOWN_COMPANY: 0,
      NET_NEW_CONTACT_NET_NEW_COMPANY: 0,
    };
    for (const e of entities) byState[e.relationshipState] += 1;
    return byState;
  }, [entities]);

  const filtered = useMemo(() => {
    return entities.filter((e) => {
      if (stateFilter !== "ALL" && e.relationshipState !== stateFilter) return false;
      if (targetOnly && !e.isTargetAccount) return false;
      return true;
    });
  }, [entities, stateFilter, targetOnly]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <FilterButton active={stateFilter === "ALL"} onClick={() => setStateFilter("ALL")}>
            All ({entities.length})
          </FilterButton>
          {RELATIONSHIP_STATE_ORDER.map((state) => (
            <FilterButton
              key={state}
              active={stateFilter === state}
              onClick={() => setStateFilter(state)}
            >
              {RELATIONSHIP_STATE_LABELS[state]} ({counts[state]})
            </FilterButton>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={targetOnly}
            onChange={(e) => setTargetOnly(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-persian-blue focus:ring-persian-blue"
          />
          Target accounts only
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500">
          {entities.length === 0
            ? "No signals yet — the queue will fill up as they come in."
            : "Nothing matches these filters."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Relationship</th>
                <th className="px-4 py-2.5 font-medium text-right">Score</th>
                <th className="px-4 py-2.5 font-medium">Why</th>
                <th className="px-4 py-2.5 font-medium">Channels</th>
                <th className="px-4 py-2.5 font-medium">Flags</th>
                <th className="px-4 py-2.5 font-medium text-right">Last signal</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entity) => (
                <tr
                  key={entity.id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/entities/${entity.id}`}
                      className="font-medium text-persian-blue hover:underline"
                    >
                      {entity.companyName ?? entity.companyDomain ?? "Unknown company"}
                    </Link>
                    {entity.companyDomain && entity.companyName && (
                      <div className="text-xs text-zinc-400">{entity.companyDomain}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${RELATIONSHIP_STATE_BADGE_CLASSES[entity.relationshipState]}`}
                    >
                      {RELATIONSHIP_STATE_LABELS[entity.relationshipState]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-900">
                    {entity.compositeScore.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{entity.topReason ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {entity.originChannels.length > 0 ? entity.originChannels.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {entity.isTargetAccount && <Flag label="Target" />}
                      {entity.hasOpenOpp && <Flag label="Open opp" />}
                      {entity.matchesIcp && <Flag label="ICP" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-500">
                    {formatRelativeTime(entity.lastSignalAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-persian-blue text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function Flag({ label }: { label: string }) {
  return (
    <span className="rounded border border-persian-blue/30 bg-persian-blue/5 px-1.5 py-0.5 text-[11px] font-medium text-persian-blue">
      {label}
    </span>
  );
}
