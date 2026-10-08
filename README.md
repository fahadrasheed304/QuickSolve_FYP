# QuickSolve FYP

## Local setup

### Session video recordings

See [recording setup](docs/session-recordings.md) for the private R2 bucket,
Vercel variables, LiveKit webhook, local database migration and Supabase Cron
job. Recording stays disabled until `RECORDING_ENABLED=true`; playback is
admin-only. Normal recordings expire after 20 minutes, while held payments
preserve evidence until admin resolution. Apply the recording migration before
deploying the updated 20-minute payment/dispute UI.

### Subject matching at bid submission (FR-40)

The bid API loads the saved problem subject and checks the authenticated tutor's
profile subjects, using exact matching consistent with request delivery. Empty or
missing subjects deny bidding. The bid card subject comes from the problem, not the
tutor's first subject or client input. Apply local, Git-ignored migration
`supabase/migrations/202609260004_bid_subject_match.sql` for database enforcement.
The trigger rechecks locked problem/profile rows on insertion or identity/problem
changes, preventing a stale API check from authorizing a mismatched new bid.
Existing bids are retained as historical records; status-only updates do not
retroactively revalidate subjects. Live deployment verification remains pending.

### Persistent tutor conduct policy (FR-54)

Apply local, Git-ignored `supabase/migrations/202609260003_tutor_conduct.sql` after
payment resolution and before deploying these application changes. It evaluates
existing ratings during application, so qualifying existing tutors can be flagged
or restricted immediately. Subsequent saved reviews run the same database policy.

The latest 20 rated reviews since the last admin clearance determine actions:
at least 5 reviews, at least 3 ratings of 1–3 and average below 3.5 create a flag;
at least 8 reviews, at least 5 ratings of 1–3 and average below 3 restrict new bookings.
Pending disputes and refund counts alone do not trigger this policy. The first
admin-confirmed violation flags; the second since clearance restricts. Admins can
also restrict immediately after reviewing evidence. A reason is required for every
admin decision, and request IDs deduplicate retried decisions.

Flags/restrictions persist until admin clearance; later good ratings cannot silently
remove them. Clearance preserves audit history and starts a fresh review/violation
period so old reviewed evidence does not immediately reapply the restriction.
Review timestamps, not payment-release times, determine the fresh evidence window.
This policy is separate from FR-38's advisory evaluation and FR-53 ranking weights.

The tutor dashboard shows status, reasons and paginated decision history. Admins
use `/admin/conduct` (linked from verifications) or the tutor-detail panel to review
and clear/restrict/record confirmed violations. Only authenticated, allowlisted
admin-role accounts can mutate decisions. The queue and panel refresh every 30 seconds.
Database triggers block new bids and acceptance of previously pending bids for
restricted tutors, with transactional rollback of attempted reservations. The feed,
ranking and new-request notifications exclude restricted tutors. Existing accepted
sessions, payouts, wallets and verification status remain available; the intentional
admin test bypass does not remove a conduct restriction. A flagged tutor may still bid.
Live deployment and browser acceptance verification remain pending.

### Tutor visibility and recommended bids (FR-53)

Student bid lists are ranked independently within each open request on every fetch.
Server-loaded evidence determines the score: 60% lifetime review rating, 25% resolved
payment outcomes within the latest 20 session payments, 15% qualifying subject test.
Ratings use five prior reviews at 3.5/5; outcomes use four prior releases out of five
resolved payments. These baselines reduce small-sample extremes. No-rating tutors
receive 70/100 for ratings; admin verification without a qualifying passed test
receives a neutral 70/100 test component. Only passed scores between 80 and 100 count.
Pending disputes do not count as adverse resolved outcomes. Refunds are a ranking
signal requiring context, not a finding of tutor fault. Equal scores use oldest bid
then bid ID. Price does not influence the recommendation score.

Only pending bids from currently verified profiles are listed for open requests;
all such bids remain selectable. Cards show the score and its evidence. Fresh review
ratings replace bid-time rating snapshots. The existing notification refresh and
periodic reconciliation refresh the ordering. Failed ranking queries return errors
rather than fabricate evidence. No new migration is needed; existing tutor-rating
and session-payment migrations must be applied. Live UI verification remains pending.

