# Análisis Completo de Flujos PizzePOS — Mapa de Eventos y Coordinación

> Fecha: 2026-03-04
> Versión: Análisis exhaustivo paso a paso de TODOS los flujos, eventos, cuentas y conflictos

---

## 1. MAPA GENERAL: Módulos y Sus Responsabilidades

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MÓDULOS PIZZEPOS                                  │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────┤
│  cuentas-    │  comandero   │   pedidos    │   cocina     │ cobros  │
│  canales     │              │              │              │         │
│  (canales)   │  (buffer     │  (pedido     │  (display    │ (pago)  │
│              │   camarero)  │   formal)    │   cocina)    │         │
├──────────────┼──────────────┼──────────────┼──────────────┼─────────┤
│  cuentas     │  impresion   │ persistencia │ productos    │variacio-│
│  (estado)    │  (ticket)    │ -comandero   │ (catálogo)   │nes      │
└──────────────┴──────────────┴──────────────┴──────────────┴─────────┘
```

---

## 2. LOS 5 TIPOS DE CUENTA — Qué es IGUAL y qué CAMBIA

### 2.1 Estructura COMÚN a TODAS las cuentas

Todas las cuentas, sin importar el canal, comparten:

| Campo | Descripción | Igual en todas |
|-------|------------|----------------|
| `cuenta_id` | ID único con prefijo del canal | ✅ (formato varía) |
| `estado` | pendiente→con_pedido→en_preparacion→listo→para_cobrar→cobrado | ✅ IDÉNTICO |
| `pagado` | boolean | ✅ |
| `items` | contador de items | ✅ |
| `total` | monto acumulado | ✅ |
| Máquina de estados | `transicionarEstado()` en módulo `cuentas` | ✅ IDÉNTICA |
| Tracking pedidos cocina | `_pedidosEnCocina` Map | ✅ IDÉNTICO |
| Eventos del flujo core | item_agregado → enviar_cocina → pedido_listo → cobro | ✅ IDÉNTICOS |

### 2.2 Lo que DIFIERE por canal

| Canal | Prefijo | Quién crea | Cierre con cobro.procesado | Lógica especial |
|-------|---------|-----------|---------------------------|-----------------|
| **Mesa** | `mesa_` | `MesaStrategy.handleAbrirMesa()` | Cierra inmediatamente | `cuentas` también auto-cierra si `tipo=local` |
| **Teléfono** | `tel_` | `TelefonoStrategy.handleCrearPedido()` | Marca `pagado=true`, solo cierra si `estado=recogido` | Espera recogida física |
| **Llevar** | `llevar_` | `LlevarStrategy.handleCrearTicket()` | Cierra inmediatamente | Similar a mesa |
| **Glovo** | `glovo_` | `GlovoStrategy.handleRecibirPedido()` | Cierra inmediatamente | Envía a cocina automáticamente al recibir |
| **WhatsApp** | `wa_` | `WhatsAppStrategy.handleCrearPedido()` | Cierra inmediatamente | Requiere paso de confirmación extra |

### 2.3 Prefijos de cuenta_id

```
mesa_     → mesa_{numero}_{YYYYMMDD}_{seq}
tel_      → tel_{YYYYMMDD}_{seq}
llevar_   → llevar_{YYYYMMDD}_{seq}
glovo_    → glovo_{YYYYMMDD}_{seq}
wa_       → wa_{YYYYMMDD}_{seq}
(sin prefijo) → crypto.randomUUID() (creada por cuentas.handleCreateCuenta directamente)
```

---

## 3. FLUJO PASO A PASO — CADA EVENTO CON SU HANDLER

### PASO 1: Creación de Cuenta

```
ORIGEN: cuentas-canales (strategy específica)
EVENTO: cuenta.creada
PAYLOAD: { cuenta_id, tipo, origen, project_id, total, metadata }
```

**¿Quién escucha `cuenta.creada`?**

| Módulo | Handler | Qué hace |
|--------|---------|----------|
| `cuentas` | `onCuentaExternaCreada()` | Registra en `this.cuentas` Map con estado `pendiente`. Guarda: id, project_id, tipo, nombre, estado, pagado=false, items=0, total=0. Inicia timer alerta 30min. |
| `pedidos` | `onCuentaCreada()` | Registra en `pedidosPorCuenta` Map: `pedidosPorCuenta.set(cuenta_id, new Set())` |
| `persistencia-comandero` | (registra evento) | Añade a `cuentasActivasCache`, persiste a disco |

**DEDUP**: `cuentas.onCuentaExternaCreada()` ignora si `this.cuentas.has(cuenta_id)` ya es true.

**NOTA**: Las cuentas creadas directamente por `cuentas.handleCreateCuenta()` (sin canal) también publican `cuenta.creada`, pero con un UUID sin prefijo. `cuentas-canales.detectarCanal()` retorna null para estos IDs.

---

### PASO 2: Agregar Item al Buffer del Comandero

```
ORIGEN: comandero.handleAddItem() (UI del camarero)
EVENTO: comandero.item_agregado
PAYLOAD: { cuenta_id, item_id, producto_id, nombre, precio_unitario, precio_total,
           cantidad, pedido_total, pedido_items, tipo?, variaciones?, ingredientes_base?,
           pizza_izquierda?, pizza_derecha?, ingredientes? }
