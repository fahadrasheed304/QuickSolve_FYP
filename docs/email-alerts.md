Email alerts use the existing Gmail SMTP account (`SMTP_EMAIL`, `SMTP_PASSWORD`).

Apply `supabase/migrations/202610120001_email_alerts.sql` after the earlier migrations, including account moderation, conduct, payments and teaching-demo review emails. New actions queue alerts in the same database transaction. Historical actions are not emailed.

Set `NEXT_PUBLIC_APP_URL` to the deployed site URL and set `CRON_SECRET`. Locally, `npm run dev` starts the email worker beside Next.js automatically; restart the dev command after changing environment variables. For production, schedule an HTTPS GET to `/api/cron/emails` every minute with `Authorization: Bearer <CRON_SECRET>`. For a single batch, run `npm run emails:send` while the Next.js server is running. Never expose the cron secret in browser code.

Covered events:

- Student/tutor account ban, suspension (reason and expiry), and restoration.
- Tutor conduct warnings, restrictions, violations and clearance.
- Verification submission, admin feedback, document requests, test invitation/results and final approval/rejection through verification notes.
- Approved teaching demos; rejected-demo feedback retries use the existing review-email flow.
- New student bids, accepted/rejected tutor bids, and tutor joining a session.
- Completed wallet credits, excluding session ledger entries already covered by payment alerts.
- Pending, held, released and refunded session payments, sent to both participants.

Broadcast new requests and closed-request alerts remain in-app to avoid bulk email. Existing signup OTP and password-reset emails continue to work.

Delivery processes up to ten queued alerts and five rejected-demo retries per run. Queue claims use row locks so simultaneous workers cannot claim the same alert. Failed alerts retry with exponential backoff (up to one hour); crashed claims recover after five minutes. Monitor `email_alerts.status`, `attempts` and `sent_at` with service-role access. Delivery is at least once: an SMTP success followed by a database failure can cause a duplicate on retry. Failed cron responses return 503 for monitoring/retry.

Scheduled-class booking, cancellation, dispute and administrator settlement actions also start delivery after the HTTP response using Next.js `after`. Keep the minute-by-minute cron running for reminders, retries, queued older events and automatic settlements. A `pending` alert with zero attempts means delivery has not picked it up; it is not an SMTP rejection.

Apply `supabase/migrations/202610130001_scheduled_class_notifications.sql` after scheduled classes to add class events to the notification bell. It restores non-expired historical alerts once, including refunds, without sending duplicate emails. Scheduled class history is available on both History pages and shows refunded booking amounts.