### Tutor wallet and complete payment history (FR-51)

Apply local `supabase/migrations/202609260002_tutor_wallet_history.sql` after the
wallet integrity/session payment migrations. This migration is Git-ignored per
the project's local-migration policy; supply it separately for deployment.
It adds read-only reporting and history indexes, without changing balances.

`/tutor/wallet` displays the tutor-role balance, lifetime completed session-payout
credits, pending payments and held payments. Lifetime totals are aggregated in SQL
over all records, not the visible page or profile counters. Other credits are
included in transaction totals but not session earnings. Refunds to students are
not tutor earnings; pending/held sessions are not yet credited. Missing wallets and
database errors are shown explicitly rather than as a zero balance.

Transaction filters cover credit/debit and inclusive UTC calendar dates; displayed
timestamps use the viewer's local timezone. All matching records can be traversed
in pages of 25 using timestamp/UUID cursors that preserve microsecond precision.
Newer inserts do not shift the next transaction page. Refresh restarts from the
latest page. Summary and filtered totals are current as of each query, not a frozen
multi-page statement. Tutor history and wallet also offer paginated session payments,
status filters, reviews and resolution notes. Session-payment pages refresh every
30 seconds; their offset-based pages reflect the current data and may shift when
new payments arrive or status filters change. The previous 50-row cutoff and
static tutor activity placeholders have been removed.

The authenticated tutor identity scopes every wallet query; public database roles
cannot execute the report function. This feature displays existing wallet records;
it does not add withdrawals. Verify the deployed wallet with a tutor account after
applying the SQL, including credits, held payments, date filters and older pages.

### Continuous tutor evaluation (FR-38)

Tutor dashboard and admin tutor details show an evaluation of the latest 20 session
payment records, ordered by release window and session ID. The server recalculates
from saved ratings and current payment outcomes on every request; the UI refreshes
every 30 seconds, on focus and on manual refresh. No new migration is needed.
At least 5 ratings are required for a rating assessment: below 3.5 needs attention;
4.5 or higher with no refunds/open disputes is excellent; otherwise good standing.
Separately, at least 5 resolved payments with 30% or more refunded needs contextual
review. Unrated sessions are excluded from the average. Pending disputes do not
prove fault. Recent written feedback and outcome counts accompany the assessment.
This is advisory evaluation, not automatic account restriction or visibility ranking.
New feedback and payment resolutions affect the next refresh. No live browser
acceptance verification has been performed for this feature yet.

### Tutor join notifications (FR-27)

Apply local `supabase/migrations/202609260001_tutor_join_notifications.sql` after
the notification, bid rejection and session clock/extension migrations. This SQL
file is intentionally Git-ignored; obtain the local file separately when deploying.
Configure a LiveKit webhook pointing to `https://YOUR_APP_DOMAIN/api/livekit/webhook`,
using the same API key as `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` on the app server.
Enable `participant_joined` delivery if selecting individual events. Local testing
requires a publicly reachable HTTPS URL forwarded to the local app.

The signed webhook confirms the selected tutor actually connected. It creates one
saved student notification per active session, delivered through the existing
realtime inbox/toast with a link to the session. Token requests, student joins,
unselected tutors and ended/expired sessions do not create join alerts. Rejoins
and webhook retries do not repeat the alert. Database failures return 503 for retry.
See [LiveKit webhook setup](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/).

Acceptance check: select a tutor, join with that tutor in a second browser, confirm
one student alert and working session link, then reconnect the tutor and confirm
there is still only one alert. Verify offline students see the saved alert on return.
Live deployment verification is still required after SQL and webhook configuration.

Copy `.env.example` to `.env.local` and enter credentials locally. Keep existing
Supabase and SMTP values. `ADMIN_PASSWORD` and `JWT_SECRET` must be set explicitly;
there is no shared fallback password. LiveKit requires all three values shown in
the example file. Restart the dev server after changing environment variables.

