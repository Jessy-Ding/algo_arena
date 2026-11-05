# Improvement log

Each entry: what was reviewed, what was found (severity, evidence), what changed, and how it was verified.
"Dev env" means the developer sandbox (mock runtime, no network); it is not evidence from Firebase or real devices.

## History before B2
- 2.1.1: native confirm()/prompt() blocked in the sandboxed artifact frame made Delete, Add link, Add note and End game do nothing. Replaced with in-page dialogs; End game had also skipped its confirmation because the click event was read as "finished naturally". Verified: 19/19 dialog checks, dev env.
- B1: the rules require the sealed answer `ct` to be a string, but the page wrote an object; every real answer would have been refused in production. Found by the JavaScript mirror of the rules in the browser test. Fixed by storing `JSON.stringify(sealed)`. Verified: 27/27, dev env.

## B2, cycle 1: build
- Added `functions/coach-core.js` (pure logic), `functions/deps.js` (Firestore), `functions/index.js` (callable `coach`), the `sample` capability in `site/platform-firebase.js`, and the mock callable plus a fake Anthropic API in the harness.
- Verified: unit 15/15, browser 35/35 (dev env). Covered: request shape, tier-to-model mapping, caps, error mapping with quota refunds, retry after HTTP 529, reports delivered to players, log without student text.

## B2, cycle 2: review and fixes
| id | area | severity | finding | change | verified by |
|---|---|---|---|---|---|
| R1 | trust boundary, cost | High | A user could write their own `pub/{uid}` record and become "a player who joined", unlocking AI calls on the course's key | Eligibility now requires the host's own session record (not writable by players) to list the user, and the session to be under 3 days old | 2 new unit tests (forged record, missing session); browser check "forged player record does not unlock AI calls" |
| R2 | security rules | Medium | No test proved that quota counters and the AI log are closed to clients | Added a rules test (reads and writes refused for owner and host) | rules test written; emulator NOT RUN |
| R3 | privacy | Medium | No check that AI prompts are free of display names | Browser check that no prompt contains a display name (prompts send totals, topics and per-question data only) | browser check |
- Verified: unit 17/17, browser 37/37 (dev env).

## B2, cycle 3: re-review (stop)
No High findings left that can be fixed and verified here. Remaining Medium and Low items need the user's environment or a product decision; they are listed in RECURSIVE_IMPROVEMENT_PROMPT.md section 7.