```

**¿Quién escucha `comandero.item_agregado`?**

| Módulo | Handler | Qué hace |
|--------|---------|----------|
| `cuentas` | `onComanderoItemAgregado()` | `cuenta.items += 1`, `cuenta.total += precio_total`. Si estado=pendiente → transiciona a `con_pedido`. Si ya es con_pedido → solo publica `cuenta.actualizada`. |
| `variaciones` | (subscribe en module.json) | Valida variaciones del item |

**TRANSICIÓN**: `pendiente` → `con_pedido` (solo el primer item)

---

### PASO 3: Eliminar Item del Buffer

```
ORIGEN: comandero.handleRemoveItem() (UI del camarero)
EVENTO: comandero.item_eliminado
PAYLOAD: { cuenta_id, item_id, producto_id, precio_total, pedido_total, pedido_items }
```

**¿Quién escucha `comandero.item_eliminado`?**

| Módulo | Handler | Qué hace |
|--------|---------|----------|
| `cuentas` | `onComanderoItemEliminado()` | `cuenta.items -= 1` (min 0), `cuenta.total -= precio_total` (min 0). Si items=0 Y estado=con_pedido → estado='pendiente' directamente (sin usar transicionarEstado). |

**TRANSICIÓN**: `con_pedido` → `pendiente` (solo si items llega a 0)

**⚠️ DETALLE**: Este handler setea `cuenta.estado = 'pendiente'` directamente sin usar `transicionarEstado()`, lo que significa que NO pasa por la validación de transiciones. Luego publica `publishEstadoCambiado` manualmente.

---

### PASO 4: Enviar a Cocina (EVENTO PUENTE CRÍTICO)

```
ORIGEN: comandero.handleEnviarCocina() (camarero pulsa "Enviar")
EVENTO: comandero.enviar_cocina
PAYLOAD: { cuenta_id, pedido_id, project_id, items, total, notas_generales, created_at }
```

**¿Quién escucha `comandero.enviar_cocina`?**

| Módulo | Handler | Qué hace |
|--------|---------|----------|
| `cuentas` | `onComanderoEnviarCocina()` | Registra `pedido_id` en `_pedidosEnCocina[cuenta_id]` Set. Transiciona a `en_preparacion` desde con_pedido/listo/entregado/en_preparacion. |
| `pedidos` | `onComanderoEnviarCocina()` | **BRIDGE**: Crea pedido formal. Publica `pedido.creado` + `pedido.enviado_cocina`. |

**NOTA IMPORTANTE**: `pedidos` genera el `pedido_id` si no viene en el evento. Pero `comandero` SÍ genera uno: `ped_${Date.now()}_${uuid.slice(0,8)}`. Así que el `pedido_id` se origina en `comandero` y se propaga a `pedidos` y luego a `cocina`.

**TRANSICIONES POSIBLES**:
- `con_pedido` → `en_preparacion` (primer envío)
- `en_preparacion` → `en_preparacion` (envío adicional, re-entrada)
- `listo` → `en_preparacion` (cliente pide más después de que salga el primer plato)
- `entregado` → `en_preparacion` (cliente pide más después de comer)

---

### PASO 4b: Pedido Formal y Envío a Cocina

```
ORIGEN: pedidos.onComanderoEnviarCocina() (bridge)
EVENTOS: pedido.creado + pedido.enviado_cocina
```

**`pedido.creado` PAYLOAD**:
```javascript
{ pedido_id, cuenta_id, canal, project_id, estado, total, items[], created_at }
```

**`pedido.enviado_cocina` PAYLOAD**:
```javascript
{ pedido_id, cuenta_id, canal, items[], items_count, notas_generales, enviado_at }
// items incluyen: item_id, producto_id, nombre, cantidad, variaciones, notas
// + metadata especial: tipo, pizza_izquierda, pizza_derecha, ingredientes, ingredientes_base
```

**¿Quién escucha `pedido.enviado_cocina`?**

| Módulo | Handler | Qué hace |
|--------|---------|----------|
| `cocina` | `onPedidoEnviadoCocina()` | Crea `pedidoCocina` con todos los items en estado `pendiente`. Añade a `pedidosActivos` Map. Broadcast SSE a pantallas. |
| `impresion` | `onPedidoEnviadoCocina()` | Formatea comanda ESC/POS. Envía a impresora Bluetooth. |

**¿Quién escucha `pedido.creado`?**

| Módulo | Handler | Qué hace |
|--------|---------|----------|
| `MesaStrategy` | `onPedidoCreado()` | Si cuenta_id empieza con `mesa_`: actualiza `mesa.total += total`, `mesa.pedidos_count++` |

---

### PASO 5: Preparación en Cocina (Item por Item)

```
ORIGEN: cocina.handlePrepararItem() (cocinero toca item en pantalla)
```

**Primer tap** (pendiente → preparando):
```
EVENTO: cocina.item_preparando
PAYLOAD: { pedido_id, cuenta_id, canal, item_id, producto_id, nombre, cantidad, preparando_at }
```
→ Solo UI/SSE, ningún handler de negocio escucha.

**Segundo tap** (preparando → listo):
```
EVENTO: cocina.item_preparado
PAYLOAD: { pedido_id, cuenta_id, canal, item_id, producto_id, nombre, cantidad, preparado_at }
```
→ Solo UI/SSE, ningún handler de negocio escucha.

**Cuando TODOS los items del pedido están listo** → auto-llama `marcarPedidoListo()`:

---

### PASO 6: Pedido Listo en Cocina (EVENTO CRÍTICO)

```
ORIGEN: cocina.marcarPedidoListo() (automático o manual)
EVENTO: cocina.pedido_listo
PAYLOAD: { pedido_id, cuenta_id, canal, items_count, tiempo_preparacion, listo_at }
```

**¿Quién escucha `cocina.pedido_listo`?**

| Módulo | Handler | Qué hace |
|--------|---------|----------|
| `cuentas` | `onCocinaPedidoListo()` | Quita `pedido_id` del Set `_pedidosEnCocina[cuenta_id]`. Si el Set queda vacío → transiciona `en_preparacion` → `listo`. Si quedan pedidos → NO transiciona, solo log. |
| `TelefonoStrategy` | `onCocinaPedidoListo()` | Busca en `pedidosActivos` por `pedido_id`. Si encuentra → `marcarListo()` → envía WhatsApp al cliente. |
| `LlevarStrategy` | `onCocinaPedidoListo()` | Busca en `ticketsActivos` por `pedido_id`. Si encuentra → `marcarListo()` → muestra en display SSE. |
| `GlovoStrategy` | `onCocinaPedidoListo()` | Busca en `pedidosActivos` por `pedido_id`. Si encuentra → `marcarListoInterno()` → notifica API Glovo. |
| `WhatsAppStrategy` | `onCocinaPedidoListo()` | Busca en `pedidosActivos` por `pedido_id`. Si encuentra → `notificarListo()` → envía WhatsApp. |

**TRANSICIÓN en cuentas**: `en_preparacion` → `listo` (solo cuando NO quedan pedidos pendientes en cocina)

**⚠️ PROBLEMA POTENCIAL**: Las strategies de `cuentas-canales` buscan el `pedido_id` en su propio Map `pedidosActivos`/`ticketsActivos` (campo `pedidos[]`). Si el pedido no fue registrado ahí (ej: se creó por comandero directo sin pasar por la strategy), no lo encontrará.

---

### PASO 7: Marcar Entregado (Solo Manual)

```
ORIGEN: cuentas.handleMarcarEntregado() (UI)
NO hay evento explícito — es un UI handler directo
```

- Solo permite si `cuenta.estado === 'listo'`
- Transiciona `listo` → `entregado`
- Si `cuenta.pagado === true` → llama `cerrarCuentaCobrada()`

**NOTA**: Este paso es manual y opcional. Para mesa (`tipo=local`), el módulo `cuentas` auto-cierra en `onCobroProcesado` sin pasar por entregado.

---

### PASO 8: Iniciar Cobro

```
ORIGEN: cobros.handleCreateCobro() (UI abre panel de cobro)
EVENTO: cobro.iniciado
PAYLOAD: { cobro_id, cuenta_id, monto, metodo_pago, propina, monto_total }
```

**¿Quién escucha `cobro.iniciado`?**

| Módulo | Handler | Qué hace |
|--------|---------|----------|
| `cuentas` | `onCobroIniciado()` | Si estado=listo O estado=entregado → transiciona a `para_cobrar` |

**TRANSICIÓN**: `listo` → `para_cobrar` O `entregado` → `para_cobrar`

**⚠️ VALIDACIÓN**: Si la cuenta NO está en listo/entregado, el cobro se inicia en `cobros` pero `cuentas` NO transiciona. El cobro queda creado pero el estado de la cuenta no cambia.

---

### PASO 9: Confirmar Cobro (EVENTO MÁS CRÍTICO)

```
ORIGEN: cobros.handleConfirmarCobro() (pago procesado)
EVENTO: cobro.procesado
PAYLOAD: { cobro_id, cuenta_id, monto_total, metodo_pago, referencia_pago, completado_at }
```

**⚠️⚠️⚠️ AQUÍ ESTÁ EL CONFLICTO PRINCIPAL ⚠️⚠️⚠️**

**¿Quién escucha `cobro.procesado`?** AMBOS módulos:

#### Handler 1: `cuentas.onCobroProcesado()` (línea 385)

```javascript
// Guardia idempotencia
if (cuenta.pagado || cuenta.estado === 'cobrado') return;

