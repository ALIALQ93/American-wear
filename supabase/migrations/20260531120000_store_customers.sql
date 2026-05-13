-- حسابات زبائن المتجر: جدول عادي (ليس Supabase Authentication) — هاتف + اسم + كلمة مرور
begin;

create or replace function public.normalize_store_phone(raw text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  d := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
  if d = '' then
    return '';
  end if;
  if left(d, 3) = '964' and length(d) >= 12 then
    d := '0' || substr(d, 4);
  elsif length(d) = 10 and left(d, 1) = '7' then
    d := '0' || d;
  end if;
  return d;
end;
$$;

comment on function public.normalize_store_phone(text) is 'توحيد رقم الهاتف العراقي للمقارنة والتخزين.';

create table if not exists public.store_customers (
  id bigint generated always as identity primary key,
  phone text not null,
  name_ar text not null,
  password_hash text not null,
  is_active smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_customers_phone_nonempty check (char_length(trim(phone)) >= 10),
  constraint store_customers_name_nonempty check (char_length(trim(name_ar)) >= 2)
);

create unique index if not exists store_customers_phone_unique
  on public.store_customers (phone);

create table if not exists public.store_customer_sessions (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.store_customers (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists store_customer_sessions_token_hash_unique
  on public.store_customer_sessions (token_hash);

create index if not exists idx_store_customer_sessions_customer
  on public.store_customer_sessions (customer_id);

create index if not exists idx_store_customer_sessions_expires
  on public.store_customer_sessions (expires_at);

alter table public.orders
  add column if not exists store_customer_id bigint references public.store_customers (id) on delete set null;

create index if not exists idx_orders_store_customer on public.orders (store_customer_id);

comment on table public.store_customers is 'حساب زبون المتجر — هاتف واسم وكلمة مرور (بدون Supabase Auth وبدون OTP).';
comment on table public.store_customer_sessions is 'جلسات زبائن صادرة من خادم Node فقط.';

alter table public.store_customers enable row level security;
alter table public.store_customer_sessions enable row level security;

-- لا سياسات عامة: الوصول عبر اتصال الخادم (service) أو دوال security definer فقط

create or replace function public.place_store_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
  v_phone_norm text;
  v_address text;
  v_city text;
  v_gov_id bigint;
  v_pay_id bigint;
  v_pay_name text;
  v_customer_id bigint;
  v_shipping bigint := 0;
  v_subtotal bigint := 0;
  v_total bigint := 0;
  v_order_id bigint;
  v_order_ref text;
  v_summary text := '';
  item jsonb;
  v_variant_id bigint;
  v_qty int;
  v_row record;
  v_label text;
  v_line bigint;
  v_new_stock int;
begin
  v_name := nullif(trim(coalesce(payload->>'customer_name', '')), '');
  v_phone := nullif(trim(coalesce(payload->>'customer_phone', '')), '');
  v_phone_norm := public.normalize_store_phone(v_phone);
  v_address := nullif(trim(coalesce(payload->>'customer_address', '')), '');
  v_gov_id := nullif(trim(coalesce(payload->>'governorate_id', '')), '')::bigint;
  v_pay_id := nullif(trim(coalesce(payload->>'payment_method_id', '')), '')::bigint;
  v_customer_id := nullif(trim(coalesce(payload->>'store_customer_id', '')), '')::bigint;

  if v_name is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if v_phone is null then raise exception 'CUSTOMER_PHONE_REQUIRED'; end if;
  if v_address is null then raise exception 'CUSTOMER_ADDRESS_REQUIRED'; end if;
  if v_gov_id is null then raise exception 'GOVERNORATE_REQUIRED'; end if;
  if v_pay_id is null then raise exception 'PAYMENT_METHOD_REQUIRED'; end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') = 0 then
    raise exception 'CART_EMPTY';
  end if;

  if v_customer_id is not null then
    perform 1 from public.store_customers sc
    where sc.id = v_customer_id and sc.is_active = 1 and sc.phone = v_phone_norm;
    if not found then
      raise exception 'STORE_CUSTOMER_MISMATCH';
    end if;
  end if;

  select pm.name_ar into v_pay_name
  from public.payment_methods pm
  where pm.id = v_pay_id and pm.is_active = 1;
  if not found then raise exception 'PAYMENT_METHOD_INVALID'; end if;

  select sg.name_ar, coalesce(sg.fee_iqd, 0)
    into v_city, v_shipping
  from public.shipping_governorates sg
  where sg.id = v_gov_id and sg.is_active = 1;
  if not found then raise exception 'GOVERNORATE_INVALID'; end if;

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    v_variant_id := (item->>'variant_id')::bigint;
    v_qty := (item->>'qty')::int;
    if v_variant_id is null or v_qty is null or v_qty < 1 then raise exception 'INVALID_ITEM'; end if;

    select v.id, v.stock, v.size_label, p.id as product_id, p.name_ar, p.price_iqd,
      p.is_active as product_active, v.is_active as variant_active, c.name_ar as color_name
    into v_row
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.product_colors c on c.id = v.color_id
    where v.id = v_variant_id;

    if not found then raise exception 'VARIANT_NOT_FOUND:%', v_variant_id; end if;
    if v_row.product_active <> 1 or v_row.variant_active <> 1 then raise exception 'PRODUCT_UNAVAILABLE:%', v_variant_id; end if;
    if v_row.stock < v_qty then raise exception 'INSUFFICIENT_STOCK:%:%', v_variant_id, v_row.stock; end if;
    v_subtotal := v_subtotal + v_row.price_iqd * v_qty;
  end loop;

  v_total := v_subtotal + v_shipping;
  v_order_ref := 'AW-' || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');

  insert into public.orders (
    order_ref, customer_name, customer_phone, customer_city, customer_address,
    governorate_id, payment_method_id, shipping_fee_iqd, subtotal_iqd, total_iqd, summary, status,
    store_customer_id
  ) values (
    v_order_ref, v_name, v_phone, v_city, v_address,
    v_gov_id, v_pay_id, v_shipping, v_subtotal, v_total, '', 'pending',
    v_customer_id
  )
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    v_variant_id := (item->>'variant_id')::bigint;
    v_qty := (item->>'qty')::int;

    select v.id, v.stock, v.size_label, p.id as product_id, p.name_ar, p.price_iqd, c.name_ar as color_name
    into v_row
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.product_colors c on c.id = v.color_id
    where v.id = v_variant_id
    for update of v;

    v_label := trim(both ' / ' from concat_ws(' / ', v_row.color_name, v_row.size_label));
    v_line := v_row.price_iqd * v_qty;

    insert into public.order_items (
      order_id, product_id, variant_id, product_name, variant_label, qty, unit_price_iqd, line_total_iqd
    ) values (
      v_order_id, v_row.product_id, v_variant_id, v_row.name_ar, nullif(v_label, ''), v_qty, v_row.price_iqd, v_line
    );

    v_new_stock := v_row.stock - v_qty;
    update public.product_variants set stock = v_new_stock where id = v_variant_id;
    insert into public.stock_movements (product_id, variant_id, delta, reason, order_id, note)
    values (v_row.product_id, v_variant_id, -v_qty, 'sale', v_order_id, 'طلب متجر ' || v_order_ref);
    update public.products set stock = greatest(0, coalesce(stock, 0) - v_qty) where id = v_row.product_id;

    if v_summary <> '' then v_summary := v_summary || E'\n'; end if;
    v_summary := v_summary || v_row.name_ar
      || case when v_label <> '' then ' (' || v_label || ')' else '' end
      || ' × ' || v_qty::text;
  end loop;

  v_summary := 'الدفع: ' || v_pay_name || E'\n' || v_summary;
  update public.orders set summary = v_summary where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_ref', v_order_ref,
    'total_iqd', v_total,
    'subtotal_iqd', v_subtotal,
    'shipping_fee_iqd', v_shipping,
    'payment_method', v_pay_name
  );
end;
$$;

revoke all on function public.place_store_order(jsonb) from public;
grant execute on function public.place_store_order(jsonb) to anon, authenticated;

commit;
