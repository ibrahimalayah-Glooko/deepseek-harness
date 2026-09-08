# Agent Note: VS Code 专用 agents

Status: implemented

[English](2026-09-08-vscode-specialist-agents.md) | 中文

## Problem

贡献者需要聚焦的 GitHub Copilot workflow（工作流），以应用仓库已有的审查、文档、测试、文本、Agent Note、简化和发布规则，而不是在每个任务中加载所有 workflow。

## Decision

仓库在 `.github/agents/` 中提供七个 VS Code custom agents。每个 agent 都有特定的任务说明、最小化工具集，以及加载对应 `.agents/skills/` workflow 的指令。用户指南说明何时选择每个 agent。

## Alternatives considered

**一个通用 agent。** 一个 agent 必须为每个请求加载所有 workflow 和工具，这会削弱面向任务的指导，并增加无关上下文。

**未跟踪的用户级 agents。** 用户级文件无法让仓库贡献者使用相同的 workflow，也无法随源代码修改一起审查 workflow。

## Consequences

贡献者可以从 VS Code Chat 的 agent 选择器中选择专用 agent，父 agent 也可以委派匹配的工作。每个定义必须与其引用的 skill 和仓库指令保持一致。