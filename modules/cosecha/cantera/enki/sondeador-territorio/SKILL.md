---
name: sondeador-territorio
description: >-
  MICRO-AGENTE del vertical NICHOS: sondea un territorio a partir de una semilla
  normalizada, consulta reglas de exclusion y limites del perfil, consume fuentes
  externas, filtra duplicados y emite candidatos detectados. Carga este modulo
  cuando el motor de descubrimiento del vertical NICHOS necesite explorar un
  territorio, cuando quieras detectar candidatos a nicho, o cuando reacciones a
  los PULSOs nichos.candidato.detectado / nichos.sondeo.completado.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, sondeador, territorio, sondeo, fuentes, exclusion, bus, mqtt]
---

# nichos · sondeador-territorio

> **Que es.** MICRO-AGENTE del vertical NICHOS que sondea un territorio a partir
> de una semilla normalizada. Consulta reglas de exclusion y limites, consume
> fuentes externas, filtra candidatos y emite los detectados.
>
> Codigo: `modules/nichos/sondeador-territorio/index.js`. La verdad viva es el
> codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (orquesta consultas RPC + filtra + emite).
- Base: `ModuloHibridoReflejo`.
- Sin store — sin PosPersistencia. El sondeo es stateless; los candidatos se
  emiten al bus para que otros los persistan.

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.territorio.sondear.request` | `onSondearRequest` | `{status:200, data:{candidatos[], solicitud_decision?}}` |

### Payload de `.territorio.sondear.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "semilla_normalizada": {
    "id_nicho": "nicho_123",
    "nombre": "accesorios mascotas premium",
    "territorio": "mascotas"
  }
}
```

## Cadena de consultas

```
1. nichos.reglas.exclusion.consultar.request   → exclusiones vigentes
2. nichos.perfil.limite.leer.request           → topes de operacion (max_candidatos)
3. nichos.fuente.consumir.request              → datos crudos del territorio
4. _dedupeContraExclusion(datos, exclusiones)  → filtrado local
5. Emitir nichos.candidato.detectado por cada candidato valido
6. Emitir nichos.sondeo.completado | nichos.sondeo.failed
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.candidato.detectado` | por cada candidato valido tras filtrar | `{id_nicho, titulo, territorio, senal, evidencia[], timestamp}` |
| `nichos.sondeo.completado` | tras completar el sondeo con exito | `{id_nicho, candidatos_total, timestamp}` |
| `nichos.sondeo.failed` | si el sondeo falla o las fuentes no devuelven datos | `{id_nicho, razon_codigo, detalle, timestamp}` |

## Proyecciones

| Metodo | Que hace |
|---|---|
| `_sondear` | Orquesta la cadena completa: exclusiones, limites, fuentes, filtrado, emision. |
| `_dedupeContraExclusion` | Filtra datos crudos contra exclusiones por coincidencia exacta o subcadena. |

## Invariantes

- **Requiere semilla_normalizada**: sin ella devuelve 400 INVALID_INPUT.
- **Limite de candidatos**: respeta `max_candidatos_por_semilla` del perfil de limites.
  Si hay mas candidatos que el limite, devuelve `solicitud_decision` para que el dueno decida.
- **Degradacion honesta**: si exclusiones o limites no responden (timeout), sondea con
  defaults (sin exclusiones, maximo 50).
- **SIN_DATOS**: si las fuentes no devuelven datos, emite `.sondeo.failed` con razon_codigo
  'SIN_DATOS' y devuelve candidatos vacio.

## Integracion (patron RPC del bus)

```javascript
// SONDEAR un territorio
const resp = await bus.publishAndWait('nichos.territorio.sondear.request', {
  project_id,
  semilla_normalizada: {
    id_nicho: 'nicho_123',
    nombre: 'gadgets cocina profesional',
    territorio: 'cocina'
  }
});
const candidatos = resp.data.candidatos;
```

## Donde encaja en el vertical NICHOS

- Lo dispara el **planificador** o el **Jefe (K)** tras normalizar una semilla.
- Consulta **reglas de exclusion** y **perfil de limites (bloque A)**.
- Consume **fuentes de datos (bloque J)** via puerto de fuente.
- Los candidatos detectados alimentan la **cola de candidatos** que luego
  consume **batch-validacion**.
