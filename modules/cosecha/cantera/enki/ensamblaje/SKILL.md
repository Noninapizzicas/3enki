---
name: ensamblaje
description: "FASE 7b del proceso de proyecto: INTEGRA el módulo recién construido en el ecosistema vivo del repo. Lee TODOS los manifests reales (modules/*/module.json), empareja lo que el módulo nuevo necesita oír con los eventos que el bus ya emite, y ESCRIBE los subscribes faltantes en el manifest del módulo nuevo más los handlers esqueleto en su index.js. Nunca toca módulos viejos. Patrón agente-perspectiva-c: reflejo determinista para leer/escribir, LLM solo para el matching semántico intención↔evento."
when-to-use: "Entra encadenada por proceso-negocio al terminar el ciclo F4→F5→F6→F6½→F7 de UNA hoja — una sola pieza nueva por pasada. También a mano cuando añades un módulo al repo y quieres que se enchufe al bus vivo sin recorrer manifests a ojo. Sirve para cualquier vertical construida con el proceso."
fuente: enki
dominio: proceso
lente_dominio: orquestacion
lente_tarea: integrar
tags: [fase7b, ensamblaje, integracion, proceso-negocio, eventos, event-driven, bus-vivo, canon, agente-perspectiva-c, hoja-por-hoja]
---

# Ensamblaje — FASE 7b del proceso de proyecto

> El eslabón que **integra** cada hoja nueva en el bus vivo: la encuentra con
> todo lo que el repo ya publica y le cose las orejas que le hagan falta. El
> módulo recién construido entra al ecosistema **sabiendo oír**; los módulos
> viejos no se enteran y no se tocan.
>
> F0 identidad → F2 esquematizar → F3 planificar → F3b adaptador → F4 construir
> → F5 skills → F6/F6½/F7 interfaz → **F7b INTEGRAR** → F8 verificar.
>
> Código: `modules/proceso-negocio/ensamblaje.js` (el integrador) · fase del
> orquestador: `negocio.ensamblado` · habilita el paso a F8.

---

## 1 · El principio event-driven, intacto

> **Publique quien publique, oiga quien oiga.**

El bus de Enki es desacoplamiento total: un emisor no sabe si hay oyentes; un
consumidor no sabe quién publica. F7b **vive dentro de ese principio**:

- Un `publishes` sin oyentes HOY es **futuro abierto**, no deuda. (El módulo
  `puertas` publicó `puertas.abierta` durante tres meses sin oyente; el día que
  nació `control-puertas`, se suscribió — `puertas` ni se enteró.)
- Un `subscribes` sin emisores conocidos HOY es **oreja esperando**. Legítimo.
- El dominio **crece añadiendo manifests nuevos**, nunca modificando los viejos.

F7b **no es un juez** del ecosistema. **Es el integrador** del módulo nuevo:
descubre qué eventos vivos del bus le aportan lo que su lógica necesita y le
añade esas suscripciones.

## 2 · Qué toca · qué nunca toca

```
TOCA (y escribe en disco):
  · modules/<hoja_nueva>/module.json   — añade subscribes faltantes
  · modules/<hoja_nueva>/index.js      — añade handlers esqueleto

NUNCA TOCA:
  · ningún módulo viejo, bajo ninguna circunstancia
  · config.json, enabled[], el loader — F7b no activa ni apaga
  · los manifests de las otras hojas nuevas de la misma vertical salvo
    la que está integrando AHORA (una hoja por pasada)
```

Regla única e innegociable: **F7b sólo escribe en la hoja que acaba de nacer en
este ciclo**. El resto es lectura.

## 3 · El patrón — agente-perspectiva-c

Determinismo (cargar/guardar) en el reflejo JS; chispa fuzzy (matching
semántico) en el LLM. Es el patrón de la cabecera:

```
REFLEJO JS (determinista):
  1. HIDRATAR   — leer todos los manifests del repo + el manifest y el index.js
                   del módulo nuevo + su descripción + sus handlers existentes
  2. AGRUPAR    — presentar los eventos vivos del bus por <dominio>.<objeto>
                   con quién los publica (para contexto, no para acoplar)
  3. PERSISTIR  — tras la decisión del LLM, escribir subscribes al manifest
                   y handlers esqueleto al index.js del módulo nuevo

LLM (fuzzy — una única pregunta pura):
  entrada:  el módulo nuevo (lo que es + lo que hace) + el mapa de eventos vivos
  salida:   lista de eventos que necesita suscribir, con handler propuesto
  nada más — no lee, no escribe, no decide dónde guardar: SOLO decide el match
```

