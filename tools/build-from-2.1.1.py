"""Builds site/index.html (route B) from the frozen AlgoArena Live Classroom 2.1.1 page.

Every change is an anchored text replacement: rep() and block() exit if an anchor is not unique, so a changed source
fails loudly instead of producing a half-patched page. After the patches, the file header and the JSDoc overlay in
tools/index-comments/ are inserted (tools/apply_index_comments.py); the frozen source itself is never modified.

Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
    Northeastern University
Version: 1.0
Created: October 29, 2026 · San Francisco, California, USA

License: This project is licensed under the MIT License — see LICENSE.md for details.
Copyright © 2026 Yikang (Richard) Liu.

Usage:
    python3 tools/build-from-2.1.1.py   # reads ../../algoarena-live-v2.1.1-freeze/index.html relative to tools/
"""
import sys

import os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "algoarena-live-v2.1.1-freeze", "index.html")  # frozen 2.1.1; adjust if stored elsewhere
OUT = os.path.join(HERE, "..", "site", "index.html")
s = open(SRC, encoding="utf-8").read()
n = 0


def rep(old, new, label):
    global s, n
    c = s.count(old)
    if c != 1:
        sys.exit(f"[{label}] anchor occurs {c} times, expected 1")
    s = s.replace(old, new); n += 1


def block(start, end, new, label):
    """Replaces from the unique `start` through the first `end` after it, inclusive; `end` need not be unique."""
    global s, n
    if s.count(start) != 1:
        sys.exit(f"[{label}] start occurs {s.count(start)} times")
    i = s.index(start); j = s.index(end, i) + len(end)
    s = s[:i] + new + s[j:]; n += 1


rep('const APP = { version: "2.1.1-live",', 'const APP = { version: "3.0.0-b2",', "version")
# 5 s default reading time (user decision, 2026-10-29); 2.1.1 used 10 s. Sessions record their own readS, so earlier
# exports are unaffected.
rep("const DEFAULT_READ = 10; // v2.1: seconds the question is visible, locked, before answers open",
    "const DEFAULT_READ = 5; // seconds the question is visible, locked, before answers open", "default_read_5")
# 10 s default answer time (user decision, 2026-11-04); 2.1.1 used 20 s. Hosts can still set 5 to 300 s, and a
# question's own time limit takes priority.
rep("const DEFAULT_T = 20;", "const DEFAULT_T = 10; // seconds to answer once answers open", "default_t_10")
# Uploaded files live in Cloud Storage (assets capability in platform-firebase.js), not at claude.ai's /_blob/ path.
rep('const blobUrl = (id) => id ? "/_blob/" + id : "";',
    'const blobUrl = (id) => !id ? "" : C.assets && C.assets.url ? C.assets.url(id) : "/_blob/" + id;', "blob_url")
# Built-in bank editing for admins (user decision, 2026-11-04): add, edit or delete one question at a time, and
# download the bank as JSON. The set editor's dialog is reused; S.qdraftBank sends its save to bank/{id}.
rep('ACT.addQ = () => { S.qdraft = normQ(', 'ACT.addQ = () => { S.qdraftBank = false; S.qdraft = normQ(', "bank_addq")
rep('ACT.editQ = (el) => { const i = Number(el.dataset.i); S.qdraft',
    'ACT.editQ = (el) => { S.qdraftBank = false; const i = Number(el.dataset.i); S.qdraft', "bank_editq")
rep('<h2 style="margin:0">${S.qdraftIndex < 0 ? "New question" : "Edit question " + (S.qdraftIndex + 1)}</h2>',
    '<h2 style="margin:0">${S.qdraftBank ? (S.qdraftIndex < 0 ? "New bank question" : "Edit bank question") : S.qdraftIndex < 0 ? "New question" : "Edit question " + (S.qdraftIndex + 1)}</h2>',
    "bank_title")
rep('ACT.saveQ = async () => {\n  const q = readQForm(); const errs = validateQ(q); if (errs.length) return toast("This question " + errs.join("; ") + ".");\n',
    'ACT.saveQ = async () => {\n  const q = readQForm(); const errs = validateQ(q); if (errs.length) return toast("This question " + errs.join("; ") + ".");\n'
    '  if (S.qdraftBank) return bankSaveQ(q);\n', "bank_saveq")
rep('data-up="bank"></label>',
    'data-up="bank"></label> <button class="btn" data-act="bankNewQ">New question</button>'
    '${S.bank.length ? \' <button class="btn ghost" data-act="bankDl">Download bank as JSON</button>\' : ""}', "bank_buttons")
rep('q.subtype, q.difficulty].filter(Boolean).map(esc).join(", ")}</span></div>\n'
    '    <div style="margin-top:6px;white-space:pre-wrap">${esc(q.prompt)}</div>',
    'q.subtype, q.difficulty].filter(Boolean).map(esc).join(", ")}</span>'
    '${S.isAdmin ? `<span class="spacer"></span><button class="btn sm" data-act="bankEditQ" data-id="${esc(q.id)}">Edit</button>'
    '<button class="btn sm danger" data-act="bankDelQ" data-id="${esc(q.id)}">Delete</button>` : ""}</div>\n'
    '    <div style="margin-top:6px;white-space:pre-wrap">${esc(q.prompt)}${q.img ? \' <span class="chip">Image prompt</span>\' : ""}</div>',
    "bank_card")
rep("/* ===================== Live Classroom: shared helpers ===================== */",
    "/* Built-in bank editing (admins): one question at a time in bank/{id}; meta/bank keeps the count. Sets and past\n"
    "   sessions hold their own copies, so an edit or a delete changes neither. */\n"
    "const bankDay = () => new Date().toISOString().slice(0, 10);\n"
    "async function bankCount() { const m = (await dget(P.bankMeta)) || {}; await dset(P.bankMeta, { ...m, count: S.bank.length, updatedAt: now() }); }\n"
    "ACT.bankNewQ = () => { S.qdraftBank = true; S.qdraft = normQ({ options: [\"\", \"\", \"\", \"\"], correct: -1 }, 0); S.qdraftIndex = -1; openDialog(qEditor); };\n"
    "ACT.bankEditQ = (el) => { const i = S.bank.findIndex((q) => q.id === el.dataset.id); if (i < 0) return; S.qdraftBank = true; S.qdraft = clone(S.bank[i]); S.qdraftIndex = i; openDialog(qEditor); };\n"
    "async function bankSaveQ(q) {\n"
    "  const isNew = S.qdraftIndex < 0;\n"
    "  const order = isNew ? (S.bank.length ? Math.max(...S.bank.map((x) => x.order ?? 0)) + 1 : 0) : q.order ?? 0;\n"
    "  // Provenance records each change, so research exports can tell a bank question was written or edited here.\n"
    "  const note = `${isNew ? \"Written\" : \"Edited\"} in AlgoArena on ${bankDay()}.`;\n"
    "  if (!String(q.provenance || \"\").includes(note)) q.provenance = [q.provenance, note].filter(Boolean).join(\" \");\n"
    "  await dset(`${P.bank}/${q.id}`, qDoc(q, order)); q.order = order;\n"
    "  if (isNew) S.bank.push(q); else S.bank[S.qdraftIndex] = q;\n"
    "  await bankCount(); S.dialog = null; S.qdraftBank = false; toast(isNew ? \"Added to the built-in bank.\" : \"Bank question saved.\"); rerender();\n"
    "}\n"
    "ACT.bankDelQ = async (el) => {\n"
    "  const q = S.bank.find((x) => x.id === el.dataset.id); if (!q) return;\n"
    "  if (!(await askConfirm(`Delete this question from the built-in bank? \"${q.prompt.slice(0, 120)}\" Your sets and past games keep their own copies.`, \"Delete\", true))) return;\n"
    "  await ddel(`${P.bank}/${q.id}`); S.bank = S.bank.filter((x) => x.id !== q.id); S.bankSel.delete(q.id);\n"
    "  await bankCount(); toast(\"Deleted from the built-in bank.\"); rerender();\n"
    "};\n"
    "// The same JSON array format the bank loader reads, so a download can be loaded back with Replace.\n"
    "ACT.bankDl = () => saveFile(`algoarena-bank-${bankDay()}.json`, JSON.stringify(S.bank.map(({ _id, ...q }) => q), null, 1));\n\n"
    "/* ===================== Live Classroom: shared helpers ===================== */", "bank_actions")
rep('const ARTIFACT_URL = "https://claude.ai/artifact/GwnVWEECxnYh9afck4RpGA";',
    'const ARTIFACT_URL = location.origin + location.pathname; // route B: the page\'s own address (GitHub Pages)', "url")
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>',
    '<script type="module" src="./platform-firebase.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>', "platform_script")
rep("<title>AlgoArena</title>", "<title>AlgoArena</title>", "title_present")

rep("  room: (h) => `rooms/${h}`, rep: (h) => `rooms/${h}/r`, pub: (u) => `pub/${u}`,\n",
    "  room: (h) => `rooms/${h}`, rep: (h) => `rooms/${h}/r`, pub: (u) => `pub/${u}`, answers: (h) => `rooms/${h}/answers`,\n", "paths")

# One clock: every timing decision uses the database server's time.
block("const hostNowEst = () => now() + (CLOCK.offset ?? 0);", "\n}\n",
      "/* Route B: every timing decision uses the database server's clock. Room times are server milliseconds\n"
      "   (shownSrv, openNowSrv); this device estimates server time from a measured offset. */\n"
      "const hostNowEst = () => (DB && DB.serverNow ? DB.serverNow() : now());\n"
      "const openOf = (r) => (!r ? null : r.openNowSrv != null ? r.openNowSrv : r.shownSrv != null ? r.shownSrv + (r.readS || 0) * 1000 : r.openAt != null ? r.openAt : r.shownAt);\n"
      "const deadlineOf = (r) => openOf(r) + ((r && r.q && r.q.T) || 0) * 1000;\n"
      "function pOpenLocal(r) { return openOf(r) - (DB && DB.serverOffset ? DB.serverOffset() : 0); }\n"
      "const ansOf = (uid) => (S.host && S.host.ans && S.host.ans[uid]) || {};\n",
      "clock")
