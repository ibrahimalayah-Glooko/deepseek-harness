# Use VS Code agents

English | [中文](vscode-agents.zh.md)

This repository provides specialist GitHub Copilot agents in [`.github/agents/`](../../../.github/agents). Select one in VS Code Chat when its task matches your work. Each agent loads the repository rules and its matching workflow skill before it responds.

## Select an agent

Open GitHub Copilot Chat in VS Code and choose an agent from the agent picker. Ask it for the work you want done. The agents are also available for a parent agent to delegate focused work.

## Choose the right agent

| Agent | Use it for |
|---|---|
| DSH Docs | Documentation, README, JSDoc, and bilingual documentation changes. |
| DSH Note Keeper | Agent Notes under `.agents/notes/`. |
| DSH Prose Auditor | Comments and prose that contain change history or reasoning narration. |
| DSH Reviewer | Pull request and diff review. |
| DSH Shipper | Selecting checks before a push or landing a stack. |
| DSH Simplifier | Finding redundant code or unnecessary abstractions. |
| DSH Test Doctor | Flaky tests, CI-only failures, and test isolation. |

## Run the harness

Install dependencies and build the workspace before source launches:

```sh
corepack enable
pnpm install
pnpm run build
```

Run one headless task with a configured model:

```sh
pnpm dsh --profile headless "summarize this repository"
```

The harness resolves `DEEPSEEK_API_KEY` from the process environment, `$DSH_HOME/.credentials.yaml`, the invoking directory's `.env`, or `$DSH_HOME/.env`. See [Configure models](providers.md) for model setup and custom OpenAI-compatible endpoints.

## Verify changes

Run the smallest check that covers your work. Common checks are:

```sh
pnpm run typecheck
pnpm run test:docs
pnpm exec vitest run packages/<group>/<package>/tests/<file>.spec.ts
```

The repository's full test suite includes permission tests. Run them as a non-root user: root bypasses Unix permission bits, so permission-denial assertions cannot pass under root.

## Continue

- [Configure models](providers.md)
- [Use the Web UI](index.md)
- [Use other CLI modes](../../../apps/cli/README.md)