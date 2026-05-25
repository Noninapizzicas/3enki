# Archivado: agente menu-structurer

**Fecha**: 2026-05-24.
**Razón**: el agente queda absorbido por el blueprint nuevo de
`menu-generator` (ver
`arquitectura/decisiones/propuestas/migracion-menu-generator-blueprint.md`).
La distinción "estructurar texto → JSON" (rol del agente) vs "transformar
JSON → carta pizzepos" (rol del módulo) resulta artificial cuando ambas
operaciones las hace el mismo LLM. El blueprint del módulo absorbe ambos
pasos en una sola pasada conversacional.

## Qué se conserva aquí

- `menu-structurer.json` — declaración del agente legacy
  (`agents-config.contract.json` shape) tal y como vivía en
  `modules/conversacion/ai-agent-framework/agents/`.
- `menu-structurer-system.md` — system prompt curado del agente (115
  líneas, idioma `es`, especialista en cartas de restaurante para POS).

## Cómo recuperar (si vuelve a hacer falta)

Si en algún momento se decide que el paso "estructurar texto → JSON"
debe vivir como agente especialista de nuevo (porque duele en runtime
real, según el principio rector del blueprint):

1. Migrar el agente al patrón `agente-blueprint` (no devolverlo al
   modelo legacy):
   - Crear `modules/menu-structurer/module.json` declarativo sin `main`.
   - Crear `modules/menu-structurer/menu-structurer.blueprint.json`
     extendiendo `_agentes-blueprint/agente-base.blueprint.json` (cuando
     exista — ver `migracion-agentes-blueprint.md`).
   - Mover `menu-structurer-system.md` a
     `modules/menu-structurer/menu-structurer-system.md`.
   - Crear contrato propio
     `arquitectura/decisiones/_contratos/menu-structurer.contract.json`.
2. Actualizar el blueprint de `menu-generator` para invocar el agente
   vía `agent.execute.request` en su pseudocódigo.
3. Re-evaluar `tools` que el agente necesita (las legacy `carta.save`
   y `carta.list` ya no existen como tools — son pares
   `<modulo>.<entidad>.<verbo>.request/response` del bus canónico).

## Principio rector del blueprint que motivó este archivado

> *El LLM principal del blueprint hace el trabajo conversacional + de
> transformación. Los agentes especializados aparecen solo cuando un
> proceso concreto demuestra dolor en runtime: latencia inaceptable,
> indeterminismo recurrente, lock-in a un provider, contexto que satura
> el blueprint principal. Sin dolor demostrado, no se extrae a agente.*

`menu-structurer` no demostró dolor — su rol era estructurar texto, lo
cual el LLM principal hace nativo. Por eso se absorbe en v1. Si emerge
demanda real (ej. el blueprint se satura con cartas largas, o necesita
un provider distinto del general por temperatura/tokens), se reabre
como agente propio.

## Documentos relacionados

- `arquitectura/decisiones/propuestas/migracion-menu-generator-blueprint.md`
  — plan que motiva el archivado.
- `arquitectura/decisiones/propuestas/migracion-agentes-blueprint.md` —
  patrón general de migración de agentes (relevante si se recupera).
- `arquitectura/decisiones/_contratos/agente-blueprint.contract.json` —
  contrato canónico para la recuperación.