rep('    const t = now(); const phase = t < openOf(r) ? "read" : "answer";', '    const t = hostNowEst(); const phase = t < openOf(r) ? "read" : "answer";', "host_tick_t")
rep("    const remain = r.deadline - t; updateRing(remain, r.q.T);", "    const remain = deadlineOf(r) - t; updateRing(remain, r.q.T);", "host_tick_remain")

# Host writes server-timestamp sentinels, then adopts the server's values.
block("async function hostWrite(patch) {", "\n}\n",
      "async function hostWrite(patch) {\n"
      "  const H = S.host; const full = { ...H.room, ...patch, v: (H.room.v || 0) + 1 };\n"
      "  const local = {}; for (const [k, v] of Object.entries(full)) local[k] = DB.isServerTime && DB.isServerTime(v) ? hostNowEst() : v;\n"
      "  H.room = local; H.pendingWrite = true;\n"
      "  try { await dset(P.room(S.uid), full); const fresh = await dget(P.room(S.uid)); if (fresh && fresh.v === full.v) H.room = fresh; } finally { H.pendingWrite = false; }\n"
      "  nudge(); rerender();\n"
      "}\n",
      "host_write")
block("async function showQuestion(i) {", "\n};\n",
      "async function showQuestion(i) {\n"
      "  const H = S.host; const q = H.qs[i]; const T = q.timeLimit || H.room.defaultT; const R = H.room.readS || 0;\n"
      "  H.phaseSeen = null;\n"
      "  await hostWrite({ status: \"question\", qIndex: i, q: { idx: i, id: q.id, prompt: q.prompt, img: q.img || \"\", options: q.options, T, R, topic: q.topic || \"\" }, shownSrv: DB.serverTime(), openNowSrv: null, shownAt: null, openAt: null, deadline: null, closed: null, reveal: null });\n"
      "  hostEvent(\"question_shown\", { q: i, qid: q.id, read_s: R });\n"
      "}\n"
      "ACT.hOpenNow = async () => {\n"
      "  const H = S.host; const r = H.room; if (r.status !== \"question\" || hostNowEst() >= openOf(r)) return;\n"
      "  await hostWrite({ openNowSrv: DB.serverTime() }); hostEvent(\"reading_skipped\", { q: r.qIndex });\n"
      "};\n",
      "show_question")

# The host reads answers from their own create-only documents.
rep("  H.unsubs.push(DB.collection(\"pub\").where(\"sid\", \"==\", H.sid).onSnapshot((qs) => {",
    "  H.unsubs.push(DB.collection(P.answers(S.uid)).where(\"sid\", \"==\", H.sid).onSnapshot((qs) => {\n"
    "    const ans = {}; for (const d of qs.docs) { const a = d.data(); (ans[a.uid] = ans[a.uid] || {})[a.q] = a; } H.ans = ans;\n"
    "    const t = now(); for (const [uid, m] of Object.entries(ans)) for (const k of Object.keys(m)) { const key = uid + \":\" + k; if (!H.observed[key]) H.observed[key] = t; }\n"
    "    hostChanged();\n"
    "  }, (e) => console.warn(e)));\n"
    "  H.unsubs.push(DB.collection(\"pub\").where(\"sid\", \"==\", H.sid).where(\"host\", \"==\", S.uid).onSnapshot((qs) => {",
    "host_listeners")
rep('const players = isCur ? S.host.players : new Map((await dlist("pub", (q) => q.where("sid", "==", sid))).map((p) => [p._id, p]));',
    'const players = isCur ? S.host.players : new Map((await dlist("pub", (q) => q.where("sid", "==", sid).where("host", "==", S.uid))).map((p) => [p._id, p]));',
    "finish_pub_query")
rep("  for (const [uid, p] of H.players) { const a = p.answers && p.answers[i]; const key = uid + \":\" + i;",
    "  for (const [uid, p] of H.players) { const a = ansOf(uid)[i]; const key = uid + \":\" + i;", "decrypt")
rep("function answeredUids(i) { const H = S.host; return [...H.players.keys()].filter((u) => { const a = H.players.get(u).answers; return a && a[i] && a[i].ct; }); }",
    "function answeredUids(i) { const H = S.host; return [...H.players.keys()].filter((u) => { const a = ansOf(u)[i]; return a && a.ct; }); }", "answered")
rep("    const pid = await pidOf(uid); const a = p.answers && p.answers[i]; const choice = H.dec[uid + \":\" + i];",
    "    const pid = await pidOf(uid); const a = ansOf(uid)[i]; const choice = H.dec[uid + \":\" + i];", "reveal_a")
rep("      if (a.offset != null) { hostAt = a.localAt + a.offset; el = hostAt - openAt; src = \"synced_clock\"; }\n"
    "      else { el = a.localElapsed; src = \"device_local\"; hostAt = openAt + el; }\n",
    "      if (a.srv != null) { hostAt = a.srv; el = hostAt - openAt; src = \"server\"; }\n"
    "      else { el = a.mono ?? 0; src = \"device_local\"; hostAt = openAt + el; }\n", "reveal_timing")
rep("elapsed_ms: el, submitted_before_open: early, timing_source: src,", "elapsed_ms: el, client_elapsed_ms: a.mono ?? null, submitted_before_open: early, timing_source: src,", "reveal_client_elapsed")
rep("exposure_number: expNo, question_shown_at_ms: r.shownAt, answers_open_at_ms: openAt,", "exposure_number: expNo, question_shown_at_ms: r.shownSrv ?? r.shownAt, answers_open_at_ms: openAt,", "reveal_exp_shown")
rep("shown_at_ms: r.shownAt, answers_open_at_ms: openAt, reading_ms: openAt - r.shownAt, deadline_ms: r.deadline,",
    "shown_at_ms: r.shownSrv ?? r.shownAt, answers_open_at_ms: openAt, reading_ms: openAt - (r.shownSrv ?? r.shownAt), deadline_ms: deadlineOf(r),", "reveal_log")
rep("const rts = []; for (const u of ans) { const a = H.players.get(u).answers[i]; const el = a.offset != null ? a.localAt + a.offset - openOf(r) : a.localElapsed; if (el != null) rts.push(Math.max(0, el)); }",
    "const rts = []; for (const u of ans) { const a = ansOf(u)[i]; const el = a.srv != null ? a.srv - openOf(r) : null; if (el != null) rts.push(Math.max(0, el)); }", "dash_rts")
rep("const p = H.players.get(u); const a = p && p.answers && p.answers[i]; const tk",
    "const p = H.players.get(u); const a = ansOf(u)[i]; const tk", "dash_row")

# Participant answers are create-only documents with a server timestamp.
rep("function myAnswer(i) { const p = S.play; return p && p.me && p.me.answers && p.me.answers[i]; }",
    "function myAnswer(i) { const p = S.play; return p && p.myAns && p.myAns[i]; }", "my_answer")
rep("    if (t < openL) { updateRing(openL - t, r.q.R || 1, true); return; }\n",
    "    if (t < openL) { updateRing(openL - t, r.q.R || 1, true); return; }\n"
    "    if (!(p.monoOpen && p.monoOpen[r.qIndex] != null)) p.monoOpen = { ...(p.monoOpen || {}), [r.qIndex]: performance.now() - (t - openL) };\n",
    "play_tick_mono")
block("ACT.answer = async (el) => {", "\n};\n",
      "ACT.answer = async (el) => {\n"
      "  const p = S.play; const r = p.room; const i = r.qIndex; const k = Number(el.dataset.i);\n"
      "  if (r.status !== \"question\" || myAnswer(i) || (p.submitting && p.submitting[i] != null)) return;\n"
      "  const mono = performance.now(); const localAt = now();\n"
      "  if (localAt < pOpenLocal(r)) return; // reading phase: answers are locked (the database refuses them too)\n"
      "  if (hostNowEst() - deadlineOf(r) > 250) { p.timedOut = i; return rerender(); }\n"
      "  p.submitting = { ...(p.submitting || {}), [i]: k }; p.myChoice = { ...(p.myChoice || {}), [i]: k }; rerender();\n"
      "  const ct = JSON.stringify(await seal(r.pubKey, { a: k, q: i, sid: p.sid })); // the rules require a string\n"
      "  const m0 = p.monoOpen && p.monoOpen[i];\n"
      "  const rec = { uid: S.uid, sid: p.sid, q: i, ct, srv: DB.serverTime(), mono: m0 != null ? Math.max(0, Math.round(mono - m0)) : null, localAt, dev: S.deviceId };\n"
      "  const path = `${P.answers(p.hostId)}/${S.uid}_${p.sid}_${i}`;\n"
      "  pEvent(\"answer_selected\", { q: i, opt: \"sealed\" });\n"
      "  try { await dset(path, rec); p.myAns = { ...(p.myAns || {}), [i]: { ...rec, srv: null } }; pEvent(\"answer_submitted\", { q: i }); }\n"
      "  catch (e) {\n"
      "    delete p.submitting[i];\n"
      "    const mine = await dget(path).catch(() => null);\n"
      "    if (mine) { p.myAns = { ...(p.myAns || {}), [i]: mine }; return rerender(); }\n"
      "    if (e && e.code === \"permission_denied\") { if (hostNowEst() < openOf(r)) toast(\"Answers aren't open yet. Try again in a moment.\"); else p.timedOut = i; return rerender(); }\n"
      "    rerender(); throw e;\n"
      "  }\n"
      "  rerender();\n"
      "};\n",
      "answer")
