# AGENTS.md — Norma de trabajo en el repo `3enki`

> **Una sesión = un worktree = una rama.** El worktree principal es de SOLO LECTURA.
> Esta norma existe porque su ausencia ya rompió el flujo 2 veces (30-sep-2026):
> commits de una vertical cayendo en `main`, PRs duplicados, y `git pull` fallando
> con "divergent branches" una y otra vez.

---

## 1. El mapa (verificado en disco)

```
/home/admin/3enki               [main]                          ← SOLO LECTURA. Nadie commitea aquí.
/home/admin/3enki-contabilidad  [vertical/contabilidad]         ← sesión de contabilidad
/home/admin/3enki-pizzepos      [proyecto/pizzepos]             ← sesión de pizzepos
/home/admin/3enki-skill         [hermes/skill-vertical-subagentes]  ← sesión de skills
```

Cada sesión trabaja **siempre** dentro de SU worktree, en SU rama.

## 2. Las 5 reglas

### R1 — El worktree principal no se toca
`~/3enki` es el espejo de `origin/main`. Solo se ejecuta aquí:

```bash
cd ~/3enki && git pull --ff-only origin main
```

**Nunca** se commitea, ni se hace `git checkout <otra-rama>`, ni se trabaja aquí.
Un hook `pre-commit` lo bloquea (ver §3).

### R2 — Cada sesión vive en su worktree
| Sesión | Worktree | Rama |
|---|---|---|
| Contabilidad | `~/3enki-contabilidad` | `vertical/contabilidad` |
| Pizzepos | `~/3enki-pizzepos` | `proyecto/pizzepos` |
| Skills | `~/3enki-skill` | `hermes/skill-*` |
| Nichos / general | `~/3enki-<tema>` (crear) | `hermes/<tema>` |
| **Cualquier tarea nueva** | crear worktree nuevo | rama nueva |

Crear un worktree nuevo:
```bash
cd ~/3enki && git fetch origin
git worktree add ~/3enki-<tema> -b hermes/<tema> origin/main
```

### R3 — Nunca commit directo a `main`
Todo trabajo va en una rama `hermes/<tema>` → **PR**. Nada de push a `main`.

### R4 — Sincronizar el worktree antes de empezar
Cada worktree está en su rama, pero **su rama hay que refrescarla**:

```bash
cd ~/3enki-<tema>
git fetch origin
git rebase origin/main        # o: git merge origin/main
```

> Medido 30-sep-2026: los 3 worktrees estaban **36 / 137 / 156 commits por detrás**.
> Trabajar ahí sin sincronizar = trabajar sobre código muerto.

### R5 — Pull siempre con rebase
```bash
git config --global pull.rebase true   # ya aplicado
```

---

## 3. El mecanismo (no depende de la memoria)

La norma no se sostiene con buenas intenciones. Hay un hook que la hace cumplir:

**`.githooks/pre-commit`** — rechaza cualquier commit si `HEAD` apunta a `main`
**en el worktree principal**.

Instalarlo (una vez por clon/worktree):
```bash
cd ~/3enki && git config core.hooksPath .githooks
```

> Los hooks de git **no viajan con el repo** (viven en `.git/hooks`). Por eso el
> hook está versionado en `.githooks/` y se activa con `core.hooksPath`. En los
> worktrees, `core.hooksPath` se comparte con el repo padre: basta configurarlo una vez.

### Si el hook te bloquea
No es un error de git: es la norma funcionando. Significa que estás a punto de
commitear en el sitio equivocado. La salida es:

```bash
cd ~/3enki && git worktree add ~/3enki-<tema> -b hermes/<tema> origin/main
cd ~/3enki-<tema>    # y repite el commit AQUÍ
```

---

## 4. Señales de que algo se está saltando la norma

| Síntoma | Qué significa |
|---|---|
| `fatal: Need to specify how to reconcile divergent branches` | hay commits locales sobre `main` |
| PRs duplicados (mismo contenido, números distintos) | dos sesiones subieron el mismo trabajo |
| `git status` con decenas de ficheros ajenos sin commitear | otra sesión está usando tu worktree |
| Ficheros sin commitear que están en el runtime | el `deploy.sh` hace `rsync` del working tree, no de git |

## 5. Sonda rápida (¿estoy cumpliendo la norma?)

```bash
# ¿estoy en el worktree principal con HEAD en main?
[ "$(git rev-parse --show-toplevel)" = "/home/admin/3enki" ] && [ "$(git branch --show-current)" = "main" ] && echo "SOLO LECTURA: no commitees aquí"

# ¿mi worktree está al día?
git fetch origin -q && echo "por detrás: $(git rev-list --count HEAD..origin/main)"

# ¿hay commits locales sobre main? (no debería haber ninguno)
git log --oneline origin/main..main
```
