// Thin HubSpot REST wrapper. Private App token auth (NOT OAuth), against
// /crm/v3/... and /crm/v4/... .

const HUBSPOT_API_BASE = "https://api.hubapi.com";

export const USE_MOCK_HUBSPOT = process.env.USE_MOCK_HUBSPOT === "true";

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

if (!USE_MOCK_HUBSPOT && !token) {
  throw new Error(
    "Missing HUBSPOT_PRIVATE_APP_TOKEN env var (or set USE_MOCK_HUBSPOT=true)"
  );
}

async function hubspotRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${HUBSPOT_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot API error ${res.status} on ${path}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// --- Types --------------------------------------------------------------

export type HubSpotContact = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type HubSpotCompany = {
  id: string;
  name: string | null;
  domain: string | null;
  isTargetAccount: boolean;
};

export type HubSpotOwner = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

// --- Mock fixtures --------------------------------------------------------
// Only used when USE_MOCK_HUBSPOT=true, so the pipeline can be exercised
// without a live call. Simple keyword conventions on the domain let you
// trigger all three relationship states by hand:
//   - domain/email containing "known"  -> found in HubSpot
//   - domain also containing "target"  -> is_target_account = true
//   - domain also containing "deal"    -> has an open deal
// Anything else mocks as "not found" (net new).

function mockContactByEmail(email: string): HubSpotContact | null {
  // Check the local part only — the domain (checked separately by
  // mockCompanyByDomain) may itself contain "known", which shouldn't make
  // every contact at that domain look pre-existing.
  const localPart = email.split("@")[0] ?? "";
  if (!localPart.includes("known")) return null;
  return { id: "mock-contact-1", email, firstName: "Mock", lastName: "Contact" };
}

function mockCompanyByDomain(domain: string): HubSpotCompany | null {
  if (!domain.includes("known")) return null;
  return {
    id: `mock-company:${domain}`,
    name: domain.split(".")[0],
    domain,
    isTargetAccount: domain.includes("target"),
  };
}

function mockHasOpenDeal(companyId: string): boolean {
  return companyId.includes("deal");
}

function mockOwners(): HubSpotOwner[] {
  return [
    { id: "mock-owner-1", email: "owner1@probabl.ai", firstName: "Mock", lastName: "Owner One" },
    { id: "mock-owner-2", email: "owner2@probabl.ai", firstName: "Mock", lastName: "Owner Two" },
  ];
}

// --- Contacts -------------------------------------------------------------

export async function findContactByEmail(
  email: string
): Promise<HubSpotContact | null> {
  if (USE_MOCK_HUBSPOT) return mockContactByEmail(email);

  const result = await hubspotRequest<{
    results: Array<{
      id: string;
      properties: { email?: string; firstname?: string; lastname?: string };
    }>;
  }>("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
      ],
      properties: ["email", "firstname", "lastname"],
      limit: 1,
    }),
  });

  const hit = result.results[0];
  if (!hit) return null;

  return {
    id: hit.id,
    email: hit.properties.email ?? null,
    firstName: hit.properties.firstname ?? null,
    lastName: hit.properties.lastname ?? null,
  };
}

// --- Companies --------------------------------------------------------------

let cachedTargetAccountProperty: string | null = null;

/**
 * Confirms the internal name of the boolean target-account property on
 * Companies via the properties API and logs it once (per CLAUDE.md — never
 * guess the label). Cached in-process after the first successful lookup.
 * Override with HUBSPOT_TARGET_ACCOUNT_PROPERTY if the heuristic below ever
 * finds zero or multiple candidates.
 */
export async function getTargetAccountPropertyName(): Promise<string> {
  if (cachedTargetAccountProperty) return cachedTargetAccountProperty;

  if (USE_MOCK_HUBSPOT) {
    cachedTargetAccountProperty = "is_target_account";
    return cachedTargetAccountProperty;
  }

  const override = process.env.HUBSPOT_TARGET_ACCOUNT_PROPERTY;
  if (override) {
    cachedTargetAccountProperty = override;
    console.log(`[hubspot] target-account property (env override): ${override}`);
    return cachedTargetAccountProperty;
  }

  const result = await hubspotRequest<{
    results: Array<{ name: string; label: string; type: string }>;
  }>("/crm/v3/properties/companies");

  const candidates = result.results.filter(
    (p) =>
      p.type === "bool" &&
      (p.name.toLowerCase().includes("target") ||
        p.label.toLowerCase().includes("target"))
  );

  if (candidates.length !== 1) {
    throw new Error(
      `Could not confidently identify the target-account boolean property on ` +
        `Companies (found ${candidates.length} candidates: ` +
        `${candidates.map((c) => c.name).join(", ") || "none"}). ` +
        `Set HUBSPOT_TARGET_ACCOUNT_PROPERTY explicitly to resolve this.`
    );
  }

  cachedTargetAccountProperty = candidates[0].name;
  console.log(
    `[hubspot] target-account property confirmed: ${cachedTargetAccountProperty}`
  );
  return cachedTargetAccountProperty;
}

