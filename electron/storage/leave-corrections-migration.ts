export const leaveCorrectionsSql = `ALTER TABLE leave_records ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991);
ALTER TABLE leave_records ADD COLUMN cancelled_at TEXT;
ALTER TABLE leave_records ADD COLUMN cancel_reason TEXT CHECK(cancel_reason IS NULL OR length(trim(cancel_reason)) BETWEEN 1 AND 1000);
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
CREATE TRIGGER leave_allocation_no_update BEFORE UPDATE ON leave_allocations
BEGIN SELECT RAISE(ABORT,'replace allocations atomically'); END;`
