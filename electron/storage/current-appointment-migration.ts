// Published migration 16. Keep immutable after publication.
export const currentAppointmentSql = `ALTER TABLE employees ADD COLUMN position_started_on TEXT CHECK(position_started_on IS NULL OR
 (length(position_started_on)=10 AND position_started_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(position_started_on,1,4)!='0000'
 AND coalesce(date(position_started_on,'+0 days')=position_started_on,0) AND position_started_on>=hire_date));
ALTER TABLE employees ADD COLUMN position_category TEXT CHECK(position_category IS NULL OR (employee_type='official' AND position_category IN ('I','II','III','IV','V','VI','VII')));
CREATE TRIGGER current_appointment_insert BEFORE INSERT ON employees
WHEN NEW.position_started_on>date('now','localtime')
BEGIN SELECT RAISE(ABORT,'future appointment'); END;
CREATE TRIGGER current_appointment_update BEFORE UPDATE ON employees
WHEN NEW.position_started_on>date('now','localtime')
BEGIN SELECT RAISE(ABORT,'future appointment'); END;`
