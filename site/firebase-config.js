/**
 * @fileoverview Web app config for the Firebase project "algoarena-for-research". It is not a secret: access is
 * controlled by firestore.rules. Keep this file in the repository next to index.html.
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
export default {
  firebase: {
    apiKey: "AIzaSyBzVrQ3eXVBmY_Mj_CnMkv6bho9PZ_ZXNs",
    authDomain: "algoarena-for-research.firebaseapp.com",
    projectId: "algoarena-for-research",
    storageBucket: "algoarena-for-research.firebasestorage.app",
    messagingSenderId: "14590331156",
    appId: "1:14590331156:web:a0773cb34ab68ae0169a01",
  },
  functionsRegion: "us-central1", // must match functions/index.js
  coach: true, // false hides AI reports (Spark plan, or the coach function is not deployed)
};
