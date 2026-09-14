---
name: escribir-skills
description: >-
  FASE 5 del proceso de proyecto (la empuja el orquestador proceso-negocio tras
  negocio.construido, por cada hoja/módulo del plan): escribe la SKILL.md FULL
  del módulo YA construido en la cantera. Lee modules/<slug>/module.json +
  index.js (la fuente de verdad, NO la documentación) y escribe
  modules/cosecha/cantera/enki/<slug>/SKILL.md con el formato canónico de
  skill FULL de vertical de hardware/taller (3D "the-pirate"): Qué hace el
  módulo · Contrato de eventos (subscribes/publishes EXACTOS de module.json,
  cruzados con lo que index.js realmente emite/escucha, marcando lo que
  module.json sub-declara con "Nota: no está en module.json pero sí lo emite
  index.js en ...") · Reglas de negocio (códigos HTTP EXACTOS, motivos de
  _failed literales, leyes de dominio real: cero estimación, moneda
  STL/GCODE, avisar-no-decidir, reconciliar-antes-de-crear) · Cómo se usa
  (RPCs con payloads request/response exactos) · Tests · Notas de
  implementación. La skill es PEDAGÓGICA: explica el qué y el porqué, no solo
  el cómo; siempre con payloads JSON exactos y errores documentados. Escribir
  con productor.skill (cantera), exigir el 201, verificar cada skill contra su
  module.json con el script determinista (node scripts/verificar-skill-modulo.js
  <slug> o el check python equivalente). MANDATO MECÁNICO: UNA hoja a la vez, en
  el orden del rail (estados.*, mismo rail de construcción que F4), sin saltar
  dependencias, verificar cada skill antes de seguir. Tras UN módulo:
  proceso-negocio.completar_fase { fase: 'skills' } → vuelve a F4 para la
  siguiente hoja. Al terminar todas: proceso-negocio.completar_fase {
  fase: 'completado' }. NO inventar eventos ni módulos: el contrato es el
  module.json + index.js reales.
fuente: enki
dominio: metodo
lente_dominio: escritura
lente_tarea: escribir_skill
tags: [fase5, skill, modulo, cantera, contrato, api_real, proceso, verificar]
---

# Escribir Skills — FASE 5 del proceso de proyecto

> **Qué es.** La skill que escribe la SKILL.md FULL de cada módulo YA construido
> (F4) en la cantera. Entra encadenada (la empuja `proceso-negocio` tras
> `negocio.construido`) — no a mano.
>
> Código: fase 5 de proceso · habilita `negocio.skills` (por pieza) y
> `negocio.completado` (fin).

---

## 1 · ENTRADA — lee el módulo construido (no preguntes)

**REGLA DIRECTIVA (innegociable)**: cuando esta skill entra **encadenada por el
orquestador**, el proceso YA decidió: toca escribir la skill del módulo. **NO
ofrezcas opciones**, no reordenes el plan, no redecidas formas. **EJECUTA.**

Lee la fuente de verdad del módulo (el que F4 construyó):

```
fs.read.request { path: 'modules/<slug>/module.json' }   → name, version, _doc, description,
                                                            subscribes (event+handler+description),
                                                            publishes (event+description),
                                                            ui_handlers, persistence.tools
fs.read.request { path: 'modules/<slug>/index.js' }      → proyecciones _op, handlers on<Op>Request,
                                                            helpers, fire-and-forget, códigos HTTP
```

**Regla**: la fuente de verdad es el código REAL, no la documentación ni el plan.
El `plan-construccion.md` (F3b) ya materializó el módulo; aquí se documenta lo que
EXISTE en disco, no se re-esquematiza.

**Regla de la forma**: un **CUSTODIO** (con store) lleva `project.activated` +
PosPersistencia; un **REFLEJO puro stateless** (consumo/importacion/buscador) NO;
un **PUENTE/CONVERSOR** es stateless sin persistir; un **ORQUESTADOR** lleva
máquina de estados y su diagrama de transiciones. La forma NO se adivina: se
lee de qué extiende el index.js (`ModuloHibridoReflejo` + PosPersistencia ⇒
custodio con store; sin PosPersistencia ⇒ stateless).

**Si el módulo no existe** (F4 no lo construyó) → no inventes: avísalo y espera
(sin módulo no hay skill).

