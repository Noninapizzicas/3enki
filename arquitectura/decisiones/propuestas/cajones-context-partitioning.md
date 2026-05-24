# Cajones — context partitioning para blueprints

> **✅ Documento cerrado (2026-05-23).** El guion de implementacion descrito
> abajo se completo y mergeo a main en 3 PRs durante la sesion del 23 de
> mayo (PRs #186, #187, #188). Lo que era propuesta es ahora paradigma
> vivo del sistema.
>
> **Contrato canonico** (fuente de verdad, validable):
> [`arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json`](../_contratos/cajones-context-partitioning.contract.json) v1.0.0.
>
> **Validator**:
> [`arquitectura/decisiones/_validators/cajones-context-partitioning.validate.js`](../_validators/cajones-context-partitioning.validate.js) (8 cross-checks, wireado a `validate-all`).
>
> **Motor**:
> [`modules/conversacion/ai-gateway/index.js`](../../../modules/conversacion/ai-gateway/index.js): `_extractCajones`, `_rankCajones`, `_buildCajonesSystemPrompt`, `_buildPageGraph`, `_executeCajonTool`, `_executeNavTool`, handlers publicos `handlePageRelated`/`handleChatCambiarFoco`.
>
> **Estado**:
> - 10/10 blueprints del sistema con `cajones_enabled: true` (recetas, escandallo, viabilidad, tecnicas + 6 carta-*).
> - 52/52 tests POC2 verdes.
> - Validado en runtime real (deepseek): 0% cajones equivocados, reduccion 68% en system prompt (63 KB → 24 KB en recetas), foco dinamico funciona end-to-end (LLM invoca `chat.cambiar_foco` con recovery de `RESOURCE_NOT_FOUND`, evento `chat.foco.cambiado` publicado al bus, frontend listener registrado).
>
> **Las 8 decisiones abiertas se cerraron con las recomendaciones del propio doc:**
> 1. Persistencia → **A** (cierre auto al siguiente turno).
> 2. Aplicabilidad → **solo blueprints** en v1.
> 3. Quien abre el cajon → **LLM autonomo** (cero router externo).
> 4. Niveles de profundidad → **sin niveles** (catalogo plano).
> 5. Detector de foco → **A** (LLM autonomo, +1 turno latencia aceptable).
> 6. Ayuda UI al cambio de foco → **banner en chat** (transparencia, coste cero).
> 7. Archivadores/cajones anidados → **C** (plano en v1).
> 8. Almacenamiento fisico → **inline en blueprint hijo** (cero archivos nuevos).
>
> **Drift / deuda detectada durante el piloto** (no son de cajones, ortogonales):
> - Anti-patron `cajon.listar` redundante en T1 chitchat → **mitigado** en commit `645f43d` (regla operativa explicita en `_buildCajonesSystemPrompt`).
> - Blueprint `escandallo` y posibles otros usan `fs.read.request '/recetas.json'` directo en lugar de `publishAndWait('recetas.obtener.request', ...)`. Viola `no_explorar_estado_ajeno` de `llm-runtime-discipline`. Deuda preexistente del blueprint, no de cajones. Pendiente refactor.
> - `menu-generator` y otros modulos JS legacy (`comandero`, `cocina`, `pedidos`, ...) no tienen blueprint, asi que no son destinos validos para `chat.cambiar_foco` ni aparecen en `page.related`. Pendiente decidir si se marcan como "page navegable" con flag explicito en `module.json` para incluirlos en el grafo sin migrarlos a blueprint.
>
> **Trabajo pendiente del propio contrato** (no bloqueante):
> - Medicion de runtime continuada (tokens/turno, tasa de cajon equivocado, distraccion del LLM) durante 1-2 semanas de uso real.
> - Decidir layout de `RelatedPagesBar.svelte` en el AppShell (system-bar / panel apilable / flotante). Componente listo, montaje pendiente.
>
> Este documento se conserva como **registro historico** del diseno
> conversacional que produjo el contrato. La fuente de verdad operativa
> ahora es el contrato + el codigo. Cualquier evolucion del patron se
> hara bumpeando el contrato, no editando este documento.

---

> **Documento de retomar.** Escrito al final de la misma sesión que produjo
> `capa-unica-tools-via-plugins.md`. Captura el diseño del concepto "cajones"
> (context partitioning + lazy loading estilo buscador) para que la próxima
> conversación tenga todo el contexto.
>
> **NO se implementa todavía.** El consejo estratégico (sección 11) es:
> primero la capa única de tools, vivir 2-4 semanas con ella, después los
> cajones con datos reales de qué duele.

Fecha: 2026-05-19. **Ampliado 2026-05-22** con la sección 5.5 (foco dinámico
de conversación + barra lateral de destinos relacionados), que **suma** a lo
anterior sin restarlo. Lo que ya estaba decidido sigue decidido — la
ampliación añade un eje nuevo de UX/UI sobre el mismo motor.

Documento hermano: `capa-unica-tools-via-plugins.md`.

---

## 1 · Por qué existe este documento

El usuario observó en runtime real que el LLM ejecutando blueprints **se
distrae, pierde foco, inventa datos**. Diagnóstico técnico: el system prompt
del LLM carga el blueprint completo (padre + hijo + todas las operaciones)
de golpe — 400-900 líneas. Esto causa sobrecarga de contexto.

Acuñó la metáfora de los **cajones** para diseñar la solución. La metáfora
encaja con un patrón conocido (lazy context loading / search-style retrieval)
pero **aterrizada al mundo del usuario** (despensa, cocina, mise en place).

Este documento captura el diseño completo de la idea para implementarla
cuando llegue su momento.

**Cómo usar este documento en la próxima sesión:**
1. Lee este doc (~10 min).
2. Verifica que la capa única de tools ya está implementada y validada en
   uso real (ver `capa-unica-tools-via-plugins.md`).
3. Si la capa de tools NO está implementada, **párate aquí** y vuelve a ese
   documento primero.
4. Si SÍ está implementada, sigue el camino de implementación (sección 9).

---

## 2 · El problema que resuelven los cajones

### Estado actual de los blueprints (mayo 2026)

- 10 módulos blueprint-driven en producción (4 subsistema-recetario + 6 subsistema-carta).
- Cada vez que el LLM entra a una page (ej. `page_id=recetas`), ai-gateway
  carga el blueprint padre (~155 líneas) + el blueprint hijo del módulo
  (200-750 líneas) + el catálogo de todas las operaciones del módulo.
- El LLM ve **todo** desde el primer turno, incluso si el usuario solo va a
  invocar una operación.

### Consecuencias observadas

| Síntoma | Causa |
|---|---|
| LLM se distrae, ejecuta operaciones no pedidas | Ve catálogo entero, explora opciones |
| Sobrecarga de tokens proporcional al tamaño del blueprint | Padre + hijo + todas las operaciones cargadas en cada turno |
| LLM inventa datos para "completar" operaciones | Frustrado por el ruido contextual |
| Pseudocódigo de 13 operaciones (caso carta-manager) ocupa contexto sin necesidad | Aunque el usuario solo invoque "list" |

### Mitigaciones ya aplicadas

- **`llm-runtime-discipline.contract.json v1.0.0`** (mayo 2026): 10 principios
  canónicos en el system prompt que recuerdan al LLM cómo comportarse
  (enfoque una operación, no inventes datos, marcador de fuente, etc.).
- **Sube el suelo** del comportamiento del LLM, pero no elimina la
  sobrecarga estructural. La disciplina es "no te distraigas"; los cajones
  son "no tienes nada con qué distraerte".

---

## 3 · La metáfora del usuario (autoritativa)

> *"Una despensa con cajones. Cada cajón tiene una cosa específica. Cuando
> tengas que pensar en X, vete al cajón X, coge lo que necesitas, cuando
> termines vacía y llenamos de otro cajón. Si te toca otro cajón, busca el
> otro cajón, mira, coge lo que necesitas, cuando termines cierra el cajón
> y seguimos."*

Refinado durante la sesión con la metáfora de la **cocina con mise en place**:
el cocinero (LLM) tiene la encimera (contexto activo) limpia. Sabe dónde
está cada cajón de la nevera (catálogo de cajones). Cuando necesita pasta,
abre el cajón de pastas, coge, lleva a la encimera, lo usa, devuelve lo
que sobra al cajón, cierra. No carga toda la despensa en la encimera nunca.

---

## 4 · Arquitectura elegida: patrón Google Search

El modelo de Google es **literalmente** el patrón de los cajones aplicado a
la web. Comparten:

| Buscador (Google) | Sistema de cajones |
|---|---|
| Índice invertido precompilado | Catálogo de cajones (registro de qué existe + descripción breve) |
| Query del usuario | Necesidad del LLM en un turno |
| Retrieval (de millones a cientos) | LLM identifica qué cajón es relevante |
| Ranking por relevancia + señales | Recencia + page activo |
| Snippet (no contenido completo) | Descripción del cajón en el catálogo |
| Click en resultado | `cajon.abrir(nombre)` |
| Documento completo cargado | Contenido del cajón inyectado en el turno |
| Cierre de pestaña | Al siguiente turno, contenido descartado |

Lo que Google evita y los blueprints actuales NO evitan: **cargar el
contenido completo de todos los documentos antes de saber cuál se necesita**.

### Diagrama del flujo

```
SYSTEM PROMPT PRINCIPAL DEL LLM  (corto, permanente)
┌─────────────────────────────────────────────────────────┐
│  Catálogo de cajones disponibles:                        │
│  - recetas.crear       → Crear receta normalizando inputs │
│  - recetas.listar      → Ver recetas del proyecto         │
│  - escandallo.calcular → Calcular coste de receta         │
│  - carta.añadir        → Añadir producto a carta          │
│  - ... (N cajones, snippet de 1 línea cada uno)           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼  usuario invoca operación
┌─────────────────────────────────────────────────────────┐
│  LLM razona: "necesito el cajón X"                       │
│  Llama: cajon.abrir({nombre: "recetas.crear"})           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  ai-gateway lee blueprint, extrae la operación X          │
│  Devuelve pseudocódigo + reglas + errores posibles        │
│  Inyecta en el contexto del TURNO ACTUAL                  │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  LLM ejecuta el pseudocódigo (publishAndWait al bus)     │
│  Compone response al usuario                             │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼  siguiente turno
┌─────────────────────────────────────────────────────────┐
│  El contenido del cajón ya NO está en el contexto         │
│  Solo el catálogo permanece                              │
│  Si el LLM necesita otro cajón, lo abre                   │
└─────────────────────────────────────────────────────────┘
```

---

## 5 · Decisiones tomadas en esta sesión

Estas son **decisiones confirmadas por el usuario**, no opciones abiertas:

### 5.1 Construcción del catálogo: MIXTO

- **Auto-generado** desde los blueprints existentes: cada `operacion` del
  blueprint se vuelve un cajón con descripción derivada del campo `input`
  + 1 frase de qué hace.
- **Override opcional**: el blueprint puede declarar `cajon_descripcion`
  por operación para refinar lo que ve el LLM en el catálogo.
- Si no se sobreescribe, gana lo auto-generado. **Cero trabajo manual
  obligatorio** al migrar — los blueprints existentes generan su catálogo
  sin tocarse.

Ejemplo:
```json
// Blueprint actual (sin cambios)
{
  "operaciones": {
    "crear": {
      "input": "{ project_id, nombre, ingredientes?, ... }",
      "pseudocodigo": [...]
    }
  }
}

// Auto-generación del catálogo
"recetas.crear → Crear receta nueva con normalización de ingredientes en
                 lenguaje natural. Requiere: project_id, nombre."

// Override opcional (si el module quiere mejorar)
{
  "operaciones": {
    "crear": {
      "cajon_descripcion": "Crear receta nueva. Abre este cajón cuando el
                           usuario dicta o describe una receta para guardar.",
      "input": "...",
      "pseudocodigo": [...]
    }
  }
}
```

### 5.2 Ranking del catálogo: SIMPLE (recencia + page activo)

- **Cajones del `page_id` activo van primero** en el catálogo presentado al
  LLM. Si está en page=recetas, los cajones de recetas se listan arriba.
- **Cajones abiertos en los últimos N turnos suben** de posición. N a
  decidir (sugerencia: 3-5 turnos).
- **El resto** se ordena alfabéticamente o por dominio (irrelevante).
- **Cero modelo entrenado**, cero embeddings, cero similarity search.
  Implementación: ~30 líneas de JS.

### 5.3 Patrón arquitectónico: Google search-style

- Catálogo = índice precompilado.
- LLM razona = retrieval mental + ranking.
- `cajon.abrir(nombre)` = click en resultado.
- Contexto del turno = página cargada en navegador.
- Siguiente turno = nueva búsqueda con índice limpio.

### 5.4 Implementación: dos tools nuevas en ai-gateway

- `cajon.listar({zona?})` — devuelve catálogo de cajones disponibles
  (rankeado según contexto actual). Opcionalmente filtrar por zona/dominio.
- `cajon.abrir({nombre})` — devuelve contenido completo del cajón
  (pseudocódigo + reglas + errores posibles) para inyectar en el turno.

---

## 5.5 · Ampliación (2026-05-22): foco dinámico + barra lateral de destinos

### 5.5.1 Por qué se añade esto

Probando el sistema en uso real, el usuario detectó un patrón de **confusión
contextual**: está en `page=recetas` charlando del escandallo, y de repente
pregunta algo de `menu-generator` o de `viabilidad`. El LLM responde como si
siguiera en recetas (ve el catálogo de recetas), o ejecuta una operación que
no corresponde a la página activa. La página activa no acompaña a la
conversación.

La evolución natural de los cajones, ya que la metáfora es **espacial**, es
hacer que el sistema **siga al usuario espacialmente**:

1. **Cambio dinámico de página**: si la conversación claramente se mueve a
   otro dominio, la página activa se mueve con ella. El LLM detecta el
   cambio de foco y emite un evento que el frontend escucha para hacer
   `goto()`. El catálogo de cajones del nuevo `page_id` se recompone
   automáticamente.
2. **Barra lateral de destinos relacionados**: en todas las páginas con chat
   hay una barra lateral nueva que muestra **links** a otras páginas del
   sistema relacionadas con la activa. Permite al usuario navegar
   manualmente sin perder la conversación.

Las dos mecánicas son **complementarias**, no alternativas. Una es
automática (LLM detecta foco), la otra es manual (usuario clica un link).
Ambas comparten **el mismo grafo de relaciones** auto-construido.

### 5.5.2 Grafo de relaciones auto-construido desde blueprints

El sistema ya tiene la información necesaria gratis: cada blueprint hijo
contiene en su pseudocódigo referencias a otros módulos vía
`publishAndWait('<modulo>.<accion>.request', ...)`. Extrayendo esas
referencias se obtiene un grafo dirigido:

```
recetas        ← (consultado por) escandallo, menu-generator, mise-en-place
escandallo     ← viabilidad, pase-cocina
viabilidad     ← (raíz, no consumida)
menu-generator ← carta-manager
carta-manager  ← (raíz)
mercadona-api  ← escandallo
```

**Construcción**: al arrancar, ai-gateway (o un módulo nuevo `page-graph`)
parsea todos los blueprints, recoge `publishAndWait` y `publish`, deduce qué
módulo consume qué módulo. El grafo se sirve vía tool `page.related({page_id})`
o vía evento `page.graph.request`/`page.graph.response`.

**Cero mantenimiento manual**: si añades un módulo blueprint, sus relaciones
aparecen solas en el grafo y por tanto en la barra lateral de las páginas
relacionadas. Mismo principio que el catálogo de cajones (5.1).

**Override opcional**: cada `module.json` puede declarar
`paginas_relacionadas: [...]` para añadir relaciones que no se infieren del
pseudocódigo (ej. afinidad temática, no técnica).

### 5.5.3 Cambio dinámico de foco — flujo

```
USUARIO en page=recetas
  "oye y cuánto saldría producir 50 unidades de esta receta al mes"
                        │
                        ▼
LLM razona:
  "Esto ya no es recetas. Es viabilidad (proyección coste / volumen)."
                        │
                        ▼
LLM invoca tool nueva:
  chat.cambiar_foco({
    nuevo_page_id: "viabilidad",
    motivo: "la pregunta es de proyección de coste mensual"
  })
                        │
                        ▼
ai-gateway publica evento:
  chat.foco.cambiado { conversation_id, anterior, nuevo, motivo }
                        │
                        ▼
Frontend escucha vía mqttClient:
  navegar con goto('/viabilidad'), recargar panels de esa zona,
  actualizar barra lateral (ahora muestra destinos de viabilidad)
                        │
                        ▼
ai-gateway recompone el system prompt:
  catálogo de cajones = cajones de viabilidad (rankeados)
                        │
                        ▼
LLM responde al usuario YA en contexto viabilidad
  "Para 50 unidades/mes el coste mensual sería..."
```

**Punto crítico**: la decisión de cambiar foco vive en el LLM (autónoma),
NO en un router externo, por las mismas razones que la decisión 6.3 (LLM
autónomo > orquestador). El LLM tiene mejor matching semántico que cualquier
heurística.

**Anti-distracción**: el cambio de foco se considera UNA operación al estilo
de `cajon.abrir` — no puede coexistir con otras tool calls en el mismo
turno. El principio `enfoque_una_operacion` de `llm-runtime-discipline`
aplica igual.

### 5.5.4 Barra lateral de destinos — diseño

**Vestigio en el frontend**: el `grep` no encontró nada explícito
(`destinos`, `paginas-relacionadas`, `related-pages`, etc.). Pero la
**infraestructura está perfecta**:

- `frontend/src/lib/modules/panels.ts` declara zonas:
  `'work-bar' | 'chat-config' | 'chat-tools' | 'system-bar'`.
- Añadir una zona nueva `'related-pages'` es 1 línea + 1 componente.
- `WorkBar.svelte` es el patrón a imitar: layout vertical, lista de items
  con icono + título, click dispara acción.

**Componente nuevo `RelatedPagesBar.svelte`**:

- Suscrito al store de página activa (Svelte store o derivado del
  `$page.url.pathname` de SvelteKit).
- Llama a `page.related({ page_id: activa })` (tool nueva o store derivado
  del grafo precargado).
- Renderiza una lista de links a otras páginas. Cada link:
  - Icono (del `module.json.icon` o del `panels.ts`).
  - Título corto (del `module.json.name` o `panels.ts.title`).
  - Click → `goto('/<page_id>')` de SvelteKit.
  - Hover → tooltip con la razón de la relación ("consume recetas",
    "alimentado por escandallo").

**Reglas de UI**:
- Máximo ~5-7 destinos visibles. Si hay más, "ver todos" expande.
- Orden = mismo ranking que cajones: cercanía en el grafo (1 salto > 2
  saltos) + page más recientemente visitado.
- Sin notificaciones, sin badges, sin presión visual. Es navegación
  ambiental, no alerta.

### 5.5.5 Lo que NO se añade (importante)

Para evitar el malentendido previo:

- **NO hay "botón por cajón"**. Los cajones se abren vía tool call del LLM,
  no vía UI manual. Era un error de dictado capturado por accidente.
- **NO se duplica la operativa**: la barra lateral apunta a **páginas**, no
  a cajones. Cajón = unidad de razonamiento del LLM. Página = unidad de
  navegación del usuario.
- **NO sustituye al chat**: la barra lateral es ambiente, no protagonista.
  El driver primario sigue siendo la conversación.

### 5.5.6 Cómo se suma a lo anterior (resta cero)

| Pieza ya decidida en 5.1-5.4 | Cambia con 5.5? |
|---|---|
| Catálogo mixto auto + override (5.1) | No. Se reusa el mismo patrón para `paginas_relacionadas`. |
| Ranking simple recencia + page activo (5.2) | No. Se reusa para ordenar destinos de la barra. |
| Patrón Google search-style (5.3) | No. Sigue siendo el motor. La barra es UI sobre ese motor. |
| Tools `cajon.listar` / `cajon.abrir` (5.4) | No. Se añaden tools nuevas para foco y grafo, sin tocar las anteriores. |
| Inline en blueprints (6.5 propuesto) | No. El grafo se extrae del mismo lugar. |

**Tools adicionales sobre las 2 originales**:

- `chat.cambiar_foco({ nuevo_page_id, motivo? })` — cambio dinámico.
- `page.related({ page_id })` — consulta del grafo (LLM y frontend).

Total: **4 tools nuevas en ai-gateway**, todas auto-wireables vía
`tools.contract v1.2` ya canónico en main.

---

## 6 · Decisiones AÚN abiertas (a resolver en próxima sesión)

### 6.1 Persistencia del cajón entre turnos

- **Opción A**: cerrado automáticamente al siguiente turno. Más limpio,
  predecible. El LLM tiene que volver a abrir si necesita.
- **Opción B**: persistente hasta que el LLM lo cierre explícitamente.
  Permite trabajo multi-turno con el mismo cajón abierto.
- **Opción C** (híbrida): cerrado por defecto + el LLM puede pedir "mantén
  abierto N turnos" en su tool call.

**Recomendación pendiente de validar**: Opción A primero (más simple).
Si el LLM se queja de tener que reabrir cajones, evolucionar a C.

### 6.2 Aplicabilidad: solo blueprints o más allá

¿Los cajones aplican solo a operaciones de blueprints, o también a:
- Sistema prompt del chat principal (el LLM general del chat tiene cajones
  por dominio del sistema)?
- Agentes especialistas (cada agente tiene cajones temáticos en su prompt)?
- Memorias (memory-rag, memory-conversation-summary) cargan cajones de
  recuerdos específicos en lugar de todo el historial?

**Recomendación pendiente de validar**: empezar **solo en blueprints**
(donde se observó el dolor). Si el patrón funciona, extender a chat
principal después. Memorias y agentes — más adelante o nunca.

### 6.3 Decisión de "qué cajón abrir": LLM autónomo o orquestador externo

- **LLM autónomo**: el LLM decide vía tool call. Más simple
  arquitectónicamente, +1 turno de latencia por abrir.
- **Orquestador externo** (chat-io o ai-gateway): detecta intención del
  usuario y precarga el cajón ANTES de pasar al LLM. Menos latencia, más
  complejidad de orquestación + riesgo de cargar el cajón equivocado.

**Recomendación pendiente de validar**: empezar con **LLM autónomo**.
Es lo que más se parece a la metáfora del usuario y es trivial de
implementar.

### 6.4 Profundidad de cajones (idea no resuelta)

¿Los cajones tienen niveles de profundidad?
- **Cajones rápidos** (los visibles siempre en el catálogo).
- **Armarios profundos** (operaciones raras, requieren pedirlas explícitamente).

Equivale a la cocina real: hay especias visibles, y hay la batidora en el
armario alto que casi nunca usas. El LLM tampoco tiene que ver TODO el
catálogo en el system prompt — solo los rápidos.

**Recomendación pendiente de validar**: empezar **sin niveles**. Si el
catálogo crece a más de ~30 cajones, introducir niveles.

### 6.4 bis Detector de foco — autonomía del LLM (añadido 2026-05-22)

¿Quién decide que el foco ha cambiado?

- **Opción A — LLM autónomo**: el LLM invoca `chat.cambiar_foco` cuando
  detecta semánticamente que la pregunta es de otro dominio. Más simple,
  +1 turno de latencia. Coherente con la decisión 6.3 para cajones.
- **Opción B — Router intermedio**: un módulo nuevo (`chat-router` o
  similar) clasifica el mensaje antes del LLM principal. Menos latencia,
  más complejidad, requiere modelo clasificador adicional.
- **Opción C — Manual por click**: solo cambia foco si el usuario clica un
  destino en la barra lateral. El LLM nunca cambia foco solo.
- **Opción D — Híbrida A+C**: el LLM puede cambiar foco pero antes manda
  un aviso ("voy a moverte a viabilidad — ¿ok?"). El usuario confirma o
  reorienta.

**Recomendación pendiente de validar**: empezar con **A** (LLM autónomo)
en piloto. Si la tasa de cambios equivocados es > 10%, evolucionar a D.

### 6.4 ter Ayudas de UI residual al cambio de foco (añadido 2026-05-22)

Cuando el LLM cambia la página automáticamente, ¿cómo se entera el usuario?

- **Nada**: la página cambia silenciosamente. Mínima fricción, máximo
  riesgo de confusión ("¿quién movió la página?").
- **Banner en el chat**: el LLM antepone un párrafo como
  "*(moviéndote a viabilidad porque la pregunta es de coste mensual)*".
  Coste cero, máxima transparencia.
- **Toast / notificación efímera**: el frontend muestra un toast
  "Cambiando a viabilidad" durante 2s.
- **Breadcrumb persistente**: encima del chat, una línea
  "recetas → viabilidad" con flecha para volver.
- **Confirmación previa**: como Opción D de 6.4 bis. Máxima seguridad,
  rompe el flujo.

**Recomendación pendiente de validar**: **banner en el chat** (mínimo
viable). Si confunde, añadir breadcrumb.

### 6.4 quater Archivadores / cajones anidados (añadido 2026-05-22)

Relacionado con 6.4 pero específico a la metáfora del usuario: ¿los
cajones pueden tener archivadores dentro? Ejemplos:

- `recetas.crear` → archivador "Pizzas" / archivador "Postres" / etc.
- `escandallo.calcular` → archivador "Por receta" / "Por carta" / "Por
  proyecto".

- **Opción A — Jerarquía estricta** declarada en el blueprint:
  `archivadores: { pizzas: {...}, postres: {...} }`.
- **Opción B — Tags / labels** asociados a cada cajón, búsqueda por
  intersección.
- **Opción C — Plano (sin niveles)**: lo que ya hay en 5.4. El LLM razona
  el agrupamiento mental.

**Recomendación pendiente de validar**: **C** (plano) en v1, ver si
duele, evolucionar a B si hace falta.

### 6.5 Almacenamiento físico de los cajones

- **Inline en el blueprint hijo**: el blueprint mantiene su shape actual
  (`operaciones: { crear: {...}, listar: {...} }`). Cuando ai-gateway
  necesita un cajón, extrae esa sub-sección del blueprint en memoria.
  Pro: cero archivos nuevos. Contra: el blueprint sigue siendo un archivo
  grande que hay que cargar para extraer cualquier cajón.
- **Archivos separados** por operación:
  `modules/<modulo>/<modulo>.blueprint.json` (solo metadatos del
  blueprint padre + lista de cajones) + `modules/<modulo>/cajones/<op>.json`
  (uno por operación). Pro: cada cajón es un archivo independiente,
  hot-reload fácil. Contra: muchos archivos.
- **Híbrido**: blueprint sigue siendo un archivo, pero ai-gateway cachea
  cajones extraídos en memoria al arrancar (un Map<cajón, contenido>).
  Pro: pocos archivos + acceso rápido. Contra: cache que mantener.

**Recomendación pendiente de validar**: empezar con **inline** (los
blueprints actuales NO se tocan), ai-gateway extrae cajones del blueprint
en memoria al arrancar. Si más adelante el blueprint inline se vuelve
inmanejable, partir a archivos separados.

---

## 7 · Cuellos identificados

| # | Cuello | Severidad | Mitigación |
|---|---|---|---|
| 1 | Latencia +1 turno por abrir cajón (LLM autónomo) | Baja | Aceptable. El usuario ya vive con 5-25s por blueprint; +1 turno es marginal. |
| 2 | LLM abre cajón equivocado | Media | Catálogo bien redactado (descripción clara) + ranking por contexto. Si pasa, log + iterar descripciones. |
| 3 | Catálogo crece a 100+ cajones | Media | Niveles (decisión 6.4) + ranking por contexto (decisión 5.2) lo mitigan. No urgente hasta verlo en runtime real. |
| 4 | Cajón abierto contiene datos sensibles que se ven en contexto | Baja | El blueprint ya está en el repo. Si el cajón no debería ser visible al LLM, no debería estar en el blueprint. |
| 5 | Hot-reload de cajones (al editar blueprint) | Media | Si los cajones son inline, recargar blueprint = recargar catálogo. Si están en archivos separados, `fs.watch` + reload. |
| 6 | Compatibilidad con LLMs que no soportan tool use bien | Baja | Todos los providers que ai-gateway usa (Anthropic, OpenAI, etc.) soportan tools nativamente. |
| 7 | Coste de tokens por cajones grandes | Baja | El cajón es UNA operación, no todas. Por definición es < 100 líneas. Mucho menos que cargar el blueprint entero. |

---

## 8 · Lo que NO se incluye en cajones v1

Cosas que aparecieron en la discusión pero NO son v1:
- **Embeddings + similarity search** para retrieval (overkill — el LLM
  razona el matching mejor que un cosine similarity con ~30 cajones).
- **Ranking sofisticado con ML** (overkill — recencia + page activo basta).
- **Cajones jerárquicos** (introducir solo si crece el catálogo).
- **Persistencia configurable por cajón** (mantener simple: cerrado al
  siguiente turno).
- **Cajones inter-modulares** (un cajón que mezcla operaciones de varios
  módulos — confuso, no aporta).
- **Versionado de cajones** (heredan versionado del blueprint, no propio).

---

## 9 · Camino propuesto para implementación

### Fase 0 — Pre-requisito

**La capa única de tools debe estar implementada y validada en uso real
durante 2-4 semanas.** Ver `capa-unica-tools-via-plugins.md`. Si no lo
está, **párate aquí**, vuelve a ese documento, implementa eso primero.

Razón: introducir cajones encima de tools rotas multiplica complejidad
sin resolver el problema operativo más urgente.

### Fase 1 — Decidir las 5 abiertas (30 min, sin código)

Cerrar las decisiones de la sección 6 con el usuario:
- Persistencia entre turnos (A/B/C).
- Aplicabilidad (solo blueprints o más).
- Quién abre el cajón (LLM autónomo o orquestador).
- Niveles de profundidad (con/sin).
- Almacenamiento físico (inline/separado/híbrido).

### Fase 2 — Contrato (1-2h, sin código)

Crear `arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json`
siguiendo el patrón de contratos transversales del repo.

Secciones canónicas con las decisiones de Fase 1 cerradas.

### Fase 3 — Implementación core en ai-gateway (3-5h)

Editar `modules/conversacion/ai-gateway/index.js`:
- Nueva función `_extractCajones(blueprint)` que parsea el blueprint y
  produce el catálogo (array de `{id, dominio, descripcion}`).
- Nueva función `_rankCajones(catalogo, page_id_activo, historial_abiertos)`
  que reordena el catálogo según señales.
- Modificación de `_composeBlueprintSystemPrompt(parent, child)`: ahora
  produce el system prompt SOLO con el catálogo rankeado, NO con el
  pseudocódigo completo. El padre se mantiene (rules generales).
- Nueva tool registrada: `cajon.abrir({nombre})` → busca el cajón en el
  blueprint cargado, devuelve `{pseudocodigo, reglas_clave,
  errores_posibles}`.
- Nueva tool registrada: `cajon.listar({zona?})` → devuelve catálogo
  filtrado y rankeado.
- Estado en memoria: `Map<conversation_id, [...cajones_abiertos_recientes]>`
  para el ranking por recencia.

### Fase 4 — Tests (2-3h)

Tests POC2 para:
- `_extractCajones` produce catálogo correcto desde blueprint canónico.
- `_rankCajones` respeta page activo + recencia.
- `cajon.abrir` devuelve contenido + 404 si no existe.
- `cajon.listar` aplica filtro de zona si se pasa.

### Fase 5 — Piloto: recetas (1-2h)

Activar cajones solo en page=recetas. Resto de páginas siguen con
blueprint completo (compat). Probar en runtime real una sesión completa.

Medir:
- Tokens consumidos por turno (debería bajar drásticamente).
- Cuántos `cajon.abrir` invoca el LLM por turno (sanity check).
- Si el LLM se distrae menos.

### Fase 5 bis — Foco dinámico + barra lateral (3-5h, añadido 2026-05-22)

**Solo si la Fase 5 valida** que los cajones funcionan. Esto añade UX/UI
sobre el motor estable.

#### 5 bis.1 Grafo de relaciones (1h, backend)

- Nueva función en ai-gateway o módulo `page-graph`:
  `_buildPageGraph(blueprints)` parsea todos los blueprints cargados,
  extrae `publishAndWait('<mod>.<accion>.request', ...)` del pseudocódigo
  → graph dirigido `{ <page_id>: { consumes: [...], consumed_by: [...] } }`.
- Añadir override opcional `module.json.paginas_relacionadas: [...]`.
- Tool nueva auto-wireada `page.related({ page_id }) → { related: [...] }`
  con ranking (saltos en grafo + recencia).

#### 5 bis.2 Tool de cambio de foco (1h, backend)

- Tool nueva `chat.cambiar_foco({ nuevo_page_id, motivo? })`. Handler en
  ai-gateway:
  - Valida que `nuevo_page_id` existe en `paginas` registradas.
  - Publica evento `chat.foco.cambiado { conversation_id, anterior, nuevo, motivo, request_id }`.
  - Devuelve `{ status: "ok", nuevo_page_id }` para que el LLM continúe
    el turno con el nuevo catálogo de cajones.
- Modificar `_composeBlueprintSystemPrompt`: el catálogo se compone con el
  `page_id` actual de la conversación (no del request), que el handler
  acaba de actualizar.

#### 5 bis.3 Listener en frontend (1h)

- En `frontend/src/lib/services/mqttClient.ts` (o equivalente), suscribir
  a `chat.foco.cambiado` filtrado por `conversation_id` activa.
- Al recibir: `goto('/<nuevo_page_id>')` de SvelteKit y opcionalmente
  toast / banner según decisión 6.4 ter.

#### 5 bis.4 Componente `RelatedPagesBar.svelte` (1-2h)

- Añadir zona `'related-pages'` en `frontend/src/lib/modules/panels.ts`
  (1 línea en el type union).
- Crear `frontend/src/lib/components/layout/RelatedPagesBar.svelte`
  siguiendo el patrón de `WorkBar.svelte`:
  - Suscrito a `$page.url.pathname` (page activa).
  - Llama a `page.related({ page_id })` vía `mqttRequest` o store
    derivado del grafo precargado.
  - Lista vertical de links con icono + título. Click → `goto(...)`.
- Decidir layout: ¿flotante a la derecha del chat, panel apilable en
  `system-bar`, o nueva zona dedicada? Pendiente de mockup.

#### 5 bis.5 Tests + validación

- Test del parser de grafo (`_buildPageGraph` con blueprints sintéticos).
- Test de la tool `chat.cambiar_foco` (valida que cambia el `page_id`
  asociado a la conversación y publica el evento canónico).
- Smoke E2E: usuario en `/recetas`, pregunta de viabilidad, página
  cambia, barra lateral se actualiza.

### Fase 6 — Migrar resto de módulos blueprint (~2h)

Si el piloto recetas funciona, activar cajones para los 10 módulos
blueprint del sistema. Cambio mínimo: bandera en `module.json.cajones_enabled: true`.

### Fase 7 — Documentación y commit

- Actualizar `CLAUDE.md` con el nuevo paradigma.
- Actualizar el blueprint padre `subsistema-recetario.modulo-base` para
  reflejar que ahora el LLM ve catálogo de cajones.
- Cerrar drifts del baseline.
- PR a main.

---

## 10 · Cómo arrancar la próxima sesión

Mensaje sugerido literal:

> *"Vamos a implementar los cajones. He guardado todo el contexto en
> `arquitectura/decisiones/propuestas/cajones-context-partitioning.md`.
> Léelo y arranca por la Fase 0 (verificar pre-requisito). Si la capa
> única de tools está implementada y validada, sigue a Fase 1 (cerrar las
> 5 decisiones abiertas) antes de tocar código."*

---

## 11 · Relación con la capa única de tools (orden estricto)

```
PRIMERO  →  Capa única de tools via plugins
            (arregla bug operativo de handlers rotos)
            Documento: capa-unica-tools-via-plugins.md

VIVIR 2-4 SEMANAS  →  Usar el sistema en producción
                       Observar qué duele realmente
                       Validar que los blueprints siguen siendo correctos

DESPUÉS  →  Cajones (este documento)
            (perfecciona los blueprints reduciendo sobrecarga)

DESPUÉS DE CAJONES  →  Evaluar si quedan problemas reales
                       o si el sistema está suficientemente fino
```

**No saltarse el orden.** Implementar cajones sin tener tools funcionando
es maquillaje sobre fractura. Los blueprints actuales son funcionales
aunque pesados — viven bien hasta que toque optimizar.

---

## 12 · Referencias rápidas

| Qué | Dónde | Por qué |
|---|---|---|
| Documento hermano (capa de tools) | `arquitectura/decisiones/propuestas/capa-unica-tools-via-plugins.md` | Pre-requisito de este |
| Blueprint padre actual | `arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json` | El que tendrá que cambiar |
| Composición del system prompt | `modules/conversacion/ai-gateway/index.js::_composeBlueprintSystemPrompt()` (línea 314) | Donde se inyecta hoy todo el blueprint; donde inyectar solo catálogo después |
| Carga de blueprints | `modules/conversacion/ai-gateway/index.js::_loadBlueprints()` (línea 277) | Donde añadir `_extractCajones` |
| Ejemplo de blueprint grande | `modules/pizzepos/carta-manager/carta-manager.blueprint.json` (13 operaciones) | Caso de prueba ideal para cajones |
| Contrato disciplina LLM | `arquitectura/decisiones/_contratos/llm-runtime-discipline.contract.json` | Las 10 reglas que coexisten con los cajones |
| Paradigma blueprint | `arquitectura/decisiones/_contratos/modulos-blueprint-driven.contract.json` | Donde se aplica el patrón |
| Zonas del frontend | `frontend/src/lib/modules/panels.ts` (line 15: type union de zonas) | Donde añadir `'related-pages'` para la barra lateral |
| Patrón de barra a imitar | `frontend/src/lib/components/layout/WorkBar.svelte` | Plantilla para `RelatedPagesBar.svelte` |
| Tools.contract canónico | `arquitectura/decisiones/_contratos/tools.contract.json` v1.2 | Auto-wire de tools en ai-gateway + uiHandler |
| Disciplina event-core | `CLAUDE.md` (raíz del repo) | "Emite evento. Quien sabe, hace." — aplica a `chat.foco.cambiado` |

---

## 13 · Frase resumen para retomar

**Cajones = patrón Google aplicado a blueprints. El LLM ve un índice corto,
abre solo el cajón que necesita, lo cierra al siguiente turno. Catálogo
auto-generado con override opcional. Ranking simple por recencia + page
activo. Implementación: 2 tools nuevas en ai-gateway, cero cambios en los
blueprints existentes. Tras la capa única de tools, no antes.**

**Ampliación 2026-05-22 (5.5)**: encima del motor de cajones, dos
mecánicas espaciales — foco dinámico (el LLM mueve la página cuando la
conversación cambia de dominio, vía `chat.cambiar_foco` + evento
`chat.foco.cambiado`) y barra lateral de destinos relacionados (nueva
zona `'related-pages'` en frontend, componente `RelatedPagesBar.svelte`
siguiendo patrón WorkBar, alimentada por un grafo de relaciones
auto-construido desde las referencias `publishAndWait` del pseudocódigo
de los blueprints). Total: **4 tools** (2 originales + 2 nuevas), todas
auto-wireables vía `tools.contract v1.2`. **Cero refactor**, suma sobre
lo anterior, resta cero.
