---
name: adaptar-a-enki
description: "Puente que trae diseños externos al sistema Enki. Se invoca con invoke_agent y produce el plano de acoplamiento en storage/esquemas/plan-construccion.md."
when-to-use: "Cuando haya que adaptar al sistema Enki un diseño externo (esquemas/diseno-oop.md en fase 3b, o una idea externa del usuario) y se necesite el entregable plan-construccion.md."
tags: [enki, adaptador, proceso, plan-construccion]
---

# adaptar-a-enki — Adaptador de Enki

> Skill de proceso · Dominio: sistema/enki · Tipo: skill de proceso

## Descripción

El Adaptador de Enki es el puente que trae diseños externos al sistema Enki. Se invoca como agente (no se llama con herramientas de cosecha/ejecutor) y el motor se encarga automáticamente de buscar las rebanadas, inyectar el inventario de 146 módulos, generar el plano de acoplamiento y escribirlo en `storage/esquemas/plan-construccion.md`.

## Cuándo usar

- Fase 3b: cuando exista `esquemas/diseno-oop.md` y haya que adaptar ese diseño al sistema Enki.
- Cualquier idea externa que el usuario quiera traer al sistema (uso polivalente).
- Cuando se necesite obtener el plano de acoplamiento `storage/esquemas/plan-construccion.md`.

## Contrato de llamada

### 1. Desde el chat — `invoke_agent`

```json
{
  "agent_name": "adaptar-a-enki",
  "task": "<el diseño X: contenido de diseno-oop.md o idea externa>",
  "project_id": "<id del proyecto>"
}
```

#### Caso proceso (fase 3b)

El chat lee `esquemas/diseno-oop.md` y lo mete en `task` con el prefijo:

```
ADAPTAR ESTE DISEÑO AL SISTEMA:
<contenido de diseno-oop.md>
```

#### Caso idea externa (polivalente)

La `task` se construye con el prefijo `TRAER AL SISTEMA:`:

```
TRAER AL SISTEMA: una app tipo Substack para nichos B2B — newsletter semanal por suscripción...
```

### 2. Desde el bus MQTT (RPC directo)

```json
{
  "event_type": "agent.execute.request",
  "data": {
    "request_id": "<uuid>",
    "agent_name": "adaptar-a-enki",
    "task": "<el diseño X>",
    "project_id": "<id>"
  }
}
```

El alias `invoke_agent.request` funciona igual.

### 3. Flujo automático del motor (tras la llamada)

El motor lo hace solo — **no hay que pasar rebanadas ni inventario a mano**:

1. Recibe la `task`.
2. Busca las rebanadas del tema (2 base + las del dominio).
3. Inyecta el inventario (146 módulos).
4. El LLM genera el plano de acoplamiento.
5. El reflejo escribe `storage/esquemas/plan-construccion.md`.
6. El JEFE verifica que el archivo existe → bitácora sellada.

## Entregable

- **`storage/esquemas/plan-construccion.md`** — plano de acoplamiento del diseño externo al sistema Enki.

## Pasos (para quien invoca)

1. Identificar el caso: diseño desde `esquemas/diseno-oop.md` (fase 3b) o idea externa.
2. Construir la `task` con el prefijo correcto:
   - `ADAPTAR ESTE DISEÑO AL SISTEMA:\n` + contenido del diseño (caso proceso).
   - `TRAER AL SISTEMA: <idea>` (caso idea externa).
3. Enviar la invocación con `agent_name`, `task` y `project_id` (vía chat o bus MQTT).
4. No tocar rebanadas ni inventario: el motor los inyecta automáticamente.
5. Esperar a que el reflejo escriba `storage/esquemas/plan-construccion.md`.
6. Verificar (si hace falta) que el entregable existe y que el JEFE selló la bitácora.

## Pitfalls

- **No pasar rebanadas ni inventario a mano**: el motor ya los inyecta; hacerlo manualmente rompe el flujo.
- **No inventar el entregable**: no afirmar que `plan-construccion.md` existe hasta que el reflejo lo haya escrito.
- **No omitir `project_id`**: es obligatorio en todas las llamadas.
- **Prefijo de `task` no opcional**: distingue el caso proceso del caso idea externa y orienta al motor.
- **En MQTT, incluir `request_id`**: es un uuid necesario para correlacionar la respuesta RPC.
- **Usar `invoke_agent` o `agent.execute.request`**: esta skill no se invoca con `cosecha.*` ni con el ejecutor de comandos.
- **En fase 3b, leer el contenido real de `esquemas/diseno-oop.md`** antes de construir la task; no uses contenido de memoria.