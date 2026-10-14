---
name: gestion-limites-fuente
description: >-
  REFLEJO del vertical NICHOS (bloque J · interlocutor proveedor):
  gestiona el presupuesto de consumo por fuente externa y proyecto.
  Pre-check de si una fuente puede consumirse (hay margen) y descuento
  tras consumo efectivo. Store persistido por proyecto con ventana temporal.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, reflejo, limites, fuente, bloque-j, interlocutor-proveedor, presupuesto, pos-persistencia, bus, mqtt]
---

# nichos · gestion-limites-fuente

> **Que es.** REFLEJO + CUSTODIO ligero (bloque J interlocutor proveedor)
> del vertical NICHOS. Controla el presupuesto de consumo por fuente
> externa y proyecto: quien puede consumir y cuanto queda.
>
> Codigo: `modules/nichos/gestion-limites-fuente/index.js`. La verdad viva
> es el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **REFLEJO** con custodia ligera de presupuesto.
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/limites-fuente.json` dentro del storage del proyecto.
- Convenio de ventana: el presupuesto se define por ventana temporal. Fuera
  de ventana, se resetea el consumido a 0 y se abre nueva ventana.
- Fuente sin presupuesto declarado: `puede=true`, `margen=Infinity` (abierto).

## Campos del Store

| Campo | Tipo | Semantica |
|---|---|---|
| `por_fuente` | `Object<String, EntradaFuente>` | mapa nombre_fuente a su estado de presupuesto |
| `EntradaFuente.presupuesto` | `Number \| null` | limite maximo por ventana (null = abierto) |
| `EntradaFuente.consumido` | `Number` | acumulado gastado en la ventana actual |
| `EntradaFuente.ventana_inicio` | `ISO` | inicio de la ventana temporal vigente |
| `EntradaFuente.ventana_fin` | `ISO` | fin de la ventana temporal vigente |

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.fuente.limites.puede.consumir.request` | `onPuedeConsumirRequest` | `{status:200, data:{puede:Boolean, margen:Number}}` |

### Payload de `.puede.consumir.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "fuente": "crawl4rs"
}
```

## Eventos que atiende (fire-and-forget)

| Evento | Handler | Que hace |
|---|---|---|
| `nichos.fuente.coste.registrado` | `onCosteRegistrado` | descuenta el importe del presupuesto de la fuente y emite PULSO `nichos.fuente.consumida` |
| `project.activated` | `onProjectActivated` | restaura los limites persistidos del proyecto |

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.fuente.consumida` | tras descontar un consumo | `{project_id, fuente, importe, margen_restante, timestamp}` |

## Cuando se usa

- **nichos-puerto-fuente-datos (J1)** llama a `.puede.consumir.request` antes
  de lanzar una consulta a una fuente externa: si `puede=false`, aborta con
  presupuesto agotado.
- **nichos-imputacion-coste-fuente (J4)** emite `nichos.fuente.coste.registrado`
  tras registrar un coste, y este modulo descuenta el importe del presupuesto.
- **El Jefe (bloque K)** puede configurar los presupuestos por fuente a traves
  del perfil de limites de busqueda (B3).

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id` o `fuente` |

## Integracion (patron RPC del bus)

```javascript
// PRE-CHECK
const resp = await bus.publishAndWait('nichos.fuente.limites.puede.consumir.request', {
  project_id,
  fuente: 'crawl4rs'
});
if (!resp.data.puede) {
  // presupuesto agotado para esta fuente
}
```
