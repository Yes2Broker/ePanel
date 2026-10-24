-- One-time Builder Data defaults. Run AFTER functions.sql and reports.sql.
--
-- Builder Data is ON for everyone except the Tech department, Nishi Sanghavi
-- (EMP021) and Pratik Jethva (EMP014). New employees get it automatically
-- unless their department is Tech (see private.default_permission).
--
-- Safe on live data: nothing is deleted, and it only ever runs once. A marker
-- in app_settings stops a second run from undoing switches HR/Admin change
-- later on the Permissions page.
do $$
begin
  if exists (select 1 from app_settings where key = 'builder_data_defaults_applied') then
    raise notice 'Builder Data defaults were already applied - nothing changed.';
    return;
  end if;

  -- Old Builder Data switches were never used (the module wasn't live), so
  -- bring any saved ones in line with the new default.
  update employee_permissions p
     set enabled = (e.department <> 'Tech')
    from employees e
   where e.id = p.employee_id and p.module = 'builderData';

  insert into employee_permissions (employee_id, module, enabled)
  select id, 'builderData', false from employees where id in ('EMP021', 'EMP014')
  on conflict (employee_id, module) do update set enabled = false;

  insert into app_settings (key, value) values ('builder_data_defaults_applied', to_jsonb(now()));
  raise notice 'Builder Data defaults applied.';
end $$;
