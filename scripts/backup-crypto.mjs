import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto'
const MAGIC=Buffer.from('KAHFE1')
export function encrypt(bytes,key) {
 const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv)
 const data=Buffer.concat([cipher.update(bytes),cipher.final()])
 return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),data])
}
export function decrypt(bytes,key) {
 if(!bytes.subarray(0,6).equals(MAGIC))throw Error('Unknown backup format')
 const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(6,18));cipher.setAuthTag(bytes.subarray(18,34))
 return Buffer.concat([cipher.update(bytes.subarray(34)),cipher.final()])
}
