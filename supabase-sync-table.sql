-- 在 Supabase SQL Editor 中执行
-- 若已有 device_id 表，可先 drop 或迁移数据后重建
drop table if exists sync_data;
create table sync_data (
  openid text primary key,
  funds jsonb default '[]',
  daily_earns jsonb default '{}',
  updated_at timestamptz default now()
);
