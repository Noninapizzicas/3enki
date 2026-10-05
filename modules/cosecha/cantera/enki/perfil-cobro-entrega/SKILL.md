---
name: perfil-cobro-entrega
description: >-
  CUSTODIO del vertical NICHOS (bloque I · interlocutor cliente — M1/M2/M3): ranura
  autorizada que guarda, POR tipo_nicho (empresa | persona | organismo), la plantilla
  declarada de preferencias de cobro+entrega (esquema, frecuencia, canal_cobro_default,
  canal_entrega, tiempo_entrega_max) con inmutabilidad por versión. Escritores
  autorizados: dueño | constructor (D1 ensamblador-solucion). Lectores libres por RPC.
  Carga este módulo cuando el proponedor-modelo-cobro (D4) necesite la plantilla base
  antes de proponer un modelo, cuando el motor-cobro (E3) o el canal-distribucion (E4)
  consulten la frecuencia/canal elegido, cuando el panel del dueño ajuste la plantilla,
  o cuando D1 siembre un perfil inicial tras ensamblar una solución nueva.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, perfil, cobro, entrega, tipo-nicho, bloque-i, m1, m2, m3, pos-persistencia, bus, mqtt]
---

# nichos · perfil-cobro-entrega

> **Qué es.** CUSTODIO (bloque I interlocutor cliente — M1/M2/M3 del vertical NICHOS)
> de la plantilla de preferencias de cobro+entrega POR tipo_nicho. Snapshot inmutable
> por versión indexado por tipo_nicho (empresa | persona | organismo), con los cinco
> campos que acotan cómo cobra y entrega el sistema a cada tipo de pagador.
>
> Código: `modules/nichos/perfil-cobro-entrega/index.js`. La verdad viva es el
> código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **CUSTODIO** (escritores autorizados, estado persistido).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/perfil-cobro-entrega.json`.
- Autores autorizados: `dueño` (canal directo) | `constructor` (D1 ensamblador-solucion,
  cuando siembra el perfil inicial de un nicho recién ensamblado).
- Esqueleto por defecto: cada tipo_nicho pedido por primera vez nace con todos sus
  campos en `ABIERTO` — el consumidor (D4 proponedor-modelo-cobro, E3 motor-cobro,
  E4 canal-distribucion) decide qué hacer con un ABIERTO; jamás se asume contrato.
- Tipos de nicho canónicos: `empresa` | `persona` | `organismo`.

## Campos del perfil (por tipo_nicho)

| Campo | Tipo | Semántica |
|---|---|---|
| `esquema` | `EsquemaCobro \| 'ABIERTO'` | `una_vez` \| `suscripcion` \| `uso` \| `mixto` — esquema de cobro preferido para este tipo de pagador |
| `frecuencia` | `Cadencia \| 'ABIERTO'` | cadencia natural del cobro (ej.: mensual, por_entrega, al_firmar) |
| `canal_cobro_default` | `NombrePuerto \| 'ABIERTO'` | puerto de cobro por defecto (stripe, bizum, transferencia, …) |
| `canal_entrega` | `NombrePuerto \| 'ABIERTO'` | puerto por donde se entrega lo pagado (telegram, email, api, físico) |
| `tiempo_entrega_max` | `Duracion \| 'ABIERTO'` | techo de latencia de entrega aceptable para este tipo de pagador |

## Eventos que atiende (request → response)

| Evento | Handler | Qué devuelve |
|---|---|---|
| `nichos.perfil.cobro.plantilla.request` | `onPlantillaRequest` | `{status:200, data:{perfil_cobro_entrega:{tipo_nicho, version, perfil, por_autor}}}` — esqueleto por defecto si no se declaró nada aún para ese tipo_nicho. 400 `TIPO_NICHO_DESCONOCIDO` si el tipo_nicho no está en el catálogo canónico |
| `nichos.perfil.cobro.declarar.request` | `onDeclararRequest` | `{status:200, data:{nueva_version, perfil_cobro_entrega}}` o `{status:403, error:{code:'PERMISSION_DENIED'}}` / `{status:400, error:{code:'TIPO_NICHO_DESCONOCIDO' \| 'INVALID_INPUT'}}` |

### Payload de `.plantilla.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "tipo_nicho": "empresa"
}
```

### Payload de `.declarar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "tipo_nicho": "empresa",
  "por_autor": "dueño",
  "cambio": {
    "esquema": "suscripcion",
    "frecuencia": "mensual",
    "canal_cobro_default": "stripe",
    "canal_entrega": "api",
    "tiempo_entrega_max": "PT1H"
  }
}
```

Campos del `cambio` no incluidos → se conservan del snapshot anterior del mismo
tipo_nicho. Campos fuera del esquema → 400 `INVALID_INPUT`. Tipo_nicho fuera de
`{empresa, persona, organismo}` → 400 `TIPO_NICHO_DESCONOCIDO`.

## Señales que escucha (fire-and-forget)

- `project.activated` → `onProjectActivated` — restaura el store persistido del
  proyecto desde `/prisma/pos/nichos/perfil-cobro-entrega.json` (PosPersistencia).

## Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.perfil.cobro.declarado` | tras aplicar una declaración válida | `{project_id, tipo_nicho, version, por_autor, timestamp}` |
| `nichos.perfil.cobro.declarado.failed` | rechazo por autor no autorizado, tipo_nicho desconocido o cambio inválido | `{project_id, tipo_nicho, code, message, timestamp}` |

