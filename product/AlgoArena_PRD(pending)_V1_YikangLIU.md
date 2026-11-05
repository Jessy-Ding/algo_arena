# AlgoArena: Product Requirements Document

**Author:** YIKANG LIU  

**Version:** 1.0  
**Status:** Pending Final Review and Freeze by Dr. Maryam Farahmand and Mengyuan Ding, MD  
**Product Type:** Research-instrumented algorithm learning platform  
**Primary Modes:** Solo Practice and Live Classroom  

## 1 Product Overview

AlgoArena is a Kahoot-inspired web application for algorithm learning, classroom participation, and educational research. It is designed for university-level computer science courses such as CS5800, while remaining flexible enough to support other courses or projects.

The product has two primary experiences:

1. **Solo Practice** — an authenticated learner practices algorithm questions independently, receives targeted feedback after incorrect choices, and may retry until the correct answer is selected.
2. **Live Classroom** — a host creates a synchronized multiplayer room, participants join through a QR code, URL, or room code, and all participants answer the same question independently. Correctness and response time determine the score.

AlgoArena is not intended to replace an LMS. Its primary purpose is to provide a low-friction, game-like assessment and practice experience while capturing structured behavioral data suitable for later educational research.

## 2 Product Goals

### 2.1 Teaching Goals

AlgoArena shall:

- Make algorithm practice feel participatory and game-like rather than task-like.
- Allow a host to prepare and launch classroom activities without reading a README or setup guide.
- Give learners immediate, concept-specific feedback after incorrect answers in Solo Practice.
- Give hosts a live view of participation, accuracy, response behavior, and leaderboard status.
- Support reusable question sets organized with lightweight optional metadata.

### 2.2 Research Goals

AlgoArena shall:

- Capture structured, auditable behavioral data at the question, submission, exposure, session, and user levels.
- <mark><u><em>Separate raw behavioral evidence from derived metrics and model-generated interpretation.</em></u></mark>
- Support pseudonymous research export.
- Preserve timing information and repeated-exposure history so later analyses can distinguish first attempts from retries and prior exposure.
- <mark><u><em>Avoid presenting AI-generated interpretations as ground-truth measurements of learner capability.</em></u></mark>

### 2.3 UX Goals

AlgoArena shall:

- Be understandable through visible interface controls without external documentation.
- Use an attractive, high-energy, Kahoot-inspired visual language.
- Use motion, countdowns, score transitions, streak indicators, and audio cues to create a game-like experience.
- Remain usable in university classrooms on laptops, tablets, and phones.
- Avoid copying proprietary Kahoot assets, audio, or copyrighted visual resources.

## 3 Non-Goals for This Version

The proposed v1.0 baseline excludes:

- Two-player local battle mode.
- Winner-takes-all buzz-in mechanics.
- Exclusive answering rights for the fastest participant.
- Multiple-select questions.
- Free-response grading.
- Coding editors, compilers, or execution sandboxes.
- OCR-based conversion of uploaded images into structured questions.
- AI-generated questions.
- LMS replacement.
- Canvas, Blackboard, or similar LMS integration.
- Permanent Instructor and Student account roles.
- Plagiarism detection.
- Streak bonuses that alter the research score.
- Reuse of proprietary Kahoot music, graphics, or other protected assets.

Multiple-select question support may be considered in a later version.

## 4 Target Users

### 4.1 Authenticated User

All users share one account type: **Authenticated User**.

A user may act as:

- **Host** when creating and controlling a Live Classroom session.
- **Participant** when joining a Live Classroom session.
- **Learner** when using Solo Practice.

Roles are contextual to a session and are not permanent account privileges.

### 4.2 Primary Host

The primary host use case is a university professor or teaching staff member running a classroom activity, but the product does not technically restrict room creation to faculty accounts.

## 5 Authentication and Identity

### 5.1 Mandatory Login

Users must authenticate before using Solo Practice or Live Classroom.

Supported authentication targets:

- Google account.
- Northeastern University institutional account / SSO.

### 5.2 Display Name

After authentication, users must set a display name.

Requirements:

- The display name is shown in classroom lobbies, dashboards, and leaderboards.
- In formal classroom settings, hosts may instruct participants to use their real names.
- The display name is distinct from the authenticated email identity.

### 5.3 Single Active Device

Each account may have only one active device session at a time.

If the same account signs in from a second device:

