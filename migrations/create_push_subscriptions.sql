create table if not exists public.push_subscriptions (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    endpoint text not null,
    p256dh text not null,
    auth text not null,
    user_agent text,
    created_at timestamp with time zone default now(),
    primary key (id),
    unique(user_id, endpoint)
);

-- RLS Policies
alter table public.push_subscriptions enable row level security;

create policy "Users can view their own subscriptions"
    on public.push_subscriptions for select
    using (auth.uid() = user_id);

create policy "Users can insert their own subscriptions"
    on public.push_subscriptions for insert
    with check (auth.uid() = user_id);

create policy "Users can delete their own subscriptions"
    on public.push_subscriptions for delete
    using (auth.uid() = user_id);
