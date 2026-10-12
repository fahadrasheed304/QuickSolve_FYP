Scheduled group classes
=======================

Student and tutor navigation now includes `/student/scheduled-classes` and `/tutor/scheduled-classes`. Administrators review individual seat payments at `/admin/scheduled-classes`.

Activation
----------

1. Apply `supabase/migrations/202610120002_scheduled_classes.sql` after wallet integrity, tutor conduct, account moderation and `202610120001_email_alerts.sql`. No existing session or balance is backfilled or modified.
2. Configure the existing recording environment: `RECORDING_ENABLED=true`, LiveKit WSS URL/API credentials, R2 endpoint/bucket/access credentials, `CRON_SECRET`, and the public HTTPS `NEXT_PUBLIC_APP_URL`. Scheduled classes require recording configuration before publishing or joining. The recording template must be accessible to LiveKit Egress on the deployed site. The R2 bucket must remain private.
3. Deploy the new code to Vercel. Keep the signed LiveKit webhook pointed at `/api/livekit/webhook` and subscribe to participant joins/leaves and egress events. The existing one-to-one event path remains supported.
4. For production, set Supabase Vault secrets `quicksolve_app_url` to the public HTTPS origin and `quicksolve_cron_secret` to the Vercel `CRON_SECRET` (at least 32 characters). Run `scripts/schedule-class-jobs.sql` to schedule class maintenance and email delivery every minute. Monitor `net._http_response` for HTTP failures; cron enqueue success does not guarantee successful delivery. These jobs continue with all browsers closed and the developer laptop switched off.
5. For local development with the Next.js server running, use `npm run classes:worker` and `npm run emails:worker`. One-shot commands are `npm run classes:maintain` and `npm run emails:send`. Workers target `NEXT_PUBLIC_APP_URL` by default. Set `WORKER_APP_URL=http://localhost:3000` to target a local app while keeping `NEXT_PUBLIC_APP_URL` at the public HTTPS recording template origin. Restart workers after changing environment variables.

Policies
--------

- Only verified, unrestricted tutors publish classes for subjects on their profile. Fixed topic, grade, start time, duration (15–180 minutes), fee (PKR, up to Rs. 100,000 per student) and capacity (2–10 maximum seats). Start must be 30 minutes to 90 days ahead. There is no minimum enrollment: a class can run for one student.
- Published details are immutable. Cancel and recreate to change them. Tutor class overlaps and student group-class booking overlaps are rejected. Database guards also reject instant-session bids, acceptance or extensions that overlap a scheduled class/booking.
- Booking closes ten minutes before start; joining opens ten minutes before start. Recording consent is required both at booking and joining. Room identities use booking/class UUIDs rather than email addresses.
- Wallet money is debited into a reserved seat at booking. Booking, capacity checks, debit and confirmation email are committed together. Request IDs and wallet references protect retries. Cancelled seats can be booked again with a new booking; late cancellation fees remain reserved separately.
- Student cancellation at least two hours before start refunds the full fee. Later cancellation frees the seat but the fee remains due if class takes place. Student absence does not refund a delivered class. Tutor cancellation or no-show (no verified join within ten minutes of announced start) refunds every unsettled seat, including late cancellations. Account/conduct restrictions cancel upcoming classes during maintenance.
- Class clocks use the announced end time, not the first participant's arrival. Actual LiveKit tutor joins start the live state; token issuance never proves attendance. Maintenance reconciles missing joins and observed departures against LiveKit room snapshots. If a leave webhook arrives later, its earlier timestamp corrects the attendance estimate. Tutor early completion holds payments for administrator review. Tutor attendance below 80% also holds payments. On normal completion, each seat has a 20-minute dispute window, followed by automatic payout. An administrator can resolve held seats independently with an audited note. The existing wallet transaction history includes class reserves, refunds and payouts, with separate group-class balance summaries.
- Students receive booking confirmations, eligible 24-hour reminders, 15-minute reminders, cancellations/refunds, completion and recording-ready emails. Tutors receive a 15-minute reminder with enrollment count and payment/dispute notifications. Server jobs and webhook events queue durable, deduplicated email alerts. Recording-ready emails have highest priority, followed by imminent reminders. Expired reminders/download notices are excluded from delivery. SMTP failures retry through the existing outbox.
- Tutors see confirmed seat count, names, booking times, cancelled bookings, individual payment status and attendance. Student responses omit the roster and tutor/student emails.

Recording and disputes
----------------------

LiveKit auto-egress is configured before the first room token is issued. Group recording uses a video/screen grid plus chat rather than the one-to-one whiteboard layout. Reconnecting after a room empties may produce multiple MP4 parts, each listed separately.

The download window begins at the later of class end and the recording becoming ready. Each part has its own 15-minute countdown. Only a confirmed booked student can request a download; cancelled students and tutors cannot. Signed URLs expire no later than the download deadline. Starting a download within the window permits saving a local copy; it does not guarantee completion on a slow connection. Processing failures are shown explicitly. Email delivery delays cannot extend an already-open download window; the dashboard is the authoritative source of the deadline.

Expired recordings are deleted from private R2 storage by maintenance, after the 20-minute dispute window and while no seat payment is held. Held payments preserve evidence for authorized administrator playback even after student download access expires. Deletion claims are retryable; older/duplicate egress events cannot restore deleted files or reset deadlines.

Verification checklist
----------------------

Use funded test student accounts and a verified tutor. Publish a future class, reserve two seats, verify tutor roster and each student's own booking, cancel a seat before the cutoff, and check the wallet refund. Verify reminders with cron running. Conduct a recorded class using at least two browser sessions; check actual attendance, class closure, 15-minute per-part countdown and downloaded MP4. Raise a dispute within twenty minutes, review evidence as admin, and verify that only the chosen seat is refunded/released. Do not mark live recording/SMTP delivery verified until this integration exercise succeeds against configured services.
