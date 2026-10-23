-- Cairn Database Schema
-- Run this in Supabase SQL Editor

-- 1. Enable UUID generation extension
create extension if not exists "uuid-ossp";

-- 2. Create tables
create table if not exists public.files (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    is_demo boolean not null default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.versions (
    id uuid primary key default uuid_generate_v4(),
    file_id uuid not null references public.files(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    version_no integer not null,
    storage_path text not null,
    size bigint not null,
    sha256 text not null,
    signature text not null,
    status text not null check (status in ('ok', 'modified', 'missing', 'record_tampered')),
    last_checked_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint unique_file_version unique (file_id, version_no)
);

create table if not exists public.alerts (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    type text not null check (type in ('modified', 'missing', 'record_tampered', 'mass_change')),
    message text not null,
    version_id uuid references public.versions(id) on delete set null,
    acknowledged boolean not null default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Enable Row Level Security (RLS)
alter table public.files enable row level security;
alter table public.versions enable row level security;
alter table public.alerts enable row level security;

-- 4. Set RLS Policies: Authenticated users can only SELECT their own rows.
-- No INSERT, UPDATE, DELETE policies for users (Backend uses service role key).
create policy "Users can select own files"
    on public.files for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Users can select own versions"
    on public.versions for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Users can select own alerts"
    on public.alerts for select
    to authenticated
    using (auth.uid() = user_id);
