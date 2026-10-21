---
name: motor-cobro
description: >-
  REFLEJO sin estado del vertical NICHOS: ejecuta cobros según modelo (FIJO,
  PORCENTAJE, ESCALONADO, POR_USO). Consulta plantilla de cobro por bus,
  aplica el modelo al cliente, registra en registro-cobros por bus y devuelve
  recibo. Carga este módulo cuando el pipeline de monetización necesite ejecutar
  un cobro, cuando otro módulo quiera reaccionar al PULSO nichos.cobro.ejecutado
  o nichos.cobro.fallido, o cuando el flujo de facturación necesite un recibo.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, reflejo, cobro, monetizacion, recibo, bus, mqtt]
---

# nichos · motor-cobro

> **Qué es.** REFLEJO sin estado del vertical NICHOS. Ejecuta cobros según
> modelo de cobro (FIJO, PORCENTAJE, ESCALONADO, POR_USO), consulta plantilla
> de cobro por bus, aplica el modelo, registra en registro-cobros y devuelve
> recibo formateado.
>
> Código: `modules/nichos/motor-cobro/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **REFLEJO** sin estado (JS determinista).
- Base: `ModuloHibridoReflejo`.
- Sin estado propio. Cada cobro es independiente.

## Modelos de cobro

| Modelo | Semántica |
|---|---|
| `FIJO` | importe fijo definido en parámetros o plantilla |
| `PORCENTAJE` | porcentaje (`tasa`) sobre `monto_base` del cliente |
| `ESCALONADO` | tramos progresivos con tasa por tramo |
| `POR_USO` | `unidades × precio_unidad` |

## Eventos que atiende (request → response)

| Evento | Handler | Qué devuelve |
|---|---|---|
| `nichos.cobro.ejecutar.request` | `onEjecutarRequest` | `{status:200, data:{recibo}}` |

### Payload de `.ejecutar.request`

```json
{
  "request_id": "uuid",
  "id_nicho": "nicho_xxx",
  "modelo_cobro": {
    "tipo": "PORCENTAJE",
    "parametros": { "tasa": 10 }
  },
  "cliente": {
    "id": "cli_123",
    "nombre": "Acme Corp",
    "monto_base": 500
  }
}
```

## Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.cobro.ejecutado` | cobro ejecutado con éxito | `{id_nicho, recibo, timestamp}` |
| `nichos.cobro.fallido` | el cálculo o la ejecución falló | `{id_nicho, razon_codigo, detalle, timestamp}` |

## RPCs delegados al bus

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.perfil.cobro.plantilla.request` | antes de calcular, consulta plantilla vigente | `{request_id, id_nicho, modelo_cobro}` |
| `nichos.registro.cobros.registrar.request` | tras cobro exitoso, registra | `{request_id, id_nicho, recibo, timestamp}` |

## Proyecciones

- `_ejecutar(input)` — consulta plantilla, calcula importe, formatea recibo,
  registra y emite pulso.
- `_formatearRecibo(input, importe, plantilla)` — genera objeto recibo con
  `recibo_id`, datos del cliente, modelo, importe, moneda y timestamp.

## Invariantes

- **Sin estado**: no persiste nada. Cada cobro es independiente.
- **Degradación honesta**: si el registro-cobros falla, el cobro se considera
  ejecutado (el recibo se devolvió) y se loguea la degradación.
- **Plantilla opcional**: si la consulta de plantilla falla o no existe, se
  usan los parámetros del `modelo_cobro` directamente.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `id_nicho`, `modelo_cobro` o `cliente` |
| 400 | `MODELO_DESCONOCIDO` | `modelo_cobro.tipo` no está en el catálogo |
| 500 | `CALCULO_FALLIDO` | error en el cálculo del importe |

## Integración (patrón RPC del bus)

```javascript
// EJECUTAR cobro
const resp = await bus.publishAndWait('nichos.cobro.ejecutar.request', {
  id_nicho: 'nicho_xxx',
  modelo_cobro: { tipo: 'PORCENTAJE', parametros: { tasa: 10 } },
  cliente: { id: 'cli_123', monto_base: 500 }
});
const { recibo } = resp.data;
// recibo → { recibo_id, id_nicho, cliente_id, modelo, importe: 50, moneda: 'EUR', ... }
```

## Dónde encaja en el vertical NICHOS

- **Bloque D — monetización**: es el motor que ejecuta cobros según el modelo
  definido para el nicho. Lo invoca el pipeline (E) o el jefe (K) cuando un
  nicho monetizable necesita cobrar.
- Depende de `perfil-cobro-entrega` (que sirve la plantilla) y de
  `registro-cobros` (que persiste el historial).
