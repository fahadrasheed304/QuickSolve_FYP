"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { Tldraw, type Editor, type TLRecord, type TLStoreSnapshot } from 'tldraw'
import { RoomEvent, type Room } from 'livekit-client'
import { useRoomContext } from '@livekit/components-react'

const TOPIC = 'quicksolve-whiteboard-v1'
const MAX_PACKET_BYTES = 10_000
type Message = { type: 'request-snapshot' } | { type: 'put'; records: unknown[] } | { type: 'remove'; ids: string[] } | { type: 'snapshot-record'; record: unknown }

function encode(message: Message) {
  return new TextEncoder().encode(JSON.stringify(message))
}

async function send(room: Room, message: Message) {
  const payload = encode(message)
  if (payload.byteLength > MAX_PACKET_BYTES) return
  try { await room.localParticipant.publishData(payload, { reliable: true, topic: TOPIC }) }
  catch (error) { console.warn('Whiteboard update could not be sent', error) }
}

export default function SessionWhiteboard({ problemId, readOnly = false, recording = false }: { problemId: string; readOnly?: boolean; recording?: boolean }) {
  const room = useRoomContext()
  const [snapshot, setSnapshot] = useState<TLStoreSnapshot | null>(null)
  const [loaded, setLoaded] = useState(recording)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [loadError, setLoadError] = useState('')
  const editorRef = useRef<Editor | null>(null)
  const buffered = useRef<Message[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (recording) {
      setSnapshot(null)
      setLoaded(true)
      return
    }
    let cancelled = false
    void fetch(`/api/sessions/${problemId}/whiteboard`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load the saved whiteboard')
        return response.json() as Promise<{ snapshot: TLStoreSnapshot | null }>
      })
      .then(result => { if (!cancelled) { setSnapshot(result.snapshot); setLoaded(true) } })
      .catch(error => { if (!cancelled) { setLoadError(error instanceof Error ? error.message : 'Whiteboard is unavailable'); setSnapshot(null); setLoaded(true) } })
    return () => { cancelled = true }
  }, [problemId, recording])

  const apply = useCallback((message: Message) => {
    const editor = editorRef.current
    if (!editor) { buffered.current.push(message); return }
    if (message.type === 'put') {
      const records = message.records as TLRecord[]
      editor.store.mergeRemoteChanges(() => editor.store.put(records))
    } else if (message.type === 'remove') {
      editor.store.mergeRemoteChanges(() => editor.store.remove(message.ids as TLRecord['id'][]))
    } else if (message.type === 'request-snapshot') {
      // Send records separately to stay below LiveKit's reliable data packet limit.
      const records = Object.values(editor.store.getStoreSnapshot('document').store)
      void (async () => {
        for (const record of records) {
          const packet = encode({ type: 'snapshot-record', record })
          if (packet.byteLength <= MAX_PACKET_BYTES) await send(room, { type: 'snapshot-record', record })
        }
      })()
    } else {
      editor.store.mergeRemoteChanges(() => editor.store.put([message.record as TLRecord]))
    }
  }, [room])

  useEffect(() => {
    const onData = (payload: Uint8Array, participant: { identity: string } | undefined, _kind: unknown, topic?: string) => {
      if (topic !== TOPIC || participant?.identity === room.localParticipant.identity) return
      try {
        const message = JSON.parse(new TextDecoder().decode(payload)) as Message
        if (message && ['request-snapshot', 'put', 'remove', 'snapshot-record'].includes(message.type)) apply(message)
      } catch { /* Ignore unrelated or malformed room data. */ }
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => { room.off(RoomEvent.DataReceived, onData) }
  }, [apply, room])

  const onMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    setEditor(editor)
    if (!initialized.current) {
      initialized.current = true
      if (snapshot) editor.loadSnapshot({ document: snapshot })
      for (const message of buffered.current.splice(0)) apply(message)
    }
  }, [apply, snapshot])

  useEffect(() => {
    if (!editor || readOnly) return
    const unsubscribe = editor.store.listen(({ changes }) => {
      if (!changes) return
      for (const record of [...Object.values(changes.added), ...Object.values(changes.updated).map(([, next]) => next)]) {
        const message: Message = { type: 'put', records: [record] }
        if (encode(message).byteLength <= MAX_PACKET_BYTES) void send(room, message)
      }
      const removed = Object.keys(changes.removed)
      if (removed.length) void send(room, { type: 'remove', ids: removed })

      if (!recording) {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          const current = editor.getSnapshot().document
          void fetch(`/api/sessions/${problemId}/whiteboard`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: current }),
          }).then(response => { if (!response.ok) console.warn('Whiteboard autosave failed') }).catch(() => console.warn('Whiteboard autosave failed'))
        }, 1200)
      }
    }, { source: 'user', scope: 'document' })
    return () => {
      unsubscribe()
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [editor, problemId, readOnly, recording, room])

  useEffect(() => {
    if (room.state === 'connected') void send(room, { type: 'request-snapshot' })
  }, [room, snapshot])

  if (!recording && !snapshot && loadError) return <div className="flex h-full min-h-64 items-center justify-center bg-white p-4 text-sm text-red-600">{loadError}. Migration `202609300005_session_whiteboards.sql` must be applied.</div>
  if (!recording && !loaded) return <div className="flex h-full min-h-64 items-center justify-center bg-white text-sm text-slate-500">Loading shared whiteboard…</div>

  return <div className="relative h-full min-h-64 w-full overflow-hidden bg-white">
    <Tldraw
      onMount={onMount}
      licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      hideUi={recording}
    />
    {!recording && <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md bg-white/90 px-2 py-1 text-xs text-slate-500 shadow">Shared with everyone in this session</div>}
  </div>
}
