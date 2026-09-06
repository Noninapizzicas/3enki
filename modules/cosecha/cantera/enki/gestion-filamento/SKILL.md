---
name: gestion-filamento
description: >
  Skill FULL del módulo gestion-filamento (CUSTODIO) del proyecto 3D — taller
  personal de impresión 3D. Gestiona el filamento por LONGITUD (mm): registrar
  rollos (tipo, color, longitud restante estimada), verificar disponibilidad,
  decrementar el stock tras una impresión y avisar de agotamiento. Es el ÚNICO
  escritor de su store (Map<id,Filamento>). Úsala para operar, depurar o
  extender el módulo: contrato de eventos, RPCs, reglas de negocio y
  verificación.
when-to-use: >
  Cuando necesites registrar rollos de filamento, decrementar stock tras una
  impresión, listar el inventario de filamento, entender el contrato de eventos
  (subscribes/publishes), depurar el módulo gestion-filamento del proyecto 3D,
  o verificar su comportamiento con el test unitario.
tags: [enki, 3d, custodia, filamento, impresion-3d, reflejo, pos-persistencia]
---

# gestion-filamento — CUSTODIO del filamento (proyecto 3D)

## Qué hace el módulo

`gestion-filamento` es un **CUSTODIO** del proyecto 3D (taller personal de
impresión 3D, impresora SPARKX i7). Gestiona el filamento **por longitud en
milímetros (mm)**: la impresora reporta `filament_used` en mm y el decremento
de stock se hace por longitud.

Es el **único escritor de su store** (`Map<id, Filamento>`). Reglas de
traducción del plan: *CLASE con estado → CUSTODIO (single-writer de su store,
PosPersistencia por proyecto)*. La lógica de negocio vive DENTRO del módulo
como proyecciones `_op`; `_shared/` solo infraestructura.

**Rol en el sistema**: lo llaman el **dueño** (registrar / listar) y
**ciclo-impresion** (decrementar). También escucha el evento fire-and-forget
`filamento.usado` (la impresora reporta `filament_used` en mm) para decrementar
el rollo activo del proyecto.

**Persistencia**: por proyecto vía `_shared/pos-persistencia` (snapshot fs por
`project_id`, debounced) en `/3d/filamento/gestion-filamento.json`. Restaura en
`project.activated`; vuelca en `onUnload`.

**Referencia del plan**: `plan-construccion.md` sección 6.4 (hoja CONSTRUIR),
piezas 6.1 (registro), 6.2 (decremento de stock), 6.3 (detección de bajo),
pregunta abierta 5 (umbral configurable), invariante 9.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `filamento.registrar.request` | `onRegistrarRequest` | Reflejo JS: registra un rollo (tipo, color, longitud restante estimada en mm) y emite `filamento.registrado`. |
| `filamento.decrementar.request` | `onDecrementarRequest` | Reflejo JS: decrementa el stock de un rollo por longitud (mm) y emite `filamento.decrementado` (+ `filamento.bajo` si cae bajo el umbral). |
| `filamento.listar.request` | `onListarRequest` | Reflejo JS: lista los rollos de filamento del proyecto. |
| `filamento.usado` | `onFilamentoUsado` | Reflejo JS: fire-and-forget de la impresora (`filament_used` en mm); decrementa el rollo activo del proyecto. |
| `project.activated` | `onProjectActivated` | Reflejo JS: restaura los rollos persistidos de ese proyecto desde `/3d/filamento/gestion-filamento.json`. |

### Publishes

| Evento | Descripción |
|---|---|
| `filamento.registrado` | Emitido al registrar un rollo de filamento. |
| `filamento.decrementado` | Emitido al decrementar el stock de un rollo por longitud. |
| `filamento.bajo` | Emitido cuando un rollo cae bajo el umbral de filamento bajo. |
| `filamento.decrementar.failed` | Par de fallo: el decremento no se completó (rollo inexistente o longitud desconocida). |

> **Regla de cierre de círculo**: todo flujo cierra su círculo con un par de
> resultado canónico (`*.failed` / `ok:false`). Nadie da por hecho un decremento
> sin `ok:true` explícito.

## Cómo se usa (RPCs)

Los handlers RPC usan el patrón `_atender(e, op, responseEvent, proyeccion)`:
responden al evento `request` con el evento `response` correspondiente.

| RPC (request) | Response | Proyección | Llamado por |
|---|---|---|---|
| `filamento.registrar.request` | `filamento.registrar.response` | `_registrar` | dueño |
| `filamento.decrementar.request` | `filamento.decrementar.response` | `_decrementar` | ciclo-impresion |
| `filamento.listar.request` | `filamento.listar.response` | `_listar` | adaptador-avisos (panel) |

### Payloads

- **registrar**: `{ project_id, tipo, color?, longitud_inicial?, id?, activo? }`
  - `tipo` y `project_id` obligatorios (si no → `INVALID_INPUT` 400).
  - `longitud_inicial` numérico > 0 → se usa como `longitud_inicial` y
    `longitud_restante`. Ausente o no válido → `null` (longitud desconocida).
  - `color` por defecto `'desconocido'`. `activo` solo si `=== true`.
  - `id` opcional; si no, se genera `crypto.randomUUID()`.
- **decrementar**: `{ project_id, rollo_id, filament_used }`
  - `filament_used` debe ser número en mm ≥ 0 (si no → `INVALID_INPUT` 400).
- **listar**: `{ project_id }` (filtra por proyecto; marca `bajo` por rollo).

## Reglas de negocio

