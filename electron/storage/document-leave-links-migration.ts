export const documentLeaveLinksSql = `
CREATE TABLE personnel_document_leave_records (
 document_id TEXT NOT NULL REFERENCES personnel_documents(id) ON DELETE RESTRICT,
 leave_record_id TEXT NOT NULL UNIQUE REFERENCES leave_records(id) ON DELETE RESTRICT,
 linked_at TEXT NOT NULL CHECK(length(linked_at)=24 AND linked_at GLOB '????-??-??T??:??:??.???Z' AND datetime(linked_at) IS NOT NULL),
 PRIMARY KEY(document_id,leave_record_id)
) STRICT;
`