## B2, cycle 4: per-session AI quota (user decision C)
- Decision: hosts get 2 x participants + 1 AI calls per session plus a daily guard; players keep 3 a day. A flat daily cap of 15 would have covered only 7 to 14 players per game.
- Change: every AI call from the page names its session (`sid`); the function reads the host's own session record (must exist and be ended), counts the daily and the per-session counters in one transaction, and refunds both on upstream failure. Players may only name the session they played in.
- Verified: unit 27/27 (10 new: formula, per-session cap, separate sessions, missing or malformed sid, another host's session, session not ended, refund of both counters, daily guard, player sid check); browser 39/39 (session counter and cap 5 for 2 players, host stopped at the cap, call without a session refused). Developer sandbox.
- Open: JSON parse retries count against the session allowance (documented in README as a known limit).

## B2, cycle 5: no token-consuming automatic retries (user request)
- Change: the page retries only `rate_limited` (HTTP 429 and now 529, both unprocessed requests). Unparseable or empty replies are no longer retried; reports over 300 words are shortened locally instead of a second AI call.
- Verified: unit 27/27; browser 41/41 (unparseable reply: 1 call then failure; long report: 1 call, 300 words or fewer). Developer sandbox.

## B2, cycle 6: report length and structure (user decision: all three, cap 400 words)
- Finding: the page already trims reports locally (composePersonal), so the cycle-5 trimming duplicated it; and the prompt's limits allowed 309 words of model text before the fixed sections, so generated items were routinely discarded (wasted output tokens).
- Change: removed the duplicate; cap raised to 400 words; prompt limits set to 50-word summary and up to 3 items of 18 words per list so the maximum fits; report calls send `kind` and the function forces a server-defined tool schema (learning_report, class_summary).
- Verified: unit 32/32 (5 new: tool forcing and schema for both kinds, unknown kind, missing tool call, plain text without kind); browser 43/43 (both tools used, 400-word budget in prompts, long report trimmed to 400 or fewer with one call). Rebuild tool reproduces site/index.html byte for byte. Developer sandbox.

## Deep verification, round 1 (2026-10-29)
- Thresholds fixed before running: I4 95% limits of agreement within +/-250 ms (user); load at 120 and 240 clients (user: class of 61-120); mutation >= 70%, ratings mean >= 4/5 with weighted kappa >= 0.6, SUS >= 68 (proposed defaults).
- External oracle run here: tsc found 2 type errors in site/platform-firebase.js (undeclared window properties); fixed; 0 errors.
- Built the verification kit: property-based rules test against a reference model, coverage runner, Stryker config, CI workflow, staging driver (calibration and load), Bland-Altman analysis, AI export, grounding check, ledger reconciliation, blinded rating sheet and kappa. Analysis scripts checked on synthetic and planted data only.
- Threat model (STRIDE) mapped to tests; it exposed one untested control (admin and AI-host lists), now covered by a rules test.
- Still NOT RUN: everything that needs the emulator, CI, staging, the instructor or students. I6 (reference clicks) has no oracle yet.
- Browser mock suite was intermittent in the fresh-unzip check: 42/43 once, 43/43 in five reruns; the failing check was not captured. Next round: run it 20 times with full output and fix or widen the timing-bound check that flakes.

## Deep verification, round 2 (2026-10-29)
- Baseline: test/e2e run 20 times with full output. 18/20; both failures were "A's score follows the server elapsed
  time", only when elapsed ms % 30 == 15: the test used Python `round` (half to even) against the page's JavaScript
  `Math.round` (half up). The test was wrong, not the page. Fixed; 20/20 (local, mock: regression only).
- Rules on the emulator (v1.22.0): emulator and reference model agreed on every case once the property test could
  run. Fixes were all in the tests: one Firestore instance per context, serial test files (a shared clearFirestore
  raced), per-file coverage capture (loading rules resets the counters), and a biased generator (the uniform one
  reached the answer-window check about once in 4,600 cases; it now must reach all 6 window paths). Coverage gate
  `verify/rules/coverage_check.py` found 17 condition gaps; 5 new example tests closed them. Result: 22/22, 500
  cases with 0 disagreements, 74/74 conditions seen true and false. firestore.rules logic unchanged.
- Mutation (StrykerJS 8.7.1, local): 77.15% with the round-1 tests; about 21 new unit tests, 97.29% (430 killed,
  12 survived, each argued equivalent in `verify/evidence/round2/MUTATION_SURVIVORS.md`). Three test defects found:
  an in-place sort of a shared frozen schema, a model test compared against the value under test, no refund test
  above 1.
- File headers, Google-style comments and MIT LICENSE.md (user request). site/index.html gets its comments from an
  overlay (`tools/apply_index_comments.py`, `tools/index-comments/`), so the frozen 2.1.1 source stays untouched.
  All suites re-run after the comments with the same results. Pinning tsc 6.0.3 in CI exposed a type error in one
  added JSDoc type (optional fields); fixed.
- Documentation fixes: Java 21+ (firebase-tools 15 refuses older), Spark with `coach: false` until Blaze, load sizes
  120 and 240 (not 150), survivor line numbers after the comments, round-1 date (it was written in UTC).
- CI on `verify/firebase-round2`: run 1 failed in browser-mock before any test (Playwright 1.57.0 cannot install
  Chromium on ubuntu-latest, now 26.04); fixed by pinning that job to ubuntu-24.04. Run 2 green on all three jobs
  with the same numbers as locally: https://github.com/yikangliu823/algo_arena/actions/runs/41004361852. Also failed run: https://github.com/yikangliu823/algo_arena/actions/runs/41004048849.
- firestore.rules deployed to algoarena-for-research from the CI-tested file (user approved).
- Decisions (user): Blaze approved (not yet enabled); staging uses the current project algoarena-for-research
  (Firestore `nam5`); two project members to be added later; rules deploy approved after tests pass (done).
- Note on cycle 4's open item: JSON-parse retries no longer exist (removed in cycle 5), so that limit is gone.
- Still NOT RUN: I4 timing, load, I5, I7, C5, C6. I6 has no oracle yet.

## Deep verification, round 3 (2026-10-29)
- Baseline on branch `verify/firebase-round3`: every suite passed once (unit 53/53, tsc 0, rules 22/22 + 500 cases,
  coverage 74/74, e2e 43/43, mutation 97.29%); round 2's last CI run was green.
- I6 oracle built (`verify/i6/`): the real page and Firebase SDK on the Auth and Firestore emulators, three browser
  contexts, 11 scripted reference clicks across the three recording paths, checked against the page's own export.
  11/11 recorded exactly once in 3 of 3 runs; the negative control fails as it should. Getting there needed an
  `auth` entry in firebase.json (the Auth emulator did not start without it).
- Coach wiring on the Functions emulator with the real firebase-functions and firebase-admin: 13/13. Anthropic is a
  local fake reached through a preload that rewrites only the API URL; the fake key lives in functions/.secret.local
  for the run only. iCloud Drive (the project is under Desktop) left a conflict copy `.secret 2.local` holding the
  fake value; removed, ignored, and the runner now deletes such copies.
- The 12 "equivalent" mutants were rerun with the emulator suite as the test command: none killed.
- Runtime: nodejs20 is decommissioned on 2026-10-30 per Google's runtime table; switched to nodejs22 (user decision).
- Comments cleaned to the user's rules (agent.md): docstrings only on public functions, JS type tags kept (user
  decision), why-comments only; the index.html overlay went from 289 entries to 17. Code identity proven against
  b601d21 for every changed file.
