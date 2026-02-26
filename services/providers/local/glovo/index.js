/**
 * Local Glovo Provider
 *
 * Integración con Glovo Partner API para recibir y gestionar pedidos.
 * Usa polling (GET /orders) — no requiere endpoint público.
 *
 * Credenciales via credential-manager:
 *   GLOVO_API_KEY   — API key de Glovo Partner
 *   GLOVO_STORE_ID  — ID del store en Glovo
 *
 * Endpoints Glovo Partner API:
 *   Base: https://api.glovoapp.com (producción)
 *         https://stageapi.glovoapp.com (staging)
 *
 *   GET    /webhook/stores/{storeId}/orders          — listar pedidos
 *   GET    /webhook/stores/{storeId}/orders/{orderId} — detalle pedido
 *   PUT    /webhook/stores/{storeId}/orders/{orderId} — actualizar estado
 *
 * Autenticación: Header "Authorization: {apiKey}"
 *
 * Eventos:
 * - local.glovo.poll_orders.request  → response
 * - local.glovo.get_order.request    → response
 * - local.glovo.accept_order.request → response
 * - local.glovo.reject_order.request → response
 * - local.glovo.mark_ready.request   → response
 *
 * @version 1.0.0
 */

const https = require('https');

// Entornos de la API de Glovo
const API_HOSTS = {
  production: 'api.glovoapp.com',
  staging: 'stageapi.glovoapp.com'
};

