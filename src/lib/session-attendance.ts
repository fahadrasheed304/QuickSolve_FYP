export type AttendanceEvent = { event_id: string; room_sid: string; participant_sid: string | null; identity: string | null; kind: string; occurred_at: string }
export function summarizeAttendance(events: AttendanceEvent[]) {
  return ['student', 'tutor'].map(role => {
    const own = events.filter(event => event.kind !== 'room_finished' && event.identity?.endsWith(`:${role}`))
    const groups = new Map<string, AttendanceEvent[]>()
    for (const event of own) {
      const key = `${event.room_sid}/${event.participant_sid}`
      groups.set(key, [...(groups.get(key) || []), event])
    }
    const intervals: { joined: string; left: string | null; endSource: string }[] = []
    let incomplete = false
    for (const group of groups.values()) {
      const joined = group.filter(event => event.kind === 'participant_joined').sort((a,b) => a.occurred_at.localeCompare(b.occurred_at))[0]
      if (!joined) { incomplete = true; continue }
      const left = group.filter(event => event.kind === 'participant_left' && event.occurred_at >= joined.occurred_at).sort((a,b) => a.occurred_at.localeCompare(b.occurred_at))[0]
      const finished = events.filter(event => event.kind === 'room_finished' && event.room_sid === joined.room_sid && event.occurred_at >= joined.occurred_at).sort((a,b) => a.occurred_at.localeCompare(b.occurred_at))[0]
      const end = [left, finished].filter(Boolean).sort((a,b) => a.occurred_at.localeCompare(b.occurred_at))[0]
      if (!end) incomplete = true
      intervals.push({ joined: joined.occurred_at, left: end?.occurred_at || null, endSource: end?.kind || 'Awaiting leave event' })
    }
    intervals.sort((a,b) => a.joined.localeCompare(b.joined))
    // Union intervals so simultaneous connections never double-count time.
    const merged: number[][] = []
    for (const interval of intervals.filter(value => value.left)) {
      const start = Date.parse(interval.joined), end = Date.parse(interval.left!)
      const last = merged.at(-1)
      if (last && start <= last[1]) last[1] = Math.max(last[1],end)
      else merged.push([start,end])
    }
    return { role, tracked: own.length > 0, incomplete, connections: intervals.length,
      seconds: Math.floor(merged.reduce((sum,[start,end]) => sum + end-start,0)/1000), intervals }
  })
}