export async function findCompanyByDomain(
  domain: string
): Promise<HubSpotCompany | null> {
  if (USE_MOCK_HUBSPOT) return mockCompanyByDomain(domain);

  const targetAccountProperty = await getTargetAccountPropertyName();

  const result = await hubspotRequest<{
    results: Array<{ id: string; properties: Record<string, string | null> }>;
  }>("/crm/v3/objects/companies/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: "domain", operator: "EQ", value: domain }] },
      ],
      properties: ["name", "domain", targetAccountProperty],
      limit: 1,
    }),
  });

  const hit = result.results[0];
  if (!hit) return null;

  return {
    id: hit.id,
    name: hit.properties.name ?? null,
    domain: hit.properties.domain ?? null,
    isTargetAccount: hit.properties[targetAccountProperty] === "true",
  };
}

async function getOpenDealIds(companyId: string): Promise<string[]> {
  const associations = await hubspotRequest<{ results: Array<{ id: string }> }>(
    `/crm/v3/objects/companies/${companyId}/associations/deals`
  );

  const dealIds = associations.results.map((r) => r.id);
  if (dealIds.length === 0) return [];

  // hs_is_closed is HubSpot's built-in computed property covering both
  // closed-won and closed-lost, so we don't need pipeline stage metadata.
  const deals = await hubspotRequest<{
    results: Array<{ id: string; properties: { hs_is_closed?: string } }>;
  }>("/crm/v3/objects/deals/batch/read", {
    method: "POST",
    body: JSON.stringify({
      properties: ["hs_is_closed"],
      inputs: dealIds.map((id) => ({ id })),
    }),
  });

  return deals.results
    .filter((deal) => deal.properties.hs_is_closed !== "true")
    .map((deal) => deal.id);
}

export async function hasOpenDeal(companyId: string): Promise<boolean> {
  if (USE_MOCK_HUBSPOT) return mockHasOpenDeal(companyId);
  const openDealIds = await getOpenDealIds(companyId);
  return openDealIds.length > 0;
}

/** First open deal ID associated with the company, if any — used to
 * associate a pushed task to a deal when one exists. */
export async function findOpenDealId(companyId: string): Promise<string | null> {
  if (USE_MOCK_HUBSPOT) return mockHasOpenDeal(companyId) ? `mock-deal:${companyId}` : null;
  const openDealIds = await getOpenDealIds(companyId);
  return openDealIds[0] ?? null;
}

/** The HubSpot owner currently assigned to a company, if any — used to
 * pre-fill the "Assigned to" field when creating a task. */
export async function getCompanyOwnerId(companyId: string): Promise<string | null> {
  if (USE_MOCK_HUBSPOT) return companyId.includes("known") ? "mock-owner-1" : null;

  const result = await hubspotRequest<{ properties: Record<string, string | null> }>(
    `/crm/v3/objects/companies/${companyId}?properties=hubspot_owner_id`
  );
  return result.properties.hubspot_owner_id ?? null;
}

let cachedOwners: { data: HubSpotOwner[]; fetchedAt: number } | null = null;
const OWNERS_CACHE_TTL_MS = 5 * 60 * 1000;

/** All active HubSpot owners/users, for populating the "Assigned to"
 * dropdown. Cached in-process for a few minutes so opening several entity
 * detail pages in a row doesn't refetch every time. */
