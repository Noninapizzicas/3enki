---
name: imputacion-coste-fuente
description: >-
  REFLEJO del vertical NICHOS (bloque J · interlocutor proveedor):
  registra y agrega el coste imputado por consumo de fuentes externas.
  Append-only por proyecto: cada consumo queda registrado con importe,
  fuente e instante. Consulta agrega coste por proyecto/fuente hasta
  un instante dado.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, reflejo, imputacion, coste, fuente, bloque-j, interlocutor-proveedor, pos-persistencia, bus, mqtt]
---

# nichos · imputacion-coste-fuente

> **Que es.** REFLEJO append-only (bloque J interlocutor proveedor) del
> vertical NICHOS. Registra cada consumo de fuente como entrada de coste
> imputado y ofrece consulta agregada por proyecto/fuente.
>
> Codigo: `modules/nichos/imputacion-coste-fuente/index.js`. La verdad viva
> es el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **REFLEJO** append-only.
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/costes-fuente.json` dentro del storage del proyecto.
- Append-only: las entradas de coste se acumulan y nunca se borran.
- Consulta filtra por `hasta` (ISO); sin `hasta`, agrega todo el historico.

## Campos del Store

| Campo | Tipo | Semantica |
|---|---|---|
| `entradas` | `Array<EntradaCoste>` | lista append-only de costes imputados |
| `EntradaCoste.fuente` | `String` | nombre de la fuente consumida |
| `EntradaCoste.importe` | `Number` | coste imputado del consumo |
| `EntradaCoste.concepto` | `String \| null` | razon o concepto del consumo |
| `EntradaCoste.registrado_en` | `ISO` | instante del registro |

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.fuente.coste.consultar.request` | `onConsultarRequest` | `{status:200, data:{coste:{total, por_fuente, entradas_count}}}` |

### Payload de `.consultar.request`

```json
{
  "request_id": "uuid",
  "id_proyecto": "prj_xxx",
  "hasta": "2026-10-04T23:59:59Z"
}
```

Sin `hasta`, agrega todo el historico del proyecto.

## Eventos que atiende (fire-and-forget)

| Evento | Handler | Que hace |
|---|---|---|
| `nichos.fuente.consumida` | `onFuenteConsumida` | append de entrada de coste y emite PULSO `nichos.fuente.coste.registrado` |
| `project.activated` | `onProjectActivated` | restaura los costes persistidos del proyecto |

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.fuente.coste.registrado` | tras registrar una entrada de coste | `{project_id, fuente, importe, concepto, timestamp}` |

## Cuando se usa

- **nichos-puerto-fuente-datos (J1)** consume una fuente y emite
  `nichos.fuente.consumida`; este modulo registra la entrada de coste.
- **nichos-gestion-limites-fuente (J3)** escucha `nichos.fuente.coste.registrado`
  para descontar del presupuesto.
- **nichos-cuadro-salud (F3)** y el **Jefe (K)** consultan el coste agregado
  con `.consultar.request`.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `id_proyecto` / `project_id` |

## Integracion (patron RPC del bus)

```javascript
// CONSULTAR COSTE AGREGADO
const resp = await bus.publishAndWait('nichos.fuente.coste.consultar.request', {
  id_proyecto: 'prj_xxx',
  hasta: '2026-10-04T23:59:59Z'
});
const { total, por_fuente, entradas_count } = resp.data.coste;
```
