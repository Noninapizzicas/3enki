---
id: patron/modulo-real
dominio: patron
resumen: La estructura REAL de un módulo en 3enki. No la del _template (arcaico). Extraída del código vivo de prisma/carrito, prisma/cobro, prisma/cuenta.
fuentes:
  - modules/prisma/**/module.json
  - modules/prisma/**/index.js
  - modules/_shared/modulo-hibrido-reflejo.js
  - modules/_shared/pos-persistencia.js
verificado: 2026-07-25
---

# Módulo Real — patrón extraído del código vivo

> El `_template/module.json` es arcaico (primeros pasos del sistema).
> Los módulos reales evolucionaron a una estructura más simple y consistente.
> Esta rebanada documenta el patrón VIVO.

## `module.json` — lo que realmente se usa

```json
{
  "_doc": "Descripción larga del módulo: origen, cambios clave, decisiones de diseño.",
  "name": "carrito",
  "version": "0.2.0",
  "_v0_2_0_nota": "Changelog por versión. Se acumulan: _v0_1_0_nota, _v0_2_0_nota...",
  "description": "Una línea: qué hace el módulo.",
  "language": "es",

  "subscribes": [
    { "event": "carrito.get.request",       "handler": "onGetRequest",       "description": "Descripción del handler." },
    { "event": "carrito.add_item.request",  "handler": "onAddItemRequest",  "description": "Añade un ítem." },
    { "event": "project.activated",         "handler": "onProjectActivated", "description": "Restaura estado persistido del proyecto." }
  ],

  "publishes": [
    { "event": "carrito.item_agregado", "description": "Evento emitido al añadir un ítem." }
  ]
}
```

**Reglas del `module.json` real:**
- `_doc` reemplaza a `config` — la documentación larga va aquí, no en un campo estructurado
- `_v*_nota` — changelog por versión, se acumulan hacia arriba (la más reciente primero)
- `subscribes` — array plano, no anidado en `events.subscribes`. Cada handler es un método de la clase
- `publishes` — array plano de eventos que emite (fire-and-forget). Opcional, muchos módulos no lo declaran
- **NO tiene**: `tools`, `ui_handlers`, `dependencies`, `config`, `observability`, `author`
- `project.activated` es obligatorio si el módulo persiste estado

## `index.js` — el esqueleto del reflejo

```javascript
'use strict';
const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class MiModuloReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'mi-modulo';
    this.version = 'reflejo-0.1.0';
    this.miStore = new Map();   // estado en memoria

    this._persist = new PosPersistencia({
      modulo: this, file: 'mi-modulo.json',
      snapshot: (pid) => ({ datos: [...this.miStore].filter(([, v]) => v.project_id === pid) }),
      hidratar: (pid, data) => { for (const [k, v] of (data.datos || [])) this.miStore.set(k, v); }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }
  onProjectActivated(e) { const d = (e && (e.data || e)) || {}; return this._persist.restaurar(d.project_id); }

  // Patrón de handler: _atender(evento, op, responseTopic, proyección)
  onMiOpRequest(e) { return this._atender(e, 'mi_op', 'mi-modulo.mi_op.response', d => this._miOp(d)); }

  _miOp(input) {
    // proyección determinista
    return { status: 200, data: { resultado: 'ok' } };
  }
}

module.exports = MiModuloReflejo;
```

**Reglas del `index.js` real:**
- Extiende `ModuloHibridoReflejo` (de `_shared/modulo-hibrido-reflejo.js`)
- Usa `PosPersistencia` (de `_shared/pos-persistencia.js`) para persistencia por proyecto
- `onUnload()` hace flush de la persistencia
- `onProjectActivated()` restaura estado del proyecto
- `_atender(evento, op, responseTopic, fn)` es el helper canónico: recibe el evento, llama a la proyección, publica la respuesta
- Cada handler es una línea: delega en `_atender`
- Las proyecciones (`_miOp`) son funciones puras: reciben input, devuelven `{ status, data }`

## Lo que NO tiene un módulo real (vs `_template`)

| Campo del `_template` | Está en módulos reales? |
|---|---|
| `author` | ❌ No |
| `publishes` (con response_schema_ref) | ❌ No usan ese formato. Los eventos emitidos van en array plano o implícitos |
| `tools` | ❌ No (los blueprints llevan las tools, no el module.json) |
| `ui_handlers` | ❌ No |
| `dependencies` | ❌ No (las dependencias son implícitas por los RPC que hacen) |
| `config.enabled` | ❌ No |
| `config.persistence` | ❌ No (se configura en PosPersistencia directamente) |
| `observability` | ❌ No |

## Ciclo de vida del módulo

```
carga → onLoad(context)
         → project.activated → onProjectActivated → restaura estado persistido
         → eventos del bus → handlers → proyecciones → responses
         → (onUnload) → flush persistencia
```

## Dependencias comunes

- `_shared/modulo-hibrido-reflejo.js` — clase base (obligatorio)
- `_shared/pos-persistencia.js` — persistencia por proyecto (si persiste datos)
- `crypto` — para UUIDs (obligatorio casi siempre)
