# QuickSolve requirements audit — 25 September 2026

> FR-40 follow-up: bid API now checks the stored problem subject against the signed-in
> tutor's saved subjects. Empty/mismatched subjects return 403; matching bids display
> the actual problem subject. Local `202609260004_bid_subject_match.sql` enforces
> the same rule on new database writes. Live migration/browser verification pending.
>
> FR-54 follow-up: persistent review-triggered flags/restrictions, confirmed violation
> decisions, admin clearance with retained audit history, paginated admin queue and
> tutor status panel are implemented. New bidding/acceptance is database-enforced;
> existing accepted sessions/wallets remain available. Apply local
> `202609260003_tutor_conduct.sql`; live verification remains pending.
>
> FR-53 follow-up: server-side bid recommendations now combine current ratings,
> recent resolved payment outcomes and qualifying test scores, with neutral baselines
> for new/admin-verified tutors. Cards show reasons and scores; ordering refreshes
> with the bid feed. No new migration; live UI verification remains pending.
>
> FR-51 follow-up: dedicated tutor wallet, SQL lifetime earnings, pending/held totals,
> date/type filters, cursor-paginated ledger and paginated session payments are
> implemented. Static tutor activity placeholders were removed. Apply local
> `202609260002_tutor_wallet_history.sql`; live browser/deployment verification is
> pending. The historical FR-51 row below predates this implementation.
>
> FR-38 follow-up: advisory evaluation is implemented in the tutor dashboard and
> admin tutor detail using the latest 20 payment records, ratings and written feedback.
> Five-rating minimum, low-average and resolved-refund thresholds, automatic refresh
> and server-scoped access are implemented; no new migration. Live UI verification
> remains pending. The historical FR-38 row below predates this implementation.
> FR-33 is Complete under the user's accepted FYP scope: admin verification without
> a test is an intentional override and must remain available.
>
> FR-27 follow-up (26 September 2026): signed LiveKit participant-joined webhook,
> selected-tutor validation, one saved student alert per active session and a direct
> session link are implemented. Apply local, Git-ignored
> `supabase/migrations/202609260001_tutor_join_notifications.sql` and configure
> `/api/livekit/webhook` in LiveKit. Live two-browser acceptance testing remains
> pending; the historical FR-27 Missing row below predates this implementation.
>
> Implementation follow-up: live request/bid notifications, saved inbox/read state,
> acceptance alerts and reconnect recovery have now been added in code. Apply
> `supabase/migrations/202609250003_realtime_notifications.sql` before live use.
> FR-3/4/26/39/42 now have a push-delivery implementation pending deployed acceptance
> testing. FR-8/43 now also have atomic rejection and rejection alerts in migration
> `202609250004_reject_unselected_bids.sql`, pending database application and live testing.
> FR-27 (tutor join
> notifications) remains outside this change. The counts below preserve the original
> pre-change audit, not a new live-verified completion score.

> Escrow follow-up: migration `202609250005_session_escrow.sql` adds acceptance-time
> reserves, extension reserves and settlement without a second base charge (FR-18).
> Database application and live acceptance testing remain pending. Existing accepted
> sessions retain legacy billing. Stripe sandbox is explicitly accepted for the current
> project scope; live payments are not required for this phase.

> Payment-resolution follow-up: migration `202609250006_payment_resolution.sql` and
> `/admin/payments` add automatic queueing of completed escrow-funded sessions without
> reviews, held-payment review, full wallet refunds/releases and recorded admin decisions.
> Live Cron/database verification remains pending. Legacy sessions without reserves
> retain their old billing path. Recording evidence is still unavailable.

Current local working tree (including existing uncommitted work) compared with the supplied FR-1–FR-69. No application code changed.

## Scope and scoring

**Complete = implementation present in the inspected code**, not production certification. Partial = relevant implementation exists but a stated requirement or enforcement step is missing. Missing = required functional path not found. External Supabase migrations/cron deployment, Stripe checkout, LiveKit calls and real camera proctoring were not verified against live services.

| Scope | Complete | Partial | Missing | Weighted coverage |
|---|---:|---:|---:|---:|
| Student | 17 | 6 | 6 | 69.0% |
| Tutor | 11 | 12 | 2 | 68.0% |
| Admin | 1 | 4 | 10 | 20.0% |
| Total | 29 | 22 | 18 | 58.0% |

Equal-weight estimate: Complete = 1, Partial = 0.5, Missing = 0. This measures requirement coverage, not engineering effort or time remaining. Fully implemented requirements alone: 29/69 = 42.0%; weighted coverage: 40/69 = 58.0%.

## Requirement-by-requirement assessment

