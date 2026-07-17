-- Probabl Ptr — Supabase schema (Friday MVP)
-- Run this in the Supabase SQL editor. Safe to re-run (drops are commented for safety).

-- ─────────────────────────────────────────────────────────────
-- companies: one row per resolved company (account)
-- ─────────────────────────────────────────────────────────────
create table if not exists companies (
  id                uuid primary key default gen_random_uuid(),
  domain            text unique,               -- primary match key
  name              text,
  hubspot_company_id text,                      -- null if not in HubSpot
  is_target_account boolean not null default false,
  has_open_opp      boolean not null default false,
  matches_icp       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- contacts: one row per resolved person, linked to a company
-- ─────────────────────────────────────────────────────────────
create table if not exists contacts (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  full_name          text,
  company_id         uuid references companies(id) on delete set null,
  hubspot_contact_id text,                      -- null if not in HubSpot (= net-new person)
  linkedin_url       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (email)
);

-- ─────────────────────────────────────────────────────────────
-- signals: every incoming signal, verbatim + normalized
-- ─────────────────────────────────────────────────────────────
create table if not exists signals (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,             -- 'reo' | 'posthog'
  signal_type       text not null,
  origin_channel    text not null default 'unknown',
  campaign          text,
  raw_payload       jsonb not null,
  person_identifier text not null,
  company_domain    text,
  occurred_at       timestamptz not null,
  -- resolution results (filled by the pipeline)
  contact_id        uuid references contacts(id) on delete set null,
  company_id        uuid references companies(id) on delete set null,
  resolution_confidence text,                  -- 'high' | 'medium' | 'low'
  created_at        timestamptz not null default now()
);
create index if not exists idx_signals_company on signals(company_id);
create index if not exists idx_signals_contact on signals(contact_id);
create index if not exists idx_signals_occurred on signals(occurred_at desc);

-- ─────────────────────────────────────────────────────────────
-- entities: the scored, prioritized unit shown in the queue.
-- One entity = one company rollup (with its contacts + signals).
-- ─────────────────────────────────────────────────────────────
create table if not exists entities (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid references companies(id) on delete cascade,
  relationship_state text not null,            -- NET_NEW_CONTACT_NET_NEW_COMPANY | NEW_CONTACT_KNOWN_COMPANY | KNOWN_CONTACT_KNOWN_COMPANY
  composite_score    numeric not null default 0,
  top_reason         text,                     -- one-line "why it ranks here"
  claude_summary     text,                     -- filled on demand / on ingest
  status             text not null default 'pending', -- 'pending' | 'pushed' | 'dismissed'
  last_signal_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (company_id)
);
create index if not exists idx_entities_score on entities(composite_score desc);
create index if not exists idx_entities_status on entities(status);

-- ─────────────────────────────────────────────────────────────
-- entity_signals: which signals rolled up into which entity
-- ─────────────────────────────────────────────────────────────
create table if not exists entity_signals (
  entity_id uuid references entities(id) on delete cascade,
  signal_id uuid references signals(id) on delete cascade,
  primary key (entity_id, signal_id)
);

-- ─────────────────────────────────────────────────────────────
-- pushes: audit of what got pushed to HubSpot (for idempotency)
-- ─────────────────────────────────────────────────────────────
create table if not exists pushes (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid references entities(id) on delete cascade,
  hubspot_task_id  text,
  task_subject     text,
  task_body        text,
  assignee         text,
  due_date         date,
  pushed_at        timestamptz not null default now()
);

-- updated_at triggers
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_companies_updated on companies;
create trigger trg_companies_updated before update on companies
  for each row execute function set_updated_at();

drop trigger if exists trg_contacts_updated on contacts;
create trigger trg_contacts_updated before update on contacts
  for each row execute function set_updated_at();

drop trigger if exists trg_entities_updated on entities;
create trigger trg_entities_updated before update on entities
  for each row execute function set_updated_at();
