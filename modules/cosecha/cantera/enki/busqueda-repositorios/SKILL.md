---
name: busqueda-repositorios
description: >-
  Buscador multi-repositorio de modelos 3D (Printables, MakerWorld, Cults3D,
  Thingiverse). CONVERSOR: frontera de formato, sin estado, sin red. El puerto
  buscar(query) → [resultados] se cablea con adaptadores en el puente.
when-to-use: >-
  Cuando el dueño del taller 3D quiera buscar modelos 3D en varios repositorios
  a la vez (o en uno elegido) por texto/categoría, antes de importar. También
  cuando se necesite entender cómo se unifica la búsqueda multi-fuente a forma
  canónica y cómo se comporta ante repositorios caídos.
tags: [enki, 3d, conversor, busqueda, repositorios, modelos-3d, frontera-formato]
---

# 3D · busqueda-repositorios

> **Qué es.** CONVERSOR que unifica la búsqueda de modelos 3D en varios
> repositorios (Printables, MakerWorld, Cults3D, Thingiverse) por query. Es la
> **frontera de formato multi-fuente** del proyecto 3D: el dueño busca en todos
> a la vez o elige repositorio, y el módulo normaliza los resultados crudos a
> una **forma canónica** única.
>
> **FORMA: CONVERSOR** — SIN estado, SIN red. El puerto es `buscar(query) → [resultados]`.
> Los adaptadores concretos (APIs de repositorios) se cablean en el puente, no aquí.
>
> Código: `modules/busqueda-repositorios/index.js` · v0.1.0 · plan-construccion.md §6.6

---

## 1 · LÓGICA

El módulo es **stateless** (no tiene store, no persiste). Toda la lógica de
negocio vive DENTRO del módulo como proyección `_op` del reflejo; `_shared/`
solo infraestructura.

**Puerto**: `buscar(query) → [resultados]`. Los adaptadores de repositorio se
**inyectan** como `{ nombre, buscar(query) → Promise<[resultado_crudo]> }` vía
`registrarAdaptador(nombre, adaptador)`. El puente los cablea; el módulo solo
los consume. Sin adaptador cableado → ese repositorio se trata como **caído**.

**Repositorios soportados por defecto** (constante `REPOSITORIOS_DEFECTO`):
`['printables', 'makerworld', 'cults3d', 'thingiverse']`.

**Flujo de `_buscar(input)`**:
1. Valida `query` (no vacía, string). Si vacía → `400 INVALID_INPUT` + `busqueda.buscar.failed { motivo: 'query_vacia' }`.
2. Determina repositorios a consultar: los pedidos en `input.repositorios` o todos los soportados.
3. Recorre cada repositorio: sin adaptador → caído; si `adaptador.buscar()` lanza → caído (se omite, **no rompe la búsqueda**); si responde array → acumula crudos etiquetados con `{ repositorio, ...r }`.
4. `_unificar(crudos)` → forma canónica + deduplica por `(repositorio, id)`.
5. Si **todos** los repositorios cayeron (o ninguno respondió) y no hay resultados → `busqueda.buscar.failed { motivo: 'todos_los_repositorios_caidos' }`.
6. Responde `200` con `{ query, resultados, total, repositorios_consultados, repositorios_caidos }`.

**Invariante 12**: un repositorio caído no rompe la búsqueda (se omiten sus
resultados); si todos fallan, vacío + `busqueda.buscar.failed`.

### Forma canónica (7.1 `_unificar`)

Cada resultado crudo se normaliza a:

```json
{
  "repositorio": "printables",
  "id": "p1",
  "titulo": "Vaso PLA",
  "url": "https://printables.com/p1",
  "autor": "Ana",
  "licencia": "CC-BY",
  "descargas": 1200,
  "valoracion": 4.5
}
```

**Huecos como `desconocido`/`null`** (invariante 5 — dato ausente nombrado,
nunca inventado): `titulo`/`autor`/`licencia` ausentes → `'desconocido'`;
`id`/`url`/`descargas`/`valoracion` ausentes → `null`. La clave de deduplicación
es `repositorio::id` (o `repositorio::url`, o `repositorio::titulo` si no hay
id ni url).

---

## 2 · EVENTOS

### Subscribes (RPC)

| Evento | Handler | Descripción |
|---|---|---|
| `busqueda.buscar.request` | `onBuscarRequest` | Busca modelos 3D por query en los repositorios configurados (todos a la vez o uno elegido). |

### Publica

| Evento | Payload | Descripción |
|---|---|---|
| `busqueda.buscar.response` | `{ query, resultados, total, repositorios_consultados, repositorios_caidos }` | Respuesta correlada del RPC buscar. |
| `busqueda.buscar.failed` | `{ project_id, query, motivo, repositorios_caidos? }` | Par de fallo: todos los repositorios cayeron (vacío) o query inválida. |

---

