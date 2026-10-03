-- Kur largohet anëtari i fundit, familja dhe të gjitha rekordet e saj fshihen (cascade):
-- të dhënat e përbashkëta nuk mbeten në server pa askënd që i zotëron.
create or replace function public.remove_member(p_token text, p_member_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare m public.household_members := public._member(p_token);
begin
  if p_member_id <> m.id and m.role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.household_members where id = p_member_id and household_id = m.household_id;
  if not exists (select 1 from public.household_members where household_id = m.household_id) then
    delete from public.households where id = m.household_id;
  end if;
end $$;
revoke execute on function public.remove_member(text, uuid) from public;
grant execute on function public.remove_member(text, uuid) to anon;
