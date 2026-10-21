---
name: enki-adaptador-disenos
description: >-
  Adaptar un diseño externo al sistema Enki (fase 3b): traducir el diseño OOP a
  módulos-isla event-driven aplicando el CANON de nombrado y los 4 patrones
  (CUSTODIO · PROYECTOR · PULSO · RPC), mapear cada entidad contra el inventario
  real de módulos (REUTILIZAR/ADAPTAR/CONSTRUIR), y escribir
  storage/esquemas/plan-construccion.md con la espina enki-plan embebida.
  Dispara cuando exista storage/esquemas/diseno-oop.md y haya que producir
  storage/esquemas/plan-construccion.md. F3b DISEÑA los manifests con su mejor
  intención; F7b (ensamblaje) los integrará después en el bus vivo. Event-driven
  puro: publique quien publique, oiga quien oiga.
fuente: enki
dominio: sistema/enki
lente_dominio: adaptador
lente_tarea: traducir
tags: [enki, adaptador, fase-3b, plan-construccion, enki-plan, modulos-isla, event-driven, canon, cuatro-patrones]
---

# enki · adaptador de diseños (fase 3b → plan-construccion.md)

> **Qué es.** El puente que trae el diseño OOP de la FASE 3 al sistema Enki
> real: traduce CLASES a módulos-isla event-driven aplicando el canon de
> nombrado y los 4 patrones, mapea contra el inventario vivo de `modules/` y
> escribe el plano de acoplamiento `storage/esquemas/plan-construccion.md` con
> la espina `enki-plan` (JSON embebido) que consume la fase 4
> `construir-modulos`.
>
> **Donde encaja.** F3b DISEÑA los manifests con intención y canon. F7b
> (`ensamblaje`) los INTEGRA después en el bus vivo: cuando cada hoja nace,
> F7b descubre qué eventos vivos del repo necesita suscribir y le añade esas
> orejas. F3b no se preocupa de conocer todo el ecosistema; eso lo hace F7b.

---

## Filosofía event-driven que esta skill respeta

> **Publique quien publique, oiga quien oiga.**

- El bus es desacoplamiento total. Un emisor no sabe quién le escucha. Un
  consumidor no sabe quién publica.
- **Un `publishes` sin oyente HOY es futuro abierto**, no deuda. Un módulo
  puede publicar durante meses sin oyente, y el día que nazca otro módulo que
  lo necesite, se suscribirá — el emisor ni se entera.
- **Un `subscribes` sin emisor conocido HOY es oreja esperando.** Legítimo.
- El dominio **crece añadiendo manifests**, nunca modificando los viejos.
- La única verdad del dominio **vive en los `module.json` reales**. No hay
  catálogo central; los módulos se citan al bus por el nombre canónico.

## Entradas (leer SIEMPRE, nunca de memoria)

1. `storage/esquemas/diseno-oop.md` — FASE 3: invariantes/mandatos, entidades
   y value objects, clases con composición, contratos JSON, máquina de estados,
   flujos, edge cases.
2. `storage/esquemas/esquema.md` — FASE 2: identidad, piezas con su FORMA
   (micro-agente · custodio · reflejo · conversor · puente · interfaz), puertos.
3. **El CANON de nombrado del repo** (abajo, sección «Canon»).
4. Patrones vivos: `arquitectura/cabecera/patron/modulo-real.md` y
   `arquitectura/cabecera/patron/modulo-hibrido.md`.
5. Inventario REAL de módulos (nunca de memoria):
   `find modules -maxdepth 3 -name module.json` y leer `name/description/
   publishes/subscribes` de los candidatos a REUTILIZAR/ADAPTAR.

---

## CANON de nombrado (lo lleva dentro la skill, se cita en cada manifest)

El canon convierte la intención del diseño en nombres de evento consistentes
entre todos los módulos del vertical. Nombra una vez; cualquiera que mañana
quiera participar en ese flujo usa el mismo nombre sin consultar a nadie.

