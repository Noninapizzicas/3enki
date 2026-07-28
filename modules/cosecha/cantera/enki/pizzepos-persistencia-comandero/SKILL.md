---
name: persistencia-comandero
description: >-
  Event-sourcing + jornada para pizzepos. Sustrato de persistencia: captura
  TODOS los eventos del bus pizzepos, mantiene snapshots de cuentas activas,
  registra ventas, orquesta cierre de caja diario, multi-proyecto. Sin tools —
  es infraestructura de persistencia, no invocable directamente.
fuente: enki
dominio: comercio
tags: [pizzepos, persistencia, event-sourcing, caja, ventas, snapshot, backup]
---

# Pizzepos · persistencia-comandero

> **Qué es.** El sistema de persistencia y event-sourcing de todo el POS.
> Escucha **todos** los eventos del bus pizzepos, los persiste en archivos
> JSON por fecha, mantiene snapshots de cuentas activas, registra ventas,
> y orquesta el cierre de caja diario y el inicio de nuevo día.
>
> **Reflejo puro:** toda la lógica es determinista. Sin blueprint. Sin LLM.
> **Sin tools:** no se invoca desde el LLM. Es infraestructura de persistencia.
>
> Código: `modules/pizzepos/persistencia-comandero/index.js` · v`4.0.0`

---

## 1 · LÓGICA (event-sourcing)

### Qué persiste y dónde

```
data/
├── current/                          ← snapshots del día actual
│   ├── eventos.json                  cola de eventos en curso
│   ├── ventas.json                   ventas del día
│   ├── cuentas_activas.json          cuentas abiertas ahora
│   └── jornada.json                  estado de la jornada
├── eventos/<fecha>.json              histórico de eventos por día
├── ventas/<fecha>.json               histórico de ventas por día
├── backups/backup_<fecha>_<ts>/      backups completos
└── projects/<id>/persistencia/       multi-tenant (igual estructura)
    ├── current/...
    ├── eventos/<fecha>.json
    ├── ventas/<fecha>.json
    └── backups/...
```

### Eventos que captura (30+)

Escucha prácticamente todo el bus del POS:

| Grupo | Eventos |
|-------|---------|
| **Cuentas** | `cuenta.creada`, `cuenta.cerrada`, `cuenta.eliminada`, `cuenta.estado_cambiado`, `cuenta.actualizada`, `cuenta.cerrada_forzada` |
| **Comandero** | `comandero.item_agregado`, `comandero.item_eliminado`, `comandero.enviar_cocina` |
| **Cocina** | `cocina.item_preparando`, `cocina.item_preparado`, `cocina.item_avanzado`, `cocina.pedido_listo` |
| **Cobros** | `cobro.iniciado`, `cobro.procesado`, `cobro.reembolsado` |
| **Pedidos** | `pedido.creado`, `pedido.enviado_cocina`, `pedido.completado` |
| **Canales** | `mesa.abierta`, `mesa.cerrada`, `mesa.renombrada`, `telefono.pedido_creado`, `llevar.ticket_creado` |
| **Sistema** | `boton.pulsado`, `ui.accion`, `catalogo.actualizado`, `project.deleted` |

### Ciclo de la jornada

```
INICIO DÍA
  ↓  persistencia.iniciar_dia
  ↓  → publica dia.iniciado (resetea cachés, comienza nueva fecha)
  ↓
OPERACIÓN
  ↓  escucha todos los eventos del bus
  ↓  → persiste cada evento en eventos/<fecha>.json
  ↓  → mantiene snapshot cuentas_activas.json
  ↓  → registra ventas en ventas/<fecha>.json
  ↓
CIERRE DE CAJA
  ↓  persistencia.cierre
  ↓  → fuerza cierre de cuentas abiertas (emite cuenta.cerrada_forzada)
  ↓  → persiste cuadre de caja en contabilidad/cierres/
  ↓  → publica caja.cerrada (comandero resetea buffers)
  ↓  → genera backup automático
```

---

## 2 · UI (frontend)

UI Handlers en panel lateral derecho (system_panel):

| Ruta | Handler | Qué muestra |
|------|---------|-------------|
| `persistencia.cuentas_activas` | `handleGetCuentasActivas` | Snapshot actual de cuentas abiertas |
| `persistencia.eventos` | `handleGetEventos` | Últimos eventos registrados |
| `persistencia.eventos_fecha` | `handleGetEventosFecha` | Eventos de una fecha específica |
| `persistencia.ventas` | `handleGetVentas` | Ventas del día |
| `persistencia.ventas_fecha` | `handleGetVentasFecha` | Ventas de una fecha |
| `persistencia.cuadre` | `handleCuadreCaja` | Cuadre de caja del día |
| `persistencia.cuadre_fecha` | `handleCuadreCajaFecha` | Cuadre de una fecha |
| `persistencia.cierre` | `handleCierreCaja` | Ejecuta cierre de caja |
| `persistencia.iniciar_dia` | `handleIniciarDia` | Inicia nuevo día |
| `persistencia.backup` | `handleBackup` | Genera backup manual |

---

## 3 · FLUJO TÍPICO

### Inicio de día

```
1. CAJA abre turno     → persistencia.iniciar_dia
2. MÓDULO publica       → dia.iniciado (todos los módulos resetean)
3. PERSISTENCIA crea    → data/eventos/<hoy>.json vacío
                        → data/ventas/<hoy>.json vacío
                        → resetea cuentas_activas.json
```

### Durante la operación (escritura asíncrona)

```
1. MÓDULO X emite      → cualquier evento del bus
2. PERSISTENCIA recibe  → onEvento() encola en write queue
3. WRITE QUEUE          → serializado, single-instance
4. Persiste en          → eventos/<hoy>.json (append)
5. Si es evento de      → cuenta: actualiza cuentas_activas.json
   cuenta/venta         → ventas: actualiza ventas.json
```

### Cierre de caja

```
1. CAJA ejecuta        → persistencia.cierre
2. PERSISTENCIA         → fuerza cierre de cuentas abiertas
                          (emite cuenta.cerrada_forzada por cada una)
3. PERSISTENCIA         → persiste cuadre en contabilidad/cierres/
4. PERSISTENCIA         → publica caja.cerrada
5. COMANDERO recibe     → resetea buffers
6. COCINA recibe        → resetea pedidos activos
7. PERSISTENCIA         → backup automático a data/backups/
```

---

## 4 · INTEGRACIÓN

> **Este módulo NO tiene tools.** No se invoca desde el LLM. Es la memoria
> del sistema — persiste todo lo que pasa para que el resto pueda operar
> en memoria y sobrevivir a reinicios.

> **Multi-tenant:** cada proyecto tiene su propio árbol `data/projects/<id>/persistencia/`.
> `project.deleted` purga las cachés del proyecto para que los jobs periódicos
> no regeneren datos de proyectos muertos.

> **Atomicidad:** single-writer queue serializado. Cada escritura es tmp+rename.

> **Snapshot de cuentas activas:** se restaura en onLoad desde
> `cuentas_activas.json`. Es como el POS recuerda las mesas abiertas tras
> un reinicio del servidor.
