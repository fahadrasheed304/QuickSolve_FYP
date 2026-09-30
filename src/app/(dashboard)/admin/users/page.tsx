'use client'


import { useEffect, useState } from 'react'
import { UserDetailsModal } from '@/components/admin-user-details'

type User = { id: string; email: string; fullname: string; phone: string | null; role: string; roles?: string[]; created_at: string }
const control = 'rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-50'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [role, setRole] = useState('all')
  const [search, setSearch] = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selected, setSelected] = useState<User | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/admin/users?${new URLSearchParams({ page: String(page), role, search })}`, { cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Users could not be loaded.')
        if (!controller.signal.aborted) { setUsers(data.users); setCount(data.count) }
      } catch (err) {
        if (!controller.signal.aborted) { setUsers([]); setError(err instanceof Error ? err.message : 'Users could not be loaded.') }
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [page, role, search, revision])

  return <main className="space-y-5">
    <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm" onSubmit={event => { event.preventDefault(); setPage(0); setSearch(draftSearch.trim()); setRevision(value => value + 1) }}>
      <label className="flex flex-1 flex-col gap-1">Name or email<input className={control} value={draftSearch} maxLength={100} onChange={event => setDraftSearch(event.target.value)} placeholder="Search registered users" /></label>
      <label className="flex flex-col gap-1">Role<select className={control} value={role} onChange={event => { setRole(event.target.value); setPage(0) }}><option value="all">All roles</option><option value="student">Students</option><option value="tutor">Tutors</option><option value="admin">Admins</option></select></label>
      <button className={control} type="submit">Search / refresh</button>
    </form>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {loading ? <p role="status">Loading users…</p> : !error && <>
      <p>{count} matching account{count === 1 ? '' : 's'}</p>
      {!users.length ? <p>No users found. Try another search or the previous page.</p> : <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm"><table className="w-full text-left text-sm">
        <thead className="bg-muted"><tr>{['Name', 'Email', 'Role', 'Phone', 'Registered', 'Manage'].map(title => <th className="p-4" key={title} scope="col">{title}</th>)}</tr></thead>
        <tbody>{users.map(user => <tr className="border-t border-border transition-colors hover:bg-blue-500/5" key={user.id}><td className="p-4 font-medium">{user.fullname || 'Not provided'}</td><td className="p-4">{user.email}</td><td className="p-4 capitalize">{(user.roles || [user.role]).join(" + ")}</td><td className="p-4">{user.phone || 'Not provided'}</td><td className="p-4 whitespace-nowrap">{new Date(user.created_at).toLocaleDateString()}</td><td className="p-4"><button className="whitespace-nowrap rounded-lg bg-blue-500/10 px-3 py-2 font-semibold text-primary hover:bg-blue-500/20" onClick={() => setSelected(user)} aria-label={`View details for ${user.email}`}>View details</button></td></tr>)}</tbody>
      </table></div>}
    </>}
    <div className="flex items-center gap-4"><button className={control} disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page + 1}</span><button className={control} disabled={loading || !!error || (page + 1) * 25 >= count} onClick={() => setPage(value => value + 1)}>Next</button></div>
    {selected && <UserDetailsModal user={selected} onClose={() => setSelected(null)} />}
  </main>
}
