export const specialLeaveFullDurationSql = `CREATE TRIGGER leave_special_full_duration_insert BEFORE INSERT ON leave_records
WHEN (NEW.leave_type='veteran_special_leave' AND (NEW.used_days!=14 OR julianday(NEW.end_date)-julianday(NEW.start_date)+1!=14))
  OR (NEW.leave_type='chernobyl_special_leave' AND (NEW.used_days!=16 OR julianday(NEW.end_date)-julianday(NEW.start_date)+1!=16))
BEGIN SELECT RAISE(ABORT,'invalid special leave duration'); END;
CREATE TRIGGER leave_special_full_duration_update BEFORE UPDATE OF leave_type,start_date,end_date,used_days,status ON leave_records
WHEN ((NEW.leave_type='veteran_special_leave' AND (NEW.used_days!=14 OR julianday(NEW.end_date)-julianday(NEW.start_date)+1!=14))
  OR (NEW.leave_type='chernobyl_special_leave' AND (NEW.used_days!=16 OR julianday(NEW.end_date)-julianday(NEW.start_date)+1!=16)))
  AND NOT (OLD.status='active' AND NEW.status IN ('active','cancelled') AND OLD.leave_type=NEW.leave_type AND OLD.start_date=NEW.start_date
    AND OLD.end_date=NEW.end_date AND OLD.used_days=NEW.used_days)
BEGIN SELECT RAISE(ABORT,'invalid special leave duration'); END;`
