# ANATOMÍA de eventos y elementos — carta-marketing (fase de alimentación del prisma)

> Los 3 informes previos al prisado. Fuente: modules/pizzepos/carta-marketing/
> module.json (v2.6.0) + index.js (199 líneas, leído entero) +
> arquitectura/decisiones/_schemas/marca/marca.schema.json +
> modules/_shared/modulo-hibrido-reflejo.js (la base).

## 1. Eventos del módulo (publica / escucha / huecos)

PUBLICA (index.js):
- `marketing.perfil.actualizado` { project_id, campos_modificados,
  correlation_id, timestamp } — publicada por el reflejo al persistir
  (index.js L145, `_emitirActualizado`). LA SEÑAL de la declaración. Cadena
  hasta el frontend verificada en el código: eventBus.publish → emit → MQTT
  broadcast `core/*/events/marketing/perfil/actualizado` (core/events/bus.js
  L357-366) → el frontend suscribe dot notation (ui-core/client.ts L473-482).
  carta-digital la escucha como fuente.
- `marketing.onboarding.completado` { project_id, correlation_id, timestamp } —
  publicada cuando update_perfil recibe `onboarding_completado: true`
  (index.js L136-140). Cierre del onboarding.
- `marketing.copy.generado` { project_id, carta_id, generado, correlation_id,
  timestamp } — publicada por guardar_copy al persistir el copy (index.js L191).
  Fuera del panel-jefe (el copy lo redacta el LLM de página).

ESCUCHA (module.json subscribes — los 4 son RPC request/response correlado):
- `carta-marketing.get_perfil.request` → response (L59)
- `carta-marketing.update_perfil.request` → response (L60)
- `carta-marketing.guardar_copy.request` → response (L61)
- `carta-marketing.validar.request` → response (L62; AJV, función pura)

HUECOS de evento: NINGUNO granular — no hay marketing.voz.actualizada /
marketing.visual.actualizada por sección; la señal es de módulo con
`campos_modificados` (array de claves top-level). Hueco menor; suficiente
porque quien escucha re-lee con get_perfil.

## 2. Elementos (ui_handlers del module.json) mapeados a necesidades del jefe

| ui_handler | Necesidad del jefe que sirve | Rol |
|---|---|---|
| get_perfil | VER la identidad vigente (por secciones) antes de decidir | neutro |
| update_perfil | DECLARAR la identidad (por secciones, deep-merge) | jefe |

Ambos declarados type=workspace_module zone=barra_modulos — cara UI la da el
blueprint + panel (el módulo es HÍBRIDO: lo fuzzy lo conduce el LLM de página,
lo determinista vive en index.js).

## 3. Invariantes del módulo (fuentes, custodios, estado)

- **INV1 — un escritor, un store**: el reflejo escribe `/pizzepos/marca.json`
  (fs.write atómico, single-writer). update_perfil es la ÚNICA escritura.
- **INV2 — la lectura SIEMPRE responde**: get_perfil devuelve la estructura
  completa (secciones vacías si falta — index.js L77). Los "404 de leer" son
  imposibles por diseño: la falta de marca es una RESPUESTA NOMBRADA (secciones
  vacías), no un error. La UI representará vacío = "por declarar".
- **INV3 — deep-merge por sección**: update_perfil { voz: {...} } NO pisa
  visual/publico/esencia; los campos ausentes se preservan (index.js L41-48,
  L122). La UI envía solo la sección editada.
- **INV4 — EL FRENO (contrato mecánico)**: la marca SÍ tiene schema
  (marca.schema.json). update_perfil RE-VALIDA la marca resultante del merge
  contra el schema ANTES de escribir (index.js L127-128, `_checkMarca` AJV).
  Un parche que la rompe (voz como string, esencia.nombre como número) → 422,
  NO persiste. El COPY no tiene freno mecánico (texto libre).
- **INV5 — respuesta de update_perfil es el dictamen**: 200 { marca fusionada }
  (index.js L141). El panel muestra el dictamen directo de la respuesta; la
  señal re-asienta la vista entera (doble confirmación).
- **INV6 — sin estado en el proceso**: el reflejo no guarda nada en memoria;
  todo pasa por fs store del proyecto (multi-tenant por project_id).
- **INV7 — `onboarding_completado` es el cierre**: true cuando esencia.nombre +
  voz + publico existen; el resto (visual/negocio) se afina después, no bloquea.

## 4. Moneda

SIN moneda: la identidad de marca no tiene cifras. Es voz + visual + público.
No hay euros ni céntimos en ningún shape. Anotado en _lente_roles.
