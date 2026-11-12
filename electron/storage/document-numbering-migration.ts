export const documentNumberingSql = `
CREATE TABLE personnel_document_series (
 id TEXT PRIMARY KEY CHECK(length(id)=36),
 kind TEXT NOT NULL CHECK(kind IN ('head_order','employer_order','executive_decision','council_decision','other')),
 code TEXT NOT NULL CHECK(length(code) BETWEEN 1 AND 40),
 code_key TEXT NOT NULL CHECK(length(code_key) BETWEEN 1 AND 40),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 pattern TEXT NOT NULL CHECK(length(pattern) BETWEEN 3 AND 60 AND length(pattern)-length(replace(pattern,'{N}',''))=3 AND length(pattern)-length(replace(pattern,'{YYYY}','')) IN (0,6) AND instr(replace(replace(pattern,'{N}',''),'{YYYY}',''),'{')=0 AND instr(replace(replace(pattern,'{N}',''),'{YYYY}',''),'}')=0),
 min_digits INTEGER NOT NULL CHECK(min_digits BETWEEN 1 AND 9),
 start_at INTEGER NOT NULL CHECK(start_at BETWEEN 1 AND 999999999),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
 created_at TEXT NOT NULL CHECK(length(created_at)=24 AND created_at GLOB '????-??-??T??:??:??.???Z' AND datetime(created_at) IS NOT NULL),
 updated_at TEXT NOT NULL CHECK(length(updated_at)=24 AND updated_at GLOB '????-??-??T??:??:??.???Z' AND datetime(updated_at) IS NOT NULL),
 UNIQUE(kind,code_key)
) STRICT;
ALTER TABLE personnel_documents ADD COLUMN series_id TEXT REFERENCES personnel_document_series(id) ON DELETE RESTRICT;
DROP INDEX personnel_documents_number;
CREATE UNIQUE INDEX personnel_documents_number ON personnel_documents(kind,substr(issued_on,1,4),number_key) WHERE series_id IS NULL;
CREATE UNIQUE INDEX personnel_documents_series_number ON personnel_documents(series_id,substr(issued_on,1,4),number_key) WHERE series_id IS NOT NULL;
CREATE TABLE personnel_document_number_claims (
 series_id TEXT NOT NULL REFERENCES personnel_document_series(id) ON DELETE RESTRICT,
 calendar_year INTEGER NOT NULL CHECK(calendar_year BETWEEN 1 AND 9999),
 ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 999999999),
 number_key TEXT NOT NULL CHECK(length(number_key) BETWEEN 1 AND 80),
 document_id TEXT UNIQUE REFERENCES personnel_documents(id) ON DELETE SET NULL,
 assigned_at TEXT NOT NULL CHECK(length(assigned_at)=24 AND assigned_at GLOB '????-??-??T??:??:??.???Z' AND datetime(assigned_at) IS NOT NULL),
 PRIMARY KEY(series_id,calendar_year,ordinal),
 UNIQUE(series_id,calendar_year,number_key)
) STRICT;
`
