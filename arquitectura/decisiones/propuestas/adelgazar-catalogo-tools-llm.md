# Propuesta arquitectónica — Adelgazamiento del catálogo de tools del LLM

**Estado**: discusión / pendiente de planificación
**Fecha**: 2026-05-15
**Origen**: conversación de audit cross-módulo 2026-05-14/15 (recetas, menu-generator, carta-digital, escandallo, recetas/Bocapizzas-uso-real)
**Contrato canónico de referencia**: `arquitectura/decisiones/_contratos/companero-viaje.contract.json`

## Resumen ejecutivo

El sistema declara `companero-viaje` como modelo arquitectónico: el LLM "compañero" usa **tools** (capacidades que tocan el exterior) y **agentes** (especialistas que saben el dominio). La implementación actual ha derivado: **el catálogo del LLM expone ~50 tools de dominio** que deberían vivir dentro de agentes, lo que obliga al LLM a hacer trabajo de bajo nivel (orquestar, retry, recovery) en lugar de "traer al especialista, recoger su trabajo, y seguir acompañando" como dice el contrato.

**Caso observado** (Bocapizzas, 2026-05-15): el usuario pidió "calcula el escandallo de los 6 bocadillos" — el LLM hizo **43 tool calls** (búsqueda×6, obtener×6, crear×1, actualizar_precio×17, escandallo.receta×12, invoke_agent×1). El trabajo real lo resolvió el `invoke_agent` final. Las 42 tool calls previas son **bruteforce del LLM intentando hacer el trabajo de un agente que aún no existe como entry-point único**.

Esta propuesta describe la regla canónica derivable del contrato, mide el drift actual, y plantea las fases para alinearlo.

## La regla canónica

Derivada literalmente del `companero-viaje.contract.json` y validada conceptualmente en discusión:

> **Tool**: capacidad concreta que toca el exterior. Ejemplos del contrato literal: *"leer PDF, generar imagen, mandar telegram, ejecutar query, abrir cajón de dinero"*. I/O con el mundo (filesystem, DB lectura, canales, APIs externas).
>
> **Agente**: especialista que sabe el dominio. Recibe una intención, orquesta internamente sus tools y eventos, devuelve resultado canónico al compañero.
>
> **LLM compañero**: invoca agentes (`invoke_agent`) cuando hay tarea de dominio, usa tools de I/O cuando hay que tocar el mundo externo sin razonamiento de dominio. No hace orquestación de bajo nivel.

Implicación directa: **operaciones de dominio NO son tools del LLM**. Son intenciones que viajan a agentes, o eventos internos entre módulos.

## Estado actual — drift mensurable

Tools que el LLM ve hoy en `page=recetas` (aproximado, depende del page filtering):

| Categoría | Tools | ¿Cumple la regla? |
|---|---|---|
| I/O filesystem | `fs.read`, `fs.write`, `fs.list`, `fs.search` | ✅ sí |
| Delegación | `invoke_agent` | ✅ sí (caso especial) |
| Dominio recetas — lecturas | `recetas.listar`, `recetas.obtener`, `recetas.buscar`, `recetas.estadisticas`, `recetas.ingredientes`, `recetas.historial` | ⚠ frontera (lecturas triviales OK; las que requieren razonamiento NO) |
| Dominio recetas — mutaciones | `recetas.crear`, `recetas.actualizar`, `recetas.actualizar_precio`, `recetas.eliminar`, `recetas.revertir` | ❌ debería vivir en agentes |
| Dominio recetas — analíticas | `recetas.analizar`, `recetas.investigar_receta` | ❌ debería vivir en agentes |
| Dominio escandallo | `escandallo.receta`, `escandallo.global`, `escandallo.comparar_precios`, `escandallo.simular_precio`, `escandallo.ingrediente_impacto`, `escandallo.optimizar`, `escandallo.ficha_tecnica` | ❌ debería vivir en `escandallo-analyzer` |
| Dominio viabilidad | `viabilidad.estudio`, `viabilidad.punto_equilibrio`, etc | ❌ debería vivir en `viabilidad-receta-analyzer` |
| Dominio carta-digital | `carta.list`, `carta.get`, `carta.add_category`, `carta.update_product`, `carta.add_product`, `cartadigital.get_config`, `cartadigital.update_config`, `cartadigital.get_carta_publica` | ❌ las mutaciones deberían vivir en agentes |
| Dominio marketing | `marketing.get_perfil`, `marketing.update_perfil`, `tarifas.get`, `tarifas.config.solicitada` | ❌ idem |

