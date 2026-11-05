/**
 * @fileoverview Test stand-in for the Firebase JS SDK subset that platform-firebase.js uses.
 * All iframes share one store in the harness page (window.parent.__FB). The server clock is the harness page's clock;
 * iframes may have skewed clocks.
 * Security: a JavaScript mirror of firestore.rules for the paths the app uses, so the app is tested against the same
 * refusals (answer window, create-only answers, host-filtered pub queries). The rules file itself is tested separately
 * against the real emulator (test/rules).
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
const M = window.parent.__FB;
const ME = new URLSearchParams(location.search).get("u");
const LAT = 20;
const later = (fn) => setTimeout(fn, LAT);
const delay = () => new Promise((r) => setTimeout(r, LAT));

export class Timestamp { constructor(ms) { this._ms = ms; } toMillis() { return this._ms; } static fromMillis(ms) { return new Timestamp(ms); } }
export class FieldPath { constructor(...segs) { this.segs = segs; } }
export class GoogleAuthProvider { setCustomParameters() {} }
const SENT = "__srv";
/**
 * enc() replaces this sentinel with the server time on write.
 *
 * @return {!Object}
 */
export function serverTimestamp() { return { [SENT]: true }; }
const isSent = (v) => v && typeof v === "object" && v[SENT] === true;

/* ---------- app and auth ---------- */
/**
 * @param {!Object} config
 * @return {{config: !Object}}
 */
export function initializeApp(config) { return { config }; }
const auth = { currentUser: null };
function userObj() { return M.signedIn[ME] ? { uid: ME, displayName: M.names[ME] || ME, email: ME + "@example.edu" } : null; }
/**
 * Re-reads this frame's sign-in state from the shared store on every call.
 *
 * @return {{currentUser: ?Object}}
 */
export function getAuth() { auth.currentUser = userObj(); return auth; }
/**
 * Fires once, after the simulated latency; later sign-in changes are not reported.
 *
 * @param {!Object} a
 * @param {function(?Object)} cb
 * @return {function()} A no-op unsubscribe.
 */
export function onAuthStateChanged(a, cb) { later(() => cb(userObj())); return () => {}; }
/**
 * Signs in this frame's test user (the ?u= uid) without any popup.
 *
 * @param {{currentUser: ?Object}} a
 * @return {!Promise<{user: !Object}>}
 */
export async function signInWithPopup(a) {
  await delay();
  if (M.popupBlocked) throw Object.assign(new Error("Popup blocked"), { code: "auth/popup-blocked" });
  M.signedIn[ME] = true; a.currentUser = userObj(); return { user: a.currentUser };
}
/**
 * @param {{currentUser: ?Object}} a
 * @return {!Promise<void>}
 */
export async function signOut(a) { M.signedIn[ME] = false; a.currentUser = null; }

/* ---------- encoding: stored data is JSON with {__ts: ms} for timestamps ---------- */
function enc(v, now) {
  if (isSent(v)) return { __ts: now };
  if (v instanceof Timestamp || (v && typeof v.toMillis === "function")) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map((x) => enc(x, now));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = enc(x, now); return o; }
  return v;
}
function dec(v) {
  if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1 && "__ts" in v) return new Timestamp(v.__ts);
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = dec(x); return o; }
  return v;
}
const ms = (v) => (v && typeof v === "object" && "__ts" in v ? v.__ts : v);
const segs = (p) => p.split("/").filter(Boolean);
const parentOf = (p) => segs(p).slice(0, -1).join("/");
const denied = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });

