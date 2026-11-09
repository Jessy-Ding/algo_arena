# STRIDE threat model, AlgoArena route B

Data flows: Google sign-in; room document (host writes, players read); answers (players create); pub records
(players write, their host reads); report deliveries (host writes, recipient reads); `coach` function (signed-in
callers; Anthropic API with a server-held key). The host is trusted; players and anyone with a Google account are not.

| # | STRIDE | Threat | Control | Test | Status |
|---|---|---|---|---|---|
| S1 | Spoofing | Answer as another student | rules: `d.uid == auth.uid` and id prefix | rules.test "another user"; properties.test (writerIsAuthor, idMatches) | emulator PASS (round 2) |
| S2 | Spoofing | Act as host (write the room) | rules: room write only by `hostId` | rules.test "only the host writes its room" | emulator PASS (round 2) |
| T1 | Tampering | Choose one's own answer time | rules: `srv == request.time` | rules.test "client-chosen timestamp"; properties.test (serverTime) | emulator PASS (round 2) |
| T2 | Tampering | Answer during reading or after the deadline | rules: answer window from server times | rules.test reading/deadline; properties.test (window) | emulator PASS (round 2) |
| T3 | Tampering | Change an answer after time is up, or rewrite the history of changes | rules: every selection is a create-only document inside the answer window; change n needs change n - 1 | rules.test "never overwritten", "change ... inside the window", "after the deadline"; properties.test (exists) | emulator PASS (2026-11-04) |
| T4 | Tampering | Reset one's AI quota | aiQuota closed to clients (default deny) | rules.test "AI quota counters... closed" | emulator PASS (round 2) |
| T5 | Tampering | Forge eligibility for AI calls | eligibility from the host's session record | functions unit "forged player record" | sandbox PASS |
| R1 | Repudiation | Dispute a recorded time or score | server timestamps; per-question logs; host events | export semantics | residual: host can edit own logs (host trusted) |
| I1 | Info disclosure | Read other players' answers | rules: author or host only | rules.test "readable by the host and their author" | emulator PASS (round 2) |
| I2 | Info disclosure | Read another player's pub record or report | rules: owner or named host; report id ends with recipient uid | rules.test pub, report deliveries | emulator PASS (round 2) |
| I3 | Info disclosure | Names or emails sent to the AI provider | prompts built from totals and per-question data | browser mock check; grounding.mjs on real reports | mock only; real NOT RUN |
| I4 | Info disclosure | Prompt or reply text in logs | aiLog stores sizes and hashes only | functions unit "call log" | sandbox PASS |
| D1 | Denial of service | Flood answers | create-only, at most 21 selections per question, only inside the window | rules.test "within 20 changes" | emulator PASS (2026-11-04) |
| D2 | Denial of service | Flood one's own pub record | none beyond Firestore limits | none | residual risk |
| D3 | Denial of service / cost | Drain the AI budget | host allowlist, per-session and daily caps, maxInstances 5, max_tokens | functions unit tests; reconcile.mjs | unit sandbox PASS; ledgers NOT RUN |
| E1 | Elevation | Become admin or AI host | meta/* write only by admins | rules.test "only admins can change the AI host list or the admin list" | emulator PASS (round 2) |
| T6 | Tampering | Replace or delete an uploaded question image | storage.rules: create only, `resource == null`; no update or delete | storage.test "cannot be overwritten or deleted" | emulator PASS (2026-11-04) |
| I5 | Info disclosure | Read an uploaded file without being in the game | none by design: files are public by link (random id, no listing) | storage.test "anyone may read", "nobody may list" | accepted: course material only |
| D4 | Denial of service / cost | Fill the bucket | storage.rules: approved hosts only, 20 MB per file, fixed types | storage.test (non-host, size, type) | emulator PASS (2026-11-04); no per-host total cap |
