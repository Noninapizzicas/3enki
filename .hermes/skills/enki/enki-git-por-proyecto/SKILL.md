---
name: enki-git-por-proyecto
description: "Flujo git/PR de Enki por proyecto: cada chat trabaja en su rama proyecto/<slug>, main es sagrado, merge+deploy los hace el dueño. Usar cuando un chat de proyecto (edias, the-pirate...) va a editar código, commitear, pushear o crear un PR."
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

- **Repo git**: `/home/admin/3enki` (rama `main`). Es la ÚNICA zona de verdad para código.
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

1. **Partir de main limpio**:
   ```bash
   cd /home/admin/3enki
   git checkout main && git pull origin main
   ```
2. **Crear/entrar en la rama del proyecto**:
   ```bash
   git checkout -b proyecto/<SLUG>   # si no existe
   # o: git checkout proyecto/<SLUG>  si ya existe
   ```
3. **Editar** en el repo (NO en `/opt/enki`): `modules/<MODULO>/...`
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

- **Cada chat: su rama `proyecto/<SLUG>`, su trabajo, sus commits.** Nunca tocar `main` directo.
- **`main` es sagrado** — solo recibe merges verificados (los hace el dueño).
- **Si un proyecto la lía**: se revierte/descarta SU rama, sin afectar a los demás (aislamiento por rama).
- **NO editar en `/opt/enki`** para código — es el deploy, no el repo.
- **NO mergear** — el merge + deploy lo hace el dueño (Hermes/admin).

## Rol del dueño (Hermes/admin)

1. Revisar el PR de `proyecto/<SLUG>`.
2. **Merge** (squash) → main.
3. **Deploy inmediato** (< 15 min, antes del Guardian):
   ```bash
   cd /home/admin/3enki && git pull origin main && sudo ./deployment/deploy.sh && sudo systemctl restart enki
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
