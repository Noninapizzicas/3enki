---
name: ensamblador-solucion
description: >-
  MICRO-AGENTE del vertical NICHOS (bloque D, el mas complejo): ensambla una
  solucion a partir de un veredicto y un camino. Consulta el catalogo de
  capacidades (disponibles/encargar), alza puente humano si hay bloqueo, y
  usa ai-gateway (llm.complete.request) para fuzzy matching de requisitos vs
  capacidades. Carga este modulo cuando el pipeline del vertical NICHOS
  necesite construir una solucion concreta, cuando otro modulo quiera
  reaccionar a los PULSOs nichos.construccion.*, o cuando se necesite
  entender el flujo de ensamblaje de soluciones.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, ensamblador, solucion, bloque-d, capacidades, puente-humano, llm, bus, mqtt]
---

# nichos · ensamblador-solucion

> **Que es.** MICRO-AGENTE (bloque D, el mas complejo) del vertical NICHOS.
> Ensambla una solucion a partir de un veredicto y un camino: consulta
> capacidades disponibles, encarga las faltantes, alza puente humano ante
> bloqueos, y usa ai-gateway para fuzzy matching.
>
> Codigo: `modules/nichos/ensamblador-solucion/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (sin estado persistido, request -> catalogo -> LLM -> response).
- Base: `ModuloHibridoReflejo`.
- Sin store — micro-agente puro.
- Dos proyecciones: `_ensamblar` (principal) y `_detectarCapacidadesFaltantes` (cruce).

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.solucion.ensamblar.request` | `onEnsamblarRequest` | `{status:200, data:{solucion\|puente_humano_aviso\|solicitud_decision}}` |

### Payload de `.ensamblar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "id_nicho": "nicho_peluquerias",
  "veredicto": {
    "viable": true,
    "puntuacion": 0.85,
    "factores": ["demanda_alta", "competencia_baja"]
  },
  "camino": {
    "requisitos": ["reservas_online", "pagos_stripe", "notificaciones_push"],
    "pasos": [
      {"nombre": "reservas_online", "capacidad": "booking-engine"},
      {"nombre": "pagos_stripe", "capacidad": "payment-gateway"},
      {"nombre": "notificaciones_push", "capacidad": "push-service"}
    ]
  }
}
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.construccion.iniciada` | al comenzar el ensamblaje | `{id_proyecto, timestamp}` |
| `nichos.construccion.completada` | ensamblaje exitoso | `{id_proyecto, capacidades_creadas[], capacidades_pendientes[], timestamp}` |
| `nichos.construccion.failed` | ensamblaje fallido | `{id_proyecto, razon_codigo, detalle, timestamp}` |

## Flujo interno

1. Emite pulso `nichos.construccion.iniciada`.
2. Consulta `nichos.catalogo.capacidad.disponibles.request` para obtener capacidades.
3. Extrae requisitos del camino y cruza vs disponibles via LLM (fuzzy match).
4. Si hay ambiguas sin faltantes -> devuelve `solicitud_decision`.
5. Si faltan capacidades -> encarga via `nichos.catalogo.capacidad.encargar.request`.
6. Si hay bloqueadas en el encargo -> alza `nichos.puente.humano.alzar.request` y emite `.failed`.
7. Si todo resuelto -> emite `.completada` y devuelve `solucion`.

### Tres posibles respuestas del RPC

| Campo en `data` | Cuando |
|---|---|
| `solucion` | todas las capacidades cubiertas o encargadas |
| `puente_humano_aviso` | capacidades bloqueadas o encargo fallido — se alzo puente humano |
| `solicitud_decision` | capacidades ambiguas — se necesita eleccion del operador |

## Proyecciones

### `_ensamblar(input)` — principal
Monta la solucion completa: consulta catalogo, cruza, encarga, alza puente.

### `_detectarCapacidadesFaltantes(requisitos, disponibles, projectId)` — cruce
Cruza requisitos vs capacidades disponibles usando LLM para fuzzy match.
Fallback sin LLM: match exacto por nombre.

## Dependencias por bus

| Evento consumido | Modulo proveedor | Para que |
|---|---|---|
| `nichos.catalogo.capacidad.disponibles.request` | catalogo-capacidades | listar capacidades disponibles |
| `nichos.catalogo.capacidad.encargar.request` | catalogo-capacidades | encargar capacidades faltantes |
| `nichos.puente.humano.alzar.request` | puente-humano (bloque K) | alzar intervencion humana ante bloqueo |
| `llm.complete.request` | ai-gateway | fuzzy matching requisitos vs capacidades |

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `id_nicho`, `veredicto` o `camino` |
| 500 | `UNKNOWN_ERROR` | error interno durante el ensamblaje |
| razon_codigo | `CAPACIDADES_BLOQUEADAS` | capacidades que no se pueden encargar |
| razon_codigo | `ENCARGO_FALLIDO` | el servicio de encargo no respondio |
| razon_codigo | `ERROR_INTERNO` | error inesperado en el flujo |

## Integracion (patron RPC del bus)

```javascript
const resp = await bus.publishAndWait('nichos.solucion.ensamblar.request', {
  project_id,
  id_nicho: 'nicho_peluquerias',
  veredicto: { viable: true, puntuacion: 0.85 },
  camino: { requisitos: ['reservas', 'pagos', 'notificaciones'] }
});

if (resp.data.solucion) {
  // Exito — solucion ensamblada
  const { capacidades_creadas, capacidades_pendientes } = resp.data.solucion;
} else if (resp.data.puente_humano_aviso) {
  // Bloqueo — se alzo puente humano
  console.log(resp.data.puente_humano_aviso.mensaje);
} else if (resp.data.solicitud_decision) {
  // Ambiguedad — presentar opciones al operador
  const { ambiguas } = resp.data.solicitud_decision;
}
```

## Donde encaja en el vertical NICHOS

- **Bloque D**: construccion de solucion. Es el orquestador final que
  convierte veredicto + camino en una solucion concreta con capacidades reales.
- Invocado por el pipeline tras la evaluacion (criterio-viabilidad, estudio-competencia).
- Si necesita intervencion humana, el Jefe (bloque K) recibe el puente y
  lo presenta al dueno.
