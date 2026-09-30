create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  full_name text,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_company_name_unique unique (company_id, name)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  sku text,
  barcode text,
  name text not null,
  description text,
  sale_price numeric(14,2) not null default 0,
  cost_price numeric(14,2) not null default 0,
  stock numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_company_idx on public.products(company_id);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_barcode_idx on public.products(company_id, barcode);
create index if not exists products_sku_idx on public.products(company_id, sku);
create index if not exists categories_company_idx on public.categories(company_id);
create index if not exists profiles_company_idx on public.profiles(company_id);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at before update on public.companies for each row execute function public.set_updated_at();
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
