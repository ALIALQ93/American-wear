-- مصادقة زبائن المتجر عبر Supabase RPC (تعمل على GitHub Pages بدون خادم Node)
begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.store_customer_register(
  p_phone text,
  p_name text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone text;
  v_name text;
  v_pass text;
  v_id bigint;
  v_token text;
  v_token_hash text;
  v_expires timestamptz;
begin
  v_phone := public.normalize_store_phone(p_phone);
  v_name := trim(coalesce(p_name, ''));
  v_pass := coalesce(p_password, '');

  if length(v_phone) < 10 then
    raise exception 'INVALID_PHONE';
  end if;
  if length(v_name) < 2 then
    raise exception 'INVALID_NAME';
  end if;
  if length(v_pass) < 6 then
    raise exception 'WEAK_PASSWORD';
  end if;

  if exists (select 1 from public.store_customers where phone = v_phone) then
    raise exception 'PHONE_EXISTS';
  end if;

  insert into public.store_customers (phone, name_ar, password_hash, password_plain)
  values (v_phone, v_name, crypt(v_pass, gen_salt('bf')), v_pass)
  returning id into v_id;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires := now() + interval '30 days';

  insert into public.store_customer_sessions (customer_id, token_hash, expires_at)
  values (v_id, v_token_hash, v_expires);

  return jsonb_build_object(
    'token', v_token,
    'expiresAt', v_expires,
    'customer', jsonb_build_object('id', v_id, 'phone', v_phone, 'nameAr', v_name)
  );
end;
$$;

create or replace function public.store_customer_login(
  p_phone text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone text;
  v_pass text;
  v_row record;
  v_token text;
  v_token_hash text;
  v_expires timestamptz;
begin
  v_phone := public.normalize_store_phone(p_phone);
  v_pass := coalesce(p_password, '');

  if length(v_phone) < 10 or v_pass = '' then
    raise exception 'INVALID_CREDENTIALS';
  end if;

  select id, phone, name_ar, password_hash, is_active
    into v_row
  from public.store_customers
  where phone = v_phone
  limit 1;

  if not found or v_row.is_active <> 1 then
    raise exception 'INVALID_CREDENTIALS';
  end if;

  if left(v_row.password_hash, 7) = 'scrypt:' then
    raise exception 'LEGACY_PASSWORD_HASH';
  end if;

  if crypt(v_pass, v_row.password_hash) is distinct from v_row.password_hash then
    raise exception 'INVALID_CREDENTIALS';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires := now() + interval '30 days';

  insert into public.store_customer_sessions (customer_id, token_hash, expires_at)
  values (v_row.id, v_token_hash, v_expires);

  return jsonb_build_object(
    'token', v_token,
    'expiresAt', v_expires,
    'customer', jsonb_build_object('id', v_row.id, 'phone', v_row.phone, 'nameAr', v_row.name_ar)
  );
end;
$$;

create or replace function public.store_customer_logout(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(trim(p_token), '') = '' then
    return;
  end if;
  delete from public.store_customer_sessions
  where token_hash = encode(digest(trim(p_token), 'sha256'), 'hex');
end;
$$;

create or replace function public.store_customer_me(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row record;
begin
  if coalesce(trim(p_token), '') = '' then
    raise exception 'UNAUTHORIZED';
  end if;

  select sc.id, sc.phone, sc.name_ar, sc.is_active, s.expires_at
    into v_row
  from public.store_customer_sessions s
  join public.store_customers sc on sc.id = s.customer_id
  where s.token_hash = encode(digest(trim(p_token), 'sha256'), 'hex')
  limit 1;

  if not found then
    raise exception 'UNAUTHORIZED';
  end if;

  if v_row.is_active <> 1 or v_row.expires_at < now() then
    delete from public.store_customer_sessions
    where token_hash = encode(digest(trim(p_token), 'sha256'), 'hex');
    raise exception 'UNAUTHORIZED';
  end if;

  return jsonb_build_object(
    'customer', jsonb_build_object('id', v_row.id, 'phone', v_row.phone, 'nameAr', v_row.name_ar)
  );
end;
$$;

create or replace function public.store_customer_list_orders(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id bigint;
  v_orders jsonb;
begin
  select (public.store_customer_me(p_token)->'customer'->>'id')::bigint into v_customer_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'orderRef', o.order_ref,
      'customerName', o.customer_name,
      'customerCity', o.customer_city,
      'summary', o.summary,
      'totalIqd', o.total_iqd,
      'status', o.status,
      'createdAt', o.created_at
    )
  ), '[]'::jsonb)
  into v_orders
  from (
    select *
    from public.orders o
    where o.store_customer_id = v_customer_id
    order by o.created_at desc, o.id desc
    limit 100
  ) o;

  return jsonb_build_object('orders', v_orders);
end;
$$;

revoke all on function public.store_customer_register(text, text, text) from public;
revoke all on function public.store_customer_login(text, text) from public;
revoke all on function public.store_customer_logout(text) from public;
revoke all on function public.store_customer_me(text) from public;
revoke all on function public.store_customer_list_orders(text) from public;

grant execute on function public.store_customer_register(text, text, text) to anon, authenticated;
grant execute on function public.store_customer_login(text, text) to anon, authenticated;
grant execute on function public.store_customer_logout(text) to anon, authenticated;
grant execute on function public.store_customer_me(text) to anon, authenticated;
grant execute on function public.store_customer_list_orders(text) to anon, authenticated;

commit;
