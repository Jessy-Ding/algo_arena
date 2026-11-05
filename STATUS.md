# AlgoArena route B: status

Updated 2026-10-29. One line per milestone, in order. A milestone is done only with the evidence named.

| # | Milestone | What you can do once it is done | Status | Evidence or blocker | Owner |
|---|---|---|---|---|---|
| M1 | Code complete (B0 to B2) | nothing yet; the code exists | DONE | IMPROVEMENT_LOG.md, B2 cycles 1 to 6 | Claude |
| M2 | Verified without live services | trust the rules, timing and AI quota logic | DONE | verify/EVIDENCE.md; CI green on Node 22, run 41008562398 | Claude |
| M3 | Security rules live | the database refuses forged, early, late and repeated answers | DONE | deployed to algoarena-for-research on 2026-10-29 | Claude |
| M4 | Site online at a public URL | open the app in a browser | DONE | https://yikangliu823.github.io/algo_arena/ serves 3.0.0-b2 and shows the sign-in screen with no console errors (Pages deploy run 41010189111); algo_arena made public on 2026-10-29 at your request | Claude |
| M5 | First sign-in, question bank imported, you are admin | create and host games | DONE | sign-in works on the live site (popup only); uid in meta/admins; bank/ holds the 252 questions (the site reads back 252); server-clock offset measured live (-137 ms) after the probe-path fix | you + Claude |
| M6 | Two-device test, including iPhone Safari sign-in | **use it in class, without AI reports** | DONE | you reported no problems (2026-10-29). Data from session Smvul4ovww4af: 2 players joined, Q1 opened early and Q2 after the full reading time, both answered Q1 and Q2 and saw the reveal, host ended the game during Q3 (no Q3 answers, none refused). Device type is not recorded in the data, so the iPhone part rests on your report | you |
| M7 | AI learning reports live | AI reports for hosts and players | NOT DONE | done 2026-10-30: Blaze on (billing account 01630E-DCFB4B-018724), budget alert $10 a month at 50/90/100%, alerts only. ANTHROPIC_API_KEY in Secret Manager, version 1 enabled (2026-11-04; key in Anthropic workspace AlgoArena). coach deployed 2026-11-04 (us-central1, nodejs22, 2nd gen); an unauthenticated call returns 403 not_granted. Anthropic auto-reload off and project spend limit set (you, 2026-11-04). Site coach: true live (b37f246). Next: one test session with a generated report (you + Claude) | you, then Claude |
| M8 | Classroom calibration and load at 120 and 240 | confidence that a full class of 120 works | NOT DONE | needs you on the classroom network | you + Claude |
| M9 | Research-ready: IRB approval, usability test with 5 students, pilot | data counts for the study | NOT DONE | university and instructor | you |

Where we are: M6 done, so the app is usable in class; image uploads are live. Next: M7 needs one live AI report (the
structured-output fix 353d46d is deployed but not yet proven against Anthropic); M8 needs the classroom.

## Done outside the milestones
- Question images and reference files upload to Cloud Storage (2026-11-04): live, approved hosts only. See
  IMPROVEMENT_LOG.md.

## Backlog (not scheduled)
- AI question generation: not in the code, and excluded from v1.0 by the PRD. Before any code: decide whether to change
  the PRD, the host quota for drafting questions, and human review before a draft enters a set. To be discussed in plan
  mode (user, 2026-10-29).
