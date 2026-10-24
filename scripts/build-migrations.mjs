import {readFile,writeFile} from 'node:fs/promises'
export const phases={
 '20261024005041_pos_security_reliability.sql':['helpers','security','adjustments','status','transfer','bill-edit','audit','notifications','backups'],
 '20261024010336_pos_access_lockdown.sql':['lockdown','auth'],
}
for(const [file,parts] of Object.entries(phases)){
 const content=(await Promise.all(parts.map(async part=>`-- Source: supabase/pos-${part}.sql\n${await readFile(`supabase/pos-${part}.sql`,'utf8')}`))).join('\n')
 if(process.argv.includes('--check')){
  if(await readFile(`supabase/migrations/${file}`,'utf8')!==content)throw Error(`Migration out of sync: ${file}`)
 }else await writeFile(`supabase/migrations/${file}`,content)
}
