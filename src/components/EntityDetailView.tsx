"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Field, Section } from "@/components/ui";
import { CheckIcon, PlusCircleIcon, SparkleIcon, TrashIcon, XIcon } from "@/components/icons";
import { formatRelativeTime } from "@/lib/format";
import type { EntityDetail, EntityDetailContact } from "@/lib/entity-detail";
import type { HubSpotOwner, HubSpotTaskPriority, HubSpotTaskType } from "@/lib/hubspot";
import {
  RELATIONSHIP_STATE_BADGE_CLASSES,
  RELATIONSHIP_STATE_LABELS,
} from "@/lib/relationship-state";

function defaultTaskTitle(detail: EntityDetail, contact: EntityDetailContact): string {
  const company = detail.company.name ?? detail.company.domain ?? "this account";
  const name = contactLabel(contact);
  return detail.topReason
    ? `${name} at ${company}: ${detail.topReason}`
    : `Follow up with ${name} at ${company}`;
}

function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return result;
}

function defaultDueDateThreeBusinessDays(): string {
  return addBusinessDays(new Date(), 3).toISOString().slice(0, 10);
}

function contactLabel(contact: { fullName: string | null; email: string | null }): string {
  return contact.fullName ?? contact.email ?? "Unknown contact";
}

function ownerLabel(owner: HubSpotOwner): string {
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ");
  return name || owner.email || owner.id;
}

