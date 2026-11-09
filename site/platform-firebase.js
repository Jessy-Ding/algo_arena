/**
 * @fileoverview AlgoArena route B platform layer. The page was written against the claude.ai capability interface
 * (claude.use("db"), "user", "downloads", ...). This module provides the same interface backed by Firebase
 * Authentication (Google sign-in), Cloud Firestore and Cloud Storage (uploaded files), so the page logic stays the
 * same. Differences from the
 * claude.ai runtime are noted where they matter:
 * - db.update() merges nested objects (claude.ai semantics); Firestore's updateDoc replaces nested maps, so updates
 *   are sent as explicit field paths.
 * - Firestore Timestamps are returned as epoch milliseconds, which is what the page stores everywhere else.
 * - db.serverTime() is a server-timestamp sentinel; db.serverNow() estimates the server clock on this device.
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
import CONFIG from "./firebase-config.js";

const W = /** @type {any} */ (window);
const SDK = W.AA_FIREBASE_SDK || "https://www.gstatic.com/firebasejs/10.12.2/";
const F = {}; // loaded SDK modules and instances
const SRV = { offset: 0, rtt: null }; // offset = server clock minus this device's clock
const SENTINELS = new WeakSet();
let ready = null;

async function init() {
  const [appM, authM, fsM] = await Promise.all([
    import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore.js"),
  ]);
  const app = appM.initializeApp(CONFIG.firebase);
  const auth = authM.getAuth(app);
  let fdb;
  try { fdb = fsM.initializeFirestore(app, { ignoreUndefinedProperties: true }); } catch { fdb = fsM.getFirestore(app); }
  Object.assign(F, { appM, authM, fsM, app, auth, fdb });
  F.user = await new Promise((resolve) => { const stop = authM.onAuthStateChanged(auth, (u) => { if (stop) stop(); resolve(u); }); });
  if (F.user) estimateServerOffset().catch((e) => console.warn("Server clock estimate failed:", e));
}
const boot = () => (ready = ready || init());

// Display only (countdowns); scoring uses server timestamps written by Firestore.
async function estimateServerOffset() {
  const { fsM, fdb } = F; const ref = fsM.doc(fdb, `data/users/${F.user.uid}/clock`); let best = null;
  for (let k = 0; k < 3; k++) {
    const t0 = Date.now(); await fsM.setDoc(ref, { t: fsM.serverTimestamp() });
    const s = await fsM.getDocFromServer(ref); const t1 = Date.now();
    const srv = s.data().t.toMillis(); const rtt = t1 - t0; const off = srv - (t0 + t1) / 2;
    if (!best || rtt < best.rtt) best = { rtt, off };
  }
  SRV.offset = Math.round(best.off); SRV.rtt = best.rtt;
}

