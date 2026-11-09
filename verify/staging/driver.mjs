/**
 * @fileoverview AlgoArena staging driver: timing calibration (invariant I4) and load test, against a STAGING Firebase project.
 * Players use the client SDK with custom tokens, so the real security rules apply to every answer they write.
 * The host role is played by the Admin SDK (the host is trusted; its writes are not under test here).
 *
 *   cd verify/staging && npm install
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/staging-service-account.json   # never commit this file
 *   export GOOGLE_CLOUD_PROJECT=<staging-project-id>
 *   node driver.mjs calibrate --trials 120 --out ../results/timing.csv
 *   node driver.mjs load --clients 120 --questions 5 --out ../results/load-120.json
 *   node driver.mjs load --clients 240 --questions 5 --out ../results/load-240.json
 * Run calibration from the network you care about (classroom Wi-Fi). Ground truth is this machine's monotonic clock.
 *
 * Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
 *     Northeastern University
 * Version: 1.0
 * Created: October 29, 2026 · San Francisco, California, USA
 *
 * License: This project is licensed under the MIT License — see LICENSE.md for details.
 * Copyright © 2026 Yikang (Richard) Liu.
 * @license MIT
 */
import { initializeApp as adminInit, applicationDefault } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { getFirestore, doc, setDoc, getDocFromServer, onSnapshot, serverTimestamp } from "firebase/firestore";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import CONFIG from "../../site/firebase-config.js";

const args = Object.fromEntries(process.argv.slice(3).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const mode = process.argv[2];
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
if (!PROJECT || !["calibrate", "load"].includes(mode)) { console.error("Usage: node driver.mjs calibrate|load [--trials n] [--clients n] [--questions n] --out file"); process.exit(1); }
if (CONFIG.firebase.projectId !== PROJECT) { console.error(`firebase-config.js points at ${CONFIG.firebase.projectId}, not ${PROJECT}. Use a staging config.`); process.exit(1); }

adminInit({ credential: applicationDefault(), projectId: PROJECT });
const adb = adminFirestore();
const HOST = "verify-host";
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
// Nearest-rank percentile; p = 1 gives the maximum.
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const out = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); console.log("wrote", file); };

async function client(uid) {
  const app = initializeApp(CONFIG.firebase, uid);
  await signInWithCustomToken(getAuth(app), await adminAuth().createCustomToken(uid));
  const db = getFirestore(app);
  // Same server-offset estimate as site/platform-firebase.js: lowest-RTT of 3 write-then-read round trips.
  const ref = doc(db, `data/users/${uid}/clock`); let best = null;
  for (let k = 0; k < 3; k++) {
    const t0 = Date.now(); await setDoc(ref, { t: serverTimestamp() }); const s = await getDocFromServer(ref); const t1 = Date.now();
    const rtt = t1 - t0; const off = s.data().t.toMillis() - (t0 + t1) / 2; if (!best || rtt < best.rtt) best = { rtt, off };
  }
  return { uid, db, offset: best.off, rtt: best.rtt };
}
async function showQuestion(sid, q, readS, T) {
  await adb.doc(`rooms/${HOST}`).set({ sid, code: "VERIFY", hostId: HOST, status: "question", qIndex: q, readS, q: { T, R: readS }, shownSrv: FieldValue.serverTimestamp(), openNowSrv: null });
}
const closeQuestion = () => adb.doc(`rooms/${HOST}`).set({ status: "closed" }, { merge: true });
function waitForQuestion(c, q) {
  return new Promise((resolve) => {
    const stop = onSnapshot(doc(c.db, `rooms/${HOST}`), (s) => {
      const r = s.data(); if (s.metadata.hasPendingWrites || !r || r.status !== "question" || r.qIndex !== q || !r.shownSrv) return;
      stop(); resolve({ r, seenMono: performance.now() });
    });
  });
}
async function answer(c, sid, q) {
  const id = `${c.uid}_${sid}_${q}`; const ref = doc(c.db, `rooms/${HOST}/answers/${id}`);
  const t0 = performance.now();
  try { await setDoc(ref, { uid: c.uid, sid, q, ct: "calibration", srv: serverTimestamp(), mono: null, dev: "driver" }); }
  catch (e) { return { ok: false, code: e.code || String(e), latency: performance.now() - t0 }; }
  const latency = performance.now() - t0;
  const s = await getDocFromServer(ref);
  return { ok: true, latency, srv: s.data().srv.toMillis() };
}
async function cleanup(sid) {
  const qs = await adb.collection(`rooms/${HOST}/answers`).where("sid", "==", sid).get();
  for (let i = 0; i < qs.docs.length; i += 400) { const b = adb.batch(); qs.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref)); await b.commit(); }
}

