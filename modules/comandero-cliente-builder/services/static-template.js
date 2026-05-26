/**
 * Static Template Generator del comandero-cliente-builder.
 *
 * Produce un HTML single-file (PWA) que el cliente final usa para
 * navegar el catálogo del proyecto, añadir productos al carrito y
 * enviar el pedido al sistema vía POST a tienda-api.
 *
 * Agnóstico al proyecto: recibe catálogo + presentación + identidad
 * + url del endpoint por parámetro. Reusable para cualquier vertical
 * (vapers, restaurante, perfumería, etc.) que tenga catálogo en
 * pizzepos/productos y use tienda-api como canal de pedidos.
 *
 * Input shape:
 *   {
 *     catalogo: { productos: [...], categorias: [...] }  // cache de pizzepos/productos
 *     presentacion: { [producto_id]: { imagen_url?, descripcion_publica?,
 *                                     orden_publico?, oculto_publico? } }
 *     identidad: { marca, colores: { primario, fondo, texto, acento? }, logo_url? }
 *     project_slug: 'vapers'
 *     tienda_api_url: 'https://enki-ai.online'   // origin sin path
 *     opciones: {
 *       moneda: '€',                              // default '€'
 *       requiere_telefono: true,                  // default true
 *       requiere_nombre: true,                    // default true
 *       requiere_mayor_edad: false,               // default false (vapers=true)
 *       permite_notas: true,                      // default true
 *       textos: {                                 // overrides opcionales del operador
 *         titulo?: string,
 *         mensaje_form?: string,
 *         exito_titulo?: string,
 *         exito_mensaje?: string,
 *         boton_enviar?: string,
 *         ...
 *       }
 *     }
 *   }
 *
 * Output: string HTML completo (DOCTYPE + html + head + body) listo
 * para escribir a disco.
 */

'use strict';

