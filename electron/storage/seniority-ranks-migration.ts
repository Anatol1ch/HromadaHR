// Published migration 13. Keep this SQL immutable.
export const seniorityRanksSql = `CREATE TABLE employee_seniority_allowances (
 employee_id TEXT PRIMARY KEY NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('confirmed','not_applicable')),
 percentage INTEGER CHECK(percentage IN (0,10,15,20,25,30,40)),
 effective_on TEXT CHECK (effective_on IS NULL OR (length(effective_on)=10 AND effective_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(effective_on,1,4)!='0000' AND coalesce(date(effective_on, '+0 days')=effective_on,0))),
 document_type TEXT CHECK(document_type IS NULL OR length(trim(document_type)) BETWEEN 1 AND 200),
 document_number TEXT CHECK(document_number IS NULL OR length(trim(document_number)) BETWEEN 1 AND 100),
 document_date TEXT CHECK (document_date IS NULL OR (length(document_date)=10 AND document_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(document_date,1,4)!='0000' AND coalesce(date(document_date, '+0 days')=document_date,0))),
 review_on TEXT CHECK (review_on IS NULL OR (length(review_on)=10 AND review_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(review_on,1,4)!='0000' AND coalesce(date(review_on, '+0 days')=review_on,0))),
 confirmed_at TEXT NOT NULL CHECK(length(confirmed_at)=24 AND confirmed_at GLOB '????-??-??T??:??:??.???Z' AND julianday(confirmed_at) IS NOT NULL),
 CHECK((status='confirmed' AND percentage IS NOT NULL AND effective_on IS NOT NULL) OR (status='not_applicable' AND percentage IS NULL AND effective_on IS NULL))
) STRICT;
CREATE TABLE employee_current_ranks (
 employee_id TEXT PRIMARY KEY NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
 rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 15),
 assigned_on TEXT CHECK (assigned_on IS NULL OR (length(assigned_on)=10 AND assigned_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(assigned_on,1,4)!='0000' AND coalesce(date(assigned_on, '+0 days')=assigned_on,0))),
 effective_on TEXT CHECK (effective_on IS NULL OR (length(effective_on)=10 AND effective_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(effective_on,1,4)!='0000' AND coalesce(date(effective_on, '+0 days')=effective_on,0))),
 document_type TEXT CHECK(document_type IS NULL OR length(trim(document_type)) BETWEEN 1 AND 200),
 document_number TEXT CHECK(document_number IS NULL OR length(trim(document_number)) BETWEEN 1 AND 100),
 document_date TEXT CHECK (document_date IS NULL OR (length(document_date)=10 AND document_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(document_date,1,4)!='0000' AND coalesce(date(document_date, '+0 days')=document_date,0))),
 review_on TEXT CHECK (review_on IS NULL OR (length(review_on)=10 AND review_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(review_on,1,4)!='0000' AND coalesce(date(review_on, '+0 days')=review_on,0))),
 confirmed_at TEXT NOT NULL CHECK(length(confirmed_at)=24 AND confirmed_at GLOB '????-??-??T??:??:??.???Z' AND julianday(confirmed_at) IS NOT NULL),
 CHECK(assigned_on IS NOT NULL)
) STRICT;
CREATE TRIGGER employee_seniority_allowances_insert BEFORE INSERT ON employee_seniority_allowances
WHEN NEW.effective_on>date('now','localtime')
BEGIN SELECT RAISE(ABORT,'invalid current personnel indicator'); END;
CREATE TRIGGER employee_seniority_allowances_update BEFORE UPDATE ON employee_seniority_allowances
WHEN NEW.effective_on>date('now','localtime')
BEGIN SELECT RAISE(ABORT,'invalid current personnel indicator'); END;
CREATE TRIGGER employee_current_ranks_insert BEFORE INSERT ON employee_current_ranks
WHEN NEW.effective_on>date('now','localtime') OR NEW.assigned_on>date('now','localtime') OR NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee_id AND employee_type='official')
BEGIN SELECT RAISE(ABORT,'invalid current personnel indicator'); END;
CREATE TRIGGER employee_current_ranks_update BEFORE UPDATE ON employee_current_ranks
WHEN NEW.effective_on>date('now','localtime') OR NEW.assigned_on>date('now','localtime') OR NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee_id AND employee_type='official')
BEGIN SELECT RAISE(ABORT,'invalid current personnel indicator'); END;
CREATE TRIGGER employee_rank_type_guard BEFORE UPDATE OF employee_type ON employees
WHEN NEW.employee_type='staff' AND EXISTS(SELECT 1 FROM employee_current_ranks WHERE employee_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'clear current rank before changing employee type'); END;`