/* ---------- rules mirror ---------- */
function isAdmin(uid) { const a = M.docs.get("meta/admins"); return !!(a && (a.uids || []).includes(uid)); }
function inWindow(r, now) {
  const T = Number(r.q && r.q.T) * 1000;
  const open = r.openNowSrv != null ? ms(r.openNowSrv) : ms(r.shownSrv) + Number(r.readS) * 1000;
  return now >= open && now <= open + T + 250;
}
function validAnswer(host, aid, raw, now) {
  const r = M.docs.get(`rooms/${host}`); if (!r || r.status !== "question") return false;
  const keys = Object.keys(raw); const allowed = ["uid", "sid", "q", "ct", "srv", "mono", "localAt", "offset", "rtt", "dev"];
  if (!keys.every((k) => allowed.includes(k)) || !["uid", "sid", "q", "ct", "srv"].every((k) => keys.includes(k))) { M.refusedWhy = [...(M.refusedWhy || []), { who: ME, why: ["keys"], keys }]; return false; }
  const why = [["uid", raw.uid === ME], ["sid", raw.sid === r.sid], ["q", raw.q === r.qIndex], ["ct", typeof raw.ct === "string" && raw.ct.length < 4096],
    ["aid", aid === `${ME}_${r.sid}_${r.qIndex}`], ["srv", isSent(raw.srv)], ["window", inWindow(r, now)]].filter(([, ok]) => !ok).map(([k]) => k);
  if (why.length) M.refusedWhy = [...(M.refusedWhy || []), { who: ME, why, ctLen: raw.ct && raw.ct.length }];
  return !why.length;
}
function canRead(path) {
  const s = segs(path); if (!M.signedIn[ME]) return false;
  if (s[0] === "data" && s[1] === "users") return s[2] === ME;
  if (s[0] === "bank" || s[0] === "meta") return true;
  if (s[0] === "rooms" && s.length === 2) return true;
  if (s[0] === "rooms" && s[2] === "r") return s[1] === ME || s[3].endsWith("_" + ME);
  if (s[0] === "rooms" && s[2] === "answers") return s[1] === ME || s[3].startsWith(ME + "_");
  if (s[0] === "pub") { const d = M.docs.get(path); return s[1] === ME || !!(d && d.host === ME); }
  return false;
}
function canList(colPath, cons) {
  const s = segs(colPath); if (!M.signedIn[ME]) return false;
  if (s[0] === "pub" && s.length === 1) return cons.some((c) => c.k === "where" && c.f === "host" && c.op === "==" && c.v === ME);
  if (s[0] === "rooms" && s[2] === "answers") return s[1] === ME;
  if (s[0] === "rooms" && s.length === 1) return true;
  return canRead(colPath + "/x");
}
function canWrite(path, raw, exists, now) {
  const s = segs(path); if (!M.signedIn[ME]) return false;
  if (s[0] === "data" && s[1] === "users") return s[2] === ME;
  if (s[0] === "bank" || s[0] === "meta") return isAdmin(ME);
  if (s[0] === "rooms" && s.length === 2) return s[1] === ME;
  if (s[0] === "rooms" && s[2] === "r") return s[1] === ME;
  if (s[0] === "rooms" && s[2] === "answers") return !exists && raw != null && validAnswer(s[1], s[3], raw, now);
  if (s[0] === "pub") return s[1] === ME;
  return false;
}

/* ---------- subscriptions ---------- */
function notify(path) {
  for (const sub of M.subs) if (sub.path === path || sub.col === parentOf(path)) later(() => { if (M.subs.has(sub)) sub.deliver(); });
}

/* ---------- firestore ---------- */
/** @return {{kind: string}} */
export function initializeFirestore() { return { kind: "firestore" }; }
/** @return {{kind: string}} */
export function getFirestore() { return { kind: "firestore" }; }
/**
 * With a collection reference, returns a random-id child whose `id` is the placeholder "x".
 *
 * @param {!Object} db Firestore handle or collection reference.
 * @param {string=} path
 * @return {{kind: string, path: string, id: string}}
 */
export function doc(db, path) {
  if (db && db.kind === "col") { const id = Math.random().toString(36).slice(2, 12); return { kind: "doc", path: db.path + "/" + id, id }; }
  // The real SDK refuses odd-length document paths; a mock that accepted them hid a broken path in round 3.
  if (segs(path).length % 2) throw new Error(`Invalid document reference. Document references must have an even number of segments, but ${path} has ${segs(path).length}.`);
  return { kind: "doc", path, id: segs(path).at(-1) };
}
/**
 * @param {!Object} db
 * @param {string} path
 * @return {{kind: string, path: string}}
 */
export function collection(db, path) { return { kind: "col", path }; }
/**
 * @param {string} f
 * @param {string} op
 * @param {*} v
 * @return {{k: string, f: string, op: string, v: *}}
 */
export function where(f, op, v) { return { k: "where", f, op, v }; }
/**
 * @param {string} f
 * @param {string=} dir "asc" or "desc".
 * @return {{k: string, f: string, dir: string}}
 */
export function orderBy(f, dir = "asc") { return { k: "order", f, dir }; }
/**
 * @param {number} n
 * @return {{k: string, n: number}}
 */
