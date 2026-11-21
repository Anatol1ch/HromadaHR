// Version 24 removes retired rank fields while preserving each current rank and its origin.
export const rankEditorRefinementSql = `
DROP TRIGGER IF EXISTS employee_current_ranks_insert;
DROP TRIGGER IF EXISTS employee_current_ranks_update;
DROP TRIGGER IF EXISTS employee_rank_type_guard;
CREATE TABLE employee_current_ranks_new (
 employee_id TEXT PRIMARY KEY NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
 rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 15),
 assigned_on TEXT NOT NULL CHECK (length(assigned_on)=10 AND assigned_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(assigned_on,1,4)!='0000' AND coalesce(date(assigned_on, '+0 days')=assigned_on,0)),
 document_type TEXT CHECK(document_type IS NULL OR length(trim(document_type)) BETWEEN 1 AND 200),
 document_number TEXT CHECK(document_number IS NULL OR length(trim(document_number)) BETWEEN 1 AND 100),
 document_date TEXT CHECK (document_date IS NULL OR (length(document_date)=10 AND document_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(document_date,1,4)!='0000' AND coalesce(date(document_date, '+0 days')=document_date,0))),
 confirmed_at TEXT NOT NULL CHECK(length(confirmed_at)=24 AND confirmed_at GLOB '????-??-??T??:??:??.???Z' AND julianday(confirmed_at) IS NOT NULL),
 origin TEXT NOT NULL CHECK(origin IN ('oms_assigned','oms_retained','civil_service_equivalence','unknown','oms_early','pension_exception','other')),
 review_anchor_on TEXT CHECK(review_anchor_on IS NULL OR (length(review_anchor_on)=10 AND review_anchor_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(review_anchor_on,1,4)!='0000' AND coalesce(date(review_anchor_on,'+0 days')=review_anchor_on,0)))
) STRICT;
INSERT INTO employee_current_ranks_new(employee_id,rank,assigned_on,document_type,document_number,document_date,confirmed_at,origin,review_anchor_on)
 SELECT employee_id,rank,assigned_on,document_type,document_number,document_date,confirmed_at,origin,review_anchor_on FROM employee_current_ranks;
DROP TABLE employee_current_ranks;
ALTER TABLE employee_current_ranks_new RENAME TO employee_current_ranks;
CREATE TRIGGER employee_current_ranks_insert BEFORE INSERT ON employee_current_ranks
WHEN NEW.assigned_on>date('now','localtime') OR NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee_id AND employee_type='official')
BEGIN SELECT RAISE(ABORT,'invalid current personnel indicator'); END;
CREATE TRIGGER employee_current_ranks_update BEFORE UPDATE ON employee_current_ranks
WHEN NEW.assigned_on>date('now','localtime') OR NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee_id AND employee_type='official')
BEGIN SELECT RAISE(ABORT,'invalid current personnel indicator'); END;
CREATE TRIGGER employee_rank_type_guard BEFORE UPDATE OF employee_type ON employees
WHEN NEW.employee_type='staff' AND EXISTS(SELECT 1 FROM employee_current_ranks WHERE employee_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'clear current rank before changing employee type'); END;
`
