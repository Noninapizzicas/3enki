---
id: sistema-nervioso/portal-mcp
dominio: sistema
resumen: La puerta guardada hacia agentes externos: bridge MCP stdio → bus, guard (interruptor, scope, mode, allowlist, audit).
fuentes:
  - modules/portal/**
  - mcp/**
  - .claude/skills/conexion-mcp/**
verificado: 2026-07-12
---

# Portal — Enki como servidor MCP (puerta guardada hacia agentes externos)

> "Agent = Model + Harness". Enki YA tiene la superficie (215 tools en toolsRegistry +
> getToolsForAI/executeTool). El Portal añade la PUERTA guardada para que un agente externo
> (Claude Code, Cursor) la use vía MCP — sin tocar el core. El poder no es nuevo; lo nuevo es el GUARD.

## Arquitectura (el bridge no toca el core; habla por el bus)

```
agente externo ──MCP(stdio)──► mcp/enki-mcp-server.js ──MQTT(ui/request/portal/*)──► modules/portal ──► executeTool()
                                  (bridge VANILLA, sin SDK)                            (el GUARD vive AQUÍ)
  MCP tools/list → ui/request/portal/list_tools   ·   MCP tools/call → ui/request/portal/call
```

## modules/portal (reflejo {{version:modules/portal}}) — la superficie GUARDADA

```
list_tools  catálogo filtrado por el guard (lo que el cliente externo PUEDE ver)
call        invoca una tool tras el guard → moduleLoader.executeTool → audita
health      estado (activo, mode, scope, project_id, allowlist)

GUARD (lo único nuevo; el poder ya existía) {
  INTERRUPTOR 'portal-mcp'  grupo 'sistema' · OFF por defecto · kill-switch en caliente
                            OFF = puerta CERRADA → list_tools vacío + call 503 (PORTAL_CERRADO)
  SCOPE  project|system     default project: NO sale del project_id (inyecta/valida) ni toca
                            tools de sistema (db·module·interruptor·plugin·code·security·…)
  MODE   read|write         default read: no expone ni ejecuta MUTACIONES (verbos crear/editar/
                            borrar/enviar/… o confirmation:true)
  ALLOWLIST  opcional       si se define, SOLO esas tools (manda sobre scope y mode)
  CONFIRMACION              tool con confirmation:true exige confirmado:true (409 si falta)
  AUDIT  portal.invocado    cada acceso → la propiocepción lo capta (ningún acto-puerta invisible)
}
```

## El bridge (mcp/enki-mcp-server.js) + arranque

```
JSON-RPC 2.0 por stdio (delimitado por \n) · logs SOLO a stderr (stdout es el canal MCP).
El guard vive en el módulo → el bridge es TONTO (initialize · tools/list · tools/call → portal).
ENV: ENKI_BROKER_URL (mqtt://localhost:1883) · ENKI_PROJECT (scope) · ENKI_PORTAL_TIMEOUT (8000)
REGISTRO:  claude mcp add enki -- node /ruta/2enki/mcp/enki-mcp-server.js
ENCENDER:  interruptor 'portal-mcp' ON (panel o interruptores.set) — nace OFF (aparcado)
```

## Orden de apertura (el riesgo se abre de a poco)

```
NACE   scope=project · mode=read · interruptor OFF
SUBE   read→write (mutar UN proyecto)  ANTES QUE  project→system (operar el cerebro entero)
LUEGO  la PUERTA-DIOS MQTT (scope system: module.reload, db cross-project, interruptores) reusa
       ESTE MISMO guard ya rodado — no se rehace la seguridad, se hereda probada.
```

> Filosofía: la puerta cerrada protege un estado nombrable —*el sistema no se opera sin llave
> (interruptor), sin testigo (audit) ni freno (scope/mode)*— por eso es un Mandato, no miedo.

## La skill que entra por esta puerta (desde cloud)

```
.claude/skills/conexion-mcp — helper enki-portal.js: health · tools [filtro] · call <tool> [--project] [--confirmado]
  transporte wss://<host>/mqtt (443; el 1883 no sale de cloud) → ui/request/portal/*
  LEE los dos interruptores (portal-mcp · escritura) y OBEDECE: 503/403 → nombra el botón apagado al humano
  hermana: conexion-mqtt = puerta directa SIN guard (dominios ui/request) — esta = la puerta AUDITADA para tools
```

## Topics / eventos

```
ui/request/portal/list_tools · ui/request/portal/call · ui/request/portal/health  (entrada del bridge)
interruptor.registrar {id:'portal-mcp', grupo:'sistema', default:OFF}              (registra su botón)
interruptor.cambiado → onInterruptorCambiado (id='portal-mcp')                     (on/off en caliente)
portal.invocado {tool, ok, duracion_ms, scope, mode, error}                        (AUDIT → propiocepción)
```
