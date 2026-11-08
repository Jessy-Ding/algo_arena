/**
 * @fileoverview Stand-in for the Firebase App SDK module in the end-to-end test: re-exports
 * everything from ../mock-firebase.js. The test build (build_app.py) sets AA_FIREBASE_SDK to ./mock-sdk/.
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
export * from "../mock-firebase.js";