function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateStaticHTML(input) {
  const {
    catalogo = {},
    presentacion = {},
    identidad = {},
    project_slug,
    tienda_api_url,
    opciones = {}
  } = input || {};

  if (!project_slug || typeof project_slug !== 'string') {
    throw new Error('generateStaticHTML: project_slug requerido');
  }
  if (!tienda_api_url || typeof tienda_api_url !== 'string') {
    throw new Error('generateStaticHTML: tienda_api_url requerido');
  }

  const marca = identidad.marca || project_slug;
  const colorPrimario = identidad?.colores?.primario || '#f59e0b';
  const colorFondo    = identidad?.colores?.fondo    || '#0a0a0a';
  const colorTexto    = identidad?.colores?.texto    || '#e5e5e5';
  const colorAcento   = identidad?.colores?.acento   || colorPrimario;
  const logoUrl       = identidad.logo_url || null;

  const moneda           = opciones.moneda || '€';
  const requiereTelefono = opciones.requiere_telefono !== false;
  const requiereNombre   = opciones.requiere_nombre !== false;
  const requiereEdad     = opciones.requiere_mayor_edad === true;
  const permiteNotas     = opciones.permite_notas !== false;

  const textos = Object.assign({
    titulo: marca,
    subtitulo: 'Pedido online',
    cat_todas: 'Todas',
    carrito_titulo: 'Tu pedido',
    carrito_vacio: 'El carrito está vacío',
    total: 'Total',
    boton_enviar: 'Hacer pedido',
    boton_vaciar: 'Vaciar',
    boton_seguir: 'Seguir comprando',
    form_titulo: 'Tus datos',
    form_nombre: 'Nombre',
    form_telefono: 'Teléfono',
    form_notas: 'Notas (opcional)',
    form_mayor_edad: 'Confirmo ser mayor de edad',
    form_enviar: 'Enviar pedido',
    form_cancelar: 'Cancelar',
    exito_titulo: '¡Pedido recibido!',
    exito_mensaje_codigo: 'Tu código de recogida es',
    exito_mensaje_pie: 'Pasa a recoger y pagar en el local.',
    exito_boton_cerrar: 'Cerrar',
    error_titulo: 'No hemos podido enviar el pedido',
    error_reintentar: 'Reintentar',
    error_cerrar: 'Cerrar'
  }, opciones.textos || {});

  // Filtrar productos ocultos según presentación; ordenar según orden_publico,
  // luego por nombre. Enriquecer con campos visuales.
  const categorias = Array.isArray(catalogo.categorias) ? catalogo.categorias : [];
  const productosRaw = Array.isArray(catalogo.productos) ? catalogo.productos : [];

  const productosFinal = productosRaw
    .filter(p => {
      const pres = presentacion[p.id] || {};
      return pres.oculto_publico !== true;
    })
    .map(p => {
      const pres = presentacion[p.id] || {};
      return {
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria || null,
        precio: typeof p.precio === 'number' ? p.precio : 0,
        descripcion_publica: pres.descripcion_publica || null,
        descripcion_operativa: p.descripcion || null,
        imagen_url: pres.imagen_url || null,
        orden_publico: typeof pres.orden_publico === 'number' ? pres.orden_publico : null,
        ingredientes: Array.isArray(p.ingredientes)
          ? p.ingredientes.map(i => ({ nombre: i.nombre, tipo: i.tipo || null }))
          : []
      };
    })
    .sort((a, b) => {
      if (a.orden_publico != null && b.orden_publico != null) return a.orden_publico - b.orden_publico;
      if (a.orden_publico != null) return -1;
      if (b.orden_publico != null) return 1;
      return (a.nombre || '').localeCompare(b.nombre || '');
    });

  // Categorías presentes en los productos finales (no listamos vacías)
  const categoriasUsadas = new Set(productosFinal.map(p => p.categoria).filter(Boolean));
  const categoriasFinal = categorias
    .filter(c => categoriasUsadas.has(c.id))
    .map(c => ({ id: c.id, nombre: c.nombre, orden: typeof c.orden === 'number' ? c.orden : 0 }))
    .sort((a, b) => a.orden - b.orden);

  // Datos serializados para inyectar al bundle
  const DATA = {
    productos: productosFinal,
    categorias: categoriasFinal
  };
  const CONFIG = {
    project_slug,
    tienda_api_url: tienda_api_url.replace(/\/$/, ''),
    moneda,
    marca,
    requiere_telefono: requiereTelefono,
    requiere_nombre: requiereNombre,
    requiere_mayor_edad: requiereEdad,
    permite_notas: permiteNotas,
    textos
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="theme-color" content="${escHtml(colorFondo)}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>${escHtml(textos.titulo)}</title>
<meta name="description" content="${escHtml(textos.subtitulo)} — ${escHtml(marca)}">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --primary:${escHtml(colorPrimario)};
  --acento:${escHtml(colorAcento)};
  --bg:${escHtml(colorFondo)};
  --bg-card:#151515;
  --bg-surface:#111;
  --border:#252525;
  --text:${escHtml(colorTexto)};
  --text-dim:#666;
  --text-mid:#999;
  --success:#22c55e;
  --danger:#ef4444;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}

/* Header */
.header{display:flex;align-items:center;justify-content:center;gap:12px;padding:16px 20px;background:var(--bg-surface);border-bottom:1px solid #222;position:sticky;top:0;z-index:10}
.header-logo{width:36px;height:36px;border-radius:8px;object-fit:cover;background:var(--bg-card)}
.brand{display:flex;flex-direction:column;align-items:center;gap:2px}
.brand-name{font-size:1.3rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--primary)}
.brand-sub{font-size:.65rem;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)}

/* Categories */
.cats{display:flex;gap:8px;padding:12px 16px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;background:var(--bg)}
.cats::-webkit-scrollbar{display:none}
.cat-pill{flex-shrink:0;padding:6px 14px;border:1px solid var(--border);border-radius:20px;background:transparent;color:var(--text-dim);font-size:.75rem;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.cat-pill.active{border-color:var(--primary);color:var(--primary);background:rgba(245,158,11,.08)}

/* Grid */
.content{padding:16px;padding-bottom:120px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
@media(max-width:400px){.grid{grid-template-columns:repeat(2,1fr);gap:8px}.content{padding:10px;padding-bottom:120px}}
@media(min-width:600px){.grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}}

/* Card */
.card{display:flex;flex-direction:column;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:hidden;cursor:pointer;transition:border-color .15s,transform .1s;-webkit-tap-highlight-color:transparent}
.card:active{transform:scale(.97)}
.card-visual{position:relative;width:100%;aspect-ratio:1/1;background:#1a1a1a;display:flex;align-items:center;justify-content:center;overflow:hidden}
.card-img{width:100%;height:100%;object-fit:cover}
.card-ph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:linear-gradient(135deg,#1a1a1a,#222);color:var(--text-dim);font-size:.75rem;text-align:center;padding:8px}
.card-body{padding:10px 10px 4px;display:flex;flex-direction:column;gap:2px;flex:1}
.card-nombre{font-size:.85rem;font-weight:700;color:var(--text);line-height:1.2}
.card-desc{font-size:.7rem;color:var(--text-mid);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-footer{display:flex;align-items:center;justify-content:space-between;padding:6px 10px 10px;margin-top:auto}
.card-precio{font-size:.95rem;font-weight:800;color:var(--primary);font-variant-numeric:tabular-nums}
.card-add{width:32px;height:32px;border:2px solid #333;border-radius:50%;background:transparent;color:var(--primary);font-size:1.2rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;-webkit-tap-highlight-color:transparent}
.card-add:active{transform:scale(.9);background:var(--primary);color:#000}

/* Detail modal */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:flex-end;justify-content:center;z-index:1000;opacity:0;pointer-events:none;transition:opacity .2s}
.overlay.open{opacity:1;pointer-events:auto}
.modal{background:var(--bg-surface);border-radius:20px 20px 0 0;width:100%;max-width:500px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;transform:translateY(100%);transition:transform .25s ease-out}
.overlay.open .modal{transform:translateY(0)}
@media(min-width:600px){.overlay.open{align-items:center}.modal{border-radius:20px;max-height:85vh}}
.detail-visual{position:relative;width:100%;aspect-ratio:16/9;background:#1a1a1a;overflow:hidden;display:flex;align-items:center;justify-content:center}
.detail-visual img{width:100%;height:100%;object-fit:cover}
.close-btn{position:absolute;top:12px;right:12px;width:36px;height:36px;border:none;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)}
.modal-content{flex:1;overflow-y:auto;padding:20px}
.modal-header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px}
.modal-nombre{font-size:1.3rem;font-weight:800;color:#fff;line-height:1.2}
.modal-precio{font-size:1.2rem;font-weight:800;color:var(--primary);white-space:nowrap;font-variant-numeric:tabular-nums}
.modal-desc{font-size:.9rem;color:#bbb;line-height:1.5;margin:8px 0 16px}
.modal-footer{display:flex;gap:10px;padding:16px 20px;border-top:1px solid #222;background:var(--bg-surface)}
.btn{flex:1;padding:14px;border:none;border-radius:12px;font-size:.9rem;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}
.btn-primary{background:var(--primary);color:#000}.btn-primary:active{filter:brightness(.85)}
.btn-primary:disabled{opacity:.4;cursor:default}
.btn-secondary{background:#222;color:var(--text);flex:.6}.btn-secondary:active{background:#333}
.btn-danger{background:#222;color:#888;flex:.5}.btn-danger:active{background:#333}

/* Cart FAB */
.fab{position:fixed;bottom:24px;right:24px;display:none;flex-direction:column;align-items:center;justify-content:center;width:72px;height:72px;border:none;border-radius:50%;background:var(--primary);color:#000;cursor:pointer;z-index:50;box-shadow:0 4px 20px rgba(0,0,0,.4);transition:transform .15s}
.fab.show{display:flex}.fab:active{transform:scale(.92)}
.fab-count{font-size:1.1rem;font-weight:800;line-height:1}
.fab-total{font-size:.55rem;font-weight:600;opacity:.85}

/* Cart panel */
.cart-items{flex:1;overflow-y:auto;padding:12px 20px}
.cart-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #1a1a1a}
.ci-info{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.ci-name{font-size:.85rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ci-ctrl{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.qty{display:flex;align-items:center}
.qty button{width:28px;height:28px;border:1px solid #333;background:#1a1a1a;color:var(--text);font-size:.9rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center}
.qty button:first-child{border-radius:6px 0 0 6px}.qty button:last-child{border-radius:0 6px 6px 0}
.qty button:active{background:#333}
.qty span{width:32px;height:28px;display:flex;align-items:center;justify-content:center;border-top:1px solid #333;border-bottom:1px solid #333;background:#1a1a1a;font-size:.8rem;font-weight:700;color:#fff}
.ci-sub{font-size:.8rem;font-weight:700;color:var(--primary);font-variant-numeric:tabular-nums}
.cart-footer{padding:16px 20px;border-top:1px solid #222}
.total-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.total-label{font-size:.9rem;font-weight:600;color:#888;text-transform:uppercase}
.total-amount{font-size:1.4rem;font-weight:800;color:#fff;font-variant-numeric:tabular-nums}
.cart-actions{display:flex;gap:8px}
.empty{text-align:center;padding:40px 20px;color:#555}
.empty-ico{font-size:2.5rem;display:block;margin-bottom:8px}

/* Form */
.form-field{margin-bottom:14px}
.form-label{display:block;font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);margin-bottom:6px}
.form-input{width:100%;padding:12px 14px;border:1px solid #333;border-radius:10px;background:#1a1a1a;color:var(--text);font-size:.95rem;outline:none;font-family:inherit;box-sizing:border-box}
.form-input:focus{border-color:var(--primary)}
.form-textarea{resize:vertical;min-height:60px;max-height:140px;line-height:1.4}
.form-checkbox-row{display:flex;align-items:center;gap:10px;padding:8px 0}
.form-checkbox{width:20px;height:20px;flex-shrink:0;accent-color:var(--primary);cursor:pointer}
.form-checkbox-label{font-size:.85rem;color:var(--text);cursor:pointer;user-select:none}
.form-error{font-size:.75rem;color:var(--danger);margin-top:4px;display:none}
.form-error.show{display:block}

/* Status / success */
.status-modal{padding:32px 24px;text-align:center}
.status-icon{font-size:3rem;display:block;margin-bottom:16px}
.status-icon.ok{color:var(--success)}
.status-icon.err{color:var(--danger)}
.status-title{font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:8px}
.status-msg{font-size:.9rem;color:var(--text-mid);line-height:1.5;margin-bottom:16px}
.status-codigo{font-size:2rem;font-weight:800;color:var(--primary);font-family:'Courier New',monospace;letter-spacing:6px;padding:12px 20px;border:2px dashed var(--primary);border-radius:12px;display:inline-block;margin-bottom:8px}
.status-codigo-label{font-size:.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}

/* Spinner */
.spinner{display:inline-block;width:20px;height:20px;border:3px solid rgba(255,255,255,.2);border-top-color:#000;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:8px}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>

<header class="header">
  ${logoUrl ? `<img class="header-logo" src="${escHtml(logoUrl)}" alt="${escHtml(marca)}">` : ''}
  <div class="brand">
    <span class="brand-name">${escHtml(textos.titulo)}</span>
    <span class="brand-sub">${escHtml(textos.subtitulo)}</span>
  </div>
</header>

<div class="cats" id="cats"></div>

<main class="content">
  <div class="grid" id="grid"></div>
</main>

<!-- Botón flotante carrito -->
<button class="fab" id="fab" type="button" aria-label="${escHtml(textos.carrito_titulo)}">
  <span class="fab-count" id="fab-count">0</span>
  <span class="fab-total" id="fab-total"></span>
</button>

<!-- Modal detalle producto -->
<div class="overlay" id="detail-overlay">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="detail-visual" id="detail-visual"></div>
    <div class="modal-content" id="detail-content"></div>
    <div class="modal-footer" id="detail-footer"></div>
  </div>
</div>

<!-- Modal carrito -->
<div class="overlay" id="cart-overlay">
  <div class="modal" onclick="event.stopPropagation()">
    <header class="modal-header" style="padding:16px 20px;border-bottom:1px solid #222">
      <span class="modal-nombre">${escHtml(textos.carrito_titulo)}</span>
      <button class="close-btn" data-action="close-cart">✕</button>
    </header>
    <div class="cart-items" id="cart-items"></div>
    <div class="cart-footer" id="cart-footer" style="display:none"></div>
  </div>
</div>

<!-- Modal form pedido -->
<div class="overlay" id="form-overlay">
  <div class="modal" onclick="event.stopPropagation()">
    <header class="modal-header" style="padding:16px 20px;border-bottom:1px solid #222">
      <span class="modal-nombre">${escHtml(textos.form_titulo)}</span>
      <button class="close-btn" data-action="close-form">✕</button>
    </header>
    <div class="modal-content">
      ${requiereNombre ? `
      <div class="form-field">
        <label class="form-label" for="f-nombre">${escHtml(textos.form_nombre)}</label>
        <input class="form-input" id="f-nombre" type="text" maxlength="60" autocomplete="name">
        <div class="form-error" id="err-nombre"></div>
      </div>` : ''}
      ${requiereTelefono ? `
      <div class="form-field">
        <label class="form-label" for="f-telefono">${escHtml(textos.form_telefono)}</label>
        <input class="form-input" id="f-telefono" type="tel" maxlength="20" autocomplete="tel" inputmode="tel">
        <div class="form-error" id="err-telefono"></div>
      </div>` : ''}
      ${permiteNotas ? `
      <div class="form-field">
        <label class="form-label" for="f-notas">${escHtml(textos.form_notas)}</label>
        <textarea class="form-input form-textarea" id="f-notas" maxlength="500"></textarea>
      </div>` : ''}
      ${requiereEdad ? `
      <div class="form-field">
        <div class="form-checkbox-row">
          <input class="form-checkbox" id="f-mayor-edad" type="checkbox">
          <label class="form-checkbox-label" for="f-mayor-edad">${escHtml(textos.form_mayor_edad)}</label>
        </div>
        <div class="form-error" id="err-mayor-edad"></div>
      </div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-action="close-form">${escHtml(textos.form_cancelar)}</button>
      <button class="btn btn-primary" id="btn-enviar" data-action="enviar">${escHtml(textos.form_enviar)}</button>
    </div>
  </div>
</div>

<!-- Modal estado (éxito/error) -->
<div class="overlay" id="status-overlay">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="status-modal" id="status-content"></div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="btn-cerrar-status" data-action="close-status">${escHtml(textos.exito_boton_cerrar)}</button>
    </div>
  </div>
</div>

<script>
(function(){
  'use strict';

  var DATA = ${JSON.stringify(DATA)};
  var CFG = ${JSON.stringify(CONFIG)};
  var T = CFG.textos;

  var LS_CART = 'cclient-cart-' + CFG.project_slug;
  var LS_DATOS = 'cclient-datos-' + CFG.project_slug;

  var state = {
    cart: {},        // { producto_id: cantidad }
    catActiva: null  // null = todas
  };

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function fmt(p) { return (p == null ? 0 : p).toFixed(2) + ' ' + CFG.moneda; }
  function fmtCentimos(c) { return (c / 100).toFixed(2) + ' ' + CFG.moneda; }
  function productoById(id) {
    for (var i = 0; i < DATA.productos.length; i++) if (DATA.productos[i].id === id) return DATA.productos[i];
    return null;
  }
  function loadCart() {
    try {
      var raw = localStorage.getItem(LS_CART);
      if (raw) state.cart = JSON.parse(raw) || {};
    } catch(e) { state.cart = {}; }
    // Sanitizar — purgar productos que ya no existen
    Object.keys(state.cart).forEach(function(id) {
      if (!productoById(id)) delete state.cart[id];
    });
  }
  function saveCart() {
    try { localStorage.setItem(LS_CART, JSON.stringify(state.cart)); } catch(e) {}
  }
  function loadDatos() {
    try { return JSON.parse(localStorage.getItem(LS_DATOS) || '{}'); } catch(e) { return {}; }
  }
  function saveDatos(d) {
    try { localStorage.setItem(LS_DATOS, JSON.stringify(d)); } catch(e) {}
  }
  function totalCarrito() {
    var t = 0;
    Object.keys(state.cart).forEach(function(id) {
      var p = productoById(id);
      if (!p) return;
      t += (p.precio || 0) * state.cart[id];
    });
    return t;
  }
  function countCarrito() {
    var n = 0;
    Object.keys(state.cart).forEach(function(id) { n += state.cart[id]; });
    return n;
  }
  function emptyCarrito() {
    state.cart = {};
    saveCart();
  }

  // ---------- render: categorías ----------
  function renderCats() {
    var html = '<button class="cat-pill" data-cat="">' + esc(T.cat_todas) + '</button>';
    for (var i = 0; i < DATA.categorias.length; i++) {
      var c = DATA.categorias[i];
      html += '<button class="cat-pill" data-cat="' + esc(c.id) + '">' + esc(c.nombre) + '</button>';
    }
    $('cats').innerHTML = html;
    updateCatPills();
  }
  function updateCatPills() {
    var pills = document.querySelectorAll('.cat-pill');
    var key = state.catActiva == null ? '' : state.catActiva;
    pills.forEach(function(el) {
      if (el.getAttribute('data-cat') === key) el.classList.add('active');
      else el.classList.remove('active');
    });
  }

  // ---------- render: grid productos ----------
  function renderGrid() {
    var prods = DATA.productos.filter(function(p) {
      if (state.catActiva == null) return true;
      return p.categoria === state.catActiva;
    });
    if (prods.length === 0) {
      $('grid').innerHTML = '<div class="empty"><span class="empty-ico">∅</span>No hay productos disponibles ahora.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < prods.length; i++) {
      var p = prods[i];
      var visual = p.imagen_url
        ? '<img class="card-img" loading="lazy" src="' + esc(p.imagen_url) + '" alt="' + esc(p.nombre) + '">'
        : '<div class="card-ph">' + esc(p.nombre) + '</div>';
      html += '<div class="card" data-detail="' + esc(p.id) + '">'
        + '<div class="card-visual">' + visual + '</div>'
        + '<div class="card-body">'
        + '<div class="card-nombre">' + esc(p.nombre) + '</div>'
        + (p.descripcion_publica ? '<div class="card-desc">' + esc(p.descripcion_publica) + '</div>' : '')
        + '</div>'
        + '<div class="card-footer">'
        + '<span class="card-precio">' + fmt(p.precio) + '</span>'
        + '<button class="card-add" data-add="' + esc(p.id) + '" type="button" aria-label="Añadir">+</button>'
        + '</div>'
        + '</div>';
    }
    $('grid').innerHTML = html;
  }

  // ---------- render: detail modal ----------
  function openDetail(id) {
    var p = productoById(id);
    if (!p) return;
    $('detail-visual').innerHTML = p.imagen_url
      ? '<img loading="lazy" src="' + esc(p.imagen_url) + '" alt="' + esc(p.nombre) + '"><button class="close-btn" data-action="close-detail">✕</button>'
      : '<div class="card-ph">' + esc(p.nombre) + '</div><button class="close-btn" data-action="close-detail">✕</button>';
    var contentHtml = '<div class="modal-header">'
      + '<h2 class="modal-nombre">' + esc(p.nombre) + '</h2>'
      + '<span class="modal-precio">' + fmt(p.precio) + '</span>'
      + '</div>';
    if (p.descripcion_publica) contentHtml += '<p class="modal-desc">' + esc(p.descripcion_publica) + '</p>';
    $('detail-content').innerHTML = contentHtml;
    var enCarrito = state.cart[p.id] || 0;
    $('detail-footer').innerHTML = enCarrito > 0
      ? '<button class="btn btn-secondary" data-action="close-detail">' + esc(T.boton_seguir) + '</button>'
        + '<button class="btn btn-primary" data-add="' + esc(p.id) + '" data-close-detail="1">+ ' + esc(T.boton_seguir.replace(/^Seguir /, 'Añadir más')) + '</button>'
      : '<button class="btn btn-secondary" data-action="close-detail">' + esc(T.form_cancelar) + '</button>'
        + '<button class="btn btn-primary" data-add="' + esc(p.id) + '" data-close-detail="1">+ ' + fmt(p.precio) + '</button>';
    $('detail-overlay').classList.add('open');
  }
  function closeDetail() { $('detail-overlay').classList.remove('open'); }

  // ---------- render: carrito ----------
  function renderFab() {
    var n = countCarrito();
    var fab = $('fab');
    if (n > 0) {
      fab.classList.add('show');
      $('fab-count').textContent = n;
      $('fab-total').textContent = fmt(totalCarrito());
    } else {
      fab.classList.remove('show');
    }
  }
  function openCart() {
    renderCart();
    $('cart-overlay').classList.add('open');
  }
  function closeCart() { $('cart-overlay').classList.remove('open'); }
  function renderCart() {
    var ids = Object.keys(state.cart);
    var items = $('cart-items');
    var footer = $('cart-footer');
    if (ids.length === 0) {
      items.innerHTML = '<div class="empty"><span class="empty-ico">∅</span>' + esc(T.carrito_vacio) + '</div>';
      footer.style.display = 'none';
      return;
    }
    var html = '';
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var p = productoById(id);
      if (!p) continue;
      var qty = state.cart[id];
      html += '<div class="cart-item">'
        + '<div class="ci-info"><span class="ci-name">' + esc(p.nombre) + '</span></div>'
        + '<div class="ci-ctrl">'
        + '<div class="qty">'
        + '<button data-qty-dec="' + esc(id) + '" type="button">−</button>'
        + '<span>' + qty + '</span>'
        + '<button data-qty-inc="' + esc(id) + '" type="button">+</button>'
        + '</div>'
        + '<span class="ci-sub">' + fmt((p.precio || 0) * qty) + '</span>'
        + '</div>'
        + '</div>';
    }
    items.innerHTML = html;
    footer.innerHTML = '<div class="total-row">'
      + '<span class="total-label">' + esc(T.total) + '</span>'
      + '<span class="total-amount">' + fmt(totalCarrito()) + '</span>'
      + '</div>'
      + '<div class="cart-actions">'
      + '<button class="btn btn-danger" data-action="vaciar" type="button">' + esc(T.boton_vaciar) + '</button>'
      + '<button class="btn btn-primary" data-action="abrir-form" type="button">' + esc(T.boton_enviar) + '</button>'
      + '</div>';
    footer.style.display = 'block';
  }

  // ---------- carrito: mutaciones ----------
  function addToCart(id) {
    if (!productoById(id)) return;
    state.cart[id] = (state.cart[id] || 0) + 1;
    saveCart();
    renderFab();
  }
  function decFromCart(id) {
    if (!state.cart[id]) return;
    state.cart[id] -= 1;
    if (state.cart[id] <= 0) delete state.cart[id];
    saveCart();
    renderFab();
    renderCart();
  }
  function incInCart(id) {
    if (!productoById(id)) return;
    state.cart[id] = (state.cart[id] || 0) + 1;
    saveCart();
    renderFab();
    renderCart();
  }

  // ---------- form pedido ----------
  function abrirForm() {
    if (countCarrito() === 0) return;
    var datos = loadDatos();
    if (CFG.requiere_nombre && $('f-nombre')) $('f-nombre').value = datos.nombre || '';
    if (CFG.requiere_telefono && $('f-telefono')) $('f-telefono').value = datos.telefono || '';
    if (CFG.permite_notas && $('f-notas')) $('f-notas').value = '';
    if (CFG.requiere_mayor_edad && $('f-mayor-edad')) $('f-mayor-edad').checked = false;
    limpiarErroresForm();
    $('form-overlay').classList.add('open');
  }
  function cerrarForm() { $('form-overlay').classList.remove('open'); }
  function limpiarErroresForm() {
    ['err-nombre', 'err-telefono', 'err-mayor-edad'].forEach(function(id) {
      var el = $(id);
      if (el) { el.textContent = ''; el.classList.remove('show'); }
    });
  }
  function mostrarErrorForm(id, msg) {
    var el = $(id);
    if (el) { el.textContent = msg; el.classList.add('show'); }
  }

  function construirPayload() {
    var items = [];
    var total_centimos = 0;
    Object.keys(state.cart).forEach(function(id) {
      var p = productoById(id);
      if (!p) return;
      var qty = state.cart[id];
      var precio_unitario_centimos = Math.round((p.precio || 0) * 100);
      var precio_total_centimos = precio_unitario_centimos * qty;
      total_centimos += precio_total_centimos;
      items.push({
        cantidad: qty,
        descripcion: p.nombre,
        producto_id: p.id,
        precio_unitario_centimos: precio_unitario_centimos,
        precio_total_centimos: precio_total_centimos
      });
    });
    var payload = { items: items, total_centimos: total_centimos };
    if (CFG.requiere_nombre) {
      var n = ($('f-nombre') && $('f-nombre').value || '').trim();
      if (n) payload.nombre_cliente = n;
    }
    if (CFG.requiere_telefono) {
      var t = ($('f-telefono') && $('f-telefono').value || '').replace(/[^0-9]/g, '');
      if (t) payload.cliente_telefono = t;
    }
    if (CFG.permite_notas) {
      var notas = ($('f-notas') && $('f-notas').value || '').trim();
      if (notas) payload.notas_generales = notas;
    }
    if (CFG.requiere_mayor_edad) {
      payload.mayor_edad_confirmado = !!($('f-mayor-edad') && $('f-mayor-edad').checked);
    }
    return payload;
  }

  function validarForm(payload) {
    limpiarErroresForm();
    var ok = true;
    if (CFG.requiere_nombre && !payload.nombre_cliente) {
      mostrarErrorForm('err-nombre', 'Indica tu nombre');
      ok = false;
    }
    if (CFG.requiere_telefono && (!payload.cliente_telefono || payload.cliente_telefono.length < 9)) {
      mostrarErrorForm('err-telefono', 'Indica un teléfono válido');
      ok = false;
    }
    if (CFG.requiere_mayor_edad && payload.mayor_edad_confirmado !== true) {
      mostrarErrorForm('err-mayor-edad', 'Debes confirmar para continuar');
      ok = false;
    }
    return ok;
  }

  function enviarPedido() {
    if (countCarrito() === 0) return;
    var payload = construirPayload();
    if (!validarForm(payload)) return;
    // Persistir datos del cliente para futuras visitas
    saveDatos({
      nombre: payload.nombre_cliente || null,
      telefono: payload.cliente_telefono || null
    });
    var btn = $('btn-enviar');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>...';
    var url = CFG.tienda_api_url + '/tienda/pedido/' + encodeURIComponent(CFG.project_slug);
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function(r) {
        return r.json().then(function(body) { return { status: r.status, body: body }; });
      })
      .then(function(res) {
        btn.disabled = false;
        btn.textContent = T.form_enviar;
        if (res.status >= 200 && res.status < 300) {
          mostrarExito(res.body && res.body.data);
        } else {
          mostrarError(res.body && res.body.error);
        }
      })
      .catch(function(err) {
        btn.disabled = false;
        btn.textContent = T.form_enviar;
        mostrarError({ code: 'NETWORK_ERROR', message: err && err.message || 'Error de red' });
      });
  }

  function mostrarExito(data) {
    cerrarForm();
    closeCart();
    var codigo = data && data.codigo_recogida;
    var html = '<div class="status-modal">'
      + '<span class="status-icon ok">✓</span>'
      + '<h2 class="status-title">' + esc(T.exito_titulo) + '</h2>';
    if (codigo) {
      html += '<div class="status-codigo-label">' + esc(T.exito_mensaje_codigo) + '</div>'
        + '<div class="status-codigo">' + esc(codigo) + '</div>';
    }
    html += '<p class="status-msg">' + esc(T.exito_mensaje_pie) + '</p>'
      + '</div>';
    $('status-content').innerHTML = html;
    $('status-overlay').classList.add('open');
    // Vaciar carrito tras éxito
    emptyCarrito();
    renderFab();
  }

  function mostrarError(error) {
    var msg = (error && error.message) || 'Inténtalo de nuevo en un momento.';
    var html = '<div class="status-modal">'
      + '<span class="status-icon err">✕</span>'
      + '<h2 class="status-title">' + esc(T.error_titulo) + '</h2>'
      + '<p class="status-msg">' + esc(msg) + '</p>'
      + '</div>';
    $('status-content').innerHTML = html;
    $('status-overlay').classList.add('open');
  }
  function cerrarStatus() { $('status-overlay').classList.remove('open'); }

  // ---------- event delegation ----------
  document.addEventListener('click', function(ev) {
    var t = ev.target;
    // Categorías
    var pill = t.closest && t.closest('[data-cat]');
    if (pill) {
      var cat = pill.getAttribute('data-cat');
      state.catActiva = cat === '' ? null : cat;
      updateCatPills();
      renderGrid();
      return;
    }
    // Añadir al carrito
    var addBtn = t.closest && t.closest('[data-add]');
    if (addBtn) {
      ev.stopPropagation();
      addToCart(addBtn.getAttribute('data-add'));
      if (addBtn.getAttribute('data-close-detail')) closeDetail();
      return;
    }
    // Abrir detalle
    var card = t.closest && t.closest('[data-detail]');
    if (card) {
      openDetail(card.getAttribute('data-detail'));
      return;
    }
    // Cantidad +/- en carrito
    var inc = t.closest && t.closest('[data-qty-inc]');
    if (inc) { incInCart(inc.getAttribute('data-qty-inc')); return; }
    var dec = t.closest && t.closest('[data-qty-dec]');
    if (dec) { decFromCart(dec.getAttribute('data-qty-dec')); return; }
    // Acciones declaradas
    var action = t.closest && t.closest('[data-action]');
    if (action) {
      var a = action.getAttribute('data-action');
      if (a === 'close-detail') closeDetail();
      else if (a === 'close-cart') closeCart();
      else if (a === 'close-form') cerrarForm();
      else if (a === 'close-status') cerrarStatus();
      else if (a === 'vaciar') { emptyCarrito(); renderCart(); renderFab(); }
      else if (a === 'abrir-form') { closeCart(); abrirForm(); }
      else if (a === 'enviar') enviarPedido();
      return;
    }
  });
  // FAB
  $('fab').addEventListener('click', function(ev) { ev.stopPropagation(); openCart(); });
  // Click en overlay (fondo) cierra el modal
  ['detail-overlay', 'cart-overlay', 'form-overlay', 'status-overlay'].forEach(function(id) {
    $(id).addEventListener('click', function(ev) {
      if (ev.target.id === id) {
        if (id === 'detail-overlay') closeDetail();
        else if (id === 'cart-overlay') closeCart();
        else if (id === 'form-overlay') cerrarForm();
        else if (id === 'status-overlay') cerrarStatus();
      }
    });
  });

  // ---------- init ----------
  loadCart();
  renderCats();
  renderGrid();
  renderFab();
})();
</script>
</body>
</html>`;
}

module.exports = { generateStaticHTML };
