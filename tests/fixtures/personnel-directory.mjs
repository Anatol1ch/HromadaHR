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
