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
  - Every prompt and prompt change needs the owner's approval and a new version id.
