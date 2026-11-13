---
name: enki-git-por-proyecto
description: "Flujo git/PR de Enki por proyecto: cada chat trabaja en un WORKTREE propio (~/3enki-<slug>) con su rama proyecto/<slug>; ~/3enki es sólo lectura. Usar cuando un chat de proyecto (edias, the-pirate...) va a editar código, commitear, pushear o crear un PR."
version: 1.0.0
author: Hermes Agent
platforms: [linux]
metadata:
  hermes:
    tags: [enki, git, github, pr, multi-tenant, aislamiento]
    related_skills: [github-pr-workflow, enki-cupula-hermes]
---

# Enki — Git por Proyecto (rama aislada)

Flujo determinista para que **cada chat de proyecto** edite, commitee y cree PRs **sin pisar a los demás**, y para que el dueño (Hermes/admin) haga merge + deploy. Elimina la "tercera banda" (copia manual entre `/opt/enki` y el repo).

## Realidad del entorno (verificada — NO asumir otra)

- **Repo git**: `/home/admin/3enki` (rama `main`, **SÓLO LECTURA** — espejo de `origin/main`).
  Es la ÚNICA zona de verdad para código, pero **no se trabaja dentro**: cada chat
  crea su worktree (`~/3enki-<SLUG>`).
- **`/opt/enki`** es el **deploy vivo** (NO es repo git). NO editar código ahí — es el origen de que el Guardian revierta.
- **hermes** (el chat) puede escribir en el repo: `admin:www-data 664`, hermes ∈ grupo www-data. Puede hacer git local y push (dry-run OK).
- **MCP de github** configurado con token (`ghp_...`) en `/home/admin/.hermes/config.yaml` → el chat puede crear PRs.
- **El deploy** (`deployment/deploy.sh`) compila el frontend y versiona. El **Guardian** (cron 15 min) revierte del repo cualquier cambio mergeado-no-desplegado → **merge + deploy inmediato** o lo revierte.

## Variables de proyecto (parametrizar SIEMPRE)

Antes de tocar git, resolver estas variables del proyecto concreto:

| Variable | Fuente | Ejemplo |
|---|---|---|
| `SLUG` | nombre del proyecto en kebab-case | `edias`, `the-pirate` |
| `RAMA` | `proyecto/<SLUG>` | `proyecto/edias` |
| `MODULO` | módulo(s) que toca | `pizzepos/viabilidad` |
| `TAREA` | descripción corta | `umbrales_food_cost_por_proyecto` |
| `AUTOR` | `user.name`/`user.email` del chat | `edias <edias@enki>` |

## Orden determinista (el chat)

1. **Crear un worktree propio** — `~/3enki` NO se toca:
   ```bash
   cd /home/admin/3enki
   git fetch origin main
   git worktree add ~/3enki-<SLUG> -b proyecto/<SLUG> origin/main
   # si la rama ya existe:
   #   git worktree add ~/3enki-<SLUG> proyecto/<SLUG>
   cd ~/3enki-<SLUG>
   ```
   `~/3enki` es el espejo de `origin/main` y **sólo lectura**: el deploy y el
   dueño lo necesitan en `main`. Un `git checkout` aquí lo secuestra y rompe el
   `git pull --ff-only` y el deploy (pasó 4 veces: `vertical/qr`,
   `esquema/qr-contextual`, `app/enki-bridge`, `proyecto/instagram-bridge`).
   El hook `.githooks/post-checkout` lo revierte, pero no lo intentes.
2. **Trabajar siempre dentro del worktree** (`cd ~/3enki-<SLUG>`).
3. **Editar** ahí (NO en `/opt/enki`): `modules/<MODULO>/...`
4. **Commit** con mensaje convencional:
   ```bash
   git add modules/<MODULO>/...
   git commit -m "feat(<SLUG>): <TAREA>"
   ```
5. **Push**:
   ```bash
   git push -u origin proyecto/<SLUG>
   ```
6. **Crear PR** (MCP github o gh) con base `main`, head `proyecto/<SLUG>`.
7. **Avisar al dueño**: "PR #N listo en proyecto/<SLUG> — merge + deploy".

## Reglas de oro

- **`~/3enki` es SÓLO LECTURA.** Nunca `git checkout` ni editar ahí: es el espejo
  de `origin/main` que usan el dueño y el deploy. Cada chat, su worktree
  (`~/3enki-<SLUG>`) en su rama `proyecto/<SLUG>`. Nunca tocar `main` directo.
- **`main` es sagrado** — solo recibe merges verificados (los hace el dueño).
- **Si un proyecto la lía**: se revierte/descarta SU rama, sin afectar a los demás (aislamiento por rama).
- **NO editar en `/opt/enki`** para código — es el deploy, no el repo.
- **NO mergear** — el merge + deploy lo hace el dueño (Hermes/admin).

## Rol del dueño (Hermes/admin)

1. Revisar el PR de `proyecto/<SLUG>`.
2. **Merge** (squash) → main.
3. **Deploy inmediato** (< 15 min, antes del Guardian) **desde `~/3enki`**.
   El dueño es el ÚNICO que trabaja ahí, y sólo en `main`:
   ```bash
   cd ~/3enki && git checkout main && git pull --ff-only origin main
   sudo ./deployment/vps-setup.sh <dominio>
   ```
4. Borrar la rama `proyecto/<SLUG>` local y remota tras merge.

## Pitfalls

- **Guardian**: merge + deploy inmediato o revierte el repo a prod. (Repetido 3+ veces en 2026-08-20.)
- **hermes sin `user.name`**: configurar antes del primer commit:
  ```bash
  git config user.name "<SLUG>"
  git config user.email "<SLUG>@enki"
  ```
- **`/opt/enki` no es repo**: si un chat insiste en editar ahí, corregirle la ruta al repo.
- **Rama huérfana**: si un PR queda sin mergear y su cambio ya está en main por otra vía, cerrarlo (no mergear redundante).
- **`git checkout` en `~/3enki`**: PROHIBIDO. Deja el árbol en una rama de trabajo y
  el `git pull --ff-only origin main` del dueño aborta con «diverging branches»;
  el deploy se niega a correr (`[ERROR] ABORTO: el árbol NO está en origin/main`).
  Si ya pasó: `git stash push -u` → `git checkout main` → `git pull --ff-only`.
  El hook `.githooks/post-checkout` lo revierte solo.