## 3 · RPC — `busqueda.buscar.request`

### Request

```json
{
  "project_id": "e57a318a-b93a-46d9-8ae6-fd5bd0384964",
  "query": "vaso",
  "repositorios": ["printables", "makerworld"]
}
```

- `query` (obligatorio): texto o categoría (pregunta abierta 12 del plan).
- `repositorios` (opcional): lista de repositorios a consultar. Si se omite o
  vacía → se consultan **todos** los soportados.

### Response 200

```json
{
  "query": "vaso",
  "resultados": [
    { "repositorio": "printables", "id": "p1", "titulo": "Vaso PLA", "url": "https://printables.com/p1", "autor": "Ana", "licencia": "CC-BY", "descargas": 1200, "valoracion": 4.5 },
    { "repositorio": "makerworld", "id": "mw1", "titulo": "Vaso PETG", "url": "https://makerworld.com/mw1", "autor": "Luis", "licencia": "desconocido", "descargas": 800, "valoracion": null }
  ],
  "total": 2,
  "repositorios_consultados": ["printables", "makerworld"],
  "repositorios_caidos": []
}
```

### Errores

| Código | Condición | Payload |
|---|---|---|
| `400 INVALID_INPUT` | `query` vacía o no string | `{ error: 'INVALID_INPUT', message: 'query requerida (no vacia)' }` + emite `busqueda.buscar.failed { motivo: 'query_vacia' }` |
| `200` con `total: 0` + `busqueda.buscar.failed` | Todos los repositorios caídos | `{ motivo: 'todos_los_repositorios_caidos', repositorios_caidos: [...] }` |

---

## 4 · REGLAS DE NEGOCIO

1. **Buscar en todos a la vez** — por defecto consulta los 4 repositorios soportados; el dueño puede elegir uno o varios con `repositorios`.
2. **Unificar a forma canónica** — todos los resultados crudos se normalizan a la forma canónica (7.1) y se deduplican por `(repositorio, id)`.
3. **Repositorio caído se omite** — si un adaptador lanza o no está cableado, ese repositorio se marca caído y sus resultados se omiten; **no rompe la búsqueda** (invariante 12).
4. **Huecos como `desconocido`** — campos ausentes se nombran `'desconocido'`/`null`, nunca se inventan (invariante 5).
5. **Si todos fallan → vacío + failed** — si todos los repositorios cayeron (o ninguno respondió) y no hay resultados, responde vacío y emite `busqueda.buscar.failed`.
6. **No hace** — no descarga, no importa, no decide. Es SOLO frontera de formato; la importación la hace `importacion-modelo` (Flujo A del plan).

---

## 5 · FLUJO TÍPICO

**Flujo A — Registro de modelo (búsqueda → importación)**:

```
dueño busca → busqueda-repositorios.buscar (todos a la vez)
  → resultados unificados a forma canónica
  → dueño elige un modelo
  → importacion-modelo.importar
  → adaptador-slicing.leer_3mf
  → catalogo-modelos.registrar
  → catalogo.modelo_registrado
```

---

## 6 · VERIFICACIÓN

Test unitario determinista (sin bus, sin red): `tests/unit/busqueda-repositorios__buscar.test.js`.

```bash
sudo -u www-data node /opt/enki/modules/busqueda-repositorios/tests/unit/busqueda-repositorios__buscar.test.js
```

Cubre 7 bloques:
1. **Buscar en todos a la vez** → unifica resultados de varios repositorios.
2. **Elegir repositorio** → solo consulta el pedido.
3. **Unificar (7.1)** → huecos como `desconocido`/`null`, deduplica por `(repo, id)`.
4. **Repositorio caído se omite** → no rompe la búsqueda (invariante 12).
5. **Todos caídos** → vacío + emite `busqueda.buscar.failed`.
6. **Query vacía** → `400 INVALID_INPUT` + emite `busqueda.buscar.failed`.
7. **Sin adaptador cableado** → todos caídos, vacío, no rompe.

Resultado esperado: `RESULTADO: 7/7 bloques OK` (exit 0).

---

## 7 · PITFALLS

- **El módulo NO hace red** — los adaptadores de repositorio se inyectan desde
  el puente. Si un adaptador no está cableado, el repositorio se trata como
  caído (no como error fatal).
- **`_atender` delega** — `onBuscarRequest` es una línea que delega a
  `_atender(e, 'buscar', 'busqueda.buscar.response', d => this._buscar(d))`.
  No reimplementar el RPC a mano.
- **La clave de deduplicación** es `repositorio::id`; si no hay id usa `url`,
  y si no hay ninguno usa `repositorio::titulo`. Dos crudos del mismo repo con
  el mismo id se colapsan a uno.
- **`todos_cayeron`** se calcula como `consultados.length === 0 || caidos.length === consultados.length` — solo emite `failed` si además `resultados.length === 0`.
