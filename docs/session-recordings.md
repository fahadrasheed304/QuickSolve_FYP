# Session recording setup (Vercel + Supabase + Cloudflare R2)

The code records LiveKit room audio/video and published screen shares to private
720p MP4 files. Admins open **Payments → View session recordings** to play them.
Student/tutor accounts cannot list recordings or request playback links.
The separate QuickSolve whiteboard/chat UI is not captured automatically; share
the whiteboard screen in the call if it needs to appear in the video.

Recordings are eligible for cleanup 20 minutes after the session ends. A held
payment (dispute, low rating, or no-start review) preserves evidence until admin
resolution. Actual deletion happens on the next successful scheduled run, after
the recording has finished processing. Playback links last 15 minutes and anyone
holding an issued link can use it during that time; do not share them.

## 1. Create private R2 storage

In Cloudflare, open **Storage & databases → R2 → Overview**, activate R2 if needed,
and create a bucket named `quicksolve-recordings`. Leave public access disabled.
Create an R2 API token with **Object Read & Write**, scoped to this bucket. Save
the **Access Key ID**, **Secret Access Key**, and **S3 endpoint** in your password
manager. Use the S3 credentials, not the general Cloudflare API token string.

Official guide: https://developers.cloudflare.com/r2/get-started/s3/

Set the bucket CORS policy using your actual production origin:

```json
[
  {
    "AllowedOrigins": ["https://YOUR-APP.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Accept-Ranges", "Content-Length", "Content-Range", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add your custom domain if used. Do not configure an age-based R2 deletion rule
for `sessions/`: it cannot distinguish held dispute evidence. Do not enable
bucket retention locks that prevent the app's cleanup from deleting objects.
See https://developers.cloudflare.com/r2/buckets/cors/.

## 2. Apply the database migration

Apply `supabase/migrations/202609300004_session_recordings.sql` in Supabase SQL
Editor, after `202609250006_payment_resolution.sql` and the existing session
migrations. The recording migration is intentionally Git-ignored like the other
local admin migrations; supply this local file separately when deploying.

This changes the payment/dispute window from 5 to 20 minutes, extends pending
deadlines, and keeps existing holds. Apply before deploying the updated UI.
Re-running it is supported. Existing already released payments stay released.

Keep the existing `quicksolve-release-session-payments` Cron job enabled; the
recording job classifies ended sessions but does not replace payment release.

## 3. Add Vercel environment variables

Set these in the intended Vercel environment and, for local testing, `.env.local`:

```dotenv
RECORDING_ENABLED=false
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=quicksolve-recordings
R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
CRON_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
```

Existing `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
Supabase server credentials and `NEXT_PUBLIC_APP_URL` must also be configured.
The URL must be the production HTTPS origin, not a preview deployment URL.
Generate a cron secret locally, for example:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Recording keys and `CRON_SECRET` are server-only: do not prefix them with
`NEXT_PUBLIC_`, commit them, or paste them in chat.

## 4. Configure LiveKit webhooks

In the LiveKit project, configure a webhook pointing to:

```text
https://YOUR-PRODUCTION-DOMAIN/api/livekit/webhook
```

Use the API key whose secret matches `LIVEKIT_API_SECRET` in Vercel. Subscribe
to `egress_started`, `egress_updated`, `egress_ended` as well as the existing room
and participant events if the dashboard offers event filters. The endpoint
verifies the signature and raw body. Provider retries handle transient DB errors.
LiveKit Cloud includes the egress service; self-hosted LiveKit needs a separately
running egress service. Provider usage/billing must permit recording.

https://docs.livekit.io/transport/media/ingress-egress/egress/autoegress/

## 5. Schedule cleanup from Supabase to Vercel

Deploy the application with recording still disabled. In **Supabase Vault** add:

- `quicksolve_app_url`: your production HTTPS origin.
- `quicksolve_cron_secret`: the exact `CRON_SECRET` from Vercel.

Run `scripts/schedule-recording-cleanup.sql` in Supabase SQL Editor. It schedules
an authenticated call to `/api/cron/recordings` every minute. No Vercel Cron plan
is required. Use the production URL reachable by LiveKit and Supabase; deployment
protection/login redirects must not intercept these two service endpoints.

Verify `net._http_response` shows HTTP 200 for the cleanup job. A successful Cron
enqueue alone does not prove HTTP success. A 401 indicates the shared secret is
wrong; a 503 indicates missing configuration, migration, or provider failure.
Monitor and fix failed jobs: storage persists while cleanup is unavailable.

Scheduler references:
https://supabase.com/docs/guides/functions/schedule-functions
https://supabase.com/docs/guides/database/extensions/pg_net

For local development, with `npm run dev` running and the URL set to localhost,
use `npm run recordings:worker` in another terminal. `npm run recordings:cleanup`
performs one pass. Local webhooks need a public HTTPS tunnel or use the deployed
app for the live acceptance test. Do not run duplicate schedulers unnecessarily.

## 6. Enable and verify

Finish existing calls, set `RECORDING_ENABLED=true` in Vercel, then redeploy.
Rooms created before recording was enabled cannot be silently reused. Test a
new short session with student and tutor, publishing microphone/video/screen
share. Verify the call indicator says **Recording** (the enabled flag alone
does not mean the recorder is active).

1. End the session; verify a recording changes from processing to ready under
   Admin Payments and plays with audio/video.
2. Rejoin during a session; verify there is no duplicate recorder for the same
   live room. A recreated room can produce another recording part.
3. Open a student dispute within 20 minutes. Verify the payment is held and its
   R2 object remains after cleanup runs beyond 20 minutes.
4. Review the evidence, then resolve that held payment as admin. Verify a later
   cleanup deletes its R2 object and marks the recording deleted.
5. Verify an undisputed recording disappears after the window and that student,
   tutor, and signed-out requests to the playback API return 403.
6. Stop a session by clock expiry with both browsers closed; verify the cleanup
   job eventually closes any leftover LiveKit room.

Turning recording off prevents new auto-egress setup but does not disable
webhook processing, admin playback, or cleanup of existing recordings. Keep the
R2 keys, LiveKit keys and scheduler configured until retained evidence is cleared.
If LiveKit fails mid-call, the UI stops claiming an active recording; the failed
recording is shown to admins. Missing media cannot be reconstructed retroactively.