El LLM es una **función pura** sin herramientas; el reflejo lo rodea de
determinismo. Si el LLM se cuelga o devuelve una lista vacía, el reflejo
persiste lo que tenga y lo deja nombrado — jamás falsea un cosido.

## 4 · Cuándo corre y qué dispara

```
proceso-negocio.completar_fase { fase: "interfaz_construida" }
   → siguiente hoja en el plan — y, antes de dar la hoja por cerrada,
     se dispara F7b sobre esa misma hoja
   → F7b la integra en el bus vivo
   → al terminar: proceso-negocio marca negocio.ensamblado para esta hoja
```

**Granularidad: UNA hoja por pasada.** F7b se ejecuta hoja a hoja, dentro del
mismo ciclo por pieza que ya conduce proceso-negocio. No espera a que la
vertical entera esté construida. Esto es importante: cada hoja nueva se
incorpora al ecosistema vivo que ya contiene las hojas construidas antes de
ella — el ecosistema crece paso a paso, como el repo real.

## 5 · El flujo exacto — CONTRATO → LEER → PENSAR → GUARDAR → EMITIR

### 5.1 · CONTRATO (invariante antes de nada)

```
entrada:
  slug_nuevo : string  — la hoja recién construida en este ciclo

INVARIANTE:
  modules/<slug_nuevo>/module.json  EXISTE (F4 lo escribió)
  modules/<slug_nuevo>/index.js     EXISTE (F4 lo escribió)
  si falta cualquiera → 409 FASE_INCOMPLETA (no es trabajo de F7b crearlos)
```

### 5.2 · LEER (reflejo determinista)

```
# ecosistema vivo
manifests_vivos ← leer todos los modules/*/module.json del repo
                   (excluye el propio slug_nuevo)

# para cada manifest: extraer publishes y subscribes normalizados
eventos_bus ← {
  <evento> : {
    publicado_por : [<slug>, …]   # emisores vivos
    escuchado_por : [<slug>, …]   # oyentes vivos
  }
}

# el módulo nuevo
manifest_nuevo ← leer modules/<slug_nuevo>/module.json
index_nuevo   ← leer modules/<slug_nuevo>/index.js
descripcion   ← manifest_nuevo.description + manifest_nuevo._doc
handlers_ya   ← nombres de handlers que ya existen en index.js
subscribes_ya ← manifest_nuevo.subscribes[].event
publishes_ya  ← manifest_nuevo.publishes[].event
```

### 5.3 · PENSAR (LLM — matching puro)

El reflejo construye UNA pregunta cerrada y la delega al LLM:

```
pregunta_al_LLM:
  "Este módulo recién construido:
     slug        : <slug_nuevo>
     descripcion : <description + _doc>
     publica     : <publishes_ya>
     ya escucha  : <subscribes_ya>

   El ecosistema vivo del bus emite estos eventos (agrupados por dominio.objeto):
     puertas.* :
       - puertas.abierta       (publicado por: puertas)
       - puertas.cerrada       (publicado por: puertas)
     carta.* :
       - carta.actualizada     (publicado por: carta-manager)
       …

   Devuelve SOLO los eventos vivos del bus que este módulo necesita suscribir
   para hacer bien su trabajo según su descripción, en este JSON:
     { subscribes_a_anadir: [
         { event: '<nombre>', handler: 'on<CamelCase>' },
         …
     ] }
   Si no necesita suscribir ninguno, devuelve lista vacía."

salida_LLM:
  { subscribes_a_anadir: [ { event, handler }, … ] }
```

Reglas que el reflejo impone sobre la salida del LLM:

- **El evento debe existir en `eventos_bus`** (si no, se descarta — F7b no
  inventa oyentes de voces que no están).
- **No duplicar lo que ya escucha** (se descartan los que ya están en
  `subscribes_ya`).
- **El handler nace del evento, por canon**:
  `handler = 'on' + CamelCase(ultimo_segmento_del_evento)`
  Ejemplo: `puertas.abierta` → `onAbierta`; `carta.actualizada` → `onActualizada`.
  Si el LLM propuso otro nombre más semántico y no colisiona con `handlers_ya`,
  se respeta.

### 5.4 · GUARDAR (reflejo determinista)

Dos escrituras, ambas en el **módulo nuevo**:

**A. Al `module.json`** — añadir cada subscribe aprobado:

```json
"subscribes": [
  …los existentes…,
  {
    "event": "puertas.abierta",
    "handler": "onAbierta",
    "description": "Integrado por F7b el <ISO date>: evento vivo del bus (publicado por 'puertas')."
  }
]
```

