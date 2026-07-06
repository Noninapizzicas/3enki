---
id: modulos/operativos-sin-seccion
dominio: modulos
resumen: Fichas breves de módulos vivos que aún no tienen sección propia — cupulas, inventario, mise-en-place, metricas, notas-poc, staff-manager, system-coherence-analyzer, system-inspector.
fuentes:
  - modules/cupulas/**
  - modules/inventario/**
  - modules/mise-en-place/**
  - modules/metricas/**
  - modules/notas-poc/**
  - modules/staff-manager/**
  - modules/system-coherence-analyzer/**
  - modules/system-inspector/**
verificado: 2026-07-06
---

# MÓDULOS OPERATIVOS SIN SECCIÓN PROPIA — fichas mínimas (adopción pendiente)

> Módulos vivos (reflejo JS puro, sin blueprint) que el barrido histórico no documentó.
> Ficha mínima para que existan en la cabecera; cuando alguno crezca a subsistema, gana
> rebanada propia y su ficha se muda. Descripciones tomadas de sus module.json.

```
cupulas ({{version:modules/cupulas}})
  Bóveda estilo Obsidian con prosa mínima: cúpulas temáticas por TIPO DE PRIMITIVA
  (skill/agente/handler/blueprint/clase/...) de notas-código. Semilla: scripts/seed-cupulas.js.

inventario ({{version:modules/inventario}})
  Inventario por proyecto con stock_real + reservas con expiración. Multi-proyecto:
  cada proyecto su propio data/projects/<slug>/inventario. Carpeta services/ propia.

mise-en-place ({{version:modules/mise-en-place}})
  Planificación previa al servicio: escalado de recetas a porciones objetivo y planes
  de producción (qué recetas en qué franja con cuántas porciones). Pareja operativa de
  pase-cocina (fichas de pase + incidencias, documentado en grupo-b).

metricas ({{version:modules/metricas}})
  Instrumentación pasiva del sistema: escucha wildcards de sufijo (*.creado/*.actualizado/
  *.eliminado/*.error/*.completado) y mantiene counters + gauges.

notas-poc ({{version:modules/notas-poc}})
  Notas rápidas con persistencia JSON. POC del rewrite aplicando los contratos
  arquitectónicos (documento de trabajo vivo, no producto).

staff-manager ({{version:modules/staff-manager}})
  Control de personal con tarjetas NFC NTAG215: jornadas (tap_in/tap_out con auto_timeout
  y manager_close) y onboarding de tablets vía core-tag. Frontend: StaffScreen/FichajeBoard.

system-coherence-analyzer ({{version:modules/system-coherence-analyzer}})
  Agente meta-sistema: analiza coherencia transversal del repo (patrones consistentes vs
  divergentes, anti-patrones implícitos, drift implícito).

system-inspector ({{version:modules/system-inspector}})
  Captura estado del sistema (HTTP, MQTT, errores, logs) en buffer circular in-memory +
  snapshot atómico a JSON. 4 APIs HTTP read-only.
```
