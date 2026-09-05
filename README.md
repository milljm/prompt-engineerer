# Prompt Engineerer

A studio for forging system prompts. You describe the behavior you want. A
**Parent** model writes (then revises) a system prompt. A **Child** model is
thrown scenarios — including extra turns — and scored. Parent iterates until
the quality target holds, or you hit Stop.

Works with any **OpenAI-compatible** `/v1` server: local Edge / MLX / llama.cpp /
Ollama / vLLM / LM Studio, or a hosted API (OpenAI, xAI, Groq, OpenRouter, …).

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

## How a run works

1. Parent drafts a full system prompt (or you seed one) and designs scenarios.
2. Child answers each scenario for N turns (the **Turns per test** slider).
3. Parent scores 1–10. Below the target, it revises the *entire* prompt or
   reverts to an earlier revision.
4. Repeat until the target score, **Max iterations**, or **Stop**.

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