function sortByOutreachRank(contacts: EntityDetailContact[]): EntityDetailContact[] {
  return [...contacts].sort((a, b) => {
    const rankA = a.outreachRank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.outreachRank ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
}

// Only the 3 most recent signals render inline on load — the rest are one
// click away via "View all", rather than every signal's row (and, once
// opened, its raw payload) being part of the initial page render.
const SIGNALS_PREVIEW_COUNT = 3;

function SignalRow({
  signal,
  onClick,
}: {
  signal: EntityDetail["signals"][number];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-zinc-50"
    >
      <span className="flex items-center gap-2">
        <span className="font-medium text-zinc-800">
          {signal.signalType.replace(/_/g, " ")}
        </span>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">
          {signal.originChannel}
        </span>
        <span className="text-[11px] uppercase text-zinc-400">{signal.source}</span>
        {signal.campaign && <span className="text-xs text-zinc-400">· {signal.campaign}</span>}
        {signal.signalSummary && <SparkleIcon className="h-3.5 w-3.5 text-persian-blue/50" />}
      </span>
      <span className="shrink-0 text-xs text-zinc-400">
        {formatRelativeTime(signal.occurredAt)}
      </span>
    </button>
  );
}

export function EntityDetailView({ detail: initialDetail }: { detail: EntityDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);

  const [owners, setOwners] = useState<HubSpotOwner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(true);
  const [ownersError, setOwnersError] = useState<string | null>(null);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [activeSignalId, setActiveSignalId] = useState<string | null>(null);
  const [loadingSignalId, setLoadingSignalId] = useState<string | null>(null);
  const [signalSummaryError, setSignalSummaryError] = useState<string | null>(null);
  const [isViewingAllSignals, setIsViewingAllSignals] = useState(false);

  // Per-contact task modal state — reset each time a different contact is
  // opened (see openContactModal).
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState<HubSpotTaskType>("TODO");
  const [priority, setPriority] = useState<HubSpotTaskPriority | "">("");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushedTaskUrl, setPushedTaskUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOwnersLoading(true);
    fetch("/api/hubspot/owners")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.owners) setOwners(json.owners);
        else setOwnersError(json.error ?? "Failed to load owners");
      })
      .catch((err) => {
        if (!cancelled) setOwnersError(err instanceof Error ? err.message : "Failed to load owners");
      })
      .finally(() => {
        if (!cancelled) setOwnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Default "Assigned to" to the company's current HubSpot owner, once we
  // know both who that is and that they're in the fetched owners list.
  useEffect(() => {
    if (ownerId) return;
    if (detail.defaultOwnerId && owners.some((o) => o.id === detail.defaultOwnerId)) {
      setOwnerId(detail.defaultOwnerId);
    }
  }, [owners, detail.defaultOwnerId, ownerId]);

  const companyTitle = detail.company.name ?? detail.company.domain ?? "Unknown company";
  const activeContact = detail.contacts.find((c) => c.id === activeContactId) ?? null;
  const activePush = activeContact
    ? detail.pushes.find((p) => p.contactId === activeContact.id) ?? null
    : null;

  function openContactModal(contact: EntityDetailContact) {
    setActiveContactId(contact.id);
    setPushError(null);
    setPushedTaskUrl(null);
    setDraftError(null);
    setTaskTitle(defaultTaskTitle(detail, contact));
    setTaskType("TODO");
    setPriority("");
    setOwnerId(
      detail.defaultOwnerId && owners.some((o) => o.id === detail.defaultOwnerId)
        ? detail.defaultOwnerId
        : ""
    );
    setDueDate(defaultDueDateThreeBusinessDays());
    setNotes(contact.outreachReason ?? "");

    const existingPush = detail.pushes.find((p) => p.contactId === contact.id);
    if (existingPush) return; // already pushed — modal shows the push info, no draft needed

    setIsDrafting(true);
    fetch(`/api/entities/${detail.id}/draft-outreach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: contact.id }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to draft outreach");
        setTaskTitle(json.draft.subject);
        setNotes(json.draft.body);
      })
      .catch((err) => {
        setDraftError(err instanceof Error ? err.message : "Failed to draft outreach");
      })
      .finally(() => setIsDrafting(false));
  }

  async function handlePush() {
    if (!activeContact) return;
    setIsPushing(true);
    setPushError(null);
    try {
      const res = await fetch(`/api/entities/${detail.id}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: activeContact.id,
          subject: taskTitle,
          body: notes,
          dueDate,
          taskType,
          priority: priority || undefined,
          ownerId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Push failed");
      setPushedTaskUrl(json.taskUrl ?? null);
      setDetail((prev) => ({
        ...prev,
        status: "pushed",
        pushes: [
          ...prev.pushes.filter((p) => p.contactId !== activeContact.id),
          {
            contactId: activeContact.id,
            hubspotTaskId: json.push.hubspot_task_id,
            taskSubject: json.push.task_subject,
            taskBody: json.push.task_body,
            assignee: json.push.assignee,
            dueDate: json.push.due_date,
            pushedAt: json.push.pushed_at,
          },
        ],
      }));
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setIsPushing(false);
    }
  }

  function openSignalModal(signal: EntityDetail["signals"][number]) {
    setIsViewingAllSignals(false); // drill down from "view all", don't stack modals
    setActiveSignalId(signal.id);
    setSignalSummaryError(null);
    if (signal.signalSummary || loadingSignalId === signal.id) return;

    setLoadingSignalId(signal.id);
    fetch(`/api/signals/${signal.id}/summarize`, { method: "POST" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to summarize signal");
        setDetail((prev) => ({
          ...prev,
          signals: prev.signals.map((s) =>
            s.id === signal.id ? { ...s, signalSummary: json.summary } : s
          ),
        }));
      })
      .catch((err) => {
        setSignalSummaryError(err instanceof Error ? err.message : "Failed to summarize signal");
      })
      .finally(() => setLoadingSignalId(null));
  }

  const activeSignal = detail.signals.find((s) => s.id === activeSignalId) ?? null;

  async function handleDeleteConfirmed() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/entities/${detail.id}/delete`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      router.push("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
      setIsDeleting(false);
    }
  }

  const sortedContacts = sortByOutreachRank(detail.contacts);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="text-sm text-persian-blue hover:underline">
          ← Morning Queue
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{companyTitle}</h1>
          {detail.company.domain && detail.company.name && (
            <p className="text-sm text-zinc-400">{detail.company.domain}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${RELATIONSHIP_STATE_BADGE_CLASSES[detail.relationshipState]}`}
            >
              {RELATIONSHIP_STATE_LABELS[detail.relationshipState]}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
              {detail.status}
            </span>
            {detail.company.isTargetAccount && <Flag label="Target" />}
            {detail.company.hasOpenOpp && <Flag label="Open opp" />}
            {detail.company.matchesIcp && <Flag label="ICP" />}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-semibold text-zinc-900">
            {detail.compositeScore.toFixed(1)}
          </div>
          <div className="text-xs text-zinc-400">
            last signal {formatRelativeTime(detail.lastSignalAt)}
          </div>
        </div>
      </header>

      {detail.topReason && (
        <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
          {detail.topReason}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="HubSpot context">
          <div className="flex flex-col gap-3">
            {detail.company.aboutBlurb && (
              <p className="text-sm text-zinc-600">{detail.company.aboutBlurb}</p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-zinc-400">Company</dt>
              <dd className="text-zinc-700">
                {detail.company.hubspotCompanyId ? (
                  <span className="flex items-center gap-2">
                    <span>{detail.company.name ?? detail.company.domain}</span>
                    <span className="font-mono text-xs text-zinc-400">
                      {detail.company.hubspotCompanyId}
                    </span>
                  </span>
                ) : (
                  <span className="text-zinc-400">not in HubSpot</span>
                )}
              </dd>

              <dt className="text-zinc-400">Website</dt>
              <dd className="text-zinc-700">
                {detail.company.website ? (
                  <a
                    href={detail.company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-persian-blue hover:underline"
                  >
                    {detail.company.domain ?? detail.company.website}
                  </a>
                ) : (
                  <span className="text-zinc-400">unknown</span>
                )}
              </dd>

              <dt className="text-zinc-400">Industry</dt>
              <dd className="text-zinc-700">
                {detail.company.industry ?? <span className="text-zinc-400">unknown</span>}
              </dd>

              <dt className="text-zinc-400">Lifecycle stage</dt>
              <dd className="text-zinc-700">
                {detail.company.lifecycleStage ?? (
                  <span className="text-zinc-400">not in HubSpot</span>
                )}
              </dd>

              {detail.company.dealStage && (
                <>
                  <dt className="text-zinc-400">Deal stage</dt>
                  <dd className="text-zinc-700">{detail.company.dealStage}</dd>
                </>
              )}

              <dt className="text-zinc-400">Last activity</dt>
              <dd className="text-zinc-700">
                {detail.company.lastActivityDate ? (
                  formatRelativeTime(detail.company.lastActivityDate)
                ) : (
                  <span className="text-zinc-400">unknown</span>
                )}
              </dd>

              <dt className="text-zinc-400">Contacts</dt>
              <dd className="text-zinc-700">
                {detail.contacts.length === 0 ? (
                  <span className="text-zinc-400">none yet</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {detail.contacts.map((c) => (
                      <li key={c.id} className="flex items-center gap-2">
                        <span>{contactLabel(c)}</span>
                        {c.hubspotContactId ? (
                          <span className="font-mono text-xs text-zinc-400">
                            {c.hubspotContactId}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">not in HubSpot</span>
                        )}
                        {c.id === detail.primaryContactId && (
                          <span className="rounded bg-persian-blue/5 px-1.5 py-0.5 text-[11px] font-medium text-persian-blue">
                            primary
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </dl>
          </div>
        </Section>

        <Section title="Claude summary">
          {detail.claudeSummary ? (
            <p className="text-sm text-zinc-700">{detail.claudeSummary}</p>
          ) : (
            <p className="text-sm text-zinc-400">No summary yet.</p>
          )}
        </Section>
      </div>

      <Section title={`Signals (${detail.signals.length})`}>
        <div className="flex flex-col divide-y divide-zinc-100">
          {detail.signals.slice(0, SIGNALS_PREVIEW_COUNT).map((signal) => (
            <SignalRow key={signal.id} signal={signal} onClick={() => openSignalModal(signal)} />
          ))}
        </div>
        {detail.signals.length > SIGNALS_PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setIsViewingAllSignals(true)}
            className="mt-2 w-full rounded-lg border border-zinc-200 py-2 text-center text-sm font-medium text-persian-blue hover:bg-persian-blue/5"
          >
            View all {detail.signals.length} signals
          </button>
        )}
      </Section>

      {detail.status !== "dismissed" && (
        <Section title="Who to reach out to">
          {sortedContacts.length === 0 ? (
            <p className="text-sm text-zinc-400">No known contacts yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {sortedContacts.map((contact) => {
                const pushed = detail.pushes.some((p) => p.contactId === contact.id);
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => openContactModal(contact)}
                    className="flex w-full flex-col items-start gap-1 py-3 text-left hover:bg-zinc-50"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800">
                        {contactLabel(contact)}
                      </span>
                      {contact.hubspotContactId ? (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">
                          in HubSpot
                        </span>
                      ) : (
                        <span className="rounded bg-persian-blue/5 px-1.5 py-0.5 text-[11px] font-medium text-persian-blue">
                          net-new
                        </span>
                      )}
                      {pushed && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          <CheckIcon className="h-3 w-3" />
                          Task created
                        </span>
                      )}
                    </div>
                    {contact.outreachReason ? (
                      <p className="text-sm text-zinc-600">{contact.outreachReason}</p>
                    ) : (
                      <p className="text-xs text-zinc-400">No recommendation yet.</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {detail.pushes.length > 0 && (
        <Section title={`Pushed to HubSpot (${detail.pushes.length})`}>
          <ul className="flex flex-col gap-2 text-sm text-zinc-600">
            {detail.pushes.map((push) => {
              const contact = detail.contacts.find((c) => c.id === push.contactId);
              return (
                <li key={push.hubspotTaskId ?? push.pushedAt}>
                  <span className="font-medium text-zinc-800">
                    {contact ? contactLabel(contact) : "Unknown contact"}
                  </span>{" "}
                  — task{" "}
                  {pushedTaskUrl && activeContact?.id === push.contactId ? (
                    <a
                      href={pushedTaskUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-persian-blue hover:underline"
                    >
                      {push.hubspotTaskId}
                    </a>
                  ) : (
                    <span className="font-mono text-xs">{push.hubspotTaskId}</span>
                  )}{" "}
                  created {formatRelativeTime(push.pushedAt)} — &ldquo;{push.taskSubject}&rdquo;
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {detail.status === "dismissed" && (
        <Section title="Dismissed">
          <p className="text-sm text-zinc-400">This entity has been dismissed from the queue.</p>
        </Section>
      )}

      {detail.status !== "dismissed" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsConfirmingDelete(true)}
            className="flex items-center gap-1.5 rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <TrashIcon className="h-4 w-4" />
            Delete from Queue
          </button>
        </div>
      )}

      {isConfirmingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-base font-semibold text-zinc-900">Delete from Queue</h2>
            <p className="mb-5 text-sm text-zinc-600">
              Are you sure you want to delete the company from the Queue?
            </p>
            {deleteError && <p className="mb-3 text-sm text-red-600">{deleteError}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isDeleting}
                className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                <XIcon className="h-4 w-4" />
                No
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={isDeleting}
                className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <CheckIcon className="h-4 w-4" />
                {isDeleting ? "Deleting…" : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isViewingAllSignals && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
          onClick={() => setIsViewingAllSignals(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-zinc-900">
                All signals ({detail.signals.length})
              </h2>
              <button
                type="button"
                onClick={() => setIsViewingAllSignals(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col divide-y divide-zinc-100">
                {detail.signals.map((signal) => (
                  <SignalRow key={signal.id} signal={signal} onClick={() => openSignalModal(signal)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSignal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setActiveSignalId(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  {activeSignal.signalType.replace(/_/g, " ")}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {activeSignal.originChannel} · {activeSignal.source.toUpperCase()}
                  {activeSignal.campaign && ` · ${activeSignal.campaign}`} ·{" "}
                  {formatRelativeTime(activeSignal.occurredAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSignalId(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex items-start gap-2 rounded-xl bg-zinc-50 p-3">
              <SparkleIcon className="mt-0.5 h-4 w-4 shrink-0 text-persian-blue" />
              {loadingSignalId === activeSignal.id ? (
                <p className="text-sm text-zinc-400">Summarizing…</p>
              ) : activeSignal.signalSummary ? (
                <p className="text-sm text-zinc-700">{activeSignal.signalSummary}</p>
              ) : signalSummaryError ? (
                <p className="text-sm text-red-600">{signalSummaryError}</p>
              ) : (
                <p className="text-sm text-zinc-400">No summary yet.</p>
              )}
            </div>

            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-zinc-400 hover:text-zinc-600">
                Raw payload
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-zinc-50 p-3 text-xs text-zinc-600">
                {JSON.stringify(activeSignal.rawPayload, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}

      {activeContact && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8"
          onClick={() => setActiveContactId(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  {contactLabel(activeContact)}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {activeContact.email ?? "no email"} ·{" "}
                  {activeContact.hubspotContactId ? "in HubSpot" : "not yet in HubSpot"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveContactId(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            {activeContact.outreachReason && (
              <div className="mb-4 flex items-start gap-2 rounded-xl bg-zinc-50 p-3">
                <SparkleIcon className="mt-0.5 h-4 w-4 shrink-0 text-persian-blue" />
                <p className="text-sm text-zinc-700">{activeContact.outreachReason}</p>
              </div>
            )}

            {activePush ? (
              <div className="rounded-xl border border-zinc-200 p-3">
                <p className="text-sm text-zinc-600">
                  Task{" "}
                  {pushedTaskUrl ? (
                    <a
                      href={pushedTaskUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-persian-blue hover:underline"
                    >
                      {activePush.hubspotTaskId}
                    </a>
                  ) : (
                    <span className="font-mono text-xs">{activePush.hubspotTaskId}</span>
                  )}{" "}
                  created {formatRelativeTime(activePush.pushedAt)} — &ldquo;
                  {activePush.taskSubject}&rdquo;
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {draftError && <p className="text-sm text-red-600">{draftError}</p>}

                <Field label="Task Title">
                  <input
                    type="text"
                    value={taskTitle}
                    disabled={isDrafting}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none disabled:opacity-50"
                  />
                </Field>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Task Type">
                    <select
                      value={taskType}
                      onChange={(e) => setTaskType(e.target.value as HubSpotTaskType)}
                      className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none"
                    >
                      <option value="TODO">To-Do</option>
                      <option value="CALL">Call</option>
                      <option value="EMAIL">Email</option>
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as HubSpotTaskPriority | "")}
                      className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none"
                    >
                      <option value="">None</option>
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </Field>
                  <Field label="Assigned to">
                    <select
                      value={ownerId}
                      onChange={(e) => setOwnerId(e.target.value)}
                      disabled={ownersLoading}
                      className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none disabled:opacity-50"
                    >
                      <option value="">{ownersLoading ? "Loading…" : "Select an owner"}</option>
                      {owners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {ownerLabel(owner)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {ownersError && (
                  <p className="text-sm text-red-600">Couldn&rsquo;t load owners: {ownersError}</p>
                )}

                <Field label="Due date">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none sm:w-48"
                  />
                </Field>

                <Field label="Notes">
                  <textarea
                    value={isDrafting ? "Drafting…" : notes}
                    disabled={isDrafting}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                    className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none disabled:opacity-50"
                  />
                </Field>

                {pushError && <p className="text-sm text-red-600">{pushError}</p>}

                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={handlePush}
                    disabled={isPushing || isDrafting || !taskTitle || !ownerId}
                    className="flex items-center gap-1.5 rounded-full bg-sea-buckthorn px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <PlusCircleIcon className="h-4 w-4" />
                    {isPushing ? "Creating…" : "Create Task in HubSpot"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Flag({ label }: { label: string }) {
  return (
    <span className="rounded border border-persian-blue/30 bg-persian-blue/5 px-1.5 py-0.5 text-[11px] font-medium text-persian-blue">
      {label}
    </span>
  );
}
