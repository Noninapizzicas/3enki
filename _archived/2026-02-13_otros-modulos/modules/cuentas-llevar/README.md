# Módulo Cuentas-Llevar v1.0

**Gestión de para llevar - Sistema de tickets y display de números**

## 🎯 Responsabilidad

Gestionar pedidos para llevar de clientes que esperan en el local. Sistema de tickets numerados con display en tiempo real (SSE) para mostrar números listos.

## ✅ Características

- ✅ **Auto-numeración con reseteo diario** - `llevar_{YYYYMMDD}_{secuencial}`
- ✅ **Sistema de tickets** - Números claros para el cliente
- ✅ **Display en tiempo real (SSE)** - Pantalla con números listos
- ✅ **Métricas de tiempo** - Preparación y espera
- ✅ **Sin teléfono necesario** - Ideal para walk-in customers
- ✅ **100% Event-Driven** - Solo MQTT
- ✅ **< 400 líneas** - Código limpio

## 📦 Eventos Publicados

### Eventos Específicos

#### `llevar.ticket_creado`
```json
{
  "event_type": "llevar.ticket_creado",
  "payload": {
    "cuenta_id": "llevar_20250117_047",
    "numero_ticket": 47,
    "cliente_nombre": "Cliente 47",
    "hora_creacion": "2025-01-17T14:00:00Z"
  }
}
```

#### `llevar.ticket_listo`
```json
{
  "event_type": "llevar.ticket_listo",
  "payload": {
    "cuenta_id": "llevar_20250117_047",
    "numero_ticket": 47,
    "cliente_nombre": "Cliente 47",
    "hora_listo": "2025-01-17T14:15:00Z",
    "tiempo_preparacion": 15
  }
}
```

#### `llevar.ticket_entregado`
```json
{
  "event_type": "llevar.ticket_entregado",
  "payload": {
    "cuenta_id": "llevar_20250117_047",
    "numero_ticket": 47,
    "total": 12.50,
    "tiempo_espera": 3,
    "hora_entrega": "2025-01-17T14:18:00Z"
  }
}
```

### Eventos Base (al módulo `cuentas`)

#### `cuenta.creada`
```json
{
  "event_type": "cuenta.creada",
  "payload": {
    "cuenta_id": "llevar_20250117_047",
    "tipo": "llevar",
    "origen": "cuentas-llevar",
    "numero_ticket": 47,
    "total": 0,
    "metadata": {
      "cliente_nombre": "Cliente 47"
    }
  }
}
```

## 🔔 Eventos Escuchados

- `cocina.pedido_listo` - Marca ticket listo automáticamente
- `cobro.completado` - Marca ticket entregado y cierra cuenta

## 🔌 APIs HTTP

| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/llevar/crear-ticket` | Crear ticket de para llevar |
| POST | `/llevar/:id/listo` | Marcar ticket listo (mostrar en display) |
| POST | `/llevar/:id/entregar` | Marcar ticket entregado |
| GET | `/llevar/activos` | Listar tickets en preparación |
| GET | `/llevar/listos` | Tickets listos (para display) |
| GET | `/llevar/:id` | Obtener ticket por ID |
| GET | `/llevar/display` | SSE stream para pantalla |

## 🧪 Ejemplo de Uso

### Crear ticket
```bash
curl -X POST http://localhost:3339/modules/cuentas-llevar/llevar/crear-ticket \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_nombre": "Juan",
    "notas": "Sin cebolla"
  }'
```

Respuesta:
```json
{
  "cuenta_id": "llevar_20250117_047",
  "numero_ticket": 47,
  "cliente_nombre": "Juan",
  "estado": "pendiente",
  "total": 0,
  "hora_creacion": "2025-01-17T14:00:00Z",
  "pedidos": [],
  "notas": "Sin cebolla",
  "mostrado_en_display": false
}
```

**Empleado dice al cliente:** "Su número es el **47**"

### Ver tickets activos (en preparación)
```bash
curl http://localhost:3339/modules/cuentas-llevar/llevar/activos
```

Respuesta:
```json
{
  "tickets": [
    {
      "numero_ticket": 45,
      "cliente_nombre": "María",
      "estado": "preparando",
      "hora_creacion": "2025-01-17T13:55:00Z"
    },
    {
      "numero_ticket": 47,
      "cliente_nombre": "Juan",
      "estado": "preparando",
      "hora_creacion": "2025-01-17T14:00:00Z"
    }
  ],
  "total": 2
}
```

### Marcar ticket como listo
```bash
curl -X POST http://localhost:3339/modules/cuentas-llevar/llevar/llevar_20250117_047/listo
```

**Resultado:**
- Número **47** aparece en pantalla display
- Evento `llevar.ticket_listo` publicado
- Cliente ve su número en pantalla

### Ver tickets listos (para display)
```bash
curl http://localhost:3339/modules/cuentas-llevar/llevar/listos
```

Respuesta:
```json
{
  "tickets": [
    {
      "numero_ticket": 47,
      "cliente_nombre": "Juan",
      "estado": "listo",
      "hora_listo": "2025-01-17T14:15:00Z"
    },
    {
      "numero_ticket": 46,
      "cliente_nombre": "Ana",
      "estado": "listo",
      "hora_listo": "2025-01-17T14:12:00Z"
    }
  ],
  "total": 2
}
```

### Conectar a display SSE (pantalla en tiempo real)
```bash
curl -N http://localhost:3339/modules/cuentas-llevar/llevar/display
```

Eventos recibidos:
```
data: {"type":"connected","data":{"tickets_listos":[{"numero_ticket":47,"cliente_nombre":"Juan"}]}}