**B. Al `index.js`** — añadir cada handler esqueleto que no exista aún:

```js
/**
 * Handler para 'puertas.abierta' — integrado por F7b el <ISO date>.
 *
 * El evento llega del módulo 'puertas' (emisor vivo del bus).
 * TODO (lógica de dominio): usar el payload { … } según necesite <slug_nuevo>.
 * El esqueleto NO ES una decisión de dominio — es el enganche al bus.
 * Al rellenarlo, respeta el principio event-driven: no acoplar al emisor.
 */
on<CamelCase>(e) {
  const d = (e && (e.data || e)) || {};
  // intencionalmente mínimo: F7b garantiza el ENCHUFE al bus,
  // no la lógica interna del módulo. Esa la escribe el humano.
  return d;
}
```

El esqueleto se inyecta **dentro de la clase del módulo**, en el sitio
sintácticamente seguro (al final de la clase, antes del cierre). El reflejo lee
el AST o el índice de llaves balanceadas para no romper el fichero.

**Si cualquier escritura falla**, F7b retrocede: deja `module.json` y `index.js`
como estaban antes del intento, no cierra la fase, y responde 409 con el motivo.

### 5.5 · EMITIR

Al terminar correctamente, F7b emite al bus:

```
nichos.hoja.integrada    (fire-and-forget)
  payload: {
    slug             : <slug_nuevo>,
    subscribes_añadidos : [ 'puertas.abierta', 'puertas.cerrada', … ],
    handlers_creados    : [ 'onAbierta', 'onCerrada', … ],
    integrado_el        : <ISO date>
  }
```

Y persiste el informe de esta integración en:

```
proceso-negocio/fase7b-ensamblaje.json
  (incremental: una entrada por hoja integrada; no se sobrescribe)
```

Formato del informe:

```json
{
  "integraciones": [
    {
      "slug": "control-puertas",
      "subscribes_añadidos": [ { "event":"puertas.abierta",  "handler":"onAbierta"  },
                                { "event":"puertas.cerrada", "handler":"onCerrada" } ],
      "handlers_creados":   [ "onAbierta", "onCerrada" ],
      "integrado_el": "2026-10-03T…"
    },
    …
  ]
}
```

## 6 · El ejemplo testigo — control-puertas

```
estado previo del repo (hace meses):
  modules/puertas/module.json
    publishes:  ["puertas.abierta", "puertas.cerrada"]
    subscribes: []
  → ha publicado sin oyentes 3 meses. Legítimo.

hoy — proceso-negocio integra la hoja nueva control-puertas:

  F3b escribe el plan para control-puertas (no conoce todo el repo):
    publishes:  ["control-puertas.apertura.solicitada",
                 "control-puertas.cierre.solicitado"]
    subscribes: []
    description: "Decide abrir o cerrar puertas según el estado actual del edificio"

  F4 construye modules/control-puertas/{module.json, index.js}.

  F7b entra sobre control-puertas:

    LEER:
      ecosistema vivo incluye puertas.abierta y puertas.cerrada
      (publicados por 'puertas')

    PENSAR (LLM):
      "control-puertas 'decide abrir/cerrar según estado actual' → necesita
       saber qué puertas están abiertas → suscribe puertas.abierta y
       puertas.cerrada."
      salida: subscribes_a_añadir = [
        { event: 'puertas.abierta', handler: 'onAbierta' },
        { event: 'puertas.cerrada', handler: 'onCerrada' }
      ]

    GUARDAR:
      → modules/control-puertas/module.json ahora tiene esos dos subscribes
      → modules/control-puertas/index.js ahora tiene onAbierta() y onCerrada()
        con esqueleto mínimo

    EMITIR:
      bus recibe nichos.hoja.integrada { slug: 'control-puertas', … }

  modules/puertas NO SE TOCA. Cero diff. Al próximo arranque, cuando
  'puertas' publique 'puertas.abierta', el bus lo entregará también a
  control-puertas.
```

## 7 · Qué NO hace F7b (dicho en positivo — lo que respeta)

> P0 autoejecutable: toda regla toma forma de Mandato. Lo que sigue son
> ESTADOS QUE PROTEGE la skill — los límites se expresan como lo que se
> construye.

- **Respeta el ecosistema vivo**: si un oyente nuevo propone un nombre que no
  casa con ninguna voz del bus, F7b lo descarta — nunca inventa un oyente para
  una voz inexistente.
