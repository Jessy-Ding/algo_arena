/**
 * @fileoverview Exports one session's AI reports with the data they must be grounded in, for grounding.mjs and rating_sheet.py.
 * The output contains student names: keep it on your machine, outside the repository.
 *    cd verify/ai && npm install
 *    GOOGLE_CLOUD_PROJECT=<id> node export-reports.mjs --host <hostUid> --sid <sid> --out ../results/reports.json
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
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith("--") ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
if (!a.host || !a.sid) { console.error("Usage: node export-reports.mjs --host <uid> --sid <sid> [--out file]"); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT });
const db = getFirestore(); const base = `data/users/${a.host}/profile/sessions/${a.sid}`;
const meta = (await db.doc(base).get()).data();
const logs = (await db.collection(`${base}/log`).get()).docs.map((d) => d.data());
const ai = Object.fromEntries((await db.collection(`${base}/ai`).get()).docs.map((d) => [d.id, d.data()]));
const questions = logs.map((l) => ({ q_index: l.q_index, topic: l.topic || "" })).sort((x, y) => x.q_index - y.q_index);
const players = (meta.participants || []).map((p) => ({
  uid: p.uid, pid: p.pid, name: p.name,
  submissions: logs.map((l) => { const s = (l.submissions || []).find((x) => x.uid === p.uid); return { q_index: l.q_index, answered: !!s, correct: !!(s && s.correct), timed_out: !!(s && s.timed_out) }; }),
  report: ai[p.uid] ? { status: ai[p.uid].status, md: ai[p.uid].md || "", json: ai[p.uid].json || null, words: ai[p.uid].words ?? null, model: ai[p.uid].model || null } : null,
}));
const cls = ai._class ? { status: ai._class.status, md: ai._class.md || "", json: ai._class.json || null, model: ai._class.model || null } : null;
const file = a.out || "../results/reports.json"; mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify({ sid: a.sid, questions, players, class: cls }, null, 2)); console.log("wrote", file);
