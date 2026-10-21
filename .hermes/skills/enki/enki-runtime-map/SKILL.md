---
name: enki-runtime-map
description: >-
  Mapa del runtime de Enki: cómo carga el ModuleLoader los módulos (enabled
  ordena, disabled filtra, todo lo demás se carga), qué gobierna el prompt del
  LLM conversacional (base.prompt.json, NO las rebanadas), y cómo auditar
  config.json contra los directorios reales (fantasmas, huérfanos, POCs).
when-to-use: >-
  Cuando haya que declarar/desactivar módulos, entender por qué un módulo corre
  o no en producción, auditar config.json, cambiar el comportamiento del chat
  (prompts), o distinguir runtime vs referencia/archivado en el repo de Enki.
tags: [enki, runtime, moduleloader, config, prompts, auditoría]
---
# Enki Runtime Map

> Hechos de arquitectura verificados en vivo (2026-07-31) sobre cómo Enki carga
> y gobierna sus módulos y prompts. Complementa a `enki-rebanadas` (workflow de
> edición) con el MAPA del runtime.

## 1 · ModuleLoader: cómo se carga un módulo

**`config.json → modules.enabled` solo ORDENA. `modules.disabled` FILTRA.**
Todo directorio bajo `modules/` que tenga `module.json` se carga, salvo que esté
en `disabled`. El loader filtra por nombre de **DIRECTORIO** (`entry.name`), no por
`manifest.name`.

Consecuencias (todas verificadas en producción):
- Un POC dejado en `modules/` **corre en producción por defecto**. Ejemplo real:
  `modules/conversacion/ai-gateway-poc/` (name interno "ai-gateway") suscribía
  `llm.complete.request` en paralelo con el ai-gateway real v2.36 → riesgo de doble
  respuesta. Se apagó moviéndolo a `disabled`.
- `enabled` con nombres inexistentes = "fantasmas" (no rompen, solo mienten sobre
  el sistema). Se acumularon 8 de la capa de referencia `arquitectura/conversacion-ref/`
  (prompt-engine, agent-manager, chat-ai-bridge, chat-session, conversacion, pizzepos,
  carta-impresion, conversacion/context-manager).
- Los módulos reales del chat (chat-io, prompt-builder, agent-observer, memorias,
  estados, propiocepcion) no estaban declarados → se cargaban igual, sin orden.

**Regla del reloj suizo:** módulo nuevo → declararlo en `enabled` con orden explícito.
POC/sustituido → `disabled` (se apaga, no se borra) y `_archived/` cuando se confirma
que no se rescata.

## 2 · El prompt del LLM conversacional: base.prompt.json

**`modules/_shared/base.prompt.json` gobierna el comportamiento del chat.**
`CLAUDE.md`/`CLAUDE.full.md` (ensamblados desde `arquitectura/cabecera/`) son para los
agentes que leen el repo (Claude Code), NO para el LLM del chat.

Pipeline real del prompt del chat:
```
prompt-builder (chat.message.saved → chat.prompt.ready):
  base.prompt.json + context.json del módulo + prompt.json del módulo
  + CONTEXTO ACTIVO + vista_frontend + enriquecimientos de memorias
ai-gateway añade por turno: propiocepción, RAIL (estados), lentes, empujones
```

Lección verificada: mandatos de ejecución añadidos a `_mandato.md` → CLAUDE.md
NUNCA llegaron al LLM del chat; el `base.prompt.json` tenía "ACTÚA, NO PREGUNTES"
contradiciéndolos. Para cambiar comportamiento del chat: editar `base.prompt.json`.

**Formato de mandatos que pide Paco**: "haz esto de esta forma + ejemplo" —
acción construible (`haz`), mecanismo concreto (`forma`), ejemplo literal. Inspirado
en el esquematizador.

## 3 · Auditoría config vs directorios

Ejecutar `scripts/cruzar-config.py` desde la raíz del repo:
```bash
python3 ~/.hermes/skills/enki/enki-runtime-map/scripts/cruzar-config.py
```
Detecta: fantasmas en enabled/disabled (declarado pero inexistente) y huérfanos
(existe pero sin declarar → se carga igual por defecto).

## Referencias
- `references/mapa-chat-runtime.md` — auditoría completa del mundo chat (2026-07-31):
  módulos activos/desactivados, fantasmas eliminados, correspondencia
  conversacion-ref v1 → runtime v2, fs.edit universal (PR #65), mandatos de
  ejecución en base.prompt.json (PR #68), y el síndrome del LLM que lo motivó.

## 4 · Capas del repo (no confundir)

- `modules/**` → runtime (se carga; el loader solo mira aquí)
- `arquitectura/cabecera/**` → rebanadas (fuente de verdad documental → CLAUDE.md)
- `arquitectura/conversacion-ref/**` → diseño v1 (eventos obsoletos, NO runtime)
- `arquitectura/migracion/_legacy/*.bak` → monolitos pre-rewrite (historial; su sitio
  canónico, los genera scaffold-rewrite.js)
- `_archived/**` → lo retirado confirmado

## Pitfalls
- No editar CLAUDE.md a mano — editar la rebanada y correr `doc-sync.js --ensamblar`
- No asumir que un módulo "no corre" porque no está en enabled — se carga igual
- No borrar un POC: moverlo a `disabled` primero, archivar después
- `conversacion-ref/` parece runtime pero es diseño v1 — sus eventos no existen en vivo
