# QuickSolve FYP

## Local setup

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
