import {createClient} from '@supabase/supabase-js'
import {encrypt,decrypt} from './backup-crypto.mjs'
const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!url||!secret)throw Error('Backup server credentials missing')
const db=createClient(url,secret,{auth:{persistSession:false}})
const {data:keyText,error:keyError}=await db.rpc('pos_backup_key')
if(keyError||!keyText)throw Error('Backup encryption key unavailable; refusing plaintext backup')
const key=Buffer.from(keyText,'base64');if(key.length!==32)throw Error('Invalid backup encryption key')
const bucket=db.storage.from('pos-backups')
const stamp=new Date().toISOString().replace(/[:.]/g,'-')
const {data:snapshot,error:snapshotError}=await db.rpc('pos_backup_snapshot')
if(snapshotError||!snapshot?.tables)throw Error('Consistent database snapshot failed')
const tables=Object.keys(snapshot.tables)
const manifest={generated_at:snapshot.generated_at,tables,images:[]}
async function put(path,bytes){
 const encrypted=encrypt(bytes,key)
 if(!decrypt(encrypted,key).equals(bytes))throw Error('Encryption verification failed')
 const {error}=await bucket.upload(`${stamp}/${path}.enc`,encrypted,{contentType:'application/octet-stream',upsert:false})
 if(error)throw Error('Private backup upload failed')
}
await put('database.json',Buffer.from(JSON.stringify(snapshot)))
async function images(prefix=''){
 for(let offset=0;;offset+=100){
  const {data,error}=await db.storage.from('menu-images').list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}})
  if(error)throw Error('Image listing failed')
  for(const entry of data){
   const path=prefix?`${prefix}/${entry.name}`:entry.name
   if(!entry.id){await images(path);continue}
   const {data:blob,error:downloadError}=await db.storage.from('menu-images').download(path)
   if(downloadError||!blob)throw Error('Image backup read failed')
   await put(`images/${path}`,Buffer.from(await blob.arrayBuffer()));manifest.images.push(path)
  }
  if(data.length<100)break
 }
}
await images();await put('manifest.json',Buffer.from(JSON.stringify(manifest)))
// Verify persisted ciphertext, not only the in-memory encryption operation.
const {data:check,error:checkError}=await bucket.download(`${stamp}/database.json.enc`)
if(checkError||!check)throw Error('Backup verification download failed')
const restored=JSON.parse(decrypt(Buffer.from(await check.arrayBuffer()),key))
if(restored.generated_at!==snapshot.generated_at)throw Error('Backup verification failed')
console.log(`Encrypted private backup verified: ${tables.length} tables, ${manifest.images.length} images. No files committed to Git.`)