cuenta.pagado = true;
publishCuentaActualizada({ pagado: true });

// ⚠️ CONDICIÓN ESPECIAL para tipo 'local' (mesa):
if (cuenta.estado === 'entregado' || cuenta.tipo === 'local') {
    await this.cerrarCuentaCobrada(cuenta_id);
    // → estado = 'cobrado' (directo, sin transicionarEstado)
    // → publishEstadoCambiado()
    // → limpia _pedidosEnCocina
    // → setTimeout 5min → elimina cuenta del Map
}
```

#### Handler 2: `cuentas-canales.onCobroProcesado()` (línea 145)

```javascript
const strategy = this.detectarCanal(cuenta_id);
if (!strategy) return; // ← sin prefijo = no hace nada

await strategy.onCobroProcesado(cuenta_id, correlationId, project_id);
```

Luego cada strategy:

| Strategy | Qué hace | Publica `cuenta.cerrada`? |
|----------|----------|--------------------------|
| **Mesa** | `cerrarMesa()` → publica `mesa.cerrada` + `cuenta.cerrada` → elimina de `mesasActivas` | ✅ SÍ |
| **Teléfono** | Marca `pagado=true`. Solo cierra si `estado=recogido`. Si no → espera. | ✅ Solo si recogido |
| **Llevar** | `cerrarTicket()` → publica `cuenta.cerrada` → elimina de `ticketsActivos` | ✅ SÍ |
| **Glovo** | `cerrarCuentaGlovo()` → publica `cuenta.cerrada` → elimina de Maps | ✅ SÍ |
| **WhatsApp** | `cerrarPedido()` → publica `cuenta.cerrada` → elimina de Maps | ✅ SÍ |

#### Handler 3: `cuentas.onCuentaExternaCerrada()` escucha `cuenta.cerrada`

```javascript
// Elimina la cuenta del Map de cuentas
this.cuentas.delete(cuenta_id);
this._pedidosEnCocina.delete(cuenta_id);
// Limpia timer de alerta
```

---

## 4. ⚠️ CONFLICTOS Y PROBLEMAS DETECTADOS

### CONFLICTO 1: Doble Cierre en Mesa (tipo=local)

Cuando `cobro.procesado` se dispara para una mesa:

1. `cuentas.onCobroProcesado()` → ve `tipo === 'local'` → llama `cerrarCuentaCobrada()`:
   - Estado → `cobrado` (directo)
   - `publishEstadoCambiado()`
   - Programa eliminación en 5 minutos

2. `cuentas-canales.onCobroProcesado()` → detecta prefijo `mesa_` → `MesaStrategy.cerrarMesa()`:
   - Publica `mesa.cerrada`
   - Publica `cuenta.cerrada`
   - Elimina de `mesasActivas`

3. `cuentas.onCuentaExternaCerrada()` → escucha `cuenta.cerrada`:
   - Intenta `this.cuentas.delete(cuenta_id)` → la cuenta puede que ya esté en proceso de eliminación por el timeout de 5min

**RESULTADO**: La cuenta se procesa DOS veces. `cuentas` la marca como cobrada Y `cuentas-canales` la cierra Y `cuentas` la elimina de nuevo. Funciona por las guardias de idempotencia pero es redundante y frágil.

### CONFLICTO 2: Teléfono — Cobro Antes de Recogida

Para cuentas con prefijo `tel_`:

1. `cuentas.onCobroProcesado()`:
   - `cuenta.pagado = true`
   - **NO** cierra porque `cuenta.estado !== 'entregado'` Y `cuenta.tipo !== 'local'` (es 'telefono')
   - La cuenta queda pagada pero abierta

2. `cuentas-canales.onCobroProcesado()` → `TelefonoStrategy.onCobroProcesado()`:
   - Marca `pedido.pagado = true`
   - Si `pedido.estado === 'recogido'` → cierra
   - Si NO → espera recogida

**PREGUNTA**: ¿Qué pasa cuando el cliente recoge? `TelefonoStrategy.marcarRecogido()` cierra si `pagado=true`. Pero `cuentas` NO tiene handler para esto. La cuenta en `cuentas` queda en estado `para_cobrar` o `listo` indefinidamente hasta que `cuenta.cerrada` la limpie.

### CONFLICTO 3: cerrarCuentaCobrada() Bypasea la Máquina de Estados

`cerrarCuentaCobrada()` (línea 429) hace:
```javascript
cuenta.estado = 'cobrado';  // ← Directo, sin transicionarEstado()
```

Esto NO valida `TRANSICIONES_VALIDAS`. Si la cuenta está en un estado inesperado (ej: `listo` para mesa porque se cobró sin pasar por `para_cobrar`), el estado se fuerza a `cobrado` sin validación.

### CONFLICTO 4: `handleMarcarEntregado` Solo Acepta `listo`

```javascript
if (cuenta.estado !== 'listo') {
    return { status: 400, error: `...actual: ${cuenta.estado}` };
}
```

Pero en la máquina de estados, `entregado` es accesible desde `listo`:
```javascript
listo: ['entregado', 'para_cobrar', 'en_preparacion']
```

¿Qué pasa si quieres marcar entregado cuando está `para_cobrar`? No se puede. El UI handler rechaza. Pero la transición `para_cobrar → cobrado` sí existe, así que para mesa se salta entregado.

### CONFLICTO 5: Cuentas Sin Prefijo (creadas por handleCreateCuenta)

Si alguien crea una cuenta por `cuentas.handleCreateCuenta()`:
- `cuenta_id` = `crypto.randomUUID()` (sin prefijo)
- `cuentas-canales.detectarCanal()` retorna `null`
- `cobro.procesado` → `cuentas-canales` ignora la cuenta
- `cuentas.onCobroProcesado()` → si `tipo === 'local'` → cierra
- Pero NO se publica `cuenta.cerrada` (porque nadie en cuentas-canales la gestiona)
- `persistencia-comandero` NO recibe `cuenta.cerrada` → la venta no se registra correctamente

---

## 5. MAPA DE EVENTOS COMPLETO POR MÓDULO

### Eventos PUBLICADOS

| Módulo | Evento | Cuándo |
|--------|--------|--------|
| **cuentas** | `cuenta.creada` | handleCreateCuenta |
| **cuentas** | `cuenta.actualizada` | Cualquier cambio de campo |
| **cuentas** | `cuenta.estado_cambiado` | Transición de estado |
| **cuentas** | `cuenta.eliminada` | Eliminación (manual o auto) |
| **cuentas-canales** | `cuenta.creada` | Cada strategy al crear cuenta |
| **cuentas-canales** | `cuenta.cerrada` | Cada strategy al cerrar |
| **cuentas-canales** | `mesa.abierta/cerrada/renombrada/camarero_asignado` | Mesa |
| **cuentas-canales** | `telefono.llamada_detectada/contacto_identificado/pedido_creado/listo_para_recoger` | Teléfono |
| **cuentas-canales** | `llevar.ticket_creado/ticket_listo/ticket_entregado` | Llevar |
| **cuentas-canales** | `glovo.pedido_recibido/aceptado/rechazado/listo/recogido` | Glovo |
| **cuentas-canales** | `whatsapp.mensaje_recibido/pedido_creado/pedido_confirmado/pedido_listo` | WhatsApp |
| **comandero** | `comandero.item_agregado` | addItem |
| **comandero** | `comandero.item_eliminado` | removeItem |
| **comandero** | `comandero.enviar_cocina` | enviarCocina |
| **pedidos** | `pedido.creado` | Bridge o handleCreatePedido |
| **pedidos** | `pedido.item_agregado/actualizado/eliminado` | CRUD items |
| **pedidos** | `pedido.enviado_cocina` | Bridge o handleEnviarCocina |
| **pedidos** | `pedido.completado` | handleCompletarPedido |
| **pedidos** | `pedido.cancelado` | handleCancelarPedido |
| **cocina** | `cocina.item_preparando` | Primer tap |
| **cocina** | `cocina.item_preparado` | Segundo tap |
| **cocina** | `cocina.pedido_listo` | Todos items listos |
| **cobros** | `cobro.iniciado` | handleCreateCobro |
| **cobros** | `cobro.procesado` | handleConfirmarCobro |
| **cobros** | `cobro.reembolsado` | handleReembolsarCobro |
| **impresion** | `impresion.comanda_generada` | Ticket impreso |
| **impresion** | `impresion.error` | Error de impresión |
| **persistencia** | `caja.cerrada` | Cierre de caja |
| **persistencia** | `dia.iniciado` | Inicio de día |

### Eventos SUSCRITOS (quién escucha qué)

| Evento | → Módulo.Handler | Acción |
|--------|-----------------|--------|
| `cuenta.creada` | → `cuentas.onCuentaExternaCreada` | Registra en Map (dedup) |
| `cuenta.creada` | → `pedidos.onCuentaCreada` | Registra en pedidosPorCuenta |
| `cuenta.cerrada` | → `cuentas.onCuentaExternaCerrada` | Elimina del Map |
| `cuenta.actualizada` | → `comandero.onCuentaActualizada` | Solo log |
| `comandero.item_agregado` | → `cuentas.onComanderoItemAgregado` | items++, total++, pendiente→con_pedido |
| `comandero.item_agregado` | → `variaciones` (subscribed) | Valida variaciones |
| `comandero.item_eliminado` | → `cuentas.onComanderoItemEliminado` | items--, con_pedido→pendiente si vacío |
| `comandero.enviar_cocina` | → `cuentas.onComanderoEnviarCocina` | Track pedido, →en_preparacion |
| `comandero.enviar_cocina` | → `pedidos.onComanderoEnviarCocina` | BRIDGE: crea pedido formal |
| `pedido.creado` | → `MesaStrategy.onPedidoCreado` | Actualiza total mesa |
| `pedido.enviado_cocina` | → `cocina.onPedidoEnviadoCocina` | Añade a pedidosActivos |
| `pedido.enviado_cocina` | → `impresion.onPedidoEnviadoCocina` | Imprime ticket |
| `pedido.cancelado` | → `cocina.onPedidoCancelado` | Quita de pedidosActivos |
| `pedido.completado` | → `cobros.onPedidoCompletado` | Solo log (no acción) |
| `cocina.pedido_listo` | → `cuentas.onCocinaPedidoListo` | Quita del tracking, →listo |
| `cocina.pedido_listo` | → `TelefonoStrategy.onCocinaPedidoListo` | Marca listo, WhatsApp |
| `cocina.pedido_listo` | → `LlevarStrategy.onCocinaPedidoListo` | Marca listo, display |
| `cocina.pedido_listo` | → `GlovoStrategy.onCocinaPedidoListo` | Marca listo, notifica API |
| `cocina.pedido_listo` | → `WhatsAppStrategy.onCocinaPedidoListo` | Marca listo, WhatsApp |
| `cobro.iniciado` | → `cuentas.onCobroIniciado` | listo/entregado→para_cobrar |
| `cobro.procesado` | → `cuentas.onCobroProcesado` | pagado=true, auto-cierra si local |
| `cobro.procesado` | → `cuentas-canales.onCobroProcesado` | Delega a strategy por prefijo |
| `catalogo.actualizado` | → `comandero.onCatalogoActualizado` | Sync cache productos |
| `catalogo.actualizado` | → `pedidos.onCatalogoActualizado` | Sync cache productos |
| `producto.creado/actualizado` | → `comandero.onProductoActualizado` | Actualiza cache |
| `producto.creado/actualizado` | → `pedidos.onProductoActualizado` | Actualiza cache |
| `caja.cerrada` | → `comandero.onCajaCerrada` | Limpia todos los buffers |
| `dia.iniciado` | → `comandero.onDiaIniciado` | Limpia todos los buffers |

---

## 6. DIAGRAMA DE FLUJO COMPLETO POR TIPO DE CUENTA

### 6.1 MESA (tipo=local, prefijo=mesa_)

```
MesaStrategy.handleAbrirMesa()
  ├─ Crea mesa en mesasActivas Map
  ├─ publica mesa.abierta
  └─ publica cuenta.creada {tipo:'mesa', cuenta_id:'mesa_1_...'}
       ├─→ cuentas.onCuentaExternaCreada() → registra en cuentas Map
       └─→ pedidos.onCuentaCreada() → registra en pedidosPorCuenta

