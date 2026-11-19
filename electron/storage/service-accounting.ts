import type Database from 'better-sqlite3'
import type { ServiceAccounting } from '../../shared/seniority-ranks.js'

/** Read the current service source and its dependent periods inside the caller's transaction. */
export function readServiceAccounting(db:Database.Database,employeeId:string):ServiceAccounting|null {
 const row=db.prepare<[string],{mode:'continuous'|'periods'|'snapshot';startDate:string|null;years:number|null;months:number|null;days:number|null;asOfDate:string|null;confirmedAt:string}>(
  'SELECT mode,start_date AS startDate,years,months,days,as_of_date AS asOfDate,confirmed_at AS confirmedAt FROM employee_service_records WHERE employee_id=?').get(employeeId)
 if(!row)return null
 if(row.mode==='continuous'&&row.startDate)return {mode:'continuous',startDate:row.startDate,employeeId,confirmedAt:row.confirmedAt}
 if(row.mode==='snapshot'&&row.years!==null&&row.months!==null&&row.days!==null&&row.asOfDate)return {mode:'snapshot',years:row.years,months:row.months,days:row.days,asOfDate:row.asOfDate,employeeId,confirmedAt:row.confirmedAt}
 if(row.mode==='periods')return {mode:'periods',periods:db.prepare<[string],{id:string;startDate:string;endDate:string|null}>(
  'SELECT id,start_date AS startDate,end_date AS endDate FROM employee_service_periods WHERE employee_id=? ORDER BY start_date,id').all(employeeId),employeeId,confirmedAt:row.confirmedAt}
 throw new Error('Invalid service accounting row')
}
