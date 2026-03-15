# Python Tutor

A free, interactive Python tutor that teaches you to **think in Python** — from variable assignment through NumPy and class-based simulation. Built around the [MBD (Memory as Baseline Deviation)](https://github.com/YellowHapax/MBD-Framework) equation as a motivating target.

```
B_next = B * (1 - lam) + I * lam
```

## Five Stages

| # | Stage | Concepts |
|---|-------|----------|
| 1 | Variable Thinking | assignment, mutation, reference vs. copy |
| 2 | Sequences & Loops | `for`, `range`, accumulation, state iteration |
| 3 | Functions & Parameters | `def`, defaults, return values |
| 4 | NumPy & Equations | arrays as vectors, scalar ops, the MBD one-liner |
| 5 | Classes & Simulation | agents as objects, simulation loops |

## Usage

This app is **bring-your-own-key**. It uses [OpenRouter](https://openrouter.ai) to call `anthropic/claude-sonnet-4-5` on your behalf.

1. Get a free API key at **[openrouter.ai/keys](https://openrouter.ai/keys)**
2. Open the app and click **🔑 Enter OpenRouter key** in the top-right
3. Paste your `sk-or-v1-...` key and press **Save**

Your key is stored in your browser's `localStorage` only — it is never sent anywhere except directly to OpenRouter.

## Run locally

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Deploy (zero-config)

Push to `main` — Vercel and Netlify both auto-detect Vite projects and deploy on commit with no configuration needed. No server-side secrets required since auth is handled client-side with the user's own key.

## Stack

- [React 18](https://react.dev) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 5](https://vitejs.dev)
- [OpenRouter](https://openrouter.ai) — unified LLM API gateway
