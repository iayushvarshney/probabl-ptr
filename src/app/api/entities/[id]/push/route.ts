import { NextResponse } from "next/server";
import { isMissingColumnError } from "@/lib/db-errors";
import { getEntityDetail } from "@/lib/entity-detail";
import {
  associateTaskWith,
  createTask,
  findOpenDealId,
  getAssociationTypeId,
  type HubSpotTaskPriority,
  type HubSpotTaskType,
} from "@/lib/hubspot";
import { supabase } from "@/lib/supabase";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as {
    contactId?: string;
    subject?: string;
    body?: string;
    dueDate?: string;
    taskType?: HubSpotTaskType;
    priority?: HubSpotTaskPriority;
    ownerId?: string;
  };

  if (!body.contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }
  if (!body.subject) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }
  if (!body.taskType) {
    return NextResponse.json({ error: "taskType is required" }, { status: 400 });
  }
  if (!body.ownerId) {
    return NextResponse.json({ error: "ownerId is required" }, { status: 400 });
  }

  const detail = await getEntityDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "entity not found" }, { status: 404 });
  }

  const targetContact = detail.contacts.find((c) => c.id === body.contactId);
  if (!targetContact) {
    return NextResponse.json({ error: "contact not found" }, { status: 404 });
  }

  // Idempotent per (entity, contact): pushing a task for one contact never
  // blocks pushing a different contact at the same company later — but
  // re-pushing the SAME contact just returns the existing task.
  const existingPush = detail.pushes.find((p) => p.contactId === targetContact.id);
  if (existingPush) {
    return NextResponse.json({ ok: true, alreadyPushed: true, push: existingPush });
  }

  const task = await createTask({
    subject: body.subject,
    body: body.body,
    dueDate: body.dueDate,
    taskType: body.taskType,
    priority: body.priority,
    ownerId: body.ownerId,
  });

  // Associations are automatic — we already know the contact/company from
  // the signal, so the admin never has to pick records manually.
  if (detail.company.hubspotCompanyId) {
    const associationType = await getAssociationTypeId("tasks", "companies");
    await associateTaskWith(task.id, "companies", detail.company.hubspotCompanyId, associationType);

    const openDealId = await findOpenDealId(detail.company.hubspotCompanyId);
    if (openDealId) {
      const dealAssociationType = await getAssociationTypeId("tasks", "deals");
      await associateTaskWith(task.id, "deals", openDealId, dealAssociationType);
    }
  }

  if (targetContact.hubspotContactId) {
    const associationType = await getAssociationTypeId("tasks", "contacts");
    await associateTaskWith(task.id, "contacts", targetContact.hubspotContactId, associationType);
  }

  let { data: pushRow, error: pushError } = await supabase
    .from("pushes")
    .insert({
      entity_id: id,
      contact_id: targetContact.id,
      hubspot_task_id: task.id,
      task_subject: body.subject,
      task_body: body.body ?? null,
      assignee: body.ownerId,
      due_date: body.dueDate || null,
    })
    .select()
    .single();
  if (pushError && isMissingColumnError(pushError)) {
    console.warn(
      "[push] contact_id column not found on pushes — run the latest supabase-schema.sql migration; recording push without it"
    );
    ({ data: pushRow, error: pushError } = await supabase
      .from("pushes")
      .insert({
        entity_id: id,
        hubspot_task_id: task.id,
        task_subject: body.subject,
        task_body: body.body ?? null,
        assignee: body.ownerId,
        due_date: body.dueDate || null,
      })
      .select()
      .single());
  }
  if (pushError) throw pushError;

  await supabase.from("entities").update({ status: "pushed" }).eq("id", id);

  return NextResponse.json({
    ok: true,
    alreadyPushed: false,
    push: pushRow,
    taskUrl: task.url ?? null,
  });
}
