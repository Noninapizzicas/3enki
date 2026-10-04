---
name: conversor-fuente
description: >-
  CONVERSOR del vertical NICHOS (bloque J · interlocutor proveedor):
  homogeneiza crudo heterogeneo de fuentes externas (crawl4rs, APIs,
  scrapers) en un dato con esquema estable para los consumidores del
  vertical. RPC puro sin estado.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: conversor
tags: [nichos, conversor, fuente, bloque-j, interlocutor-proveedor, bus, mqtt, normalizacion]
---

# nichos · conversor-fuente

> **Que es.** CONVERSOR puro (bloque J interlocutor proveedor) del vertical
> NICHOS. Recibe el crudo heterogeneo de cada fuente externa y lo normaliza
> a un esquema estable (`dato_homogeneo`) que el resto del vertical consume
> sin saber de que fuente vino.
>
> Codigo: `modules/nichos/conversor-fuente/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **CONVERSOR** (transformacion determinista, sin estado).
- Base: `ModuloHibridoReflejo` (sin `PosPersistencia`).
- RPC puro: recibe crudo + origen, devuelve dato_homogeneo.
- Degradacion honesta: si el origen es desconocido, envuelve el crudo con
  `origen_desconocido: true` en lugar de fallar.

## Campos del dato_homogeneo

| Campo | Tipo | Semantica |
|---|---|---|
| `titulo` | `String \| null` | titulo o nombre extraido del crudo |
| `contenido` | `String \| null` | cuerpo o texto principal |
| `url` | `String \| null` | URL de procedencia |
| `meta` | `Object` | metadatos adicionales segun origen |
| `origen` | `String` | identificador de la fuente (crawl4rs, google-trends, etc.) |
| `normalizado_en` | `ISO` | timestamp de la normalizacion |
| `origen_desconocido` | `Boolean` | true si no hay normalizador especifico para el origen |

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.conversor.normalizar.request` | `onNormalizarRequest` | `{status:200, data:{dato_homogeneo:{titulo, contenido, url, meta, origen, normalizado_en, origen_desconocido}}}` |

### Payload de `.normalizar.request`

```json
{
  "request_id": "uuid",
  "crudo": { "title": "...", "text": "...", "url": "..." },
  "origen": "crawl4rs"
}
```

## Eventos que emite

Ninguno (RPC puro sin pulsos propios).

## Cuando se usa

- **nichos-puerto-fuente-datos (J1)** llama a este conversor tras recibir el
  crudo de crawl4rs u otra fuente, para entregar un dato homogeneo al resto
  del vertical.
- Cualquier modulo que reciba datos crudos de una fuente externa y necesite
  normalizarlos antes de procesarlos.

## Origenes soportados

| Origen | Campos que extrae |
|---|---|
| `crawl4rs` | title/titulo, text/content/contenido, url/link, meta |
| `google-trends` | query/keyword, summary/description, url, interest+region |
| `api-mercado` | name/titulo, body/contenido, endpoint/url, meta |
| `searxng` | title, content/snippet, url/href, engine+score |
| _(desconocido)_ | intenta title/titulo/name, content/contenido/text/body, url/link; marca `origen_desconocido: true` |

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `crudo` (o no es objeto) o falta `origen` |

## Integracion (patron RPC del bus)

```javascript
const resp = await bus.publishAndWait('nichos.conversor.normalizar.request', {
  crudo: { title: 'Mi pagina', text: 'Contenido...', url: 'https://...' },
  origen: 'crawl4rs'
});
const { dato_homogeneo } = resp.data;
```