module.exports = {
  name: 'local.glovo',
  description: 'Integración con Glovo Partner API',

  functions: {
    poll_orders: {
      event: 'local.glovo.poll_orders.request',
      description: 'Obtener pedidos nuevos/pendientes del store',
      input: {
        status: { type: 'string', default: 'NEW' }
      }
    },
    get_order: {
      event: 'local.glovo.get_order.request',
      description: 'Obtener detalle de un pedido',
      input: {
        order_id: { type: 'string', required: true }
      }
    },
    accept_order: {
      event: 'local.glovo.accept_order.request',
      description: 'Aceptar un pedido',
      input: {
        order_id: { type: 'string', required: true }
      }
    },
    reject_order: {
      event: 'local.glovo.reject_order.request',
      description: 'Rechazar un pedido',
      input: {
        order_id: { type: 'string', required: true },
        reason: { type: 'string', default: 'STORE_CLOSED' }
      }
    },
    mark_ready: {
      event: 'local.glovo.mark_ready.request',
      description: 'Marcar pedido como listo para rider',
      input: {
        order_id: { type: 'string', required: true }
      }
    }
  },

  // ==========================================
  // Credenciales
  // ==========================================

  resolveCredentials() {
    const apiKey = process.env.GLOVO_API_KEY
      || process.env.GLOVO_API_KEY_GLOBAL;

    const storeId = process.env.GLOVO_STORE_ID
      || process.env.GLOVO_STORE_ID_GLOBAL;

    const env = process.env.GLOVO_ENV || 'production';

    if (!apiKey) {
      throw new Error('GLOVO_API_KEY no configurada. Configurar via credential-manager o .env');
    }
    if (!storeId) {
      throw new Error('GLOVO_STORE_ID no configurado. Configurar via credential-manager o .env');
    }

    return { apiKey, storeId, env };
  },

  // ==========================================
  // HTTP Client
  // ==========================================

  async request(method, path, body = null) {
    const { apiKey, storeId, env } = this.resolveCredentials();
    const host = API_HOSTS[env] || API_HOSTS.production;

    // Reemplazar {storeId} en el path
    const resolvedPath = path.replace('{storeId}', storeId);

    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : null;

      const options = {
        hostname: host,
        port: 443,
        path: resolvedPath,
        method,
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
        },
        timeout: 30000
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            // Algunos endpoints devuelven 204 sin body
            const parsed = data ? JSON.parse(data) : {};

            if (res.statusCode >= 400) {
              const errorMsg = parsed.error?.message
                || parsed.message
                || `HTTP ${res.statusCode}: ${data.substring(0, 200)}`;
              reject(new Error(errorMsg));
            } else {
              resolve({ status: res.statusCode, data: parsed });
            }
          } catch (e) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              // 2xx sin JSON válido = OK sin body
              resolve({ status: res.statusCode, data: {} });
            } else {
              reject(new Error(`Glovo API: respuesta inválida (HTTP ${res.statusCode})`));
            }
          }
        });
      });

      req.on('error', (err) => reject(new Error(`Glovo API: ${err.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Glovo API: timeout'));
      });

      if (postData) req.write(postData);
      req.end();
    });
  },

  // ==========================================
  // Functions
  // ==========================================

  /**
   * Listar pedidos del store — polling
   *
   * Glovo devuelve pedidos con estados:
   *   NEW         — pendiente de aceptar
   *   ACCEPTED    — aceptado, en preparación
   *   PICKED_UP   — recogido por rider
   *   DELIVERED   — entregado
   *   CANCELLED   — cancelado
   */
  async poll_orders({ status = 'NEW' } = {}) {
    const res = await this.request('GET', '/webhook/stores/{storeId}/orders');

    const allOrders = res.data?.orders || res.data || [];
    const orders = Array.isArray(allOrders) ? allOrders : [];

    // Filtrar por estado si se pide
    const filtered = status === 'ALL'
      ? orders
      : orders.filter(o => o.status === status || o.state === status);

    // Normalizar formato a nuestro modelo interno
    const normalized = filtered.map(o => this.normalizeOrder(o));

    return {
      orders: normalized,
      total: normalized.length,
      raw_total: orders.length
    };
  },

  /**
   * Obtener detalle de un pedido específico
   */
  async get_order({ order_id } = {}) {
    if (!order_id) throw new Error('order_id es requerido');

    const res = await this.request('GET', `/webhook/stores/{storeId}/orders/${order_id}`);
    return {
      order: this.normalizeOrder(res.data)
    };
  },

  /**
   * Aceptar un pedido
   */
  async accept_order({ order_id } = {}) {
    if (!order_id) throw new Error('order_id es requerido');

    await this.request('PUT', `/webhook/stores/{storeId}/orders/${order_id}`, {
      action: 'ACCEPT'
    });

    return { accepted: true, order_id };
  },

  /**
   * Rechazar un pedido
   */
  async reject_order({ order_id, reason = 'STORE_CLOSED' } = {}) {
    if (!order_id) throw new Error('order_id es requerido');

    await this.request('PUT', `/webhook/stores/{storeId}/orders/${order_id}`, {
      action: 'REJECT',
      reason
    });

    return { rejected: true, order_id, reason };
  },

  /**
   * Marcar pedido como listo para recogida
   */
  async mark_ready({ order_id } = {}) {
    if (!order_id) throw new Error('order_id es requerido');

    await this.request('PUT', `/webhook/stores/{storeId}/orders/${order_id}`, {
      action: 'READY'
    });

    return { ready: true, order_id };
  },

  // ==========================================
  // Normalización
  // ==========================================

  /**
   * Normalizar pedido de Glovo al formato interno
   * Glovo puede usar distintos schemas según versión API
   */
  normalizeOrder(raw) {
    if (!raw) return null;

    return {
      glovo_order_id: raw.orderId || raw.order_id || raw.id,
      status: raw.status || raw.state || 'UNKNOWN',
      items: (raw.products || raw.items || []).map(p => ({
        nombre: p.name || p.nombre,
        cantidad: p.quantity || p.cantidad || 1,
        precio: p.price || p.precio || 0,
        notas: p.comments || p.notas || '',
        atributos: p.attributes || p.modificadores || []
      })),
      total: raw.totalPrice || raw.total || raw.price || 0,
      cliente_nombre: raw.customer?.name
        || raw.customerName
        || raw.cliente_nombre
        || 'Cliente Glovo',
      direccion_entrega: raw.deliveryAddress?.label
        || raw.deliveryAddress?.rawAddress
        || raw.direccion_entrega
        || '',
      notas: raw.customerComments || raw.comments || raw.notas || '',
      tiempo_estimado_entrega: raw.estimatedDeliveryTime
        || raw.estimatedPickupTime
        || null,
      hora_creado: raw.creationTime || raw.created_at || new Date().toISOString(),
      rider_info: raw.courier ? {
        nombre: raw.courier.name,
        telefono: raw.courier.phone
      } : null,
      _raw: raw
    };
  },

  /**
   * Cleanup
   */
  async cleanup() {
    // Sin estado que limpiar
  }
};
