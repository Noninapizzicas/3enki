---
name: guardian-repo
description: >-
  El GUARDIAN DEL REPO — versionado determinista del trabajo que el chat
  (Hermes interno) persiste en prod (/opt/enki). Detecta módulos/config
  modificados o nuevos en prod que NO están en el repo (~/3enki), los copia,
  hace rama→commit→push→PR→merge, y deja el repo POR DELANTE de prod para que
  el deploy (rsync --delete) nunca borre trabajo. Úsala cuando el chat haya
  producido/verificado algo en prod, antes de cualquier deploy, o para
  auditar si hay trabajo sin versionar.
when-to-use: >-
  Tras cada ciclo de trabajo del chat en prod (módulos, config, blueprints).
  Antes de que el dueño haga deploy ("¿Desplegado?" → verificar 0 pendientes
  primero). Para auditar "¿está todo commiteado? ¿el deploy borraría algo?".
source: hermes
tags: [enki, repo, deploy, rsync, guardian, versionado, automatizacion]
---

# Guardian del Repo — repo SIEMPRE por delante de prod

La lección que creó este mecanismo (13-ago-2026): el chat produce y verifica
en `/opt/enki` (prod) pero el deploy sincroniza DESDE `~/3enki` (el repo) con
`rsync -a --delete` — una sola dirección. **Todo lo que vive en prod sin estar
en el repo MUERE en el próximo deploy.** Se pagó en vivo 3 veces (banco v0.2.0
revertido, redactor.blueprint.json perdido, allowlist del radar sin versionar)
antes de automatizarlo.

## La regla (la que gobierna todo)

**Repo por delante de prod.** producido+verificado en prod → copiar al repo
YA, antes de cualquier deploy. El deploy debe TRANSPORTAR el trabajo, nunca
revertirlo. Un `rsync --delete` con el repo detrás de prod es una reversión
silenciosa de lo que el chat construyó.

## El mecanismo determinista (script)

`/home/admin/scripts/guardian-repo.py` — reglas fijas, SIN LLM (watchdog):

1. **SCAN**: módulos en `/opt/enki/modules/` vs `~/3enki/modules/`
   (excluye dot-dirs fósiles `.*` y `_shared`) + `config.json` prod vs repo
   + **`tests/unit/`** y **`frontend/src/lib/modules/`** (desde 15-ago-2026 —
   ver "Caso límite" abajo). Compara por CONTENIDO (bytes), no por mtime —
   la verdad está en prod.
   Difieren → el chat tocó algo → versionar.
2. **DIRECCIÓN**: prod → repo (el chat produce en prod; el repo es el archivo).
3. **CICLO**: copiar → rama `guardian/auto-<timestamp>` → commit → push → PR
   → **merge squash** (API GitHub, token del remote) → volver a main limpio.
4. **SILENCIO**: sin cambios → salida vacía (patrón watchdog — se puede cronear
   cada 10-15 min y solo notifica cuando hay movimiento).
5. **SEGURIDAD**: si el push o el PR fallan → reporta, no fuerza el merge.

```bash
python3 /home/admin/scripts/guardian-repo.py --dry-run   # ¿hay pendientes? (vacío = 0)
python3 /home/admin/scripts/guardian-repo.py             # versionar todo lo pendiente
```

Copia re-ejecutable de referencia en la skill: `scripts/guardian-repo.py`
(la instalada en `/home/admin/scripts/` es la que se ejecuta; esta copia es el
original versionado por si hay que restaurarlo o adaptarlo a otro repo).

Salida de un ciclo: `PR #N creado → ✅ MERGEADO (sha) → ✅ repo por delante de
prod — el deploy no borrará nada`.

## El cron (autonomía — programado 14-ago-2026)

El Guardian corre SOLO cada 15 minutos (job `8c1b6e57a62b`):

```bash
cronjob create → no_agent=true, script='guardian-repo.py', schedule='every 15m'
```

Pitfalls del cron (pagados en vivo):
- **El script DEBE vivir en `~/.hermes/scripts/` como archivo REAL** — el cron
  rechaza rutas absolutas (`/home/admin/scripts/...`) y symlinks (error
  "Script path escapes the scripts directory via traversal"). Copiar el
  archivo, no enlazarlo.
- **Silencio si nada pendiente**: el script imprime solo cuando versiona algo
  → el cron no molesta; notifica únicamente cuando hay movimiento.
- El chat NO puede ejecutar el Guardian (vive en el home del admin) — el cron
  le da autonomía sin depender de que nadie lo lance a mano.

## Verificación de seguridad pre-deploy (ritual)

Antes de decir "el deploy es seguro", auditar:

