# Decisión: reflejos capaces, no agentes autónomos

> Fecha: 2026-08-25
> Estado: CERRADA (decisión del dueño)
> Contexto: análisis del proceso-negocio + historial del ai-agent-framework (v1→v3)

---

## El diagnóstico (evidencia, no opinión)

### Lo que falló — ai-agent-framework (v1, v2, v3)

```
v1/v2: 22/22 ejecuciones "success" — 0 entregables reales en disco.
       Causa: el LLM se certificaba a sí mismo.

v3:    Gate de entregable mejorado, pero el rendimiento no cambió.
       Causa de fondo: un LLM corriendo solo no da resultados fiables.
       No es un problema de arquitectura — es un problema del LLM.
```

El concepto de "agente autónomo" (LLM ejecutando pipelines multi-paso sin supervisión humana) no funcionó en ninguna iteración. Añadir más gates, checkpoints o verificación no resuelve el problema de fondo: el LLM no produce trabajo fiable cuando corre sin humano en el bucle.

### Lo que funciona — el modelo actual

```
proceso-negocio (reflejo determinista)
  → empuja skill al chat
    → el HUMANO supervisa la ejecución
      → gate verifica entregable en disco
```

Funciona porque el humano está en el bucle. El LLM no corre solo: el dueño ve lo que produce, corrige, matiza, y el gate cierra. Evidencia: 452 mensajes en el proyecto Despacho de pan con proceso de negocio avanzando de verdad.

---

## La decisión

### Lo que NO se hace

- **Agentes como módulos** — es el framework con otro nombre. Un módulo que llama al LLM y se auto-gobierna es el mismo concepto que falló 3 veces.
- **Agentes autónomos** — en cualquier forma (módulo, pipeline, framework). El LLM solo no produce trabajo verificable.
- **Volver a invertir en el concepto de agente autónomo** — cerrado.

### Lo que SÍ se hace

**Más reflejo, menos LLM.** Expandir lo que el código determinista resuelve. Donde hoy el LLM "decide" cosas que son computables, meterlo en el reflejo (JS puro).

Ejemplo vivo: `decidir-interfaz.js` (FASE 6) — un script determinista que decide el tipo de interfaz de un módulo por señales del module.json. Sin LLM. Funciona al 100%.

```
Dirección: reflejo más capaz
  → el determinismo cubre más terreno
  → el LLM solo entra para lo que REALMENTE necesita inteligencia:
    · conversar con el dueño (interpretar intención)
    · generar contenido creativo (recetas, esquemas desde cero)
    · investigar (web, contexto externo)
  → el humano SIEMPRE en el bucle para supervisar al LLM
```

### Nota sobre la FASE 0 (proceso-negocio)

El mapa de interlocutores del negocio debe cerrarse en la FASE 0 (identidad-negocio), ANTES de que la FASE 2 (esquematizar-negocio) cruce actores en la matriz de pares. Hoy la pregunta 5 ("¿Quién lo va a usar?") roza los actores pero no los mapea exhaustivamente. Cada actor que emerge después de empezar la matriz invalida pares ya cerrados — coste cuadrático que se paga una vez si el mapa se cierra primero.

```
Propuesta para FASE 0 — pregunta adicional:
"¿Quiénes tocan tu negocio? — clientes, empleados, proveedores,
 colaboradores, repartidores, vecinos, administración...
 Nombra a TODOS los que intervienen, aunque sea de lejos."

Entregable: interlocutores[] en el perfil, cada uno con:
  { rol, canal, relacion_con_el_negocio }
```

---

## Resumen en una línea

El LLM es un obrero supervisado, no un jefe autónomo. Reflejos más capaces, humano en el bucle, agentes autónomos cerrados.
