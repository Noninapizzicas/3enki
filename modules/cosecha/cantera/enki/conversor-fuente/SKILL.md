---
name: conversor-fuente
description: >
  Skill FULL del módulo CONVERSOR (reflejo stateless) `conversor-fuente` de la vertical
  nichos (Radar de Nichos). Es la ÚNICA frontera de formatos entre las fuentes externas
  de datos y los datos internos homogéneos de nichos: recibe datos crudos de una fuente
  (formato nativo del proveedor) y los convierte a la señal homogénea interna
  {id, titulo, url, fuente, formato, relevancia}. Úsala para operar, depurar o extender
  el conversor, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites convertir el DatasetBruto de una fuente a la señal homogénea interna
    (RPC nichos.fuente.convertir.request).
  - Cuando depures por qué un dataset no se cruza (sin nicho/items, o item sin titulo/url)
    y se rechaza con el par FORMATO_INVALIDO (422).
  - Cuando quieras entender el patrón de CONVERSOR (proyecciones puras _cruzar/_mapear, cero
    lógica de negocio) y su contrato de eventos como frontera de formatos del sistema.
  - Cuando vayas a escribir/ampliar el test unitario del conversor.
tags: [enki, modulo, conversor, reflejo, nichos, radar, formato, proyecto-3d]
---

# conversor-fuente — CONVERSOR (frontera de formatos) del Radar

## Qué hace el módulo

`conversor-fuente` es un **CONVERSOR REFLEJO JS PURO** (J2): cero pensar, solo cruzar
formato. Es la **ÚNICA frontera de formatos** entre las fuentes externas de datos y los
datos internos homogéneos del sistema. Recibe los datos crudos de una fuente en su formato
nativo (el `DatasetBruto` de `puerto-fuente-datos`) y los convierte a la **señal homogénea
interna** de nichos.

Sin estado, sin red, sin store: cada op es una función pura (entra objeto, sale objeto).
**Cero lógica de negocio**: solo convertir formato. Dos proyecciones puras:

- `_cruzar`: la única frontera — valida el `DatasetBruto` y deriva los `DatosHomogeneos`.
- `_mapear`: mapea un `item` crudo de un `formato`Origen al formato interno canónico
  (`titulo`/`url` desde los campos nativos; `id` derivado determinista; `relevancia`).

Al convertir con éxito publica `nichos.datos_homogeneos`; si el formato es inválido (sin
nicho, sin items, o un item sin titulo ni url) cierra el círculo con el par determinista
`nichos.fuente.convertir.failed`. **No inventa**: un item que no se puede convertir se cuenta
como `rechazado`, nunca se rellena con datos falsos.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.fuente.convertir.request` | `onConvertirRequest` | RPC puro: {nicho, fuente, formato, dataset_bruto:{items}} → DatosHomogeneos (señal homogénea interna). `_cruzar` valida el DatasetBruto y mapea cada item crudo a {id, titulo, url, fuente, formato, relevancia} vía `_mapear`. Éxito → publica `nichos.datos_homogeneos` y responde por `nichos.fuente.convertir.response`; formato inválido (sin nicho, sin items, o item sin titulo/url) → `nichos.fuente.convertir.failed`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.datos_homogeneos` | Fire-and-forget (J2): los datos crudos de la fuente quedaron convertidos a la señal homogénea interna → {nicho, fuente, formato, total, convertidos, items:[{id,titulo,url,fuente,formato,relevancia}]}. La consume estudio-demanda (J5). |
| `nichos.fuente.convertir.failed` | Par de fallo determinista: el DatasetBruto llegó sin nicho, sin items, o un item no tiene titulo/url → {status:4xx, code, mensaje}. Cierra el círculo de nichos.fuente.convertir.request. |

> **Regla de cierre de círculo**: el par `nichos.fuente.convertir.failed` cierra el círculo de
> `nichos.fuente.convertir.request`, emitido por `onConvertirRequest` cuando `_cruzar` devuelve
> un status distinto de 200 (cualquier `FORMATO_INVALIDO` o `INVALID_INPUT`).

> **Nota: el `.response` (`nichos.fuente.convertir.response`) no figura como event en publishes de
> module.json**, pero index.js lo usa como destino de respuesta en `_atender(...)`, como es el
> estándar del framework (todo flujo request responde su `.response`).

## Reglas de negocio

1. **Frontera única de formatos**: `_cruzar` exige `nicho` (string) y `formato` (string);
   sin ellos → `400 INVALID_INPUT` (`_invalid('nicho')` / `_invalid('formato')`).
