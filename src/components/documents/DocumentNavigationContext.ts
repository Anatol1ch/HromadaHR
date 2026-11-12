import { createContext } from 'react'
/** Narrow navigation callback owned and guarded by App, not a document data store. */
export const DocumentNavigationContext=createContext<((id:string,onAccepted?:()=>void)=>void)|null>(null)
