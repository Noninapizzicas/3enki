---
name: enki-cupulas
description: >-
  Cómo construir y operar las CÚPULAS de Enki — las superficies globales
  consultables al LLM (tools, eventos, agentes, skills, biblioteca, APIs).
  Cubre el patrón "índice barato + detalle a demanda", la distinción
  EVENTOS ≠ TOOLS, el scope global vs per-proyecto, y el molde de módulo
  runtime (reflejo consultable) frente al vigilante estático. Úsala al
  crear/renombrar/ampliar una cúpula, decidir si algo es global o por
  proyecto, o diagnosticar la cúpula de herramientas/eventos.
when-to-use: >-
  Paco pide "cúpula de X" (tools, eventos, agentes, apis, conocimiento,
  skills personales), decide si una superficie es global o por proyecto,
  o hay que distinguir entre la cúpula de herramientas y la de eventos.
tags: [enki, cupulas, eventos, tools, boveda, catalogo, global]
---

# Cúpulas de Enki — superficies consultables al LLM

Una **cúpula** es un almacén GLOBAL de conocimiento/capacidades que el LLM
puede consultar a demanda SIN saturar el prompt. La tesis es el patrón
"**índice barato + detalle a demanda**" (reach-not-resident): el LLM ve un
índice diminuto (~200 tok) de qué existe y cómo consultarlo, y trae el
contenido solo cuando lo necesita. Es la misma idea que la bóveda Obsidian
(bibliotecario), la cantera de skills (cosecha) y el catálogo de agentes.

## REGLA CENTRAL — EVENTOS ≠ TOOLS (pagado en vivo)

- **Cúpula de TOOLS** = las capacidades que el LLM puede invocar
  (fs.write, telegram.send, cobro…). Servida por `cupula-tools`
  (`buscar_capacidad`, `detalle_capacidad`, `capacidad_dominio`).
- **Cúpula de EVENTOS** = el CONTRATO DEL BUS: qué eventos se emiten, quién
  los atiende/conduce/publica, dónde hay FANTASMAS (evento conducido que
  nadie atiende → timeout silencioso). Servida por `cupula-eventos`
  (runtime, `evento_indice/detalle/buscar/fantasma`).
- **TRAMPA (pagada en vivo 19-ago)**: el módulo que servía las TOOLS se
  llamaba `cupula-eventos` (nombre engañoso). No lo confundas: el nombre
  decía "eventos" pero su contenido era el catálogo de capacidades/tools.
  Renombrarlo a `cupula-tools` deja `cupula-eventos` LIBRE para la cúpula
  de eventos real. **Al nombrar un módulo, que el nombre diga qué sirve.**

## REGLA nº1 (corrección del dueño 19-ago): REPLICAR EL PATRÓN, NO INVENTAR

Cuando Paco pide "crear la cúpula de X" (ej. APIs), la respuesta NO es inventar
un molde nuevo. Es **copiar el patrón exacto de las cúpulas que YA funcionan en
prod** (`cupula-tools` v0.2.0, `cupula-eventos` v0.1.0) y solo cambiar la
sustancia (lo que proyecta). El dueño frenó el trabajo por esto:
*cómo las otras utiliza los mismos patrones no vaya a ser ahora que rebanadas
quiera inventar algo*. Leer el código real de las cúpulas existentes ANTES de
escribir; replicarlo campo a campo; el nombre de la clase y el export DEBEN
coincidir.

### El patrón canónico (verificado en cupula-tools / cupula-eventos en prod)

```
index.js:
  const BaseModule = require('../_shared/base-module');
  class XModule extends BaseModule {
    constructor() { super(); this.name='X'; this.version='...'; }
    onLoad(context) { this.logger/metrics/eventBus; registra tools en
                      moduleLoader.toolsRegistry (name+description+parameters+
                      module+event_based); }
    // handlers de bus: publican '<ns>.<op>.response' CORRELADO por request_id
    async on<Op>Request(event) { const d=event?.data||event||{};
      try { result=this._<proyeccion>(d); publish('<ns>.<op>.response',
        {request_id:d.request_id, result}); }
      catch(err){ publish(...{request_id, error:{code,message}}); } }
    // proyecciones PURAS: _buscar/_detalle/_dominio → {status,data}|_errorResponse(400/404)
    // tools del LLM: handle<Op>Tool(args) → {status,data|error} con _handleHandlerError
  }
  module.exports = XModule;
```
- Las tools que viven en GLOBAL_TOOLS del ai-gateway NO se renombran (rompería
  el wiring): solo AÑADIR tools nuevas. `cupula-tools` mantuvo
  `buscar_capacidad`/`detalle_capacidad` y añadió `capacidad_dominio`.
