import type { HromadaHRApi,IpcErrorCode,IpcResult } from '../../../shared/ipc'
import type { Allowance,CurrentRank,SeniorityOverview } from '../../../shared/seniority-ranks'
import type { Kind } from './model.ts'
export async function readIndicator(api:HromadaHRApi['seniorityRanks'],id:string,kind:Kind):Promise<IpcResult<Allowance|CurrentRank|null>> {
 try{return await(kind==='allowance'?api.getAllowance(id):api.getRank(id))}
 catch{return {ok:false,error:{code:'UNAVAILABLE'}}}
}
/** A focused form receives only a successfully read target and a fresh employee, never a guessed empty row. */
export async function readIndicatorContext(api:Pick<HromadaHRApi,'personnel'|'seniorityRanks'>,id:string,kind:Kind):Promise<IpcResult<SeniorityOverview>> {
 try {
  const [employee,target]=await Promise.all([api.personnel.getEmployee(id),readIndicator(api.seniorityRanks,id,kind)])
  if(!employee.ok)return employee
  if(!target.ok)return target
  if(kind==='rank'&&employee.data.employeeType!=='official')return {ok:false,error:{code:'RANK_REQUIRES_OFFICIAL'}}
  return {ok:true,data:{employee:employee.data,allowance:kind==='allowance'?target.data as Allowance|null:null,rank:kind==='rank'?target.data as CurrentRank|null:null}}
 }catch{return {ok:false,error:{code:'UNAVAILABLE'}}}
}
export function uncertainIndicatorResult(code:IpcErrorCode) {return code==='UNAVAILABLE'||code==='INTERNAL_ERROR'}
export function loadIndicatorContext(api:Pick<HromadaHRApi,'personnel'|'seniorityRanks'>,id:string,kind:Kind,accept:(result:IpcResult<SeniorityOverview>)=>void) {
 let active=true
 void readIndicatorContext(api,id,kind).then(result=>{if(active)accept(result)})
 return ()=>{active=false}
}
