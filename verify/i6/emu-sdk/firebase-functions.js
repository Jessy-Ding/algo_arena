/**
 * @fileoverview Real Cloud Functions SDK connected to the Functions emulator.
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
import * as M from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

/**
 * @param {!Object} app The FirebaseApp.
 * @param {string=} region
 * @return {!Object} The Functions instance.
 */
export function getFunctions(app, region) {
  const fns = M.getFunctions(app, region);
  M.connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  return fns;
}