rep("  await joinNamed(room.code, false); syncClock(5);\n",
    "  await joinNamed(room.code, false); syncClock(5);\n"
    "  /* Rejoining mid-game: fetch this participant's own answers so locked-in questions stay locked. */\n"
    "  for (let k = 0; k <= (room.qIndex ?? -1); k++) dget(`${P.answers(room.hostId)}/${S.uid}_${room.sid}_${k}`).then((a) => { if (a && S.play && S.play.sid === room.sid) { S.play.myAns = { ...(S.play.myAns || {}), [k]: a }; if (S.view === \"play\") rerender(); } }).catch(() => {});\n",
    "resume_answers")

rep("async function unseal(privJwk, s) {\n", "async function unseal(privJwk, s) {\n  if (typeof s === \"string\") s = JSON.parse(s); // route B stores sealed answers as strings\n", "unseal_string")

# Sign-in with Google replaces claude.ai sign-in.
rep('noclaude: "Open AlgoArena from its claude.ai link. Sign-in, storage, and live rooms are provided by claude.ai, so a saved copy of this page can\'t run.",',
    'noclaude: "AlgoArena couldn\'t reach its sign-in and storage service. Check your connection, then reload the page.",', "gate_noclaude")
rep('signin: "Sign in to claude.ai to use AlgoArena. Every player and host needs to be signed in; your account is how answers, scores, and reports stay attached to you.",',
    'signin: "Sign in with your Google account to use AlgoArena. Every player and host signs in; your account keeps your answers, scores, and reports attached to you across devices.",', "gate_signin")
rep('<button class="btn primary" data-act="reload">Try again</button></div></main>`;\n};',
    '${a.reason === "signin" && window.claude && window.claude.signIn ? \'<button class="btn primary big" data-act="signIn">Sign in with Google</button>\' : \'<button class="btn primary" data-act="reload">Try again</button>\'}</div></main>`;\n};\n'
    'ACT.signIn = async (btn) => { btn.disabled = true; try { await window.claude.signIn(); location.reload(); } catch (e) { btn.disabled = false; toast("Sign-in didn\'t finish: " + ((e && (e.code || e.message)) || e)); } };\n'
    'ACT.signOut = async () => { leaveLive(); await window.claude.signOut(); location.reload(); };',
    "gate_button")
rep("  ${({ sets: homeSets, bank: homeBank, sessions: homeSessions, reports: homeReports, lib: homeLib })[tab]()}\n  </div></main>`;",
    "  ${({ sets: homeSets, bank: homeBank, sessions: homeSessions, reports: homeReports, lib: homeLib })[tab]()}\n"
    "  ${window.claude && window.claude.signOut ? '<p class=\"muted small\" style=\"margin-top:32px\">Signed in with Google. <button class=\"btn sm ghost\" data-act=\"signOut\">Sign out</button></p>' : \"\"}\n  </div></main>`;",
    "home_signout")
rep("open the link, sign in to claude.ai, type the room code", "open the link, sign in with Google, type the room code", "lobby_text")

# AI calls name their session for the per-session quota (stage B2).
rep('async function sampleJson(prompt) {', 'async function sampleJson(prompt, sid) {', "ai_0")
rep('const r = await C.sample(prompt, { modelTier: "default", cache: false });', 'const r = await C.sample(prompt, { modelTier: "default", cache: false, sid });', "ai_1")
rep('let r = await sampleJson(personalPrompt(snap, cands, false));', 'let r = await sampleJson(personalPrompt(snap, cands, false), snap.session_id);', "ai_2")
rep('const r2 = await sampleJson(personalPrompt(snap, cands, true));', 'const r2 = await sampleJson(personalPrompt(snap, cands, true), snap.session_id);', "ai_3")
rep('    const r = await sampleJson(prompt); const j = r.json;', '    const r = await sampleJson(prompt, X.sid); const j = r.json;', "ai_4")

# No automatic retries that consume tokens.
rep('    catch (e) { last = e; if (e && (e.code === "rate_limited" || e.code === "upstream_error" || e.code === "empty_completion" || e instanceof SyntaxError)) { await sleep(2500 * (k + 1)); continue; } throw e; }', '    catch (e) { last = e; if (e && e.code === "rate_limited") { await sleep(2500 * (k + 1)); continue; } throw e; } // retry only when the AI service did not process the request (no tokens used)', 'noretry_0')
rep('  if (rawWords > 300) { try { const r2 = await sampleJson(personalPrompt(snap, cands, true), snap.session_id); r = r2; res = pick(r2.json); md = composePersonal(snap, r2.json, res); } catch {} }', '  if (rawWords > 300) { // shorten locally instead of a second AI call\n    const j = clone(r.json); const lists = ["knowledge_points", "weak_or_risky_areas", "possible_confusions", "next_steps"];\n    for (let g = 0; g < 20 && words(composePersonal(snap, j, res)) > 300; g++) { const k = lists.filter((x) => Array.isArray(j[x]) && j[x].length > 1).sort((a, b) => j[b].length - j[a].length)[0]; if (k) j[k].pop(); else { j.performance_summary = String(j.performance_summary || "").split(/\\s+/).slice(0, 30).join(" "); break; } }\n    md = composePersonal(snap, j, res); r = { ...r, json: j }; }', 'noretry_1')

# 400-word reports: report_0 undoes noretry_1's local shortening; prompts are budgeted to fit.
rep('  const rawWords = words(composePersonal(snap, { ...r.json }, res));\n  if (rawWords > 300) { // shorten locally instead of a second AI call\n    const j = clone(r.json); const lists = ["knowledge_points", "weak_or_risky_areas", "possible_confusions", "next_steps"];\n    for (let g = 0; g < 20 && words(composePersonal(snap, j, res)) > 300; g++) { const k = lists.filter((x) => Array.isArray(j[x]) && j[x].length > 1).sort((a, b) => j[b].length - j[a].length)[0]; if (k) j[k].pop(); else { j.performance_summary = String(j.performance_summary || "").split(/\\s+/).slice(0, 30).join(" "); break; } }\n    md = composePersonal(snap, j, res); r = { ...r, json: j }; }\n', '', 'report_0')
rep('  while (words(md) > 300) {', '  while (words(md) > 400) {', 'report_1')
rep('- Length: performance_summary at most ${strict ? 30 : 45} words; each list has 1 to 3 items of at most ${strict ? 14 : 22} words.', '- Length: performance_summary at most 50 words; each list has 1 to 3 items of at most 18 words, so the whole report fits in 400 words.', 'report_2')
rep('async function sampleJson(prompt, sid) {', 'async function sampleJson(prompt, sid, kind) {', 'report_3')
rep('{ modelTier: "default", cache: false, sid }', '{ modelTier: "default", cache: false, sid, kind }', 'report_4')
rep('sampleJson(personalPrompt(snap, cands, false), snap.session_id)', 'sampleJson(personalPrompt(snap, cands, false), snap.session_id, "personal")', 'report_5')
rep('sampleJson(prompt, X.sid)', 'sampleJson(prompt, X.sid, "class")', 'report_6')

# Research export: the server clock is the reference.
block("const TIMESTAMP_SEMANTICS = {", "\n};\n",
      "const TIMESTAMP_SEMANTICS = {\n"
      "  clock: \"All *_ms fields are Unix epoch milliseconds on the Firestore server clock unless a field says otherwise.\",\n"
      "  question_shown_at_ms: \"Server time when the question appeared. The question and options are visible but locked during the reading phase that starts here.\",\n"
      "  answers_open_at_ms: \"Server time when answering unlocked: question_shown_at_ms plus the reading time, or when the host opened answers early.\",\n"
      "  submitted_at_host_ms: \"Server timestamp of the answer write (timing_source = server). The database rules require it to be the server's own time and inside the answer window.\",\n"
      "  elapsed_ms: \"submitted_at_host_ms − answers_open_at_ms, floored at 0. Includes network delay from the participant's device to the database. This is t in the score formula.\",\n"
      "  client_elapsed_ms: \"The participant device's own measurement (performance.now) from the moment its screen unlocked to the tap. Client-reported and not used for scoring.\",\n"
      "  participant_local_submit_ms: \"Participant device clock at the tap (not synchronized).\",\n"
      "  clock_offset_ms: \"Not used by this version (null).\",\n"
      "  submitted_before_open: \"Always false in this version: the database refuses answers before answers open.\",\n"
      "  host_observed_at_ms: \"Host device clock when the host first received the submission; an upper bound that includes sync latency.\",\n"
      "  scoring: \"Correct and within T after answers open: round(500 + 500·(1 − min(t,T)/T)); otherwise 0. The database accepts answers until T plus 250 ms after answers open.\",\n"
      "};\n",
      "semantics")
rep('"elapsed_ms", "submitted_before_open", "timing_source",', '"elapsed_ms", "client_elapsed_ms", "submitted_before_open", "timing_source",', "cols_sub")
rep('schema: "algoarena-research-export", schema_version: 2,', 'schema: "algoarena-research-export", schema_version: 3,', "schema")
rep("submitted_before_open = false.\\n`;",
    "submitted_before_open = false.\\n- schema_version 3 (AlgoArena 3, Firebase): timing fields use the Firestore server clock; elapsed_ms includes network delay from the device; client_elapsed_ms is the device's own unlock-to-tap measurement.\\n`;",
    "readme_note")

