# Caso testigo — vertical `nichos` (Radar de Nichos)

> Estado medido en disco, no reporte de LLM. Vertical de 44 hojas construidas
> (F0–F7 completas), sin poner en servicio. Proyecto `nichos`, UUID
> `4fe1fb71-df73-4d67-8fb7-ba6b0beff253`, rama `vertical/nichos`.

## Estado de partida (2026-09-27)

| bloque | medido |
|---|---|
| módulos con `module.json` en `modules/nichos/` | 44 |
| declarados en `config.json → modules.enabled` | 0/44 |
| `SKILL.md` en cantera por hoja | 44/44 |
| plan F3b | `boveda/nichos/proceso/fase3b/plan-construccion.md` (bóveda, NO storage) |
| espina `enki-plan` | 49 hojas = 44 CONSTRUIR + 5 REUTILIZAR |
| REUTILIZAR | `scheduler`, `crawl4rs`, `filesystem`, `project-manager`, `telegram-bridge` |
| con interfaz (`ui_handlers`) | 3: `vista-portafolio`, `cola-decisiones-gate`, `ajustador-umbrales` (los 3 `system_panel`) |
| `data/scheduler/jobs.json` | `jobs: []` → nadie dispara el ciclo |
| `storage/prisma/nichos/` | no existe (se crea al primer ciclo) |
| semilla | F0 dejó `primer_nicho` como pregunta abierta |
| canal | `Enki_nichos_bot` sin credencial en `.env` |

Los 44 módulos CARGABAN sin estar en `enabled` (el loader escanea el nivel de la
vertical). Cargar sin orden ≠ operar.

## Los dos frenos reales del gate de F8 (salida literal)

Ninguno es «no está hecho» — los dos son de CONTEXTO de lectura.

**(a) El gate lee el plan del STORAGE del proyecto, no de la bóveda.**
`_progresoPlan()` hace `fs.read.request` de `esquemas/plan-construccion.md` scopeado al
`project_id` → `data/projects/<slug>/storage/esquemas/`. Sin plan ahí → `total:0` →
`409 «No hay plan de construcción con hojas»` aunque las 44 hojas existan.
Puente: copiar el plan a `storage/esquemas/plan-construccion.md` por `fs.write.request`.

**(b) F8 exige SKILL.md en cantera para TODAS las hojas — incluidas REUTILIZAR.**
`_progresoPlan` recorre las 49 y `_skillEnCantera()` solo mira
`cosecha/cantera/enki/<slug>/SKILL.md` (+ prefijos `pizzepos-`/`prisma-`) → los 5 genéricos
de sistema no tienen skill → `faltan_por_skill:5` →
`409 «todas las hojas construidas + skill»`. Es el gate contando hojas que no se construyen
en este vertical, no deuda del vertical.

Sellar F8 antes de resolver (a)+(b) es imposible: el gate rechaza con 409 y NO sella nada
(`FASE_INCOMPLETA`). Las dos salidas de (b) son decisión del dueño (skill a los genéricos =
tapa; corregir el gate = raíz).

## Estado tras el arranque (2026-09-28)

- **44/44 declarados** en los DOS `config.json` (deploy `/opt/enki` + repo `/home/admin/3enki`).
- **Plan F3b en storage** → freno (a) cerrado.
- **Skill `poner-en-servicio` viva** en el índice de `cosecha`: `cosecha.obtener.request
  {nombres:["poner-en-servicio"]}` → `faltan: []`.
- **Cadena real end-to-end hasta el embudo**: `captura-semilla` forja un `nicho_id` UUID,
  `normalizacion-semilla` + `sondeo-territorio` lo propagan. Con fuente real (crawl4rs
  devolvió 20 registros) el sondeo interpretó demanda → **7 candidatos EN_COLA** en
  `storage/prisma/nichos/cola-candidatos.json`.
- El registro del pipeline queda keyado por **UUID** (`71edd6bd-8f09-…`), no por `"undefined"`:
  el bug de propagación del id está reparado.

