---
name: piel-del-sistema
description: "Genera la interfaz viva de cualquier proyecto en Enki. No es una UI estática — es la PIEL del sistema: cada componente llama a eventos del bus, consulta cúpulas en caliente, opera el backend real (carrito, cobro, cuentas) y puede delegar al agente conversacional lo que la UI no resuelve sola. El HTML es solo el conductor; el sistema es el backend."
---

# Piel del Sistema

> La UI no se genera y se olvida. La UI se genera CONOCIENDO el sistema y OPERÁNDOLO en vivo.

Esta skill usa **`generar-ui-web`** como base (conocimiento universal de interfaces: layouts, navegación, estilo, UX) y lo extiende con el conocimiento del sistema Enki: cúpulas, eventos, skills de backend, agentes.

## Arquitectura

```
Usuario (navegador)
    │
    ▼
┌─────────────────────────────────────┐
│  PIEL (HTML/CSS/JS mínimo)         │
│  Se sirve una vez desde www/        │
│  Al cargar, se conecta al sistema   │
│  Cada interacción = RPC al bus      │
└──────────┬──────────────────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐  ┌──────────┐
│ EVENTOS│  │  AGENTE  │
│  bus   │  │  chat    │
│ MQTT   │  │  Enki    │
└────────┘  └──────────┘
```

## Inputs (los que recibe de `generar-ui-web` + sistema)

| Input | Cómo se obtiene |
|---|---|
| Anatomía del proyecto | `cupulas.vista_proyecto` |
| Marca (colores, fuentes, logo) | `cupulas.vista_proyecto` → identidad |
| UX / defaults | Propios de `generar-ui-web` |
| Audiencia | `cupulas.vista_proyecto` o default |
| **Skills backend** | Cantera: `prisma-carrito`, `prisma-cobro`, etc. |
| **Eventos del bus** | Cúpula de eventos |
| **Agentes disponibles** | Cúpula de agentes |

## Proceso

### Fase 1: Descubrir el sistema

1. `cupulas.vista_proyecto.request` → identidad, marca, configuración
2. Listar skills backend en cantera (`modules/cosecha/cantera/enki/prisma-*`)
3. Leer sus contratos (eventos request/response, payloads exactos) desde los SKILL.md
4. Listar agentes disponibles
5. Identificar flujo de operación del proyecto (venta, gestión, dashboard...)

Genera un JSON de **contexto del sistema**.

### Fase 2: Diseñar la piel

Con el contexto del sistema + el conocimiento de `generar-ui-web`, define:

- **Secciones:** ¿qué necesita ver el usuario? (catálogo, carrito, cobro, pedidos, dashboard)
- **Operaciones:** ¿qué puede hacer? (añadir al carrito, cobrar, consultar, buscar...)
- **Datos vivos:** ¿qué se carga del bus vs qué va estático?
- **Punto de fallback:** ¿qué pasa si el bus no responde? (delegar al agente)

### Fase 3: Generar la interfaz viva

Produce HTML+JS que:

1. **Al cargar:** hace fetch del contexto y pinta la UI con datos reales
2. **Cada interacción:** llama al bus MQTT (vía `ui/request/<dominio>/<accion>`)
3. **Opera el backend:** carrito, cobro, cuentas, productos — todo vía eventos
4. **Si algo falla:** muestra un botón "consultar al sistema" que envía un mensaje al chat de Enki
5. **Se refresca:** periódicamente o por evento, sin recargar la página

Requisitos técnicos de la piel generada:

```javascript
// Patrón de llamada al bus (el navegador no habla MQTT directo,
// así que la UI se comunica vía el chat como proxy RPC)
async function rpc(domain, action, payload) {
  // Opción A: fetch a un endpoint si existe
  // Opción B: genera un mensaje que el agente interpreta
  // Opción C: WebSocket si el sistema lo expone
}
```

## La piel no se abandona

A diferencia del HTML estático, la piel puede **evolucionar**:

- El agente `frontend-architect` puede regenerar secciones sin tocar todo
- Los datos los sirve el sistema, no el HTML — cambiar un precio no requiere regenerar
- Si el proyecto crece, la piel crece con él: nuevas skills en cantera → nuevas secciones en la UI

## Output

```
www/
├── index.html         ← Piel generada (liviana, se conecta al sistema)
├── manifest.json      ← Para PWA si aplica
└── config.json        ← Contexto del proyecto (marca, endpoints, skills)
```

El HTML es irrelevante sin el sistema. El sistema es el backend. El HTML es solo el conductor entre el ojo del usuario y los eventos del bus.