comandero.handleAddItem({cuenta_id:'mesa_1_...'})
  └─ publica comandero.item_agregado
       └─→ cuentas: items++, pendiente→con_pedido

comandero.handleEnviarCocina({cuenta_id:'mesa_1_...'})
  └─ publica comandero.enviar_cocina
       ├─→ cuentas: track pedido, con_pedido→en_preparacion
       └─→ pedidos: crea pedido formal
            └─ publica pedido.enviado_cocina
                 ├─→ cocina: añade a display
                 └─→ impresion: imprime ticket

cocina → todos items listos
  └─ publica cocina.pedido_listo
       ├─→ cuentas: quita del tracking, en_preparacion→listo
       └─→ (strategies: mesa no escucha cocina.pedido_listo directamente)

cobros.handleCreateCobro()
  └─ publica cobro.iniciado
       └─→ cuentas: listo→para_cobrar

cobros.handleConfirmarCobro()
  └─ publica cobro.procesado  ← ⚠️ DOBLE HANDLING
       ├─→ cuentas.onCobroProcesado():
       │    pagado=true
       │    tipo==='local' → cerrarCuentaCobrada()
       │      → estado='cobrado'
       │      → setTimeout 5min → elimina
       │
       └─→ cuentas-canales.onCobroProcesado():
            MesaStrategy.cerrarMesa()
              ├─ publica mesa.cerrada
              ├─ publica cuenta.cerrada
              └─ elimina de mesasActivas
                   └─→ cuentas.onCuentaExternaCerrada():
                        elimina del Map (ya en estado cobrado)
