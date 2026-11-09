/**
 * @fileoverview Real Firebase Auth SDK wired to the Auth emulator. Each page signs in as the uid in its ?u= parameter.
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
import * as M from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const UID = new URLSearchParams(location.search).get("u");
let signedIn = null;

// Unsigned custom token: only the Auth emulator accepts it.
function emulatorToken(uid) {
  const b = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const now = Math.floor(Date.now() / 1000);
  return b({ alg: "none", typ: "JWT" }) + "." + b({ iss: "oracle@demo.test", sub: "oracle@demo.test", uid, iat: now, exp: now + 3600,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit" }) + ".";
}

/**
 * The session persists because the page reloads after sign-in; the oracle gives each account its own browser
 * context, which keeps the stored sessions apart.
 *
 * @param {!Object} app The FirebaseApp.
 * @return {!Object} The Auth instance.
 */
export function getAuth(app) {
  const auth = M.getAuth(app);
  if (!auth.emulatorConfig) M.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  return auth;
}

/**
 * Replaces the Google popup with an emulator custom token for this page's ?u= uid.
 *
 * @param {!Object} auth
 * @return {!Promise<!Object>} The UserCredential.
 */
export function signInWithPopup(auth) {
  signedIn = signedIn || M.signInWithCustomToken(auth, emulatorToken(UID));
  return signedIn;
}
