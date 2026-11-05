# AlgoArena route B (GitHub Pages + Firebase), stage B2

Stage B0: data model, Firestore security rules and their tests, project setup.
Stage B1: the 2.1.1 page running on Firebase, Google sign-in, server-timed answers, bank import tool.
Stage B2 (this package): AI learning reports through a Cloud Function. See IMPROVEMENT_LOG.md for review cycles and RECURSIVE_IMPROVEMENT_PROMPT.md to continue them.

## Layout

- `site/`: what GitHub Pages serves. `index.html` (AlgoArena 3.0.0-b1), `platform-firebase.js` (Firebase behind the capability interface the page uses), `firebase-config.js` (paste your web config here).
- `firestore.rules`, `firebase.json`, `firestore.indexes.json`: database rules and CLI config.
- `test/rules/`: rules tests for the Firebase emulator.
- `test/e2e/`: browser test of the page on an in-memory Firebase stand-in (`python3 build_app.py && python3 e2e_b.py`, needs Python Playwright).
- `tools/import-bank.mjs`: imports `data/bank.json` (252 questions) and sets `meta/admins`. `tools/build-from-2.1.1.py` rebuilds `site/index.html` from the frozen 2.1.1 page.

## Decisions

- Base: AlgoArena Live Classroom 2.1.1 (frozen claude.ai Artifact version), not v1.
- Hosting: GitHub Pages (static). Backend: Firebase on the Blaze plan with the AI coach function deployed and
  `coach: true`; on the free Spark plan, set `coach: false` and everything except AI reports works.
- Sign-in: Google accounts (Firebase Authentication), so one student keeps one pseudonymous research id across sessions and devices.
- Database: Cloud Firestore. The 2.1.1 code already uses a Firestore-style document API, so it ports through an adapter.
- AI Learning Coach: kept, through a Cloud Function that holds the Anthropic API key (stage B2).
- Scores do not count toward course grades. The host (instructor) is trusted; participants are not.

## What changes from the Artifact version

| Concern | Artifact 2.1.1 | Route B |
|---|---|---|
| Who can open it | Claude account, same organization | Any Google account |
| Answer timing | Participant device clock plus a ping/pong offset estimate | Firestore server timestamp, enforced by security rules |
| Early, late or repeated answers | Flagged by the host after the fact | Refused by the database |
| Who can read an answer | Everyone who can read the record, protected by encryption | Only its author and the host (encryption kept as a second layer) |
| Live updates | claude.ai room messages | Firestore listeners |
| AI reports | claude.ai `sample` | Cloud Function calling the Anthropic API |
| Uploaded images and PDFs | claude.ai assets | Cloud Storage (`assets/{uid}/{fileId}`), approved hosts only |

## Data model (Firestore paths)

- `data/users/{uid}/**`: everything a user owns (profile, question sets, hosted sessions and their logs, keys, joined games, answer reviews). Private to that user.
- `bank/{id}`, `meta/{id}`: built-in questions and metadata. Read by any signed-in user, written by admins listed in `meta/admins.uids`.
  Admins add, edit and delete single bank questions in the app (Built-in bank tab), so `bank/` in Firestore is the live
  bank and `data/bank.json` is the original 252-question import. Use "Download bank as JSON" for a backup; the
  same file loads back through "Replace or reload the built-in bank".
- `rooms/{hostUid}`: the live room. Read by any signed-in user, written by the host. While a question is open it holds `shownSrv` (server time the question appeared), `readS` (reading seconds), `q.T` (answer seconds) and optionally `openNowSrv` (server time the host opened answers early). It never holds the correct option before the reveal.
- `rooms/{hostUid}/answers/{uid}_{sid}_{qIndex}`: a participant's first selection for a question; a change is
  `{uid}_{sid}_{qIndex}_c{n}` (n 1 to 20). Every selection is a create-only document, and the host counts the highest
  n. Fields: `uid, sid, q, ct` (sealed choice), `srv` (server timestamp), and optional client telemetry `mono` (ms from unlock to tap, from `performance.now()`), `localAt, offset, rtt, dev`, and `n` on a change.