# Changeable answers (user decision, 2026-11-04): a player may change their answer until time runs out; the last
# choice counts, with its own server time for points. Each selection is a create-only document (<base>, then
# <base>_c1 .. _c20; firestore.rules), so the full history is kept for research (user decision: full history).
rep("const MAX_EVENTS = 400;", "const MAX_EVENTS = 400;\nconst MAX_CHANGES = 20; // answer changes per question; firestore.rules has the same cap", "max_changes")
rep('else if (o.mine != null && o.mine !== k) cls.push("dim");',
    'else if (o.mine != null && o.mine !== k && !o.interactive) cls.push("dim");', "cards_no_dim_while_open")
block("ACT.answer = async (el) => {\n", "\n  rerender();\n};\n",
      "ACT.answer = async (el) => {\n"
      "  const p = S.play; const r = p.room; const i = r.qIndex; const k = Number(el.dataset.i);\n"
      "  if (r.status !== \"question\" || (p.submitting && p.submitting[i] != null)) return;\n"
      "  const cur = myAnswer(i); const prev = p.myChoice && p.myChoice[i];\n"
      "  if (cur && prev === k) return; // the same option again changes nothing\n"
      "  const n = cur ? (cur.n || 0) + 1 : 0;\n"
      "  if (n > MAX_CHANGES) return toast(`You can change an answer at most ${MAX_CHANGES} times.`);\n"
      "  const mono = performance.now(); const localAt = now();\n"
      "  if (localAt < pOpenLocal(r)) return; // reading phase: answers are locked (the database refuses them too)\n"
      "  if (hostNowEst() - deadlineOf(r) > 250) { if (!cur) p.timedOut = i; return rerender(); }\n"
      "  p.submitting = { ...(p.submitting || {}), [i]: k }; p.myChoice = { ...(p.myChoice || {}), [i]: k }; rerender();\n"
      "  const ct = JSON.stringify(await seal(r.pubKey, { a: k, q: i, sid: p.sid })); // the rules require a string\n"
      "  const m0 = p.monoOpen && p.monoOpen[i];\n"
      "  const rec = { uid: S.uid, sid: p.sid, q: i, ct, srv: DB.serverTime(), mono: m0 != null ? Math.max(0, Math.round(mono - m0)) : null, localAt, dev: S.deviceId, ...(n ? { n } : {}) };\n"
      "  // Each selection is its own create-only document: <uid>_<sid>_<q> first, then _c1, _c2, ... (firestore.rules).\n"
      "  const path = `${P.answers(p.hostId)}/${S.uid}_${p.sid}_${i}${n ? \"_c\" + n : \"\"}`;\n"
      "  pEvent(n ? \"answer_changed\" : \"answer_selected\", { q: i, opt: \"sealed\", ...(n ? { n } : {}) });\n"
      "  try { await dset(path, rec); p.myAns = { ...(p.myAns || {}), [i]: { ...rec, srv: null } }; delete p.submitting[i]; pEvent(\"answer_submitted\", { q: i, ...(n ? { n } : {}) }); }\n"
      "  catch (e) {\n"
      "    delete p.submitting[i];\n"
      "    const mine = await dget(path).catch(() => null);\n"
      "    if (mine) { p.myAns = { ...(p.myAns || {}), [i]: mine }; return rerender(); }\n"
      "    p.myChoice = { ...p.myChoice, [i]: prev }; if (prev == null) delete p.myChoice[i];\n"
      "    if (e && e.code === \"permission_denied\") { if (hostNowEst() < openOf(r)) toast(\"Answers aren't open yet. Try again in a moment.\"); else if (cur) toast(\"Time's up. Your earlier answer counts.\"); else p.timedOut = i; return rerender(); }\n"
      "    rerender(); throw e;\n"
      "  }\n"
      "  rerender();\n};\n", "answer_changeable")
rep("function myAnswer(i) { const p = S.play; return p && p.myAns && p.myAns[i]; }",
    "function myAnswer(i) { const p = S.play; return p && p.myAns && p.myAns[i]; }\n"
    "/** This player's latest selection for question k: the first answer, then changes _c1, _c2, ... until one is missing. */\n"
    "async function latestAnswer(room, k) {\n"
    "  const base = `${P.answers(room.hostId)}/${S.uid}_${room.sid}_${k}`; let a = await dget(base); if (!a) return null;\n"
    "  for (let n = 1; n <= MAX_CHANGES; n++) { const b = await dget(`${base}_c${n}`); if (!b) break; a = b; }\n"
    "  return a;\n}", "latest_answer")
block("  for (let k = 0; k <= (room.qIndex ?? -1); k++) dget(", ".catch(() => {});\n",
      "  for (let k = 0; k <= (room.qIndex ?? -1); k++) latestAnswer(room, k).then((a) => { if (a && S.play && S.play.sid === room.sid) { S.play.myAns = { ...(S.play.myAns || {}), [k]: a }; if (S.view === \"play\") rerender(); } }).catch(() => {});\n",
      "rejoin_latest")
block("    if (mine || pending) body = `<div class=\"lockbox\">", "</p></div>`;\n",
      "    const open = st === \"question\" && hostNowEst() - deadlineOf(r) <= 250;\n"
      "    if ((mine || pending) && open) body = `<div class=\"qhead\"><div class=\"qprompt ${q.prompt.length > 180 ? \"small-p\" : \"\"}\">${esc(q.prompt)}${q.img ? `<img src=\"${blobUrl(q.img)}\" alt=\"Question image\">` : \"\"}</div>${ringHtml(q.T)}</div>${answerCards(q.options, { interactive: true, mine: choice })}<p class=\"muted small\" style=\"margin-top:10px\">${pending ? \"Sending…\" : \"Answer saved.\"} Tap another option to change it until time runs out; your last choice counts.</p>`;\n"
      "    else if (mine || pending) body = `<div class=\"lockbox\"><div class=\"sw c${choice ?? 0}\" style=\"width:90px;height:90px;margin:0 auto;border-radius:20px\">${choice != null ? GLYPH[choice].replace(\"<svg\", '<svg style=\"width:52px;height:52px\"') : \"\"}</div><h1 style=\"margin-top:18px\">Your answer is in</h1><p class=\"muted\">Your last choice counts. Wait for the reveal.</p><p class=\"waiting-dots\"><span></span><span></span><span></span></p></div>`;\n",
      "play_changeable")
rep("Tap once to lock in your answer. Keys 1 to 4 also work.", "Tap to answer; you can change it until time runs out. Keys 1 to 4 also work.", "play_hint")
rep("Each player gets one locked answer per question.", "Players can change their answer until time runs out; the last choice counts.", "launch_note")
# Scoring shown as a formula (user decision, 2026-11-04): one line per case under a brace, t and T explained one
# size smaller below. Plain HTML and an inline SVG brace render the same on every device (MathML stretches the brace
# only where a math font is installed). Same formula as hReveal: correct and in time earns round(500 + 500 * (1 - t/T)).
rep("Scoring: a correct answer earns between 500 and 1000 points, more for answering sooner after answers open; a wrong answer or no answer earns 0. "
    "Streaks are shown for fun and never change the score. Players can change their answer until time runs out; the last choice counts.",
    '<b>Scoring</b><div style="overflow-x:auto;margin:8px 0 2px"><div style="display:inline-grid;grid-template-columns:auto 10px auto;column-gap:8px;font-size:1.15rem;white-space:nowrap">'
    '<span style="align-self:center">score =</span>'
    # The brace fills the full height and its tip is at 50%; the two cases share the height equally (1fr 1fr) and are
    # centred in their halves, so the tip always sits midway between them. row-gap 1.5em moves the first case up and
    # the second down by 0.75em each, about three quarters of a digit (user decision, 2026-11-04).
    '<svg class="score-brace" viewBox="0 0 12 100" preserveAspectRatio="none" style="display:block;width:10px;height:100%" aria-hidden="true"><path d="M10 1 C5 1 6 8 6 18 L6 40 C6 46 4 50 1 50 C4 50 6 54 6 60 L6 82 C6 92 5 99 10 99" fill="none" stroke="currentColor" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>'
    '<div class="score-cases" style="display:grid;grid-template-columns:max-content max-content;grid-template-rows:1fr 1fr;align-items:center;column-gap:28px;row-gap:1.5em;padding:4px 0">'
    '<span>500 + 500 * (1 &#x2212; <i>t</i>/<i>T</i>)</span><span class="muted">if correct</span><span>0</span><span class="muted">if wrong or no answer</span></div></div></div>'
    # margin-top 3em: two blank lines of this text's own 1.5 line height between the formula and the explanation.
    '<div class="muted score-params" style="font-size:.78rem;margin-top:3em"><i>t</i>: seconds from answers opening to your final choice. <i>T</i>: answer time per question. The score is rounded to a whole number.</div>',
    "launch_scoring_formula")
# Host lobby (user decision, 2026-11-04): one centred column, the QR code and under it a single line, "Scan the code,
# sign in and enter <room code>"; the link, the big code and the longer instructions are gone.
block('    body = bar("") + `<div class="joinboard">', '      <div class="players">',
      '    body = bar("") + `<div class="joinboard" style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px"><div class="qr" id="qr" aria-label="QR code to join">${qrSvg(url)}</div>\n'
      '      <p class="join-line" style="font-size:1.6rem;margin:4px 0 0">Scan the code, sign in and enter <b style="letter-spacing:.08em" aria-label="room code ${esc(r.code.split("").join(" "))}">${esc(r.code)}</b></p>\n'
      '      <div class="row" style="justify-content:center"><button class="btn primary big ${n ? "pulse" : ""}" data-act="hStart" ${n ? "" : "disabled"}>Start game</button><span class="muted">${n ? `${n} ready` : "Waiting for players"} <span class="waiting-dots"><span></span><span></span><span></span></span></span></div></div>\n'
      '      <div class="players" style="justify-content:center">', "lobby_centered")