- The second device takes over the active session.
- The previous device is invalidated.
- Existing session progress must be preserved.
- Previously submitted answers must be preserved.
- The display name must be preserved.
- Accumulated score must be preserved.
- Current streak display state must be preserved.
- Historical response timing must be preserved.
- The current question timer must not restart.

If a device takeover occurs while a timed question is active, the remaining time must be calculated from the original server-side `question_shown_at` timestamp.

A device takeover event must be recorded and shown as an indicator in the host dashboard. It must not reduce the learner's score.

## 6 Core Content Model

### 6.1 Question Set / Project

The central content unit is a **Question Set / Project**.

A question set may contain optional metadata:

- Project name.
- Course code.
- Week.
- Topic.
- Description.

These fields are optional. The product must support both richly organized and minimal structures.

Examples:

- `CS5800 → Week 6 → Dynamic Programming → Questions`
- `CS5800 → Questions`
- `Midterm Review → Questions`

The system must not force users through a rigid course hierarchy.

### 6.2 Question Set Operations

Users must be able to:

- Create.
- Save.
- Edit.
- Duplicate.
- Reuse.
- Delete.
- Launch in Solo Practice.
- Launch as a Live Classroom room.

### 6.3 Built-In Question Bank

The current built-in algorithm question bank must be preserved and made available in the new version.

The system must support filtering and selection from the built-in bank while also supporting user-created question sets.

## 7 Question Model

### 7.1 MVP Question Type

The proposed MVP supports:

- **Single-choice question only.**
- **Exactly four answer options.**
- **Exactly one correct option.**

### 7.2 Question Prompt

A question prompt may contain:

- Text only.
- Image only.
- Text plus image.

Uploading an image means the image itself is used as question content. The MVP does not perform OCR or automatic question extraction.

### 7.3 Question Fields

Each question should support at least:

- `question_id`
- `question_set_id`
- prompt text
- optional prompt image
- four answer options
- correct answer index
- per-option feedback
- correct-answer explanation
- reference materials
- optional topic
- optional subtype
- optional difficulty
- optional time limit
- optional source metadata

### 7.4 Per-Option Feedback

Each answer option may include feedback explaining why the option is correct or incorrect.

This is required for Solo Practice so learners can receive targeted explanation after a wrong selection without revealing the correct answer prematurely.

## 8 Question Import and Reference Materials

### 8.1 Question Creation Methods

Hosts/users must be able to create questions through:

- Manual entry.
- JSON import.
- Image-based prompt upload.

The JSON import format must support four answer options and one correct answer.

### 8.2 Reference Materials

Questions or question sets may include reference materials in the following forms:

- Text explanation.
- Image.
- PDF or document.
- Video file.
- URL.

Reference materials are intended for post-answer explanation and learning support.

## 9 Solo Practice

### 9.1 Solo Setup

The Solo Practice setup should allow the learner to choose, when available:

- Question set or topic.
- Question subtype.
- Difficulty.
- Number of questions.
- Timed or untimed practice.

The setup should be visually simple and understandable without documentation.

### 9.2 Timed Practice

For timed questions:

- The countdown is visible.
- Response time is recorded.
- Score is calculated using correctness and response time.

### 9.3 Untimed Practice

For untimed practice:

- No countdown pressure is displayed.
- Actual response time is still recorded for analytics.
- The absence of a visible timer must not prevent timing telemetry.

### 9.4 Retry and Feedback Behavior

Solo Practice permits multiple submissions within the same question exposure.

For an incorrect selection:

- The system must tell the learner that the selected option is incorrect.
- The system may show the explanation for why that selected option is wrong.
- The system must not reveal the correct answer.
- The system must not visually eliminate or highlight the correct answer in a way that gives it away.
- The learner may try again.

Only after the learner independently selects the correct answer may the system reveal:

- The correct-answer explanation.
- Full reference materials.
- Any attached image, document, video, or URL intended as post-answer learning material.

### 9.5 Historical Attempts

Learners may review prior mistakes and prior incorrect selections.

The system must distinguish repeated exposures to the same question.

Example:

- Exposure 1: incorrect.
- Exposure 2: correct.
- Exposure 3: correct.

The system must preserve exposure number and first-attempt performance.

## 10 Live Classroom

### 10.1 Room Creation

Any authenticated user may create a Live Classroom room.

Creating the room makes that user the **Host** for that session.

### 10.2 Joining

Participants must be able to join through:

- Room code.
- QR code.
- Join URL.

A participant must authenticate and confirm a display name before entering the lobby.

