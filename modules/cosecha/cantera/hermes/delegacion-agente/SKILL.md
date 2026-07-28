---
name: delegacion-agente
description: >-
  Cuándo y cómo crear sub-agentes para compensar herramientas que el agente
  actual no tiene. Si una tarea requiere una tool que no está disponible
  (fs.write, bus.publishAndWait, ejecutor), el agente no debe rendirse ni
  fingir — debe crear un sub-agente vía crear_agente_desde_caso que SÍ tenga
  esas tools, pasarle los datos necesarios, y que él ejecute la operación.
when-to-use: >-
  Cuando una tarea requiere fs.write, bus.publishAndWait, ejecutor o cualquier
  tool que el agente actual no tiene. O cuando el agente falla consistentemente
  en persistir sus entregables. NO para tareas que el agente puede hacer directo.
source: hermes
tags: [delegacion, agente, herramienta, persistencia, colocacion]
---

# Delegación de agente

> Si no tienes la herramienta, crea el agente que sí la tiene.

## Cuándo delegar

Cuando una tarea requiere una tool que el agente actual no tiene. No rendirse,
no fingir que se hizo, no pedirle al usuario que lo haga manualmente — delegar.

Señales de que toca delegar:
- `fs.write` o `fs.edit` no están disponibles y hay que persistir un archivo
- `bus.publishAndWait` no está disponible y hay que llamar a un evento del sistema
- `ejecutor.ejecutar` no está disponible y hay que correr un comando

## Cómo delegar

```
1. Prepara los datos que el sub-agente necesita
2. Crea el sub-agente con las tools necesarias
   (en Enki: crear_agente_desde_caso, en otros: el mecanismo equivalente)
3. Confirma que la operación realmente ocurrió (verificar, no confiar)
```

## Lo que no funciona

- **Fingir que se escribió** — el sistema no miente.
- **Pedir al usuario que lo haga manualmente** — salvo último recurso.
- **Repetir el mismo intento esperando resultado distinto** — si falló por falta de tools, el siguiente igual.

## Verificar la delegación

Después de delegar, **verifica que la operación realmente ocurrió**. No confíes
en la palabra del sub-agente.