# The host's launch screen no longer repeats the consent notice (user decision, 2026-11-04); players still see and
# accept it on the join screen and in the lobby.
rep('  <div class="notice small">Players are told before joining that you will see their answers, timing, and an AI-generated learning report for this session.</div>\n',
    "", "launch_no_consent_notice")
rep("const ans = {}; for (const d of qs.docs) { const a = d.data(); (ans[a.uid] = ans[a.uid] || {})[a.q] = a; } H.ans = ans;",
    "const ans = {}, hist = {}; for (const d of qs.docs) { const a = d.data(); const n = a.n || 0; (hist[a.uid + \":\" + a.q] = hist[a.uid + \":\" + a.q] || [])[n] = a; const m = (ans[a.uid] = ans[a.uid] || {}); if (!m[a.q] || n > (m[a.q].n || 0)) m[a.q] = a; } H.ans = ans; H.hist = hist; // the highest n is the answer that counts",
    "host_latest")
rep("if (a && a.ct && !(key in H.dec)) {",
    "H.decN = H.decN || {}; if (a && a.ct && H.decN[key] !== (a.n || 0)) { H.decN[key] = a.n || 0;", "host_dec_by_n")
rep('if (!H.closing && (remain < -600 || (n > 0 && ans >= n))) { H.closing = true; closeQuestion(ans >= n && remain > 0 ? "all_answered" : "time_up").finally(() => { H.closing = false; }); }',
    '// No early close when everyone has answered: answers can change until time runs out. The host can still close.\n'
    '    if (!H.closing && remain < -600) { H.closing = true; closeQuestion("time_up").finally(() => { H.closing = false; }); }',
    "no_close_all_answered")
rep('ACT.hClose = () => closeQuestion("host_stopped");',
    'ACT.hClose = () => closeQuestion("host_stopped");\n'
    '/** Timing of one selection; the same rules as the counted answer (server time first, device delta as fallback). */\n'
    'function timing(a, choice, openAt, Tm, correct) {\n'
    '  let el, src, hostAt;\n'
    '  if (a.srv != null) { hostAt = a.srv; el = hostAt - openAt; src = "server"; } else { el = a.mono ?? 0; src = "device_local"; hostAt = openAt + el; }\n'
    '  const early = el < -250; el = Math.max(0, Math.round(el)); const to = !early && el > Tm + 250;\n'
    '  return { el, src, hostAt, early, to, ok: !to && !early && choice === correct };\n'
    '}\n'
    '/** Every decryptable selection of one player for question i, in order; a ciphertext from another question or session is dropped. */\n'
    'async function histOf(uid, i) {\n'
    '  const H = S.host; H.decH = H.decH || {}; const out = [];\n'
    '  for (const a of (H.hist[uid + ":" + i] || []).filter(Boolean)) {\n'
    '    const key = uid + ":" + i + ":" + (a.n || 0);\n'
    '    if (!(key in H.decH)) { try { const o = await unseal(H.priv, a.ct); H.decH[key] = o && o.q === i && o.sid === H.sid && o.a >= 0 && o.a <= 3 ? o.a : null; } catch { H.decH[key] = null; } }\n'
    '    if (H.decH[key] != null) out.push({ a, choice: H.decH[key] });\n'
    '  }\n'
    '  return out;\n'
    '}', "timing_hist")
block("    let el = null, src = null, ok = false, pts = 0, to = true, hostAt = null, early = false;\n",
      "full_explanation_viewed: null, reference_interactions: null, device_takeovers: takeovers });\n",
      "    // Every selection is a submission row; the last one is the answer that counts (score, board, final_correct).\n"
      "    const rows = a && choice != null ? (await histOf(uid, i)).map((h) => ({ h, ...timing(h.a, h.choice, openAt, Tm, q.correct) })) : [];\n"
      "    const fin = rows[rows.length - 1] || null;\n"
      "    let el = null, src = null, ok = false, pts = 0, to = true, hostAt = null, early = false;\n"
      "    if (fin) {\n"
      "      ({ el, src, ok, to, hostAt, early } = fin);\n"
      "      pts = ok ? Math.round(500 + 500 * (1 - Math.min(el, Tm) / Tm)) : 0;\n"
      "      if (!to && !early) { dist[fin.h.choice]++; rts.push(el); if (ok) correctN++; }\n"
      "    }\n"
      "    const tkState = (p.takeovers || []).some((x) => x.q === i) ? \"takeover_during_question\" : (p.takeovers || []).length ? \"takeover_earlier_in_session\" : \"none\";\n"
      "    rows.forEach((x, j) => { const last = j === rows.length - 1; subs.push({ pid, uid, session_id: H.sid, question_id: q.id, question_key: q.qkey, q_index: i, exposure_number: expNo, selected_option: x.h.choice, correct: x.ok, timed_out: x.to,\n"
      "      participant_local_submit_ms: x.h.a.localAt, clock_offset_ms: x.h.a.offset ?? null, clock_rtt_ms: x.h.a.rtt ?? null, answers_open_at_ms: openAt, submitted_at_host_ms: x.hostAt, host_observed_at_ms: j === 0 ? H.observed[uid + \":\" + i] || null : null,\n"
      "      elapsed_ms: x.el, client_elapsed_ms: x.h.a.mono ?? null, submitted_before_open: x.early, timing_source: x.src, time_limit_s: T, score: last ? pts : 0, selection_index: j + 1, is_final_answer: last, device_id: x.h.a.dev || null, device_takeover_state: tkState }); });\n"
      "    const takeovers = (p.takeovers || []).filter((x) => x.q === i).length;\n"
      "    const first = rows[0] || null; const firstOk = rows.find((x) => x.ok) || null;\n"
      "    exps.push({ exposure_id: H.sid + \":\" + i + \":\" + pid, pid, uid, session_id: H.sid, question_id: q.id, question_key: q.qkey, q_index: i, exposure_number: expNo, question_shown_at_ms: r.shownSrv ?? r.shownAt, answers_open_at_ms: openAt,\n"
      "      first_submission_at_ms: first ? first.hostAt : null, first_attempt_correct: first ? first.ok : null, first_attempt_rt_ms: first ? first.el : null, n_submissions: rows.length,\n"
      "      time_to_correct_ms: firstOk ? firstOk.el : null, final_correct: ok, timed_out_or_no_answer: !fin || to,\n"
      "      full_explanation_viewed: null, reference_interactions: null, device_takeovers: takeovers });\n", "reveal_history")
rep("for (const s of l.submissions) { if (!s.timed_out) { dist[s.selected_option]++;",
    "for (const s of l.submissions.filter((x) => x.is_final_answer !== false)) { if (!s.timed_out) { dist[s.selected_option]++;", "derived_final_only")
rep("const allSubs = X.logs.flatMap((l) => l.submissions);",
    "const allSubs = X.logs.flatMap((l) => l.submissions.filter((x) => x.is_final_answer !== false));", "summary_final_only")
rep("const s = l.submissions.find((x) => x.uid === part.uid);",
    "const s = l.submissions.find((x) => x.uid === part.uid && x.is_final_answer !== false);", "report_final_only")
rep('"time_limit_s", "score", "device_id", "device_takeover_state"]',
    '"time_limit_s", "score", "selection_index", "is_final_answer", "device_id", "device_takeover_state"]', "cols_history")
rep('schema: "algoarena-research-export", schema_version: 3,', 'schema: "algoarena-research-export", schema_version: 4,', "schema_4")
rep("client_elapsed_ms is the device's own unlock-to-tap measurement.\\n`;",
    "client_elapsed_ms is the device's own unlock-to-tap measurement.\\n"
    "- schema_version 4: players may change their answer until time runs out. submissions has one row per selection "
    "(selection_index from 1); is_final_answer marks the one that counts, and only it carries a score. In exposures, "
    "first_* describe the first selection, n_submissions counts selections, time_to_correct_ms is the first correct "
    "selection and final_correct the counted one. Sessions recorded before version 4 have one row per answer.\\n`;",
    "readme_history")

# AI report heading without the parenthetical (user decision, 2026-11-04); the end-screen note that a report is an AI
# interpretation and not a grade or a measurement stays.
rep('"## AI interpretation (generated; not a measurement of ability)", parts.summary,', '"## AI interpretation", parts.summary,', "report_heading_personal")
rep('"## AI interpretation (generated; not a measurement of ability)", String(j.overview || ""),', '"## AI interpretation", String(j.overview || ""),', "report_heading_class")
# Report footer shows only the model and the length (user decision, 2026-11-04). The date, prompt version, evidence
# snapshot hash and generating device stay on the stored report (promptVersion, metricsHash, metricsSnapshot,
# generatedAt, generatedBy).
rep('Generated ${fmtDate(a.generatedAt)}${a.model ? " by " + esc(a.model) : ""}; prompt ${esc(a.promptVersion)}; evidence snapshot ${esc(a.metricsHash)}${a.words ? "; " + a.words + " words" : ""}${a.generatedBy === "participant" ? "; generated on the participant\'s device" : ""}.',
    '${a.model ? "Generated by " + esc(a.model) : "Generated"}${a.words ? ", " + a.words + " words" : ""}.', "report_footer_short")
