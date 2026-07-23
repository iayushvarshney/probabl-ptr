"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/format";
import type { QueueEntity } from "@/lib/queue";
import {
  CUSTOMER_BADGE_CLASSES,
  NO_COMPANY_BADGE_CLASSES,
  RELATIONSHIP_STATE_BADGE_CLASSES,
  RELATIONSHIP_STATE_LABELS,
  RELATIONSHIP_STATE_ORDER,
} from "@/lib/relationship-state";
import type { RelationshipState } from "@/lib/types";
import { cn } from "@/lib/utils";

type StateFilter = "ALL" | RelationshipState | "NO_COMPANY" | "CUSTOMER";

function hasNoCompany(entity: QueueEntity): boolean {
  return !entity.companyName && !entity.companyDomain;
}

function isCustomer(entity: QueueEntity): boolean {
  return entity.isCustomer;
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
    let customer = 0;
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
      // Customer is a cross-cutting lifecycle-stage flag, not a
      // relationship state — a customer can also be "Known contact", so
      // this count is independent, not subtracted from byState.
      if (isCustomer(e)) customer += 1;
    }
    return { byState, noCompany, customer };
  }, [entities]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entities.filter((e) => {
      if (stateFilter === "NO_COMPANY") {
        if (!hasNoCompany(e)) return false;
      } else if (stateFilter === "CUSTOMER") {
        if (!isCustomer(e)) return false;
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
          {counts.customer > 0 && (
            <FilterButton active={stateFilter === "CUSTOMER"} onClick={() => setStateFilter("CUSTOMER")}>
              Customer ({counts.customer})
            </FilterButton>
          )}
          {counts.noCompany > 0 && (
            <FilterButton
              active={stateFilter === "NO_COMPANY"}
              onClick={() => setStateFilter("NO_COMPANY")}
            >
              No company ({counts.noCompany})
            </FilterButton>
          )}
        </div>

        <div className="relative w-56">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies…"
            className="h-9 rounded-full border-zinc-200 pl-9 focus-visible:border-persian-blue focus-visible:ring-persian-blue/20"
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
            <Link key={entity.id} href={`/entities/${entity.id}`} className="block">
              <Card className="flex-row items-start gap-4 rounded-2xl border border-zinc-200 p-4 shadow-none ring-0 transition-colors hover:border-persian-blue/30 hover:bg-persian-blue/[0.02] sm:items-center">
                <Avatar className="h-11 w-11 shrink-0">
                  <AvatarFallback className="bg-persian-blue/10 text-base font-semibold text-persian-blue">
                    {initialFor(entity)}
                  </AvatarFallback>
                </Avatar>

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
                      <Badge className={cn("rounded-full font-medium", NO_COMPANY_BADGE_CLASSES)}>
                        no company
                      </Badge>
                    ) : (
                      <Badge
                        className={cn(
                          "rounded-full font-medium",
                          RELATIONSHIP_STATE_BADGE_CLASSES[entity.relationshipState]
                        )}
                      >
                        {RELATIONSHIP_STATE_LABELS[entity.relationshipState]}
                      </Badge>
                    )}
                    {isCustomer(entity) && (
                      <Badge className={cn("rounded-full font-medium", CUSTOMER_BADGE_CLASSES)}>
                        Customer
                      </Badge>
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
                  <Badge className="rounded-full bg-persian-blue/10 px-2.5 py-1 font-mono text-sm font-semibold text-persian-blue">
                    {entity.compositeScore.toFixed(1)}
                  </Badge>
                  <span className="text-xs text-zinc-400">
                    {formatRelativeTime(entity.lastSignalAt)}
                  </span>
                </div>
              </Card>
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
    <Button
      type="button"
      onClick={onClick}
      className={cn(
        "h-auto rounded-full px-3.5 py-2 text-xs font-medium",
        active
          ? "bg-persian-blue text-white hover:bg-persian-blue/90"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      )}
    >
      {children}
    </Button>
  );
}

function Flag({ label }: { label: string }) {
  return (
    <Badge className="rounded border border-persian-blue/30 bg-persian-blue/5 font-medium text-persian-blue">
      {label}
    </Badge>
  );
}
