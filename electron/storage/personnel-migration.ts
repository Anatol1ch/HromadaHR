// Static SQL for migration 3; never alter after publication.
export const personnelSql = `CREATE TABLE departments (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  name_key TEXT NOT NULL UNIQUE CHECK (length(name_key) > 0)
) STRICT;
CREATE TABLE positions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  name_key TEXT NOT NULL UNIQUE CHECK (length(name_key) > 0)
) STRICT;
CREATE TABLE employees (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  last_name TEXT NOT NULL CHECK (length(trim(last_name)) BETWEEN 1 AND 200),
  first_name TEXT NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 200),
  middle_name TEXT CHECK (middle_name IS NULL OR length(trim(middle_name)) BETWEEN 1 AND 200),
  birth_date TEXT CHECK (birth_date IS NULL OR (length(birth_date) = 10 AND birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(birth_date, 1, 4) != '0000' AND coalesce(date(birth_date, '+0 days') = birth_date, 0))),
  employee_type TEXT NOT NULL CHECK (employee_type IN ('official', 'staff')),
  note TEXT CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 4000)
) STRICT;
CREATE TABLE employee_positions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  category TEXT CHECK (category IS NULL OR length(trim(category)) BETWEEN 1 AND 200),
  start_date TEXT NOT NULL CHECK (length(start_date) = 10 AND start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(start_date, 1, 4) != '0000' AND coalesce(date(start_date, '+0 days') = start_date, 0)),
  UNIQUE (employee_id, start_date)
) STRICT;
CREATE INDEX employee_positions_department ON employee_positions(department_id);
CREATE INDEX employee_positions_position ON employee_positions(position_id);`
