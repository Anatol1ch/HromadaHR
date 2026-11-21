// Version 23 removes the manually maintained allowance review date only.
export const allowanceReviewRemovalSql = `CREATE TABLE employee_seniority_allowances_new (
 employee_id TEXT PRIMARY KEY NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('confirmed','not_applicable')),
 percentage INTEGER CHECK(percentage IN (0,10,15,20,25,30,40)),
 effective_on TEXT CHECK (effective_on IS NULL OR (length(effective_on)=10 AND effective_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(effective_on,1,4)!='0000' AND coalesce(date(effective_on, '+0 days')=effective_on,0))),
 document_type TEXT CHECK(document_type IS NULL OR length(trim(document_type)) BETWEEN 1 AND 200),
 document_number TEXT CHECK(document_number IS NULL OR length(trim(document_number)) BETWEEN 1 AND 100),
 document_date TEXT CHECK (document_date IS NULL OR (length(document_date)=10 AND document_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(document_date,1,4)!='0000' AND coalesce(date(document_date, '+0 days')=document_date,0))),
 confirmed_at TEXT NOT NULL CHECK(length(confirmed_at)=24 AND confirmed_at GLOB '????-??-??T??:??:??.???Z' AND julianday(confirmed_at) IS NOT NULL),
 CHECK((status='confirmed' AND percentage IS NOT NULL AND effective_on IS NOT NULL) OR (status='not_applicable' AND percentage IS NULL AND effective_on IS NULL))
) STRICT;
INSERT INTO employee_seniority_allowances_new(employee_id,status,percentage,effective_on,document_type,document_number,document_date,confirmed_at)
 SELECT employee_id,status,percentage,effective_on,document_type,document_number,document_date,confirmed_at FROM employee_seniority_allowances;
DROP TABLE employee_seniority_allowances;
ALTER TABLE employee_seniority_allowances_new RENAME TO employee_seniority_allowances;
CREATE TRIGGER employee_seniority_allowances_insert BEFORE INSERT ON employee_seniority_allowances
WHEN NEW.effective_on>date('now','localtime')
BEGIN SELECT RAISE(ABORT,'invalid current personnel indicator'); END;
CREATE TRIGGER employee_seniority_allowances_update BEFORE UPDATE ON employee_seniority_allowances
WHEN NEW.effective_on>date('now','localtime')
BEGIN SELECT RAISE(ABORT,'invalid current personnel indicator'); END;`