```

### 6.2 TELÉFONO (tipo=telefono, prefijo=tel_)

```
TelefonoStrategy.handleCrearPedido()
  ├─ Crea pedido en pedidosActivos Map
  ├─ publica telefono.pedido_creado
  └─ publica cuenta.creada {tipo:'telefono', cuenta_id:'tel_...'}
       ├─→ cuentas: registra (estado pendiente)
       └─→ pedidos: registra

[mismos pasos de comandero/cocina que mesa]

cocina → todos items listos
  └─ publica cocina.pedido_listo
       ├─→ cuentas: en_preparacion→listo
       └─→ TelefonoStrategy.onCocinaPedidoListo():
            marcarListo() → envía WhatsApp "tu pedido está listo"

cobros.handleConfirmarCobro()
  └─ publica cobro.procesado
       ├─→ cuentas.onCobroProcesado():
       │    pagado=true
       │    estado!='entregado' Y tipo!='local'
       │    → NO cierra (espera)
       │
       └─→ TelefonoStrategy.onCobroProcesado():
            pagado=true
            estado!='recogido' → NO cierra (espera recogida)

TelefonoStrategy.handleMarcarRecogido()  ← el cliente viene a buscar
  └─ marcarRecogido():
       estado='recogido'
       pagado===true → cerrarCuenta()
         └─ publica cuenta.cerrada
              └─→ cuentas: elimina del Map