## Invariantes

- **Escritores autorizados**: solo `dueño` o `constructor`. Otro autor → 403
  `PERMISSION_DENIED` + pulso `.declarado.failed`.
- **Inmutabilidad por versión POR tipo_nicho**: cada declaración crea un snapshot
  nuevo (`version++`) del tipo_nicho tocado; los otros tipos no se mueven. El
  historial queda en `por_autor[]` con `{version, autor, cambio, at}`.
- **ABIERTO explícito**: la ausencia de un valor se nombra como `'ABIERTO'`, no
  se omite. El consumidor sabe que no se asume nada.
- **Catálogo cerrado de tipo_nicho**: `empresa | persona | organismo`. Cualquier
  otro → 400 `TIPO_NICHO_DESCONOCIDO`.
- **Degradación honesta**: sin `project_id` el store queda sólo en memoria.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id`/`tipo_nicho`/`por_autor`/`cambio`, o `cambio` trae campos fuera del esquema |
| 400 | `TIPO_NICHO_DESCONOCIDO` | `tipo_nicho` no está en `{empresa, persona, organismo}` |
| 403 | `PERMISSION_DENIED` | `por_autor` no está en `['dueño','constructor']` |

## Integración (patrón RPC del bus)

```javascript
// LEER (D4 proponedor-modelo-cobro antes de afinar el modelo)
const r = await bus.publishAndWait('nichos.perfil.cobro.plantilla.request', {
  project_id, tipo_nicho: 'empresa'
});
const base = r.data.perfil_cobro_entrega.perfil;
if (base.esquema === 'ABIERTO') modelo.esquema = heuristicaPorDefecto(solucion);
else modelo.esquema = base.esquema;

// DECLARAR (dueño elige esquema de cobro para 'persona')
await bus.publishAndWait('nichos.perfil.cobro.declarar.request', {
  project_id, tipo_nicho: 'persona', por_autor: 'dueño',
  cambio: { esquema: 'una_vez', canal_cobro_default: 'bizum' }
});

// DECLARAR (D1 constructor siembra un perfil inicial tras ensamblar)
await bus.publishAndWait('nichos.perfil.cobro.declarar.request', {
  project_id, tipo_nicho: 'organismo', por_autor: 'constructor',
  cambio: { esquema: 'uso', frecuencia: 'por_entrega', canal_entrega: 'email' }
});
```

## Dónde encaja en el vertical NICHOS

- **Bloque I — interlocutor cliente (M1/M2/M3 refuerzan)**: define, por tipo de
  pagador, cómo se cobra y cómo se entrega. Es la plantilla base de la que parte
  cualquier modelo propuesto.
- Lectores habituales: `nichos-proponedor-modelo-cobro` (D4) la lee en cada
  propuesta; `nichos-motor-cobro` (E3) y `nichos-canal-distribucion` (E4) la
  consultan al ejecutar.
- Escritor adicional: `nichos-ensamblador-solucion` (D1, autor `constructor`)
  siembra el perfil inicial cuando un nicho se ensambla y necesita un contrato
  de pago/entrega deducido.
- No depende de otro módulo del vertical para arrancar (solo `project.activated`
  del core). Es raíz del grafo del bloque I.
