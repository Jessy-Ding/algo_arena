# Deep verification prompt: AlgoArena route B (round 4)

Work in the project folder (branch `verify/firebase-round4`, cut from `verify/firebase-round3`). Run this where you can
install packages and start the Firebase Emulator Suite (for example Claude Code on my machine). Reply to me in Chinese;
keep code and documents in English. Follow agent.md for code style.

## Goal
Go deeper, not bigger. No new features. Move the remaining claims in verify/EVIDENCE.md from NOT RUN to evidence
from oracles independent of the author and of me. This round is the first that touches live services: be explicit
about what each step changes in algoarena-for-research and how it is undone.

## State after round 3
- Thresholds are fixed (do not change them without asking me): I4 95% limits of agreement within +/-250 ms; load at
  120 and 240 clients with join 100%, acceptance >= 99%, write p95 <= 500 ms; mutation >= 70%; rules coverage: every
  boolean condition seen true and false; I6: 100% of scripted clicks, no duplicates; AI ratings mean >= 4/5 with
  weighted kappa >= 0.6 and no ability claims; usability task success >= 80% and SUS >= 68.
- Evidence so far (see verify/EVIDENCE.md for links): tsc 0; rules 22/22 and 500 generated cases; coverage 74/74;
  mutation 97.29%; I6 11/11 on the emulator with a working negative control; coach wiring 13/13 on the Functions
  emulator; the 12 surviving mutants not killed by the emulator suite either; firestore.rules deployed (comments in
  the repository changed since, logic did not).
- Functions runtime is nodejs22 (nodejs20 was decommissioned on 2026-10-30). Node 22 itself has run only in CI.
- Known gaps: events of a player who joins another game before the host collects them are lost (documented, not
  measured); the e2e mock gives auto-id documents the id "x"; no live deploy of the coach function yet.
- The project folder is in iCloud Drive (under Desktop): never write a real secret into it, and expect conflict copies
  of files that are created and deleted quickly.

## This round, in order
1. Baseline: check out the branch, record tool versions, run every suite once, confirm CI is green.
2. Coach deploy, only after I confirm Blaze is on, the budget alert and the Anthropic spend limit are set, and
   `ANTHROPIC_API_KEY` is in Secret Manager (I set it myself). Ask me before the deploy. Then set `coach: true`, run
   one scripted session against the deployed function, export, `grounding.mjs`, `reconcile.mjs`. Tag every document
   the session writes and delete them afterwards, or say why they must stay.
3. Measure the documented I6 loss: a player who joins another game before the host opens the dashboard. Report how
   many events are lost; this is a negative result to record, not a bug to fix without asking me.
4. Make the e2e mock give auto-id documents distinct ids, and add a mock test that would have caught an overwrite.
5. Staging in algoarena-for-research: plan the tagging and cleanup before the run, show me the plan, then calibration
   from the classroom network and load at 120 and 240. If I am not in the classroom, stop before this step and say
   what you need from me.

## Rules of evidence
Label every result by where it ran (emulator, CI, staging, classroom, rater). Mock and sandbox results do not count.
Report negative and null results. Never ask for, print or store secrets.

## Unchanged decisions
Frozen Artifact 2.1.1; Google sign-in; scores not graded; server-authoritative answer timing; AI only through the
coach function with the key in Secret Manager; per-session AI quota 2 x participants + 1 plus a daily guard, players
3 a day; no token-consuming automatic retries; reports capped at 400 words with schema-forced output; Firebase
project under my account; Blaze approved; staging in algoarena-for-research; JS public functions keep JSDoc types.

## Output
1. verify/EVIDENCE.md updated: claim, oracle, threshold, result, where it ran, status.
2. Evidence files under verify/evidence/round4/.
3. Updated ZIP, an IMPROVEMENT_LOG.md entry, and this prompt rewritten for round 5.
4. A short Chinese summary: what is now proven, what failed, what is still not run.
