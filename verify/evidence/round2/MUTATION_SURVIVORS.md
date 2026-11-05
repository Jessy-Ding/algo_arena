# Surviving mutants after round 2 (StrykerJS 8.7.1, local run, 2026-10-29)

Baseline from the round-1 tests: 77.15% (341 killed, 101 survived; `mutation-baseline.json`).
After the round-2 tests in `functions/test/coach-core.test.mjs`: 97.29% (430 killed, 12 survived; `mutation-final.json`;
the HTML view of the same run was removed on 2026-11-04, see below). Each of the 12 survivors is argued equivalent below: no input reachable through `runCoach`
and the Admin SDK can tell the mutant from the original. "Equivalent" is my judgment from reading the code; the
argument for each is given so it can be checked.

Line numbers refer to the current, commented source. `mutation-final.json` was produced before the file headers
and comments were added, so it reports the same 12 mutants at earlier lines (coach-core.js 119, 126, 129; deps.js 4,
11, 15, 28, 29, 30). The re-run after the comments (`after-comments/mutation.log`) lists them at the lines below.

| # | Location | Mutant | Why it is equivalent |
|---|---|---|---|
| 1 | coach-core.js:193 | `res.json().catch(() => null)` -> `() => undefined` | `json` is only read as `json && json.content` and `json.usage`/`json.stop_reason` after a non-empty text was found; with an unreadable body both `null` and `undefined` give no blocks, then `empty_completion` (or the HTTP mapping when `!res.ok`). |
| 2 | coach-core.js:200 | `if (m.refund)` -> `if (true)` | `mapStatus` returns `refund: true` on every branch, so the condition is always true. The `refund` field is dead today; kept so a future non-refunded status needs no control-flow change. |
| 3 | coach-core.js:203 | `json.content \|\| []` -> `\|\| ["Stryker was here"]` | A string element has no `type`, so the text filter and the tool lookup both skip it; the result is the same empty text. |
| 4 | deps.js:31 | `s.get("uids") \|\| []` -> `\|\| ["Stryker was here"]` | Differs only if a uid equals the literal string; Firebase Auth uids are 28-character identifiers without spaces. |
| 5 | deps.js:49 | `if (!p.exists) return false` -> `if (false)` | For a missing document the Admin SDK's `DocumentSnapshot.get()` returns `undefined`, so the next guard (`!sid \|\| !host`) returns the same `false`. Redundant guard, kept for clarity. |
| 6 | deps.js:53 | `participants \|\| []` -> `\|\| ["Stryker was here"]` | `.some((x) => x && x.uid === uid)`: a string has no `uid`, so the result is unchanged. |
| 7 | deps.js:80 | `{ ok: false, limit: "daily" }` -> `{}` | `runCoach` tests `!q.ok` (true for both) and distinguishes only `limit === "session"`; any other value gives the daily message. |
| 8 | deps.js:80 | `limit: "daily"` -> `limit: ""` | Same as 7. |
| 9 | deps.js:81 | daily counter `{ merge: true }` -> `{}` | The consume write sets every field this code ever stores in the daily document (`uid, day, count, updatedAt`), so replacing and merging give the same document. |
| 10 | deps.js:81 | daily counter `merge: true` -> `merge: false` | Same as 9. |
| 11 | deps.js:82 | session counter `{ merge: true }` -> `{}` | Same as 9 for the session document (`uid, sid, count, cap, updatedAt`). |
| 12 | deps.js:82 | session counter `merge: true` -> `merge: false` | Same as 11. |

Note on 9 to 12: the refund write (deps.js:95) only sets `count` and `updatedAt`, so its `merge: true` is not
equivalent. That mutant survived in round 1 and is now killed by "a refund decrements the counters by one and keeps
the other fields". Equivalence of 9 to 12 holds only while the consume write stays complete; if a field is added to
the quota documents elsewhere, these mutants become meaningful again.

## Defects found in the tests while doing this
- `class summaries force the class_summary tool` sorted `SCHEMAS.class.input_schema.required` in place
  (`Object.freeze` is shallow), so every later test saw a reordered shared schema. Fixed to sort a copy.
- `default tier uses the default model` compared with `DEFAULTS.models.default`, which is the value under test, so a
  wrong model id could not fail it. The tier-to-model test now uses literal ids.
- Refund arithmetic had no test where the counter was above 1, so a refund that reset the counter to 0 passed.

The HTML report (`mutation-final.html.gz`) was removed on 2026-11-04 at the owner's request, because the
Prism.js syntax highlighter bundled in it lists Gherkin keywords in Chinese among other languages and the repository
keeps no Chinese text. It only displayed `mutation-final.json`, which is unchanged and holds every result above.
