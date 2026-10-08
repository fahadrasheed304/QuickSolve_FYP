import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

nextEnv.loadEnvConfig(process.cwd())
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
// Signed uploads expire after two hours. Wait a day before removing their paths.
const { error: expireError } = await db.from('tutor_teaching_demos').update({ status: 'cancelled' })
  .eq('status', 'uploading').lt('created_at', cutoff)
if (expireError) throw expireError
const { data, error } = await db.from('tutor_teaching_demos').select('id,object_key')
  .in('status', ['cancelled', 'superseded']).lt('created_at', cutoff).limit(100)
if (error) throw error
let removed = 0
for (const demo of data || []) {
  const { error: storageError } = await db.storage.from('tutor-demos').remove([demo.object_key])
  if (storageError) throw storageError
  const { error: deleteError } = await db.from('tutor_teaching_demos').delete().eq('id', demo.id).in('status', ['cancelled', 'superseded'])
  if (deleteError) throw deleteError
  removed++
}
console.log(`Removed ${removed} abandoned or superseded teaching demos.`)
