-- Partner-facing order read/update RPC helpers.
-- This migration lets partners fetch and update statuses for orders that contain their products.

create or replace function public.get_partner_orders(
  p_seller_id text default null,
  p_seller_email text default null
)
returns table (
  order_id text,
  status text,
  created_at text,
  customer_name text,
  customer_email text,
  customer_phone text,
  address text,
  total numeric,
  product_id text,
  product_name text,
  quantity numeric,
  price numeric
)
language sql
security definer
set search_path = public
as $$
with auth_ctx as (
  select
    coalesce(auth.uid()::text, '') as uid_text,
    lower(coalesce(auth.jwt() ->> 'email', '')) as auth_email,
    nullif(trim(coalesce(p_seller_id, '')), '') as seller_id,
    nullif(lower(trim(coalesce(p_seller_email, ''))), '') as seller_email
),
gate as (
  select
    uid_text,
    auth_email,
    seller_id,
    seller_email,
    case
      when uid_text = '' then false
      when seller_id is null and seller_email is null then false
      when seller_id is not null and seller_id = uid_text then true
      when seller_email is not null and auth_email <> '' and seller_email = auth_email then true
      else false
    end as allowed
  from auth_ctx
),
orders_base as (
  select
    o.*,
    to_jsonb(o) as o_json,
    coalesce(nullif(to_jsonb(o) ->> 'id', ''), nullif(to_jsonb(o) ->> 'order_id', '')) as oid
  from public.orders o
),
items_base as (
  select
    oi.*,
    to_jsonb(oi) as oi_json,
    coalesce(
      nullif(to_jsonb(oi) ->> 'order_id', ''),
      nullif(to_jsonb(oi) ->> 'parent_order_id', ''),
      nullif(to_jsonb(oi) ->> 'id_order', '')
    ) as oid,
    coalesce(
      nullif(to_jsonb(oi) ->> 'product_id', ''),
      nullif(to_jsonb(oi) ->> 'item_id', ''),
      nullif(to_jsonb(oi) ->> 'id_product', '')
    ) as pid
  from public.order_items oi
),
products_base as (
  select
    p.*,
    to_jsonb(p) as p_json,
    coalesce(nullif(to_jsonb(p) ->> 'id', ''), nullif(to_jsonb(p) ->> 'product_id', '')) as pid
  from public.products p
),
matched as (
  select
    ob.oid as order_id,
    coalesce(
      nullif(ob.o_json ->> 'status', ''),
      nullif(ob.o_json ->> 'order_status', ''),
      'pending'
    ) as status,
    coalesce(
      nullif(ob.o_json ->> 'created_at', ''),
      nullif(ob.o_json ->> 'order_created_at', ''),
      nullif(ob.o_json ->> 'createdAt', '')
    ) as created_at,
    coalesce(
      nullif(ob.o_json ->> 'customer_name', ''),
      nullif(ob.o_json ->> 'user_name', ''),
      nullif(ob.o_json ->> 'name', '')
    ) as customer_name,
    coalesce(
      nullif(ob.o_json ->> 'customer_email', ''),
      nullif(ob.o_json ->> 'user_email', ''),
      nullif(ob.o_json ->> 'email', '')
    ) as customer_email,
    coalesce(
      nullif(ob.o_json ->> 'customer_phone', ''),
      nullif(ob.o_json ->> 'phone', '')
    ) as customer_phone,
    coalesce(
      nullif(ob.o_json ->> 'address', ''),
      nullif(ob.o_json ->> 'customer_address', '')
    ) as address,
    case
      when coalesce(ob.o_json ->> 'total', ob.o_json ->> 'total_price', ob.o_json ->> 'amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then coalesce(ob.o_json ->> 'total', ob.o_json ->> 'total_price', ob.o_json ->> 'amount')::numeric
      else 0::numeric
    end as total,
    ib.pid as product_id,
    coalesce(
      nullif(ib.oi_json ->> 'product_name', ''),
      nullif(ib.oi_json ->> 'product_title', ''),
      nullif(ib.oi_json ->> 'name', ''),
      nullif(ib.oi_json ->> 'title', ''),
      nullif(pb.p_json ->> 'name', ''),
      nullif(pb.p_json ->> 'product_name', ''),
      nullif(pb.p_json ->> 'title', ''),
      'product'
    ) as product_name,
    case
      when coalesce(ib.oi_json ->> 'quantity', ib.oi_json ->> 'qty', ib.oi_json ->> 'count', '1') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then coalesce(ib.oi_json ->> 'quantity', ib.oi_json ->> 'qty', ib.oi_json ->> 'count', '1')::numeric
      else 1::numeric
    end as quantity,
    case
      when coalesce(ib.oi_json ->> 'price', ib.oi_json ->> 'amount', ib.oi_json ->> 'unit_price', ib.oi_json ->> 'item_price', '0') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then coalesce(ib.oi_json ->> 'price', ib.oi_json ->> 'amount', ib.oi_json ->> 'unit_price', ib.oi_json ->> 'item_price', '0')::numeric
      else 0::numeric
    end as price
  from orders_base ob
  join items_base ib
    on ib.oid = ob.oid
  left join products_base pb
    on pb.pid = ib.pid
  cross join gate g
  where g.allowed = true
    and ob.oid is not null
    and (
      (
        g.seller_id is not null
        and (
          coalesce(nullif(pb.p_json ->> 'seller_id', ''), nullif(pb.p_json ->> 'owner_id', ''), nullif(pb.p_json ->> 'user_id', '')) = g.seller_id
          or coalesce(nullif(ib.oi_json ->> 'seller_id', ''), nullif(ib.oi_json ->> 'owner_id', ''), nullif(ib.oi_json ->> 'user_id', '')) = g.seller_id
          or coalesce(nullif(ob.o_json ->> 'seller_id', ''), nullif(ob.o_json ->> 'owner_id', ''), nullif(ob.o_json ->> 'user_id', '')) = g.seller_id
        )
      )
      or
      (
        g.seller_email is not null
        and lower(
          coalesce(
            nullif(pb.p_json ->> 'seller_email', ''),
            nullif(pb.p_json ->> 'owner_email', ''),
            nullif(pb.p_json ->> 'user_email', ''),
            nullif(pb.p_json ->> 'email', ''),
            nullif(ib.oi_json ->> 'seller_email', ''),
            nullif(ib.oi_json ->> 'owner_email', ''),
            nullif(ib.oi_json ->> 'user_email', ''),
            nullif(ib.oi_json ->> 'email', ''),
            nullif(ob.o_json ->> 'seller_email', ''),
            nullif(ob.o_json ->> 'owner_email', ''),
            nullif(ob.o_json ->> 'user_email', ''),
            nullif(ob.o_json ->> 'email', '')
          )
        ) = g.seller_email
      )
    )
)
select
  order_id,
  status,
  created_at,
  customer_name,
  customer_email,
  customer_phone,
  address,
  total,
  product_id,
  product_name,
  quantity,
  price
from matched
order by created_at desc, order_id desc;
$$;

create or replace function public.get_seller_orders(
  p_seller_id text default null,
  p_seller_email text default null
)
returns table (
  order_id text,
  status text,
  created_at text,
  customer_name text,
  customer_email text,
  customer_phone text,
  address text,
  total numeric,
  product_id text,
  product_name text,
  quantity numeric,
  price numeric
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.get_partner_orders(p_seller_id, p_seller_email);
$$;

create or replace function public.update_partner_order_status(
  p_order_id text,
  p_status text,
  p_seller_id text default null,
  p_seller_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id text := nullif(trim(coalesce(p_order_id, '')), '');
  v_status text := lower(trim(coalesce(p_status, '')));
  v_seller_id text := nullif(trim(coalesce(p_seller_id, '')), '');
  v_seller_email text := nullif(lower(trim(coalesce(p_seller_email, ''))), '');
  v_auth_uid text := coalesce(auth.uid()::text, '');
  v_auth_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_allowed boolean := false;
  v_match_exists boolean := false;
  has_status boolean := false;
  has_order_status boolean := false;
  has_updated_at boolean := false;
  set_sql text := '';
  affected_rows integer := 0;
begin
  if v_order_id is null then
    return false;
  end if;

  if v_status = '' then
    return false;
  end if;

  if v_status like '%pending%' then
    v_status := 'pending';
  elsif v_status like '%preparing%' then
    v_status := 'preparing';
  elsif v_status like '%shipped%' then
    v_status := 'shipped';
  elsif v_status like '%delivered%' then
    v_status := 'delivered';
  elsif v_status like '%cancel%' then
    v_status := 'cancelled';
  else
    return false;
  end if;

  if v_auth_uid = '' then
    return false;
  end if;

  if v_seller_id is null and v_seller_email is null then
    v_allowed := false;
  elsif v_seller_id is not null and v_seller_id = v_auth_uid then
    v_allowed := true;
  elsif v_seller_email is not null and v_auth_email <> '' and v_seller_email = v_auth_email then
    v_allowed := true;
  end if;

  if not v_allowed then
    return false;
  end if;

  select exists (
    select 1
    from public.orders o
    join public.order_items oi
      on coalesce(
        nullif(to_jsonb(oi) ->> 'order_id', ''),
        nullif(to_jsonb(oi) ->> 'parent_order_id', ''),
        nullif(to_jsonb(oi) ->> 'id_order', '')
      ) = coalesce(
        nullif(to_jsonb(o) ->> 'id', ''),
        nullif(to_jsonb(o) ->> 'order_id', '')
      )
    left join public.products p
      on coalesce(
        nullif(to_jsonb(p) ->> 'id', ''),
        nullif(to_jsonb(p) ->> 'product_id', '')
      ) = coalesce(
        nullif(to_jsonb(oi) ->> 'product_id', ''),
        nullif(to_jsonb(oi) ->> 'item_id', ''),
        nullif(to_jsonb(oi) ->> 'id_product', '')
      )
    where coalesce(
      nullif(to_jsonb(o) ->> 'id', ''),
      nullif(to_jsonb(o) ->> 'order_id', '')
    ) = v_order_id
      and (
        (
          v_seller_id is not null
          and (
            coalesce(nullif(to_jsonb(p) ->> 'seller_id', ''), nullif(to_jsonb(p) ->> 'owner_id', ''), nullif(to_jsonb(p) ->> 'user_id', '')) = v_seller_id
            or coalesce(nullif(to_jsonb(oi) ->> 'seller_id', ''), nullif(to_jsonb(oi) ->> 'owner_id', ''), nullif(to_jsonb(oi) ->> 'user_id', '')) = v_seller_id
            or coalesce(nullif(to_jsonb(o) ->> 'seller_id', ''), nullif(to_jsonb(o) ->> 'owner_id', ''), nullif(to_jsonb(o) ->> 'user_id', '')) = v_seller_id
          )
        )
        or
        (
          v_seller_email is not null
          and lower(
            coalesce(
              nullif(to_jsonb(p) ->> 'seller_email', ''),
              nullif(to_jsonb(p) ->> 'owner_email', ''),
              nullif(to_jsonb(p) ->> 'user_email', ''),
              nullif(to_jsonb(p) ->> 'email', ''),
              nullif(to_jsonb(oi) ->> 'seller_email', ''),
              nullif(to_jsonb(oi) ->> 'owner_email', ''),
              nullif(to_jsonb(oi) ->> 'user_email', ''),
              nullif(to_jsonb(oi) ->> 'email', ''),
              nullif(to_jsonb(o) ->> 'seller_email', ''),
              nullif(to_jsonb(o) ->> 'owner_email', ''),
              nullif(to_jsonb(o) ->> 'user_email', ''),
              nullif(to_jsonb(o) ->> 'email', '')
            )
          ) = v_seller_email
        )
      )
  ) into v_match_exists;

  if not v_match_exists then
    return false;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'status'
  ) into has_status;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'order_status'
  ) into has_order_status;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'updated_at'
  ) into has_updated_at;

  if has_status then
    set_sql := set_sql || 'status = $1';
  end if;

  if has_order_status then
    if set_sql <> '' then set_sql := set_sql || ', '; end if;
    set_sql := set_sql || 'order_status = $1';
  end if;

  if has_updated_at then
    if set_sql <> '' then set_sql := set_sql || ', '; end if;
    set_sql := set_sql || 'updated_at = now()';
  end if;

  if set_sql = '' then
    return false;
  end if;

  execute format(
    'update public.orders o set %s where coalesce(nullif(to_jsonb(o)->>''id'',''''), nullif(to_jsonb(o)->>''order_id'','''')) = $2',
    set_sql
  ) using v_status, v_order_id;

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

create or replace function public.set_partner_order_status(
  p_order_id text,
  p_status text,
  p_seller_id text default null,
  p_seller_email text default null
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.update_partner_order_status(
    p_order_id => p_order_id,
    p_status => p_status,
    p_seller_id => p_seller_id,
    p_seller_email => p_seller_email
  );
$$;

grant execute on function public.get_partner_orders(text, text) to authenticated;
grant execute on function public.get_seller_orders(text, text) to authenticated;
grant execute on function public.update_partner_order_status(text, text, text, text) to authenticated;
grant execute on function public.set_partner_order_status(text, text, text, text) to authenticated;
