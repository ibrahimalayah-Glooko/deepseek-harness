# Agent Note: VS Code specialist agents

Status: implemented

English | [中文](2026-09-08-vscode-specialist-agents.zh.md)

## Problem

Contributors need focused GitHub Copilot workflows that apply the repository's existing review, documentation, testing, prose, note, simplification, and shipping rules without loading every workflow for each task.

## Decision

The repository provides seven VS Code custom agents in `.github/agents/`. Each agent has a specific task description, a minimal tool set, and instructions to load the matching `.agents/skills/` workflow. The user guide explains when to select each agent.

## Alternatives considered

**One general-purpose agent.** A single agent would need every workflow and tool for every request, which weakens task-specific guidance and increases unrelated context.

**Untracked user-level agents.** User-level files would not give repository contributors the same workflows or make the workflow reviewable with source changes.

## Consequences

Contributors can select a specialist from the VS Code Chat agent picker, and parent agents can delegate matching work. Each definition must stay aligned with its referenced skill and the repository instructions.