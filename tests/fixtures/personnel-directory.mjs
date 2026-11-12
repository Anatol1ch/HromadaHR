import { randomUUID } from 'node:crypto'
import { nameKey } from '../../dist-electron/electron/personnel/schemas.js'

// Historical migration fixtures write the schema they are testing.
export function seedDirectories(connection, personnel, departmentName, positionName) {
  if (connection.schemaVersion >= 12) {
    return {
      department: personnel.createDepartment({ name: departmentName }),
      position: personnel.createPosition({ name: positionName }),
    }
  }
  const department = { id: randomUUID(), name: departmentName }
  const position = { id: randomUUID(), name: positionName }
  connection.database.prepare('INSERT INTO departments(id,name,name_key) VALUES (?,?,?)').run(department.id, department.name, nameKey(department.name))
  connection.database.prepare('INSERT INTO positions(id,name,name_key) VALUES (?,?,?)').run(position.id, position.name, nameKey(position.name))
  return { department, position }
}

// Seed historical employee shapes directly; current Main runs only on migrated storage.
export function seedEmployee(connection, personnel, input) {
  const value={positionStartedOn:null,positionCategory:null,...input}
  if(connection.schemaVersion>=16)return personnel.createEmployee(value)
  const id=randomUUID(),db=connection.database
  db.prepare(`INSERT INTO employees(id,last_name,first_name,middle_name,birth_date,employee_type,hire_date,position_id,department_id) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id,value.lastName,value.firstName,value.middleName,value.birthDate,value.employeeType,value.hireDate,value.positionId,value.departmentId)
  return {...value,id,position:{id:value.positionId,name:db.prepare('SELECT name FROM positions WHERE id=?').get(value.positionId).name},department:{id:value.departmentId,name:db.prepare('SELECT name FROM departments WHERE id=?').get(value.departmentId).name}}
}
