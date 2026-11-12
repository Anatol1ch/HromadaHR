import {parentPort,workerData} from 'node:worker_threads'
import Database from 'better-sqlite3'
import {randomUUID} from 'node:crypto'
import {DocumentsService} from '../../dist-electron/electron/documents/service.js'
const db=new Database(workerData.file,{timeout:10000});db.pragma('foreign_keys=ON')
try {
 const service=new DocumentsService({getDatabase:()=>db},()=>false)
 const numbers=Array.from({length:6},()=>service.createAutoNumberedDocument({seriesId:workerData.seriesId,requestId:randomUUID(),kind:'head_order',customKind:null,issuedOn:'2026-11-12',title:'Синтетичний паралельний документ',note:null,employeeIds:[]}).number)
 parentPort.postMessage(numbers)
}finally{db.close()}
