---
name: despacho-de-pan-setup
description: "Configuración del proyecto despacho-de-pan: rutas, permisos, git workflow y estado actual de fases. Para que el chat del proyecto retome autónomo sin perderse."
when-to-use: "Cuando el chat de despacho-de-pan se despierte, o cuando haya que retomar el proyecto tras un corte. También para cualquier chat de proyecto nuevo que necesite saber cómo acceder al repo."
tags: [despacho, proyecto, git, workflow, repo, permisos]
---

# Despacho de Pan — Setup y workflow

Realidad del entorno (verificada). Úsalo cada vez que el chat se despierte o se sienta perdido.

## Rutas

- **Repo git (fuente de verdad):** `/home/admin/3enki/`
- **Acceso del chat (hermes):** `~/3enki` (simlink a `/home/admin/3enki/`)
- **Deploy vivo (NO editar):** `/opt/enki/` — sin .git, no es repo
- **Storage (esquemas):** `/opt/enki/data/projects/despacho-de-pan/storage/`

## Permisos

- `hermes` ∈ grupo `www-data`
- `/home/admin/` tiene g+x (hermes atraviesa)
- `/home/admin/3enki/modules/` es 2775 admin:www-data → hermes escribe
- Si un módulo nuevo da EACCES al escribir blueprint → pedir `sudo chmod g+w`

## Git workflow

```
cd ~/3enki
git checkout main && git pull origin main
git checkout -b proyecto/despacho-de-pan
# editar modules/<slug>/
git add modules/<slug>/
git commit -m "feat(despacho): descripción"
git push -u origin proyecto/despacho-de-pan
# PR por MCP github (base=main, head=proyecto/despacho-de-pan)
# Paco mergea (squash) + deploya
```

## Estado

| Fase | Estado | |
|---|---|---|
| F0-F3 (esquema + diseño OOP) | ✅ | En storage/esquemas/ |
| H1 Calendario (módulo+skill+blueprint+UI) | ✅ | PR #332 abierto |
| H2 Motor Confluencia | ⏳ | Pendiente |
| H3 Portal Llamada | ⏳ | Pendiente |
| H4 Cobro Anticipado | ⏳ | Pendiente |

## Project IDs

- project_id: `b0e301bf-8ffd-4f1a-a9fe-66006e7b90d2`
- conversation_id: `77111b9e-873c-40ad-95e3-5f4f1ab9d707`

## Reglas de oro

- NUNCA escribir en /opt/enki/ — es deploy, se pierde en rsync
- SIEMPRE escribir en ~/3enki/modules/<slug>/ (el repo)
- Rama proyecto/despacho-de-pan — no tocar main
- PR por MCP github, Paco mergea + deploya
- Merge + deploy rápido (Guardian revierte cada 15 min lo no desplegado)
