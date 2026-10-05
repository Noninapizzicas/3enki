---
name: puerto-fuente-datos
description: >-
  PUENTE del vertical NICHOS (bloque J · fuentes de datos — J1): fachada que
  orquesta el consumo de fuentes externas (crawl4rs, APIs) sin que el
  consumidor conozca el proveedor. Pre-chequea límites (J3), delega la llamada
  externa via bus (crawl4rs.buscar/leer), normaliza (J2), imputa coste (J4) y
  devuelve el resultado crudo. Carga este módulo cuando un componente del
  vertical NICHOS necesite consumir datos de una fuente externa (web, API)
  orquestando límites e imputación de forma transparente.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: puente
tags: [nichos, puente, fuente-datos, crawl4rs, bloque-j, bus, mqtt, orquestador]
---

# nichos · puerto-fuente-datos

> **Qué es.** PUENTE (bloque J, J1) del vertical NICHOS. Fachada única para
> consumir fuentes externas de datos (web, APIs). Orquesta el ciclo completo:
> pre-check de límites, llamada externa via bus, normalización y coste.
>
> Código: `modules/nichos/puerto-fuente-datos/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **PUENTE** (fachada de orquestación sobre servicios externos).
- Base: `ModuloHibridoReflejo` (mitad REFLEJO, JS determinista).
- Sin estado persistido propio — es orquestador de paso.
- No hace HTTP directo: toda llamada externa se publica al bus (crawl4rs)
  y credential-manager resuelve las API keys.

## Eventos

### Atiende (request -> response)

| Evento | Handler | Qué hace |
|---|---|---|
| `nichos.fuente.consumir.request` | `onConsumirRequest` | Orquesta pre-check + llamada externa + normalización + imputación. Payload request: `{fuente, peticion, project_id?, correlation_id}`. Response: `{status:200, data:{resultado_crudo}}` |

### Payload de `.consumir.request`

```json
{
  "request_id": "uuid",
  "fuente": { "tipo": "buscar", "nombre": "crawl4rs", "coste_unitario": 0.01 },
  "peticion": { "query": "tendencias panadería artesanal 2026" },
  "project_id": "prj_xxx",
  "correlation_id": "corr_yyy"
}
```

### Publica al bus (orquestación)

| Evento | Destino | Descripción |
|---|---|---|
| `nichos.fuente.limites.puede.consumir.request` | J3 gestion-limites | Pre-check: ¿la fuente puede consumirse? |
| `crawl4rs.buscar.request` | crawl4rs | Búsqueda web (SearXNG) |
| `crawl4rs.leer.request` | crawl4rs | Lectura de URL concreta |
| `nichos.conversor.normalizar.request` | J2 conversor-fuente | Normaliza el crudo a dato homogéneo |
| `nichos.fuente.coste.registrado` | J4 imputacion-coste | Imputa coste de esta consulta al proyecto |

### Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.fuente.consumida` | tras consumo exitoso | `{fuente, importe, margen_restante}` |

## Cuándo se usa

- **B1 (sondeador-territorio)** consume fuentes para rastrear candidatos de nicho.
- **C1 (estudio-demanda)** consume fuentes para estudiar demanda de un candidato.
- **E1 (estudio-competencia)** consume fuentes para analizar competencia.
- Cualquier módulo del vertical que necesite datos externos orquestados.

## Integración (patrón RPC del bus)

```javascript
// CONSUMIR una fuente
const resp = await bus.publishAndWait('nichos.fuente.consumir.request', {
  fuente: { tipo: 'buscar', nombre: 'crawl4rs', coste_unitario: 0.01 },
  peticion: { query: 'tendencias panadería artesanal 2026' },
  project_id: 'prj_xxx'
});
const { resultado_crudo } = resp.data;
```

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `fuente` o `peticion` |
| 429 | `LIMITE_EXCEDIDO` | J3 dice que la fuente agotó su margen |
| 502 | `FUENTE_NO_DISPONIBLE` | crawl4rs no respondió o devolvió error |
