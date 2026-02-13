# Módulo Cuentas-Mesa v1.0

**Gestión de mesas - Lógica específica de servicio en mesa**

## 🎯 Responsabilidad

Gestionar el ciclo de vida completo de las mesas del restaurante: apertura, asignación de camarero, seguimiento de consumo y cierre. Se comunica con el módulo base `cuentas` para mantener la coherencia del sistema.

## ✅ Características

- ✅ **Auto-numeración con reseteo diario** - `mesa_{numero}_{YYYYMMDD}_{secuencial}`
- ✅ **Zonas configurables** - terraza, interior, vip
- ✅ **Asignación de camareros** - Control de quién atiende cada mesa
- ✅ **Cierre automático tras cobro** - Escucha `cobro.completado`
- ✅ **Métricas de ocupación** - Tiempo promedio, ingresos
- ✅ **100% Event-Driven** - Solo MQTT
- ✅ **< 500 líneas** - Código limpio y mantenible

## 📦 Eventos Publicados

### Eventos Específicos

#### `mesa.abierta`
```json
{
  "event_type": "mesa.abierta",
  "payload": {
    "cuenta_id": "mesa_5_20250117_001",
    "numero_mesa": 5,
    "zona": "terraza",
    "capacidad": 4,
    "comensales": 3,
    "camarero": "Juan Pérez",
    "hora_apertura": "2025-01-17T13:00:00Z"
  }
}
```

#### `mesa.camarero_asignado`
```json
{
  "event_type": "mesa.camarero_asignado",
  "payload": {
    "cuenta_id": "mesa_5_20250117_001",
    "numero_mesa": 5,
    "camarero": "María García",
    "camarero_anterior": "Juan Pérez"
  }
}
```

#### `mesa.cerrada`
```json
{
  "event_type": "mesa.cerrada",
  "payload": {
    "cuenta_id": "mesa_5_20250117_001",
    "numero_mesa": 5,
    "total": 45.50,
    "tiempo_ocupada": 75,
    "hora_cierre": "2025-01-17T14:15:00Z"
  }
}
```

### Eventos Base (al módulo `cuentas`)

#### `cuenta.creada`
```json
{
  "event_type": "cuenta.creada",
  "payload": {
    "cuenta_id": "mesa_5_20250117_001",
    "tipo": "mesa",
    "origen": "cuentas-mesa",
    "numero_mesa": 5,
    "total": 0,
    "metadata": {
      "zona": "terraza",
      "camarero": "Juan Pérez",
      "comensales": 3
    }
  }
}
```

#### `cuenta.cerrada`
```json
{
  "event_type": "cuenta.cerrada",
  "payload": {
    "cuenta_id": "mesa_5_20250117_001",
    "tipo": "mesa",
    "total": 45.50,
    "metadata": {
      "tiempo_ocupada": 75,
      "numero_mesa": 5
    }
  }
}
```

## 🔔 Eventos Escuchados

- `pedido.creado` - Actualiza total de la mesa
- `cobro.completado` - Cierra mesa automáticamente

## 🔌 APIs HTTP

| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/mesas/abrir` | Abrir mesa para servicio |
| POST | `/mesas/:id/asignar-camarero` | Asignar camarero a mesa |
| POST | `/mesas/:id/cerrar` | Cerrar mesa manualmente |
| GET | `/mesas/disponibles` | Listar mesas libres |
| GET | `/mesas/ocupadas` | Listar mesas con clientes |
| GET | `/mesas/:numero` | Obtener mesa por número |
| GET | `/mesas` | Listar todas las mesas |

## 🧪 Ejemplo de Uso

### Abrir mesa
```bash
curl -X POST http://localhost:3339/modules/cuentas-mesa/mesas/abrir \
  -H "Content-Type: application/json" \
  -d '{
    "numero_mesa": 5,
    "comensales": 3,
    "camarero": "Juan Pérez",
    "notas": "Celebración cumpleaños"
  }'