**Recuento drift**: aprox **45 tools de dominio** en el catálogo del LLM que el contrato canónico ubicaría dentro de agentes.

## Síntomas medibles del drift

Datos reales de audits 2026-05-14/15:

| Síntoma | Caso medido | Por qué pasa con el drift |
|---|---|---|
| **Bruteforce de retries** | escandallo.receta×12 en Bocapizzas | LLM ve la tool atómica, falla, prueba variaciones, sin la lógica de fallback que un agente tendría |
| **Cascadas de mutaciones** | recetas.actualizar_precio×17 en Bocapizzas | LLM batch-ea con N tool calls lo que un handler bulk haría en uno |
| **Cross-page boundary roto** | menu-generator usando carta.add_category 13 veces | tools de carta-manager expuestas también en page=menu-generator (mezcla de dominios) |
| **Trabajo del agente hecho por el LLM** | Tirada C: LLM resuelve sin invoke_agent en T6, T7 (recetas) o T9 (viabilidad) — usa tools atómicas | LLM ve atómica y agente como opciones equivalentes, prefiere atómica |
| **Latencia compounded** | 86s en mensaje 19 Bocapizzas (43 tool calls) | Cada tool call = roundtrip al bus + LLM iteration |
| **Coste compounded** | 500k input tokens en mensaje 19 Bocapizzas | El contexto crece con cada tool call/response del agentic loop |

## Path forward — 3 fases

### Fase 1 — Marcado `internal:true` en module.json (no rompe nada)

Añadir al schema de `module.json.tools[]` un campo opcional `internal: boolean`. Si `true`, el loader auto-suscribe al bus PERO **no expone al LLM**. La tool sigue siendo invocable por agentes/módulos vía bus.

Marcar inicialmente como `internal: true` las **mutaciones atómicas que el LLM no debería ver**:

- `recetas.actualizar_precio` (uso real: batch dentro de agente, nunca single-call por LLM)
- `recetas.revertir`, `recetas.eliminar` (operaciones admin, no chat)
- `carta.add_category`, `carta.update_product`, `carta.add_product` (composición — debería vivir en `cartadigital-composer`)
- `cartadigital.update_config` (puede quedar visible si el LLM lo invoca con un solo set; reevaluar)

**Efecto inmediato**: el LLM ve menos tools, no puede hacer bruteforce con esas operaciones. Si la operación es necesaria, el LLM debe llamar a un agente que sí las puede ejecutar.

**Coste**: ~30 min (campo schema + filtro en `_getTools` + marcar tools iniciales).
**Riesgo**: cero — si un agente o módulo necesita esas tools, las llama por bus como hasta ahora.

### Fase 2 — Promover intenciones canónicas a agentes

Por cada módulo de dominio, identificar **3-5 intenciones canónicas** que sustituyan las múltiples tools atómicas. Ejemplos:

**recetas**:
- `invoke_agent('recipe-curator', { intent: 'crear_carta_completa', ... })` — crea N recetas con sus ingredientes y precios estimados
- `invoke_agent('recipe-curator', { intent: 'actualizar_precios_batch', items: [...] })`
- `invoke_agent('recipe-curator', { intent: 'completar_metadata_faltante', receta_ids: [...] })`

