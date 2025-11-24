# Módulo Cuentas-Telefono v1.0

**Gestión de pedidos telefónicos - Caller ID y notificaciones WhatsApp**

## 🎯 Responsabilidad

Gestionar pedidos realizados por teléfono con identificación automática de contactos, registro de historial de clientes y notificaciones WhatsApp cuando el pedido está listo para recoger.

## ✅ Características

- ✅ **Auto-numeración con reseteo diario** - `tel_{YYYYMMDD}_{secuencial}`
- ✅ **Caller ID detection** - Identificación automática de número
- ✅ **Gestión de contactos** - Historial de clientes frecuentes
- ✅ **Notificaciones WhatsApp** - Aviso automático cuando está listo
- ✅ **Hora estimada de recogida** - Calculada automáticamente
- ✅ **Integración Asterisk/FreePBX** - Webhook para llamadas entrantes
- ✅ **100% Event-Driven** - Solo MQTT
- ✅ **< 500 líneas** - Código limpio

## 📦 Eventos Publicados

### Eventos Específicos

#### `telefono.llamada_detectada`
```json
{
  "event_type": "telefono.llamada_detectada",
  "payload": {
    "telefono": "+34666555444",
    "caller_name": "María García",
    "timestamp": "2025-01-17T14:00:00Z"
  }
}
```

#### `telefono.contacto_identificado`
```json
{
  "event_type": "telefono.contacto_identificado",
  "payload": {
    "telefono": "+34666555444",
    "nombre": "María García",
    "pedidos_anteriores": 5,
    "ultima_compra": "2025-01-10T13:00:00Z"
  }
}
```

#### `telefono.pedido_creado`
```json
{
  "event_type": "telefono.pedido_creado",
  "payload": {
    "cuenta_id": "tel_20250117_032",
    "numero_pedido": 32,
    "telefono": "+34666555444",
    "nombre": "María García",
    "hora_recogida_estimada": "2025-01-17T14:30:00Z"
  }
}
```

#### `telefono.listo_para_recoger`
```json
{
  "event_type": "telefono.listo_para_recoger",
  "payload": {
    "cuenta_id": "tel_20250117_032",
    "numero_pedido": 32,
    "telefono": "+34666555444",
    "nombre": "María García",
    "total": 28.50,
    "whatsapp_message": "¡Hola María! Tu pedido #32 está listo para recoger. Te esperamos 😊"
  }
}
```

### Eventos Base (al módulo `cuentas`)

#### `cuenta.creada`
```json
{
  "event_type": "cuenta.creada",
  "payload": {
    "cuenta_id": "tel_20250117_032",
    "tipo": "telefono",
    "origen": "cuentas-telefono",
    "numero_pedido": 32,
    "telefono": "+34666555444",
    "total": 0,
    "metadata": {
      "nombre": "María García",
      "hora_recogida_estimada": "2025-01-17T14:30:00Z"
    }
  }
}
```

## 🔔 Eventos Escuchados

- `cocina.pedido_listo` - Marca pedido como listo y envía WhatsApp
- `cobro.completado` - Cierra cuenta automáticamente

## 🔌 APIs HTTP

| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/telefono/llamada-entrante` | Webhook para llamadas (Asterisk/FreePBX) |
| POST | `/telefono/crear-pedido` | Crear pedido telefónico |
| GET | `/telefono/pendientes` | Listar pedidos pendientes |
| GET | `/telefono/:id` | Obtener pedido por ID |
| POST | `/telefono/:id/listo` | Marcar listo y enviar WhatsApp |
| GET | `/telefono/contactos` | Listar contactos guardados |
| POST | `/telefono/contactos` | Guardar/actualizar contacto |

## 🧪 Ejemplo de Uso

### Webhook de llamada entrante (desde Asterisk)
```bash
curl -X POST http://localhost:3339/modules/cuentas-telefono/telefono/llamada-entrante \
  -H "Content-Type: application/json" \
  -d '{
    "telefono": "+34666555444",
    "caller_name": "María García"
  }'
```

Respuesta (contacto identificado):
```json
{
  "identificado": true,
  "contacto": {
    "telefono": "+34666555444",
    "nombre": "María García",
    "direccion": "Calle Mayor 23, 2A",
    "pedidos_anteriores": 5,
    "ultima_compra": "2025-01-10T13:00:00Z",
    "notas": "Sin gluten"
  }
}
```

### Crear pedido
```bash
curl -X POST http://localhost:3339/modules/cuentas-telefono/telefono/crear-pedido \
  -H "Content-Type: application/json" \
  -d '{
    "telefono": "+34666555444",
    "nombre": "María García",
    "tiempo_preparacion": 20,
    "notas": "Sin aceitunas"
  }'