# The reports zip carries the provenance the footer no longer shows (owner decision, 2026-11-04): provenance.csv has
# one row per report keyed by research id; provenance.json adds the evidence snapshot each report was generated from.
rep('  const missing = (X.meta.participants || []).length - files.filter((f) => f.name.startsWith("reports/")).length;\n',
    '  const missing = (X.meta.participants || []).length - files.filter((f) => f.name.startsWith("reports/")).length;\n'
    '  const prov = [...(X.meta.participants || []).map((p) => ({ a: X.ai[p.uid], kind: "personal", pid: p.pid })), { a: X.ai._class, kind: "class", pid: null }]\n'
    '    .filter((r) => r.a && r.a.status === "ready")\n'
    '    .map(({ a, kind, pid }) => ({ kind, pid, model: a.model || null, model_tier: a.modelTier || null, prompt_version: a.promptVersion || null,\n'
    '      evidence_snapshot: a.metricsHash || null, generated_at: a.generatedAt ? new Date(a.generatedAt).toISOString() : null, generated_by: a.generatedBy || null,\n'
    '      words: a.words ?? null, resources: (a.resources || []).join(" "), evidence: a.metricsSnapshot || null }));\n'
    '  files.push({ name: "provenance.csv", data: csv(prov, ["kind", "pid", "model", "model_tier", "prompt_version", "evidence_snapshot", "generated_at", "generated_by", "words", "resources"]) });\n'
    '  files.push({ name: "provenance.json", data: JSON.stringify({ session_id: X.sid, reports: prov }, null, 1) });\n',
    "zip_provenance")
rep('They are not measurements of ability and are kept separate from the research records.\\n\\n${missing',
    'They are not measurements of ability and are kept separate from the research records.\\n\\n'
    'provenance.csv lists each report with its model, prompt version, evidence snapshot id (the first 16 hex digits of the SHA-256 of the evidence as sent), '
    'generation time and source. provenance.json adds the evidence itself; it includes display names, as the reports do.\\n\\n${missing',
    "zip_readme_provenance")
# The answer countdown keeps running after a player answers: answers stay changeable until time runs out, so the ring
# must keep moving (the 2.1.1 tick stopped once an answer was in, when the answered screen had no ring). When time is up,
# an unanswered question shows "Time's up" and an answered one switches to "Your answer is in".
block("function playTick() {\n", "\n}\n",
      "function playTick() {\n"
      "  const p = S.play; if (!p || S.view !== \"play\") return; const r = p.room;\n"
      "  if (r.status !== \"question\") return;\n"
      "  const i = r.qIndex; const answered = !!myAnswer(i) || (p.submitting && p.submitting[i] != null);\n"
      "  const t = now(); const openL = pOpenLocal(r); const phase = i + (t < openL ? \":read\" : \":answer\");\n"
      "  if (p.phaseSeen !== phase) { const was = p.phaseSeen; p.phaseSeen = phase; if (was === i + \":read\") { AUDIO.open(); rerender(); return; } }\n"
      "  if (t < openL) { updateRing(openL - t, r.q.R || 1, true); return; }\n"
      "  if (!(p.monoOpen && p.monoOpen[i] != null)) p.monoOpen = { ...(p.monoOpen || {}), [i]: performance.now() - (t - openL) };\n"
      "  const remain = openL + r.q.T * 1000 - t; updateRing(remain, r.q.T);\n"
      "  if (!answered && remain <= 0 && p.timedOut !== i) { p.timedOut = i; rerender(); }\n"
      "  if (answered && remain <= -300 && p.finalShown !== i) { p.finalShown = i; rerender(); }\n"
      "}\n", "tick_after_answer")

# AI question drafts (v1.1, docs/ai-question-generation.md; review-list mock approved by the owner on 2026-11-05).
# Drafts from the draftQuestions function wait in sets/{id}/drafts; the host accepts, edits or discards each one, and a
# set with drafts cannot be hosted. Accepted questions carry origin "ai_draft" and the drafting record in `ai`.
rep("const C = { db: null, user: null, room: null, assets: null, sample: null, downloads: null };",
    "const C = { db: null, user: null, room: null, assets: null, sample: null, downloads: null, draft: null };", "qgen_caps")
rep('Promise.all(["room", "assets", "sample", "downloads"].map((n) => claude.use(n).then((x) => { C[n] = x; }).catch(() => {}))).then(() => rerender());',
    'Promise.all(["room", "assets", "sample", "downloads", "draft"].map((n) => claude.use(n).then((x) => { C[n] = x; }).catch(() => {})))\n'
    '    .then(async () => { S.canDraft = C.draft ? await C.draft.allowed().catch(() => false) : false; rerender(); });', "qgen_boot")
rep("  setQ: (id) => `data/users/${S.uid}/profile/sets/${id}/q`,\n",
    "  setQ: (id) => `data/users/${S.uid}/profile/sets/${id}/q`,\n"
    "  setD: (id) => `data/users/${S.uid}/profile/sets/${id}/drafts`,\n", "qgen_path")
rep("  return { id, meta, qs: qs.map((q) => ({ ...clone(q), id: q._id })) };",
    "  const drafts = (await dlist(P.setD(id))).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));\n"
    "  return { id, meta, qs: qs.map((q) => ({ ...clone(q), id: q._id })), drafts };", "qgen_loadset")
rep('<button class="btn primary" data-act="launch" data-id="${E.id}" ${E.qs.length ? "" : "disabled"}>Host this set live</button>',
    '<button class="btn primary" data-act="launch" data-id="${E.id}" ${!E.qs.length ? "disabled" : E.drafts.length ? `disabled title="Accept or discard the ${E.drafts.length} AI draft${E.drafts.length === 1 ? "" : "s"} first"` : ""}>Host this set live</button>',
    "qgen_launch_btn")
rep('  <div class="row" style="margin-bottom:12px"><h2 style="margin:0">Questions (${E.qs.length})</h2><span class="spacer"></span><button class="btn primary" data-act="addQ">Add question</button><button class="btn" data-act="importQ">Import JSON</button>',
    '  ${draftsPanel(E)}\n'
    '  <div class="row" style="margin-bottom:12px"><h2 style="margin:0">Questions (${E.qs.length})</h2><span class="spacer"></span><button class="btn primary" data-act="addQ">Add question</button>'
    '${S.canDraft ? \'<button class="btn" data-act="draftOpen">Draft with AI</button>\' : ""}<button class="btn" data-act="importQ">Import JSON</button>',
    "qgen_set_buttons")
rep('<button class="btn primary sm" data-act="launch" data-id="${s._id}" ${s.count ? "" : "disabled title=\\"Add questions first\\""}>Host live</button>',
    '<button class="btn primary sm" data-act="launch" data-id="${s._id}" ${!s.count ? "disabled title=\\"Add questions first\\"" : s.drafts ? "disabled title=\\"Review the AI drafts first\\"" : ""}>Host live</button>',
    "qgen_home_launch")
rep('const set = await loadSet(el.dataset.id); if (!set.qs.length) return toast("Add questions to this set first.");',
    'const set = await loadSet(el.dataset.id); if (!set.qs.length) return toast("Add questions to this set first.");\n'
    '  if (set.drafts.length) return toast("Accept or discard the AI drafts in this set before hosting it.");', "qgen_launch_guard")
rep("ACT.addQ = () => { S.qdraftBank = false; S.qdraft = normQ(", "ACT.addQ = () => { S.qdraftBank = false; S.qdraftFrom = null; S.qdraft = normQ(", "qgen_addq")
rep("ACT.editQ = (el) => { S.qdraftBank = false; const i", "ACT.editQ = (el) => { S.qdraftBank = false; S.qdraftFrom = null; const i", "qgen_editq")
rep("ACT.bankNewQ = () => { S.qdraftBank = true; S.qdraft", "ACT.bankNewQ = () => { S.qdraftBank = true; S.qdraftFrom = null; S.qdraft", "qgen_banknewq")
rep("if (i < 0) return; S.qdraftBank = true; S.qdraft = clone(S.bank[i]);", "if (i < 0) return; S.qdraftBank = true; S.qdraftFrom = null; S.qdraft = clone(S.bank[i]);", "qgen_bankeditq")
rep('<h2 style="margin:0">${S.qdraftBank ? (S.qdraftIndex < 0 ? "New bank question"',
    '<h2 style="margin:0">${S.qdraftFrom ? "Edit AI draft" : S.qdraftBank ? (S.qdraftIndex < 0 ? "New bank question"', "qgen_editor_title")
rep('<div class="row"><button class="btn primary big" data-act="saveQ">Save question</button></div></div></div>',
    '<div class="row"><button class="btn primary big" data-act="saveQ">${S.qdraftFrom ? "Save and accept" : "Save question"}</button></div></div></div>', "qgen_editor_save")
rep("  if (S.qdraftBank) return bankSaveQ(q);\n", "  if (S.qdraftBank) return bankSaveQ(q);\n  if (S.qdraftFrom) return acceptDraft(S.qdraftFrom, q);\n", "qgen_saveq")
rep('title: (src.meta.title || "Set") + " (copy)", createdAt: now(), updatedAt: now(), count: src.qs.length }',
    'title: (src.meta.title || "Set") + " (copy)", createdAt: now(), updatedAt: now(), count: src.qs.length, drafts: 0 }', "qgen_dupset")
rep("const qs = await dlist(P.setQ(el.dataset.id)); await pool(qs.map((q) => () => ddel(`${P.setQ(el.dataset.id)}/${q._id}`)), 6);",
    "const qs = await dlist(P.setQ(el.dataset.id)); await pool(qs.map((q) => () => ddel(`${P.setQ(el.dataset.id)}/${q._id}`)), 6);\n"
    "  const ds = await dlist(P.setD(el.dataset.id)); await pool(ds.map((d) => () => ddel(`${P.setD(el.dataset.id)}/${d._id}`)), 6);", "qgen_delset")
