# CLAUDE.md

Code and comment rules for this repository are in agent.md. Repository text is English only (tools/hooks/pre-push).

## Technology decisions

- AI question drafting (v1.1, decided 2026-11-04; design in docs/ai-question-generation.md):
  - A new callable `draftQuestions`, separate from `coach`, because `coach` assumes an ended session, a report-only
    system prompt and a client-built prompt.
  - Orchestration with a LangGraph JS `StateGraph` only (owner choice). Nodes call the Anthropic and OpenAI APIs
    through the injected `fetch`, without LangChain model wrappers, so the request format verified in M7 and the
    unit and mutation tests still apply; LangChain's default structured-output path sends a forced tool, which Claude
    Sonnet 5.5 rejects. Pin a LangGraph release at least two weeks old; it releases several times a week.
  - Drafting model `claude-sonnet-5-5` (already live for reports); verifier `gpt-6.1-terra` (owner choice, low-cost
    OpenAI tier) for a blind solve and an audit that flag drafts but never fix them.
  - Every prompt and prompt change needs the owner's approval and a new version id. Approved so far: qgen-draft-v1,
    qgen-solve-v1, qgen-audit-v1, qgen-repair-v1 (2026-11-04, Appendix B of the design doc); qgen-draft-v2 (2026-11-05:
    CLRS 3rd edition, the module's chapters and the chosen chapter by title, procedure names in first-letter capitals).
  - Modules and chapters (owner, 2026-11-05): the bank's six modules plus Module 7 (Data Structures), with CLRS 3rd
    edition chapters per module in `CHAPTERS` (functions/qgen-core.js) and `DRAFT_CHAPTERS` (page), kept equal by a test.
  - Pinned exactly: `@langchain/langgraph` 1.5.2, `@langchain/core` 1.2.20, `zod` 4.6.7. LangSmith tracing stays off
    (no LANGSMITH_*/LANGCHAIN_TRACING* variable is set).
  - The owner may later replace the GPT verifier with DeepSeek; design doc section 15 lists what that changes.

- Northeastern email sign-in (decided and built 2026-11-09):
  - Students sign in with a Firebase email link sent to their Northeastern address (passwordless sign-in): they type
    the address, open the link in Outlook, and are signed in. Google sign-in stays as a second option, because the
    owner's, the instructor's and existing players' data and admin entries belong to their Google uids.
  - Chosen over Microsoft sign-in after Northeastern's tenant refused app registration to a student account (Entra
    App registrations answered 401 on 2026-11-09): an app registered outside the tenant would likely need Northeastern
    IT approval, while an email link needs no app, no secret and no approval, and proves the student owns the mailbox.
  - The page accepts only @northeastern.edu addresses (husky.neu.edu is the same tenant); rules and functions keep
    checking uids, since Google sign-in is open to any account anyway.
  - Firebase console: Email/Password and "Email link (passwordless sign-in)" enabled; the continue URL's domain
    (yikangliu823.github.io) must be an authorized domain. Blaze allows 25,000 sign-in link emails a day.
  - Test email to a Northeastern mailbox (2026-11-09): delivered to Junk Email, the link wrapped by Safe Links with
    the original URL kept. The "Check your email" screen says to look in Junk; a custom sending domain is the fallback
    if that proves a problem in class.
