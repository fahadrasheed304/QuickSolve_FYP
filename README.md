# QuickSolve FYP

## Local setup

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
price, not an amount supplied by the browser. This is payment on completion;
funds are not reserved at bid acceptance. Insufficient funds at completion return
an error without changing the balance; top up and retry settlement.

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