### 10.3 Lobby

The host lobby should clearly display:

- Room code.
- QR code.
- Join URL or join instructions.
- Participant count.
- Participant names.
- Start control.

The host should not need external documentation to explain how participants join.

### 10.4 Synchronized Questions

During Live Classroom:

- All participants receive the same active question.
- All participants may answer.
- No participant loses the right to answer because another participant answered faster.
- The experience should create a competitive "race" feeling without using exclusive buzz-in ownership.

### 10.5 Changeable Answer, One Scored Submission

Each participant receives one scored submission per question in Live Classroom: their last selection before answer
time runs out.

While answers are open:

- The participant may change their answer by selecting another option, up to 20 changes per question.
- Every selection is recorded immediately with its server time and kept; earlier selections cannot be edited or
  removed.
- Points and response time use the last selection, measured from the moment answers open. Counting the first
  selection would let a participant select anything at once and change it later at no cost in speed.
- The question does not close early when every participant has answered, so changes stay possible until time runs
  out; the host may still stop answers early.

When answer time runs out, the last selection is locked and no further selection is accepted.

### 10.6 Host-Controlled Pacing

The host controls classroom pacing.

Recommended flow:

1. Host presents question.
2. Reading phase: the question and its options are visible, but answering is locked for the reading time. The default reading time is 5 seconds; the host may set 0 to 60 seconds when launching (0 opens answers at once) and may open answers early. Response time and points count from the moment answers open.
3. Participants answer while timer runs.
4. All responses are collected or time expires.
5. Answer distribution is shown.
6. Correct answer and explanation are revealed.
7. Reference materials may be shown.
8. Host selects **Next**.

Participants must not receive the correct answer before the reveal stage.

## 11 Scoring

### 11.1 Research Score

The research score is based only on:

- Correctness.
- Response time.

Streaks do not affect the research score.

### 11.2 Correct Answer Formula

For a timed question:

\[
Score = 500 + 500\left(1-\frac{t}{T}\right)
\]

Where:

- \(t\) = elapsed response time.
- \(T\) = total allowed response time.

The result must be bounded to the intended 500–1000 point range for a correct answer.

### 11.3 Incorrect Answer or Timeout

\[
Score = 0
\]

### 11.4 Streaks

Streaks are visual/gameplay feedback only.

Examples:

- `2 correct in a row!`
- `3 correct in a row!`
- `5 correct in a row!`

Streaks may trigger:

- Animation.
- Sound.
- Visual emphasis.

They must not modify the base research score.

## 12 Dashboard

### 12.1 Live Host Dashboard

During Live Classroom, the host dashboard should provide:

- Current question number.
- Number of participants.
- Number and percentage who have answered.
- First-attempt accuracy.
- Answer distribution.
- Response-time summary.
- Live leaderboard.
- Individual participant performance.
- Device takeover indicator.

### 12.2 Post-Session Dashboard

After a session, the host should be able to review:

- Overall participation.
- Question-by-question accuracy.
- Answer distributions.
- Response-time patterns.
- Participant-level performance.
- Leaderboard results.
- Device takeover events.
- Session metadata.

## 13 Research Data Model

### 13.1 Separation of Content and Behavior

Question content and learner behavior must be stored separately.

**Question Content** describes what the question is.

**Behavioral Records** describe what a learner did when exposed to that question.

### 13.2 Core Research Entities

The minimum conceptual entities are:

- Authenticated User.
- Research Participant ID.
- Question Set.
- Question.
- Session.
- Exposure.
- Submission.
- Attempt / outcome record.
- Event log.

### 13.3 Submission

A **Submission** represents one answer selection. In Live Classroom a participant may make several selections for
one question; only the last counts.

Suggested fields:

- participant ID
- session ID
- question ID
- exposure number
- selected option
- correctness
- submission timestamp
- elapsed response time
- resulting score (non-zero only on the counted selection)
- selection index within the exposure
- whether it is the counted (final) selection
- device takeover state

### 13.4 Exposure

An **Exposure** represents one continuous encounter with a question.

It may contain multiple submissions in Solo Practice. In Live Classroom it may contain several selections (answer
changes) but exactly one scored submission, the last.

Suggested fields:

- exposure ID
- participant ID
- question ID
- session ID
- exposure number
- question shown timestamp
- first-submission timestamp
- first-attempt correctness
- first-attempt response time
- number of submissions
- time to correct
- final correctness
- full explanation viewed
- reference material interactions

