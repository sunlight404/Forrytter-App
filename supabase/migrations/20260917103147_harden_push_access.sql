-- Keep pg_net installed; its API objects live in the net schema.
-- Only the database scheduler needs to send requests.
revoke usage on schema net from public,anon,authenticated;
revoke execute on all functions in schema net from public,anon,authenticated;
create policy push_worker_only on private.push_outbox for all to service_role using(true) with check(true);
create policy push_runtime_no_clients on private.push_runtime for all to anon,authenticated using(false) with check(false);
