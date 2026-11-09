/**
 * @fileoverview Reconciles three independent AI ledgers for one day (invariant I5): aiQuota counters, aiLog entries, and the
 * Anthropic Console (entered by hand). Also checks every session counter against its cap and its aiLog entries.
 *    GOOGLE_CLOUD_PROJECT=<id> node reconcile.mjs --day 2026-11-05 [--console-requests 63]
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
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith("--") ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
if (!a.day) { console.error("Usage: node reconcile.mjs --day YYYY-MM-DD [--console-requests n]"); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT }); const db = getFirestore();
const quota = (await db.collection("aiQuota").where("day", "==", a.day).get()).docs.map((d) => d.data());
const logs = (await db.collection("aiLog").where("day", "==", a.day).get()).docs.map((d) => d.data());
const qTotal = quota.reduce((s, x) => s + (x.count || 0), 0); let fails = 0;
console.log(`aiQuota daily total ${qTotal}, aiLog entries ${logs.length}`); if (qTotal !== logs.length) { fails++; console.log("MISMATCH: daily counters vs log"); }
for (const sid of [...new Set(logs.map((l) => l.sid).filter(Boolean))]) {
  const host = logs.find((l) => l.sid === sid).uid; const s = (await db.doc(`aiQuota/${host}_s_${sid}`).get()).data() || {};
  const n = logs.filter((l) => l.sid === sid).length; const line = `session ${sid}: counter ${s.count ?? 0}, cap ${s.cap ?? "?"}, log ${n}`;
  if ((s.count ?? 0) < n || (s.cap != null && s.count > s.cap)) { fails++; console.log("MISMATCH " + line); } else console.log(line);
}
if (a["console-requests"] != null) { const c = Number(a["console-requests"]); console.log(`Anthropic Console requests ${c}`); if (c !== logs.length) { fails++; console.log("MISMATCH: console vs log (failed upstream calls are refunded and not logged; check the Console's error count)"); } }
console.log(`input tokens ${logs.reduce((s, l) => s + (l.input_tokens || 0), 0)}, output tokens ${logs.reduce((s, l) => s + (l.output_tokens || 0), 0)} (compare with the Console)`);
console.log(fails ? `FAIL: ${fails} mismatch(es)` : "PASS: ledgers agree"); process.exit(fails ? 1 : 0);
