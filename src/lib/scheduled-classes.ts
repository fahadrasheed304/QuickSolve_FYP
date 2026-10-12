export const CLASS_POLICY = {
  bookingClosesMinutes: 10, refundCutoffHours: 2, tutorGraceMinutes: 10,
  disputeMinutes: 20, downloadMinutes: 15, maxSeats: 10,
}
export const isClassId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export type ScheduledClass = {
  id: string; tutor_email?: string; tutor_name: string; subject: string; topic: string; class_level: string; description: string;
  starts_at: string; ends_at: string; duration_min: number; fee: number; capacity: number;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled'; tutor_joined_at: string | null; ended_at: string | null;
  cancellation_reason: string | null; booked_count?: number; expected_earnings?: number; my_booking?: ClassBooking | null;
}
export type ClassBooking = {
  id: string; class_id: string; student_email?: string; student_name: string; amount: number; status: 'booked' | 'cancelled';
  payment_status: 'reserved' | 'pending' | 'held' | 'released' | 'refunded'; created_at: string; cancelled_at: string | null;
  joined_at: string | null; release_at: string | null; dispute: string | null; resolution_note: string | null;
}
export type ClassRecording = { egress_id: string; state: string; ready_at: string | null; download_until: string | null }
export function classJoinWindow(c: ScheduledClass, now: number) {
  return ['scheduled', 'live'].includes(c.status) && now >= Date.parse(c.starts_at) - 10 * 60000 && now < Date.parse(c.ends_at)
}

export function publicClass(c: ScheduledClass) {
  const { tutor_email: _email, ...safe } = c
  void _email
  return safe
}
export function publicBooking(b: ClassBooking) {
  const { student_email: _email, ...safe } = b
  void _email
  return safe
}