⚠️ PROBLEMA: cuentas sigue con la cuenta en estado 'para_cobrar'
   hasta que llega cuenta.cerrada. No hay transición a cobrado.
```

### 6.3 LLEVAR (tipo=llevar, prefijo=llevar_)

```
LlevarStrategy.handleCrearTicket()
  ├─ Crea ticket en ticketsActivos Map
  ├─ publica llevar.ticket_creado
  └─ publica cuenta.creada {tipo:'llevar'}

[mismos pasos de comandero/cocina]

cocina → pedido listo
  └─ cocina.pedido_listo
       ├─→ cuentas: en_preparacion→listo
       └─→ LlevarStrategy.onCocinaPedidoListo():
            marcarListo() → display SSE "Número X listo!"

cobros.handleConfirmarCobro()
  └─ cobro.procesado
       ├─→ cuentas.onCobroProcesado():
       │    pagado=true
       │    estado!='entregado' Y tipo!='local' → NO cierra
       │
       └─→ LlevarStrategy.onCobroProcesado():
            cerrarTicket() INMEDIATAMENTE
              └─ publica cuenta.cerrada
                   └─→ cuentas: elimina del Map

⚠️ INCONSISTENCIA: Para llevar, cuentas NO cierra (porque no es local),
   pero cuentas-canales SÍ cierra inmediatamente.
   El estado en cuentas queda como para_cobrar/listo con pagado=true
   hasta que cuenta.cerrada lo elimine.
