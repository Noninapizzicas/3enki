# Cajones — context partitioning para blueprints

> **Documento de retomar.** Escrito al final de la misma sesión que produjo
> `capa-unica-tools-via-plugins.md`. Captura el diseño del concepto "cajones"
> (context partitioning + lazy loading estilo buscador) para que la próxima
> conversación tenga todo el contexto.
>
> **NO se implementa todavía.** El consejo estratégico (sección 11) es:
> primero la capa única de tools, vivir 2-4 semanas con ella, después los
> cajones con datos reales de qué duele.

Fecha: 2026-05-19.
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

---

## 13 · Frase resumen para retomar

**Cajones = patrón Google aplicado a blueprints. El LLM ve un índice corto,
abre solo el cajón que necesita, lo cierra al siguiente turno. Catálogo
auto-generado con override opcional. Ranking simple por recencia + page
activo. Implementación: 2 tools nuevas en ai-gateway, cero cambios en los
blueprints existentes. Tras la capa única de tools, no antes.**