```

Respuesta:
```json
{
  "cuenta_id": "tel_20250117_032",
  "numero_pedido": 32,
  "telefono": "+34666555444",
  "caller_id_detectado": true,
  "contacto": {
    "telefono": "+34666555444",
    "nombre": "María García",
    "pedidos_anteriores": 5
  },
  "estado": "pendiente",
  "total": 0,
  "hora_pedido": "2025-01-17T14:00:00Z",
  "hora_recogida_estimada": "2025-01-17T14:20:00Z",
  "whatsapp_enviado": false
}
```

### Ver pedidos pendientes
```bash
curl http://localhost:3339/modules/cuentas-telefono/telefono/pendientes
```

Respuesta:
```json
{
  "pedidos": [
    {
      "cuenta_id": "tel_20250117_032",
      "numero_pedido": 32,
      "telefono": "+34666555444",
      "contacto": {
        "nombre": "María García"
      },
      "estado": "preparando",
      "total": 28.50,
      "hora_recogida_estimada": "2025-01-17T14:20:00Z"
    }
  ],
  "total": 1
}
```

### Marcar como listo (manual)
```bash
curl -X POST http://localhost:3339/modules/cuentas-telefono/telefono/tel_20250117_032/listo
```

**Resultado:**
- Estado → "listo"
- Envía WhatsApp al cliente
- Publica evento `telefono.listo_para_recoger`

### Guardar contacto
```bash
curl -X POST http://localhost:3339/modules/cuentas-telefono/telefono/contactos \
  -H "Content-Type: application/json" \
  -d '{
    "telefono": "+34666777888",
    "nombre": "Pedro Martínez",
    "direccion": "Calle Luna 12",
    "email": "pedro@example.com",
    "notas": "Alérgico a frutos secos"
  }'
```

### Buscar contactos
```bash
curl http://localhost:3339/modules/cuentas-telefono/telefono/contactos?buscar=María
```

## 🔄 Flujo Típico

### Flujo 1: Con Caller ID

1. **Llamada entrante**
   - Asterisk detecta llamada
   - Webhook → POST `/telefono/llamada-entrante`
   - Evento: `telefono.llamada_detectada`

2. **Identificación automática**
   - Sistema busca teléfono en contactos
   - Si existe: `telefono.contacto_identificado`
   - UI muestra datos del cliente automáticamente

3. **Crear pedido**
   - Empleado toma pedido
   - POST `/telefono/crear-pedido`
   - Evento: `telefono.pedido_creado` + `cuenta.creada`

4. **Preparación**
   - Cocina prepara pedido
   - Cuando está listo: evento `cocina.pedido_listo`
   - **WhatsApp automático al cliente**
   - Evento: `telefono.listo_para_recoger`

5. **Recogida y cobro**
   - Cliente llega y recoge
   - Cobro procesado: evento `cobro.completado`
   - **Cuenta cerrada automáticamente**

### Flujo 2: Sin Caller ID

1. **Llamada manual**
   - Empleado crea pedido directamente
   - POST `/telefono/crear-pedido`

2. **Resto igual** que flujo 1 desde paso 4

## 📱 Integración WhatsApp

### Configuración en `module.json`
```json
{
  "config": {
    "whatsapp": {
      "enabled": true,
      "provider": "twilio",
      "template_listo": "¡Hola {{nombre}}! Tu pedido #{{numero}} está listo para recoger. Te esperamos 😊"
    }
  }
}
```

### Providers soportados:
- **Twilio** - WhatsApp Business API vía Twilio
- **WhatsApp Business API** - API oficial (requiere aprobación)
- **Baileys** - WhatsApp Web (no oficial, solo testing)

### Implementar envío real (TODO en código):
```javascript
async enviarWhatsApp(telefono, mensaje, correlationId) {
  // Ejemplo con Twilio
  await twilioClient.messages.create({
    from: 'whatsapp:+14155238886',
    to: `whatsapp:${telefono}`,
    body: mensaje
  });
}
```

## ☎️ Integración Asterisk/FreePBX

### Configurar webhook en Asterisk:
```ini
; extensions.conf
[from-internal]
exten => s,1,NoOp(Incoming Call)
exten => s,n,Set(CALLERID(num)=${CALLERID(num)})
exten => s,n,System(curl -X POST http://localhost:3339/modules/cuentas-telefono/telefono/llamada-entrante \
  -H "Content-Type: application/json" \
  -d '{"telefono":"${CALLERID(num)}","caller_name":"${CALLERID(name)}"}')
exten => s,n,Dial(SIP/100,20)
```

## 🔢 Auto-numeración

**Formato:** `tel_{YYYYMMDD}_{secuencial}`

**Ejemplos:**
- `tel_20250117_001` - Primer pedido del día
- `tel_20250117_032` - Pedido número 32 del día
- `tel_20250118_001` - Reseteo al día siguiente

**Ventajas:**
- ✅ Número corto para decir al cliente ("Pedido 32")
- ✅ Fácil identificar fecha
- ✅ Reseteo automático diario
- ✅ No se cruzan números entre días

## 📊 Métricas

```bash
curl http://localhost:3339/modules/cuentas-telefono/metrics
```

Respuesta:
```json
{
  "llamadas_recibidas": 150,
  "contactos_identificados": 120,
  "pedidos_creados": 145,
  "whatsapp_enviados": 143,
  "tiempo_promedio_preparacion": 18.5,
  "pedidos_activos": 5,
  "contactos_guardados": 230
}
```

## 💡 Ventajas del Sistema

1. **Caller ID automático** - Cliente identificado antes de hablar
2. **Historial** - Ver pedidos anteriores del cliente
3. **Sin esperas** - Cliente sabe cuándo viene a recoger
4. **WhatsApp automático** - No olvidar avisar al cliente
5. **Base de datos** - Contactos para marketing futuro

---

**Versión:** 1.0.0
**Líneas:** ~480
**Tipo:** Módulo específico de canal