/* ---------- value conversion ---------- */
function toPlain(v) {
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = toPlain(v[k]); return o; }
  return v;
}
const isPlain = (v) => v != null && typeof v === "object" && !Array.isArray(v) && !SENTINELS.has(v) && Object.getPrototypeOf(v) === Object.prototype;
// Field paths make updateDoc merge nested maps (claude.ai semantics) instead of replacing them.
function fieldPairs(obj, prefix = [], out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const path = [...prefix, k];
    if (isPlain(v) && Object.keys(v).length) fieldPairs(v, path, out); else out.push([path, v]);
  }
  return out;
}
const CODES = { "permission-denied": "permission_denied", "not-found": "invalid_argument", "unavailable": "unavailable", "resource-exhausted": "quota_exceeded", "deadline-exceeded": "unavailable" };
function mapErr(e) {
  const raw = String((e && e.code) || "").replace(/^firestore\//, "");
  return Object.assign(new Error((e && e.message) || String(e)), { code: CODES[raw] || raw || "unknown", original: e });
}
const wrap = (p) => p.catch((e) => { throw mapErr(e); });
const docSnap = (s) => ({ id: s.id, exists: s.exists(), pending: !!(s.metadata && s.metadata.hasPendingWrites), data: () => (s.exists() ? toPlain(s.data({ serverTimestamps: "estimate" })) : undefined) });
const querySnap = (s) => ({ size: s.size, empty: s.empty, docs: s.docs.map((d) => ({ id: d.id, exists: true, data: () => toPlain(d.data({ serverTimestamps: "estimate" })) })) });

/* ---------- db capability ---------- */
function docApi(path) {
  const { fsM, fdb } = F; const ref = fsM.doc(fdb, path);
  return {
    path,
    get: () => wrap(fsM.getDoc(ref)).then(docSnap),
    set: (data) => wrap(fsM.setDoc(ref, data)),
    update: (data) => {
      const pairs = fieldPairs(data); if (!pairs.length) return Promise.resolve();
      return wrap(fsM.updateDoc(ref, ...pairs.flatMap(([p, v]) => [new fsM.FieldPath(...p), v])));
    },
    delete: () => wrap(fsM.deleteDoc(ref)),
    onSnapshot: (next, error) => fsM.onSnapshot(ref, { includeMetadataChanges: true }, (s) => next(docSnap(s)), (e) => error && error(mapErr(e))),
    collection: (c) => colApi(`${path}/${c}`, []),
  };
}
function colApi(path, cons) {
  const { fsM, fdb } = F; const q = () => fsM.query(fsM.collection(fdb, path), ...cons);
  return {
    path,
    where: (f, op, v) => colApi(path, [...cons, fsM.where(f, op, v)]),
    orderBy: (f, dir) => colApi(path, [...cons, fsM.orderBy(f, dir || "asc")]),
    limit: (n) => colApi(path, [...cons, fsM.limit(n)]),
    get: () => wrap(fsM.getDocs(q())).then(querySnap),
    onSnapshot: (next, error) => fsM.onSnapshot(q(), (s) => next(querySnap(s)), (e) => error && error(mapErr(e))),
    doc: (id) => docApi(`${path}/${id || fsM.doc(fsM.collection(fdb, path)).id}`),
  };
}
/** serverNow() is this device's estimate of the server clock (epoch ms), not an authoritative time. */
const DB = {
  doc: (p) => docApi(p),
  collection: (p) => colApi(p, []),
  serverTime: () => { const s = F.fsM.serverTimestamp(); SENTINELS.add(s); return s; },
  isServerTime: (v) => v != null && typeof v === "object" && SENTINELS.has(v),
  serverNow: () => Date.now() + SRV.offset,
  serverOffset: () => SRV.offset,
  serverRtt: () => SRV.rtt,
};

/* ---------- user capability ---------- */
let adminCache = null;
async function isAdmin() {
  if (adminCache != null) return adminCache;
  try { const s = await F.fsM.getDoc(F.fsM.doc(F.fdb, "meta/admins")); adminCache = !!(s.exists() && (s.data().uids || []).includes(F.user.uid)); }
  catch { adminCache = false; }
  return adminCache;
}
const USER = {
  id: async () => (F.user ? F.user.uid : null),
  me: async () => ({ id: F.user.uid, name: F.user.displayName || "", email: F.user.email || "" }),
  isOwner: isAdmin,
  canEdit: isAdmin,
  can: async () => true,
  profiles: async () => ({}),
};

/* ---------- downloads capability ---------- */
const DOWNLOADS = {
  /**
   * @param {{filename: string, data: (!Blob|string|!BufferSource)}} file
   * @return {!Promise<void>}
   */
  save: async ({ filename, data }) => {
    const type = /\.json$/i.test(filename) ? "application/json" : /\.zip$/i.test(filename) ? "application/zip" : /\.md$/i.test(filename) ? "text/markdown" : "application/octet-stream";
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  },
};

/* ---------- assets capability: question images and reference files in Cloud Storage ---------- */
// Must match storage.rules; the page's own error messages name the 20 MB limit.
const ASSET_MAX = 20 * 1024 * 1024;
const ASSET_TYPES = /^(image\/(png|jpeg|gif|webp)|application\/pdf|video\/(mp4|webm)|text\/(plain|markdown))$/;
const assetCode = (code, message) => Object.assign(new Error(message), { code });
const ASSETS = {
  /**
   * @param {!File} file
   * @param {{type?: string}=} opts type overrides file.type (the page sets it for .md and .txt files).
   * @return {!Promise<{id: string, contentType: string}>} id is "<uid>/<random>", stored in the question.
   * @throws {!Error} With code too_large, unsupported_type or not_uploader, which the page explains.
   */
  upload: async (file, opts = {}) => {
    const contentType = (opts && opts.type) || file.type || "";
    if (file.size > ASSET_MAX) throw assetCode("too_large", "The file is over 20 MB.");
    if (!ASSET_TYPES.test(contentType)) throw assetCode("unsupported_type", `Files of type "${contentType || "unknown"}" cannot be uploaded.`);
    const stM = F.stM || (F.stM = await import(SDK + "firebase-storage.js"));
    const id = `${F.user.uid}/${crypto.randomUUID()}`;
    try { await stM.uploadBytes(stM.ref(stM.getStorage(F.app), "assets/" + id), file, { contentType }); }
    catch (e) { if (e && e.code === "storage/unauthorized") throw assetCode("not_uploader", "Only approved hosts can upload files."); throw e; }
    return { id, contentType };
  },
  /**
   * A public download link; storage.rules allow reading a file by its path, since <img> cannot send a sign-in token.
   *
   * @param {string} id
   * @return {string}
   */
  url: (id) => `https://firebasestorage.googleapis.com/v0/b/${CONFIG.firebase.storageBucket}/o/${encodeURIComponent("assets/" + id)}?alt=media`,
};

/* ---------- sample capability: AI reports through the `coach` Cloud Function ---------- */
const FN_CODES = { "functions/permission-denied": "not_granted", "functions/unauthenticated": "not_granted", "functions/resource-exhausted": "rate_limited", "functions/unavailable": "upstream_error", "functions/deadline-exceeded": "upstream_error", "functions/internal": "upstream_error", "functions/not-found": "not_granted" };
let samplePromise = null;
async function makeSample() {
  if (CONFIG.coach === false) return null;
  const fnM = await import(SDK + "firebase-functions.js");
  const call = fnM.httpsCallable(fnM.getFunctions(F.app, CONFIG.functionsRegion || "us-central1"), "coach", { timeout: 150000 });
  /**
   * Not streamed: onText, if given, fires once with the whole reply.
   *
   * @param {(string|!Array<{role: string, content: string}>)} input Messages are flattened to "role: content" text.
   * @param {{modelTier?: string, sid?: string, kind?: string, onText?: function(!Object)}=} opts
   * @return {!Promise<{text: string, truncated: boolean, modelApplied: ?string, modelTierApplied: ?string}>}
   * @throws {!Error} With `code` from the function's details.code, else mapped from the HTTPS error code.
   */
  const sample = async (input, opts = {}) => {
    const prompt = typeof input === "string" ? input : (input || []).map((m) => `${m.role}: ${m.content}`).join("\n\n");
    let r;
    try { r = await call({ prompt, tier: opts.modelTier || "default", ...(opts.sid ? { sid: opts.sid } : {}), ...(opts.kind ? { kind: opts.kind } : {}) }); }
    catch (e) {
      const code = (e && e.details && e.details.code) || FN_CODES[e && e.code] || "upstream_error";
      throw Object.assign(new Error((e && e.message) || "The AI request failed."), { code, original: e });
    }
    const d = (r && r.data) || {};
    if (opts.onText) opts.onText({ text: d.text || "", delta: d.text || "" });
    return { text: d.text || "", truncated: !!d.truncated, modelApplied: d.modelApplied || null, modelTierApplied: d.modelTierApplied || null };
  };
  /**
   * Like sample(), then parses the reply as JSON, tolerating a surrounding Markdown code fence.
   *
   * @param {(string|!Array<!Object>)} input
   * @param {!Object=} opts
   * @return {!Promise<*>}
   */
  sample.json = async (input, opts) => { const r = await sample(input, opts); return JSON.parse(String(r.text).replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim()); };
  /** @return {!Promise<{images: boolean}>} */
  sample.limits = async () => ({ images: false });
  return sample;
}

/* ---------- draft capability: AI question drafts through the `draftQuestions` Cloud Function (v1.1) ---------- */
let draftPromise = null;
async function makeDraft() {
  if (CONFIG.draft === false) return null;
  const fnM = await import(SDK + "firebase-functions.js");
  // The function may take up to 540 s (draft, one repair, verification); the client waits a little longer.
  const call = fnM.httpsCallable(fnM.getFunctions(F.app, CONFIG.functionsRegion || "us-central1"), "draftQuestions", { timeout: 560000 });
  return {
    /**
     * Same check as the function's (meta/aiHosts or meta/admins), so the page shows the button only to hosts the
     * function will serve.
     *
     * @return {!Promise<boolean>}
     */
    allowed: async () => {
      const listed = async (id) => { const s = await F.fsM.getDoc(F.fsM.doc(F.fdb, "meta/" + id)); return s.exists() && (s.data().uids || []).includes(F.user.uid); };
      return (await listed("aiHosts").catch(() => false)) || (await listed("admins").catch(() => false));
    },
    /**
     * @param {{module: string, count: number, setId: string, focus?: string, chapter?: ?number, difficulty?: string,
     *     subtype?: ?string, sourceText?: string}} data
     * @return {!Promise<!Object>} The function's result: {drafts, ai, requested, delivered, dropped, quotaLeft}.
     * @throws {!Error} With `code` from the function's details.code (for example quota_exceeded), and its message.
     */
    run: async (data) => {
      try { return (await call(data)).data; }
      catch (e) {
        const code = (e && e.details && e.details.code) || FN_CODES[e && e.code] || "upstream_error";
        throw Object.assign(new Error((e && e.message) || "AI drafting failed."), { code, original: e });
      }
    },
  };
}

/** Stands in for the claude.ai runtime global, so the page code runs unchanged. */
W.claude = {
  /**
   * "downloads" works signed out; the others need a signed-in user.
   *
   * @param {string} name "db", "user", "downloads", "assets", "sample" or "draft".
   * @return {!Promise<*>} The capability, or null when signed out, unavailable, or not provided (room).
   */
  use: async (name) => {
    await boot();
    if (name === "downloads") return DOWNLOADS;
    if (!F.user) return null;
    if (name === "db") return DB;
    if (name === "user") return USER;
    if (name === "assets") return CONFIG.assets === false ? null : ASSETS;
    if (name === "sample") return (samplePromise = samplePromise || makeSample().catch((e) => { console.warn("AI reports unavailable:", e); return null; }));
    if (name === "draft") return (draftPromise = draftPromise || makeDraft().catch((e) => { console.warn("AI drafting unavailable:", e); return null; }));
    return null;
  },
  /**
   * Popup only: a redirect cannot complete on github.io, because the sign-in helper lives on firebaseapp.com and
   * current browsers block that third-party storage (Firebase "redirect best practices").
   *
   * @return {!Promise<void>}
   * @throws {!Error} A plain-language message when the popup is blocked; other sign-in errors unchanged.
   */
  signIn: async () => {
    await boot();
    const provider = new F.authM.GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
    try { await F.authM.signInWithPopup(F.auth, provider); }
    catch (e) {
      const code = e && e.code;
      if (code !== "auth/popup-blocked" && code !== "auth/operation-not-supported-in-this-environment") throw e;
      // No code on the new error: the page shows e.code in preference to e.message.
      throw new Error("Pop-ups are blocked, so Google sign-in cannot open. Allow pop-ups for this site, or open the link in Safari or Chrome rather than inside another app.");
    }
  },
  /** @return {!Promise<void>} */
  signOut: async () => { await boot(); await F.authM.signOut(F.auth); },
  platform: "firebase",
};
