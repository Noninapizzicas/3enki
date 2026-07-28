---
name: enki-event-core
description: >-
  Event Core / Enki — plataforma event-driven modular Node.js con MQTT,
  70+ módulos, AI gateway multi-provider, POS (pizzepos), frontend SvelteKit
  y ecosistema Rust (enki-sense).
when-to-use: >-
  Documentación completa de la plataforma Enki. Consultar antes de tocar
  cualquier módulo, cuando se necesite entender la arquitectura, el sistema
  de cúpulas, los GLOBAL_TOOLS, el flujo de chat, los módulos clave, o
  los problemas conocidos del sistema.
source: hermes
tags: [enki, event-core, nodejs, mqtt, ai-gateway, sveltekit, caddy]
---

# Event Core / Enki Platform

Plataforma **Event Core** (codename: Enki) — event-driven modular Node.js.

Dominio: `enki-ai.online` (avanzada) · `pizzepos.es` (atrasada)

## Arquitectura

```
HTTP Gateway (:3000)  ←→  MQTT Broker Aedes (:1883 / WS :9001)  ←→  70+ Modules
       ↕                                    ↕
  Frontend SvelteKit (:3001)         MCP Bridge → external agents
       ↕
  Caddy HTTPS (reverse proxy + Let's Encrypt)
```

## Core

- broker/ (Aedes), mqtt/, events/, gateway/http, modules/, ui/, providers/
- flow/ (agentes), observability/ (logger, tracer, metrics), hooks/

Comunicación exclusiva por MQTT pub/sub + publishAndWait con correlation_id.
Topic: `core/<core_id>/events/<event/with/slashes>`

## Sistema de Cúpulas

6 cúpulas con patrón: búsqueda top-K → detalle → conducción vía bus:

| Cúpula | Módulo | Global Tool | Catálogo |
|--------|--------|-------------|----------|
| Eventos | cupula-eventos | buscar/detalle_capacidad | ~400 tools |
| Estados | estados | crear/anadir/completar/ver/borrar lista, fijar/evaluar | Listas con freno |
| Agentes | ai-agent-framework | buscar/activar/crear/invoke_agent | 397 agentes |
| Skills | cosecha + cantera-semantica | buscar/activar_skill | Skills en cantera |
| Cabecera | arquitectura/cabecera/ | Rebanadas .md | 7 dominios |
| Vault | cupulas | contexto/buscar/grafo/crear/add_nota | Notas wikilinks |

### GLOBAL_TOOLS (22)

invocar/buscar/activar/crear_agente · buscar/detalle_capacidad · buscar/activar_skill
· fs.read/list/search · crear/anadir/completar/ver/borrar_lista · fijar/evaluar_rail
· leer_web · descargar_web · leer_imagen · renderizar · traducir · transcribir
· analizar_sonido · decir · interpretar_trazo

Nota: `fs.write` NO es universal.

## Ecosistema Rust

### Servicios binarios
| Servicio | Puerto | Estado |
|----------|--------|--------|
| ocr4rs | :8090 | ✅ active |
| obscura | :9222 | ✅ active (CDP) |
| SearXNG | :8080 | docker |

### enki-sense motores
| Motor | Puerto | Función |
|-------|--------|---------|
| motor-oido | :8122 | Whisper transcripción |
| motor-ojo | :8120 | Render SVG/PDF/imagen |
| motor-sonido | :8123 | Prosodia/DSP |
| motor-traduce | :8121 | Traducción local |
| motor-trazo | :8125 | Canvas geometría |
| motor-voz | :8124 | TTS piper-rs |
| motor-coherencia | MQTT | ❌ sin systemd |

Ver la skill completa en Hermes (`enki-event-core`) para detalles de:
- Providers (8, deepseek-anthropic default)
- Módulos clave (AI, POS, comunicación, sistema)
- Flujo de chat (frontend → MQTT → ai-gateway → stream)
- Propiocepción (copia eferente del bus)
- Problemas conocidos (5 causas raíz)
- Patrón Módulo Híbrido (Reflejo + Blueprint)
- Despliegue (deploy.sh, systemd, Caddyfile)
- Workflow (ramas, PR, merge, deploy)
- Pitfalls (no editar /opt/enki, no editar Caddyfile directo, etc.)
