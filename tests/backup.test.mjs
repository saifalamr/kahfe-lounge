import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {encrypt,decrypt} from '../scripts/backup-crypto.mjs'
test('encrypted backup roundtrips and rejects tampering or wrong recovery key',()=>{
 const key=randomBytes(32),original=Buffer.from('private sales and customer data'),cipher=encrypt(original,key)
 assert.deepEqual(decrypt(cipher,key),original)
 assert.ok(!cipher.includes(original))
 assert.throws(()=>decrypt(cipher,randomBytes(32)))
 cipher[cipher.length-1]^=1;assert.throws(()=>decrypt(cipher,key))
})
