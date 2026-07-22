"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { formatRelativeTime } from "@/lib/format";
import type { QueueEntity } from "@/lib/queue";
import {
  RELATIONSHIP_STATE_BADGE_CLASSES,
  RELATIONSHIP_STATE_LABELS,
  RELATIONSHIP_STATE_ORDER,
} from "@/lib/relationship-state";
import type { RelationshipState } from "@/lib/types";

type StateFilter = "ALL" | RelationshipState | "NO_COMPANY";

function hasNoCompany(entity: QueueEntity): boolean {
  return !entity.companyName && !entity.companyDomain;
}

function initialFor(entity: QueueEntity): string {
  const name = entity.companyName ?? entity.companyDomain ?? entity.contactEmail ?? "?";
  return name.charAt(0).toUpperCase();
}

export function MorningQueue({ entities }: { entities: QueueEntity[] }) {
  const [stateFilter, setStateFilter] = useState<StateFilter>("ALL");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const byState: Record<RelationshipState, number> = {
      NEW_CONTACT_KNOWN_COMPANY: 0,
      KNOWN_CONTACT_KNOWN_COMPANY: 0,
      NET_NEW_CONTACT_NET_NEW_COMPANY: 0,
    };
    let noCompany = 0;
    for (const e of entities) {
      // "No company" is its own bucket — every no-domain/no-name signal
      // resolves to NET_NEW_CONTACT_NET_NEW_COMPANY (nothing to match in
      // HubSpot), but showing it under "Net new" too would double-count it
      // across two tabs and conflate "not in HubSpot" with "no company at
      // all."
      if (hasNoCompany(e)) {
        noCompany += 1;
      } else {
        byState[e.relationshipState] += 1;
      }
    }
    return { byState, noCompany };
  }, [entities]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entities.filter((e) => {
      if (stateFilter === "NO_COMPANY") {
        if (!hasNoCompany(e)) return false;
      } else if (stateFilter !== "ALL") {
        if (hasNoCompany(e) || e.relationshipState !== stateFilter) return false;
      }
      if (query) {
        const haystack = `${e.companyName ?? ""} ${e.companyDomain ?? ""} ${e.contactEmail ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [entities, stateFilter, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterButton active={stateFilter === "ALL"} onClick={() => setStateFilter("ALL")}>
            All ({entities.length})
          </FilterButton>
          {RELATIONSHIP_STATE_ORDER.map((state) => (
            <FilterButton
              key={state}
              active={stateFilter === state}
              onClick={() => setStateFilter(state)}
            >
              {RELATIONSHIP_STATE_LABELS[state]} ({counts.byState[state]})
            </FilterButton>
          ))}
          {counts.noCompany > 0 && (
            <FilterButton
              active={stateFilter === "NO_COMPANY"}
              onClick={() => setStateFilter("NO_COMPANY")}
            >
              No company ({counts.noCompany})
            </FilterButton>
          )}
        </div>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies…"
            className="w-56 rounded-full border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-persian-blue focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500">
          {entities.length === 0
            ? "No signals yet — the queue will fill up as they come in."
            : "Nothing matches these filters."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((entity) => (
            <Link
              key={entity.id}
              href={`/entities/${entity.id}`}
              className="flex items-start gap-4 rounded-2xl border border-zinc-200 bg-white p-4 transition-colors hover:border-persian-blue/30 hover:bg-persian-blue/[0.02] sm:items-center"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-persian-blue/10 text-base font-semibold text-persian-blue">
                {initialFor(entity)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-900">
                    {entity.companyName ??
                      entity.companyDomain ??
                      entity.contactEmail ??
                      "No company"}
                  </span>
                  {entity.companyDomain && entity.companyName && (
                    <span className="text-xs text-zinc-400">{entity.companyDomain}</span>
                  )}
                  {hasNoCompany(entity) ? (
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">
                      no company
                    </span>
                  ) : (
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${RELATIONSHIP_STATE_BADGE_CLASSES[entity.relationshipState]}`}
                    >
                      {RELATIONSHIP_STATE_LABELS[entity.relationshipState]}
                    </span>
                  )}
                  {entity.isTargetAccount && <Flag label="Target" />}
                  {entity.hasOpenOpp && <Flag label="Open opp" />}
                  {entity.matchesIcp && <Flag label="ICP" />}
                </div>
                {entity.topReason && (
                  <p className="mt-1 truncate text-sm text-zinc-500">{entity.topReason}</p>
                )}
                {entity.originChannels.length > 0 && (
                  <p className="mt-0.5 text-xs text-zinc-400">
                    via {entity.originChannels.join(", ")}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="rounded-full bg-persian-blue/10 px-2.5 py-1 font-mono text-sm font-semibold text-persian-blue">
                  {entity.compositeScore.toFixed(1)}
                </span>
                <span className="text-xs text-zinc-400">
                  {formatRelativeTime(entity.lastSignalAt)}
                </span>
              </div>
            </Link>
          ))}
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
      className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
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
