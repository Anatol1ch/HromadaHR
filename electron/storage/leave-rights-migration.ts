export const leaveRightsSql = `CREATE TABLE employee_leave_rights (
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK(leave_type IN ('annual_main','oms_service_additional','children_social_additional','study_leave','veteran_special_leave','chernobyl_special_leave')),
  status TEXT NOT NULL CHECK(status IN ('has_right','no_right')),
  checked_at TEXT NOT NULL,
  PRIMARY KEY(employee_id,leave_type)
) STRICT;`