```
FORMA DEL NOMBRE
  <dominio>.<objeto>.<verbo>[.<modo>]

  dominio : slug del vertical en minúscula (ej. 'nichos', 'pizzepos', 'puertas')
            o 'core' / 'proceso' para infra transversal.
  objeto  : sustantivo singular en minúscula (ej. 'semilla', 'ciclo',
            'capacidad', 'puerta').
  verbo   : en participio pasado para PULSOS (fire-and-forget) · en infinitivo
            para RPC (request/response). No mezclar en un mismo flujo.

FAMILIAS DEL CANON
  PULSO (fire-and-forget):
     <dominio>.<objeto>.<participio>
     ej. 'puertas.abierta', 'carta.actualizada', 'nichos.pipeline.ciclo.iniciado'

  RPC (par cerrado):
     <dominio>.<objeto>.<infinitivo>.request
     <dominio>.<objeto>.<infinitivo>.response
     <dominio>.<objeto>.<infinitivo>.failed
     ej. 'nichos.capacidad.consultar.request/response/failed'

  FALLO (par del PULSO si procede):
     <dominio>.<objeto>.<verbo>.failed   (único sufijo de error)

SEPARADOR
  Siempre PUNTO entre segmentos. Nunca guion bajo entre segmentos.
  ✓ nichos.pipeline.ciclo.iniciado
  ✗ nichos.pipeline.ciclo_iniciado
  Dentro de UN segmento vale guion-medio (slug canónico): 'control-puertas'.

ASCII
  Transliterar tildes/ñ en nombres de evento: añadir→anadir, señales→senales.
  (El payload sí puede tener acentos.)

IDEMPOTENCIA
  Cada RPC lleva correlation_id (QoS1 + unicidad por correlation_id en el handler).
```

### Pregunta madre a aplicar al nombrar

> ¿Qué estado deseado cuenta este evento al bus?

- Si cuenta un hecho ocurrido → PULSO en participio (`puertas.abierta`).
- Si pide algo y espera respuesta → RPC infinitivo
  (`nichos.capacidad.consultar.request`).
- Si falla algo → mismo nombre + `.failed`.

El canon no es ritualismo: es la condición para que mañana un módulo nuevo
pueda enchufarse al bus sin consultar código. Si nombras bien, F7b hace el
resto.

---

## Los 4 patrones de FORMA event-driven

Cada clase del diseño OOP se traduce a UNA forma. La forma manda sobre la
descripción.

### CUSTODIO · single-writer de un agregado

```
rol:        posee un dato de dominio y es el ÚNICO que escribe sobre él.
estado:     sí (PosPersistencia por proyecto).
publica:    <dominio>.<objeto>.actualizada / .editada / .borrada
            + sus .failed si procede.
escucha:    sus propios RPC .request + eventos de dominio que mutan su estado
            + project.activated (para hidratar PosPersistencia).
ejemplo:    pizzepos/carta-manager · nichos/pipeline-por-nicho.
```

### PROYECTOR · sin estado, al vuelo

```
rol:        lee de UN custodio ajeno vía RPC y transforma al vuelo.
estado:     NO guarda nada (persistence.type: 'none').
publica:    señal de refresco <dominio>.<objeto>.actualizada
            + sus RPC .request a los custodios de los que lee.
escucha:    los pulsos del custodio del que proyecta
            + project.activated para cachear base_path.
ejemplo:    pizzepos/productos v5 (proyecta carta-manager).
```

### PULSO · fire-and-forget

```
rol:        publica un hecho ocurrido al bus.
nombre:     <dominio>.<objeto>.<participio>
par .failed: cuando aplique.
ejemplo:    puertas.abierta · carta.actualizada · nichos.pipeline.ciclo.iniciado.
```

### RPC · request / response / failed

```
rol:        pedir algo a otro módulo y esperar respuesta correlacionada.
contrato:   terna cerrada { request, response, failed }.
correlacion: correlation_id en todas tres.
el ATENDEDOR del request DECLARA la terna completa en SU manifest
(subscribes el .request; publishes el .response y el .failed).
el EMISOR del request lo declara en SU publishes (y escucha .response/.failed
si necesita el resultado — o no, si es fire-and-forget con confirmación lateral).
ejemplo:    carta.get.request/response · nichos.capacidad.consultar.request/response/failed.
```