```

### 6.4 GLOVO (tipo=glovo, prefijo=glovo_)

```
GlovoStrategy.handleRecibirPedido()
  ├─ Crea pedido en pedidosActivos Map
  ├─ publica glovo.pedido_recibido
  ├─ AUTO-ENVÍA A COCINA: publica pedido.enviado_cocina directamente
  │    (sin pasar por comandero ni pedidos module!)
  └─ NO publica cuenta.creada aquí (solo en aceptar)

GlovoStrategy.handleAceptarPedido()
  └─ publica cuenta.creada {tipo:'glovo'}

⚠️ PROBLEMA GLOVO: El pedido.enviado_cocina se publica ANTES de que
   la cuenta exista en el módulo cuentas (porque cuenta.creada se
   publica en aceptar, no en recibir).
   cocina recibe el pedido pero cuentas no sabe de esta cuenta aún.

cobros.handleConfirmarCobro()
  └─ cobro.procesado
       ├─→ cuentas: pagado=true, NO cierra (no es local)
       └─→ GlovoStrategy.onCobroProcesado():
            cerrarCuentaGlovo() → publica cuenta.cerrada
```

### 6.5 WHATSAPP (tipo=whatsapp, prefijo=wa_)

```
WhatsAppStrategy.handleCrearPedido()
  ├─ Crea pedido en pedidosActivos (estado: pendiente_confirmacion)
  ├─ publica whatsapp.pedido_creado
  └─ NO publica cuenta.creada aquí (solo en confirmar)