| FR | Status | Finding |
|---|---|---|
| FR-1 | Complete | Text aur image upload, storage aur problem creation implemented. |
| FR-2 | Complete | Subject aur duration input aur API required-field checks implemented. |
| FR-3 | Partial | Subject-filtered request feed hai; instant broadcast nahi, 5-second polling. |
| FR-4 | Partial | Active tutor dashboard requests poll karta hai; push delivery nahi. |
| FR-5 | Complete | Multiple bids database aur student list mein supported. |
| FR-6 | Complete | Bid cards price, rating, tutor details aur session duration dikhate hain. |
| FR-7 | Complete | Student selection authenticated acceptance API aur database function se hoti hai. |
| FR-8 | Partial | Selected session tutor dashboard par polling se aata hai; remaining bids explicit rejected nahi hote aur rejection alerts nahi. |
| FR-9 | Complete | Accept ke baad student session route khulta hai. |
| FR-10 | Complete | LiveKit room aur authorized token API integrated; live two-browser call audit mein test nahi ki. |
| FR-11 | Complete | LiveKit video conference aur chat integrated. |
| FR-12 | Missing | Shared whiteboard implementation nahi mili; marketing text aur review tag implementation nahi hain. |
| FR-13 | Missing | Whiteboard synchronization implementation nahi mili. |
| FR-14 | Complete | Last 5 minutes mein 5/10/15/30-minute extensions implemented. |
| FR-15 | Complete | Accepted bid rate se server-side extension charge aur updated deadline calculated. |
| FR-16 | Partial | Stripe Checkout/webhook implemented, lekin code sirf test keys aur sandbox events accept karta hai. |
| FR-17 | Complete | Authenticated wallet APIs, protected database functions, atomic updates aur duplicate-payment protection; relevant tests pass. |
| FR-18 | Missing | Start par sirf balance check: base amount reserve/debit nahi hoti. Pre-session escrow missing. |
| FR-19 | Partial | Payout path hai, lekin review submission required; 4-5 stars/no dispute release, baqi hold. Complete settlement lifecycle missing. |
| FR-20 | Complete | Prepaid extension amount final tutor payment mein exactly once include hoti hai; tested. |
| FR-21 | Complete | Student wallet transaction list aur backend transaction retrieval implemented. |
| FR-22 | Complete | Review stars persist aur aggregate tutor rating mein include hote hain. |
| FR-23 | Complete | Feedback text aur selected highlights persist hote hain. |
| FR-24 | Complete | Review/history dispute reason save hota hai aur payment hold hoti hai. |
| FR-25 | Missing | Dispute admin queue, routing/notification aur review workflow nahi mila. |
| FR-26 | Partial | Student bid list 5-second polling se refresh; dedicated bid notification flow missing. |
| FR-27 | Missing | Tutor join/accept event ke student notifications ka implementation nahi mila. |
| FR-28 | Complete | Last-5-minute extension reminder aur red/pulsing countdown implemented. |
| FR-29 | Missing | Completed-session recording access/player nahi mila. |
| FR-30 | Complete | Tutor signup aur professional profile completion implemented. |
| FR-31 | Complete | Subjects aur expertise/profile fields implemented. |
| FR-32 | Complete | Profiles, degrees, documents aur verification notes database mein managed. |
| FR-33 | Partial | Subject test aur 80% pass flow hai; admin verification API pass prerequisite enforce kiye baghair verified set kar sakti hai. |
| FR-34 | Partial | Camera/face/attention/tab proctoring implemented, lekin browser-reported status par trust; server-enforced attempt integrity incomplete. |
| FR-35 | Complete | Profile-photo descriptor aur live-face matching/detection implemented; real camera accuracy verify nahi ki. |
| FR-36 | Complete | Visibility-change aur window-blur detection implemented. |
| FR-37 | Partial | Warning/cancel/failure flow hai; final warning acknowledgement par submission aur client-supplied status/counters par trust. |
| FR-38 | Partial | Average rating/session/earnings stats update; comprehensive outcome-based continuous evaluation missing. |
| FR-39 | Partial | Requests tutor dashboard par 5-second polling se milte hain. |
| FR-40 | Partial | Subject filtering hai; empty subject list query ko unrestricted chhor deti hai, bid endpoint subject match enforce nahi karta. |
| FR-41 | Complete | Verified/available tutor bid submission implemented. |
| FR-42 | Partial | Student polls bids every 5 seconds; instant delivery missing. |
| FR-43 | Partial | Acceptance active-session card mein poll hoti hai; explicit acceptance/rejection notification system incomplete. |
| FR-44 | Complete | Selected tutor active-session join aur authenticated LiveKit access implemented. |
| FR-45 | Complete | Tutor LiveKit audio/video controls integrated. |
| FR-46 | Missing | Tutor shared whiteboard implementation nahi mili. |
| FR-47 | Complete | Availability toggle aur persisted API implemented. |
| FR-48 | Complete | Explicitly unavailable tutors ko open-problems API empty result aur bidding API rejection deti hai. |
| FR-49 | Partial | Tutor wallet credit implemented; review-dependent settlement/held-payment resolution incomplete. |
| FR-50 | Partial | Atomic tutor credit/retry protection exists, lekin prior escrow reserve missing. |
| FR-51 | Partial | Earnings totals aur recent session payments visible; tutor wallet page missing, activity rows static aur payment list limited to 50. |
| FR-52 | Complete | Tutor history payment/review section saved stars aur feedback dikhata hai. |
| FR-53 | Partial | Rating bid card par visible; ratings, performance aur test results se combined ranking/visibility rules nahi. |
| FR-54 | Missing | Persistent poor-performance/violation restriction policy implementation nahi mili. |
| FR-55 | Partial | Admin tutor verification list/manage kar sakta hai; all-student/all-user management missing. |
| FR-56 | Complete | Admin tutor approve/reject actions aur notes implemented; test-pass prerequisite gap FR-33 mein counted. |
| FR-57 | Missing | User suspend/permanent-ban workflow nahi mila. |
| FR-58 | Partial | Tutor profile/docs/test records available; all-user activity records missing. |
| FR-59 | Missing | Automatic audio/video/whiteboard session recording implementation nahi mili. |
| FR-60 | Missing | Session recording storage/access-control implementation nahi mili. |
| FR-61 | Missing | Admin recording access interface/API nahi mila. |
| FR-62 | Partial | Participants, accepted duration aur start/end metadata stored; admin session-review interface missing. |
| FR-63 | Missing | Recording-based dispute/performance review implementation nahi mili. |
| FR-64 | Missing | Admin dispute list/manage interface/API nahi mila. |
| FR-65 | Missing | Admin dispute evidence bundle aur recording access missing. |
| FR-66 | Missing | Admin refund approval/execution aur dispute-resolution actions missing. |
| FR-67 | Missing | System-wide users/sessions/revenue analytics dashboard/API nahi mila. |
| FR-68 | Missing | Performance/financial report generation/export nahi mila. |
| FR-69 | Partial | Proctoring warnings/cancelled test records admin tutor details mein available; platform-wide suspicious-activity queue/alerts missing. |