- `rooms/{hostUid}/r/{sid}_{uid}`: sealed AI-report delivery to one participant.
- `pub/{uid}`: the participant's record for the game they are in (name, public key, `host`, `sid`, events). Read by the participant and by the host it names. Host queries must include `where("host", "==", hostUid)`.

## Answer window enforced by the rules

An answer is accepted only if, at the server's own time of the write:

- the room status is `question`, and the answer is for the room's current `sid` and `qIndex`;
- `srv` equals the server timestamp of the request (a client cannot choose it);
- answers are open: `shownSrv + readS` (or `openNowSrv`) <= now <= open time + `T` seconds + 250 ms;
- the document id is `{uid}_{sid}_{qIndex}` (n absent or 0) or `{uid}_{sid}_{qIndex}_c{n}` with 1 <= n <= 20 and the
  previous selection already stored, and the document does not exist yet. A player can change their answer until the
  window closes; points and response time use the last selection.

Response time for scoring becomes `srv − open time`, both server clock. Network delay from the student's
device to Firestore is included in it; `mono` is kept alongside for analysis, labeled as client-reported.

## Setup (do these in the Firebase and Google Cloud consoles; labels may differ slightly)

1. Create a new Firebase project. Prefer an account owned by the course or the professor rather than a personal one, so data ownership is clear for the IRB.
2. Only if AI reports are approved: upgrade the project to the Blaze plan and set a budget alert in Google Cloud
   Billing. Otherwise stay on Spark with `coach: false` in `site/firebase-config.js`.
3. Create a Cloud Firestore database in production mode. Pick its location deliberately: it cannot be changed later, and the IRB protocol may ask where data is stored.
4. Authentication: enable the Google sign-in provider. Under authorized domains, add `yikangliu823.github.io`.
5. Register a Web app and copy its `firebaseConfig`. This config is not a secret (access is controlled by the rules), but keep the project id handy.
6. On your computer: install Node 22+ (the functions runtime is nodejs22; nodejs20 was decommissioned on 2026-10-30), Java 21+ (firebase-tools 15 refuses older Java for the emulator), and the Firebase CLI
   (`npm install -g firebase-tools@15.33.0`, the version CI uses), then `firebase login`.
7. Only with Blaze: create an Anthropic API key in the Anthropic Console for stage B2. Do not paste it into chat or into the page; it will be stored with `firebase functions:secrets:set ANTHROPIC_API_KEY`.

## Run the rules tests (stage B0 acceptance)

From the repository root:

```
cd test/rules && npm install && cd ../..
firebase emulators:exec --only firestore --project demo-algoarena "npm --prefix test/rules test"
```

All tests should pass. Round 2 ran them on the emulator: 22/22 example tests and 500 generated cases (see
verify/EVIDENCE.md). If a test fails, send the output; a failure can be in the rules or in the test.

## Deploy the rules (after the tests pass)

```
cp .firebaserc.example .firebaserc   # then put your project id in it
firebase deploy --only firestore:rules
```

## Go live (stage B1)

1. Paste your web config into `site/firebase-config.js`.
2. Run the rules tests (above) and deploy the rules.
3. Sign in once on the deployed page with your Google account, then copy your uid from the Firebase console (Authentication, Users).
4. Import the bank and make yourself admin: see the header of `tools/import-bank.mjs`.
5. Publish `site/` with GitHub Pages (for example as a `live/` folder of the existing repository), and make sure its domain is in the authorized domains list.
6. Two-device test with two Google accounts: reading phase, early open, scoring, review, export.

## AI learning reports (stage B2)

How it works: the page calls the callable function `coach` (functions/index.js). The function checks who is calling,
charges one unit of a daily quota, calls the Anthropic Messages API with the key from Secret Manager, and returns the text.