WhatsAppStrategy.handleConfirmarPedido()
  └─ publica cuenta.creada {tipo:'whatsapp'}

⚠️ MISMO PROBLEMA: cuenta.creada se publica DESPUÉS del pedido_creado.
   Si alguien envía a cocina antes de confirmar, cuentas no tiene la cuenta.

cobros.handleConfirmarCobro()
  └─ cobro.procesado
       ├─→ cuentas: pagado=true, NO cierra
       └─→ WhatsAppStrategy.onCobroProcesado():
            cerrarPedido() → publica cuenta.cerrada
```

---

## 7. RESUMEN DE PROBLEMAS A RESOLVER

### P1. Doble cierre para mesa
**Síntoma**: `cuentas` y `cuentas-canales` ambos cierran la cuenta mesa.
**Solución**: Que `cuentas` NO auto-cierre para cuentas con prefijo (delegar a `cuentas-canales`), O que `cuentas-canales` NO cierre para mesa (delegar a `cuentas`). Elegir UNO.

### P2. Estado inconsistente para canales no-local
**Síntoma**: Para tel/llevar/glovo/wa, `cuentas.onCobroProcesado` marca `pagado=true` pero NO cierra. La cuenta queda en estado `para_cobrar` con `pagado=true` hasta que `cuenta.cerrada` la elimine.
**Solución**: O bien `cuentas` siempre cierra al recibir cobro.procesado (y las strategies solo limpian su propio estado), o `cuentas` nunca cierra y siempre espera `cuenta.cerrada`.

### P3. Glovo publica pedido.enviado_cocina antes de que la cuenta exista en cuentas
**Síntoma**: `cuentas.onComanderoEnviarCocina` no encontrará la cuenta. `cocina` recibirá el pedido pero el tracking en `_pedidosEnCocina` no se actualizará.
**Solución**: Glovo debería publicar `cuenta.creada` al recibir (no al aceptar), o no enviar a cocina hasta aceptar.

### P4. WhatsApp similar a Glovo
**Síntoma**: `cuenta.creada` se publica al confirmar, no al crear.
**Solución**: Similar a P3.

### P5. cerrarCuentaCobrada() bypass de máquina de estados
**Síntoma**: Setea `estado='cobrado'` directamente sin validar transición.
**Solución**: Usar `transicionarEstado()` o al menos validar que la transición sea legal.

### P6. onComanderoItemEliminado() bypass de máquina de estados
**Síntoma**: Setea `cuenta.estado = 'pendiente'` directamente.
**Solución**: Usar `transicionarEstado()`.

### P7. Falta transición para_cobrar → cobrado explícita
**Síntoma**: No hay handler que haga la transición formal para_cobrar→cobrado. `cerrarCuentaCobrada()` lo fuerza.
**Solución**: `onCobroProcesado()` debería transicionar para_cobrar→cobrado antes de cerrar.

---

## 8. PROPUESTA DE FLUJO LIMPIO

### Principio: UN solo responsable del cierre

```
REGLA: El módulo `cuentas` es el DUEÑO del ciclo de vida de la cuenta.
       `cuentas-canales` es el DUEÑO de la lógica específica del canal.

cobro.procesado
  ├─→ cuentas.onCobroProcesado():
  │    1. pagado = true
  │    2. transicionar para_cobrar → cobrado
  │    3. publishEstadoCambiado
  │    4. Programar eliminación (5 min)
  │
  └─→ cuentas-canales.onCobroProcesado():
       1. Limpiar estado propio del canal (mesasActivas, pedidosActivos, etc.)
       2. Publicar evento específico (mesa.cerrada, etc.)
       3. NO publicar cuenta.cerrada (ya no es necesario)

O ALTERNATIVA:

cobro.procesado
  └─→ cuentas-canales.onCobroProcesado():
       1. Limpiar estado propio del canal
       2. Publicar cuenta.cerrada

cuenta.cerrada
  └─→ cuentas.onCuentaExternaCerrada():
       1. transicionar → cobrado
       2. Eliminar
```
