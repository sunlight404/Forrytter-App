create extension if not exists pg_net;
grant usage on schema private to service_role;
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 stable_id uuid not null references public.stables(id) on delete cascade,
 endpoint text not null unique, subscription jsonb not null, created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon,authenticated;
grant select,delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create policy push_read_own on public.push_subscriptions for select to authenticated using(user_id=auth.uid());
create policy push_delete_own on public.push_subscriptions for delete to authenticated using(user_id=auth.uid());
create index push_user_stable_idx on public.push_subscriptions(user_id,stable_id);
create index push_stable_idx on public.push_subscriptions(stable_id);

create table private.push_runtime (
 singleton boolean primary key default true check(singleton), public_key text,
 private_secret_id uuid, worker_secret_id uuid not null
);
alter table private.push_runtime enable row level security;
revoke all on private.push_runtime from public,anon,authenticated,service_role;
insert into private.push_runtime(worker_secret_id)
 select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'forrytter_push_worker_token');
-- Vault access is restricted to these service-only functions; keys never reach clients.
create function public.push_runtime_get() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('publicKey',r.public_key,'privateKey',k.decrypted_secret,'workerToken',w.decrypted_secret)
 from private.push_runtime r left join vault.decrypted_secrets k on k.id=r.private_secret_id
 join vault.decrypted_secrets w on w.id=r.worker_secret_id;
$$;
create function public.push_runtime_init(p_public text,p_private text) returns void language plpgsql security definer set search_path='' as $$
declare current_private uuid;
begin
 select private_secret_id into current_private from private.push_runtime where singleton for update;
 if current_private is null then
  update private.push_runtime set public_key=p_public,private_secret_id=vault.create_secret(p_private,'forrytter_push_vapid_private') where singleton;
 end if;
end;
$$;
revoke all on function public.push_runtime_get() from public,anon,authenticated;
revoke all on function public.push_runtime_init(text,text) from public,anon,authenticated;
grant execute on function public.push_runtime_get(),public.push_runtime_init(text,text) to service_role;

create table private.push_outbox (
 id uuid primary key default gen_random_uuid(), stable_id uuid not null, user_id uuid not null,
 topic text not null,title text not null, tab text not null default 'today',
 status text not null default 'pending' check(status in('pending','processing','sent','failed')),
 created_at timestamptz not null default now(),next_attempt timestamptz not null default now(),
 locked_until timestamptz,attempts int not null default 0,last_error text
);
alter table private.push_outbox enable row level security;
revoke all on private.push_outbox from public,anon,authenticated;
grant all on private.push_outbox to service_role;
create unique index push_pending_topic_idx on private.push_outbox(stable_id,user_id,topic) where status='pending';
create index push_ready_idx on private.push_outbox(status,next_attempt);
create function public.push_claim(p_limit int default 20) returns setof private.push_outbox
 language sql security invoker set search_path='' as $$
 update private.push_outbox set status='processing',locked_until=now()+interval '3 minutes',attempts=attempts+1
 where id in(select id from private.push_outbox where (status='pending' and next_attempt<=now()) or (status='processing' and locked_until<now()) order by created_at for update skip locked limit least(greatest(p_limit,1),20)) returning *;
$$;
create function public.push_finish(p_id uuid,p_ok boolean,p_error text default null) returns void
 language plpgsql security invoker set search_path='' as $$
begin
 -- Retrying uses processing state to avoid a duplicate pending-topic row during concurrent changes.
 update private.push_outbox set status=case when p_ok then 'sent' when attempts>=5 then 'failed' else 'processing' end,
 locked_until=now()+interval '2 minutes',last_error=left(p_error,100) where id=p_id;
