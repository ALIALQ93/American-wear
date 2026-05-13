-- طلبات استعادة كلمة مرور الزبون → إشعار للمسؤول (إرسال عبر واتساب يدوياً)
begin;

create table if not exists public.store_password_reset_requests (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.store_customers (id) on delete cascade,
  phone text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint store_password_reset_requests_status_check
    check (status in ('pending', 'resolved'))
);

create index if not exists idx_store_password_reset_pending
  on public.store_password_reset_requests (status, created_at desc)
  where status = 'pending';

comment on table public.store_password_reset_requests is
  'طلبات «نسيت كلمة المرور» من الزبائن — يعالجها المسؤول ويرسل كلمة المرور عبر واتساب.';

alter table public.store_password_reset_requests enable row level security;

drop policy if exists "password_reset_requests_admin_select" on public.store_password_reset_requests;
drop policy if exists "password_reset_requests_admin_update" on public.store_password_reset_requests;

create policy "password_reset_requests_admin_select" on public.store_password_reset_requests
  for select to authenticated
  using ((select public.is_active_admin()));

create policy "password_reset_requests_admin_update" on public.store_password_reset_requests
  for update to authenticated
  using ((select public.is_active_admin()))
  with check ((select public.is_active_admin()));

create or replace function public.store_customer_request_password_reset(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_customer record;
begin
  v_phone := public.normalize_store_phone(p_phone);
  if length(v_phone) < 10 then
    raise exception 'INVALID_PHONE';
  end if;

  select id, name_ar, is_active into v_customer
  from public.store_customers
  where phone = v_phone
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'message', 'إذا كان رقمك مسجّلاً لدينا، سيتواصل معك فريقنا عبر واتساب قريباً.'
    );
  end if;

  if v_customer.is_active <> 1 then
    raise exception 'ACCOUNT_DISABLED';
  end if;

  update public.store_password_reset_requests
  set status = 'resolved', resolved_at = now()
  where customer_id = v_customer.id and status = 'pending';

  insert into public.store_password_reset_requests (customer_id, phone, status)
  values (v_customer.id, v_phone, 'pending');

  return jsonb_build_object(
    'ok', true,
    'message', 'تم إرسال طلبك للإدارة. ستصلك كلمة المرور عبر واتساب في أقرب وقت.'
  );
end;
$$;

revoke all on function public.store_customer_request_password_reset(text) from public;
grant execute on function public.store_customer_request_password_reset(text) to anon, authenticated;

commit;
