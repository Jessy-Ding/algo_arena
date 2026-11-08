/**
 * @fileoverview Real Firestore SDK connected to the Firestore emulator.
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
import * as M from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * @param {!Object} app The FirebaseApp.
 * @param {!Object} settings
 * @return {!Object} The Firestore instance.
 */
export function initializeFirestore(app, settings) {
  const db = M.initializeFirestore(app, settings);
  M.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  return db;
}
