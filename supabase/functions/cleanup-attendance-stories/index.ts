import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// No arbitrary object paths, group IDs or cutoffs are accepted from callers.
// Only the server's expiry query can select files for permanent removal.
Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const suppliedSecret = request.headers.get('x-story-cleanup-secret')
  if (!suppliedSecret || suppliedSecret.length !== 72) return new Response('Unauthorized', { status: 401 })
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: secret, error: authError } = await client.rpc('story_cleanup_secret')
  if (authError || typeof secret !== 'string' || secret.length !== 72 || suppliedSecret !== secret) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    let removed = 0
    for (let batch = 0; batch < 5; batch++) {
      const { data: rows, error } = await client.rpc('expired_story_objects', { p_limit: 200 })
      if (error || !Array.isArray(rows)) throw new Error('Failed to list expired story files')
      if (!rows.length) break
      const { data: deleted, error: removeError } = await client.storage.from('attendance-stories').remove(rows.map(row => row.name))
      if (removeError) throw new Error('Failed to remove expired story files')
      removed += deleted?.length ?? 0
    }
    const { error: pruneError } = await client.rpc('prune_story_metadata')
    if (pruneError) throw new Error('Failed to prune story metadata')
    return Response.json({ removed })
  } catch (error) {
    // Retain metadata on failures. The next scheduled run retries the files.
    console.error(error instanceof Error ? error.message : 'Story cleanup failed')
    return new Response('Story cleanup failed', { status: 500 })
  }
})