**escandallo**:
- Ya existe `escandallo-analyzer` — promover a entry point primario. Eliminar/marcar internal las tools `escandallo.*` atómicas.
- El agente internamente sabe: si la receta no tiene precios, llamar `recetas.ingredientes`, estimar por categoría, calcular con confianza marcada.

**viabilidad**:
- Ya existe `viabilidad-receta-analyzer`. Idem.

**carta-digital**:
- Ya existen 4 agentes (`composer`, `ofertas`, `pwa-builder`, `reviewer`). Promover a entry primario. Marcar `carta.*` mutaciones como internal.

**Coste**: ~1 día por módulo (definir intenciones + reforzar el agente + tests). 5-6 módulos = ~5-6 días dispersos.
**Riesgo**: medio. Cambia el catálogo visible al LLM → comportamiento puede regresar en casos no contemplados. Mitigación: re-audit cada módulo tras promover.

### Fase 3 — Hardening del catálogo y validador

Una vez completada Fase 2:

- Validator `tools.contract` añade regla `drift_tool_dominio_expuesta_al_llm`: si una tool no es `internal:true` y no entra en categorías canónicas (I/O, lecturas triviales, invoke_agent), warning.
- Documentar en `tools.contract.json` los criterios de qué SÍ y qué NO debe ser tool visible al LLM.
- Tests por módulo verifican que el catálogo expuesto al LLM cumple los criterios.

**Coste**: ~half-day.
**Beneficio**: drift estructural detectado en CI antes de mergear.

## Impacto medible esperado

Tras Fase 1+2 completas, una conversación equivalente a Bocapizzas (crear y calcular escandallo de 6 bocadillos):

| Métrica | Antes (medido) | Después (estimado) |
|---|---|---|
| Tool calls del LLM | 43 | 3-5 (1 agent invocation crear, 1 escandallo, 1 cierre) |
| Tokens input | 500k | <100k |
| Latencia | 86s | 20-30s |
| Errors visibles al LLM | 12 escandallo + 4 url_data | 0-1 (el agente recupera internamente) |
| Coste estimado | $0.15 | $0.04-0.06 |

Plus el comportamiento se alinea con el contrato canónico y reduce mantenimiento (menos tools = menos descriptions a calibrar para routing).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Agentes no cubren todos los casos que las tools atómicas sí | Mantener tools atómicas como `internal:true` (accesibles por bus). Los agentes pueden usarlas. El LLM no las ve pero el sistema sí |
| El refactor toca muchos módulos | Hacerlo por fase 1 (mark internal) primero — reversible. Fase 2 (promover agentes) gradual por módulo |
| Pérdida de flexibilidad del LLM | Real, pero deseada: queremos LLM compañero, no LLM admin database. Si hace falta hacer algo atípico, se diseña un agente nuevo |
| Re-entrenamiento de prompts | Mínimo — el prompt actual ya privilegia `invoke_agent` |

## Próximos pasos sugeridos

1. **Discusión y aprobación** de esta propuesta (no acción inmediata)
2. Si OK, **Fase 1 como prueba**: marcar 5-7 tools como `internal:true` y re-auditar un módulo. Medir delta real vs estimado
3. Decidir Fase 2 con datos empíricos del piloto

## Anexo — Referencias

- `arquitectura/decisiones/_contratos/companero-viaje.contract.json` — protocolo canónico, sección "nucleo_invariante.acceso_al_sistema"
- `arquitectura/decisiones/_contratos/tools.contract.json` — shape canónico de tools, ya cubre el campo `name`, `description`, `parameters`, `handler`, `errores_conocidos`. Falta el campo `internal`
- `audit/recetas-prompt-companero-2026-05-14T10-25-36/analisis.md` — caso menu-generator violando regla "no editar" por exposición de tools `carta.*`
- `audit/escandallo-kimi-thinking-v7-2026-05-14T23-20-21/reporte.md` — escandallo.receta roto en producción
- Conversación Bocapizzas (`6c54114c-eedf-42e5-beb7-05cd38f1fbab`, 2026-05-15T14:07:55) — caso real con 43 tool calls
