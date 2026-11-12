import type { IpcResult } from './ipc.js'
export const warningHorizons=[7,14,30,60,90] as const
export type WarningHorizon=typeof warningHorizons[number]
export type ControlDirection='allowance'|'rank'|'service_leave'
export type ControlCategory='upcoming'|'due'|'review_needed'|'data_incomplete'
export type EmployeeCardTab='general'|'leave'|'service'|'rank'
export interface EmployeeNavigationIntent {employeeId:string;tab:EmployeeCardTab;requestId:number}
export interface ControlSettings {horizonDays:WarningHorizon}
export interface PersonnelIssue {
 id:string;employeeId:string;employeeName:string;direction:ControlDirection;category:ControlCategory
 title:string;explanation:string;date:string|null;tab:EmployeeCardTab
 dates:{source:'manual'|'projection';date:string}[]
 fingerprint:string;state:'active'|'reviewed'|'snoozed';snoozedUntil:string|null
}
export interface ControlOverview {calculatedOn:string;settings:ControlSettings;issues:PersonnelIssue[];activeCount:number}
export type ReminderStateInput={id:string;fingerprint:string}&({state:'active'|'reviewed'}|{state:'snoozed';days:1|7|30})
export interface PersonnelControlApi {
 onChanged:(listener:()=>void)=>()=>void
 getOverview:()=>Promise<IpcResult<ControlOverview>>
 getSettings:()=>Promise<IpcResult<ControlSettings>>
 saveSettings:(input:ControlSettings)=>Promise<IpcResult<ControlSettings>>
 setReminderState:(input:ReminderStateInput)=>Promise<IpcResult<ControlOverview>>
}
