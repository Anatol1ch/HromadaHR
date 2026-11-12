export const documentsSql = `
CREATE TABLE personnel_documents (
 id TEXT PRIMARY KEY CHECK(length(id)=36),
 kind TEXT NOT NULL CHECK(kind IN ('head_order','employer_order','executive_decision','council_decision','other')),
 custom_kind TEXT CHECK(custom_kind IS NULL OR length(trim(custom_kind)) BETWEEN 1 AND 120),
 number TEXT NOT NULL CHECK(length(trim(number)) BETWEEN 1 AND 80),
 number_key TEXT NOT NULL CHECK(length(number_key) BETWEEN 1 AND 80),
 issued_on TEXT NOT NULL CHECK(length(issued_on)=10 AND issued_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(issued_on,1,4)!='0000' AND coalesce(date(issued_on,'+0 days')=issued_on,0)),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 500),
 note TEXT CHECK(note IS NULL OR length(trim(note)) BETWEEN 1 AND 2000),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE CHECK(length(request_id)=36),
 request_fingerprint TEXT NOT NULL CHECK(length(request_fingerprint)=64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'),
 CHECK((kind='other' AND custom_kind IS NOT NULL) OR (kind!='other' AND custom_kind IS NULL))
) STRICT;
CREATE UNIQUE INDEX personnel_documents_number ON personnel_documents(kind,substr(issued_on,1,4),number_key);
CREATE TABLE personnel_document_employees (
 document_id TEXT NOT NULL REFERENCES personnel_documents(id) ON DELETE CASCADE,
 employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 PRIMARY KEY(document_id,employee_id)
) STRICT;
CREATE INDEX personnel_document_employees_employee ON personnel_document_employees(employee_id);
`
