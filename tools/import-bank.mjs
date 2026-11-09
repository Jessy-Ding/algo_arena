/**
 * @fileoverview Imports the built-in question bank into Firestore and optionally sets the admin list.
 * Uses the Admin SDK, which bypasses security rules, so run it only from your own computer.
 *    cd tools && npm install
 *    gcloud auth application-default login        (or set GOOGLE_APPLICATION_CREDENTIALS to a service-account key)
 *    GOOGLE_CLOUD_PROJECT=<project-id> node import-bank.mjs ../data/bank.json --admin <your-uid>
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
import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [file, ...rest] = process.argv.slice(2);
if (!file || !process.env.GOOGLE_CLOUD_PROJECT) { console.error("Usage: GOOGLE_CLOUD_PROJECT=<id> node import-bank.mjs <bank.json> [--admin <uid> ...]"); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT });
const db = getFirestore();
const docs = JSON.parse(readFileSync(file, "utf8"));
const difficulty = {};
for (let i = 0; i < docs.length; i += 400) {
  const batch = db.batch();
  for (const d of docs.slice(i, i + 400)) { const { _id, ...data } = d; difficulty[data.difficulty] = (difficulty[data.difficulty] || 0) + 1; batch.set(db.doc(`bank/${_id}`), data); }
  await batch.commit();
}
await db.doc("meta/bank").set({ count: docs.length, difficulty, source: "AlgoArena 2.1.1 database snapshot (2026-10-29)", loadedAt: Date.now() });
console.log(`Imported ${docs.length} questions into bank/.`);
const k = rest.indexOf("--admin");
if (k >= 0) { const uids = rest.slice(k + 1).filter(Boolean); await db.doc("meta/admins").set({ uids }); console.log("meta/admins.uids =", uids); }
