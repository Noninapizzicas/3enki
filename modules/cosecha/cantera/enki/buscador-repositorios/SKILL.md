---
name: buscador-repositorios
description: >
  Skill FULL del módulo PUENTE `buscador-repositorios` del proyecto 3D (taller de
  impresión 3D, una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE).
  Búsqueda desde repositorios externos (Printables, MakerWorld, Cults3D, Thingiverse,
  etc.) delegando en crawl4rs/SearXNG. Es PUENTE stateless: no inventa resultados,
  devuelve lo que el puerto obtiene mapeado a ResultadoRepositorio. Úsala para operar,
  depurar o extender el puente de búsqueda, o para entender su contrato de eventos y
  sus reglas de negocio.
when-to-use: >
  - Cuando necesites buscar modelos en repositorios externos de impresión 3D por query.
  - Cuando depures por qué la búsqueda devuelve vacío, por qué un resultado no se etiqueta
    con su fuente/formatos o por qué el transporte no responde.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas
    de negocio del puente de búsqueda (CERO resultados inventados).
  - Cuando vayas a escribir/ampliar el test unitario del puente de búsqueda.
tags: [enki, modulo, puente, impresora-3d, repositorios, busqueda, proyecto-3d]
---

# buscador-repositorios — PUENTE de búsqueda en repositorios externos

## Qué hace el módulo

`buscador-repositorios` es un **PUENTE** **stateless** (pieza 9): **no tiene store,
escucha y delega**. Busca modelos desde **repositorios externos** (Printables, MakerWorld,
Cults3D, Thingiverse, Thangs, etc.) reutilizando `crawl4rs` como transporte de búsqueda
(`crawl4rs.buscar.request` → SearXNG; infraestructura, NO pieza).

El puerto `RepositoriosPort` es **ABIERTO**: por defecto el transporte es `'crawl4rs'`,
pero se puede inyectar otro (función `{ query, limit } → resultados crudos`).

**NO inventa resultados**: devuelve lo que el puerto obtiene, mapeado a la forma
`ResultadoRepositorio` `{ fuente, titulo, url, autor, formatos }`. El **dueño elige y
aprueba**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `buscador-repositorios.buscar.request` | `onBuscarRequest` | Busca en repositorios externos por query; NO inventa resultados (devuelve lo que el puerto obtiene, forma `ResultadoRepositorio`). |

### Publishes

| Evento | Descripción |
|---|---|
| `buscador-repositorios.buscar.response` | Respuesta correlada: `{ resultados:[{fuente,titulo,url,autor,formatos}], total }` o error. |
| `buscador-repositorios.buscar.failed` | Par de fallo: el transporte no respondió, falló o devolvió error. |

> **Regla de cierre de círculo**: `buscador-repositorios.buscar.failed` es el par de fallo
> canónico del flujo; responde en `buscador-repositorios.buscar.response`.

## Reglas de negocio

1. **CERO resultados inventados**: `_buscar` devuelve exactamente lo que el transporte
   obtiene, mapeado a `ResultadoRepositorio`. Si el transporte no devuelve resultados →
   lista vacía (honesto, nunca fabrica entradas). Sin `query` → `400 INVALID_INPUT`.
2. **Etiquetado de fuente por hostname** (`_resultadoDe`): `printables.com`→Printables,
   `makerworld.com(.cn)`→MakerWorld, `cults3d.com`→Cults3D, `thingiverse.com`→Thingiverse,
   `thangs.com`→Thangs; si no coincide → `'Repositorio'`. Solo etiqueta, no decide.
3. **Etiquetado de formatos por pistas evidentes** (`_formatosDe`): STL/3MF/GCODE desde
   `r.formato`/`r.formatos`, extensión de la url o palabra en el título; sin pista
   evidente → `[]` (CERO inventado; se deja hasta que el dueño confirme). NUNCA asume
   GCODE por defecto.
4. **Campos ausentes nombrados, nunca inventados**: sin `url` un crudo se descarta
   (`_resultadoDe` devuelve `null`); título default `'Sin título'`; `autor` ausente → `null`.
5. **Fallo de transporte honesto**: `crawl4rs.buscar` sin respuesta → `502
   TRANSPORTE_SIN_RESPUESTA` + `failed`; `status >= 400` → `502/4xx` con código del
   transporte + `failed`; transporte inyectado que lanza → `502 TRANSPORTE_FALLO`; transporte
   desconocido → `502 TRANSPORTE_DESCONOCIDO`.
6. **`limit`/`n` por defecto 10**; timeouts: `crawl4rs.buscar` a `timeout_ms: 20000`.
7. **PUENTE stateless**: sin store, sin `project.activated`, sin persistencia; el estado son
   los transportes inyectados.

## Uso / cómo invocarlo

### `buscar` — buscar en repositorios externos

```json
{ "query": "soporte extrusor", "limit": 10 }
```
Respuesta `200`:
```json
{
  "resultados": [
    { "fuente": "Printables", "titulo": "Soporte extrusor", "url": "https://www.printables.com/model/123", "autor": "maker_x", "formatos": ["3MF"] }
  ],
  "total": 1
}
```
En fallo de transporte → `502` + `buscador-repositorios.buscar.failed`.

## Tests

El test vive en `tests/unit/buscador-repositorios.test.js`. Cubre:

- `buscar` ok → `200` con `resultados` mapeados a `ResultadoRepositorio` y `total`.
- `buscar` sin `query` → `400`.
- `_resultadoDe`: etiqueta fuente por hostname; `formatos` desde pistas (extensión/título);
  sin url → descarta; campos ausentes → `null`.
- `_formatosDe`: no asume formatos sin pista evidente (→ `[]`).
- Transporte: usa el inyectado; `crawl4rs` sin respuesta → `502` + `failed`;
  `TRANSPORTE_DESCONOCIDO` → `502`.
- CERO invención: transporte vacío → lista vacía (no fabrica entradas).

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/buscador-repositorios
node tests/unit/buscador-repositorios.test.js
# esperado: buscador-repositorios: N/N OK
```

> En el runtime real esto corrió desde `/opt/enki/modules/buscador-repositorios`; en este
> repo, el test se ejecuta desde `modules/buscador-repositorios`.

## Notas de implementación

- Clase `BuscadorRepositoriosReflejo extends ModuloHibridoReflejo`; `name =
  'buscador-repositorios'`, `version = 'reflejo-0.1.0'`.
- Puerto `RepositoriosPort` ABIERTO: `this._transport` es `'crawl4rs'` (default) o una
  función inyectada `{ query, limit } → crudos`.
- `FUENTE_POR_HOST` y `DEFAULT_FUENTE` mapean hostname → fuente etiquetada (no decisorio).
- Handlers RPC de una línea que delegan en `_atender(e, 'buscar', 'buscador-repositorios.buscar.response', d => this._buscar(d))`.
- `_errorResponse`/`this._invalid` canalizan 400/502 con sus códigos.
- DEP: `crawl4rs` (transporte de búsqueda, infraestructura reutilizada, NO pieza).
