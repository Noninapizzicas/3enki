---
name: carta-scheduler
description: >-
  Programación conversacional de cambios de carta por canal con confirmación
  humana previa. Reglas (cron + canal + carta_id) + pendientes (cambios
  calculados esperando OK). El LLM en page=carta-scheduler revisa próximos
  cambios, detecta conflictos, confirma o rechaza pendientes. Blueprint puro.
fuente: enki
dominio: comercio
tags: [pizzepos, carta, scheduler, programacion, canal, regla, pendiente]
---

# Pizzepos · carta-scheduler

> **Qué es.** El planificador de cambios de carta. Permite programar cuándo
> una carta se activa en cada canal: "la carta de verano empieza el 1 de junio
> en el canal mesa, y el 15 de junio en Glovo". Los cambios se crean como
> **pendientes** que requieren confirmación humana antes de ejecutarse.
>
> **Blueprint puro:** no tiene index.js. Toda la lógica vive en el blueprint
> (cajones). La persistencia de reglas y pendientes es en JSON por proyecto.
>
> **NO incluye ejecutor cron:** la ejecución de los cambios programados es
> deuda explícita (será un módulo JS separado).
>
> Código: `modules/pizzepos/carta-scheduler/carta-scheduler.blueprint.json`
> (blueprint) · v`1.1.0`

---

## 1 · LÓGICA

### Reglas de programación

Una regla define cuándo y cómo cambiar la carta:

```jsonc
{
  "id": "regla_001",
  "nombre": "Cambio a carta de verano",
  "cron": "0 8 1 6 *",             // 1 de junio a las 8:00
  "canal": "mesa",                  // mesa | llevar | glovo | ...
  "carta_id": "carta_verano",
  "activa": true
}
```

### Pendientes

Cuando una regla está próxima a ejecutarse, el scheduler calcula el cambio
y lo marca como pendiente:

```jsonc
{
  "id": "pendiente_001",
  "regla_id": "regla_001",
  "canal": "mesa",
  "carta_origen": "carta_primavera",
  "carta_destino": "carta_verano",
  "fecha_ejecucion": "2026-06-01T08:00:00Z",
  "estado": "pendiente",            // pendiente | confirmado | rechazado | ejecutado
  "creado_en": "2026-05-25T..."
}
```

### El rol del LLM

El LLM en `page=carta-scheduler`:
1. **Revisa** próximos cambios → lista pendientes
2. **Detecta conflictos** → dos reglas que cambian el mismo canal a la vez
3. **Confirma o rechaza** pendientes → el usuario decide
4. **Crea reglas** → "programa cambio a carta de invierno el 1 de diciembre en todos los canales"

### Sin ejecutor automático

El scheduler **no ejecuta los cambios automáticamente**. Calcula los pendientes
y espera confirmación humana. La ejecución real (cambiar la carta en el canal)
es responsabilidad de un futuro módulo JS (deuda explícita).

---

## 2 · CAJONES (operaciones del blueprint)

| Operación | Descripción |
|-----------|-------------|
| `regla.crear` | Nueva regla de programación |
| `regla.listar` | Lista reglas activas |
| `regla.actualizar` | Modifica regla (cron, canal, carta) |
| `regla.eliminar` | Desactiva regla |
| `pendiente.listar` | Próximos cambios pendientes de confirmar |
| `pendiente.confirmar` | Confirma cambio pendiente |
| `pendiente.rechazar` | Rechaza cambio pendiente |

---

## 3 · FLUJO TÍPICO

### Programar cambio de carta

```
1. USUARIO dice           → "la carta de verano empieza el 1 de junio en mesas"
2. LLM crea regla          → regla.crear { cron: "0 8 1 6 *", canal: "mesa", carta_id: "carta_verano" }
3. SISTEMA calcula         → pendiente.listar → muestra cambio próximo
4. USUARIO revisa          → "correcto"
5. LLM confirma            → pendiente.confirmar { id: "pendiente_001" }
6. (Futuro: ejecutor cron  → el día 1 de junio a las 8:00 cambia la carta en el canal mesa)
```

### Detectar conflicto

```
1. USUARIO programa        → "carta de verano el 1 de junio en mesas"
2. USUARIO programa        → "carta de prueba el 1 de junio en mesas" (sin saber)
3. LLM DETECTA             → ¡conflicto! dos reglas para mesa el mismo día
4. LLM AVISA               → "Ya tienes un cambio programado para mesa el 1 de junio
                             (→ carta_verano). ¿Confirmas que quieres reemplazarlo?"
```

---

## 4 · INTEGRACIÓN

> **Página activable:** `target_page_id: 'carta-scheduler'` — el ai-gateway
> enfoca al LLM en programación de cartas. Cajones habilitados.

> **Operaciones:** crear/listar/actualizar/eliminar reglas, listar/confirmar/
> rechazar pendientes.

> **Persistencia:** reglas y pendientes en `data/projects/<id>/pizzepos/carta-scheduler/`.
> Single-writer.

> **Sin ejecutor automático:** los pendientes requieren confirmación humana.
> La ejecución real (cron) es deuda explícita para un futuro módulo JS.
