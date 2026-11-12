import type { EmployeeType } from '../../shared/personnel'
import type { EmployeeCardTab } from '../../shared/personnel-control'

export const employeeProfileSections:readonly {id:EmployeeCardTab;label:string}[]=[
 {id:'general',label:'Загальні відомості'},
 {id:'service',label:'Стаж і надбавка'},
 {id:'rank',label:'Ранги'},
 {id:'leave',label:'Відпустки'},
]
export function profileSections(type:EmployeeType) {
 return employeeProfileSections.filter(section=>type==='official'||section.id!=='rank')
}
export function profileSection(section:EmployeeCardTab,type:EmployeeType):EmployeeCardTab {
 return profileSections(type).some(item=>item.id===section)?section:'general'
}
export function requestProfileSection(current:EmployeeCardTab,next:EmployeeCardTab,type:EmployeeType,guard:(proceed:()=>void)=>void,apply:(section:EmployeeCardTab)=>void) {
 const section=profileSection(next,type)
 if(current!==section)guard(()=>apply(section))
}
