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
