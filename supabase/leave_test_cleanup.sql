-- Removes ONLY the leave test data created while checking the Leave PR:
-- leave requests whose reason starts with "TEST", comp-off claims whose note
-- starts with "TEST", and holidays whose name starts with "TEST".
-- Their history, attachments and day counts go with them. Nothing else is
-- touched. Safe to run more than once.
--
-- Client visits moved by a test request (reschedule / hand over) are NOT put
-- back — the runbook tests on a date without client visits.

begin;

delete from leave_history where application_id is null and claim_id is null and action like 'Holiday%' and details like '%TEST%';

delete from leave_applications where reason like 'TEST%';
delete from comp_off_claims where note like 'TEST%';
delete from holidays where name like 'TEST%';

select
  (select count(*) from leave_applications where reason like 'TEST%') as test_leave_left,
  (select count(*) from comp_off_claims where note like 'TEST%') as test_claims_left,
  (select count(*) from holidays where name like 'TEST%') as test_holidays_left;

commit;
