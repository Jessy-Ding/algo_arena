/**
 * @fileoverview Cloud Storage security-rules tests for storage.rules (question images and reference files), run on
 * the Storage and Firestore emulators with @firebase/rules-unit-testing. The host check reads Firestore meta/admins
 * and meta/aiHosts through cross-service rules, so both emulators must run.
 *
 * Run from the repo root:
 *   firebase emulators:exec --only firestore,storage --project demo-algoarena "cd test/rules && node --test storage.test.mjs"
 *
 * Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
 *     Northeastern University
 * Version: 1.0
 * Created: November 4, 2026 · San Francisco, California, USA
 *
 * License: This project is licensed under the MIT License — see LICENSE.md for details.
 * Copyright © 2026 Yikang (Richard) Liu.
 * @license MIT
 */
import { test, before, after } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getBytes, listAll, deleteObject } from "firebase/storage";

const MB = 1024 * 1024;
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-algoarena",
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8") },
    storage: { rules: readFileSync(new URL("../../storage.rules", import.meta.url), "utf8") },
  });
  await env.withSecurityRulesDisabled(async (x) => {
    const db = x.firestore();
    await setDoc(doc(db, "meta/admins"), { uids: ["ADM"] });
    await setDoc(doc(db, "meta/aiHosts"), { uids: ["HOST"] });
    await uploadBytes(ref(x.storage(), "assets/ADM/seed"), new Uint8Array([1, 2, 3]), { contentType: "image/png" });
  });
});
after(async () => { await env.cleanup(); });

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();
const put = (uid, path, size, contentType) => uploadBytes(ref(as(uid), path), new Uint8Array(size), { contentType });

test("an admin and an approved host may upload to their own folder", async () => {
  await assertSucceeds(put("ADM", "assets/ADM/a1", 1024, "image/png"));
  await assertSucceeds(put("HOST", "assets/HOST/h1", 1024, "application/pdf"));
});

test("each type the question editor offers is accepted", async () => {
  const types = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "video/mp4", "video/webm", "text/plain", "text/markdown"];
  for (const [i, t] of types.entries()) await assertSucceeds(put("ADM", `assets/ADM/t${i}`, 16, t));
});

test("other types are refused, including ones that run script when opened", async () => {
  for (const [i, t] of ["image/svg+xml", "text/html", "application/javascript", "application/octet-stream", "image/png2"].entries()) {
    await assertFails(put("ADM", `assets/ADM/bad${i}`, 16, t));
  }
});

test("a file of exactly 20 MB is accepted and one byte more is refused", async () => {
  await assertSucceeds(put("ADM", "assets/ADM/max", 20 * MB, "video/mp4"));
  await assertFails(put("ADM", "assets/ADM/over", 20 * MB + 1, "video/mp4"));
});

test("signed-in users who are not approved hosts may not upload", async () => {
  await assertFails(put("STU", "assets/STU/s1", 16, "image/png"));
});

test("signed-out visitors may not upload", async () => {
  await assertFails(put(null, "assets/ADM/anon", 16, "image/png"));
});

test("a host may not upload into another user's folder", async () => {
  await assertFails(put("ADM", "assets/HOST/x", 16, "image/png"));
});

test("paths outside assets/{uid}/{fileId} are refused", async () => {
  await assertFails(put("ADM", "other/ADM/x", 16, "image/png"));
  await assertFails(put("ADM", "assets/ADM/deeper/x", 16, "image/png"));
});

test("anyone may read a file, signed in or not", async () => {
  await assertSucceeds(getBytes(ref(as(null), "assets/ADM/seed")));
  await assertSucceeds(getBytes(ref(as("STU"), "assets/ADM/seed")));
});

test("nobody may list files", async () => {
  await assertFails(listAll(ref(as("ADM"), "assets/ADM")));
  await assertFails(listAll(ref(as(null), "assets")));
});

test("existing files cannot be overwritten or deleted, even by their owner", async () => {
  await assertFails(put("ADM", "assets/ADM/seed", 16, "image/png"));
  await assertFails(deleteObject(ref(as("ADM"), "assets/ADM/seed")));
});