## Main evidence

Paths below are relative to this report's directory.

- Posting, subject filtering, bids: [problem API](src/app/api/problems/route.ts), [database layer](src/lib/db.ts), [tutor feed](src/app/api/tutor/open-problems/route.ts), [bid API](src/app/api/tutor/bids/route.ts), [student dashboard](src/app/(dashboard)/student/dashboard/page.tsx), [tutor dashboard](src/app/(dashboard)/tutor/dashboard/page.tsx).
- Sessions: [LiveKit component](src/components/livekit/video-room.tsx), [token API](src/app/api/livekit/token/route.ts), [session state](src/app/api/sessions/state/route.ts), [extension UI](src/components/session-extension.tsx), [extension billing](supabase/migrations/202609250001_session_extensions.sql).
- Wallet and escrow gap: [acceptance/settlement SQL](supabase/migrations/202609210001_wallet_integrity.sql), [payment/review SQL and cron](supabase/migrations/202609220004_session_payments.sql), [sandbox top-up](src/app/api/wallet/topup/route.ts), [webhook](src/app/api/stripe/webhook/route.ts).
- Feedback/disputes: [review API](src/app/api/sessions/complete/route.ts), [payment/review UI](src/components/session-payments.tsx), [tutor ratings SQL](supabase/migrations/202609250002_tutor_ratings.sql), [tutor history](src/app/(dashboard)/tutor/history/page.tsx).
- Evaluation/admin: [test and face checks](src/app/(dashboard)/tutor/take-test/page.tsx), [test submission](src/app/api/tutor/test/submit/route.ts), [admin verification actions](src/app/api/admin/verifications/route.ts), [admin tutor detail](src/app/api/admin/tutor-detail/route.ts).

## Verification performed

`npm test`: **27 tests passed, 0 failed**. Existing tests exercise wallet integrity and rollback, payment validation, reviews/ratings, session extension pricing/retries, rejoin authorization, shared end-call behavior and pending-signup OTP handling. These are local tests, including isolated SQL execution and mocked dependencies; they do not establish that all 69 requirements work end-to-end. No production build or browser acceptance test was run for this audit.

## Suggested implementation order

1. Reserve base session funds at acceptance; close settlement paths when no review arrives; implement admin held-payment resolution/refunds.
2. Complete bid rejection and request/bid/join notifications; enforce subject relevance at API boundaries.
3. Implement synchronized shared whiteboard.
4. Implement recording, protected storage, student playback and admin evidence access.
5. Expand admin user management, bans, session/dispute review, analytics and reports.
6. Enforce test-pass activation and proctoring outcomes on the server; add performance-based ranking/restrictions and complete tutor history.
7. Verify deployed migrations/cron and run two-account browser acceptance flows; enable live payments if production funding is required.
