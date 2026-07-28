---
name: github-mcp
description: >-
  Gestión de PRs y workflow con el repo 3enki de Enki usando MCP de GitHub
  desde Hermes: autenticación, creación de PRs, revisión, merge y deploy.
when-to-use: >-
  Cuando necesites crear, revisar o mergear PRs en el repo 3enki desde Hermes.
  También para configurar el MCP de GitHub por primera vez.
source: hermes
platforms: [linux, macos]
tags: [github, mcp, pr, git, enki, 3enki]
---

# GitHub MCP — Gestión de PRs y repos

## Configuración

```yaml
mcp_servers:
  github:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_..."
    timeout: 60
```

## Flujo de trabajo con 3enki

1. Rama: `hermes/<feature>`
2. Commit + push
3. PR: `base: main`, `head: hermes/<feature>`
4. Merge a main
5. Deploy: `cd ~/3enki && git pull origin main && sudo ./deployment/deploy.sh`

## Tools directas

PR #1: en `_executeToolCall` del ai-gateway, si la tool tiene `handler` y
`module` en el toolsRegistry, se ejecuta directamente sin pasar por MQTT.