### 13.5 Session

Suggested fields:

- session ID
- mode: Solo or Live
- host ID when applicable
- question set ID
- ordered question IDs
- start timestamp
- end timestamp
- participant count
- timer configuration (answer time and reading time)
- scoring configuration

### 13.6 Event Logging

The system should record auditable events including:

- question shown
- answer selected
- answer submitted
- incorrect feedback displayed
- correct answer revealed
- reference material opened
- session reconnect
- device takeover
- session completed

Where practical, derived values such as response time should be reproducible from raw timestamps.

## 14 Research Identity and Privacy Architecture

### 14.1 Authentication Identity vs. Research Identity

Authentication identity must be distinct from research identity.

The production system may require email or institutional identity for login, but research exports should use a pseudonymous participant identifier by default.

### 14.2 Research Export

The host/research workflow must support:

- CSV export.
- JSON export.

Default research exports should not include:

- Email address.
- Authentication tokens.
- Unnecessary direct identifiers.

### 14.3 Raw Evidence vs. Interpretation

The system must maintain a strict distinction between:

1. **Raw behavioral evidence** — submissions, timestamps, selected answers, device events.
2. **Derived metrics** — accuracy, latency, score, attempt counts, time-to-correct.
3. <mark><u><em>**Generated interpretation** — any future AI-generated educational analysis.</em></u></mark>

<mark><u><em>Generated interpretations must never overwrite or redefine raw behavioral evidence.</em></u></mark>

## <mark><u><em>15 AI Learning Coach Report</em></u></mark>

<mark><u><em>All requirements in this section are included in the proposed MVP acceptance scope, but their implementation details remain explicitly marked **TBD**.</em></u></mark>

### <mark><u><em>15.1 Automatic Post-Session Generation (TBD)</em></u></mark>

<mark><u><em>After a Solo Practice or Live Classroom session ends, the system shall automatically generate an AI Learning Coach report for each participant. AI generation must occur only after core session results and research records have been safely persisted. If generation fails, scores, dashboard data, and research records must remain available, and the user must be able to retry report generation. (TBD)</em></u></mark>

### <mark><u><em>15.2 Personal Report Content (TBD)</em></u></mark>

<mark><u><em>Each personal report shall be no more than 300 English words and shall use the learner's recorded session evidence to summarize performance, identify the knowledge points covered, flag weak or risky areas, distinguish potentially confused concepts, and provide concise next-step learning guidance. (TBD)</em></u></mark>

<mark><u><em>The report shall distinguish observed evidence from AI interpretation and shall avoid presenting inferred misconceptions or capability judgments as established facts. (TBD)</em></u></mark>

### <mark><u><em>15.3 Learning Resources (TBD)</em></u></mark>

<mark><u><em>Each personal report shall recommend 1–3 relevant YouTube learning resources connected to the question concepts, correct-answer concepts, or observed error patterns. Resource URLs must come from a verified retrieval mechanism or curated resource library and must not be fabricated by the language model. (TBD)</em></u></mark>

### <mark><u><em>15.4 Report Presentation and Markdown Export (TBD)</em></u></mark>

<mark><u><em>The generated report shall be displayed directly in the AlgoArena user interface after generation completes and shall be downloadable as a Markdown (.md) file. (TBD)</em></u></mark>

### <mark><u><em>15.5 Live Classroom Host Access (TBD)</em></u></mark>

<mark><u><em>For a Live Classroom session, the Host shall by default be able to view the individual AI Learning Coach report of every participant in that Host's session. Host access shall be limited to reports produced within sessions created by that Host and shall not grant access to a participant's Solo Practice reports or reports from unrelated sessions. (TBD)</em></u></mark>

<mark><u><em>Participants shall be informed that their session performance and AI-generated personal learning report are visible to the session Host. (TBD)</em></u></mark>

### <mark><u><em>15.6 Class-Level Report (TBD)</em></u></mark>

<mark><u><em>After a Live Classroom session, the system shall generate a class-level AI Learning Coach report based on aggregated classroom performance, including prominent knowledge points, common error patterns, potential concept-confusion signals, and areas that may warrant instructor review. (TBD)</em></u></mark>

### <mark><u><em>15.7 Host Batch Export (TBD)</em></u></mark>

<mark><u><em>The Host shall be able to download all individual participant AI reports for the Host's Live Classroom session in a batch export. The batch export shall include the individual Markdown reports and the class-level report, with the intended packaging format to be finalized during implementation design. (TBD)</em></u></mark>