```

Respuesta:
```json
{
  "cuenta_id": "mesa_5_20250117_001",
  "numero_mesa": 5,
  "zona": "terraza",
  "capacidad": 4,
  "comensales": 3,
  "camarero": "Juan Pérez",
  "estado": "ocupada",
  "total": 0,
  "hora_apertura": "2025-01-17T13:00:00Z",
  "pedidos": [],
  "notas": "Celebración cumpleaños"
}
```

### Asignar camarero
```bash
curl -X POST http://localhost:3339/modules/cuentas-mesa/mesas/mesa_5_20250117_001/asignar-camarero \
  -H "Content-Type: application/json" \
  -d '{
    "camarero": "María García"
  }'
```

### Ver mesas disponibles
```bash
curl http://localhost:3339/modules/cuentas-mesa/mesas/disponibles?zona=terraza
```

Respuesta:
```json
{
  "mesas_disponibles": [
    {
      "numero_mesa": 1,
      "zona": "terraza",
      "capacidad": 2
    },
    {
      "numero_mesa": 2,
      "zona": "terraza",
      "capacidad": 2
    }
  ],
  "total": 2
}
```

### Ver mesas ocupadas
```bash
curl http://localhost:3339/modules/cuentas-mesa/mesas/ocupadas?camarero=Juan%20Pérez
```

Respuesta:
```json
{
  "mesas_ocupadas": [
    {
      "cuenta_id": "mesa_5_20250117_001",
      "numero_mesa": 5,
      "zona": "terraza",
      "camarero": "Juan Pérez",
      "total": 32.50,
      "tiempo_ocupada": 45
    }
  ],
  "total": 1
}
```

### Cerrar mesa
```bash
curl -X POST http://localhost:3339/modules/cuentas-mesa/mesas/mesa_5_20250117_001/cerrar
```

## 🔄 Flujo Típico

1. **Apertura de mesa**
   - Cliente llega → Camarero abre mesa
   - POST `/mesas/abrir`
   - Eventos: `mesa.abierta` + `cuenta.creada`

2. **Toma de pedido**
   - Camarero toma pedido
   - Módulo `pedidos` publica `pedido.creado`
   - Este módulo actualiza total automáticamente

3. **Cambio de camarero (opcional)**
   - POST `/mesas/:id/asignar-camarero`
   - Evento: `mesa.camarero_asignado`

4. **Cobro**
   - Módulo `cobros` procesa pago
   - Publica `cobro.completado`
   - **Mesa se cierra automáticamente**
   - Eventos: `mesa.cerrada` + `cuenta.cerrada`

## ⚙️ Configuración de Mesas

En `module.json`:
```json
{
  "config": {
    "mesas": {
      "terraza": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "interior": [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      "vip": [21, 22, 23, 24, 25]
    },
    "reseteo_diario": true,
    "reseteo_hora": "00:00"
  }
}
```

## 🔢 Auto-numeración

**Formato:** `mesa_{numero}_{YYYYMMDD}_{secuencial}`

**Ejemplos:**
- `mesa_5_20250117_001` - Primera vez que se abre mesa 5 hoy
- `mesa_5_20250117_002` - Segunda vez que se abre mesa 5 hoy
- `mesa_5_20250118_001` - Reseteo al día siguiente

**Ventajas:**
- ✅ Fácil identificar mesa y fecha
- ✅ Permite múltiples aperturas/cierres por día
- ✅ Reseteo automático diario
- ✅ Trazabilidad completa

## 📊 Métricas

```bash
curl http://localhost:3339/modules/cuentas-mesa/metrics
```

Respuesta:
```json
{
  "mesas_abiertas": 150,
  "mesas_cerradas": 148,
  "camareros_asignados": 45,
  "tiempo_promedio_ocupacion": 67.5,
  "ingresos_totales": 6750.50,
  "mesas_activas": 2,
  "mesas_disponibles": 23
}
```

## 💡 Integración con otros módulos

### Con `cuentas` (base)
```
cuentas-mesa → publica cuenta.creada → cuentas escucha
cuentas-mesa → publica cuenta.cerrada → cuentas escucha
```

### Con `pedidos`
```
pedidos → publica pedido.creado → cuentas-mesa actualiza total
```

### Con `cobros`
```
cobros → publica cobro.completado → cuentas-mesa cierra mesa
```

---

**Versión:** 1.0.0
**Líneas:** ~480
**Tipo:** Módulo específico de canal
