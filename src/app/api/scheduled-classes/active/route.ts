import { supabaseAdmin } from '@/lib/supabase'
import { classAccount, classHeaders } from '@/lib/scheduled-classes-server'
import { publicBooking, publicClass, type ClassBooking, type ScheduledClass } from '@/lib/scheduled-classes'

export const dynamic = 'force-dynamic'

export async function GET() {
  const account = await classAccount()
  if (!account || !['student', 'tutor'].includes(account.role)) {
    return Response.json({ error: 'Student or tutor login required' }, { status: 401, headers: classHeaders })
  }

  try {
    const now = new Date().toISOString()
    let bookingRows: ClassBooking[] = []
    let query = supabaseAdmin.from('scheduled_classes').select('*')
      .in('status', ['scheduled', 'live']).lte('starts_at', now).gt('ends_at', now)

    if (account.role === 'tutor') {
      query = query.eq('tutor_email', account.email)
    } else {
      const bookings = await supabaseAdmin.from('scheduled_class_bookings').select('*')
        .eq('student_email', account.email).eq('status', 'booked').eq('payment_status', 'reserved')
      if (bookings.error) throw bookings.error
      bookingRows = (bookings.data || []) as ClassBooking[]
      const classIds = [...new Set(bookingRows.map(booking => booking.class_id))]
      if (!classIds.length) return Response.json({ classes: [], serverNow: Date.now() }, { headers: classHeaders })
      query = query.in('id', classIds)
    }

    const result = await query.order('starts_at').order('id').limit(10)
    if (result.error) throw result.error
    const bookingsByClass = new Map(bookingRows.map(booking => [booking.class_id, booking]))
    const classes = (result.data || []).map(row => {
      const scheduledClass = row as ScheduledClass
      const booking = bookingsByClass.get(scheduledClass.id)
      return {
        ...publicClass(scheduledClass),
        ...(booking ? { my_booking: publicBooking(booking) } : {}),
      }
    })

    return Response.json({ classes, serverNow: Date.now() }, { headers: classHeaders })
  } catch {
    return Response.json({ error: 'Could not load your classes in progress.' }, { status: 503, headers: classHeaders })
  }
}
