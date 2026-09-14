---
name: construir-modulos
description: >-
  FASE 4 del proceso de proyecto (la empuja el orquestador proceso-negocio tras
  la FASE 3b, negocio.adaptado, y tras cada negocio.interfaz_construida / hoja del
  ciclo por pieza): ESQUEMATIZA y MATERIALIZA cada módulo del plan-construccion.md
  UNA hoja a la vez. Se divide en DOS MITADES que se encadenan por pieza:
  F4a ESQUEMATIZAR (prisma-universal hoja a hoja → produce UN esquema de
  construcción por módulo, esquemas/modulos/<slug>.construccion.json, que centra
  las dos caras que el código consume: module_json (name, subscribes, publishes,
  ui_handlers, persistencia/stateless) e index_js (clase, proyecciones _op con
  lógica, handlers RPC, fire-and-forget, base/requires)) y F4b CONSUMIR Y CREAR
  (el pipeline construir-modulos GENERA index.js + module.json rellenando FIEL
  al esquema, los escribe en modules/<slug>/, commitea y el JEFE verifica
  api_real + requires_resueltos + en_repo). MANDATO MECÁNICO: UNA hoja a la vez,
  en orden de dependencias de la espina, sin saltar, REUTILIZA salta / ADAPTA
  ajusta / CONSTRUYE esquematiza+crea. Verificar en disco, no creer al reporte.
  Tras UN módulo: proceso-negocio.completar_fase { fase: 'construido',
  resumen: { modulos: ['<slug>'] } } → empuja F5 (skill) por pieza. Al terminar
  todas las hojas: completar_fase { fase: 'completado' }.
fuente: enki
dominio: metodo
lente_dominio: construccion
lente_tarea: construir
tags: [fase4, construccion, modulo, plan, adaptador, esquematizar, crear, api_real, en_repo, proceso, prisma-universal]
---

# Construir Módulos — FASE 4 del proceso de proyecto (esquematiza → consume → crea)

> **Qué es.** La skill que CONSTRUYE los módulos del negocio según el plan de
> construcción (del ADAPTADOR F3b). Entra encadenada (la empuja `proceso-negocio`
> tras `negocio.adaptado` y tras cada `negocio.interfaz_construida` de hoja del
> ciclo por pieza) — no a mano.
>
> **El plan NO se inventa aquí**: viene de F3b. La fase 4 EJECUTA ese plano, y lo
> hace en DOS MITADES por cada hoja: primero **esquematizar el módulo** (F4a,
> prisma-universal), luego **consumir y crear** (F4b, el pipeline). Separar
> PENSAR de MATERIALIZAR — la misma separación que el proceso cosechó en F3
> (PLASMA) y F3b (adaptador).
>
> Código: fase 4 de proceso · habilita `negocio.construido` (por pieza) y
> `negocio.completado` (fin).

---

## 1 · ENTRADA — lee el plan del ADAPTADOR (no lo replantees)

**REGLA DIRECTIVA (innegociable)**: cuando esta skill entra **encadenada por el
orquestador**, el proceso YA decidió: toca construir. **NO ofrezcas opciones**,
no reordenes el plan, no redecidas formas. **EJECUTA** el plano tal cual.

Lee el plan de construcción (lo generó el adaptador F3b):

```
fs.read.request { path: 'esquemas/plan-construccion.md' }
  → el plano con las hojas y su decisión:
      - REUTILIZA: <módulo>          → YA existe — NO se construye
      - ADAPTA: <módulo> (cambio)    → se ajusta el módulo existente
      - CONSTRUYE: <slug> (FORMA)    → nuevo módulo — se esquematiza y crea
```

**Si el plan no existe** (el adaptador aún no lo generó) → no inventes: avísalo
y espera (sin plan no hay fase 4).

## 2 · LA UNIDAD DE TRABAJO — UNA hoja a la vez, en DOS mitades

**MANDATO MECÁNICO**: el ciclo por pieza es de Paco — **una hoja a la vez**, en el
orden de dependencias de la espina del plan. Por cada hoja CONSTRUIR:

```text
1. Lee la hoja del plan (slug + decisión + forma + contrato de la espina)
2. REUTILIZA → verifica que el módulo existe y salta (no construyas)
3. ADAPTA   → ajusta el módulo existente según el cambio indicado (esquematiza el ajuste si hace falta)
4. CONSTRUYE → 4a ESQUEMATIZAR + 4b CONSUMIR Y CREAR (abajo)
5. VERIFICA en disco (no creas al reporte): fs.list_modules / fs.read_module
   → modules/<slug>/index.js existe; el JEFE ya validó api_real + en_repo
```