- El module.json `tools[].handler` debe apuntar a `handle<Op>Tool` (typo visto:
  `obtenerTool` → rompería el loader).
- Las proyecciones puras usan `_errorResponse(400/404, code, msg)` del
  BaseModule — sin I/O, sin estado mutable.

## Patrón de módulo runtime (reflejo consultable) vs vigilante estático

- **Vigilante estático** (`scripts/cupula-eventos/vigilante.js`) escanea y
  CANTA (fantasmas) en CI. Solo reporta; no es consultable por el LLM.
- **Módulo runtime** (la cúpula real) reutiliza la MISMA lógica de escaneo
  y la sirve por tools. Reconstruye el censo en `onLoad` y bajo demanda
  (rescanear). Scope **system** (global), persistencia in-memory.
- Usar las MISMAS regexes del vigilante para que CI y runtime coincidan.

## Cómo construir una cúpula nueva (módulo runtime)

1. **Elige nombre que diga qué es** (si sirve tools → cupula-tools; si sirve
   el contrato del bus → cupula-eventos; no mezcles).
2. **module.json**: `scope: system`, `pattern: in-memory`, `tools[]` con las
   de consulta, `subscribes` (eventos `.request`) + `publishes` (`.response`).
   Registra la `module` en el enable list de `config.json`.
3. **index.js**: hereda `BaseModule`; en `onLoad` construye el índice/censo;
   handlers de tool con shape `{status, data|error}`; proyecciones puras.
4. **Robustez**: tolera manifest «deforme» (ej. `subscribes` como dict en
   `banco-ideas` → trata claves del dict si no es array). Un manifest roto
   NO debe romper el censo.
5. **Test unitario** con registry/escaneo sintético (no tocar bus) que
   verifique las proyecciones + 404/400.

| Herramientas existentes por cúpula

| Cúpula | Módulo | Tools de consulta | Scope |
|---|---|---|---|
| Tools | `cupula-tools` | `buscar_capacidad`, `detalle_capacidad`, `capacidad_dominio` | global |
| Eventos | `cupula-eventos` | `evento_indice`, `evento_detalle`, `evento_buscar`, `evento_fantasma` | global |
| Skills | `cosecha` | `buscar_skill`, `activar_skill` | global |
| Agentes | `agentes/registro` | `buscar_agente`, `activar_agente` | global |
| Conocimiento | `bibliotecario` + `boveda/` | `bibliotecario.catalogo`, `consultar` | system |
| APIs | `apis-publicas` | `buscar_api`, `obtener_api` | global |
| Rail (proyecto) | `estados` | `crear_lista`… | **por proyecto** |
| Vista de proyecto | `cupulas` | `vista_proyecto` | **por proyecto** |

## Cúpula de APIs — fuente real del catálogo (1671, no 13)

La rebanada `apis-publicas` dice "~1400 APIs" y "semilla de las ~30 prioritarias".
Al construirla, NO quedarse en las 13 que lista la rebanada (el dueño corrigió:
*"había 1400"*). El valor es que `buscar_api` **sepa que existen ~1400-1671 APIs
públicas y diga cuál encaja con la necesidad**; que estén descargadas o no es
secundario (se traen bajo demanda).

**Cómo generar el catálogo completo (probado 19-ago)** — parsear el README del
repo real `public-apis/public-apis`:

```bash
curl -sL "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md" -o /tmp/public-apis.md
```

Formato: secciones `### <Categoría>` seguidas de tablas `| API | Description |
Auth | HTTPS | CORS |`. Parsear con regex:
- categoría = `^### (.+)$`
- fila = `^\| ... \|` → cols split por `|`
- URL dentro del nombre `[Nombre](url "tooltip")`; nombre = `re.sub` del markdown link
- `auth` sin backticks, `https` = `yes`, `cors` sin backticks
- dedup por nombre, quedarse con la primera. Resultado real: **1671 APIs, 51 categorías**,
  ~495KB en `modules/apis-publicas/catalogo/completo.json`.

