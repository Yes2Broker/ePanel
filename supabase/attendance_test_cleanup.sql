-- Removes ONLY the attendance test data created while checking the Attendance PR:
--   * attendance days whose remark starts with "TEST" (and their change history),
--   * comp-offs added automatically for those days (and their leave history),
--   * upload log rows whose file name starts with "TEST",
--   * code mappings created by those test uploads (codes starting with "TEST").
-- Nothing else is touched. Safe to run more than once.

begin;

-- Comp-offs the panel added automatically because a TEST day was worked on a
-- weekly off (only if no leave uses them).
delete from comp_off_claims c
using attendance_days a
where a.remark like 'TEST%'
  and c.employee_id = a.employee_id and c.worked_date = a.work_date
  and c.decision_note like 'Automatic:%'
  and not exists (select 1 from leave_applications l where l.comp_off_id = c.id);

delete from attendance_changes ch
using attendance_days a
where a.remark like 'TEST%' and ch.employee_id = a.employee_id and ch.work_date = a.work_date;

delete from attendance_days where remark like 'TEST%';
delete from attendance_uploads where file_name like 'TEST%';
delete from attendance_code_map where machine_code like 'TEST%';

select
  (select count(*) from attendance_days where remark like 'TEST%') as test_days_left,
  (select count(*) from attendance_uploads where file_name like 'TEST%') as test_uploads_left;

commit;
