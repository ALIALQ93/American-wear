-- طلبات المتجر: بنود الطلب + دالة تثبيت الطلب وخصم المخزون
begin;

alter table public.orders
  add column if not exists customer_phone text,
  add column if not exists customer_address text,
  add column if not exists governorate_id bigint references public.shipping_governorates (id) on delete set null,
  add column if not exists shipping_fee_iqd bigint not null default 0,
  add column if not exists subtotal_iqd bigint not null default 0;

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete restrict,
  variant_id bigint references public.product_variants (id) on delete set null,
  product_name text not null,
  variant_label text,
  qty integer not null,
  unit_price_iqd bigint not null,
  line_total_iqd bigint not null,
  created_at timestamptz not null default now(),
  constraint order_items_qty_positive check (qty > 0),
  constraint order_items_unit_price_nonneg check (unit_price_iqd >= 0),
  constraint order_items_line_total_nonneg check (line_total_iqd >= 0)
);

create index if not exists idx_order_items_order on public.order_items (order_id);
create index if not exists idx_order_items_variant on public.order_items (variant_id);

alter table public.order_items enable row level security;

drop policy if exists "order_items_select_admin" on public.order_items;
create policy "order_items_select_admin" on public.order_items
  for select to authenticated
  using ((select public.is_active_admin()));

-- السماح للزبائن بإنشاء طلبات pending فقط عبر الدالة الأمنية
drop policy if exists "orders_insert_storefront" on public.orders;
create policy "orders_insert_storefront" on public.orders
  for insert to anon, authenticated
  with check (status = 'pending');

drop policy if exists "order_items_insert_storefront" on public.order_items;
create policy "order_items_insert_storefront" on public.order_items
  for insert to anon, authenticated
  with check (true);

create or replace function public.place_store_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
  v_address text;
  v_city text;
  v_gov_id bigint;
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
  v_address := nullif(trim(coalesce(payload->>'customer_address', '')), '');
  v_gov_id := nullif(trim(coalesce(payload->>'governorate_id', '')), '')::bigint;

  if v_name is null then
    raise exception 'CUSTOMER_NAME_REQUIRED';
  end if;
  if v_phone is null then
    raise exception 'CUSTOMER_PHONE_REQUIRED';
  end if;
  if v_address is null then
    raise exception 'CUSTOMER_ADDRESS_REQUIRED';
  end if;
  if v_gov_id is null then
    raise exception 'GOVERNORATE_REQUIRED';
  end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') = 0 then
    raise exception 'CART_EMPTY';
  end if;

  select sg.name_ar, coalesce(sg.fee_iqd, 0)
    into v_city, v_shipping
  from public.shipping_governorates sg
  where sg.id = v_gov_id and sg.is_active = 1;

  if not found then
    raise exception 'GOVERNORATE_INVALID';
  end if;

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    v_variant_id := (item->>'variant_id')::bigint;
    v_qty := (item->>'qty')::int;
    if v_variant_id is null or v_qty is null or v_qty < 1 then
      raise exception 'INVALID_ITEM';
    end if;

    select
      v.id as variant_id,
      v.stock,
      v.size_label,
      p.id as product_id,
      p.name_ar,
      p.price_iqd,
      p.is_active as product_active,
      v.is_active as variant_active,
      c.name_ar as color_name
    into v_row
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.product_colors c on c.id = v.color_id
    where v.id = v_variant_id;

    if not found then
      raise exception 'VARIANT_NOT_FOUND:%', v_variant_id;
    end if;
    if v_row.product_active <> 1 or v_row.variant_active <> 1 then
      raise exception 'PRODUCT_UNAVAILABLE:%', v_variant_id;
    end if;
    if v_row.stock < v_qty then
      raise exception 'INSUFFICIENT_STOCK:%:%', v_variant_id, v_row.stock;
    end if;

    v_line := v_row.price_iqd * v_qty;
    v_subtotal := v_subtotal + v_line;
  end loop;

  v_total := v_subtotal + v_shipping;
  v_order_ref := 'AW-' || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');

  insert into public.orders (
    order_ref, customer_name, customer_phone, customer_city, customer_address,
    governorate_id, shipping_fee_iqd, subtotal_iqd, total_iqd, summary, status
  ) values (
    v_order_ref, v_name, v_phone, v_city, v_address,
    v_gov_id, v_shipping, v_subtotal, v_total, '', 'pending'
  )
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    v_variant_id := (item->>'variant_id')::bigint;
    v_qty := (item->>'qty')::int;

    select
      v.id,
      v.stock,
      v.size_label,
      p.id,
      p.name_ar,
      p.price_iqd,
      c.name_ar as color_name
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
      v_order_id, v_row.id, v_variant_id, v_row.name_ar, nullif(v_label, ''), v_qty, v_row.price_iqd, v_line
    );

    v_new_stock := v_row.stock - v_qty;
    update public.product_variants set stock = v_new_stock where id = v_variant_id;

    insert into public.stock_movements (product_id, variant_id, delta, reason, order_id, note)
    values (v_row.id, v_variant_id, -v_qty, 'sale', v_order_id, 'طلب متجر ' || v_order_ref);

    update public.products
    set stock = greatest(0, coalesce(stock, 0) - v_qty)
    where id = v_row.id;

    if v_summary <> '' then v_summary := v_summary || E'\n'; end if;
    v_summary := v_summary || v_row.name_ar
      || case when v_label <> '' then ' (' || v_label || ')' else '' end
      || ' × ' || v_qty::text;
  end loop;

  update public.orders set summary = v_summary where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_ref', v_order_ref,
    'total_iqd', v_total,
    'subtotal_iqd', v_subtotal,
    'shipping_fee_iqd', v_shipping
  );
end;
$$;

revoke all on function public.place_store_order(jsonb) from public;
grant execute on function public.place_store_order(jsonb) to anon, authenticated;

commit;