### Dependencia entre clases = evento del canon

El diseño OOP dice "la clase A depende de la clase B". **En Enki esto se
expresa como un evento del canon, no como un campo `depende_de` suelto:**

```
A necesita un dato de B → A publica <dominio>.<objeto>.<leer>.request
                           B atiende y responde <dominio>.<objeto>.<leer>.response

A reacciona a un hecho de B → A escucha el PULSO que B publica
```

Ningún módulo nombra a otro módulo en su manifest. Nombran EVENTOS.

---

## Tabla de traducción OOP → forma Enki

| Clase del diseño OOP | Forma Enki |
|---|---|
| CLASE con estado | **CUSTODIO** (single-writer de su store, PosPersistencia) |
| CLASE que solo calcula | **PROYECCIÓN INTERNA** dentro del módulo que la usa |
| CLASE que lee de otra y transforma | **PROYECTOR** sin estado sobre esa otra |
| CLASE que orquesta un ciclo | **MICRO-AGENTE / ORQUESTADOR** |
| CLASE que habla con el exterior | **PUENTE** |
| Lógica de negocio | DENTRO del módulo como proyección `_op` del reflejo |
| `_shared/` | SOLO infraestructura, nunca lógica de dominio |

- Formas válidas de hoja: `reflejo | custodio | conversor | puente | micro-agente | proyector`.
- Acciones de hoja: `CONSTRUIR | ADAPTAR | REUTILIZAR`.
- Cada CONSTRUIR justifica por qué no reutiliza lo existente.

---

## Pasos del proceso

1. **Leer inputs** (arriba). Anotar las piezas de F2 con su forma + los
   contratos del F3.
2. **Inventario**: listar manifests reales, volcar sus `publishes/subscribes`.
   Candidatos a REUTILIZAR se juzgan por su `module.json`, no por su nombre.
3. **Traducir** cada entidad del diseño OOP a su FORMA (tabla).
4. **Nombrar los eventos aplicando el CANON**. Un evento se decide UNA vez; se
   escribe igual en todos los manifests que lo citan.
5. **Expresar las dependencias como eventos**: si A depende de B para leer,
   escribir la terna RPC completa en el manifest de B (atendedor) y el
   `publishes` del `.request` + `subscribes` del `.response` en A (emisor).
6. **Hojas CONSTRUIR** con 7 etapas (plantilla abajo).
7. **Espina `enki-plan`** embebida y VALIDADA (JSON parseable, cada hoja con
   los 8 campos tipados, formas/acciones válidas, `orden` cubre todas las
   hojas).
8. **Escribir** `storage/esquemas/plan-construccion.md` y verificar
   (hash del response vs `sha256sum`, `find` de la ruta, re-leer cabecera).

> F3b escribe el plan con la mejor intención posible. **No tiene que conocer
> todo el ecosistema del repo** — eso es trabajo de F7b. Si una hoja olvida
> suscribirse a un evento vivo que necesita, F7b lo cose cuando la hoja nazca.

## Plantilla de hoja CONSTRUIR (7 etapas)

```
A. DEPENDENCIAS        — bases _shared y eventos (del CANON) que escucha/publica.
                         Sin require cruzado entre módulos de dominio.
B. MODULE.JSON         — manifest real con el canon aplicado:
                           name (SIN prefijo de vertical),
                           publishes[]  — eventos del canon que emite,
                           subscribes[] — eventos del canon que escucha +
                                           handler asociado (on<CamelCase>),
                           _doc           — descripción fiel.
C. INDEX.JS            — clase reflejo extends ModuloHibridoReflejo;
                         onUnload flush; project.activated + PosPersistencia
                         SOLO si persiste estado.
D. PROYECCIONES        — métodos puros _op(input) → {status, data}.
                         LA LÓGICA DE DOMINIO VIVE AQUÍ.
E. HANDLERS RPC        — on<Op>Request(e) {
                           return this._atender(e, '<op>',
                                                '<dominio>.<objeto>.<op>.response',
                                                d => this._<op>(d));
                         }
F. EVENTOS DE DOMINIO  — PULSOS fire-and-forget siguiendo el canon.
                         Si procede, par .failed con el mismo verbo.
VERIFICACIÓN           — ficheros en disco + smoke de eventos.
```