end;
$$;
create function public.push_test(p_stable uuid,p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if (select count(*) from private.push_outbox where stable_id=p_stable and user_id=p_user and topic='test' and created_at>now()-interval '1 hour')>=10 then raise exception 'Vent litt før du sender flere testvarsler';end if;
 insert into private.push_outbox(stable_id,user_id,topic,title,tab) values(p_stable,p_user,'test','Varsler fra Fôrrytter App virker','today')
 on conflict(stable_id,user_id,topic) where status='pending' do nothing;
end;
$$;
revoke all on function public.push_claim(int),public.push_finish(uuid,boolean,text),public.push_test(uuid,uuid) from public,anon,authenticated;
grant execute on function public.push_claim(int),public.push_finish(uuid,boolean,text),public.push_test(uuid,uuid) to service_role;

create function private.queue_app_push(p_stable uuid,p_user uuid,p_topic text,p_title text,p_tab text) returns void
 language plpgsql security invoker set search_path='' as $$
begin
 if p_user is null or p_user is not distinct from auth.uid() then return;end if;
 if not exists(select 1 from public.memberships where stable_id=p_stable and user_id=p_user and active)
 or not exists(select 1 from public.push_subscriptions where stable_id=p_stable and user_id=p_user) then return;end if;
 insert into private.push_outbox(stable_id,user_id,topic,title,tab) values(p_stable,p_user,p_topic,p_title,p_tab)
 on conflict(stable_id,user_id,topic) where status='pending' do update set title=excluded.title,tab=excluded.tab;
end;
$$;
revoke all on function private.queue_app_push(uuid,uuid,text,text,text) from public,anon,authenticated;
-- Trigger-only privilege elevation is needed to enqueue a recipient's event after a rider requests a swap.
-- Recipients are derived from validated rows and must be active subscribers of the same stable.
create function private.capture_app_push() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; old_r jsonb; stable uuid; person uuid; title_text text; tab_name text;
begin
 if TG_OP='DELETE' then r:=to_jsonb(OLD);else r:=to_jsonb(NEW);end if;
 if TG_OP='UPDATE' then old_r:=to_jsonb(OLD);end if;
 stable:=(r->>'stable_id')::uuid;
 if TG_TABLE_NAME='horse_assignments' then
  if auth.uid() is null then return null;end if; -- Don't alert on automatic rolling-year extension.
  if (r->>'assignment_date')::date<(now() at time zone 'Europe/Oslo')::date then return null;end if;
  if TG_OP='INSERT' and (r->>'is_cancelled')::boolean then return null;end if;
  if TG_OP='UPDATE' and (r->'horse_id',r->'user_id',r->'assignment_date',r->'training_text',r->'is_cancelled') is not distinct from (old_r->'horse_id',old_r->'user_id',old_r->'assignment_date',old_r->'training_text',old_r->'is_cancelled') then return null;end if;
  perform private.queue_app_push(stable,(r->>'user_id')::uuid,'horses','Hestedagene dine er oppdatert','today');
  if TG_OP='UPDATE' and r->>'user_id' is distinct from old_r->>'user_id' then perform private.queue_app_push(stable,(old_r->>'user_id')::uuid,'horses','Hestedagene dine er oppdatert','today');end if;
 elsif TG_TABLE_NAME='feeding_shifts' then
  if (r->>'shift_date')::date<(now() at time zone 'Europe/Oslo')::date then return null;end if;
  if TG_OP='UPDATE' and (r->'assigned_to',r->'shift_date',r->'shift_time',r->'label') is not distinct from (old_r->'assigned_to',old_r->'shift_date',old_r->'shift_time',old_r->'label') then return null;end if;
  perform private.queue_app_push(stable,(r->>'assigned_to')::uuid,'feeding','Fôringene dine er oppdatert','feeding');
  if TG_OP='UPDATE' and r->>'assigned_to' is distinct from old_r->>'assigned_to' then perform private.queue_app_push(stable,(old_r->>'assigned_to')::uuid,'feeding','Fôringene dine er oppdatert','feeding');end if;
 elsif TG_TABLE_NAME='messages' then
  if TG_OP='DELETE' or not (r->>'active')::boolean then return null;end if;
  if TG_OP='UPDATE' and r->>'text' is not distinct from old_r->>'text' then return null;end if;
  for person in select user_id from public.memberships where stable_id=stable and active loop
   perform private.queue_app_push(stable,person,'messages','Ny beskjed fra stallen','messages');
  end loop;
 else
  tab_name:=case when TG_TABLE_NAME='horse_swap_requests' then 'horseSwaps' else 'feeding' end;
  if TG_OP='INSERT' then
   perform private.queue_app_push(stable,(r->>'to_user')::uuid,TG_TABLE_NAME,'Du har fått en bytteforespørsel',tab_name);
  elsif r->>'status' is distinct from old_r->>'status' then
   if r->>'status'='awaiting_admin' then
    for person in select user_id from public.memberships where stable_id=stable and active and role in('owner','admin') loop
     perform private.queue_app_push(stable,person,TG_TABLE_NAME,'Et bytte venter på godkjenning',tab_name);
    end loop;
   end if;
   perform private.queue_app_push(stable,(r->>'from_user')::uuid,TG_TABLE_NAME,'Bytteforespørselen er oppdatert',tab_name);
   perform private.queue_app_push(stable,(r->>'to_user')::uuid,TG_TABLE_NAME,'Bytteforespørselen er oppdatert',tab_name);
  end if;
 end if;
 return null;
end;
$$;
revoke all on function private.capture_app_push() from public,anon,authenticated;
create trigger push_horse_change after insert or update or delete on public.horse_assignments for each row execute function private.capture_app_push();
create trigger push_feeding_change after insert or update or delete on public.feeding_shifts for each row execute function private.capture_app_push();
create trigger push_message after insert or update on public.messages for each row execute function private.capture_app_push();
create trigger push_horse_swap after insert or update on public.horse_swap_requests for each row execute function private.capture_app_push();
create trigger push_feeding_swap after insert or update on public.feeding_swap_requests for each row execute function private.capture_app_push();

create function private.remove_departed_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if OLD.active and not NEW.active then
  delete from public.push_subscriptions where stable_id=NEW.stable_id and user_id=NEW.user_id;
  delete from private.push_outbox where stable_id=NEW.stable_id and user_id=NEW.user_id and status in('pending','processing');
 end if;
 return null;
end;
$$;
revoke all on function private.remove_departed_push() from public,anon,authenticated;
create trigger remove_departed_push after update on public.memberships for each row execute function private.remove_departed_push();

create function private.dispatch_app_push() returns void language plpgsql security invoker set search_path='' as $$
declare worker_token text;
begin
 delete from private.push_outbox where status in('sent','failed') and created_at<now()-interval '7 days';
 if not exists(select 1 from private.push_outbox where (status='pending' and next_attempt<=now()) or (status='processing' and locked_until<now()))
 and exists(select 1 from private.push_runtime where public_key is not null) then return;end if;
 select s.decrypted_secret into worker_token from private.push_runtime r join vault.decrypted_secrets s on s.id=r.worker_secret_id;
 perform net.http_post(url:='https://cffaswmpbllyqrnikelf.supabase.co/functions/v1/push-notifications',
 headers:=jsonb_build_object('Content-Type','application/json','x-push-worker',worker_token),body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=30000);
end;
$$;
revoke all on function private.dispatch_app_push() from public,anon,authenticated,service_role;
select cron.schedule('forrytter-web-push','* * * * *','select private.dispatch_app_push();');