data: {"type":"ticket_listo","data":{"numero_ticket":48,"cliente_nombre":"Pedro"}}

data: {"type":"ticket_entregado","data":{"numero_ticket":47}}
```

### Marcar como entregado
```bash
curl -X POST http://localhost:3339/modules/cuentas-llevar/llevar/llevar_20250117_047/entregar
```

**Resultado:**
- Número **47** desaparece del display
- Ticket cerrado
- Evento `llevar.ticket_entregado` + `cuenta.cerrada`

## 🔄 Flujo Típico

1. **Cliente llega sin haber pedido**
   - "Quiero una pizza margarita para llevar"
   - POST `/llevar/crear-ticket`
   - Empleado: "Su número es el **47**"
   - Eventos: `llevar.ticket_creado` + `cuenta.creada`

2. **Empleado toma pedido**
   - Módulo `pedidos` crea items
   - Envía a cocina
   - Evento: `pedido.enviado_cocina`

3. **Cocina prepara**
   - Cocina marca como listo
   - Evento: `cocina.pedido_listo`
   - **Ticket 47 automáticamente marcado listo**
   - Evento: `llevar.ticket_listo`

4. **Display muestra número**
   - Pantalla SSE actualiza en tiempo real
   - Cliente ve: **"NÚMERO 47 LISTO"**

5. **Cliente recoge y paga**
   - Cobro procesado
   - Evento: `cobro.completado`
   - **Ticket automáticamente marcado entregado**
   - Eventos: `llevar.ticket_entregado` + `cuenta.cerrada`
   - Número desaparece del display

## 📺 Display HTML Ejemplo

```html
<!DOCTYPE html>
<html>
<head>
  <title>Tickets Listos</title>
  <style>
    body {
      background: #000;
      color: #0f0;
      font-family: 'Courier New', monospace;
      font-size: 72px;
      text-align: center;
      padding: 50px;
    }
    .ticket {
      margin: 20px;
      padding: 30px;
      border: 5px solid #0f0;
      display: inline-block;
      animation: blink 1s infinite;
    }
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0.5; }
    }
  </style>
</head>
<body>
  <h1>TICKETS LISTOS</h1>
  <div id="tickets"></div>

  <script>
    const eventSource = new EventSource('http://localhost:3339/modules/cuentas-llevar/llevar/display');

    eventSource.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'connected') {
        // Mostrar tickets iniciales
        mostrarTickets(message.data.tickets_listos);
      } else if (message.type === 'ticket_listo') {
        // Añadir nuevo ticket
        agregarTicket(message.data);
      } else if (message.type === 'ticket_entregado') {
        // Remover ticket
        removerTicket(message.data.numero_ticket);
      }
    };

    function mostrarTickets(tickets) {
      const container = document.getElementById('tickets');
      container.innerHTML = tickets.map(t =>
        `<div class="ticket" data-numero="${t.numero_ticket}">
          NÚMERO ${t.numero_ticket}
        </div>`
      ).join('');
    }

    function agregarTicket(data) {
      const container = document.getElementById('tickets');
      const div = document.createElement('div');
      div.className = 'ticket';
      div.setAttribute('data-numero', data.numero_ticket);
      div.textContent = `NÚMERO ${data.numero_ticket}`;
      container.appendChild(div);
    }

    function removerTicket(numero) {
      const ticket = document.querySelector(`[data-numero="${numero}"]`);
      if (ticket) ticket.remove();
    }
  </script>
</body>
</html>
```

## 🔢 Auto-numeración

**Formato:** `llevar_{YYYYMMDD}_{secuencial}`

**Ejemplos:**
- `llevar_20250117_001` - Primer ticket del día
- `llevar_20250117_047` - Ticket número 47 del día
- `llevar_20250118_001` - Reseteo al día siguiente

**Ventajas:**
- ✅ Números cortos para decir al cliente (1-999)
- ✅ Fácil de mostrar en display
- ✅ Reseteo automático diario
- ✅ Evita números largos

## ⚙️ Configuración

En `module.json`:
```json
{
  "config": {
    "reseteo_diario": true,
    "reseteo_hora": "00:00",
    "display": {
      "max_numeros_mostrar": 10,
      "tiempo_mostrar_segundos": 300
    }
  }
}
```

## 📊 Métricas

```bash
curl http://localhost:3339/modules/cuentas-llevar/metrics
```

Respuesta:
```json
{
  "tickets_creados": 250,
  "tickets_listos": 248,
  "tickets_entregados": 245,
  "tiempo_promedio_preparacion": 12.5,
  "tiempo_promedio_espera": 2.3,
  "tickets_activos": 2,
  "tickets_listos": 3,
  "display_clients": 2
}
```

## 💡 Casos de Uso

1. **Walk-in rápido** - Cliente llega, pide, espera 10-15 min, recoge
2. **Hora punta** - Sistema de tickets evita confusión con muchos clientes
3. **Display visible** - Clientes ven cuando está listo sin preguntar
4. **Métricas** - Cuánto tiempo esperan realmente los clientes

---

**Versión:** 1.0.0
**Líneas:** ~390
**Tipo:** Módulo específico de canal