- Findings not fixed (no product change this round): the e2e mock gives every auto-id document the id "x", so
  mock-only tests cannot catch overwrites of auto-id documents; the export's clock_offset_ms and clock_rtt_ms are
  always null, as its own field notes say.
- CI on `verify/firebase-round3` at 7e7ce47: all 5 jobs green on Node 22, including the new i6-emulator and
  coach-wiring-emulator jobs: https://github.com/yikangliu823/algo_arena/actions/runs/41008562398.
- Still NOT RUN: I4 timing, load, I5, I7, C5, C6, and the deploy of the coach function (needs Blaze and the secret).

## Go-live, M4 to M5 (2026-10-29)
- Site published from `verify/firebase-round3` to GitHub Pages (algo_arena made public at the user's request).
- Defect 1, found on the live site: redirect sign-in returned with no user and no error. Cause: the page is on
  github.io and the auth helper on firebaseapp.com; Chrome 115+, Firefox 109+ and Safari 16.1+ block that third-party
  storage (Firebase redirect best practices). Fix (user decision): popup only, with a plain message when the popup is
  blocked. Mock e2e check added (44/44).
- Defect 2, found in the live site's console: the server-clock probe used `data/users/<uid>/clock/probe`, an odd-length
  document path, so every estimate failed and devices unlocked by their own clock. A device clock running fast would
  unlock before the server opens answers and have its taps refused (I4). Same path in verify/staging/driver.mjs.
  Fixed to `data/users/<uid>/clock`. Why the tests missed it: the mock accepted any path; it now refuses odd document
  paths like the SDK (and returns real auto ids). The I6 oracle (real SDK, emulator) now fails on a clock-estimate
  warning: 3 failures with the old code, 0 with the fix.
- Default reading time 10 s -> 5 s (user decision, 2026-10-29): build patch `default_read_5`; hosts can still set 0 to
  60 s. Sessions store their own readS, so exports of earlier sessions are unchanged. Mock e2e checks the default.
- Question bank: 40 all-caps person names recased in 37 questions (user decision, 2026-10-29), for example DIJKSTRA to
  Dijkstra, BELLMAN-FORD to Bellman-Ford; GRAHAM-SCAN became "Graham's scan" and EXTENDED-EUCLID "Extended Euclid".
  Checked: every other character is unchanged; each changed question's provenance now says so. Research effect: the
  question_key and session content_hash of these 37 questions differ from earlier sessions, so repeat-exposure counts
  restart for them. No study sessions exist yet. CLRS procedure names without a person's name (INSERTION-SORT,
  EXTRACT-MIN) and the emphasis words (NOT, FALSE, TRUE, TO, FRACTIONAL) and KNAPSACK, HALTING are unchanged.

## M7, AI reports live (2026-11-04)
- Blaze on, $10 Google budget alert, `ANTHROPIC_API_KEY` in Secret Manager (set by the user), coach deployed to
  us-central1 (nodejs22), site `coach: true`.
- Defect 3, found in the first live report: every report call returned `invalid_argument`. Cause (Anthropic docs,
  "Define tools"): Claude Sonnet 5.5 and Opus 5.5 answer a forced `tool_choice` with HTTP 400, and coach forced a tool
  for every report. Why the tests missed it: every fake Anthropic accepted any request. The function also dropped
  Anthropic's error text, so the log showed no cause.
- Fix: report kinds use structured outputs (`output_config.format`, JSON in a text block) and must parse to a JSON
  object; `maxItems` removed from the schemas because structured outputs reject it (the page already trims the lists to
  3 and 4). Refusals with an upstream status now log Anthropic's error type and message (no prompt or reply).
- Tests: `functions/test/anthropic-contract.mjs` holds the documented request rules; the unit fake, the emulator fake
  server and the browser fake answer HTTP 400 when a request breaks them. Unit 55/55 (7 fail on the old code), coach
  wiring 13/13 on the Functions emulator, browser 45/45, tsc 0. Not yet run: a live report after redeploy.
