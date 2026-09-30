-- Sprint 0.2 · Auth + RLS
-- Ejecutar DESPUÉS de 001_initial_schema.sql.

-- 1) Helper seguro para consultar pertenencia sin recursión de RLS.
create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.company_id = p_company_id
  );
$$;

create or replace function public.is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.company_id = p_company_id
      and profiles.role = 'owner'
  );
$$;

revoke all on function public.is_company_member(uuid) from public;
grant execute on function public.is_company_member(uuid) to authenticated;
revoke all on function public.is_company_owner(uuid) from public;
grant execute on function public.is_company_owner(uuid) to authenticated;

-- 2) Bootstrap automático: un usuario nuevo recibe una empresa y un perfil.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  company_name text;
  tax_id_value text;
  full_name_value text;
begin
  company_name := nullif(trim(new.raw_user_meta_data ->> 'company_name'), '');
  tax_id_value := nullif(trim(new.raw_user_meta_data ->> 'tax_id'), '');
  full_name_value := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');

  insert into public.companies (name, tax_id)
  values (coalesce(company_name, 'Mi empresa'), tax_id_value)
  returning id into new_company_id;

  insert into public.profiles (id, company_id, full_name, role)
  values (new.id, new_company_id, full_name_value, 'owner')
  on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 3) RLS: profiles solo expone el perfil del usuario autenticado.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select
to authenticated
using (id = auth.uid());

-- 4) RLS: companies solo es visible para miembros de esa empresa.
drop policy if exists companies_select_member on public.companies;
create policy companies_select_member
on public.companies for select
to authenticated
using (public.is_company_member(id));

drop policy if exists companies_update_owner on public.companies;
create policy companies_update_owner
on public.companies for update
to authenticated
using (public.is_company_owner(id))
with check (public.is_company_owner(id));

-- 5) RLS: categorías y productos quedan aislados por company_id.
drop policy if exists categories_select_member on public.categories;
create policy categories_select_member
on public.categories for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists categories_insert_member on public.categories;
create policy categories_insert_member
on public.categories for insert
to authenticated
with check (public.is_company_member(company_id));

drop policy if exists categories_update_member on public.categories;
create policy categories_update_member
on public.categories for update
to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists categories_delete_member on public.categories;
create policy categories_delete_member
on public.categories for delete
to authenticated
using (public.is_company_member(company_id));

drop policy if exists products_select_member on public.products;
create policy products_select_member
on public.products for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists products_insert_member on public.products;
create policy products_insert_member
on public.products for insert
to authenticated
with check (public.is_company_member(company_id));

drop policy if exists products_update_member on public.products;
create policy products_update_member
on public.products for update
to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists products_delete_member on public.products;
create policy products_delete_member
on public.products for delete
to authenticated
using (public.is_company_member(company_id));

-- 6) Grants explícitos para Data API; RLS sigue siendo la barrera de aislamiento.
grant select on public.profiles to authenticated;
grant select, update on public.companies to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
