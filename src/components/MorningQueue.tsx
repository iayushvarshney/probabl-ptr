"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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

// Logo providers to try, in order, before giving up to the initial letter.
// Clearbit looks best when it loads, but it's on common ad-blocker/
// tracking-protection blocklists (it's flagged as a company-enrichment/
// tracking domain) — when a browser or extension silently blocks it, the
// <img>'s error event frequently never fires at all, leaving it stuck
// showing the browser's native broken-image glyph forever instead of
// falling back. So onError alone isn't enough: a watchdog timeout in
// CompanyAvatar below also advances the cascade if a stage hasn't
// definitively loaded (or errored) within LOGO_STAGE_TIMEOUT_MS.
const LOGO_STAGE_TIMEOUT_MS = 2000;

function logoUrlFor(stage: "clearbit" | "favicon", domain: string): string {
  return stage === "clearbit"
    ? `https://logo.clearbit.com/${domain}`
    : `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/**
 * Company logo, fetched client-side by domain — Clearbit first (real brand
 * logos), Google's favicon endpoint second, the initial-letter
 * AvatarFallback last. The fallback renders immediately and unconditionally
 * underneath; the <img> is an absolutely-positioned overlay that paints
 * nothing until it loads, so it never blocks or delays the row — only ever
 * "fills in" on top of the letter, and only ever replaces it once a real
 * image has actually loaded.
 */
function CompanyAvatar({ entity }: { entity: QueueEntity }) {
  const domain = entity.companyDomain;
  const [stage, setStage] = useState<"clearbit" | "favicon" | "letter">(
    domain ? "clearbit" : "letter"
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearWatchdog() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  function advance() {
    clearWatchdog();
    setStage((s) => (s === "clearbit" ? "favicon" : "letter"));
  }

  useEffect(() => {
    if (stage === "letter") return;
    timeoutRef.current = setTimeout(advance, LOGO_STAGE_TIMEOUT_MS);
    return clearWatchdog;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advance/clearWatchdog are stable per render and don't need to be deps
  }, [stage]);

  return (
    <Avatar className="h-11 w-11 shrink-0">
      <AvatarFallback className="bg-persian-blue/10 text-base font-semibold text-persian-blue">
        {initialFor(entity)}
      </AvatarFallback>
      {domain && stage !== "letter" && (
        // Intentionally a plain <img>, not next/image: it must fetch
        // client-side, lazily and in parallel, without going through
        // Next's image optimizer/proxy or any server round-trip. `key`
        // forces a clean remount when the stage (and so the src) changes,
        // rather than reusing an <img> element that's already in an
        // errored/stuck state.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={stage}
          src={logoUrlFor(stage, domain)}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={clearWatchdog}
          onError={advance}
          className="absolute inset-0 h-full w-full rounded-full bg-white object-cover"
        />
      )}
    </Avatar>
  );
}

const ALL_COUNTRIES = "ALL";

export function MorningQueue({ entities }: { entities: QueueEntity[] }) {
  const [stateFilter, setStateFilter] = useState<StateFilter>("ALL");
  const [countryFilter, setCountryFilter] = useState(ALL_COUNTRIES);
  const [search, setSearch] = useState("");

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const e of entities) {
      if (e.companyCountry) set.add(e.companyCountry);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [entities]);

  const counts = useMemo(() => {
    const byState: Record<RelationshipState, number> = {
      NEW_CONTACT_KNOWN_COMPANY: 0,
      KNOWN_CONTACT_KNOWN_COMPANY: 0,
      NET_NEW_CONTACT_NET_NEW_COMPANY: 0,
    };
    let noCompany = 0;
    let customer = 0;
    for (const e of entities) {
      // Customer and "No company" are each their own bucket — a company
      // tagged Customer shows only under "All" or "Customer", never also
      // under a relationship-state tab (New contact/Known contact/Net new),
      // same as "No company" is excluded from those. Otherwise a customer
      // would double-count across two tabs.
      if (isCustomer(e)) {
        customer += 1;
      } else if (hasNoCompany(e)) {
        noCompany += 1;
      } else {
        byState[e.relationshipState] += 1;
      }
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
        if (hasNoCompany(e) || isCustomer(e) || e.relationshipState !== stateFilter) return false;
      }
      if (countryFilter !== ALL_COUNTRIES && e.companyCountry !== countryFilter) return false;
      if (query) {
        const haystack = `${e.companyName ?? ""} ${e.companyDomain ?? ""} ${e.contactEmail ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [entities, stateFilter, countryFilter, search]);

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

        <div className="flex items-center gap-2">
          {countries.length > 0 && (
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="h-9 rounded-full border border-zinc-200 bg-white px-3.5 text-xs font-medium text-zinc-600 outline-none focus-visible:border-persian-blue focus-visible:ring-2 focus-visible:ring-persian-blue/20"
            >
              <option value={ALL_COUNTRIES}>All countries</option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          )}

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
                <CompanyAvatar entity={entity} />

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
