// SQLite v22 replaces the legacy baseline with one typed accounting record and zero or more periods.
// Legacy auto-accruing snapshots are unambiguous; frozen snapshots are removed for re-entry.
export const serviceAccountingSql = `
CREATE TABLE employee_service_records (
 employee_id TEXT PRIMARY KEY NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
 mode TEXT NOT NULL CHECK(mode IN ('continuous','periods','snapshot')),
 start_date TEXT CHECK(start_date IS NULL OR (length(start_date)=10 AND start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(start_date,1,4)!='0000' AND coalesce(date(start_date,'+0 days')=start_date,0))),
 years INTEGER CHECK(years IS NULL OR years BETWEEN 0 AND 9007199254740991),
 months INTEGER CHECK(months IS NULL OR months BETWEEN 0 AND 11),
 days INTEGER CHECK(days IS NULL OR days BETWEEN 0 AND 30),
 as_of_date TEXT CHECK(as_of_date IS NULL OR (length(as_of_date)=10 AND as_of_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(as_of_date,1,4)!='0000' AND coalesce(date(as_of_date,'+0 days')=as_of_date,0))),
 confirmed_at TEXT NOT NULL CHECK(length(confirmed_at)=24 AND confirmed_at GLOB '????-??-??T??:??:??.???Z' AND julianday(confirmed_at) IS NOT NULL),
 CHECK((mode='continuous' AND start_date IS NOT NULL AND years IS NULL AND months IS NULL AND days IS NULL AND as_of_date IS NULL) OR
       (mode='periods' AND start_date IS NULL AND years IS NULL AND months IS NULL AND days IS NULL AND as_of_date IS NULL) OR
       (mode='snapshot' AND start_date IS NULL AND years IS NOT NULL AND months IS NOT NULL AND days IS NOT NULL AND as_of_date IS NOT NULL))
) STRICT;
CREATE TABLE employee_service_periods (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 employee_id TEXT NOT NULL REFERENCES employee_service_records(employee_id) ON DELETE CASCADE,
 start_date TEXT NOT NULL CHECK(length(start_date)=10 AND start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(start_date,1,4)!='0000' AND coalesce(date(start_date,'+0 days')=start_date,0)),
 end_date TEXT CHECK(end_date IS NULL OR (length(end_date)=10 AND end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(end_date,1,4)!='0000' AND coalesce(date(end_date,'+0 days')=end_date,0))),
 CHECK(end_date IS NULL OR start_date<=end_date)
) STRICT;
CREATE INDEX employee_service_periods_employee_start ON employee_service_periods(employee_id,start_date,id);
CREATE TRIGGER service_record_dates_insert BEFORE INSERT ON employee_service_records
WHEN (NEW.start_date IS NOT NULL AND NEW.start_date>date('now','localtime')) OR (NEW.as_of_date IS NOT NULL AND NEW.as_of_date>date('now','localtime'))
BEGIN SELECT RAISE(ABORT,'future service record date'); END;
CREATE TRIGGER service_record_dates_update BEFORE UPDATE ON employee_service_records
WHEN (NEW.start_date IS NOT NULL AND NEW.start_date>date('now','localtime')) OR (NEW.as_of_date IS NOT NULL AND NEW.as_of_date>date('now','localtime'))
BEGIN SELECT RAISE(ABORT,'future service record date'); END;
CREATE TRIGGER service_period_validate_insert BEFORE INSERT ON employee_service_periods
WHEN (SELECT mode FROM employee_service_records WHERE employee_id=NEW.employee_id)!='periods' OR NEW.start_date>date('now','localtime') OR (NEW.end_date IS NOT NULL AND NEW.end_date>date('now','localtime')) OR EXISTS (
 SELECT 1 FROM employee_service_periods p WHERE p.employee_id=NEW.employee_id
 AND NEW.start_date<=coalesce(p.end_date,'9999-12-31') AND p.start_date<=coalesce(NEW.end_date,'9999-12-31'))
BEGIN SELECT RAISE(ABORT,'invalid service period'); END;
CREATE TRIGGER service_period_validate_update BEFORE UPDATE ON employee_service_periods
WHEN (SELECT mode FROM employee_service_records WHERE employee_id=NEW.employee_id)!='periods' OR NEW.start_date>date('now','localtime') OR (NEW.end_date IS NOT NULL AND NEW.end_date>date('now','localtime')) OR EXISTS (
 SELECT 1 FROM employee_service_periods p WHERE p.employee_id=NEW.employee_id AND p.id!=OLD.id
 AND NEW.start_date<=coalesce(p.end_date,'9999-12-31') AND p.start_date<=coalesce(NEW.end_date,'9999-12-31'))
BEGIN SELECT RAISE(ABORT,'invalid service period'); END;
INSERT INTO employee_service_records(employee_id,mode,years,months,days,as_of_date,confirmed_at)
 SELECT employee_id,'snapshot',years,months,days,as_of_date,confirmed_at
 FROM employee_service_baselines WHERE auto_accrue_after_baseline=1;
DROP TABLE employee_service_baselines;
`
