-- SAMPLE data for the SOP screenshots. Made-up people, emails and salaries.
-- Only for a throw-away LOCAL test database (see README.md). Never run this on
-- the real Supabase project.
-- "Today" when this was recorded: Monday 26 Oct 2026. Password for everyone: Sample@123

insert into employees (id, name, email, mobile, department, role, designation, salary, joining_date, manager, week_off, status, password_hash) values
('EMP100', 'Amit Desai',    'amit.desai@example.com',    '9000000100', 'Management', 'Admin',    'Director',          null,  '2024-01-01', '',           7, 'Active', extensions.crypt('Sample@123', extensions.gen_salt('bf'))),
('EMP101', 'Rohan Mehta',   'rohan.mehta@example.com',   '9000000101', 'Sales',      'Employee', 'Sales Executive',   28000, '2025-03-10', 'Amit Desai', 7, 'Active', extensions.crypt('Sample@123', extensions.gen_salt('bf'))),
('EMP102', 'Neha Shah',     'neha.shah@example.com',     '9000000102', 'HR',         'HR',       'HR Manager',        35000, '2024-06-01', 'Amit Desai', 7, 'Active', extensions.crypt('Sample@123', extensions.gen_salt('bf'))),
('EMP103', 'Kavya Iyer',    'kavya.iyer@example.com',    '9000000103', 'Sales',      'Employee', 'Sales Executive',   26000, '2025-07-15', 'Amit Desai', 7, 'Active', extensions.crypt('Sample@123', extensions.gen_salt('bf'))),
('EMP104', 'Arjun Nair',    'arjun.nair@example.com',    '9000000104', 'Sales',      'Employee', 'Senior Sales Executive', 32000, '2024-11-04', 'Amit Desai', 1, 'Active', extensions.crypt('Sample@123', extensions.gen_salt('bf'))),
('EMP105', 'Priya Kulkarni','priya.kulkarni@example.com','9000000105', 'Tech',       'Employee', 'Web Developer',     30000, '2025-01-20', 'Amit Desai', 7, 'Active', extensions.crypt('Sample@123', extensions.gen_salt('bf'))),
('EMP106', 'Vikram Joshi',  'vikram.joshi@example.com',  '9000000106', 'Sales',      'Employee', 'Sales Executive',   25000, '2026-02-02', 'Amit Desai', 7, 'Active', extensions.crypt('Sample@123', extensions.gen_salt('bf'))),
('EMP107', 'Sneha Rao',     'sneha.rao@example.com',     '9000000107', 'Sales',      'Employee', 'Sales Executive',   24000, '2026-05-11', 'Amit Desai', 7, 'Active', extensions.crypt('Sample@123', extensions.gen_salt('bf')));

-- Projects (Sole Selling)
insert into projects (id, name, status) values
('11111111-1111-1111-1111-111111111111', 'Green Valley Residency', 'Active'),
('22222222-2222-2222-2222-222222222222', 'Skyline Heights', 'Active'),
('33333333-3333-3333-3333-333333333333', 'Lakeview Enclave', 'Closed');
insert into employee_projects values
('EMP101', '11111111-1111-1111-1111-111111111111'), ('EMP103', '11111111-1111-1111-1111-111111111111'),
('EMP104', '22222222-2222-2222-2222-222222222222'), ('EMP106', '22222222-2222-2222-2222-222222222222');

-- Daily reports, 1–24 Oct (not Sundays), Normal for every Sales person, Sole Selling for project people.
insert into sales_reports (employee_id, report_date, report_type, project_id, leads, calls, positive, scheduled, done, tokens, walk_in, submitted_at, submitted_by)
select e.id, d::date, 'Normal', null,
       8 + (extract(day from d)::int * 3 + length(e.id)) % 9, 25 + (extract(day from d)::int * 7) % 20, 3 + extract(day from d)::int % 5,
       extract(day from d)::int % 3, (extract(day from d)::int + 1) % 2, case when extract(day from d)::int % 9 = 0 then 1 else 0 end, 0,
       (d::date + time '18:40') at time zone 'Asia/Kolkata', e.id
from employees e, generate_series(date '2026-10-01', date '2026-10-24', interval '1 day') d
where e.department = 'Sales' and extract(isodow from d) <> e.week_off and not (e.id = 'EMP101' and d::date = '2026-10-09');
insert into sales_reports (employee_id, report_date, report_type, project_id, leads, calls, positive, scheduled, done, tokens, walk_in, submitted_at, submitted_by)
select ep.employee_id, d::date, 'Sole Selling', ep.project_id,
       5 + extract(day from d)::int % 6, 18 + (extract(day from d)::int * 5) % 15, 2 + extract(day from d)::int % 4,
       extract(day from d)::int % 2, extract(day from d)::int % 2, 0, extract(day from d)::int % 3,
       (d::date + time '19:05') at time zone 'Asia/Kolkata', ep.employee_id
from employee_projects ep, generate_series(date '2026-10-01', date '2026-10-24', interval '1 day') d
where extract(isodow from d) <> 7 and not (ep.employee_id = 'EMP101' and d::date = '2026-10-09');
-- Today (26 Oct): two colleagues have already filed.
insert into sales_reports (employee_id, report_date, report_type, leads, calls, positive, scheduled, done, submitted_at, submitted_by) values
('EMP103', '2026-10-26', 'Normal', 12, 34, 5, 1, 1, now() - interval '40 minutes', 'EMP103'),
('EMP106', '2026-10-26', 'Normal', 9, 28, 4, 0, 1, now() - interval '25 minutes', 'EMP106');

