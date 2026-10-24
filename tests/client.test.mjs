import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root=resolve(import.meta.dirname,'..')
function load(file,stubs={},globals={}) {
 const filename=resolve(root,file),source=readFileSync(filename,'utf8')
 const module={exports:{}}
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const require=(name)=>{
  if(name in stubs)return stubs[name]
  const path=name.startsWith('@/')?resolve(root,name.slice(2)):resolve(dirname(filename),name)
  return load(path.endsWith('.ts')?path:path+'.ts',stubs,globals)
 }
 vm.runInNewContext(js,{module,exports:module.exports,require,console,crypto,...globals},{filename})
 return module.exports
}
test('every print template escapes untrusted markup including customer notes and branding',()=>{
 let html=''
 const evil='<img src=x onerror="steal()"><script>steal()</script>'
 const globals={window:{open:()=>({document:{write:s=>{html=s},close(){}}})},alert(){}}
 const print=load('app/admin/lib/printTemplates.ts',{'./escpos':{getReceiptBranding:()=>({name:evil,address:evil,footer:evil})}},globals)
 print.printKitchenTicket(evil,[{status:'pending',items:[{name:evil,quantity:1}],note:evil}])
 assert.ok(!html.includes(evil));assert.ok(html.includes('&lt;img'))
 print.printReceipt({table_name:evil,total:10,cash:10,card:0,method:'cash',orders:[{items:[{name:evil,quantity:1,subtotal:10}]}],discountAmount:1,discountReason:evil})
 assert.ok(!html.includes(evil));assert.ok(html.includes('&lt;img'))
})
test('queue preserves request ID, serializes replay, and never claims success on storage failure',async()=>{
 const data=new Map(),calls=[]
 const storage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}
 let resolveRequest
 const orders={orderLines:x=>x,isRetryable:()=>true,createOrder:async(...args)=>{calls.push(args);await new Promise(r=>{resolveRequest=r});return {tab_id:'tab'}}}
 const queue=load('lib/offlineQueue.ts',{'./supabase':{getRestaurantSlug:()=> 'fixture'},'./orders':orders},{localStorage:storage})
 const id=queue.queueOrder({table_name:'MASA-1',items:[{id:'coffee',quantity:1}],note:null,total:10,created_by:'customer'})
 const a=queue.flushQueuedOrders(),b=queue.flushQueuedOrders()
 assert.equal(a,b);assert.equal(calls[0][0],id);resolveRequest();await a
 assert.equal(queue.queuedOrderCount(),0)
 storage.setItem=()=>{throw Error('QuotaExceededError')}
 assert.throws(()=>queue.queueOrder({table_name:'MASA-1',items:[],note:null,total:0,created_by:'customer'}))
})