if (mode === "calibrate") {
  const trials = Number(args.trials || 120); const sid = "Vcal" + Date.now(); const readS = 3, T = 20;
  const c = await client("verify-p001"); const rows = ["trial,true_delay_ms,recorded_ms,diff_ms,offset_est_ms,probe_rtt_ms,write_latency_ms,outcome"];
  for (let k = 0; k < trials; k++) {
    const seen = waitForQuestion(c, k); await showQuestion(sid, k, readS, T); const { r } = await seen;
    const open = r.shownSrv.toMillis() + readS * 1000;
    // The page unlocks at the open time on its own clock (server time minus the estimated offset).
    const monoUnlock = performance.now() + (open - c.offset - Date.now());
    const delay = 300 + Math.floor(Math.random() * 7700);
    await sleep(monoUnlock + delay - performance.now());
    const monoTap = performance.now(); const res = await answer(c, sid, k);
    const trueDelay = monoTap - monoUnlock;
    rows.push([k, trueDelay.toFixed(1), res.ok ? res.srv - open : "", res.ok ? (res.srv - open - trueDelay).toFixed(1) : "", c.offset.toFixed(1), c.rtt, res.latency.toFixed(1), res.ok ? "accepted" : "refused:" + res.code].join(","));
    await closeQuestion(); await sleep(300);
  }
  out(args.out || "../results/timing.csv", rows.join("\n") + "\n"); await cleanup(sid);
  console.log("Next: python3 ../analysis/bland_altman.py", args.out || "../results/timing.csv");
}

if (mode === "load") {
  const n = Number(args.clients || 120), questions = Number(args.questions || 5), readS = 2, T = 15; const sid = "Vload" + Date.now();
  const clients = []; const joinLat = []; const errors = {};
  for (let i = 0; i < n; i += 20) {
    const batch = await Promise.allSettled(Array.from({ length: Math.min(20, n - i) }, (_, k) => client(`verify-p${String(i + k + 1).padStart(3, "0")}`)));
    for (const b of batch) if (b.status === "fulfilled") clients.push(b.value); else errors["signin:" + (b.reason && b.reason.code)] = (errors["signin:" + (b.reason && b.reason.code)] || 0) + 1;
  }
  await Promise.all(clients.map(async (c) => {
    const t0 = performance.now();
    try { await setDoc(doc(c.db, `pub/${c.uid}`), { sid, host: HOST, name: c.uid, joinedAt: Date.now() }); joinLat.push(performance.now() - t0); }
    catch (e) { errors["join:" + e.code] = (errors["join:" + e.code] || 0) + 1; }
  }));
  const ans = []; let attempted = 0, accepted = 0;
  for (let q = 0; q < questions; q++) {
    const seen = clients.map((c) => waitForQuestion(c, q)); await showQuestion(sid, q, readS, T);
    await Promise.all(clients.map(async (c, k) => {
      const { r } = await seen[k]; const open = r.shownSrv.toMillis() + readS * 1000;
      await sleep(open - c.offset - Date.now() + 500 + Math.random() * (T * 1000 - 3000)); attempted++;
      const res = await answer(c, sid, q); if (res.ok) { accepted++; ans.push(res.latency); } else errors["answer:" + res.code] = (errors["answer:" + res.code] || 0) + 1;
    }));
    await closeQuestion(); await sleep(1000);
  }
  const summary = {
    clients_requested: n, clients_signed_in: clients.length, questions,
    join_success_rate: joinLat.length / n, answer_acceptance_rate: attempted ? accepted / attempted : null,
    write_latency_ms: { p50: pct(ans, 0.5), p95: pct(ans, 0.95), max: pct(ans, 1) }, join_latency_ms: { p50: pct(joinLat, 0.5), p95: pct(joinLat, 0.95) }, errors,
  };
  summary.pass = summary.join_success_rate === 1 && summary.answer_acceptance_rate >= 0.99 && summary.write_latency_ms.p95 <= 500;
  out(args.out || `../results/load-${n}.json`, JSON.stringify(summary, null, 2)); await cleanup(sid);
  for (const c of clients) await adb.doc(`pub/${c.uid}`).delete().catch(() => {});
}
process.exit(0);
