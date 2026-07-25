---
name: productor-modulos
description: "Módulo de sistema que recibe un diseño de módulo (de disenador-modulos), lo valida contra el patrón real, y lo escribe en modules/<nombre>/. Tiene un interruptor de seguridad (OFF por defecto) que hay que activar para autorizar la escritura."
fuente: enki
dominio: sistema
lente_dominio: desarrollo
tags: [modulo, sistema, productor, escritura, validacion, modules]
---

# Productor de Módulos — brazo ejecutor

Recibe el diseño de `disenador-modulos`, lo valida contra el patrón de `modulo-real.md`, y lo materializa en `modules/<nombre>/`.

## Interruptor de seguridad

`productor-modulos.habilitado` — OFF por defecto. Activarlo en el panel de interruptores autoriza la escritura en `modules/`. Sin él, `productor.producir` devuelve 403.

## Tools

| Tool | Qué hace |
|---|---|
| `productor.producir` | Valida + escribe module.json + index.js + tests en modules/ |
| `productor.validar` | Solo valida, no escribe |

## Validaciones que aplica

- Nombre en snake_case
- module.json: name, version, description, subscribes con handler
- index.js: extiende ModuloHibridoReflejo, contiene los handlers declarados
- Colisión: no sobrescribe si ya existe modules/<nombre>/