rep(".qcard .opt.right{background:color-mix(in srgb,var(--ok) 20%,transparent);font-weight:700}",
    ".qcard .opt.right{background:color-mix(in srgb,var(--ok) 20%,transparent);font-weight:700}\n"
    ".vstat{font-weight:700}.vstat.bad{color:var(--bad)}.vstat.warn{color:var(--warn)}.vstat.ok{color:var(--ok)}\n"
    ".expls{margin:8px 0 0}.expls>div{margin-top:2px}\n"
    ".audit{color:var(--muted)}.audit p{margin:4px 0 0}\n"
    ".dgrid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}\n"
    "@media (max-width:480px){.dgrid3{grid-template-columns:repeat(2,minmax(0,1fr))}.dgrid3 label:last-child{grid-column:1/-1}}", "qgen_css")
# Research export: questions.csv says which questions began as AI drafts (schema_version 5).
rep("has_image: !!q.img, n_references: (q.refs || []).length }));",
    "has_image: !!q.img, n_references: (q.refs || []).length, origin: q.origin || \"human\", ai_model: (q.ai && q.ai.model) || \"\",\n"
    "      ai_prompt_version: (q.ai && q.ai.promptVersions && q.ai.promptVersions.draft) || \"\", ai_edited: q.ai ? !!q.ai.editedBeforeAccept : \"\" }));", "qgen_export_row")
rep('"has_image", "n_references"],', '"has_image", "n_references", "origin", "ai_model", "ai_prompt_version", "ai_edited"],', "qgen_export_cols")
rep('schema: "algoarena-research-export", schema_version: 4,', 'schema: "algoarena-research-export", schema_version: 5,', "schema_5")
rep("Sessions recorded before version 4 have one row per answer.\\n`;",
    "Sessions recorded before version 4 have one row per answer.\\n"
    "- schema_version 5 (v1.1): questions.csv adds origin (human, or ai_draft for a question an AI drafted and the host "
    "accepted), ai_model, ai_prompt_version and ai_edited (whether the host edited the draft before accepting it). "
    "question_key is unchanged, so the same content keeps one key whoever wrote it. Questions from earlier sessions read "
    "as origin human.\\n`;", "readme_qgen")
