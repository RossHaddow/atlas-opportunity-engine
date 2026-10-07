# Build 83 — OpenAI Web Discovery Provider

**Version:** 1.52.0

## Objective

Give Atlas its first built-in current-web discovery provider by connecting the Build 82 execution layer directly to the OpenAI Responses API with web search.

## What changed

- Added discovery-provider selection: `auto`, `http_json`, or `openai`.
- Added OpenAI configuration through `ATLAS_OPENAI_API_KEY` (or `OPENAI_API_KEY`) plus `ATLAS_OPENAI_MODEL`.
- Added a direct Responses API request path using a configurable web-search tool.
- Added an Atlas-specific research prompt that asks for distinct, low-cost, testable opportunity candidates and evidence grounded in current sources.
- Added resilient parsing for Responses API text output and candidate JSON.
- Added provider metadata capture including response id, model, and web-source URLs.
- API keys are never returned by discovery status and are not written into discovery-run history.
- Preserved the Build 82 generic HTTP adapter and Build 81 external-handoff fallback.
- Updated Opportunity Radar UI to show whether discovery is using OpenAI web search, the generic HTTP adapter, or external handoff.

## Configuration

```env
ATLAS_DISCOVERY_PROVIDER=auto
ATLAS_OPENAI_API_KEY=
ATLAS_OPENAI_MODEL=
ATLAS_OPENAI_RESPONSES_URL=https://api.openai.com/v1/responses
ATLAS_OPENAI_WEB_SEARCH_TOOL=web_search_preview
```

`auto` keeps backward compatibility: the generic HTTP adapter wins when `ATLAS_DISCOVERY_HTTP_URL` is configured; otherwise Atlas uses OpenAI when both the API key and model are present; otherwise Atlas remains in external-handoff mode.

## Verification

Build 83 adds tests for provider readiness, API-key secrecy, provider precedence, direct OpenAI execution, web-source metadata, candidate caps, and malformed JSON handling.
