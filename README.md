# Prompt Engineerer

A walk-away studio for **wrangling system prompts** against models that ignore
polite rules.

You describe the behavior you want. A **Parent** model writes a system prompt
and designs tests — **one scenario per critical rule**. A **Child** model
has to follow that prompt. After each Child reply, Parent *sees the actual
output* and writes the next user turn to poke that rule. When the scenarios
finish, Parent scores the transcripts and revises the prompt.
Repeat until the Child actually obeys, or you hit Stop.

That is the point. Strong-story models will look at “do not exceed 600 words”
and ignore it. Parent keeps changing the *wording of the cage* until Child
complies. When it adds a new rule to reign Child in, it also adds a scenario
that spends the full turn budget on that rule. You click **Engineer** and go
do something else.

Works with any **OpenAI-compatible** `/v1` server: local Edge / MLX / llama.cpp /
Ollama / vLLM / LM Studio, or a hosted API (OpenAI, xAI, Groq, OpenRouter, …).

## What a run does

1. Parent drafts a full system prompt (or uses your seed) and names scenarios —
   one per critical rule.
2. For each rule, Child answers turn 1. Parent reads that reply and writes
   turn 2, still pressing *that* rule. Repeat up to **Turns per rule** (1–20).
3. After every scenario, Parent gets the full Child transcripts and scores
   1–10. Miss the target → revise or revert. Hit it → stop.
4. If Parent adds a new cage rule, the next loop tests it. Old rules keep
   their scenarios. **Max iterations** is the runaway brake, not the turn slider.
5. Revisions stay on a timeline with scores and diffs. Restore or abandon any
   rev. Parent sees every prior prompt and score so it can tell improve vs
   degrade.

**Stop** aborts the loop. Local servers are asked to cancel in-flight
generation.

## Requirements

- Node.js 22+
- npm 10+
- Python 3.11+ (launcher only — the app itself is TypeScript)

## Install

```bash
git clone https://github.com/milljm/prompt-engineerer.git
cd prompt-engineerer
```

The first run of `./engineer.py` installs npm dependencies for you. Or:

```bash
npm install
```

## Run

```bash
./engineer.py
```

That is the same as `npm run dev`. Then open the URL Vite prints (typically
`http://localhost:8080`).

```bash
./engineer.py test        # Node unit tests
./engineer.py lint        # ESLint
./engineer.py ci          # test + lint + typecheck
./engineer.py build
```

1. Paste an OpenAI-compatible API address in **OpenAI API**.
   Examples:
   - Local Edge / MLX: `http://127.0.0.1:<your-port>/v1`
   - Ollama: `http://127.0.0.1:11434/v1`
   - OpenAI: `https://api.openai.com/v1`
   - xAI: `https://api.x.ai/v1`
2. Add an **API key** if that server requires one. Local stacks usually skip it.
3. Refresh the model list. Pick a **Parent** (the editor) and a **Child** (the
   prompt under test). They can be the same model.
4. Describe the behavior you want. Optionally seed a system prompt.
5. Hit **Engineer**. Use **Stop** to abort. Restore / Abandon any revision
   from the timeline.

Drag the right edge of the sidebar to resize it. Double-click the handle (or
press Home while it is focused) to auto-fit long model names. Width is saved
in the browser.

Settings, the goal, and prompt versions persist in the browser (`localStorage`).
The API key never leaves this machine except as a `Authorization` header to the
address you typed (or through this app's proxy for public hosts).

### Local vs hosted APIs

| Address | How it is called |
|---|---|
| Loopback / LAN (`127.0.0.1`, `localhost`, `192.168.x.x`, machine names, Tailscale) | Directly from the browser. The server must allow CORS. |
| Public (`https://api.openai.com/v1`, …) | Proxied through this app so CORS is not your problem. Private hosts are refused (SSRF). |

## Scripts

| Command | What it does |
|---|---|
| `./engineer.py` | Dev server with HMR |
| `./engineer.py test` / `npm test` | Unit tests (`node:test`) |
| `python -m unittest discover -s tests -v` | Tests for the Python launcher |
| `./engineer.py lint` / `npm run lint` | ESLint |
| `pylint engineer.py tests` | Pylint on the launcher |
| `./engineer.py typecheck` | `tsc --noEmit` |
| `./engineer.py build` | Production build |
| `./engineer.py format` | Prettier |

The product is TypeScript. `npm test` is the unittest suite; `npm run lint` is
the ESLint (pylint-shaped) pass. Exported modules carry JSDoc. `./engineer.py`
is the Python front door so you do not have to remember npm.

## Pull requests

Open PRs against `main`. GitHub Actions (`.github/workflows/ci.yml`) runs the
Node tests, typecheck, ESLint, the Python launcher tests, and pylint. CI must
be green before merge.

## Layout

```
src/
  components/studio/   UI: sidebar, prompt timeline, run log
  lib/                 engine, inference, URL helpers, Parent protocol
  routes/api/openai/   proxy for public OpenAI-compatible hosts
engineer.py            Python launcher (wraps npm)
tests/                 unittest for the launcher
.github/workflows/ci.yml
```

## License

Private unless you add one.
