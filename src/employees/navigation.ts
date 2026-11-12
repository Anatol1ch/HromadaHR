import type { EmployeeNavigationIntent,PersonnelIssue } from '../../shared/personnel-control'
/** One caller-owned guard; only the identity and requested tab cross workspaces. */
export function requestEmployeeNavigation(issue:Pick<PersonnelIssue,'employeeId'|'tab'>,requestId:number,guard:(proceed:()=>void)=>void,apply:(intent:EmployeeNavigationIntent)=>void,done:()=>void=()=>{}) {
 guard(()=>{apply({employeeId:issue.employeeId,tab:issue.tab,requestId});done()})
}