```bash
# 1 · ¿trabajo sin versionar? (vacío = OK)
python3 /home/admin/scripts/guardian-repo.py --dry-run
# 2 · ¿módulos del proyecto en prod Y en repo?
for m in <slugs>; do echo "$m: prod=$(ls -d /opt/enki/modules/$m >/dev/null 2>&1 && echo SÍ) | repo=$(ls -d ~/3enki/modules/$m >/dev/null 2>&1 && echo SÍ)"; done
# 3 · tras el deploy: verificar que NO revirtió (mtime/versión del archivo clave)
grep '"version"' /opt/enki/modules/<slug>/module.json   # debe ser la versión NUEVA
```

## Flujo de trabajo completo (el ciclo del chat→repo→deploy)

```
chat produce+verifica en prod → (Guardian cron lo detecta y versiona solo)
                             → o manual: aviso del chat → guardian-repo.py
→ rama → PR → merge → main → PACO depliega (vps-setup.sh) → nada se pierde
```

Notas:
- **El chat NO puede commitear** (`/opt/enki` no es repo git — no tiene .git ni
  token). El versionado lo hace el Guardian (yo, el Hermes operador). Es una
  frontera deliberada: el chat produce, yo certifico lo que entra al repo.
- **Ramas del Guardian**: prefijo `guardian/auto-*`, se borran tras el merge.
- **El token GitHub** vive en la URL del remote del repo (`git remote get-url
  origin` → `https://<user>:ghp_...@github.com/...`) — el script lo extrae de
  ahí; no hay secretos nuevos que gestionar.
- **Dot-dirs fósiles** (`modules/.<slug>-v1-*`) NO van al repo (`.gitignore`
  tiene `modules/.*/`) — el deploy los limpia solos, es deseable.

## Caso límite (15-ago-2026): el chat edita TAMBIÉN tests/ y el frontend — fuera del escaneo original se revertía

Visto en vivo: el chat arregló `tests/unit/http-gateway.test.js` (`process.env.PORT || 3001` en prod) y el repo seguía con el `port: 3001` hardcodeado — el deploy de Paco lo REVIRTIÓ en prod y el Guardian NO lo detectó (solo escaneaba `modules/` + `config.json`; el test vive fuera). El chat avisó "el Guardian revertió mi fix" — y tenía razón.

**Cómo detectarlo cuando el chat lo reclama** (antes de discutir): `diff /opt/enki/tests/unit/<archivo> ~/3enki/tests/unit/<archivo>` (o `diff -rq` de `tests/` y `frontend/src/lib/modules/`) — si difieren, la verdad está en PROD (el chat la escribió ahí) y hay que copiar prod→repo a mano (rama → PR → merge), no esperar al Guardian.

**Fix de raíz aplicado**: el script ahora escanea también `tests/unit/` y `frontend/src/lib/modules/` (función `extra_dirty` + constantes `PROD_TESTS/REPO_TESTS/PROD_FRONT_MODULES/REPO_FRONT_MODULES`), siempre por contenido. Lección: al añadir una ruta nueva donde el chat pueda persistir, extender el SCAN del Guardian al momento — no esperar a que un deploy la revierta.

**Segundo caso límite (mismo día, deploy fallido del frontend): `frontend/src/lib/stores/` también se escanea** (constantes `PROD_FRONT_STORES/REPO_FRONT_STORES`). El `rsync --delete` borró `frontend/src/lib/stores/interfaz.ts` (el store del Panel Svelte de la F7 — el trío real de un módulo UI es manifest + index.ts + Panel.svelte + el STORE en `stores/`), y el build rompió con `Could not load .../stores/interfaz (imported by InterfazPanel.svelte): ENOENT`. **PITFALL del propio `extra_dirty`: inicialmente solo iteraba DIRECTORIOS — un archivo suelto (ej. `stores/interfaz.ts`) no se detectaba ni se versionaba.** El fix: manejar `d.is_dir()` y archivos sueltos por separado (archivo → comparar bytes con `repo_dir/name`). Al ampliar el radar a una ruta con archivos sueltos, verificar que `extra_dirty` los cubre (test con `--dry-run`).

**Regla de oro para módulos UI del frontend**: cada módulo con UI del chat produce hasta 4 archivos en rutas DISTINTAS — `frontend/src/lib/modules/<slug>/` (trío) Y `frontend/src/lib/stores/<slug>.ts` (el store). Versionar el store al momento; si el deploy lo borra, el chat lo regenera (tiene el contrato en contexto) pero el build se rompe hasta entonces.

