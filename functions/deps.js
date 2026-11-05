/**
 * @fileoverview Firestore-backed dependencies for runCoach (functions/coach-core.js) and runDraft
 * (functions/qgen-core.js). Quota counters (aiQuota) and the call log (aiLog) live in top-level collections that the
 * security rules do not open to any client, so users cannot reset or read them.
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
/**
 * @param {!Object} db Admin SDK Firestore, or a test stand-in with doc, collection and runTransaction.
 * @param {{fetch: function(string, !Object): !Promise<!Object>, apiKey: function(): string, now: function(): number,
 *     openaiKey: (function(): string|undefined)}} io `now` returns epoch milliseconds; openaiKey is only used by
 *     runDraft.
 * @return {!Object} The deps that runCoach and runDraft expect.
 */
export function firestoreDeps(db, { fetch, apiKey, now, openaiKey }) {
  const uidsIn = async (path, uid) => { const s = await db.doc(path).get(); return s.exists && (s.get("uids") || []).includes(uid); };
  return {
    now, fetch, apiKey, openaiKey,
    isHost: async (uid) => (await uidsIn("meta/aiHosts", uid)) || (await uidsIn("meta/admins", uid)),
    // pub/{uid} is self-written and only names the session; membership comes from the host's own record, which
    // players cannot write.
    hasJoined: async (uid) => {
      const p = await db.doc(`pub/${uid}`).get(); if (!p.exists) return false;
      const sid = p.get("sid"), host = p.get("host"); if (!sid || !host) return false;
      const sess = await db.doc(`data/users/${host}/profile/sessions/${sid}`).get();
      if (!sess.exists || now() - (sess.get("createdAt") || 0) > 3 * 864e5) return false;
      return (sess.get("participants") || []).some((x) => x && x.uid === uid) ? { sid } : false;
    },
    // participants is written when the session ends (endAt), so its length is final here.
    hostSession: async (uid, sid) => {
      const s = await db.doc(`data/users/${uid}/profile/sessions/${sid}`).get(); if (!s.exists) return null;
      return { ended: !!s.get("endAt"), participants: (s.get("participants") || []).length };
    },
    consumeQuota: ({ uid, day, dailyCap, sid, sessionCap }) => db.runTransaction(async (tx) => {
      const dRef = db.doc(`aiQuota/${uid}_${day}`); const sRef = sid ? db.doc(`aiQuota/${uid}_s_${sid}`) : null;
      const dSnap = await tx.get(dRef); const sSnap = sRef ? await tx.get(sRef) : null;
      const dUsed = dSnap.exists ? dSnap.get("count") || 0 : 0; const sUsed = sSnap && sSnap.exists ? sSnap.get("count") || 0 : 0;
      if (sRef && sUsed >= sessionCap) return { ok: false, limit: "session" };
      if (dUsed >= dailyCap) return { ok: false, limit: "daily" };
      tx.set(dRef, { uid, day, count: dUsed + 1, updatedAt: now() }, { merge: true });
      if (sRef) tx.set(sRef, { uid, sid, count: sUsed + 1, cap: sessionCap, updatedAt: now() }, { merge: true });
      return { ok: true };
    }),
    refundQuota: ({ uid, day, sid }) => db.runTransaction(async (tx) => {
      const refs = [db.doc(`aiQuota/${uid}_${day}`), ...(sid ? [db.doc(`aiQuota/${uid}_s_${sid}`)] : [])];
      const snaps = []; for (const r of refs) snaps.push(await tx.get(r));
      refs.forEach((r, k) => tx.set(r, { count: Math.max(0, (snaps[k].exists ? snaps[k].get("count") || 0 : 0) - 1), updatedAt: now() }, { merge: true }));
    }),
    log: (entry) => db.collection("aiLog").add(entry),
    // AI question drafting (qgen-core.js). A set's questions live in its q subcollection; null when the set is not
    // the host's.
    setQuestions: async (uid, setId) => {
      const base = `data/users/${uid}/profile/sets/${setId}`;
      if (!(await db.doc(base).get()).exists) return null;
      return (await db.collection(`${base}/q`).get()).docs.map((d) => d.data());
    },
    bankQuestions: async () => (await db.collection("bank").get()).docs.map((d) => d.data()),
    // Counted per question in its own counter, so drafting never uses up the report quota.
    reserveDrafts: ({ uid, day, n, cap }) => db.runTransaction(async (tx) => {
      const ref = db.doc(`aiQuota/${uid}_g_${day}`); const snap = await tx.get(ref);
      const used = snap.exists ? snap.get("count") || 0 : 0;
      if (used + n > cap) return { ok: false, used };
      tx.set(ref, { uid, day, kind: "qgen", count: used + n, updatedAt: now() }, { merge: true });
      return { ok: true, used: used + n };
    }),
    refundDrafts: ({ uid, day, n }) => db.runTransaction(async (tx) => {
      const ref = db.doc(`aiQuota/${uid}_g_${day}`); const snap = await tx.get(ref);
      tx.set(ref, { count: Math.max(0, (snap.exists ? snap.get("count") || 0 : 0) - n), updatedAt: now() }, { merge: true });
    }),
  };
}
