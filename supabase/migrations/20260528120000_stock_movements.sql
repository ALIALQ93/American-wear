-- حركات المخزون: إضافة من الإدارة، خصم يدوي، بيع (لاحقاً عند تثبيت الطلب)
begin;

create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  variant_id bigint references public.product_variants (id) on delete set null,
  delta integer not null,
  reason text not null,
  note text,
  order_id bigint references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_movements_reason_check check (
    reason in ('restock', 'adjustment_down', 'sale', 'initial')
  ),
  constraint stock_movements_delta_nonzero check (delta <> 0)
);

create index if not exists idx_stock_movements_product on public.stock_movements (product_id, created_at desc);
create index if not exists idx_stock_movements_variant on public.stock_movements (variant_id);

comment on table public.stock_movements is 'سجل تغييرات المخزون: + إضافة، − بيع أو خصم يدوي.';
comment on column public.stock_movements.reason is 'restock=إضافة إدارية، adjustment_down=خصم إداري، sale=بيع، initial=مخزون أولي عند الإنشاء';

alter table public.stock_movements enable row level security;

drop policy if exists "stock_movements_select_admin" on public.stock_movements;
drop policy if exists "stock_movements_insert_admin" on public.stock_movements;

create policy "stock_movements_select_admin" on public.stock_movements
  for select to authenticated
  using ((select public.is_active_admin()));

create policy "stock_movements_insert_admin" on public.stock_movements
  for insert to authenticated
  with check ((select public.is_active_admin()));

commit;