- Hosts: uids in `meta/aiHosts.uids` or `meta/admins.uids`. Every call names one of the host's own ended sessions, and each session allows 2 x participants + 1 successful calls (one report per player, one rewrite when a report runs long, one class summary). A daily guard of 250 calls per host applies on top. Failed calls are not counted.
- Players: only if the host's session record lists them and the session is under 3 days old, 3 calls a day (for "Generate my report"), counted separately from the host's session allowance.
- No token-consuming automatic retries: the page retries only HTTP 429 and 529 (the request was not processed). An unparseable reply marks that report failed (the host can retry it by hand), and a report over 400 words is shortened locally instead of asking the AI again.
- Models by tier: quick claude-haiku-5-5, default claude-sonnet-5-5, complex claude-opus-5-5 (edit `DEFAULTS` in functions/coach-core.js).
- Limits: prompt up to 24,000 characters, reply up to 1,200 tokens, 5 function instances. Personal reports are at most 400 words; the prompt's length limits (summary 50 words, lists of up to 3 items of 18 words) are set so the model's maximum output plus the fixed evidence and resource sections fits, so little generated text is thrown away.
- Structured output: report requests name their kind (`personal` or `class`); the function asks for structured output (`output_config.format`) with a JSON schema defined on the server, and refuses a reply that does not parse to a JSON object. Sonnet 5.5 and Opus 5.5 reject a forced tool call, and structured outputs reject `maxItems`, so list lengths are described in the schema and trimmed by the page.
- What is sent to Anthropic: question text, the player's per-question correctness and timing, topic totals. Display names are not sent. Put this in the IRB consent text.
- The call log (`aiLog`) keeps token counts, sizes and a hash, never the prompt or reply. `aiQuota` and `aiLog` are closed to all clients.

Deploy:

```
cd functions && npm install && npm test && cd ..
firebase functions:secrets:set ANTHROPIC_API_KEY     # paste the key at the prompt, never in chat or code
firebase deploy --only functions
```

Without the Blaze plan, skip this section and set `coach: false` in `site/firebase-config.js`; everything except AI reports works on the free Spark plan.

Then add hosts in the Firestore console: document `meta/aiHosts`, field `uids` (array of uids). Set a spend limit in the
Anthropic Console and a budget alert in Google Cloud Billing.

## Known limits

- `functions/index.js` and `functions/deps.js` are wired to firebase-functions and firebase-admin, which were not installable in the development sandbox. The logic in coach-core.js is unit-tested; the wiring is verified only once you run `npm test` and the functions emulator or a deploy.
- Uploaded files (question images and reference files: png, jpeg, gif, webp, PDF, mp4, webm, text, markdown; at most
  20 MB) are readable by anyone who has the link, because `<img>` and `<video>` cannot send a sign-in token. Links are
  random and listing is refused. Only uids in `meta/admins` or `meta/aiHosts` can upload. Needs the Blaze plan and a
  Storage bucket; otherwise set `assets: false` in `site/firebase-config.js`.
- Google sign-in is pop-up only. A redirect cannot complete on github.io: the sign-in helper is on firebaseapp.com and
  Chrome 115+, Firefox 109+ and Safari 16.1+ block that third-party storage. When the pop-up is blocked the page asks
  the user to allow pop-ups or to open the link in Safari or Chrome; links opened inside other apps (WeChat, Canvas
  app) may not sign in. Test it on iPhone Safari before class.
- The browser test checks the page against a JavaScript mirror of the rules, not the rules file; the rules file itself
  is tested on the emulator (`test/rules`).

## Verification kit (verify/)

Evidence status and run order: `verify/EVIDENCE.md`. Threat model: `verify/THREAT_MODEL.md`. CI: `.github/workflows/verify.yml`.

- Rules on the real engine: `firebase emulators:exec --only firestore --project demo-algoarena "bash test/rules/run-with-coverage.sh"` (22 example tests plus 500 property-based cases, coverage gate).
- Mutation testing: `cd functions && npm install && npm run mutation` (threshold 70%).
- Timing and load on a staging project: `verify/staging/driver.mjs`, then `python3 verify/analysis/bland_altman.py results/timing.csv` (pass: 95% limits of agreement within +/-250 ms).
- AI reports: `verify/ai/export-reports.mjs`, `grounding.mjs`, `reconcile.mjs`, `rating_sheet.py`, `kappa.py`.

## Next stages

- B1: done in this package.
- B2: done in this package.
- B3: staging deploy on GitHub Pages, two-device test, load tests at 120 and 240 clients, then a shadow run in one class with the frozen Artifact version as fallback.
