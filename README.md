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

## Install

```bash
git clone https://github.com/milljm/prompt-engineerer.git
cd prompt-engineerer
npm install
```

## Run

```bash
npm run dev
```

Then open the URL Vite prints (typically `http://localhost:8080`).

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

Settings, the goal, and prompt versions persist in the browser (`localStorage`).
The API key never leaves this machine except as a `Authorization` header to the
address you typed (or through this app's proxy for public hosts).

### Local vs hosted APIs

| Address | How it is called |
|---|---|
| Loopback / LAN (`127.0.0.1`, `localhost`, `192.168.x.x`, …) | Directly from the browser. The server must allow CORS. |
| Public (`https://api.openai.com/v1`, …) | Proxied through this app so CORS is not your problem. Private hosts are refused (SSRF). |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm test` | Unit tests (`node:test`) |
| `npm run lint` | ESLint (the pylint stand-in for this TypeScript repo) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build |
| `npm run format` | Prettier |

This repo is TypeScript, not Python. `npm test` is unittest; `npm run lint` is
pylint; exported modules carry JSDoc.

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
```

## License

Private unless you add one.
