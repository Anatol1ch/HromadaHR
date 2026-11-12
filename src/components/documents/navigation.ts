export type DocumentNavigationIntent={documentId:string;requestId:number}
export function requestDocumentNavigation(documentId:string,requestId:number,guard:(next:()=>void)=>void,accept:(intent:DocumentNavigationIntent)=>void,done:()=>void=()=>{}) {
  guard(()=>{done();accept({documentId,requestId})})
}