## Lo que sigue atascado (no cubierto por el arranque)

1. **CORREGIDO 28-sep (el «falta driver» era FALSO).** La cadena NO se atasca por falta de
   drenaje: se ORQUESTA SOLA (`_consumir` -> `_dispararSiguiente`). El corte real era que los 6
   modulos de la 2a mitad del embudo publicaban su evento sin `nicho_id`. Arreglado (commit
   `bc1dd4ee`, propagado a deploy) y **verificado en vivo tras el restart**: una semilla real
   recorre SEMILLA->BUSCADO->VALIDANDO->VALIDADO->CONSTRUIDO sin intervencion. `jobs.json` vacio
   sigue siendo cierto, pero NO impide que un ciclo lanzado avance solo.

## Corte NUEVO, medido tras el fix del `nicho_id` (28-sep, en vivo)

El embudo corre entero hasta `CONSTRUIDO` y muere ahi:

    nichos.solucion.construir.request  {nicho_id}
    nichos.solucion.construir.failed   {error: SIN_ESPECIFICACION}

**Causa raiz (dos huecos de las hojas D1/D3, no del pipeline):**

- `pipeline-por-nicho._rpcEtapa` (caso `construir`) manda `nicho` **sin `capacidades`** -- su
  propio comentario dice "consulta el catalogo de capacidades antes de ensamblar" pero no lo hace.
- `ensamblador-solucion` (D1) recibe `[]` -> `_decidirQueConstruir` (fuzzy) y
  `_decidirQueConstruirReflejo` devuelven `null` (el reflejo exige `capacidades.length > 0`) -> 502.
- El ensamblador **nunca publica `nichos.capacidad.consultar.request`** (0 emisores en todo el
  vertical) aunque su `_doc` y el plan D1 lo declaran.
- Nadie puebla el catalogo con capacidades `existente`: no hay emisor de
  `nichos.capacidad.declarar.request` -> el catalogo nace y vive **vacio**.

**Discriminador:** el nicho queda `CONSTRUIDO` con `datos` = {semilla, territorio, candidato,
estudio, veredicto, camino} y **sin `solucion`**; el historial cierra en `camino.decidido`.

Sonda: `grep -rn "capacidad.consultar.request" modules/nichos/*/index.js` -> solo el propio
catalogo-capacidades (0 emisores). Mismo patron que el bug del `nicho_id`: un cable del plano que
nadie tendio. Arreglarlo toca diseno (quien siembra el catalogo y con que) -> decision del dueno.
2. **Desajuste slug↔UUID en `fs.*` al persistir.** Sonda dirigida, misma op, dos ids:
   - `fs.write` con `project_id: "nichos"` → `projects/futuro/storage/…` (proyecto ACTIVO)
   - `fs.write` con `project_id: "4fe1fb71-…"` → `projects/nichos/storage/…` (correcto)
   Causa (código): `filesystem/index.js` `_projectRootFor(projectId)` (línea 498) resuelve contra
`this.projectPaths.get(project_id)`, un Map que SOLO tiene la clave con la que el proyecto se
ACTIVÓ. Con un slug desconocido → `null` → `validatePath` cae al `activeProjectPath` (proyecto
ACTIVO global) → escritura cross-project SIN error. Verificado por lectura: `fs.read` del plan con
el UUID devuelve el contenido; con el slug, `RESOURCE_NOT_FOUND`.
3. **Eventos fantasma plan↔código.** El plan F3b declara que `pipeline-por-nicho` se suscribe a
   `nichos.ciclo.avanzar.request` y publica `nichos.pipeline.ciclo.iniciado` — CERO referencias
   en código. El código usa otros nombres y es coherente consigo mismo.

## Residuo sin borrar

El storage escrito primero con slug `nichos` quedó en `projects/futuro/storage/…`; y un registro
`"undefined"` pudo persistir de una sonda previa. No hay tool de borrado: queda ahí.