export function limit(n) { return { k: "limit", n }; }
/**
 * @param {{path: string}} col
 * @param {...!Object} cons
 * @return {{kind: string, path: string, cons: !Array<!Object>}}
 */
export function query(col, ...cons) { return { kind: "query", path: col.path, cons }; }

function docSnapshot(path) {
  const d = M.docs.get(path);
  return { id: segs(path).at(-1), exists: () => d !== undefined, data: () => (d === undefined ? undefined : dec(JSON.parse(JSON.stringify(d)))), metadata: { hasPendingWrites: false } };
}
function runQuery(path, cons) {
  let rows = [...M.docs.entries()].filter(([k]) => parentOf(k) === path).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (const c of cons.filter((x) => x.k === "where")) rows = rows.filter(([, d]) => { const a = ms(d[c.f]);
    return c.op === "==" ? a === c.v : c.op === "!=" ? a !== c.v : c.op === "<" ? a < c.v : c.op === "<=" ? a <= c.v : c.op === ">" ? a > c.v : c.op === ">=" ? a >= c.v : c.op === "in" ? c.v.includes(a) : c.op === "array-contains" ? Array.isArray(a) && a.includes(c.v) : true; });
  const o = cons.find((x) => x.k === "order"); if (o) rows.sort((x, y) => ((ms(x[1][o.f]) > ms(y[1][o.f])) - (ms(x[1][o.f]) < ms(y[1][o.f]))) * (o.dir === "desc" ? -1 : 1));
  const l = cons.find((x) => x.k === "limit"); if (l) rows = rows.slice(0, l.n);
  const docs = rows.map(([k]) => ({ id: segs(k).at(-1), data: () => dec(JSON.parse(JSON.stringify(M.docs.get(k)))) }));
  return { docs, size: docs.length, empty: !docs.length };
}
/**
 * @param {{path: string}} ref
 * @return {!Promise<!Object>}
 * @throws {!Error} permission-denied when the rules mirror refuses the read.
 */
export async function getDoc(ref) { await delay(); if (!canRead(ref.path)) throw denied(); return docSnapshot(ref.path); }
/** The mock has no cache. */
export const getDocFromServer = getDoc;
/**
 * @param {{path: string, cons: (!Array<!Object>|undefined)}} q Query or collection reference.
 * @return {!Promise<!Object>}
 * @throws {!Error} permission-denied when the rules mirror refuses the query.
 */
export async function getDocs(q) { await delay(); const cons = q.cons || []; if (!canList(q.path, cons)) throw denied(); return runQuery(q.path, cons); }
/**
 * Refused writes are recorded in M.refused.
 *
 * @param {{path: string}} ref
 * @param {!Object} data
 * @return {!Promise<void>}
 * @throws {!Error} permission-denied when the rules mirror refuses the write.
 */
export async function setDoc(ref, data) {
  await delay(); const now = M.now(); const exists = M.docs.has(ref.path);
  if (!canWrite(ref.path, data, exists, now)) { M.refused.push({ who: ME, path: ref.path, at: now }); throw denied(); }
  M.docs.set(ref.path, enc(data, now)); notify(ref.path);
}
/**
 * Missing or non-object intermediate maps are created.
 *
 * @param {{path: string}} ref
 * @param {...*} args Alternating field paths (dotted string or FieldPath) and values.
 * @return {!Promise<void>}
 * @throws {!Error} not-found when the document does not exist; permission-denied when refused.
 */
export async function updateDoc(ref, ...args) {
  await delay(); const now = M.now(); const cur = M.docs.get(ref.path);
  if (cur === undefined) throw Object.assign(new Error("No document to update: " + ref.path), { code: "not-found" });
  if (!canWrite(ref.path, null, true, now)) throw denied();
  const next = JSON.parse(JSON.stringify(cur));
  for (let k = 0; k < args.length; k += 2) {
    const p = args[k] instanceof FieldPath || (args[k] && args[k].segs) ? args[k].segs : String(args[k]).split(".");
    let o = next; for (const seg of p.slice(0, -1)) { if (!o[seg] || typeof o[seg] !== "object" || Array.isArray(o[seg])) o[seg] = {}; o = o[seg]; }
    o[p.at(-1)] = enc(args[k + 1], now);
  }
  M.docs.set(ref.path, next); notify(ref.path);
}
/**
 * @param {{path: string}} ref
 * @return {!Promise<void>}
 * @throws {!Error} permission-denied when the rules mirror refuses the delete.
 */
