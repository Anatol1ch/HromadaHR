// Published as migration 9. Keep static SQL immutable after publication.
export const specialLeavesSql = `-- Rebuild both FK-linked tables with foreign_keys enabled throughout.
DROP TRIGGER leave_employee_delete;
DROP TRIGGER leave_period_protect_update;
CREATE TABLE leave_records_v9 (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  request_id TEXT NOT NULL UNIQUE CHECK(length(request_id)=36),
  request_json TEXT NOT NULL,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK(leave_type IN ('annual_main','oms_service_additional','children_social_additional','study_leave','veteran_special_leave','chernobyl_special_leave')),
  start_date TEXT NOT NULL CHECK(length(start_date)=10 AND start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(start_date,1,4)!='0000' AND coalesce(date(start_date, '+0 days')=start_date,0)),
  end_date TEXT NOT NULL CHECK(length(end_date)=10 AND end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(end_date,1,4)!='0000' AND coalesce(date(end_date, '+0 days')=end_date,0)),
  used_days INTEGER NOT NULL CHECK(used_days>0),
  order_number TEXT CHECK(order_number IS NULL OR length(trim(order_number)) BETWEEN 1 AND 100),
  order_date TEXT CHECK(order_date IS NULL OR (length(order_date)=10 AND order_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(order_date,1,4)!='0000' AND coalesce(date(order_date, '+0 days')=order_date,0))),
  duration_explanation TEXT CHECK(duration_explanation IS NULL OR length(trim(duration_explanation)) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
  created_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
  cancelled_at TEXT,
  cancel_reason TEXT CHECK(cancel_reason IS NULL OR length(trim(cancel_reason)) BETWEEN 1 AND 1000),
  grant_basis TEXT CHECK(grant_basis IS NULL OR length(trim(grant_basis)) BETWEEN 1 AND 1000),
  CHECK(leave_type IN ('annual_main','oms_service_additional','children_social_additional') OR grant_basis IS NOT NULL),
  CHECK(leave_type!='veteran_special_leave' OR (used_days<=14 AND (used_days=14 OR duration_explanation IS NOT NULL))),
  CHECK(leave_type!='chernobyl_special_leave' OR (used_days<=16 AND (used_days=16 OR duration_explanation IS NOT NULL))),
  CHECK(start_date>='2027-01-01' AND end_date>=start_date),
  CHECK(used_days<=CAST(julianday(end_date)-julianday(start_date)+1 AS INTEGER)),
  CHECK(used_days=CAST(julianday(end_date)-julianday(start_date)+1 AS INTEGER) OR duration_explanation IS NOT NULL)
) STRICT;
CREATE TABLE leave_allocations_v9 (
  record_id TEXT NOT NULL REFERENCES leave_records_v9(id) ON DELETE CASCADE,
  period_id TEXT NOT NULL REFERENCES leave_period_balances(id) ON DELETE RESTRICT,
  days INTEGER NOT NULL CHECK(days>0),
  PRIMARY KEY(record_id,period_id)
) STRICT;

INSERT INTO leave_records_v9(id,request_id,request_json,employee_id,leave_type,start_date,end_date,used_days,order_number,order_date,duration_explanation,status,created_at,revision,cancelled_at,cancel_reason)
SELECT id,request_id,request_json,employee_id,leave_type,start_date,end_date,used_days,order_number,order_date,duration_explanation,status,created_at,revision,cancelled_at,cancel_reason FROM leave_records;
INSERT INTO leave_allocations_v9 SELECT record_id,period_id,days FROM leave_allocations;
DROP TABLE leave_allocations;
DROP TABLE leave_records;
ALTER TABLE leave_records_v9 RENAME TO leave_records;
ALTER TABLE leave_allocations_v9 RENAME TO leave_allocations;
CREATE INDEX leave_records_employee_dates ON leave_records(employee_id,start_date,end_date);
CREATE INDEX leave_allocations_period ON leave_allocations(period_id);
CREATE UNIQUE INDEX leave_records_special_year ON leave_records(employee_id,leave_type,substr(start_date,1,4))
WHERE status='active' AND leave_type IN ('veteran_special_leave','chernobyl_special_leave');
CREATE TRIGGER leave_employee_delete BEFORE DELETE ON employees BEGIN
  DELETE FROM leave_records WHERE employee_id=OLD.id;
END;
CREATE TRIGGER leave_record_no_overlap BEFORE INSERT ON leave_records
WHEN NEW.status='active' AND EXISTS(
  SELECT 1 FROM leave_records r WHERE r.employee_id=NEW.employee_id AND r.status='active'
  AND r.start_date<=NEW.end_date AND NEW.start_date<=r.end_date)
BEGIN SELECT RAISE(ABORT,'leave overlap'); END;
CREATE TRIGGER leave_allocation_insert BEFORE INSERT ON leave_allocations
WHEN NOT EXISTS(
  SELECT 1 FROM leave_period_balances p JOIN leave_records r ON r.id=NEW.record_id
  WHERE p.id=NEW.period_id AND p.employee_id=r.employee_id AND p.leave_type=r.leave_type
  AND r.status='active' AND p.confirmed_days>=NEW.days+coalesce((
    SELECT sum(a.days) FROM leave_allocations a JOIN leave_records used ON used.id=a.record_id
    WHERE a.period_id=p.id AND used.status='active'),0))
BEGIN SELECT RAISE(ABORT,'invalid leave allocation'); END;
CREATE TRIGGER leave_period_protect_update BEFORE UPDATE ON leave_period_balances
WHEN EXISTS(SELECT 1 FROM leave_allocations a WHERE a.period_id=OLD.id) AND (
  NEW.employee_id!=OLD.employee_id OR NEW.leave_type!=OLD.leave_type OR
  NEW.period_start!=OLD.period_start OR NEW.period_end!=OLD.period_end OR
  NEW.accounting_basis!=OLD.accounting_basis OR NEW.confirmed_days<coalesce((
    SELECT sum(a.days) FROM leave_allocations a JOIN leave_records r ON r.id=a.record_id
    WHERE a.period_id=OLD.id AND r.status='active'),0))
BEGIN SELECT RAISE(ABORT,'used leave period'); END;
CREATE TRIGGER leave_record_no_overlap_update BEFORE UPDATE ON leave_records
WHEN NEW.status='active' AND EXISTS(
  SELECT 1 FROM leave_records r WHERE r.id!=OLD.id AND r.employee_id=NEW.employee_id AND r.status='active'
  AND r.start_date<=NEW.end_date AND NEW.start_date<=r.end_date)
BEGIN SELECT RAISE(ABORT,'leave overlap'); END;
CREATE TRIGGER leave_record_identity_update BEFORE UPDATE ON leave_records
WHEN NEW.id!=OLD.id OR NEW.employee_id!=OLD.employee_id OR NEW.request_id!=OLD.request_id
  OR NEW.request_json!=OLD.request_json OR NEW.created_at!=OLD.created_at
  OR (OLD.status='cancelled' AND NEW.status!='cancelled')
BEGIN SELECT RAISE(ABORT,'immutable leave identity'); END;
CREATE TRIGGER leave_record_allocation_mode_update BEFORE UPDATE OF leave_type ON leave_records
WHEN EXISTS(SELECT 1 FROM leave_allocations a JOIN leave_period_balances p ON p.id=a.period_id
  WHERE a.record_id=OLD.id AND p.leave_type!=NEW.leave_type)
BEGIN SELECT RAISE(ABORT,'replace allocations before changing leave type'); END;
CREATE TRIGGER leave_allocation_no_update BEFORE UPDATE ON leave_allocations
BEGIN SELECT RAISE(ABORT,'replace allocations atomically'); END;`
