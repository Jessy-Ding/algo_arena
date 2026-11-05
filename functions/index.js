/**
 * @fileoverview AlgoArena Cloud Function: `coach`, a callable endpoint for AI learning reports. The
 * Anthropic API key lives only in Secret Manager (firebase functions:secrets:set ANTHROPIC_API_KEY). Logic is in
 * coach-core.js; this file wires it to Firebase.
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
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { runCoach, CoachError } from "./coach-core.js";
import { firestoreDeps } from "./deps.js";

initializeApp();
const db = getFirestore();
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const HTTPS = { not_granted: "permission-denied", quota_exceeded: "resource-exhausted", invalid_argument: "invalid-argument", rate_limited: "resource-exhausted", upstream_error: "unavailable", empty_completion: "internal", misconfigured: "failed-precondition" };
const deps = firestoreDeps(db, { fetch: (...a) => fetch(...a), apiKey: () => ANTHROPIC_API_KEY.value(), now: () => Date.now() });

/** Callable endpoint for the page; refusals carry the page error code in HttpsError `details.code`. */
export const coach = onCall(
  { region: "us-central1", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: "256MiB", maxInstances: 5 },
  async (request) => {
    try { return await runCoach({ uid: request.auth && request.auth.uid, data: request.data, deps }); }
    catch (e) {
      if (e instanceof CoachError) {
        if (e.upstream) console.warn("coach upstream refusal", e.code, JSON.stringify(e.upstream));
        throw new HttpsError(HTTPS[e.code] || "internal", e.message, { code: e.code });
      }
      console.error("coach failed", e);
      throw new HttpsError("internal", "The AI report failed.", { code: "upstream_error" });
    }
  },
);