## 2 · LA UNIDAD DE TRABAJO — UNA hoja a la vez (mismo rail que F4)

**MANDATO MECÁNICO**: el ciclo por pieza es de Paco — **una hoja a la vez**, en el
orden del rail de construcción (`estados.*`). Por cada hoja del plan:

```text
1. Lee la hoja del rail (slug) → el módulo construido (module.json + index.js)
2. Escribe la SKILL.md (formato canónico abajo) en
   modules/cosecha/cantera/enki/<slug>/SKILL.md con productor.skill
3. Exige el 201 del productor antes de afirmar éxito (sin 201 → no se cierra)
4. Verifica la skill contra su module.json (script determinista) — no creas al ojo
5. Completar_fase { fase: 'skills' } → vuelve a F4 para la siguiente hoja
```

**NUNCA** escribas varias skills en paralelo. **NUNCA** saltes una dependencia.
**NUNCA** escribas la skill REUTILIZA de un módulo que no se (re)construyó.

## 3 · EL FORMATO CANÓNICO (skill FULL de vertical de hardware/taller)

Escribir en `modules/cosecha/cantera/enki/<slug>/SKILL.md`:

```markdown
---
name: <slug>
description: >
  Skill FULL del módulo <TIPO> `<slug>` del proyecto 3D (moneda STL/GCODE).
  [qué hace en 1-2 líneas]. Úsala para operar, depurar o extender el <tipo>
  con ..., o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites <operar/consultar/...> ...
  - Cuando depures por qué ...
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio ...
  - Cuando vayas a escribir/ampliar el test unitario ...
tags: [enki, modulo, <tipo>, taller-3d, <slug>, proyecto-3d]
---

# <slug> — <TIPO> de la <zona> del taller 3D

## Qué hace el módulo
[parágrafo de qué es y por qué. El tipo decide la naturaleza: CUSTODIO=dueño del
 store + PosPersistencia (ruta real dir); REFLEJO=sin store o proyección pura;
 CONVERSOR=puerto de formato stateless; PUENTE=delega en transporte; ORQUESTADOR=
 máquina de estados en memoria.]

## Contrato de eventos (module.json real)
### Subscribes (RPCs request/response)   ← tabla | Evento | Handler | Descripción |
   incluir TODOS los .request + `project.activated` (solo CUSTODIO/REFLEJO con store)
### Publishes                            ← tabla | Evento | Descripción |
   incluir TODOS los .response + eventos de dominio + pares *.failed
> Regla de cierre de círculo: todo flujo responde su par *.failed canónico.

## Reglas de negocio
[1..7 reglas con los códigos HTTP EXACTOS, motivos de fallo literales
 ('sin_gramo_medido', 'bobina_no_encontrada', etc.), y las leyes del dominio real:
 CERO estimación sin dato medido, moneda STL/GCODE multi-formato,
 avisar-no-decidir umbrales, reconciliar antes de crear, CERO resultados
 inventados, etc.]

## Cómo se usa (RPCs)
[cada op: nombre, payload JSON request, respuesta 200/201/404/422/etc exacta,
 + qué evento emite. Verificar el payload real contra index.js, no inventarlo.]

## Tests
[qué cubre el test de tests/unit/<slug>.test.js + comando `node` de ejecución.]

## Notas de implementación
[clase extends ModuloHibridoReflejo, name/version, store Map, PosPersistencia
 file/dir reales, handlers _atender(e,accion,'<slug>.<accion>.response',fn)]
```

### Reglas de la skill (pedagógica, no dump mecánico)

- **La fuente de verdad es el código** (`index.js` + `module.json`), no la doc.
- **Siempre payloads JSON exactos** request/response + errores documentados.
- **Siempre un flujo típico** paso a paso.
- **El contrato es EXACTO y HONESTO**:
  - Copiar subscribes/publishes del `module.json` con el nombre `description`
    literal — NUNCA resumir, añadir ni colar eventos.
  - **Cruzar TODO el `index.js`**: si emite/escucha algo que module.json
    SUB-declara (pares `*.failed` genéricos en runtime, handlers fire-and-forget
    de transición como `onEstadoCrudo`/`onConfirmacionRecibida`, repintados),
    documentarlo con `> Nota: no está en module.json pero sí lo emite index.js
    en <línea/método>` — la skill es honesta, no "literal".