**NUNCA** construyas dos hojas en paralelo. **NUNCA** saltes una dependencia.
**NUNCA** construyas una hoja REUTILIZA.

---

## 4a · ESQUEMATIZAR EL MÓDULO (prisma-universal, hoja a hoja)

> **Motor de esquematización = `prisma-universal`** (vía `delegate_task` o
> `cosecha.obtener`). Por CADA hoja CONSTRUIR, produce **UN esquema de
> construcción** que centra LO QUE module.json CONSUME y LO QUE index.js NECESITA
> — la coherencia entre las dos caras del módulo. La FORMA de la hoja (custodio /
> reflejo / puente / conversor / micro-agente) decide la plantilla (persistencia o
> stateless, base, handlers, fire-and-forget): cero adivinanza.

Pásale a prisma-universal las 3 variables, por cada hoja:

- **ENTRADA** = la hoja de la espina del plan (slug · forma · accion ·
  reutiliza · depende_de · subscribes · publishes · proyecciones_internas) + la
  sección §6 de esa hoja (7 etapas) + `patron/modulo-real.md` (el ADN).
- **ARCHIVO_FINAL** = `esquemas/modulos/<slug>.construccion.json`.
- **CÓMO** = ingeniero de construcción de módulos Enki (event-driven, islas) ·
  **PARA** = escribir el esquema que F4b consume para materializar `<slug>`.

**El esquema que produce (formato canónico):**

```jsonc
{
  "slug": "<slug>",
  "forma": "custodio",                  // custodio | reflejo | puente | conversor | micro-agente
  "base": "_shared/modulo-hibrido-reflejo",   // o base-module; = require resuelto
  "persistencia": {                      // custodio: SÍ; puente/conversor: null (stateless)
    "dir": "/3d/<slug>",
    "escribe": "<storage>/.../<slug>.json"
  },
  "project_activated": true,             // custodio con store: SÍ; stateless: false
  "module_json": {                        // LO QUE CONSUME module.json (+ ui_handlers si tiene interfaz)
    "name": "<slug>",
    "subscribes": [
      { "event": "<slug>.registrar.request", "handler": "onRegistrarRequest",
        "description": "…" }
    ],
    "publishes": [ { "event": "<slug>.algo_paso", "description": "…" } ],
    "ui_handlers": []                    // si F6 decidió interfaz: aquí van los handler on<Op>Request
  },
  "index_js": {                          // LO QUE NECESITA index.js
    "clase_extiende": "ModuloHibridoReflejo",
    "proyecciones": [
      { "nombre": "_registrar", "entrada": "…", "logica": "…",
        "evento_emite": "<slug>.algo_paso", "par_fallo": "<slug>.registrar.failed" }
    ],
    "handlers_rpc": [
      { "op": "registrar", "handler": "onRegistrarRequest",
        "response": "<slug>.registrar.response" }
    ],
    "fire_and_forget": [ "aviso.solicitar" ]   // eventos que consume sin response (si aplica)
  }
}
```

**Reglas del esquema (la coherencia que F4b exige):**
- **Todo handler RPC del `module_json.subscribes` existe en `index_js.handlers_rpc`**
  (mismo `op` → mismo `handler`) — el par es inseparable.
- **Todo `publishes` de `module_json` tiene su proyección que lo emite o su par de
  fallo** — nada prometido que no se produce.
- **`persistencia` y `project_activated` COINCIDEN con la forma**: custodio/reflejo
  con store → true + dir; puente/conversor/orquestador → null/stateless.
- **Los `require` del `index_js`** apuntan SOLO a `_shared/...` que existen
  (`requires_resueltos` lo verifica en disco tras crear).
- **`base` + `clase_extiende`** son los que el JEFE verifica con `api_real`.
- La forma de la hoja NO se negocia: viene del plan F2/F3b.

## 4b · CONSUMIR Y CREAR (el pipeline construir-modulos)

> **F4b NO esquematiza**: recibe el esquema `<slug>.construccion.json` (de 4a) y
> **rellena FIEL**. El fuzzy genera `index.js + module.json` copiando el contrato
> del esquema (subscribes/publishes exactos, handlers con el mismo nombre que las
> proyecciones, base/clase reales); el reflejo los escribe en `modules/<slug>/`;
> commitea; el JEFE verifica `api_real + requires_resueltos + en_repo + existe`.

Invoca el pipeline con la task = el **esquema de construcción** (no "la hoja"):