export async function listOwners(): Promise<HubSpotOwner[]> {
  if (cachedOwners && Date.now() - cachedOwners.fetchedAt < OWNERS_CACHE_TTL_MS) {
    return cachedOwners.data;
  }

  if (USE_MOCK_HUBSPOT) {
    const owners = mockOwners();
    cachedOwners = { data: owners, fetchedAt: Date.now() };
    return owners;
  }

  const owners: HubSpotOwner[] = [];
  let after: string | undefined;

  do {
    const query = after ? `?limit=100&after=${encodeURIComponent(after)}` : "?limit=100";
    const result = await hubspotRequest<{
      results: Array<{
        id: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        archived?: boolean;
      }>;
      paging?: { next?: { after: string } };
    }>(`/crm/v3/owners${query}`);

    for (const owner of result.results) {
      if (owner.archived) continue;
      owners.push({
        id: owner.id,
        email: owner.email ?? null,
        firstName: owner.firstName ?? null,
        lastName: owner.lastName ?? null,
      });
    }
    after = result.paging?.next?.after;
  } while (after);

  cachedOwners = { data: owners, fetchedAt: Date.now() };
  return owners;
}

// --- Tasks ------------------------------------------------------------------

export type HubSpotTaskType = "CALL" | "EMAIL" | "TODO";
export type HubSpotTaskPriority = "LOW" | "MEDIUM" | "HIGH";

export type HubSpotTask = { id: string; url?: string };

export async function createTask(input: {
  subject: string;
  body?: string;
  dueDate?: string;
  taskType: HubSpotTaskType;
  priority?: HubSpotTaskPriority; // omitted entirely for "None"
  ownerId?: string;
}): Promise<HubSpotTask> {
  if (USE_MOCK_HUBSPOT) return { id: `mock-task-${Date.now()}` };

  const properties: Record<string, string> = {
    hs_task_subject: input.subject,
    hs_task_status: "NOT_STARTED",
    hs_task_type: input.taskType,
  };
  if (input.body) properties.hs_task_body = input.body;
  if (input.dueDate) properties.hs_timestamp = String(new Date(input.dueDate).getTime());
  if (input.priority) properties.hs_task_priority = input.priority;
  if (input.ownerId) properties.hubspot_owner_id = input.ownerId;

  const result = await hubspotRequest<{ id: string; url?: string }>("/crm/v3/objects/tasks", {
    method: "POST",
    body: JSON.stringify({ properties }),
  });

  return { id: result.id, url: result.url };
}

type AssociationTarget = "contacts" | "companies" | "deals";

type AssociationType = { typeId: number; category: string };

const associationTypeCache = new Map<string, AssociationType>();

/**
 * Looks up the association type ID (and category) from Tasks to the given
 * target object type via the associations labels API. Type IDs differ per
 * target type, so this must never be hardcoded — cached in-process per
 * (from, to) pair after the first lookup.
 */
export async function getAssociationTypeId(
  fromObjectType: "tasks",
  toObjectType: AssociationTarget
): Promise<AssociationType> {
  const cacheKey = `${fromObjectType}:${toObjectType}`;
  const cached = associationTypeCache.get(cacheKey);
  if (cached) return cached;

  if (USE_MOCK_HUBSPOT) {
    const mock = { typeId: 1, category: "HUBSPOT_DEFINED" };
    associationTypeCache.set(cacheKey, mock);
    return mock;
  }

  const result = await hubspotRequest<{
    results: Array<{ category: string; typeId: number; label: string | null }>;
  }>(`/crm/v4/associations/${fromObjectType}/${toObjectType}/labels`);

  const defaultAssociation =
    result.results.find((r) => r.category === "HUBSPOT_DEFINED") ?? result.results[0];
  if (!defaultAssociation) {
    throw new Error(`No association type found from ${fromObjectType} to ${toObjectType}`);
  }

  const resolved = { typeId: defaultAssociation.typeId, category: defaultAssociation.category };
  associationTypeCache.set(cacheKey, resolved);
  return resolved;
}

export async function associateTaskWith(
  taskId: string,
  toObjectType: AssociationTarget,
  toObjectId: string,
  associationType: AssociationType
): Promise<void> {
  if (USE_MOCK_HUBSPOT) return;

  await hubspotRequest(`/crm/v4/objects/tasks/${taskId}/associations/${toObjectType}/${toObjectId}`, {
    method: "PUT",
    body: JSON.stringify([
      {
        associationCategory: associationType.category,
        associationTypeId: associationType.typeId,
      },
    ]),
  });
}

export { hubspotRequest };
