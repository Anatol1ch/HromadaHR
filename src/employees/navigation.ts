import type { EmployeeCardTab,EmployeeNavigationIntent,PersonnelIssue } from '../../shared/personnel-control'
export const employeeTabIndex=(tab:EmployeeCardTab)=>({general:0,leave:1,service:2,rank:3})[tab]
/** One caller-owned guard; only the identity and requested tab cross workspaces. */
export function requestEmployeeNavigation(issue:Pick<PersonnelIssue,'employeeId'|'tab'>,requestId:number,guard:(proceed:()=>void)=>void,apply:(intent:EmployeeNavigationIntent)=>void,done:()=>void=()=>{}) {
 guard(()=>{apply({employeeId:issue.employeeId,tab:issue.tab,requestId});done()})
}
