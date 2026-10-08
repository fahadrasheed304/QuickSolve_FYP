# Tutor teaching demos

## Deployment

Apply `supabase/migrations/202610080002_tutor_teaching_demos.sql` in Supabase SQL
Editor, then apply `supabase/migrations/202610080003_demo_review_emails.sql`, before
deploying the application. If the first migration is already applied, only the
email migration is needed. The first creates a private `tutor-demos`
Storage bucket and service-role-only tables/functions. Existing Supabase URL and
service-role environment variables are sufficient; no new provider is needed.
The project-wide Storage upload limit must allow 50 MB. The bucket permits MP4
only and caps files at 50 MB. Never make this bucket public or add client write
policies. Videos upload directly with scoped signed upload URLs, avoiding Vercel's
request-body limit. The completion API downloads at most the bucket's limit and
parses the MP4 using MP4Box before making it reviewable.

Existing verified tutors must upload an approved demo for each subject before
placing new bids in that subject. Existing bids and ongoing sessions are not
invalidated. Profile submission requires pending or approved demos for every
selected subject. Test invitation and final admin verification require approved demos for all
selected subjects. Subject assessment and identity verification remain separate.

## Workflow

- Tutor: Profile completion's **Documents** step shows a separate upload form for
  each selected subject. Enter a topic and class/level, then upload an MP4 up to
  five minutes with both audio and video. Standard,
  non-fragmented MP4 is required; H.264/AAC is recommended for browser playback.
  The tutor cannot continue past Documents until each subject has a pending or
  approved demo. Server submission checks enforce the same requirement.
- Admin: **Teaching demos** queue or the tutor's verification detail. Watch the
  video, score accuracy, clarity, example and communication from 1 to 5. Approval
  requires at least 14/20 and accuracy of at least 4/5. These are product defaults,
  not validated educational standards. Changes requested require written feedback.
  Each rejection queues an email in the same database transaction, then sends the
  subject, topic, feedback and an authenticated re-upload link via the existing
  `SMTP_EMAIL`/`SMTP_PASSWORD` configuration. Failed/pending deliveries stay in
  the admin queue with **Retry email**; retry does not repeat the review. A stalled
  send may be retried after five minutes. An SMTP success means the SMTP service
  accepted the email, not that inbox delivery is guaranteed.
- Re-upload: the **waiting-verification page** contains the same subject forms,
  feedback and video previews. Email links focus the affected subject and preserve
  that destination through password/Google sign-in. Verified tutors are sent to
  the affected subject in **My Subjects**. Other approved demos stay unchanged.
- Student: **Watch teaching demo** on a bid. Tutor and subject are resolved from
  the student's own bid. Only the currently approved version is served.
- Replacement: a tutor may submit a new version while the approved version stays
  visible. Approval atomically supersedes the old version. Rejection keeps the old
  approved version. Pending submissions can be cancelled and replaced.

Uploads are limited to ten attempts per tutor per rolling day, and one unfinished
or pending submission per subject. An interrupted completed upload can be retried
with **Retry submission**. Failed/incomplete uploads can be cancelled. Upload
reservations expire after two hours when a new reservation is requested.

Playback links expire after ten minutes. Anyone holding an issued link can play
it during that interval. The player requests a fresh link on each open/retry.

## Maintenance

Run `npm run demos:cleanup` from a trusted environment with Supabase credentials
daily (or schedule that command). It processes up to 100 obsolete entries per run;
repeat for a backlog. It expires uploads older than a day and removes only
cancelled/superseded videos. Approved, pending and rejected review evidence stays
private. This maintenance is independent of session/dispute recording retention.

## Acceptance checks

1. Upload a real MP4 as a tutor; confirm it is pending and refresh survives.
2. Check over-five-minute, audio-only and invalid files are rejected by the server.
3. Confirm profile submission rejects missing subject demos and new bids reject
   subjects with no approved demo.
4. As admin, request changes with feedback; resubmit and approve a revised demo.
5. As the problem owner, play the approved subject demo from the bid. Other
   students, signed-out clients and other tutors must not access private videos.
6. Submit a replacement; confirm students still see the old approved version until
   the replacement passes review. Cancelling/rejecting must preserve the old demo.
7. Check both desktop and mobile playback with an actual uploaded video, including
   an expired-link retry. Storage/API/browser tests must use the deployed project
   after the migration; local mocked UI tests do not prove live Storage behavior.
