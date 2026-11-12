/** Local lifetime/ordering gate shared by the control hook and its navigation busy guard. */
export function createControlRequests() {
 let version=0,lifetime=0,mounted=false
 const pending={current:false}
 return {
  pending,activate:()=>{mounted=true},stop:()=>{mounted=false;version++;lifetime++},mounted:()=>mounted,
  lifetime:()=>lifetime,currentLifetime:(value:number)=>mounted&&value===lifetime,
  beginRead:()=>++version,current:(request:number)=>mounted&&request===version,invalidate:()=>{version++},
  beginMutation:()=>{if(!mounted||pending.current)return false;pending.current=true;return true},
  endMutation:()=>{pending.current=false},
 }
}
