/**
 * UI Impresión - Comandas de cocina
 * Vanilla JS, mobile-first, para Android/Termux
 */

const API_BASE = '/modules/impresion';

class ImpresionApp {
  constructor() {
    this.canal = 'mesa';
    this.modo = 'dispositivo';
    this.ancho = '58mm';
    this.items = [];
    this.itemCounter = 0;

    this.init();
  }

  async init() {
    this.addItem(); // empezar con 1 item
    await this.refreshEstado();
    await this.refreshHistorial();

    // Auto-refresh estado cada 15s
    setInterval(() => this.refreshEstado(), 15000);
  }

  // ==========================================
  // Tabs
  // ==========================================

  switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');

    if (tabId === 'historial') this.refreshHistorial();
    if (tabId === 'config') this.refreshEstado();
  }

  // ==========================================
  // Estado de impresora
  // ==========================================

  async refreshEstado() {
    try {
      const res = await fetch(`${API_BASE}/estado`);
      const json = await res.json();
      const data = json.data || json;

      const transporte = data.transporte || {};
      const estado = transporte.estado || 'desconectado';

      // Header indicator
      const dot = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      dot.className = 'status-dot ' + (estado === 'conectado' ? 'ok' : estado === 'error' ? 'err' : 'off');
      text.textContent = estado === 'conectado' ? 'Conectada' : estado === 'error' ? 'Error' : 'Desconectada';

      // Config tab details
      this.setDetalle('det-estado', estado);
      this.setDetalle('det-modo', transporte.modo || '-');
      this.setDetalle('det-mac', transporte.mac || '-');
      this.setDetalle('det-disp', transporte.dispositivo || '-');

      // Fetch metrics too
      const mRes = await fetch(`${API_BASE}/metrics`);
      const mJson = await mRes.json();
      const mData = mJson.data || mJson;
      this.setDetalle('det-total', String(
        (mData.comandas_generadas || 0) + (mData.reimpresiones || 0)
      ));
      this.setDetalle('det-errores', String(mData.errores || 0));

    } catch (err) {
      document.getElementById('status-dot').className = 'status-dot err';
      document.getElementById('status-text').textContent = 'Sin conexion';
    }
  }

  setDetalle(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  async reconectar() {
    document.getElementById('status-text').textContent = 'Conectando...';
    try {
      const res = await fetch(`${API_BASE}/conectar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      await this.refreshEstado();
    } catch (err) {
      document.getElementById('status-text').textContent = 'Error';
    }
  }

  // ==========================================
  // Items dinámicos
  // ==========================================

  addItem() {
    const idx = this.itemCounter++;
    const list = document.getElementById('items-list');

    const itemEl = document.createElement('div');
    itemEl.className = 'item-card';
    itemEl.id = `item-${idx}`;
    itemEl.innerHTML = `
      <div class="item-row">
        <input type="number" class="input input-qty" value="1" min="1" data-field="cantidad" placeholder="x">
        <input type="text" class="input input-name" data-field="nombre" placeholder="Nombre producto">
        <button class="btn-remove" onclick="app.removeItem(${idx})">X</button>
      </div>
      <div class="item-extras">
        <input type="text" class="input" data-field="ingredientes" placeholder="Ingredientes: jamon, queso...">
        <div class="item-row-sm">
          <input type="text" class="input" data-field="sin" placeholder="SIN: cebolla, anchoas...">
          <input type="text" class="input" data-field="con" placeholder="CON: extra queso...">
        </div>
        <div class="item-row-sm">
          <input type="text" class="input" data-field="izq" placeholder="Mitad IZQ (opc)">
          <input type="text" class="input" data-field="der" placeholder="Mitad DER (opc)">
        </div>
        <input type="text" class="input" data-field="notas" placeholder="Notas: bien hecha, sin sal...">
      </div>
    `;

    list.appendChild(itemEl);
  }

  removeItem(idx) {
    const el = document.getElementById(`item-${idx}`);
    if (el) el.remove();
  }

  collectItems() {
    const items = [];
    document.querySelectorAll('.item-card').forEach(card => {
      const get = (field) => {
        const inp = card.querySelector(`[data-field="${field}"]`);
        return inp ? inp.value.trim() : '';
      };

      const nombre = get('nombre');
      if (!nombre) return;

      const item = {
        nombre,
        cantidad: parseInt(get('cantidad')) || 1
      };

      // Ingredientes
      const ingStr = get('ingredientes');
      if (ingStr) {
        item.ingredientes = ingStr.split(',').map(s => s.trim()).filter(Boolean);
      }

      // Variaciones
      const sinStr = get('sin');
      const conStr = get('con');
      if (sinStr || conStr) {
        item.variaciones = {};
        if (sinStr) {
          item.variaciones.ingredientes_quitar = sinStr.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (conStr) {
          item.variaciones.ingredientes_anadir = conStr.split(',').map(s => s.trim()).filter(Boolean);
        }
      }

      // Mitad-mitad
      const izq = get('izq');
      const der = get('der');
      if (izq || der) {
        item.tipo = 'mitad-mitad';
        if (izq) item.pizza_izquierda = izq;
        if (der) item.pizza_derecha = der;
      }

      // Notas
      const notas = get('notas');
      if (notas) item.notas = notas;

      items.push(item);
    });

    return items;
  }

  // ==========================================
  // Canal selector
  // ==========================================

  selectCanal(canal) {
    this.canal = canal;
    document.querySelectorAll('.canal-chips .chip').forEach(c => {
      c.classList.toggle('active', c.dataset.canal === canal);
    });
  }

  // ==========================================
  // Reimprimir
  // ==========================================

  async reimprimir() {
    const cuenta_id = document.getElementById('inp-cuenta').value.trim();
    const pedido_id = document.getElementById('inp-pedido').value.trim();
    const notas_generales = document.getElementById('inp-notas').value.trim();
    const items = this.collectItems();

    const resultEl = document.getElementById('print-result');

    if (!cuenta_id) {
      this.showResult(resultEl, 'error', 'Falta mesa/referencia');
      return;
    }
    if (items.length === 0) {
      this.showResult(resultEl, 'error', 'Agrega al menos un item');
      return;
    }

    const body = {
      cuenta_id,
      canal: this.canal,
      items
    };
    if (pedido_id) body.pedido_id = pedido_id;
    if (notas_generales) body.notas_generales = notas_generales;

    this.showResult(resultEl, 'info', 'Imprimiendo...');

    try {
      const res = await fetch(`${API_BASE}/ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const json = await res.json();

      if (res.ok && json.data) {
        this.showResult(resultEl, 'ok', `Comanda impresa (${json.data.comanda_id})`);
      } else {
        this.showResult(resultEl, 'error', json.error || 'Error al imprimir');
      }
    } catch (err) {
      this.showResult(resultEl, 'error', `Error: ${err.message}`);
    }
  }

  // ==========================================
  // Historial
  // ==========================================

  async refreshHistorial() {
    const list = document.getElementById('historial-list');
    try {
      const res = await fetch(`${API_BASE}/historial?limit=30`);
      const json = await res.json();
      const data = json.data || json;
      const comandas = data.comandas || [];

      if (comandas.length === 0) {
        list.innerHTML = '<div class="empty-state">No hay comandas todavia</div>';
        return;
      }

      list.innerHTML = comandas.map(c => {
        const hora = new Date(c.generada_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const reimpTag = c.reimpresion ? '<span class="tag tag-re">RE</span>' : '';
        return `
          <div class="historial-item">
            <div class="hist-main">
              <span class="hist-hora">${this.escapeHtml(hora)}</span>
              <span class="hist-ref">${this.escapeHtml(c.cuenta_id || c.pedido_id || '-')}</span>
              ${reimpTag}
              <span class="hist-items">${c.items_count} items</span>
            </div>
            <span class="hist-id">${this.escapeHtml(c.comanda_id || '')}</span>
          </div>
        `;
      }).join('');
    } catch (err) {
      list.innerHTML = '<div class="empty-state">Error cargando historial</div>';
    }
  }

  // ==========================================
  // Config
  // ==========================================

  selectModo(modo) {
    this.modo = modo;
    document.querySelectorAll('.modo-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.modo === modo);
    });
    document.querySelectorAll('.modo-config').forEach(el => { el.style.display = 'none'; });
    const target = document.getElementById(`config-${modo}`);
    if (target) target.style.display = 'block';
  }

  selectAncho(ancho) {
    this.ancho = ancho;
    document.querySelectorAll('.ancho-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.ancho === ancho);
    });
  }

  async guardarConfig() {
    const resultEl = document.getElementById('config-result');
    const body = { modo: this.modo };

    if (this.modo === 'dispositivo') {
      const mac = document.getElementById('cfg-mac').value.trim();
      const dispositivo = document.getElementById('cfg-dispositivo').value.trim();
      const rfcomm_canal = parseInt(document.getElementById('cfg-rfcomm-canal').value) || 1;
      if (mac) body.mac = mac;
      if (dispositivo) body.dispositivo = dispositivo;
      body.rfcomm_canal = rfcomm_canal;
    } else if (this.modo === 'tcp') {
      body.tcp_host = document.getElementById('cfg-tcp-host').value.trim() || '127.0.0.1';
      body.tcp_puerto = parseInt(document.getElementById('cfg-tcp-puerto').value) || 9100;
    } else if (this.modo === 'comando') {
      body.comando = document.getElementById('cfg-comando').value.trim();
      if (!body.comando) {
        this.showResult(resultEl, 'error', 'Falta el comando');
        return;
      }
    }

    this.showResult(resultEl, 'info', 'Conectando...');

    try {
      const res = await fetch(`${API_BASE}/conectar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const json = await res.json();

      if (res.ok) {
        this.showResult(resultEl, 'ok', 'Impresora conectada');
      } else {
        this.showResult(resultEl, 'error', json.error || 'Error de conexion');
      }

      await this.refreshEstado();
    } catch (err) {
      this.showResult(resultEl, 'error', `Error: ${err.message}`);
    }
  }

  // ==========================================
  // Utilidades
  // ==========================================

  showResult(el, type, msg) {
    if (!el) return;
    el.className = `result-msg result-${type}`;
    el.textContent = msg;
    if (type === 'ok') {
      setTimeout(() => { el.textContent = ''; el.className = 'result-msg'; }, 4000);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Init
const app = new ImpresionApp();