### <mark><u><em>15.8 Research Integrity and Data Separation (TBD)</em></u></mark>

<mark><u><em>AI-generated interpretations shall be stored separately from raw behavioral evidence and deterministic derived metrics. AI reports shall not overwrite source records and shall not be treated as ground-truth measurements of learner knowledge or capability. (TBD)</em></u></mark>

<mark><u><em>The system should retain sufficient generation provenance to support later auditing and research reproducibility, including the model identifier, prompt/version identifier, generation timestamp, generation status, and the metrics snapshot used as report input. (TBD)</em></u></mark>

### <mark><u><em>15.9 Failure Isolation (TBD)</em></u></mark>

<mark><u><em>AI services shall remain operationally decoupled from scoring, session completion, dashboards, and research-event persistence. AI service failure must never cause loss of participant results or prevent completion of a Solo Practice or Live Classroom session. (TBD)</em></u></mark>

## 16 UI and Interaction Design

### 16.1 Design Direction

The visual direction is:

> **Kahoot-inspired game energy with a cleaner university-level computer science interface.**

The system should feel like a game used for learning rather than an assignment decorated with game elements.

### 16.2 Visual Principles

Use:

- Saturated, high-contrast color blocks.
- Large answer cards.
- Clear typography.
- Obvious hover, active, submitted, correct, and incorrect states.
- Strong visual hierarchy.
- Responsive layouts.

The interface should remain readable when projected in a classroom.

### 16.3 Motion

Appropriate motion includes:

- Lobby waiting animation.
- Player join animation.
- Countdown animation.
- Answer submission feedback.
- Correct / incorrect reveal.
- Score increase animation.
- Streak animation.
- Leaderboard transitions.

Motion should support comprehension and energy without delaying host control.

### 16.4 Audio

The system may use original or properly licensed:

- Background game music.
- Countdown audio.
- Correct / incorrect sounds.
- Reveal cues.
- Leaderboard cues.

Hosts must have a prominent mute/audio control.

### 16.5 Usability Requirement

A first-time host should be able to complete the primary flow without reading documentation:

`Login → Create/Select Question Set → Add/Import Questions → Attach Reference Materials → Create Room → Show Join Instructions → Start Session → Run Questions → View Dashboard`

This is a product requirement, not merely a design preference.

## 17 Primary User Flows

### 17.1 Solo Practice

`Login → Confirm Display Name → Select Question Set → Configure Practice → Answer → Targeted Wrong-Answer Feedback → Retry if Needed → Correct Answer → Full Explanation → Continue → Results`

### 17.2 Live Classroom Host

`Login → Select/Create Question Set → Create Room → Display QR/URL/Code → Participants Join → Start → Show Question → Collect Answers → Reveal → Review Dashboard → Next → Final Results`

### 17.3 Live Classroom Participant

`Login → Confirm Display Name → Join via QR/URL/Code → Lobby → Receive Question → Select an Answer (changeable until time runs out) → Wait for Reveal → See Result/Score → Continue`

## 18 Functional Acceptance Criteria

The proposed v1.0 baseline is ready for freeze when all of the following are true:

1. Users cannot enter Solo Practice or Live Classroom without authentication.
2. Users can authenticate with the supported Google/institutional login methods.
3. Users can define and retain a display name.
4. A second-device login takes over the account without resetting session progress or the active question timer.
5. The product contains the preserved built-in algorithm question bank.
6. Users can create reusable question sets with optional project/course/week/topic metadata.
7. Users can manually create four-option single-choice questions.
8. Users can import compatible questions through JSON.
9. Users can use an uploaded image as question prompt content.
10. Questions may include text, image, document/PDF, video, and URL reference materials.
11. Solo Practice supports timed and untimed modes.
12. Solo Practice permits retry after an incorrect answer without revealing the correct answer prematurely.
13. Wrong options may provide targeted explanations.
14. Live Classroom supports room code, QR code, and URL joining.
15. All Live participants may answer each question independently.
16. Live scoring permits exactly one scored submission per participant per question: the last selection before
    answer time runs out. Participants may change their answer until then, and every selection is recorded.