- **Respeta a los módulos viejos**: F7b sólo escribe en la hoja recién nacida.
  Un desajuste nominal entre el nuevo y un viejo (`control-puertas` escribe
  `puertas.abiertas` plural y `puertas` emite `puertas.abierta` singular) se
  resuelve adaptando el NUEVO a lo que ya vive — el LLM elige la grafía viva.
- **Respeta la extensibilidad**: un `publishes` sin oyente del módulo nuevo
  queda como futuro abierto — no se "arregla" cableándolo a nada.
- **Respeta la honestidad del cosido**: si el LLM falla o la escritura rompe,
  F7b retrocede y marca la hoja no integrada — nunca certifica un cosido que
  no hizo.
- **Respeta la soberanía del humano**: el handler esqueleto NO decide dominio;
  es sólo el enganche al bus. El cuerpo de la lógica lo escribe el humano.

## 8 · Qué publica F7b al bus (su propio contrato)

```
publishes:
  nichos.hoja.integrada                 — fire-and-forget al integrar OK
  nichos.hoja.integrar.failed           — par de fallo si el cosido no se pudo
                                          persistir (RPC caído, escritura rota,
                                          index.js imparseable)

subscribes:
  (F7b no se suscribe a nada — es un acto puntual conducido por el orquestador)
```

Un oyente natural de `nichos.hoja.integrada` será `proceso-negocio` cuando
decida avanzar a la siguiente hoja; pero F7b no sabe nada de ello — publica y
sigue.

## 9 · Comportamiento ante fallos (fail-SAFE, nunca fail-open)

Doctrina del cimiento: `success = ENTREGABLE VERIFICADO`.

| Situación | Resultado |
|---|---|
| Alguno de los `modules/<slug>/{module.json,index.js}` no existe | **409 FASE_INCOMPLETA** |
| `fs.read` del ecosistema cae | **409** (no se integra a oscuras) |
| El LLM no responde o se cuelga | **409** (no se cose a ciegas) |
| El LLM propone un evento que no está en el bus vivo | se descarta esa entrada; sigue con las válidas |
| La escritura al `module.json` falla | retrocede, `module.json` queda como estaba, **409** |
| La inyección en `index.js` rompe el parseo | retrocede, `index.js` queda como estaba, **409** |
| Todo bien pero el informe `fase7b-ensamblaje.json` no persiste | el cosido ya está hecho; se emite `.integrada`; el informe es best-effort |

El motivo del fallo queda legible en el payload de `nichos.hoja.integrar.failed`
y en el log. **No se cierra la fase sobre un cosido no verificado.**

## 10 · Por qué F7b (y no otro sitio)

- **No es F3b**: F3b no conoce el ecosistema vivo (y no debe). F3b diseña el
  módulo nuevo con su mejor intención; F7b lo enchufa al bus que exista cuando
  nace.
- **No es F4**: F4 construye la isla. No sabe ni tiene por qué saber a quién va
  a oír — porque todavía no se ha decidido en qué repo va a vivir.
- **No es F8**: F8 verifica que todo CARGA y FUNCIONA. F7b es el paso previo:
  deja los enchufes puestos para que F8 pueda verificar que la corriente pasa.

## 11 · Anti-patrones (lo que esta skill NO es)

- **No es un juez con veredicto `ensamblado:true|false` global**: integra o no
  integra UNA hoja; el ecosistema entero no se mide, se habita.
- **No es un detector de "publishes sin oyente"**: eso es futuro abierto, no
  deuda. (El módulo `puertas` que publicó tres meses sin oyente no era defecto;
  era espera.)
- **No es un reescritor de módulos viejos**: jamás los toca.
- **No es un cronista pasivo**: el F7b anterior leía y reportaba. Este COSE y
  deja el módulo nuevo vivo en el bus.

## 12 · Verificación

Cubre, al menos:

- **Caso puertas / control-puertas** (el testigo): la hoja nueva nace sin
  subscribes y queda con los dos del ecosistema vivo, su index.js tiene los
  handlers esqueleto, modules/puertas no se toca.
- **LLM devuelve vacío**: no se añaden subscribes, no se tocan los ficheros, se
  emite `.integrada` con listas vacías.
- **LLM propone un evento inexistente**: se descarta esa entrada, sigue con las
  válidas.
- **Escritura al module.json falla**: retrocede, `.failed`, módulo queda como
  estaba.
- **Inyección al index.js que rompe sintaxis**: retrocede, `.failed`.
- **Hoja nueva ya tiene algún subscribe que el LLM propone**: no se duplica.
- **Un emisor vivo y un oyente nuevo con el mismo canon de nombrado**: cosido
  limpio.