rep("/* ===================== Live Classroom: host ===================== */\n",
    r'''/* ===================== AI question drafts (v1.1) ===================== */
// Must match MODULES, CHAPTERS and SUBTYPES in functions/qgen-core.js (checked by functions/test/qgen-core.test.mjs).
const DRAFT_MODULES = ["Module 1 (Foundations)", "Module 2 (Sorting and Order Statistics)", "Module 3 (Advanced Design and Analysis Techniques)",
  "Module 4 (Graph Algorithms)", "Module 5 (Selected Topics)", "Module 6 (NP-Completeness)", "Module 7 (Data Structures)"];
const DRAFT_SUBTYPES = ["complexity", "definition", "proof", "behavior", "loop-count", "recurrence"];
// CLRS 3rd edition chapters of each module, in DRAFT_MODULES order: the bank's grouping plus chapters 1, 17 and 35,
// and Module 7 for the data-structure chapters (owner, 2026-11-05).
const DRAFT_CHAPTERS = [
  [[1, "The Role of Algorithms in Computing"], [2, "Getting Started"], [3, "Growth of Functions"], [4, "Divide-and-Conquer"],
    [5, "Probabilistic Analysis and Randomized Algorithms"]],
  [[6, "Heapsort"], [7, "Quicksort"], [8, "Sorting in Linear Time"], [9, "Medians and Order Statistics"]],
  [[15, "Dynamic Programming"], [16, "Greedy Algorithms"], [17, "Amortized Analysis"]],
  [[22, "Elementary Graph Algorithms"], [23, "Minimum Spanning Trees"], [24, "Single-Source Shortest Paths"]],
  [[25, "All-Pairs Shortest Paths"], [26, "Maximum Flow"], [27, "Multithreaded Algorithms"], [28, "Matrix Operations"],
    [29, "Linear Programming"], [30, "Polynomials and the FFT"], [31, "Number-Theoretic Algorithms"], [32, "String Matching"],
    [33, "Computational Geometry"]],
  [[34, "NP-Completeness"], [35, "Approximation Algorithms"]],
  [[10, "Elementary Data Structures"], [11, "Hash Tables"], [12, "Binary Search Trees"], [13, "Red-Black Trees"],
    [14, "Augmenting Data Structures"], [18, "B-Trees"], [19, "Fibonacci Heaps"], [20, "van Emde Boas Trees"],
    [21, "Data Structures for Disjoint Sets"]]
];
const AUDIT_LABEL = { explanation: "Answer reasoning", distractor: "Distractor", feedback_leak: "Feedback leak", feedback_wrong: "Feedback error", difficulty: "Difficulty", wording: "Wording" };
const FLAG_NOTE = { duplicate: "Matches a question already in this set or the built-in bank.", near_duplicate: "Similar to a question in this set or the built-in bank; check it is not a repeat." };
function draftStatus(d) {
  const v = d.verify || {}; const issues = d.auditIssues || [];
  const why = v.reason ? ` <span class="muted">Its reasoning: "${esc(v.reason)}"</span>` : "";
  if (v.status === "disagree") return `<span class="vstat bad">The checker chose ${esc(v.choice)}, not the marked ${LETTERS[d.question.correct]}.</span>${why}`;
  if (v.status === "ambiguous") return `<span class="vstat bad">The checker found more than one defensible answer, or none.</span>${why}`;
  if (v.status === "issues") return `<span class="vstat warn">The checker agrees with the answer but noted ${issues.length} issue${issues.length === 1 ? "" : "s"}.</span>`
    + `<div class="audit">${issues.map((x) => `<p><b>${esc(AUDIT_LABEL[x.check] || x.check)}:</b> ${esc(x.note)}</p>`).join("")}</div>`;
  if (v.status === "agree") return `<span class="vstat ok">The checker agrees.</span>`;
  return `<span class="vstat warn">Not checked: the checker was unavailable.</span>`;
}
// The closing sentence is shown on this card only; the saved explanation, which players see, stays as written.
function draftExplanations(d) {
  const q = d.question; const rs = d.rationales || []; const expl = (q.explanation || "").trim();
  const wrong = q.options.map((_, k) => (k === q.correct || !rs[k] ? "" : `<div>Option ${LETTERS[k]}: ${esc(rs[k].trim().replace(/\.$/, ""))};</div>`)).join("");
  const right = `<div>Option ${LETTERS[q.correct]}: ${expl ? esc(expl) + (/[.!?]$/.test(expl) ? " " : ". ") : ""}Thus, this is the correct option.</div>`;
  return `<div class="expls muted small"><b>Explanations:</b>${wrong}${right}</div>`;
}
function draftCard(d, i) {
  const q = d.question; const flags = (d.flags || []).map((f) => FLAG_NOTE[f]).filter(Boolean).join(" ");
  return `<div class="qcard" data-draft="${esc(d._id)}"><div class="row"><b>Draft ${i + 1}</b><span class="muted small">${[q.topic, q.subtype, q.difficulty].filter(Boolean).map(esc).join(", ")}</span><span class="spacer"></span>
  <button class="btn sm primary" data-act="draftAccept" data-id="${esc(d._id)}">Accept</button><button class="btn sm" data-act="draftEdit" data-id="${esc(d._id)}">Edit</button><button class="btn sm danger" data-act="draftDiscard" data-id="${esc(d._id)}">Discard</button></div>
  <div class="small" style="margin-top:6px">${draftStatus(d)}${flags ? ` <span class="muted">${esc(flags)}</span>` : ""}</div>
  <div style="margin-top:6px;white-space:pre-wrap">${esc(q.prompt)}</div>
  <div class="opts">${q.options.map((o, k) => `<div class="opt ${k === q.correct ? "right" : ""}">${LETTERS[k]}. ${esc(o)}</div>`).join("")}</div>
  ${draftExplanations(d)}${d.sourceQuote ? `<p class="muted small" style="margin:4px 0 0">From your source: "${esc(d.sourceQuote)}"</p>` : ""}</div>`;
}
function draftsPanel(E) {
  if (!E.drafts || !E.drafts.length) return "";
  return `<div class="row" style="margin-bottom:12px"><h2 style="margin:0">AI drafts to review (${E.drafts.length})</h2><span class="spacer"></span><span class="muted small">Hosting is off until every draft is accepted or discarded.</span></div>
  <div class="list" style="margin-bottom:22px">${E.drafts.map(draftCard).join("")}</div>`;
}
const draftGo = (n) => `Draft ${n} question${Number(n) === 1 ? "" : "s"}`;
ACT.draftOpen = () => { S.draftForm = S.draftForm || { module: DRAFT_MODULES[0], count: 3, difficulty: "mixed", subtype: "", chapter: "", focus: "", sourceText: "" }; openDialog(draftDialog); };
function draftDialog() {
  const f = S.draftForm; const busy = !!S.drafting;
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(label)}</option>`;
  const left = S.draftQuotaLeft == null ? "You can draft up to <b>50</b> questions a day." : `<b>${S.draftQuotaLeft}</b> of <b>50</b> questions left today.`;
  const scope = f.chapter === "" ? `m${DRAFT_MODULES.indexOf(f.module)}` : `c${f.chapter}`;
  // The two model names must match draftModel and verifierModel in functions/qgen-core.js.
  return `<div class="dialog" style="max-width:620px"><h2 style="margin-top:0">Draft questions with AI</h2>
  <p class="muted small">Drafts are written by Claude Sonnet 5.5 and checked by GPT-6.1 Terra. Nothing is added to this set until you accept it. ${left}</p>
  <label class="f">Module and chapter<select id="d_scope">${DRAFT_MODULES.map((m, i) => `<optgroup label="Module ${i + 1}: ${esc(m.slice(m.indexOf("(") + 1, -1))}">`
    + opt(`m${i}`, `Module ${i + 1} · All chapters`, scope) + DRAFT_CHAPTERS[i].map(([n, t]) => opt(`c${n}`, `Module ${i + 1} · Chapter ${n}: ${t}`, scope)).join("") + "</optgroup>").join("")}</select></label>
  <div class="dgrid3">
   <label class="f">How many<select id="d_count">${[1, 2, 3, 4, 5].map((n) => opt(n, n, f.count)).join("")}</select></label>
   <label class="f">Difficulty<select id="d_diff">${[["mixed", "Mixed"], ["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]].map(([v, l]) => opt(v, l, f.difficulty)).join("")}</select></label>
   <label class="f">Subtype<select id="d_sub">${[["", "Any"], ...DRAFT_SUBTYPES.map((x) => [x, x])].map(([v, l]) => opt(v, l, f.subtype)).join("")}</select></label>
  </div>
  <label class="f" style="margin-top:12px">Focus <span class="hint">optional, up to 200 characters</span><input id="d_focus" maxlength="200" value="${esc(f.focus)}"></label>
  <label class="f" style="margin-top:12px">Source text <span class="hint">optional, plain text, up to 12,000 characters; sent to Claude only</span><textarea id="d_src" rows="4" maxlength="12000">${esc(f.sourceText)}</textarea></label>
  <div class="row" style="margin-top:16px"><span class="spacer"></span>${busy ? '<span class="muted small">Drafting and checking can take a minute or two.</span>' : '<button class="btn ghost" data-act="close">Cancel</button>'}<button class="btn primary" id="d_go" data-act="draftRun" ${busy ? "disabled" : ""}>${busy ? "Drafting…" : draftGo(f.count)}</button></div></div>`;
}
document.addEventListener("change", (e) => { if (e.target && e.target.id === "d_count" && !S.drafting) { const b = $("#d_go"); if (b) b.textContent = draftGo(e.target.value); } });
function readDraftForm() {
  const f = S.draftForm; const v = $("#d_scope").value; const n = Number(v.slice(1));
  f.module = DRAFT_MODULES[v[0] === "m" ? n : DRAFT_CHAPTERS.findIndex((cs) => cs.some(([c]) => c === n))]; f.chapter = v[0] === "c" ? n : "";
  f.count = Number($("#d_count").value); f.difficulty = $("#d_diff").value; f.subtype = $("#d_sub").value;
  f.focus = $("#d_focus").value.trim(); f.sourceText = $("#d_src").value; return f;
}
ACT.draftRun = async () => {
  const E = S.edit; if (!E || !C.draft || S.drafting) return; const f = readDraftForm();
  const chapter = f.chapter === "" ? null : f.chapter;
  S.drafting = true; S.dialogLocked = true; rerender();
  let r;
  // The function's own message (quota, access, upstream failure) is shown as is; errMsg() would misread quota_exceeded as storage.
  try { r = await C.draft.run({ module: f.module, count: f.count, setId: E.id, focus: f.focus, chapter, difficulty: f.difficulty, subtype: f.subtype || null, sourceText: f.sourceText }); }
  catch (e) { S.drafting = false; S.dialogLocked = false; rerender(); return toast(e.message || "AI drafting failed.", 6000); }
  S.drafting = false; S.dialogLocked = false; S.draftQuotaLeft = r.quotaLeft;
  const start = E.drafts.length ? Math.max(...E.drafts.map((d) => d.order ?? 0)) + 1 : 0;
  const docs = r.drafts.map((d, k) => ({ ...d, ai: r.ai, order: start + k, createdAt: now(), _id: "d" + rid(9) }));
  await pool(docs.map((d) => () => { const { _id, ...doc } = d; return dset(`${P.setD(E.id)}/${_id}`, doc); }), 6);
  E.drafts.push(...docs);
  await dupd(`${P.sets()}/${E.id}`, { drafts: E.drafts.length, updatedAt: now() });
  S.dialog = null; rerender();
  toast(r.delivered ? `${r.delivered} draft${r.delivered === 1 ? "" : "s"} ready to review.${r.dropped ? ` ${r.dropped} could not be drafted and ${r.dropped === 1 ? "was" : "were"} not counted against today's limit.` : ""}`
    : "No usable drafts came back; nothing was counted against today's limit.", 6000);
};
/** Accepts a draft, or the host's edit of it (from the question editor), into the set. */
async function acceptDraft(id, editedQ) {
  const E = S.edit; const d = E.drafts.find((x) => x._id === id); if (!d) return;
  const q = editedQ || { ...clone(d.question), id: "q" + rid(9) };
  const errs = validateQ(q); if (errs.length) return toast("This question " + errs.join("; ") + ". Edit it before accepting.");
  const keys = ["prompt", "img", "options", "correct", "optFeedback", "explanation", "refs", "topic", "subtype", "difficulty", "timeLimit", "source"];
  const edited = !!editedQ && keys.some((k) => JSON.stringify(editedQ[k] ?? null) !== JSON.stringify(d.question[k] ?? null));
  const ai = d.ai || {}; const v = d.verify || {}; const status = v.status || "unverified"; const day = new Date().toISOString().slice(0, 10);
  q.origin = "ai_draft";
  // Rationales and checker notes stay here, on the host's copy; the room only ever receives prompt, image and options.
  q.ai = { model: ai.model || "", verifierModel: ai.verifierModel || "", promptVersions: ai.promptVersions || {}, generatedAt: ai.generatedAt || null,
    requestSha256: ai.requestSha256 || "", verify: { status, choice: v.choice || null }, auditIssues: (d.auditIssues || []).map((x) => x.check),
    distractorRationales: Object.fromEntries(LETTERS.map((L, k) => [L, (d.rationales || [])[k] || ""])), editedBeforeAccept: edited, acceptedAt: now(), acceptedBy: S.uid };
  const made = ai.generatedAt ? new Date(ai.generatedAt).toISOString().slice(0, 10) : day;
  const note = `Drafted by ${ai.model || "an AI model"} on ${made} (prompt ${(ai.promptVersions || {}).draft || "unknown"}); verified by ${ai.verifierModel || "a second model"}: ${status}; reviewed${edited ? ", edited" : ""} and accepted by the host on ${day}.`;
  q.provenance = [q.provenance, note].filter(Boolean).join(" ");
  const order = E.qs.length ? Math.max(...E.qs.map((x) => x.order ?? 0)) + 1 : 0;
  await dset(`${P.setQ(E.id)}/${q.id}`, qDoc(q, order)); q.order = order; E.qs.push(q);
  await ddel(`${P.setD(E.id)}/${id}`); E.drafts = E.drafts.filter((x) => x._id !== id);
  await dupd(`${P.sets()}/${E.id}`, { count: E.qs.length, drafts: E.drafts.length, updatedAt: now() });
  S.dialog = null; S.qdraftFrom = null; toast(edited ? "Edited draft added to the set." : "Draft added to the set."); rerender();
}
ACT.draftAccept = (el) => acceptDraft(el.dataset.id, null);
ACT.draftEdit = (el) => {
  const d = S.edit.drafts.find((x) => x._id === el.dataset.id); if (!d) return;
  S.qdraftBank = false; S.qdraftFrom = d._id; S.qdraft = { ...clone(d.question), id: "q" + rid(9) }; S.qdraftIndex = -1; openDialog(qEditor);
};
ACT.draftDiscard = async (el) => {
  const E = S.edit; if (!(await askConfirm("Discard this AI draft? It is deleted and not added to the set.", "Discard", true))) return;
  await ddel(`${P.setD(E.id)}/${el.dataset.id}`); E.drafts = E.drafts.filter((x) => x._id !== el.dataset.id);
  await dupd(`${P.sets()}/${E.id}`, { drafts: E.drafts.length, updatedAt: now() }); toast("Draft discarded."); rerender();
};

/* ===================== Live Classroom: host ===================== */
''', "qgen_block")

# Phone widths: 2.1.1 sized the header, the list rows and the large buttons for desktop, and none of them can shrink
# (.btn and .chip are nowrap), so a signed-in phone scrolled sideways: the wordmark, "Sound on" and the name chip
# need 394 px, and a set's four buttons squeezed its title to zero width. The name now truncates, the wordmark drops
# its mark at 420 px or less and keeps the "AlgoArena" text at full size (owner decision, 2026-11-05), list buttons
# wrap below the title at 640 px or less, and a large button wraps its label rather than being cut off.
rep(".btn{white-space:nowrap}\n",
    ".btn{white-space:nowrap}\n"
    ".topbar .chip{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis}\n"
    ".btn.big{white-space:normal;text-wrap:balance;text-align:center}\n"
    "@media (max-width:640px){.item{flex-wrap:wrap}.item .grow{flex-basis:100%}}\n"
    "@media (max-width:420px){.wordmark .mk{display:none}}\n", "phone_fit_css")

# File header and JSDoc overlay (comments only).
rep("<!doctype html>\n", "<!doctype html>\n<!--\n"
    "  AlgoArena route B: the Live Classroom 2.1.1 page on GitHub Pages with Firebase (built by tools/build-from-2.1.1.py).\n\n"
    "  Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,\n"
    "      Northeastern University\n"
    "  Version: 1.0\n"
    "  Created: October 29, 2026 · San Francisco, California, USA\n\n"
    "  License: This project is licensed under the MIT License — see LICENSE.md for details.\n"
    "  Copyright © 2026 Yikang (Richard) Liu.\n"
    "-->\n", "file_header")
sys.path.insert(0, HERE)
import apply_index_comments
s = apply_index_comments.apply(s, apply_index_comments.load_entries())

open(OUT, "w", encoding="utf-8").write(s)
print("applied", n, "patches ->", OUT)