**Tercer caso límite (15-ago, mismo día): `frontend/src/lib/ui-core/` también se escanea** (constantes `PROD_FRONT_UICORE/REPO_FRONT_UICORE`). El fix del PAGE_CATALOG del radar (`project-pages.ts` — la pieza que hace visible un botón en la work-bar) no lo detectó el Guardian — vivía en `ui-core/`, otra ruta fuera del radar — y hubo que copiarlo a mano (rama → PR → merge). **El radar COMPLETO del Guardian (15-ago-2026)**: `modules/`, `config.json`, `tests/unit/`, `frontend/src/lib/modules/`, `frontend/src/lib/stores/`, `frontend/src/lib/ui-core/`. **Lección acumulada (el patrón se repitió 3 veces el mismo día: tests → stores → ui-core)**: cada vez que el chat edita una ruta nueva (un fix del frontend, un test, un store, un catálogo), ampliar el SCAN al momento — no esperar a que un deploy lo revierta.

## Caso límite (18-ago-2026): `frontend/src/lib/components/` también quedó fuera del radar (blueprint-form)

**Pagado en vivo (PR #274)**: el generador schema→UI tiene DOS piezas en rutas distintas — el trío `frontend/src/lib/modules/interfaz-dinamico/` (el dogfood, SÍ en el radar) y **el componente `frontend/src/lib/components/blueprint-form/`** (BlueprintForm.svelte + blueprint-zones.ts — el corazón del generador, FUERA del radar). El #266 versionó el trío pero NO el componente → el repo quedó sin el corazón del generador → un deploy lo habría borrado. El propio chat lo detectó: *"falta versionar el delta del #266: blueprint-form/ falta en el repo"* — creerle cuando lo reporta.

**El radar del Guardian NO incluye `frontend/src/lib/components/`** — el patrón acumulado se repitió por 4ª vez (tests → stores → ui-core → **components**): cada ruta nueva donde el chat persiste requiere ampliar el SCAN. Fix manual (igual que los anteriores): `cp -r` prod→repo (con `-rT` para no anidar) → rama → PR → merge.

**Lección (la definitiva, 4 repeticiones)**: antes de dar por versionado un hito del chat, verificar que el SCAN del Guardian cubre TODAS las rutas donde el chat escribió — el dry-run con `git status --short` en el repo (archivos `??`) complementa al Guardian: si hay archivos nuevos `??` que el Guardian no lista, están en una ruta fuera del radar → versionar a mano.

## Caso límite (17-ago-2026): `_shared/` es un PUNTO CIEGO — los archivos que el chat crea ahí se pierden

El Guardian **excluye `_shared/` del escaneo a propósito** (`IGNORE = {"_shared"}  # infra, se versiona por el flujo normal`). Pero el chat SÍ puede crear/editar archivos ahí (permisos g+w en `modules/` desde 13-ago) — y cuando lo hace, **ningún mecanismo los versiona**: ni el Guardian (excluido) ni el chat (no puede commitear).

Pagado en vivo (FASE 4 de The Pirate): el chat creó `modules/_shared/config-custodio.js` en prod (17-ago 08:00) y su propio dictamen lo señaló: "config-custodio.js sigue SOLO en prod (_shared), ausente en el repo — un rsync --delete repo→prod lo borra". **El chat detectó su propio punto ciego — creerle cuando lo reporta.**

**Fix (manual, dirección prod→repo — la verdad está en prod):**
```bash
cd ~/3enki && cp /opt/enki/modules/_shared/<archivo> modules/_shared/<archivo>
diff /opt/enki/modules/_shared/<archivo> modules/_shared/<archivo>   # idénticos
# rama → commit → PR → merge (PR #255 en el caso real)
```

**Regla**: cuando el chat diga "X está solo en prod (_shared)" o toques `_shared/`, versionarlo A MANO (rama/PR) — el Guardian no lo cubre ni lo detectará. Alternativa de raíz: añadir `_shared` al radar del Guardian (pendiente de decidir — sería escanear solo archivos nuevos, no la infra existente).

## Pitfalls pagados en vivo

- **`cp -r src dest` con dest existente ANIDA** (`modules/banco/banco/`) — usar
  `cp -rT src dest` (o copiar el contenido) y verificar con `ls` después.
- **La copia manual va detrás del chat**: si copias la v0.1.0 y el chat mejora
  a v0.2.0 ANTES del deploy, el deploy revierte a la v0.1.0. El Guardian en
  cron (cada 10-15 min) reduce esa ventana a minutos.
- **Un `git pull` en la rama del Guardian** puede traer cambios del chat de
  otra sesión — el script hace checkout de rama nueva desde main, nunca
  acumula ramas.