1. **Registro por longitud mm**: cada rollo guarda `longitud_inicial` y
   `longitud_restante` en mm. El decremento resta `filament_used` (mm) de
   `longitud_restante` con **piso 0** (`Math.max(0, restante - usado)`).
2. **Decremento tras impresión**: `_decrementar` aplica `_decrementarStock`
   (pieza 6.2, resta acumulada) y luego `_detectarBajo` (pieza 6.3). Emite
   `filamento.decrementado` siempre; emite `filamento.bajo` si cae bajo el
   umbral.
3. **Aviso de agotamiento**: `_detectarBajo` devuelve `true` si
   `longitud_restante <= umbralBajo`. El umbral es **configurable**
   (`this.umbralBajo = 5000` mm por defecto — pregunta abierta 5 del plan).
4. **longitud_desconocida**: si `longitud_inicial` es `null`, el rollo se
   registra con `longitud_desconocida: true` (nunca se inventa un valor). Un
   rollo con `longitud_restante === null` **NO se decrementa** → responde
   `LONGITUD_DESCONOCIDA` (409) y emite `filamento.decrementar.failed`
   (invariante 9).
5. **Rollo activo**: `filamento.usado` (fire-and-forget) decrementa el rollo
   con `activo: true` del proyecto. Si no hay rollo activo, no hace nada
   (honesto, no decrementa a ciegas).
6. **Un solo escritor**: solo este módulo escribe en su store. `_registrar`
   rechaza id duplicado con `ALREADY_EXISTS` (409) y NO sobreescribe.
7. **Dato ausente nombrado, nunca inventado**: `color` por defecto
   `'desconocido'`, `longitud_inicial`/`longitud_restante` `null` si se
   desconoce.

### Códigos de error

| Código | HTTP | Cuándo |
|---|---|---|
| `INVALID_INPUT` | 400 | falta `tipo`/`project_id`/`rollo_id`, o `filament_used` no es número ≥ 0 |
| `ALREADY_EXISTS` | 409 | id de rollo duplicado en `_registrar` |
| `RESOURCE_NOT_FOUND` | 404 | rollo inexistente o de otro proyecto en `_decrementar` |
| `LONGITUD_DESCONOCIDA` | 409 | decrementar un rollo con `longitud_restante === null` |

## Estructura del código

```
gestion-filamento/
├── module.json                          # manifest (subscribes/publishes)
├── index.js                             # class GestionFilamentoReflejo
├── _shared/
│   ├── modulo-hibrido-reflejo.js        # base (ModuloHibridoReflejo, _atender)
│   ├── pos-persistencia.js              # snapshot fs por project_id, debounced
│   └── base-module.js
└── tests/unit/
    └── gestion-filamento__decrementar.test.js
```

Clase: `GestionFilamentoReflejo extends ModuloHibridoReflejo`.
Estado: `this.filamentos = new Map()` (id → Filamento), `this.umbralBajo = 5000`.
Persistencia: `this._persist = new PosPersistencia({ modulo, file: 'gestion-filamento.json', dir: '/3d/filamento', snapshot, hidratar })`.

### Proyecciones deterministas

- `_registrar(input)` → 201 + `filamento.registrado`.
- `_decrementar(input)` → 200 + `filamento.decrementado` (+ `filamento.bajo`).
- `_listar(input)` → 200 con `{ filamentos, total }`.
- `_decrementarStock(filamento, usado)` → resta acumulada, piso 0 (pieza 6.2).
- `_detectarBajo(filamento)` → `longitud_restante <= umbralBajo` (pieza 6.3).
- `_rolloActivo(pid)` → primer rollo con `activo: true` del proyecto.

## Verificación (test unitario)

El test unitario fija el contrato de las proyecciones. Se ejecuta sin bus ni
fs (proyecciones puras, eventBus stub):

```bash
cd /opt/enki/modules/gestion-filamento
node tests/unit/gestion-filamento__decrementar.test.js
# → [gestion-filamento__decrementar] OK 11/11
```

Casos cubiertos:
- rollo bien formado → 201, guardado, emite `filamento.registrado`.
- sin `tipo` → `INVALID_INPUT` (400), no guarda.
- sin `project_id` → `INVALID_INPUT` (400).
- id duplicado → `ALREADY_EXISTS` (409), NO sobreescribe.
- longitud inicial ausente → `longitud_desconocida` (nunca inventada).
- decrementar por longitud → resta acumulada, piso 0, emite `decrementado`.
- rollo inexistente → `RESOURCE_NOT_FOUND` (404).
- rollo con longitud desconocida → `LONGITUD_DESCONOCIDA` (409), NO decrementa.
- decrementar bajo el umbral → emite `filamento.bajo`.
- `filamento.usado` decrementa el rollo activo (no toca el inactivo).
- `listar` filtra por `project_id` y marca `bajo`.

## Pitfalls

- **Permisos**: los archivos del módulo son `0600 www-data`. Para leerlos usa
  `sudo cat ...` (no `read_file` directo). NUNCA escribas en `/opt/enki/`.
- **No decrementar sin longitud**: un rollo con `longitud_restante === null`
  responde 409 `LONGITUD_DESCONOCIDA`; no intentes forzar el decremento.
- **`activo` es estricto**: solo se considera rollo activo si `activo === true`
  (booleano). `filamento.usado` sin rollo activo no hace nada.
- **Piso 0**: el stock nunca queda negativo; `_decrementarStock` usa
  `Math.max(0, ...)`.
- **Umbral configurable**: `umbralBajo` es un parámetro del módulo (pregunta
  abierta 5); no lo asumas fijo en 5000 al razonar sobre `filamento.bajo`.
