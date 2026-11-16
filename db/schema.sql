-- Business Card Manager schema. Safe to run repeatedly.

create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text,
  image       text,
  created_at  timestamptz not null default now()
);

create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  event_date   date,
  is_personal  boolean not null default false,
  created_by   uuid not null references users(id),
  owner_id     uuid not null references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists events_one_personal_per_user on events(created_by) where is_personal;

create table if not exists event_members (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  user_id     uuid references users(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('OWNER','EDITOR','VIEWER')),
  status      text not null default 'PENDING' check (status in ('PENDING','ACTIVE')),
  invited_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  unique (event_id, email)
);
create index if not exists event_members_user on event_members(user_id);
create index if not exists event_members_email on event_members(lower(email));

create table if not exists batches (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  uploaded_by  uuid not null references users(id),
  created_at   timestamptz not null default now()
);
create index if not exists batches_event on batches(event_id);

create table if not exists card_images (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references batches(id) on delete cascade,
  event_id       uuid not null references events(id) on delete cascade,
  uploaded_by    uuid not null references users(id),
  storage_key    text not null,
  original_name  text,
  mime_type      text not null,
  size_bytes     integer not null,
  status         text not null default 'UPLOADED' check (status in ('UPLOADED','PROCESSING','DONE','FAILED')),
  error          text,
  provider       text,
  raw_json       jsonb,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);
create index if not exists card_images_event on card_images(event_id);
create index if not exists card_images_batch on card_images(batch_id);

create table if not exists contacts (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  card_image_id  uuid references card_images(id) on delete set null,
  added_by       uuid not null references users(id),
  data           jsonb not null default '{}'::jsonb,
  is_duplicate   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists contacts_event on contacts(event_id);