export async function deleteDoc(ref) { await delay(); if (!canWrite(ref.path, null, true, M.now())) throw denied(); M.docs.delete(ref.path); notify(ref.path); }
/**
 * Options are ignored. Read rules are rechecked on every delivery; a refusal drops the subscription and reports
 * permission-denied.
 *
 * @param {!Object} target Document reference or query.
 * @param {(!Object|function(!Object))} a Options, or the next callback.
 * @param {function(*)=} b Next or error callback.
 * @param {function(!Error)=} c
 * @return {function()} Unsubscribe.
 */
export function onSnapshot(target, a, b, c) {
  const opts = typeof a === "function" ? {} : a; const next = typeof a === "function" ? a : b; const error = typeof a === "function" ? b : c;
  let sub;
  if (target.kind === "doc") {
    sub = { path: target.path, deliver: () => { if (!canRead(target.path)) { M.subs.delete(sub); return error && error(denied()); } next(docSnapshot(target.path)); } };
  } else {
    const cons = target.cons || [];
    sub = { col: target.path, deliver: () => { if (!canList(target.path, cons)) { M.subs.delete(sub); return error && error(denied()); } next(runQuery(target.path, cons)); } };
  }
  M.subs.add(sub); later(() => { if (M.subs.has(sub)) sub.deliver(); });
  return () => M.subs.delete(sub);
}

/* ---------- functions: the harness page runs the real coach-core.js with fake deps ---------- */
/**
 * @param {!Object} app
 * @param {string} region
 * @return {{region: string}}
 */
export function getFunctions(app, region) { return { region }; }
/**
 * Calls M.callFunction in the harness page as this frame's user (null when signed out). Errors carry an SDK-style
 * `functions/<code>` code, with the coach code kept in `details.code`.
 *
 * @param {!Object} fns
 * @param {string} name
 * @return {function(*): !Promise<{data: *}>}
 */
export function httpsCallable(fns, name) {
  return async (data) => {
    try { return { data: await M.callFunction(name, M.signedIn[ME] ? ME : null, JSON.parse(JSON.stringify(data))) }; }
    catch (e) { const map = { not_granted: "permission-denied", quota_exceeded: "resource-exhausted", invalid_argument: "invalid-argument", rate_limited: "resource-exhausted", upstream_error: "unavailable", empty_completion: "internal", misconfigured: "failed-precondition" };
      throw Object.assign(new Error(e.message), { code: "functions/" + (map[e.code] || "internal"), details: { code: e.code } }); }
  };
}

/* ---------- storage: a JavaScript mirror of storage.rules for assets/{uid}/{fileId} ---------- */
const ASSET_RULE_TYPES = /^(image\/(png|jpeg|gif|webp)|application\/pdf|video\/(mp4|webm)|text\/(plain|markdown))$/;
/**
 * @param {!Object} app
 * @return {{kind: string}}
 */
export function getStorage(app) { return { kind: "storage" }; }
/**
 * @param {!Object} st
 * @param {string} path
 * @return {{kind: string, path: string}}
 */
export function ref(st, path) { return { kind: "sref", path }; }
/**
 * Stores the bytes in M.blobs when storage.rules would allow the create.
 *
 * @param {{path: string}} r
 * @param {!Blob} data
 * @param {{contentType: string}} meta
 * @return {!Promise<{ref: !Object}>}
 */
export async function uploadBytes(r, data, meta) {
  await delay();
  const m = /^assets\/([^/]+)\/([^/]+)$/.exec(r.path); const uid = M.signedIn[ME] ? ME : null;
  const listed = (d) => ((M.docs.get(`meta/${d}`) || {}).uids || []).includes(uid);
  const ok = m && uid && m[1] === uid && !M.blobs.has(r.path) && data.size <= 20 * 1024 * 1024
    && ASSET_RULE_TYPES.test((meta && meta.contentType) || "") && (listed("admins") || listed("aiHosts"));
  if (!ok) throw Object.assign(new Error("User does not have permission to access this object."), { code: "storage/unauthorized" });
  M.blobs.set(r.path, { size: data.size, contentType: meta.contentType, by: uid }); return { ref: r };
}