- **`project.activated`** solo en CUSTODIO/REFLEJO con store (NO en stateless).
- **5ª forma ORQUESTADOR**: añadir diagrama de estados/transiciones + invariante.
- **"Cómo se usa (RPCs)"** es el encabezado (consistencia del ecosistema).

## 4 · CÓMO SE PERSISTE — productor.skill + verificación determinista

La skill se escribe en la **CANTERA** con el productor (el fs del chat está
scopeado al storage del proyecto y no llega a `modules/`):

```jsonc
// escribir con productor.skill (single-writer, cantera cosecha/cantera/enki/)
{ "nombre": "<slug>", "markdown": "<contenido SKILL.md>" }
  → 201 = skill escrita y validada (frontmatter con name:)
```

**Exige el 201** antes de afirmar éxito — sin 201 no se cierra la pieza.

**Verificar CADA skill contra su module.json** (no te fíes del ojo), un script
determinista por slug:

```bash
node scripts/verificar-skill-modulo.js <slug>
#  o equivalente python:
python3 -c "import json;m=json.load(open('modules/<slug>/module.json')); \
  t=open('modules/cosecha/cantera/enki/<slug>/SKILL.md').read(); \
  print([e for e in [x['event'] for x in m['subscribes']+m['publishes']] if e not in t] or 'NINGUNO missing')"
```

Verifica: (1) frontmatter válido (name==slug + description/when-to-use/tags);
(2) TODOS los `subscribes[]`+`publishes[]` del module.json están mencionados;
(3) secciones canónicas presentes.

## 5 · CERRAR LA PIEZA

Tras UNA skill escrita y verificada:

```jsonc
proceso-negocio.completar_fase { fase: 'skills', resumen: { skills: ['<slug>'] } }
  → el orquestador vuelve a F4 (construir-modulos) para la siguiente hoja.
```

**Cuando NO queden hojas sin skill:**

```jsonc
proceso-negocio.completar_fase { fase: 'completado' } → fin del proceso.
```

## 6 · ERRORES A EVITAR (lecciones en vivo)

- ❌ **Inventar eventos** que module.json/index.js no tienen — el contrato es el código real. (Lección: skills que alucinan tools.)
- ❌ **Copiar module.json a ciegas sin cruzar index.js** — sub-declara pares *.failed genéricos y fire-and-forget reales. Cruza siempre.
- ❌ **Confundir cantera con arsenal** — la skill va en `cosecha/cantera/enki/<slug>/` (cantera global, se indexa por `cosecha` y se sirve por el bus); el chat además la quiere en su arsenal (`/home/hermes/.hermes/skills/enki/`) para que "le salga". Verifica ambas si el chat no la ve.
- ❌ **Escribir con fs.write** — el fs del chat está scopeado al storage; en la cantera se escribe con `productor.skill` o se cae en "success sin entregable".
- ❌ **Creer el informe ("skill escrita y verificada")** — el productor puede no haber persistido; verifica en disco + el 201 + el script determinista.
- ❌ **Acentos mal en la description** (prónostico→pronóstico) que rompen legibilidad sin romper YAML — revisar con el script.
- ❌ **Saltar dependencias o escribir varias a la vez** — UNA hoja, en orden del rail.
- ❌ **Escribir la skill de una hoja REUTILIZA** que no se construyó — el plan la marca, respétalo.

## 7 · VERIFICACIÓN (antes de declarar skills completada)

1. La skill `<slug>/SKILL.md` existe en la cantera (productor 201) + está en el arsenal si el chat la usa.
2. `node scripts/verificar-skill-modulo.js <slug>` → los eventos del module.json están TODOS (NINGUNO missing).
3. Frontmatter válido (name==slug) + secciones canónicas presentes (Qué hace · Contrato · Reglas · Cómo se usa · Tests · Notas).
4. Crucaste index.js: los pares *.failed y fire-and-forget sub-declarados están marcados con "> Nota: no está en module.json pero sí lo emite index.js".
5. Señal de fase enviada: `proceso-negocio.completar_fase { fase: 'skills' }` → 200 (no 409).
