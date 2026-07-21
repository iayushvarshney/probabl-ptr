"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Field, Section } from "@/components/ui";
import { CheckIcon, PlusCircleIcon, SparkleIcon, TrashIcon, XIcon } from "@/components/icons";
import { formatRelativeTime } from "@/lib/format";
import type { EntityDetail } from "@/lib/entity-detail";
import type { HubSpotOwner, HubSpotTaskPriority, HubSpotTaskType } from "@/lib/hubspot";
import {
  RELATIONSHIP_STATE_BADGE_CLASSES,
  RELATIONSHIP_STATE_LABELS,
} from "@/lib/relationship-state";

function defaultTaskTitle(detail: EntityDetail): string {
  const company = detail.company.name ?? detail.company.domain ?? "this account";
  return detail.topReason ? `${company}: ${detail.topReason}` : `Follow up with ${company}`;
}

function defaultNotes(detail: EntityDetail): string {
  if (detail.claudeSummary) return detail.claudeSummary;
  const label = RELATIONSHIP_STATE_LABELS[detail.relationshipState];
  return detail.topReason
    ? `${detail.topReason}. Classified as ${label}.`
    : `Classified as ${label}.`;
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

export function EntityDetailView({ detail: initialDetail }: { detail: EntityDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [taskTitle, setTaskTitle] = useState(() => defaultTaskTitle(initialDetail));
  const [taskType, setTaskType] = useState<HubSpotTaskType>("TODO");
  const [priority, setPriority] = useState<HubSpotTaskPriority | "">("");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState(() => defaultNotes(initialDetail));

  const [owners, setOwners] = useState<HubSpotOwner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(true);
  const [ownersError, setOwnersError] = useState<string | null>(null);

  const [isPushing, setIsPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushTaskUrl, setPushTaskUrl] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Fill in "now"-dependent defaults only after mount, so server- and
  // client-rendered HTML match on first paint (avoids a hydration mismatch).
  useEffect(() => {
    setDueDate(defaultDueDateThreeBusinessDays());
  }, []);

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

  async function handlePush() {
    setIsPushing(true);
    setPushError(null);
    try {
      const res = await fetch(`/api/entities/${detail.id}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      setPushTaskUrl(json.taskUrl ?? null);
      setDetail((prev) => ({
        ...prev,
        status: "pushed",
        push: {
          hubspotTaskId: json.push.hubspot_task_id,
          taskSubject: json.push.task_subject,
          taskBody: json.push.task_body,
          assignee: json.push.assignee,
          dueDate: json.push.due_date,
          pushedAt: json.push.pushed_at,
        },
      }));
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setIsPushing(false);
    }
  }

  async function handleDraftOutreach() {
    setIsDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch(`/api/entities/${detail.id}/draft-outreach`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Draft failed");
      setTaskTitle(json.draft.subject);
      setNotes(json.draft.body);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setIsDrafting(false);
    }
  }

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
        <p className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
          {detail.topReason}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="HubSpot context">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-zinc-400">Company</dt>
            <dd className="text-zinc-700">
              {detail.company.hubspotCompanyId ? (
                <span className="font-mono text-xs">{detail.company.hubspotCompanyId}</span>
              ) : (
                <span className="text-zinc-400">not in HubSpot</span>
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
          {detail.signals.map((signal) => (
            <div key={signal.id} className="py-2.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-zinc-800">
                    {signal.signalType.replace(/_/g, " ")}
                  </span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">
                    {signal.originChannel}
                  </span>
                  <span className="text-[11px] uppercase text-zinc-400">{signal.source}</span>
                  {signal.campaign && (
                    <span className="text-xs text-zinc-400">· {signal.campaign}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {formatRelativeTime(signal.occurredAt)}
                </span>
              </div>
              {signal.signalSummary ? (
                <p className="mt-1.5 text-sm text-zinc-600">{signal.signalSummary}</p>
              ) : (
                <p className="mt-1.5 text-xs text-zinc-400">No summary yet.</p>
              )}
              <details className="group mt-1.5">
                <summary className="cursor-pointer list-none text-xs text-zinc-400 hover:text-zinc-600">
                  Raw payload
                </summary>
                <pre className="mt-2 overflow-x-auto rounded bg-zinc-50 p-3 text-xs text-zinc-600">
                  {JSON.stringify(signal.rawPayload, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      </Section>

      {detail.status === "pushed" && detail.push && (
        <Section title="Pushed to HubSpot">
          <p className="text-sm text-zinc-600">
            Task{" "}
            {pushTaskUrl ? (
              <a
                href={pushTaskUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-persian-blue hover:underline"
              >
                {detail.push.hubspotTaskId}
              </a>
            ) : (
              <span className="font-mono text-xs">{detail.push.hubspotTaskId}</span>
            )}{" "}
            created {formatRelativeTime(detail.push.pushedAt)} — &ldquo;{detail.push.taskSubject}
            &rdquo;
          </p>
        </Section>
      )}

      {detail.status === "dismissed" && (
        <Section title="Dismissed">
          <p className="text-sm text-zinc-400">This entity has been dismissed from the queue.</p>
        </Section>
      )}

      {detail.status === "pending" && (
        <Section title="Create Task in HubSpot">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Task details</span>
              <button
                type="button"
                onClick={handleDraftOutreach}
                disabled={isDrafting}
                className="flex items-center gap-1.5 rounded-full border border-persian-blue/30 px-3 py-1 text-xs font-medium text-persian-blue hover:bg-persian-blue/5 disabled:opacity-50"
              >
                <SparkleIcon className="h-3.5 w-3.5" />
                {isDrafting ? "Drafting…" : "Draft outreach with Claude"}
              </button>
            </div>
            {draftError && <p className="text-sm text-red-600">{draftError}</p>}

            <Field label="Task Title">
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none"
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
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-persian-blue focus:outline-none"
              />
            </Field>

            {pushError && <p className="text-sm text-red-600">{pushError}</p>}

            <div className="mt-1 flex gap-3">
              <button
                type="button"
                onClick={handlePush}
                disabled={isPushing || !taskTitle || !ownerId}
                className="flex items-center gap-1.5 rounded-full bg-sea-buckthorn px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <PlusCircleIcon className="h-4 w-4" />
                {isPushing ? "Creating…" : "Create Task in HubSpot"}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                disabled={isPushing}
                className="flex items-center gap-1.5 rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
                Delete from Queue
              </button>
            </div>
          </div>
        </Section>
      )}

      {isConfirmingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
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