El módulo carga `completo.json` como fuente principal y `semilla.json` (las ~13
prioritarias de la rebanada) las marca en `prioritarias` (Set) para poder
filtrarlas en `buscar_api`. El catálogo completo NUNCA se inyecta en el prompt —
solo se busca a demanda.

## Scope: global vs por-proyecto (decisión del dueño)

Verificado en vivo: skills, agentes, biblioteca, cantera semántica, tools y
eventos son **GLOBALES** (iguales para todos los proyectos). SOLO la cúpula
de proyecto (`cupulas`) y el rail (`estados`) son **por proyecto**
(scope project, `storage/cupulas/_index.json` y `storage/estados/listas.json`).

- Para GLOBAL usa `scope: system`.
- Para per-proyecto usa `scope: project`.
- La visibilidad de `vista_proyecto` se enciende per-proyecto con el
  interruptor `cupula_vista_global` en `storage/cupulas/_index.json`
  (`visibilidad.vista_proyecto_global`).

## Pitfalls

- **El nombre engaña**: `cupula-eventos` servía tools. Nombre = contrato.
- **La cúpula de eventos runtime es distinta del vigilante estático**: el
  vigilante NO se consulta desde el chat; la cúpula runtime SÍ.
- **El cron del Guardian resucita módulos borrados** (PAGADO EN VIVO 19-ago):
  el PR #292 renombró `cupula-eventos`→`cupula-tools` en el repo, pero como
  prod aún NO se había desplegado, prod siguió teniendo `cupula-eventos` → el
  Guardian (#293) lo devolvió al repo con su propio PR. Resultado: main con DOS
  módulos (el viejo + el nuevo), y el siguiente deploy NO borraría el viejo
  (el rsync lo ve en el repo). **El orden correcto al renombrar/borrar un
  módulo: (1) PR que borra el viejo del repo, (2) merge, (3) deploy por Paco,
  (4) con `rsync --delete` prod pierde el viejo, (5) el Guardian deja de
  restaurarlo, (6) recién ahí crear el módulo con ese nombre libre.** Verificar
  que el nombre está libre en repo Y prod antes de usarlo.
- **Scope global vs per-proyecto** (no adivinar): skills/agentes/biblioteca/
  cantera/tools/eventos = GLOBALES; la cúpula de proyecto y el rail =
  POR PROYECTO.

## Estado del sistema (19-ago-2026) y referencia cruzada

- **CONSTRUIDAS**: `cupula-tools` (renombrada de cupula-eventos v0.2.0, PR #292
  — revierte el #291 duplicado; + `capacidad_dominio`) y `cupula-eventos`
  runtime v0.1.0 (PR #295 — contrato del bus, tolera manifest deforme).
- **CONSTRUIDA**: cúpula de APIs (`apis-publicas` v0.1.0, PR #296 — catálogo
  completo de **1671 APIs / 51 categorías** en `catalogo/completo.json`
  parseado de public-apis; tools `buscar_api` + `obtener_api`; semilla marcada
  semilla marcada en `prioritarias`; replicó el patrón canónico).
- **CONFIRMADO (19-ago)**: la cúpula de **conocimiento YA existe y funciona** —
  `bibliotecario` (cargado en prod, `bibliotecario.loaded {sectores:33,
  libros:417}`) con tools `bibliotecario.catalogo` + `bibliotecario.consultar`,
  leyendo `boveda/`. NO crearla otra vez; solo consultarla. La cúpula personal
  de skills del dueño se resolvió con la skill `enki-cupula-hermes` (la cúpula
  de Hermes: su conocimiento operativo de Enki, leído al arrancar de cada
  conversación — creada 19-ago).
- **Estado completo + coste de contexto por turno** (CLAUDE.md ~11.7K,
  catálogo ~10K, historial ~3.5K): ver `hermes-enki-integracion/references/
  mapa-cupulas-contexto.md`. Esta skill es el CÓMO; ese archivo es el QUÉ-ESTÁ.
- **Overlap informado**: esta skill (cómo construir/operar cúpulas) y
  `hermes-enki-integracion/references/mapa-cupulas-contexto.md` (estado del
  sistema) son complementarias, no duplicadas.