2. **DatasetBruto con items[] obligatorio → `422 FORMATO_INVALIDO`**:
   sin `dataset_bruto.items` array → `{ status:422, code:'FORMATO_INVALIDO', mensaje:'el DatasetBruto debe traer items[] para poder cruzar al formato interno' }`.
   Con `items: []` → `{ status:422, code:'FORMATO_INVALIDO', mensaje:'el DatasetBruto no trae ningun item crudo que convertir' }`.
3. **Item no convertible se RECHAZA, no se inventa**: `_mapear` devuelve `null` si al item
   le falta título y url (`titulo`/`title`/`nombre`/`name` y `url`/`link`/`href`/`enlace`,
   vía `_primer`). Si al final `items.length === 0` → `422 FORMATO_INVALIDO`
   (`'ningun item del DatasetBruto pudo convertirse al formato interno (faltan titulo o url)'`).
4. **id determinista y estable**: `_id('${fuente}:${url}')` → `sha1(...).slice(0,12)`. El mismo
   origen produce el mismo `id` entre conversiones (deduplicación estable).
5. **relevancia saneada**: `Number(item.relevancia) > 0 ? ... : 0` (si no es numérico positivo → 0).
6. **Respuesta con métricas de conversión**: éxito → `{ nicho, fuente, formato, total: items de entrada, convertidos, rechazados, items }`.
7. **Sin estado (conversor stateless)**: sin store, sin PosPersistencia, sin `project.activated`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.fuente.convertir.response`:

### 1. `convertir` — cruzar el DatasetBruto a datos homogéneos

```json
{
  "nicho": "salsa picante para restaurantes",
  "fuente": "buscador",
  "formato": "serp",
  "dataset_bruto": {
    "items": [
      { "title": "Salsa la Casera", "link": "https://tienda.com/salsa-casera", "relevancia": 3 },
      { "nombre": "Chiles el Taco", "url": "https://chiles.com", "relevancia": 2 },
      { "titulo": "Sin url" }
    ]
  }
}
```
Respuesta `200`:
```json
{
  "nicho": "salsa picante para restaurantes",
  "fuente": "buscador",
  "formato": "serp",
  "total": 3,
  "convertidos": 2,
  "rechazados": 1,
  "items": [
    { "id": "<sha1 12chars>", "nicho": "salsa picante para restaurantes", "fuente": "buscador", "formato": "serp", "titulo": "Salsa la Casera", "url": "https://tienda.com/salsa-casera", "relevancia": 3, "convertido": true },
    { "id": "<sha1 12chars>", "nicho": "salsa picante para restaurantes", "fuente": "buscador", "formato": "serp", "titulo": "Chiles el Taco", "url": "https://chiles.com", "relevancia": 2, "convertido": true }
  ]
}
```
El tercer item (`{ titulo: "Sin url" }`) se rechaza (le falta `url`). Emite `nichos.datos_homogeneos` con ese `data`.

### Fallos típicos

- Sin `nicho` o `formato` → `400 INVALID_INPUT` + `nichos.fuente.convertir.failed`.
- `dataset_bruto` sin `items` o con `items: []` → `422 FORMATO_INVALIDO` + failed.
- Ningún item convertible (todos sin título/url) → `422 FORMATO_INVALIDO` + failed.

## Tests

El test vive en `tests/unit/conversor-fuente.test.js`. Cubre:

- `convertir` con DatasetBruto válido → `200`, mapea cada item a {id, titulo, url, fuente,
  formato, relevancia} (id derivado `sha1(fuente:url)`), cuenta `convertidos`/`rechazados`,
  emite `nichos.datos_homogeneos`.
- Item sin título o url → se rechaza (contado en `rechazados`); si todos se rechazan → `422
  FORMATO_INVALIDO` + `nichos.fuente.convertir.failed`.
- `dataset_bruto` sin `items[]` o vacío → `422 FORMATO_INVALIDO` + failed.
- Sin `nicho`/`formato` → `400 INVALID_INPUT` + failed.
- Mismo origen produce id estable entre conversiones.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/conversor-fuente
node tests/unit/conversor-fuente.test.js
```

## Notas de implementación

- Clase `ConversorFuente extends ModuloHibridoReflejo`; `name = 'conversor-fuente'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onConvertirRequest` delega en `_atender(e, 'convertir', 'nichos.fuente.convertir.response', fn)`;
  publica `nichos.datos_homogeneos` con `status === 200` y `nichos.fuente.convertir.failed` si no.
- Proyecciones puras: `_cruzar` (valida + deriva) y `_mapear` (mapea item → canónico, null si
  no convertible). Ayudantes `_primer` (primer campo no vacío) y `_id` (`sha1` slice 12).
- Usa `crypto` para el `id` determinista (deduplicación estable entre conversiones).
- DEP hacia delante: la consume `estudio-demanda` (J5) vía `nichos.datos_homogeneos`; recibe el
  `DatasetBruto` de `puerto-fuente-datos` (J1).