## Pitfalls

- **No inventar módulos**: el inventario está delante. Si un módulo existe con
  el patrón pero otro dominio, NO se ADAPTA (rompería su proyecto): se toma su
  patrón y se justifica el CONSTRUIR.
- **Revisar el `module.json` real del candidato**: la descripción puede
  prometer más que el contrato real. Un store global sin PosPersistencia no
  sirve per-proyecto.
- **Dos fuentes de la misma verdad = fantasmas**. Lección de pizzepos v5: si
  dos módulos guardan el mismo dato, aparecen 29 fantasmas al reiniciar. Un
  dato = UN custodio. El resto PROYECTA sobre él.
- **El plan existente puede ser de una iteración anterior**: los backups
  (`plan-construccion.pre-*.md`) lo atestiguan — regenerar contra el F3
  ACTUAL, no heredar el viejo.
- **`orden` de la espina**: las hojas REUTILIZAR preceden a sus consumidores;
  el orquestador se construye al final con contrato tolerante (RPC falla →
  ciclo fallido, no basura).
- **El éxito 200 de `fs.write` no prueba la ruta**: verificar siempre con
  `find`/`hash`.
- **Lógica de dominio en `_shared/` está prohibida**: `_shared/` solo lleva
  infraestructura (ModuloHibridoReflejo, PosPersistencia). Si una proyección
  se repite entre islas, se duplica localmente — 5 líneas en dos sitios es
  aceptado; abstraer prematuramente a `_shared/` crea acoplamiento oculto.

## Lo que NO hay que hacer (dicho en positivo — lo que se respeta)

- **Respeta el canon**: cada evento se escribe igual en todas partes porque el
  canon dicta la grafía. (Un `ciclo.iniciado` nunca se mezcla con un
  `ciclo_iniciado` — el canon elige una forma y se mantiene).
- **Respeta la autonomía del módulo**: ningún manifest nombra a otro módulo.
  Nombra EVENTOS. Los módulos se encuentran por el bus.
- **Respeta la extensibilidad**: un `publishes` sin oyente conocido hoy es
  legítimo. No se obliga a tener consumidor.
- **Respeta a F7b**: si una hoja olvida una suscripción, el F7b nuevo la
  coserá al nacer. F3b no tiene que conocer el ecosistema entero.
- **Respeta el single-writer**: cada agregado tiene UN custodio. El resto
  proyecta sobre él. Dos escritores del mismo dato = fantasmas.

## Verificación del entregable

- `plan-construccion.md` existe, ≥1200 chars, cabecera con proyecto + fuentes.
- Espina: `node -e` parsea el bloque ` ```json enki-plan ` sin error.
- Conteo de hojas por acción coincide con el reportado; `orden` ⊇ slugs del
  bloque.
- Hash del fichero en disco == hash del response del `fs.write`.
- Cada hoja CONSTRUIR tiene `publishes` y `subscribes` con nombres del canon
  (sin guion bajo entre segmentos, con familia correcta para su tipo).

## Qué pasa después (F7b lo cose)

Cuando cada hoja del plan se construya (F4), le dé su skill (F5) e interfaz
(F6/F6½/F7), el F7b `ensamblaje` entra automáticamente sobre esa hoja:

1. Lee todos los manifests vivos del repo (incluidos los que se acaban de
   construir antes que esta hoja).
2. Un LLM elige, según la descripción de la hoja, qué eventos del bus necesita
   oír.
3. El reflejo escribe esos subscribes al manifest de la hoja + handlers
   esqueleto en su `index.js`.
4. Jamás toca módulos viejos.

Por eso F3b puede escribir el plan con confianza: lo que olvide, F7b lo cose.
Y lo que decida bien (nombres canónicos, formas correctas) permite que F7b
cosa limpio sin falsos matches.
