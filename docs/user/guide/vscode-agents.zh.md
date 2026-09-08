# 使用 VS Code agents

[English](vscode-agents.md) | 中文

本仓库在 [`.github/agents/`](../../../.github/agents) 中提供专用 GitHub Copilot agents。任务与某个 agent 的职责相符时，请在 VS Code Chat 中选择它。每个 agent 都会先加载仓库规则和对应的 workflow skill（技能），再作出响应。

## 选择 agent

在 VS Code 中打开 GitHub Copilot Chat，然后从 agent 选择器中选择一个 agent。向它说明你要完成的工作。父 agent 也可以把聚焦的工作委派给这些 agents。

## 选择合适的 agent

| Agent | 适用工作 |
|---|---|
| DSH Docs | 文档、README、JSDoc 和双语文档修改。 |
| DSH Note Keeper | `.agents/notes/` 下的 Agent Notes。 |
| DSH Prose Auditor | 含有改动历史或推理叙述的注释和文本。 |
| DSH Reviewer | Pull Request 和 diff 审查。 |
| DSH Shipper | 推送前选择检查，或合并 PR 栈。 |
| DSH Simplifier | 查找冗余代码或不必要的抽象。 |
| DSH Test Doctor | 不稳定测试、仅 CI 失败和测试隔离。 |

## 运行 harness

从源码启动前，请安装依赖并构建 workspace：

```sh
corepack enable
pnpm install
pnpm run build
```

使用已配置的模型运行一个 headless 任务：

```sh
pnpm dsh --profile headless "summarize this repository"
```

harness 会从进程环境、`$DSH_HOME/.credentials.yaml`、启动目录的 `.env` 或 `$DSH_HOME/.env` 解析 `DEEPSEEK_API_KEY`。模型设置和自定义 OpenAI 兼容端点请参阅[配置模型](providers.zh.md)。

## 验证修改

运行覆盖你工作的最小检查。常用检查如下：

```sh
pnpm run typecheck
pnpm run test:docs
pnpm exec vitest run packages/<group>/<package>/tests/<file>.spec.ts
```

仓库的完整测试套件包含权限测试。请以非 root 用户运行它们：root 会绕过 Unix 权限位，因此权限拒绝断言不能在 root 下通过。

## 继续使用

- [配置模型](providers.zh.md)
- [使用 Web UI](index.zh.md)
- [使用其他 CLI 模式](../../../apps/cli/README.zh.md)