```jsonc
// task del pipeline construir-modulos (4b):
{ "slug": "<slug>",
  "esquema": "<contenido de esquemas/modulos/<slug>.construccion.json>" }
```

El pipeline:
1. **generar_codigo** (fuzzy): genera `{index.js, module.json, slug}` siguiendo el
   esquema — sin improvisar subscribes/publishes/handlers distintos de los que el
   esquema declara.
2. **escribir_modulo** (reflejo): escribe el par en `modules/<slug>/`.
3. **commitar_modulo** (reflejo): git commit (identidad `Enki Motor`).
4. **JEFE** verifica: `existe` + `api_real` (clase/base/_atender reales) +
   `requires_resueltos` (require → _shared existente) + `en_repo`.

**Si el JEFE rechaza** → NO "arregles el módulo a mano": es la señal de que el
esquema (4a) estaba mal. RETORNA a 4a, corrige el esquema (p. ej. un handler
sin su proyección, una base equivocada) y re-invoca 4b. El esquema es la fuente.

---

## 3 · LA FORMA según el patrón real (referencia de validación, NO plantilla)

El código lo genera 4b desde el esquema, pero el CHAT debe saber el patrón para
validar que lo que vino es correcto:

```jsonc
{
  "_doc": "…", "name": "<slug>", "version": "0.1.0",
  "description": "una línea",
  "subscribes": [ { "event": "<slug>.get.request", "handler": "onGetRequest",
                    "description": "…" } ],
  "publishes": [ { "event": "<slug>.algo_paso", "description": "…" } ]
}
```

`index.js` sigue la base que el esquema declaró (`_shared/modulo-hibrido-reflejo`)
y los pitfalls de forma que ya cosechamos (custodio con PosPersistencia +
`project.activated`; puente/conversor stateless sin persistir; orquestador con
máquina de estados en memoria). Para el detalle de cada forma ver la skill de
cúpula `enki-construir-modulo`.

## 4 · CERRAR LA PIEZA — y seguir con F5 por módulo

Tras construir UN módulo, cierra el ciclo por pieza:

```jsonc
proceso-negocio.completar_fase { fase: 'construido', resumen: { modulos: ['<slug>'] } }
  → el orquestador empuja FASE 5 (escribir-skills) para ESE módulo, y luego
    vuelve a esta skill para la siguiente hoja.
```

**Cuando NO queden hojas sin construir:**

```jsonc
proceso-negocio.completar_fase { fase: 'completado' } → fin del proceso.
```

## 5 · ERRORES A EVITAR (lecciones en vivo)

- ❌ **Construir hojas REUTILIZA** — el plan ya decidió que existen; construirlas de nuevo es re-inventar.
- ❌ **Saltarte el paso 4a (esquematizar)** — el módulo se improvisa sin anatomía (la lección de F6/F7: nunca construir sin esquematizar primero). El esquema `<slug>.construccion.json` es lo que hace que module.json e index.js sean coherentes.
- ❌ **Generar subscribes/publishes distintos del esquema en 4b** — si el esquema dice X, el código lleva X; cambiarlo rompe el resto de hojas que ya lo esperan del bus.
- ❌ **Construir de memoria** — el patrón real vive en `architectura/cabecera/patron/modulo-real.md`; si lo que vino no lo sigue, el JEFE lo rechaza con `api_real`. No lo aceptes a mano.
- ❌ **Creer el reporte del pipeline** — verifica en disco con `fs.list_modules`/`fs.read_module` que `modules/<slug>/` existe.
- ❌ **"No escribió nada" cuando escribió en `/opt/enki/modules/`** — el fs del chat está scopeado al storage del proyecto; usa las tools de solo lectura para VER.
- ❌ **Saltar el orden de dependencias** — el plan tiene etapas; construir fuera de orden rompe los contratos.
- ❌ **Construir varias hojas a la vez** — UNA a la vez, siempre (ciclo por pieza).
- ❌ **Arreglar el módulo a mano cuando el JEFE lo rechaza** — corrige el ESQUEMA (4a) y re-consume (4b); el esquema es la fuente de verdad.

## 6 · VERIFICACIÓN (antes de declarar construido)

1. El esquema `<slug>.construccion.json` existe (4a) y centra module_json + index_js.
2. Todo handler RPC del esquema tiene su proyección; todo publishes tiene su emisor/par.
3. El JEFE validó `api_real` + `requires_resueltos` + `en_repo` (bitácora del pipeline 4b).
4. `modules/<slug>/module.json` + `index.js` existen (fs.list_modules) y `require` no lanza.
5. El plan de construcción marca la hoja como construida.
