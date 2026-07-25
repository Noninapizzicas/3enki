---
name: disenador-modulos
description: "Diseña módulos para el sistema Enki. Parte del dominio analizado por el esquematizador y la rebanada patron/modulo-real.md como referencia, y produce el diseño completo del módulo (module.json + index.js + tests) listo para que productor-modulos lo valide y escriba en modules/<nombre>/."
fuente: enki
dominio: sistema
lente_dominio: desarrollo
tags: [modulo, diseno, generacion, template, reflejo, sistema]
---

# Diseñador de Módulos

Diseña módulos para el sistema Enki. No escribe archivos — solo produce el diseño.
El que escribe es `productor-modulos`.

## Proceso

### Fase 0 — Cargar la rebanada

Lee `arquitectura/cabecera/patron/modulo-real.md` como referencia del patrón vivo.
Esta rebanada documenta la estructura REAL de un módulo (no el `_template` arcaico).

### Fase 1 — Esquematizar el dominio

Aplica `esquematizador` al dominio del módulo:
- Prisma de 5 huecos: IDENTIDAD, RESTRICCIONES, CONTRATO, NO-OBJETIVOS, PREGUNTAS_ABIERTAS
- Recursión hasta el suelo: átomos, abiertos, repetidos
- Disección: asigna FORMA a cada pieza (reflejo, micro-agente, custodio, conversor, puente)

Persiste el resultado en `esquema/<modulo>/`.

### Fase 2 — Diseñar el módulo

Con la anatomía del dominio + la rebanada como referencia, produce:

**`module.json`:**
- `_doc`: historia del módulo
- `name`: snake_case
- `version`: 0.1.0
- `_v0_1_0_nota`: changelog inicial
- `description`: una línea
- `language`: es
- `subscribes`: eventos request/response del dominio + project.activated si persiste
- `publishes`: eventos fire-and-forget que emite

**`index.js`:**
- Clase que extiende `ModuloHibridoReflejo`
- Constructor con `name`, `version`, `Map` de estado
- PosPersistencia si persiste datos
- `onUnload()` con flush
- `onProjectActivated()` con restauración
- Handlers con patrón `_atender(evento, op, responseTopic, proyeccion)`
- Proyecciones deterministas

**`tests/unit/<modulo>__<handler>.test.js`:**
- Test mínimo que verifica la proyección principal

### Fase 3 — Entregar

El diseño se entrega como JSON listo para `productor-modulos`:

```json
{
  "nombre": "mi-modulo",
  "module_json": { ... },
  "index_js": "código fuente...",
  "test_js": "código de test..."
}
```

La validación y escritura las hace `productor-modulos`.
