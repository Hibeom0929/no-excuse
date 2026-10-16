// Semester-archive mode: a story's 24-hour visibility is NOT a deletion deadline.
// No file deletion, DB writes, custom credentials or scheduled job are enabled.
// A dated semester cleanup requires a separate implementation and approval.
Deno.serve((request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  return Response.json({ error: 'Semester archive enabled; automatic photo deletion is disabled.' }, { status: 409 })
})