```sh
npm install
npm run dev
```

## Apply the wallet migration first

Open your Supabase project's **SQL Editor** and run the complete contents of
[`supabase/migrations/202609210001_wallet_integrity.sql`](supabase/migrations/202609210001_wallet_integrity.sql).
The migration runs in one transaction and is safe to run again. It adds payment
method/reference columns and the accepted bid reference. It does not delete or
reset existing balances or transaction history. Existing accepted problems that
have no selected bid recorded cannot be charged automatically; start a new
problem/bid for the demo rather than guessing which historical bid was accepted.

The new functions atomically save balance changes and transaction history, reject
overdrafts, and deduplicate Stripe/session references. Only the server's
`service_role` may execute them. Session settlement uses the stored accepted bid
price, not an amount supplied by the browser. This initial migration used payment
on completion; the session escrow migration below supersedes that behavior for
newly accepted sessions. Older accepted sessions retain their original billing path.

Confirm the migration in SQL Editor (read-only):

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'wallet_transactions'
  and column_name in ('method', 'payment_reference');
select routine_name from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('apply_wallet_transaction', 'accept_student_bid', 'complete_student_session');
```

## Stripe sandbox demo

For the local demo, run `npm run dev:stripe`. This starts the Stripe listener
using `STRIPE_SECRET_KEY` from `.env.local`, saves its webhook signing secret
without printing it, then starts Next.js on the port in `NEXT_PUBLIC_APP_URL`.
Keep this command running during the demo. Stop any existing Next.js instance
on that port first. The manual steps below are an alternative.

1. Add your sandbox `sk_test_...` key as `STRIPE_SECRET_KEY` in `.env.local`.
2. Set `NEXT_PUBLIC_APP_URL` to the exact URL at which you open the application.
3. Using an installed Stripe CLI, run:

   ```sh
   stripe login
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded --forward-to localhost:3000/api/stripe/webhook
   ```

4. Save the listener's `whsec_...` value as `STRIPE_WEBHOOK_SECRET`, restart Next.js,
   and leave the listener running. A deployed app needs its own sandbox webhook
   endpoint and signing secret.
5. Sign in as a student, open Wallet, enter an amount and continue to Checkout.
   Use `4242 4242 4242 4242`, a future expiry and any three-digit CVC. Use only
   [Stripe's test cards](https://docs.stripe.com/testing), never a real card.
6. Confirm the wallet updates only after the verified webhook arrives. Cancelling,
   declining or replaying a payment must not create an extra credit.

Checkout collects card and billing details on Stripe. Card numbers and CVCs are
never sent to this app or stored in its database. The app accepts test keys and
sandbox events only. Bank/Easypaisa/JazzCash and paid extensions are unavailable
until actual provider/settlement flows are implemented; they no longer create
simulated balance changes. Review text is not yet persisted by the session API.

## Verification

```sh
npm run lint
npm test
npm run build
```

Tests run the actual SQL migration in an isolated PGlite database and the payment
route handlers with mocked external services. They cover duplicate references,
rollback on insert failure, overdrafts, owner checks, stored session prices, and
Stripe webhook signatures. They do not charge cards or modify the hosted database.
An actual sandbox checkout still requires your Stripe credentials and applied
Supabase migration.
## Live request and bid notifications

After the notification migration, apply
[`202609250004_reject_unselected_bids.sql`](supabase/migrations/202609250004_reject_unselected_bids.sql).
Selecting a tutor now accepts that bid and rejects the other pending bids in one transaction.
Unselected bidders receive a saved rejection alert; tutors who did not bid only receive a
request-closed notice. Late bids on selected/expired requests are rejected by the database.
The migration also repairs pending losing bids on already accepted requests without sending
historical alerts. It does not alter payments or delete bid history.

Apply [`202609250003_realtime_notifications.sql`](supabase/migrations/202609250003_realtime_notifications.sql)
in the project's Supabase SQL Editor after the existing session/payment migrations.
It creates the protected notification table, transactional triggers and Realtime publication entry.
Reapplying this migration is safe. No additional environment variables are required.
The local app's service-role key is not a database administration credential; this migration
must be applied using SQL Editor or an authorized database connection.

- Verified, available tutors receive new requests matching their subjects.
- Students receive new-bid alerts; selected tutors receive acceptance alerts.
- The notification bell shows the latest 50 saved notifications, unread badges and mark-read actions.
- Database events travel through an authenticated server-sent event endpoint. Email and role
  come from the signed cookie; the service-role key never reaches the browser.
- Reconnects reload the saved inbox and refresh request/bid lists. A 30-second fallback
  runs while disconnected, and a 60-second list reconciliation handles expiry/recovery.
- These are in-app notifications while the application is open, not operating-system push alerts.

The deployment must support streaming Node.js route responses without proxy buffering.
Streams rotate after 55 seconds and reauthenticate automatically. If Realtime is unavailable,
the bell displays a reconnecting state and fallback refreshes continue.
See [Supabase's database-change documentation](https://supabase.com/docs/guides/realtime/postgres-changes).

Acceptance check after applying the migration: open a student and a verified, available
tutor with a matching subject in separate browsers. Post a problem, submit a bid, then accept
it. Check immediate list updates, toast alerts, unread badges and accepted-session availability.
Repeat with a different subject and an unavailable tutor: neither should receive the new request.
Mark alerts read, refresh, and briefly disconnect/reconnect to check persistence and recovery.

## Session escrow (Stripe sandbox)

After all preceding migrations, apply
[`202609250005_session_escrow.sql`](supabase/migrations/202609250005_session_escrow.sql).
Acceptance atomically moves the bid amount out of the available student balance into
a protected session reserve. Other bids are still rejected and notifications still
created in the same transaction. A failure rolls the entire action back.

Extensions reserve only their additional cost. Reviews do not charge the base amount
again. The existing scheduled payout checks the reserve against the payment, credits
the tutor once and marks the escrow released. Disputed/low-rated sessions remain held.
The later payment-resolution migration adds admin decisions and automatic no-review
settlement. The wallet displays available and reserved balances separately, and labels
reserve ledger debits as escrow movements.

The migration does not retroactively debit existing accepted sessions. They follow
the previous completion billing path. Stripe remains test-only; the escrow represents
internal sandbox wallet funds, not a Stripe bank transfer or external escrow service.
Do not reapply older function migrations after this migration.

Demo check: top up a sandbox wallet to Rs. 1,000, accept a Rs. 500 bid, and confirm
Rs. 500 available / Rs. 500 reserved. Submit a review after the session: available
balance must not be charged again. A qualifying scheduled payout reduces reserved
balance and credits the tutor once. Repeat acceptance/review requests and check no
duplicate charges. Test insufficient funds, extensions and a disputed session too.

## Automatic payouts and admin resolution

Apply [`202609250006_payment_resolution.sql`](supabase/migrations/202609250006_payment_resolution.sql)
after the escrow migration. Run the complete script, including the Cron statements.
The existing `quicksolve-release-session-payments` job checks once per minute:

- Completed/expired escrow-funded sessions get a payment row even without a review.
- The 5-minute dispute window starts when that row is created. No-review payments
  are eligible for release after that window; the next scheduled check pays them.
- Low ratings and disputes hold payment. Unstarted reservations older than 30 minutes,
  or explicitly ended before starting, also go on hold for an admin decision.
- A late review is allowed after automatic payment, but does not reverse a resolved payment.
- Existing legacy sessions without a funded escrow retain their previous billing path;
  already funded legacy review payments can be released/refunded by the admin.

Admin: use **Session payments & disputes** from the verification page, or visit
`/admin/payments`. The default list is held payments, with session times, participants,
agreed duration, extensions, feedback and dispute details. Choose full release to the
tutor or full refund to the student wallet, provide a note and confirm. Decisions are
saved with admin identity/time; retries cannot move money twice and opposing decisions
are rejected. Refunds are internal wallet credits, not refunds to the original Stripe card.
Recordings and partial refunds are not part of this workflow.

Verify the scheduler after migration:

```sql
select jobname, schedule, active from cron.job
where jobname = 'quicksolve-release-session-payments';
```

Live check: finish an escrow-funded session without reviewing it. Confirm its pending
payment appears by the next scheduled check, then is released after the 5-minute window.
Repeat with a dispute or low rating; use the admin page to refund one and release another.
Confirm wallet totals, terminal statuses and resolution history from both accounts.
# Account suspension and permanent bans (FR-57)

Apply `supabase/migrations/202609300001_account_moderation.sql` in the Supabase SQL
Editor before running this version. The service-role API key cannot execute schema
migrations. The SQL is transactional and rerunnable. Until it is applied, regular
account access checks fail closed; the configured administrator can still sign in.

Open **Admin → Registered users → View details → Safety & restrictions**. Review
the user's open disputes, tutor conduct records and decision history, then choose
suspend (1–365 days), permanently ban, or restore. A reason is required; permanent
ban also requires typing the account email and confirming the decision. Restrictions
apply to all roles belonging to the email. No accounts, wallets or evidence are deleted.
Disputes remain allegations until reviewed. Missing conduct data is shown as unavailable,
not as a clean record; the existing tutor-conduct schema must be deployed separately.

New logins and existing authenticated API requests check live account status.
Expired suspensions automatically permit access; permanent bans require explicit
admin restoration. LiveKit disconnection is attempted after restrictions are saved;
if it fails, the admin sees a warning and can retry the same decision. The configured
LiveKit webhook also rejects restricted participants reconnecting with old room tokens.
LiveKit delivery can be delayed, so this is not a guarantee of instantaneous media cutoff.
Decisions are version-checked and idempotent, with an append-only audit history.

Validation: `node --test --test-isolation=none tests/account-moderation.test.mjs`.
Live Supabase and LiveKit verification is required after deployment.
# Session attendance

Apply `supabase/migrations/202609300002_session_attendance.sql` in Supabase SQL Editor.
The LiveKit webhook at `/api/livekit/webhook` must receive `participant_joined`,
`participant_left`, and `room_finished` events. Admin session history now offers
Student / tutor time with separate connected durations and join/leave timelines.
Reconnects are combined without counting overlapping intervals twice. Pending or
missing events are marked partial; historical sessions without events say Not tracked.
Room closure can supply the endpoint when a participant leave event is absent; the
timeline labels that source. These durations describe recorded connection intervals,
not attention or speaking time. No historical attendance is fabricated.
# Tutor-to-student ratings

Apply `supabase/migrations/202609300003_student_reviews.sql` in Supabase SQL Editor.
Tutors can rate their assigned student after a started session has ended, from the
end screen or session payment history. Reviews are immutable, one per session;
identical retries are safe. They do not affect payment release or disputes.
Open request cards show the student's aggregate rating and review count. Unrated
students are labelled as new/unrated; unavailable ratings are not shown as zero.
Admin student activity uses received tutor ratings separately from reviews given
to tutors. Live verification is pending after applying the migration.

# Student recording downloads and 15-minute retention

Apply supabase/migrations/202610080001_recording_retention_15_minutes.sql in
Supabase SQL Editor after the session recording migration. It is transactional
and rerunnable. Application service-role credentials cannot apply schema changes.

Students can download their own recordings from the session end screen or
Student > History for 15 minutes from the server-recorded session end.
Signed download links expire within that window. After 15 minutes, the existing
recording maintenance job removes ordinary recordings from Cloudflare R2.
Deletion happens on the next successful cleanup run, not at the exact second.
Keep npm run recordings:worker running or schedule authenticated calls to
/api/cron/recordings at least once a minute using CRON_SECRET. Without a running
worker or scheduler, R2 files will not be deleted automatically.

Held/disputed payments preserve available recordings until admin resolution.
The payment dispute/release window remains 20 minutes; disputes opened after
video deletion remain valid but cannot recover deleted evidence.

Live validation: end a recorded session, download from History before 15 minutes,
then verify the download closes and the R2 object is deleted after the next
cleanup run. Repeat with a held payment and verify its recording is preserved.
