// Published migration 14. Keep immutable after publication.
export const serviceBaselineSql = `CREATE TABLE employee_service_baselines (
 employee_id TEXT PRIMARY KEY NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
 years INTEGER NOT NULL CHECK(years BETWEEN 0 AND 9007199254740991),
 months INTEGER NOT NULL CHECK(months BETWEEN 0 AND 11),
 days INTEGER NOT NULL CHECK(days BETWEEN 0 AND 30),
 as_of_date TEXT NOT NULL CHECK(length(as_of_date)=10 AND as_of_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(as_of_date,1,4)!='0000' AND coalesce(date(as_of_date,'+0 days')=as_of_date,0)),
 basis_note TEXT CHECK(basis_note IS NULL OR length(trim(basis_note)) BETWEEN 1 AND 2000),
 confirmed_at TEXT NOT NULL CHECK(length(confirmed_at)=24 AND confirmed_at GLOB '????-??-??T??:??:??.???Z' AND julianday(confirmed_at) IS NOT NULL)
) STRICT;
CREATE TRIGGER service_baseline_insert BEFORE INSERT ON employee_service_baselines
WHEN NEW.as_of_date>date('now','localtime')
BEGIN SELECT RAISE(ABORT,'future baseline date'); END;
CREATE TRIGGER service_baseline_update BEFORE UPDATE ON employee_service_baselines
WHEN NEW.as_of_date>date('now','localtime')
BEGIN SELECT RAISE(ABORT,'future baseline date'); END;`