17. Host controls answer reveal and progression to the next question.
18. Correct timed answers receive 500–1000 points based on elapsed response time.
19. Incorrect answers and timeouts receive zero points.
20. Streaks are visible but do not alter the research score.
21. The live dashboard displays participation, first-attempt accuracy, answer distribution, response timing, leaderboard, participant-level performance, and device takeover indicators.
22. Research data separates content, exposures, submissions, sessions, and identity.
23. Research export is available in CSV and JSON.
24. Default research exports use pseudonymous participant identifiers rather than direct authentication identifiers.
25. <mark><u><em>The system automatically starts generation of a personal AI Learning Coach report after each completed Solo Practice or Live Classroom session, without blocking persistence of core results. (TBD)</em></u></mark>
26. <mark><u><em>If AI report generation fails, session scores and dashboard data remain intact and the user can retry generation. (TBD)</em></u></mark>
27. <mark><u><em>Each personal AI report is no more than 300 English words and includes knowledge points, evidence-based performance observations, weak/risk signals, relevant concept distinctions, and concise next-step guidance. (TBD)</em></u></mark>
28. <mark><u><em>Each personal AI report contains 1–3 verified YouTube learning-resource links relevant to the session concepts or observed error patterns. (TBD)</em></u></mark>
29. <mark><u><em>Each generated personal AI report is displayed in the UI and can be downloaded as Markdown. (TBD)</em></u></mark>
30. <mark><u><em>A Live Classroom Host can view the individual AI report of every participant in that Host's session. (TBD)</em></u></mark>
31. <mark><u><em>A Live Classroom Host can batch-download all individual participant Markdown reports together with the class-level report. (TBD)</em></u></mark>
32. <mark><u><em>Participants are informed that their Live Classroom AI report is visible to the session Host. (TBD)</em></u></mark>
33. <mark><u><em>AI-generated interpretations are stored separately from raw evidence and derived metrics and are never treated as ground-truth research measurements. (TBD)</em></u></mark>
34. <mark><u><em>AI report generation provenance is retained sufficiently to audit the model/prompt version, generation time/status, and source metrics used. (TBD)</em></u></mark>
35. <mark><u><em>Failure or unavailability of the AI service does not prevent session completion, scoring, dashboard use, or research-data persistence. (TBD)</em></u></mark>

## 19 Success Metrics

Product evaluation may use:

- Successful session creation rate.
- Successful room join rate.
- Percentage of first-time hosts able to start a session without documentation.
- Participant completion rate.
- Answer submission reliability.
- Synchronization reliability in Live Classroom.
- First-attempt accuracy capture completeness.
- Response-time capture completeness.
- Rate of session recovery after reconnect/device takeover.
- Question import success rate.
- Research export completeness.

These metrics measure product operation and instrumentation. They do not, by themselves, establish educational effectiveness.

## 20 Research-Study Readiness

AlgoArena should be considered research-ready only when:

- Required behavioral events are logged consistently.
- Timestamp semantics are documented.
- Device takeover and reconnect behavior are auditable.
- First exposure and repeated exposure can be distinguished.
- First-attempt correctness and first-attempt latency can be reconstructed.
- Research exports are pseudonymized by default.
- Question metadata is sufficiently stable to support topic/type/difficulty analysis.
- The specific study protocol has received any required institutional review before data are collected for research.

The PRD does not assume a specific causal hypothesis. The application provides a measurement infrastructure that can support later studies of algorithm-learning performance, misconceptions, repeated exposure, response latency, classroom participation, and related educational questions.

## 21 Future-Version Candidates

Potential later-version work includes:

- Multiple-select questions.
- Additional question types.
- More advanced media-based question formats.
- LMS integrations.
- Additional research dashboards.
- Expanded longitudinal learner analytics.

## 22 Proposed Baseline Summary

The proposed v1.0 baseline consists of:

- Mandatory authenticated access.
- Contextual Host/Participant roles rather than permanent account roles.
- Single active device with state-preserving takeover.
- Two primary modes: Solo Practice and Live Classroom.
- Reusable Question Set / Project as the central content entity.
- Optional course/week/topic metadata.
- Preserved built-in algorithm question bank.
- Four-option single-choice questions.
- Manual, JSON, and image-prompt question input.
- File and URL reference materials.
- Multiple retries with targeted feedback in Solo Practice.
- One scored submission per question in Live Classroom.
- Host-controlled reveal and pacing.
- Correctness-plus-response-time scoring.
- Visual streaks with no research-score bonus.
- Kahoot-inspired visual, animation, and audio direction.
- Live host dashboard.
- Pseudonymous CSV/JSON research export.
- <mark><u><em>Separation of raw evidence, derived metrics, and generated interpretation.</em></u></mark>
