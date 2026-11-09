/**
 * @fileoverview Firestore security-rules tests for firestore.rules, run on the Firestore emulator with
 * @firebase/rules-unit-testing: private user data, the question bank, rooms, the timed answer window, public player
 * records, report deliveries, and the server-only AI quota and log collections.
 *
 * Run with the Firestore emulator:
 *   cd test/rules && npm install
 *   firebase emulators:exec --only firestore --project demo-algoarena "npm test"
 * (run the firebase command from the repo root so it finds firebase.json and firestore.rules)
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
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, Timestamp } from "firebase/firestore";

let env;
const HOST = "host_uid_aaaaaaaaaaaaaaaaaaaa";
const A = "alice_uid_aaaaaaaaaaaaaaaaaaa";
const B = "bob_uid_aaaaaaaaaaaaaaaaaaaaa";
const SID = "Stest1";

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-algoarena",
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8") },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
async function seed(path, data) { await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), path), data); }); }

async function seedRoom({ shownAgoMs, readS = 3, T = 15, status = "question", qIndex = 0, openNowAgoMs = null }) {
  const r = { sid: SID, code: "ABC123", hostId: HOST, status, qIndex, readS, q: { T, R: readS }, shownSrv: Timestamp.fromMillis(Date.now() - shownAgoMs) };
  if (openNowAgoMs != null) r.openNowSrv = Timestamp.fromMillis(Date.now() - openNowAgoMs);
  await seed(`rooms/${HOST}`, r);
}
const answer = (uid, over = {}) => ({ uid, sid: SID, q: 0, ct: "sealed", srv: serverTimestamp(), mono: 1200, dev: "d1", ...over });
const aid = (uid, q = 0, sid = SID) => `${uid}_${sid}_${q}`;
const ansRef = (db, id) => doc(db, `rooms/${HOST}/answers/${id}`);

test("signed-out users read nothing", async () => {
  await seedRoom({ shownAgoMs: 0 });
  await assertFails(getDoc(doc(anon(), `rooms/${HOST}`)));
  await assertFails(getDoc(doc(anon(), "bank/b0001")));
});

test("own data is private", async () => {
  await assertSucceeds(setDoc(doc(as(A), `data/users/${A}/profile`), { displayName: "Alice" }));
  await assertSucceeds(getDoc(doc(as(A), `data/users/${A}/profile`)));
  await assertFails(getDoc(doc(as(B), `data/users/${A}/profile`)));
  await assertFails(setDoc(doc(as(B), `data/users/${A}/profile/sets/s1`), { title: "x" }));
});

test("bank: everyone signed in reads, only admins write", async () => {
  await seed("bank/b0001", { prompt: "q" });
  await assertSucceeds(getDoc(doc(as(A), "bank/b0001")));
  await assertFails(setDoc(doc(as(A), "bank/b0002"), { prompt: "x" }));
  await seed("meta/admins", { uids: [HOST] });
  await assertSucceeds(setDoc(doc(as(HOST), "bank/b0002"), { prompt: "x" }));
});

test("only the host writes its room", async () => {
  await seedRoom({ shownAgoMs: 0 });
  await assertSucceeds(getDoc(doc(as(A), `rooms/${HOST}`)));
  await assertFails(updateDoc(doc(as(A), `rooms/${HOST}`), { status: "ended" }));
  await assertSucceeds(updateDoc(doc(as(HOST), `rooms/${HOST}`), { status: "ended" }));
});

test("answer accepted inside the window with the server timestamp", async () => {
  await seedRoom({ shownAgoMs: 5000, readS: 3, T: 15 });
  await assertSucceeds(setDoc(ansRef(as(A), aid(A)), answer(A)));
});

test("answer rejected during the reading phase", async () => {
  await seedRoom({ shownAgoMs: 1000, readS: 10, T: 15 });
  await assertFails(setDoc(ansRef(as(A), aid(A)), answer(A)));
});

test("answer accepted during reading once the host opened answers early", async () => {
  await seedRoom({ shownAgoMs: 2000, readS: 10, T: 15, openNowAgoMs: 500 });
  await assertSucceeds(setDoc(ansRef(as(A), aid(A)), answer(A)));
});

test("answer rejected after the deadline", async () => {
  await seedRoom({ shownAgoMs: 30000, readS: 3, T: 15 });
  await assertFails(setDoc(ansRef(as(A), aid(A)), answer(A)));
});

test("answer rejected when the room is not taking answers", async () => {
  await seedRoom({ shownAgoMs: 5000, status: "closed" });
  await assertFails(setDoc(ansRef(as(A), aid(A)), answer(A)));
});

test("answer rejected with a client-chosen timestamp", async () => {
  await seedRoom({ shownAgoMs: 5000 });
  await assertFails(setDoc(ansRef(as(A), aid(A)), answer(A, { srv: Timestamp.fromMillis(Date.now() - 4000) })));
});

test("answer rejected for another user, question, session or id", async () => {
  await seedRoom({ shownAgoMs: 5000 });
  await assertFails(setDoc(ansRef(as(A), aid(B)), answer(B)));
  await assertFails(setDoc(ansRef(as(A), aid(A, 1)), answer(A, { q: 1 })));
  await assertFails(setDoc(ansRef(as(A), aid(A, 0, "Sother")), answer(A, { sid: "Sother" })));
  await assertFails(setDoc(ansRef(as(A), "anything"), answer(A)));
  await assertFails(setDoc(ansRef(as(A), aid(A)), answer(A, { score: 1000 })));
});

test("a selection is never overwritten: a second write to the same document is refused", async () => {
  await seedRoom({ shownAgoMs: 5000 });
  await assertSucceeds(setDoc(ansRef(as(A), aid(A)), answer(A)));
  await assertFails(setDoc(ansRef(as(A), aid(A)), answer(A, { ct: "changed" })));
});

test("a change is a new document numbered after the previous selection, inside the window", async () => {
  await seedRoom({ shownAgoMs: 5000 });
  await assertFails(setDoc(ansRef(as(A), aid(A) + "_c1"), answer(A, { n: 1 }))); // no first answer yet
  await assertSucceeds(setDoc(ansRef(as(A), aid(A)), answer(A)));
  await assertSucceeds(setDoc(ansRef(as(A), aid(A) + "_c1"), answer(A, { n: 1, ct: "second" })));
  await assertFails(setDoc(ansRef(as(A), aid(A) + "_c3"), answer(A, { n: 3 }))); // skips change 2
  await assertSucceeds(setDoc(ansRef(as(A), aid(A) + "_c2"), answer(A, { n: 2 })));
  await assertFails(setDoc(ansRef(as(A), aid(A) + "_c2"), answer(A, { n: 2, ct: "rewrite" }))); // history is fixed
});

test("a change must match its document id and stay within 20 changes", async () => {
  await seedRoom({ shownAgoMs: 5000 });
  await seed(`rooms/${HOST}/answers/${aid(B)}`, answer(B, { srv: Timestamp.now() }));
  await seed(`rooms/${HOST}/answers/${aid(B)}_c20`, answer(B, { n: 20, srv: Timestamp.now() }));
  await assertFails(setDoc(ansRef(as(B), aid(B) + "_c21"), answer(B, { n: 21 }))); // over the cap, previous exists
  await assertFails(setDoc(ansRef(as(B), aid(B) + "_c1"), answer(B, { n: 2 }))); // n does not match the id
  await assertFails(setDoc(ansRef(as(B), aid(B) + "_c0"), answer(B, { n: 0 }))); // n 0 is the first answer's id only
  await assertFails(setDoc(ansRef(as(B), aid(B) + "_c-1"), answer(B, { n: -1 })));
  await assertFails(setDoc(ansRef(as(B), aid(B) + "_c1"), answer(B, { n: "1" })));
});

test("a change after the deadline is refused", async () => {
  await seedRoom({ shownAgoMs: 30000, readS: 3, T: 15 });
  await seed(`rooms/${HOST}/answers/${aid(A)}`, answer(A, { srv: Timestamp.fromMillis(Date.now() - 20000) }));
  await assertFails(setDoc(ansRef(as(A), aid(A) + "_c1"), answer(A, { n: 1 })));
});

test("answers are readable by the host and their author only", async () => {
  await seedRoom({ shownAgoMs: 5000 });
  await setDoc(ansRef(as(A), aid(A)), answer(A));
  await assertSucceeds(getDoc(ansRef(as(A), aid(A))));
  await assertSucceeds(getDoc(ansRef(as(HOST), aid(A))));
  await assertFails(getDoc(ansRef(as(B), aid(A))));
  await assertSucceeds(getDocs(query(collection(as(HOST), `rooms/${HOST}/answers`), where("sid", "==", SID))));
  await assertFails(getDocs(query(collection(as(B), `rooms/${HOST}/answers`), where("sid", "==", SID))));
});

test("public record: readable by its owner and the host it names", async () => {
  await seed(`pub/${A}`, { sid: SID, host: HOST, name: "Alice" });
  await assertSucceeds(getDoc(doc(as(A), `pub/${A}`)));
  await assertSucceeds(getDoc(doc(as(HOST), `pub/${A}`)));
  await assertFails(getDoc(doc(as(B), `pub/${A}`)));
  await assertSucceeds(getDocs(query(collection(as(HOST), "pub"), where("sid", "==", SID), where("host", "==", HOST))));
  await assertFails(getDocs(query(collection(as(HOST), "pub"), where("sid", "==", SID))));
  await assertFails(setDoc(doc(as(B), `pub/${A}`), { sid: SID, host: B }));
});

test("report deliveries: recipient and host only, even before the report exists", async () => {
  await seed(`rooms/${HOST}/r/${SID}_${A}`, { sid: SID, sealed: "x" });
  await assertSucceeds(getDoc(doc(as(A), `rooms/${HOST}/r/${SID}_${A}`)));
  await assertSucceeds(getDoc(doc(as(HOST), `rooms/${HOST}/r/${SID}_${A}`)));
  await assertFails(getDoc(doc(as(B), `rooms/${HOST}/r/${SID}_${A}`)));
  await assertSucceeds(getDoc(doc(as(B), `rooms/${HOST}/r/${SID}_${B}`)));
  await assertFails(setDoc(doc(as(A), `rooms/${HOST}/r/${SID}_${A}`), { sealed: "forged" }));
});

test("AI quota counters and the AI call log are closed to clients", async () => {
  await seed(`aiQuota/${A}_2026-10-29`, { count: 1 });
  await seed("aiLog/e1", { uid: A });
  await assertFails(getDoc(doc(as(A), `aiQuota/${A}_2026-10-29`)));
  await assertFails(setDoc(doc(as(A), `aiQuota/${A}_2026-10-29`), { count: 0 }));
  await assertFails(getDoc(doc(as(HOST), "aiLog/e1")));
  await assertFails(setDoc(doc(as(HOST), "aiLog/e2"), { uid: HOST }));
});

// Round 2: cases the emulator's rules coverage report showed were never exercised.
test("signed-out users are refused on every path", async () => {
  await seedRoom({ shownAgoMs: 5000 });
  await seed(`pub/${A}`, { sid: SID, host: HOST });
  await seed(`rooms/${HOST}/r/${SID}_${A}`, { sealed: "x" });
  const db = anon();
  await assertFails(getDoc(doc(db, `data/users/${A}/profile`)));
  await assertFails(setDoc(doc(db, `data/users/${A}/profile`), { displayName: "x" }));
  await assertFails(setDoc(doc(db, "bank/b0009"), { prompt: "x" }));
  await assertFails(setDoc(doc(db, `rooms/${HOST}`), { status: "ended" }));
  await assertFails(getDoc(doc(db, `rooms/${HOST}/r/${SID}_${A}`)));
  await assertFails(setDoc(doc(db, `rooms/${HOST}/r/${SID}_${A}`), { sealed: "forged" }));
  await assertFails(getDoc(ansRef(db, aid(A))));
  await assertFails(setDoc(ansRef(db, aid(A)), answer(A)));
  await assertFails(getDoc(doc(db, `pub/${A}`)));
  await assertFails(setDoc(doc(db, `pub/${A}`), { sid: SID, host: HOST }));
});

test("the host writes report deliveries and a player writes their own public record", async () => {
  await assertSucceeds(setDoc(doc(as(HOST), `rooms/${HOST}/r/${SID}_${A}`), { sid: SID, sealed: "x" }));
  await assertSucceeds(setDoc(doc(as(A), `pub/${A}`), { sid: SID, host: HOST, name: "Alice" }));
});

test("answer rejected when a required field is missing or ct is not a short string", async () => {
  await seedRoom({ shownAgoMs: 5000 });
  const { ct, ...noCt } = answer(A);
  await assertFails(setDoc(ansRef(as(A), aid(A)), noCt));
  await assertFails(setDoc(ansRef(as(A), aid(A)), answer(A, { ct: 5 })));
  await assertFails(setDoc(ansRef(as(A), aid(A)), answer(A, { ct: "x".repeat(4096) })));
  await assertSucceeds(setDoc(ansRef(as(A), aid(A)), answer(A, { ct: "x".repeat(4095) })));
});

test("answer rejected after the deadline of an early open", async () => {
  await seedRoom({ shownAgoMs: 40000, readS: 30, T: 15, openNowAgoMs: 20000 });
  await assertFails(setDoc(ansRef(as(A), aid(A)), answer(A)));
});

test("answer rejected before an early-open time that lies in the future", async () => {
  await seedRoom({ shownAgoMs: 1000, readS: 10, T: 15, openNowAgoMs: -5000 });
  await assertFails(setDoc(ansRef(as(A), aid(A)), answer(A)));
});

test("only admins can change the AI host list or the admin list", async () => {
  await seed("meta/admins", { uids: [HOST] });
  await assertFails(setDoc(doc(as(A), "meta/aiHosts"), { uids: [A] }));
  await assertFails(setDoc(doc(as(A), "meta/admins"), { uids: [A] }));
  await assertSucceeds(setDoc(doc(as(HOST), "meta/aiHosts"), { uids: [B] }));
});
