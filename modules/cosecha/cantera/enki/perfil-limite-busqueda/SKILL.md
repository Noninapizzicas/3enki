---
name: perfil-limite-busqueda
description: >-
  CUSTODIO del vertical NICHOS (bloque A · entrada): ranura única autorizada
  que guarda el perfil de límites de búsqueda del dueño (max_candidatos_por_semilla,
  presupuesto_fuentes_por_hr, territorios_vetados, fuentes_autorizadas) con
  inmutabilidad por versión. El dueño declara por el canal (único escritor);
  lectores libres por RPC. Carga este módulo cuando el motor de descubrimiento
  del vertical NICHOS necesite consultar sus topes de operación antes de
  disparar sondeos, cuando el panel del dueño ajuste esos topes, o cuando otro
  módulo quiera reaccionar al PULSO nichos.perfil.limite.declarado.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, perfil-limite, busqueda, bloque-a, entrada, pos-persistencia, bus, mqtt]
---

# nichos · perfil-limite-busqueda

> **Qué es.** CUSTODIO único (bloque A entrada) del perfil de límites de
> búsqueda del dueño para el vertical NICHOS. Snapshot inmutable por versión
> con los cuatro topes que acotan al motor de descubrimiento del vertical.
>
> Código: `modules/nichos/perfil-limite-busqueda/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **CUSTODIO** (único escritor, estado persistido).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/perfil-limite.json` dentro del storage del proyecto.
- Autor autorizado: `dueño` (regla F3: *"un solo escritor por el canal"*).
- Esqueleto por defecto: todo campo nace `ABIERTO` — el consumidor decide qué
  hacer con un ABIERTO (degradar, pedir puente), jamás se asume dato ausente.

## Campos del perfil

| Campo | Tipo | Semántica |
|---|---|---|
| `max_candidatos_por_semilla` | `Entero \| 'ABIERTO'` | techo de candidatos a destilar por cada semilla sondeada |
| `presupuesto_fuentes_por_hr` | `Dinero \| 'ABIERTO'` | gasto máximo en consumos de fuentes externas por hora |
| `territorios_vetados` | `Array<String>` | geografías/segmentos que el motor NO explora |
| `fuentes_autorizadas` | `Array<NombrePuerto> \| 'ABIERTO'` | puertos de fuente de datos permitidos (ABIERTO = cualquiera cableada) |

## Eventos que atiende (request → response)

| Evento | Handler | Qué devuelve |
|---|---|---|
| `nichos.perfil.limite.leer.request` | `onLeerRequest` | `{status:200, data:{perfil_limite:{version, limites, por_autor}}}` — esqueleto por defecto si no se declaró nada aún |
| `nichos.perfil.limite.declarar.request` | `onDeclararRequest` | `{status:200, data:{nueva_version, perfil_limite}}` o `{status:403, error:{code:'PERMISSION_DENIED',...}}` si el autor no es el dueño |

### Payload de `.declarar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "por_autor": "dueño",
  "cambio": {
    "max_candidatos_por_semilla": 50,
    "presupuesto_fuentes_por_hr": 2.5,
    "territorios_vetados": ["adulto", "medicina-receta"],
    "fuentes_autorizadas": ["crawl4rs", "google-trends"]
  }
}
```

Campos del `cambio` no incluidos → se conservan del snapshot anterior. Campos
fuera del esquema → 400 `INVALID_INPUT`.

## Señales que escucha (fire-and-forget)

- `project.activated` → `onProjectActivated` — restaura el perfil persistido
  del proyecto desde `/prisma/pos/nichos/perfil-limite.json` (PosPersistencia).

## Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.perfil.limite.declarado` | tras aplicar una declaración válida | `{project_id, version, por_autor, timestamp}` |
| `nichos.perfil.limite.declarado.failed` | rechazo por autor no autorizado o cambio inválido | `{project_id, code, message, timestamp}` |

## Invariantes

- **Único escritor**: solo `por_autor === 'dueño'` muta el store. Otro autor →
  403 `PERMISSION_DENIED` + pulso `.declarado.failed`.
- **Inmutabilidad por versión**: cada declaración crea un snapshot nuevo
  (`version++`), nunca se muta el anterior. El historial queda en `por_autor[]`
  con `{version, autor, cambio, at}`.
- **ABIERTO explícito**: la ausencia de un valor se nombra como `'ABIERTO'`,
  no se omite. El consumidor sabe que no se asume nada.
- **Degradación honesta**: sin `project_id` el store queda sólo en memoria
  (PosPersistencia no persiste).

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id`/`por_autor`/`cambio`, o `cambio` trae campos fuera del esquema |
| 403 | `PERMISSION_DENIED` | `por_autor` no es `'dueño'` |

## Integración (patrón RPC del bus)

```javascript
// LEER
const resp = await bus.publishAndWait('nichos.perfil.limite.leer.request', {
  project_id
});
const { max_candidatos_por_semilla, presupuesto_fuentes_por_hr } = resp.data.perfil_limite.limites;

// DECLARAR (sólo desde el canal del dueño)
await bus.publishAndWait('nichos.perfil.limite.declarar.request', {
  project_id,
  por_autor: 'dueño',
  cambio: { max_candidatos_por_semilla: 100 }
});
```

## Dónde encaja en el vertical NICHOS

- **Bloque A — entrada**: define el marco de operación del motor de
  descubrimiento. Lo leen `nichos-buscador`, `nichos-planificador-de-fuentes`,
  cualquier reflejo que decida *si puede sondear ahora* o *qué fuentes están
  permitidas*.
- **El Jefe (bloque K)** ajusta el perfil llamando a `.declarar.request` tras
  consultar al dueño; el perfil es su mando a distancia sobre el motor.
- No depende de otro módulo del vertical para arrancar (sólo `project.activated`
  del core). Es raíz del grafo de construcción.