-- Rohan's 24 Oct report was edited once (for the History screen).
insert into report_changes (report_id, changed_by, changed_at, field, old_value, new_value)
select id, 'EMP101', submitted_at + interval '50 minutes', 'Calls', (calls - 4)::text, calls::text from sales_reports
where employee_id = 'EMP101' and report_date = '2026-10-24' and report_type = 'Normal';
insert into report_changes (report_id, changed_by, changed_at, field, old_value, new_value)
select id, 'EMP101', submitted_at + interval '52 minutes', 'Leads', (leads - 2)::text, leads::text from sales_reports
where employee_id = 'EMP101' and report_date = '2026-10-24' and report_type = 'Normal';
update sales_reports set updated_at = submitted_at + interval '52 minutes', updated_by = 'EMP101'
where employee_id = 'EMP101' and report_date = '2026-10-24' and report_type = 'Normal';

-- Rohan's site visits: two due today, one later this week.
insert into site_visits (employee_id, report_type, client_name, booked_on, booked_report_id, visit_date)
select 'EMP101', 'Normal', c.name, '2026-10-22', (select id from sales_reports where employee_id = 'EMP101' and report_date = '2026-10-22' and report_type = 'Normal'), c.d
from (values ('Mr. Kapoor', date '2026-10-26'), ('Mrs. Bhatt', date '2026-10-26'), ('Mr. Sinha', date '2026-10-29')) c(name, d);
insert into site_visits (employee_id, report_type, project_id, client_name, booked_on, visit_date)
values ('EMP101', 'Sole Selling', '11111111-1111-1111-1111-111111111111', 'Ms. Fernandes', '2026-10-23', '2026-10-27');

-- Leave
insert into leave_applications (employee_id, kind, start_date, end_date, reason, status, decided_by, decided_at, created_at) values
('EMP101', 'Leave', '2026-10-09', '2026-10-09', 'Family function', 'Approved', 'EMP102', '2026-10-05 10:00+05:30', '2026-10-04 18:00+05:30'),
('EMP104', 'Leave', '2026-10-26', '2026-10-26', 'Not feeling well', 'Approved', 'EMP102', '2026-10-25 20:00+05:30', '2026-10-25 19:30+05:30'),
('EMP103', 'Leave', '2026-11-05', '2026-11-06', 'Going to my hometown for Diwali', 'Pending', null, null, '2026-10-24 17:15+05:30'),
('EMP107', 'Leave', '2026-11-02', '2026-11-02', 'Doctor appointment', 'Pending', null, null, '2026-10-25 11:20+05:30'),
('EMP102', 'Leave', '2026-11-09', '2026-11-10', 'Sister''s wedding', 'Pending', null, null, '2026-10-23 16:45+05:30');
insert into leave_history (application_id, employee_id, actor_id, action, details, at)
select id, employee_id, employee_id, 'Applied', null, created_at from leave_applications;
insert into leave_history (application_id, employee_id, actor_id, action, details, at)
select id, employee_id, decided_by, 'Approved', null, decided_at from leave_applications where status = 'Approved';

-- Attendance: 1–24 Oct from one eTimeOffice upload by Neha.
insert into attendance_uploads (id, kind, file_name, uploaded_by, uploaded_at, rows_in, added, updated, kept, from_date, to_date)
values ('44444444-4444-4444-4444-444444444444', 'etimeoffice', 'MonthInOut_Oct_1-24.xls', 'EMP102', '2026-10-25 11:05+05:30', 192, 192, 0, 0, '2026-10-01', '2026-10-24');
insert into attendance_days (employee_id, work_date, in_time, out_time, status_set, source, upload_id, created_at)
select e.id, d::date,
       case when extract(isodow from d) = e.week_off or (e.id = 'EMP101' and d::date = '2026-10-09') then null
            when (e.id = 'EMP101' and extract(day from d) in (6, 14, 20)) or (e.id = 'EMP106' and extract(day from d) in (7, 13)) then time '10:42'
            else time '09:50' + make_interval(mins => (extract(day from d)::int * 7 + length(e.name)) % 30) end,
       case when extract(isodow from d) = e.week_off or (e.id = 'EMP101' and d::date = '2026-10-09') then null
            when e.id = 'EMP101' and extract(day from d) = 16 then time '16:10'
            when e.id = 'EMP107' and extract(day from d) = 12 then null
            else time '18:45' + make_interval(mins => (extract(day from d)::int * 5) % 40) end,
       case when e.id = 'EMP101' and d::date = '2026-10-09' then 'Paid Leave'
            when e.id = 'EMP107' and extract(day from d) = 12 then 'Absent' end,
       'etimeoffice', '44444444-4444-4444-4444-444444444444', '2026-10-25 11:05+05:30'
from employees e, generate_series(date '2026-10-01', date '2026-10-24', interval '1 day') d
where e.role <> 'Admin';
-- "Updated – please check": everyone after the upload; most have checked already, Rohan hasn't.
insert into attendance_checks (employee_id, month, updated_at, checked_at)
select id, '2026-10-01', '2026-10-25 11:05+05:30',
       case when id in ('EMP101', 'EMP106', 'EMP107') then null else '2026-10-25 15:00+05:30'::timestamptz end
from employees where role <> 'Admin';

-- 10 PM email
insert into app_settings (key, value) values ('report_email_recipients', '["amit.desai@example.com", "reports@example.com"]')
on conflict (key) do update set value = excluded.value;
insert into app_settings (key, value) values ('report_email_time', '"22:00"') on conflict (key) do update set value = excluded.value;
