/**
 * Static Template Generator for Carta Digital
 *
 * Generates a self-contained HTML file with all product data,
 * cart logic, and WhatsApp integration embedded.
 * No backend or network connection needed.
 *
 * Output: Single HTML file deployable to GitHub Pages, Netlify, etc.
 */

function generateStaticHTML(carta, config, options = {}) {
  const {
    nombre_negocio = config.nombre_negocio || 'Pizzicas',
    moneda = config.moneda || '€',
    whatsapp_telefono = config.whatsapp_telefono || '',
    mensaje_header = config.mensaje_header || '¡Hola! Quiero pedir:',
    tema = config.tema || {},
    lang = 'es',
    ai_endpoint = config.ai_endpoint || '',
    ai_provider = config.ai_provider || 'auto',
    ai_chat_path = config.ai_chat_path || '/modules/ai-gateway/chat',
    chat_enabled = config.chat_enabled !== false && !!ai_endpoint
  } = options;

  const colorPrimario = tema.color_primario || '#f59e0b';
  const colorFondo = tema.color_fondo || '#0a0a0a';
  const colorTexto = tema.color_texto || '#e5e5e5';
  const logoEmoji = tema.logo_emoji || '🍕';

  // Prepare data
  const categorias = (carta.categorias || []).map(c => ({
    id: c.id, nombre: c.nombre, orden: c.orden, icon: c.icon || null
  }));

  const productos = (carta.productos || []).map(p => ({
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria,
    precio: p.precio,
    descripcion: p.descripcion || null,
    emoji: p.emoji || null,
    tags: p.tags || [],
    imagen: p.imagen || null,
    ingredientes: (p.ingredientes || []).map(i => ({
      nombre: i.nombre, emoji: i.emoji || null, tipo: i.tipo || null,
      precio_extra: i.precio_extra ?? null
    }))
  }));

  const dataJSON = JSON.stringify({ categorias, productos });
  const configJSON = JSON.stringify({
    nombre_negocio, moneda, whatsapp_telefono, mensaje_header,
    ai_endpoint, ai_provider, ai_chat_path, chat_enabled
  });

  // Build system prompt for AI assistant with full menu context + upselling
  const catMap = {};
  for (const c of categorias) { catMap[c.id] = c.nombre; }

  const menuPorCategoria = {};
  for (const p of productos) {
    const catNombre = catMap[p.categoria] || p.categoria || 'Otros';
    if (!menuPorCategoria[catNombre]) menuPorCategoria[catNombre] = [];
    const ings = (p.ingredientes || []).map(i => i.nombre).join(', ');
    const tags = (p.tags || []).join(', ');
    const extras = (p.ingredientes || []).filter(i => i.precio_extra).map(i => `+${i.nombre} ${i.precio_extra.toFixed(2)}${moneda}`).join(', ');
    menuPorCategoria[catNombre].push(
      `- ${p.nombre}: ${p.precio.toFixed(2)}${moneda}${ings ? ' (' + ings + ')' : ''}${tags ? ' [' + tags + ']' : ''}${extras ? ' | Extras: ' + extras : ''}`
    );
  }

  const menuResumen = Object.entries(menuPorCategoria).map(
    ([cat, items]) => `## ${cat}\n${items.join('\n')}`
  ).join('\n\n');

  // Detect available category types for upselling rules
  const catNombres = Object.keys(menuPorCategoria).map(n => n.toLowerCase());
  const tieneBebidas = catNombres.some(n => /bebida|drink|refresco/i.test(n));
  const tienePostres = catNombres.some(n => /postre|dessert|dulce/i.test(n));
  const tieneEntrantes = catNombres.some(n => /entrante|starter|aperitivo|tapa/i.test(n));
  const tieneExtras = productos.some(p => (p.ingredientes || []).some(i => i.precio_extra));

  let upsellRules = `\nUPSELLING (MUY IMPORTANTE - hazlo de forma natural, como un camarero amable):\n`;
  upsellRules += `- Cuando el cliente elija un plato, sugiere UN complemento concreto con nombre y precio\n`;
  upsellRules += `- Usa frases naturales: "¡Buena elección! ¿Te apetece también...?", "Mucha gente lo combina con..."\n`;
  upsellRules += `- NO repitas la misma sugerencia dos veces en la conversación\n`;
  upsellRules += `- Máximo UNA sugerencia por mensaje, no seas insistente\n`;
  upsellRules += `- Si el cliente dice que no, respeta su decisión y sigue con el pedido\n`;

  if (tieneBebidas) upsellRules += `- Si pide comida sin bebida, sugiere una bebida concreta del menú\n`;
  if (tienePostres) upsellRules += `- Antes de cerrar el pedido, menciona un postre concreto\n`;
  if (tieneEntrantes) upsellRules += `- Si pide un plato principal, sugiere un entrante para compartir\n`;
  if (tieneExtras) upsellRules += `- Si un producto tiene extras disponibles, menciona el más popular\n`;
  if (!tieneBebidas && !tienePostres && !tieneEntrantes) {
    // Solo una categoría (ej: solo pizzas) — upselling por variedad
    upsellRules += `- Si pide un producto, sugiere otro complementario o similar que le pueda gustar\n`;
    upsellRules += `- Menciona los más populares o los mejor valorados para animar a probar\n`;
    upsellRules += `- Si pide solo uno, sugiere llevar uno más: "¿Quieres añadir otra para compartir?"\n`;
  }

  const systemPromptJSON = JSON.stringify(
    `Eres el asistente virtual de ${nombre_negocio}. Ayudas a los clientes a elegir y hacer su pedido. Eres como un camarero experto: amable, conoces todo el menú y sabes recomendar.\n\n` +
    `REGLAS:\n` +
    `- Responde SIEMPRE en español, breve y amable (max 2-3 frases)\n` +
    `- Recomienda platos según preferencias del cliente\n` +
    `- Si el cliente quiere pedir, confirma los items y cantidades\n` +
    `- Cuando el pedido esté listo, responde con un JSON al final: {"pedido":[{"id":"ID","nombre":"NOMBRE","qty":N}]}\n` +
    `- Si no sabes algo, di que el cliente puede contactar por WhatsApp\n` +
    `- NO inventes productos que no están en el menú\n` +
    upsellRules + `\n` +
    `MENÚ DE ${nombre_negocio.toUpperCase()}:\n${menuResumen}`
  );

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="theme-color" content="${colorFondo}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>${nombre_negocio} — Carta Digital</title>
<meta name="description" content="Carta digital de ${nombre_negocio}. Consulta nuestro menú y haz tu pedido por WhatsApp.">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icon-192.svg">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --primary:${colorPrimario};
  --bg:${colorFondo};
  --bg-card:#151515;
  --bg-surface:#111;
  --border:#252525;
  --text:${colorTexto};
  --text-dim:#666;
  --text-mid:#999;
  --success:#22c55e;
  --danger:#ef4444;
  --whatsapp:#25d366;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}

/* Header */
.header{display:flex;align-items:center;justify-content:center;padding:16px 20px;background:var(--bg-surface);border-bottom:1px solid #222;position:sticky;top:0;z-index:10}
.brand{display:flex;flex-direction:column;align-items:center;gap:2px}
.brand-name{font-size:1.4rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--primary)}
.brand-sub{font-size:.65rem;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)}

/* Categories */
.cats{display:flex;gap:8px;padding:12px 16px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;background:var(--bg)}
.cats::-webkit-scrollbar{display:none}
.cat-pill{flex-shrink:0;padding:6px 14px;border:1px solid var(--border);border-radius:20px;background:transparent;color:var(--text-dim);font-size:.75rem;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.cat-pill.active{border-color:var(--primary);color:var(--primary);background:rgba(245,158,11,.08)}

/* Grid */
.content{padding:16px;padding-bottom:100px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
@media(max-width:400px){.grid{grid-template-columns:repeat(2,1fr);gap:8px}.content{padding:10px;padding-bottom:100px}}
@media(min-width:600px){.grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}}

/* Card */
.card{display:flex;flex-direction:column;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:hidden;cursor:pointer;transition:border-color .15s,transform .1s;-webkit-tap-highlight-color:transparent}
.card:active{transform:scale(.97)}
.card-visual{position:relative;width:100%;aspect-ratio:4/3;background:#1a1a1a;display:flex;align-items:center;justify-content:center;overflow:hidden}
.card-img{width:100%;height:100%;object-fit:cover}
.card-ph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:linear-gradient(135deg,#1a1a1a,#222);font-size:2.5rem;opacity:.6}
.badges{position:absolute;top:6px;left:6px;display:flex;gap:4px}
.badge{padding:2px 6px;border-radius:4px;background:rgba(34,197,94,.85);color:#fff;font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.badge.popular{background:var(--primary)}
.badge.picante{background:var(--danger)}
.badge.premium{background:#a855f7}
.badge.nuevo{background:#3b82f6}
.card-body{padding:10px 10px 4px;display:flex;flex-direction:column;gap:2px}
.card-nombre{font-size:.85rem;font-weight:700;color:var(--text);line-height:1.2}
.card-desc{font-size:.7rem;color:var(--text-mid);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-ings{font-size:.65rem;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-footer{display:flex;align-items:center;justify-content:space-between;padding:6px 10px 10px;margin-top:auto}
.card-precio{font-size:.95rem;font-weight:800;color:var(--primary);font-variant-numeric:tabular-nums}
.card-add{width:30px;height:30px;border:2px solid #333;border-radius:50%;background:transparent;color:var(--primary);font-size:1.1rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;-webkit-tap-highlight-color:transparent}
.card-add:active{transform:scale(.9);background:var(--primary);color:#000}

/* Detail modal */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:flex-end;justify-content:center;z-index:1000;opacity:0;pointer-events:none;transition:opacity .2s}
.overlay.open{opacity:1;pointer-events:auto}
.detail{background:var(--bg-surface);border-radius:20px 20px 0 0;width:100%;max-width:500px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;transform:translateY(100%);transition:transform .25s ease-out}
.overlay.open .detail{transform:translateY(0)}
.detail-visual{position:relative;width:100%;aspect-ratio:16/9;background:#1a1a1a;overflow:hidden;display:flex;align-items:center;justify-content:center}
.detail-visual img{width:100%;height:100%;object-fit:cover}
.detail-ph{font-size:4rem;opacity:.4}
.close-btn{position:absolute;top:12px;right:12px;width:36px;height:36px;border:none;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)}
.detail-content{flex:1;overflow-y:auto;padding:20px}
.detail-header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px}
.detail-nombre{font-size:1.3rem;font-weight:800;color:#fff;line-height:1.2}
.detail-precio{font-size:1.2rem;font-weight:800;color:var(--primary);white-space:nowrap;font-variant-numeric:tabular-nums}
.detail-tags{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.detail-tag{padding:3px 8px;border-radius:4px;color:#fff;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.detail-desc{font-size:.85rem;color:#aaa;line-height:1.5;margin:0 0 16px}
.section-title{font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#555;margin:0 0 8px}
.ing-list{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.ing-chip{display:flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid #2a2a2a;border-radius:20px;background:#1a1a1a;font-size:.75rem;color:#bbb}
.ing-chip.queso{border-color:rgba(250,204,21,.25)}.ing-chip.carne{border-color:rgba(239,68,68,.2)}.ing-chip.verdura{border-color:rgba(34,197,94,.2)}.ing-chip.marisco{border-color:rgba(59,130,246,.2)}
.detail-footer{display:flex;gap:10px;padding:16px 20px;border-top:1px solid #222;background:var(--bg-surface)}
.btn{flex:1;padding:14px;border:none;border-radius:12px;font-size:.9rem;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}
.btn-primary{background:var(--primary);color:#000}.btn-primary:active{filter:brightness(.85)}
.btn-secondary{background:#222;color:var(--text);flex:.6}.btn-secondary:active{background:#333}

/* Cart FAB */
.fab{position:fixed;bottom:24px;right:24px;display:none;flex-direction:column;align-items:center;justify-content:center;width:72px;height:72px;border:none;border-radius:50%;background:var(--primary);color:#000;cursor:pointer;z-index:50;box-shadow:0 4px 20px rgba(245,158,11,.4);transition:transform .15s}
.fab.show{display:flex}.fab:active{transform:scale(.92)}
.fab-count{font-size:1.1rem;font-weight:800;line-height:1}
.fab-total{font-size:.55rem;font-weight:600;opacity:.85}

/* Cart panel */
.cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:flex-end;justify-content:center;z-index:1100;opacity:0;pointer-events:none;transition:opacity .2s}
.cart-overlay.open{opacity:1;pointer-events:auto}
.cart{background:var(--bg-surface);border-radius:20px 20px 0 0;width:100%;max-width:500px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;transform:translateY(100%);transition:transform .2s ease-out}
.cart-overlay.open .cart{transform:translateY(0)}
.cart-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #222}
.cart-title{font-size:1.1rem;font-weight:800;color:#fff}
.cart-items{flex:1;overflow-y:auto;padding:12px 20px}
.cart-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #1a1a1a}
.ci-info{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.ci-name{font-size:.85rem;font-weight:700;color:var(--text)}
.ci-var{font-size:.65rem;line-height:1.2}
.ci-var.rm{color:var(--danger)}.ci-var.add{color:var(--success)}
.ci-ctrl{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.qty{display:flex;align-items:center}
.qty button{width:28px;height:28px;border:1px solid #333;background:#1a1a1a;color:var(--text);font-size:.9rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center}
.qty button:first-child{border-radius:6px 0 0 6px}.qty button:last-child{border-radius:0 6px 6px 0}
.qty button:active{background:#333}
.qty span{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-top:1px solid #333;border-bottom:1px solid #333;background:#1a1a1a;font-size:.8rem;font-weight:700;color:#fff}
.ci-sub{font-size:.8rem;font-weight:700;color:var(--primary);font-variant-numeric:tabular-nums}
.cart-footer{padding:16px 20px;border-top:1px solid #222}
.total-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.total-label{font-size:.9rem;font-weight:600;color:#888;text-transform:uppercase}
.total-amount{font-size:1.4rem;font-weight:800;color:#fff;font-variant-numeric:tabular-nums}
.cart-actions{display:flex;gap:8px}
.btn-clear{background:#222;color:#888;flex:.5;padding:12px;border:none;border-radius:10px;font-size:.8rem;font-weight:700;cursor:pointer}
.btn-clear:active{background:#333}
.btn-share{background:#222;color:var(--text);flex:.5;padding:12px;border:none;border-radius:10px;font-size:.8rem;font-weight:700;cursor:pointer}
.btn-share:active{background:#333}
.btn-wa{background:var(--whatsapp);color:#fff;flex:1;padding:12px;border:none;border-radius:10px;font-size:.8rem;font-weight:700;cursor:pointer}
.btn-wa:active{background:#1da851}
.empty{text-align:center;padding:40px 20px;color:#555}
.empty-ico{font-size:2.5rem;display:block;margin-bottom:8px}

/* Upsell toast */
.upsell-toast{position:fixed;bottom:104px;left:50%;transform:translateX(-50%) translateY(120px);background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:12px 16px;display:flex;align-items:center;gap:12px;z-index:60;box-shadow:0 8px 32px rgba(0,0,0,.5);max-width:calc(100% - 32px);width:360px;transition:transform .3s ease-out,opacity .3s;opacity:0;pointer-events:none}
.upsell-toast.show{transform:translateX(-50%) translateY(0);opacity:1;pointer-events:auto}
.upsell-info{flex:1;min-width:0}
.upsell-label{font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--primary);margin-bottom:2px}
.upsell-name{font-size:.82rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.upsell-price{font-size:.7rem;color:var(--text-mid)}
.upsell-add{padding:8px 14px;border:none;border-radius:10px;background:var(--primary);color:#000;font-size:.75rem;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0}
.upsell-add:active{filter:brightness(.85)}
.upsell-close{width:24px;height:24px;border:none;background:transparent;color:var(--text-dim);font-size:.9rem;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center}

/* Chat widget */
.chat-fab{position:fixed;bottom:24px;left:24px;width:56px;height:56px;border:none;border-radius:50%;background:var(--primary);color:#000;cursor:pointer;z-index:50;box-shadow:0 4px 20px rgba(245,158,11,.35);transition:transform .15s;display:none;align-items:center;justify-content:center;font-size:1.5rem}
.chat-fab.show{display:flex}.chat-fab:active{transform:scale(.9)}
.chat-fab .notif{position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:50%;background:var(--danger);border:2px solid var(--bg)}

.chat-overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:flex-end;justify-content:center;z-index:1200;opacity:0;pointer-events:none;transition:opacity .2s}
.chat-overlay.open{opacity:1;pointer-events:auto}
.chat-panel{background:var(--bg-surface);border-radius:20px 20px 0 0;width:100%;max-width:500px;height:75vh;display:flex;flex-direction:column;overflow:hidden;transform:translateY(100%);transition:transform .25s ease-out}
.chat-overlay.open .chat-panel{transform:translateY(0)}

.chat-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #222}
.chat-head-info{display:flex;align-items:center;gap:10px}
.chat-avatar{width:36px;height:36px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:1.1rem}
.chat-head-text{display:flex;flex-direction:column}
.chat-head-name{font-size:.9rem;font-weight:700;color:#fff}
.chat-head-status{font-size:.65rem;color:var(--success)}

.chat-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
.chat-msg{max-width:85%;padding:10px 14px;border-radius:16px;font-size:.85rem;line-height:1.45;word-wrap:break-word}
.chat-msg.user{align-self:flex-end;background:var(--primary);color:#000;border-bottom-right-radius:4px}
.chat-msg.bot{align-self:flex-start;background:#1e1e1e;color:var(--text);border-bottom-left-radius:4px}
.chat-msg.bot .typing{display:inline-flex;gap:4px}
.chat-msg.bot .typing span{width:6px;height:6px;border-radius:50%;background:#555;animation:blink 1.2s infinite}
.chat-msg.bot .typing span:nth-child(2){animation-delay:.2s}
.chat-msg.bot .typing span:nth-child(3){animation-delay:.4s}
@keyframes blink{0%,80%{opacity:.3}40%{opacity:1}}

.chat-input-row{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid #222;background:var(--bg-surface)}
.chat-input{flex:1;padding:10px 14px;border:1px solid #333;border-radius:20px;background:#1a1a1a;color:var(--text);font-size:.85rem;outline:none;resize:none;max-height:80px;line-height:1.4;font-family:inherit}
.chat-input::placeholder{color:#555}
.chat-input:focus{border-color:var(--primary)}
.chat-btn{width:38px;height:38px;border:none;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}
.chat-btn:active{transform:scale(.9)}
.chat-btn-send{background:var(--primary);color:#000;font-size:1rem}
.chat-btn-send:disabled{opacity:.3;cursor:default}
.chat-btn-mic{background:transparent;border:1.5px solid #444;color:#888;font-size:1.1rem}
.chat-btn-mic.recording{border-color:var(--danger);color:var(--danger);background:rgba(239,68,68,.1);animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.3)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}

.chat-quick{display:flex;gap:6px;padding:0 16px 10px;overflow-x:auto;scrollbar-width:none}
.chat-quick::-webkit-scrollbar{display:none}
.chat-quick button{flex-shrink:0;padding:6px 12px;border:1px solid #333;border-radius:16px;background:#1a1a1a;color:var(--text-mid);font-size:.72rem;cursor:pointer;white-space:nowrap}
.chat-quick button:active{background:#333;border-color:var(--primary);color:var(--primary)}

@media(min-width:600px){
  .overlay.open{align-items:center}.detail{border-radius:20px;max-height:80vh}
  .cart-overlay.open{align-items:center}.cart{border-radius:20px}
  .chat-overlay.open{align-items:center}.chat-panel{border-radius:20px;height:70vh}
}
</style>
</head>
<body>
<!-- Header -->
<header class="header">
  <div class="brand">
    <span class="brand-name">${escapeHtml(nombre_negocio)}</span>
    <span class="brand-sub">Carta Digital</span>
  </div>
</header>

<!-- Categories -->
<div class="cats" id="cats"></div>

<!-- Grid -->
<main class="content">
  <div class="grid" id="grid"></div>
</main>

<!-- Cart FAB -->
<button class="fab" id="fab" onclick="toggleCart()">
  <span class="fab-count" id="fab-count">0</span>
  <span class="fab-total" id="fab-total">0.00${escapeHtml(moneda)}</span>
</button>

<!-- Detail modal -->
<div class="overlay" id="detail-overlay" onclick="closeDetail()">
  <div class="detail" onclick="event.stopPropagation()">
    <div class="detail-visual" id="detail-visual"></div>
    <div class="detail-content" id="detail-content"></div>
    <div class="detail-footer" id="detail-footer"></div>
  </div>
</div>

<!-- Upsell toast -->
<div class="upsell-toast" id="upsell-toast">
  <div class="upsell-info">
    <div class="upsell-label">¿Y también...?</div>
    <div class="upsell-name" id="upsell-name"></div>
    <div class="upsell-price" id="upsell-price"></div>
  </div>
  <button class="upsell-add" id="upsell-add" onclick="acceptUpsell()">+ Añadir</button>
  <button class="upsell-close" onclick="dismissUpsell()">✕</button>
</div>

<!-- Cart panel -->
<div class="cart-overlay" id="cart-overlay" onclick="toggleCart()">
  <div class="cart" onclick="event.stopPropagation()">
    <header class="cart-header">
      <span class="cart-title">Tu pedido</span>
      <button class="close-btn" onclick="toggleCart()">✕</button>
    </header>
    <div class="cart-items" id="cart-items"></div>
    <div class="cart-footer" id="cart-footer" style="display:none"></div>
  </div>
</div>

<!-- Chat widget -->
<button class="chat-fab" id="chat-fab" onclick="toggleChat()" title="Asistente">💬</button>
<div class="chat-overlay" id="chat-overlay" onclick="toggleChat()">
  <div class="chat-panel" onclick="event.stopPropagation()">
    <div class="chat-head">
      <div class="chat-head-info">
        <div class="chat-avatar">${logoEmoji}</div>
        <div class="chat-head-text">
          <span class="chat-head-name">${escapeHtml(nombre_negocio)}</span>
          <span class="chat-head-status" id="chat-status">En línea</span>
        </div>
      </div>
      <button class="close-btn" onclick="toggleChat()">✕</button>
    </div>
    <div class="chat-msgs" id="chat-msgs"></div>
    <div class="chat-quick" id="chat-quick"></div>
    <div class="chat-input-row">
      <button class="chat-btn chat-btn-mic" id="chat-mic" onclick="toggleVoice()" title="Hablar">🎤</button>
      <textarea class="chat-input" id="chat-input" rows="1" placeholder="Escribe tu mensaje..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat()}"></textarea>
      <button class="chat-btn chat-btn-send" id="chat-send" onclick="sendChat()" title="Enviar">➤</button>
    </div>
  </div>
</div>

<script>
// Data — embedded at build time
const DATA = ${dataJSON};
const CONFIG = ${configJSON};
const MONEDA = '${escapeHtml(moneda)}';

// State
let catActiva = DATA.categorias.length > 0 ? DATA.categorias[0].id : null;
let cart = [];
let cartId = 0;
let detailProd = null;

// Helpers
function fmt(p) { return p.toFixed(2) + ' ' + MONEDA; }
function esc(s) { const d=document.createElement('div');d.textContent=s;return d.innerHTML; }

// Categories
function renderCats() {
  const el = document.getElementById('cats');
  let html = '<button class="cat-pill' + (!catActiva ? ' active' : '') + '" onclick="selectCat(null)">Todas</button>';
  for (const c of DATA.categorias) {
    const active = c.id === catActiva ? ' active' : '';
    html += '<button class="cat-pill' + active + '" onclick="selectCat(\\'' + c.id + '\\')">' + (c.icon ? c.icon + ' ' : '') + esc(c.nombre) + '</button>';
  }
  el.innerHTML = html;
}

function selectCat(id) {
  catActiva = id;
  renderCats();
  renderGrid();
}

// Grid
function renderGrid() {
  const prods = catActiva ? DATA.productos.filter(p => p.categoria === catActiva) : DATA.productos;
  const el = document.getElementById('grid');
  if (prods.length === 0) { el.innerHTML = '<div style="text-align:center;padding:60px;color:#666;grid-column:1/-1">No hay productos</div>'; return; }

  let html = '';
  for (const p of prods) {
    const ings = p.ingredientes || [];
    const preview = ings.slice(0, 5).map(i => i.emoji || i.nombre.slice(0, 8)).join(' ') + (ings.length > 5 ? ' ...' : '');
    const tags = p.tags || [];
    let badgesHtml = '';
    if (tags.includes('vegano')) badgesHtml += '<span class="badge">Vegano</span>';
    else if (tags.includes('vegetariano')) badgesHtml += '<span class="badge">Vegetariano</span>';
    if (tags.includes('popular')) badgesHtml += '<span class="badge popular">Popular</span>';
    if (tags.includes('picante')) badgesHtml += '<span class="badge picante">Picante</span>';
    if (tags.includes('premium')) badgesHtml += '<span class="badge premium">Premium</span>';
    if (tags.includes('nuevo')) badgesHtml += '<span class="badge nuevo">Nuevo</span>';

    const visual = p.imagen
      ? '<img src="' + esc(p.imagen) + '" alt="' + esc(p.nombre) + '" class="card-img" loading="lazy">'
      : '<span class="card-ph">' + (p.emoji || '${logoEmoji}') + '</span>';

    const desc = p.descripcion
      ? '<span class="card-desc">' + esc(p.descripcion) + '</span>'
      : (preview ? '<span class="card-ings">' + esc(preview) + '</span>' : '');

    html += '<div class="card" onclick="showDetail(\\'' + p.id + '\\')">' +
      '<div class="card-visual">' + visual + (badgesHtml ? '<div class="badges">' + badgesHtml + '</div>' : '') + '</div>' +
      '<div class="card-body"><span class="card-nombre">' + (p.emoji ? p.emoji + ' ' : '') + esc(p.nombre) + '</span>' + desc + '</div>' +
      '<div class="card-footer"><span class="card-precio">' + fmt(p.precio) + '</span>' +
      '<button class="card-add" onclick="event.stopPropagation();addToCart(\\'' + p.id + '\\')" title="Añadir">+</button></div></div>';
  }
  el.innerHTML = html;
}

// Detail
function showDetail(id) {
  detailProd = DATA.productos.find(p => p.id === id);
  if (!detailProd) return;
  const p = detailProd;

  const visualEl = document.getElementById('detail-visual');
  visualEl.innerHTML = (p.imagen
    ? '<img src="' + esc(p.imagen) + '" alt="' + esc(p.nombre) + '" style="width:100%;height:100%;object-fit:cover">'
    : '<span class="detail-ph">' + (p.emoji || '${logoEmoji}') + '</span>')
    + '<button class="close-btn" onclick="closeDetail()">✕</button>';

  const tags = p.tags || [];
  const TAG_COLORS = {vegano:'#22c55e',vegetariano:'#4ade80',picante:'#ef4444',popular:'${colorPrimario}',nuevo:'#3b82f6',premium:'#a855f7',especial:'#ec4899',clasico:'#6b7280'};
  let tagsHtml = '';
  for (const t of tags) {
    if (TAG_COLORS[t]) tagsHtml += '<span class="detail-tag" style="background:' + TAG_COLORS[t] + '">' + t + '</span>';
  }

  let ingsHtml = '';
  for (const i of (p.ingredientes || [])) {
    const cls = i.tipo ? ' ' + i.tipo : '';
    ingsHtml += '<span class="ing-chip' + cls + '">' + (i.emoji ? '<span style="font-size:.85rem">' + i.emoji + '</span>' : '') + '<span style="font-weight:500">' + esc(i.nombre) + '</span></span>';
  }

  document.getElementById('detail-content').innerHTML =
    '<div class="detail-header"><h2 class="detail-nombre">' + (p.emoji ? p.emoji + ' ' : '') + esc(p.nombre) + '</h2><span class="detail-precio">' + fmt(p.precio) + '</span></div>' +
    (tagsHtml ? '<div class="detail-tags">' + tagsHtml + '</div>' : '') +
    (p.descripcion ? '<p class="detail-desc">' + esc(p.descripcion) + '</p>' : '') +
    (ingsHtml ? '<h3 class="section-title">Ingredientes</h3><div class="ing-list">' + ingsHtml + '</div>' : '');

  document.getElementById('detail-footer').innerHTML =
    '<button class="btn btn-primary" onclick="addToCart(\\'' + p.id + '\\');closeDetail()">Añadir ' + fmt(p.precio) + '</button>';

  document.getElementById('detail-overlay').classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
  detailProd = null;
}

// Cart
function addToCart(id) {
  const p = DATA.productos.find(x => x.id === id);
  if (!p) return;
  cart.push({ _id: ++cartId, id: p.id, nombre: p.nombre, precio: p.precio, qty: 1 });
  updateCart();
  showUpsell(p);
}

// ─── Upsell Engine ───
let upsellTimer = null;
let upsellProd = null;
let lastUpsellIds = [];

function getUpsellFor(addedProduct) {
  // Build list of IDs already in cart
  var cartIds = cart.map(function(i) { return i.id; });
  // Don't repeat recent upsells
  var exclude = cartIds.concat(lastUpsellIds);

  var candidates = [];
  var addedCat = addedProduct.categoria;

  // Strategy 1: different category (cross-sell: pizza → bebida, etc.)
  var crossCat = DATA.productos.filter(function(p) {
    return p.categoria !== addedCat && exclude.indexOf(p.id) === -1;
  });
  if (crossCat.length > 0) {
    // Prefer popular items from other categories
    var popular = crossCat.filter(function(p) { return (p.tags || []).indexOf('popular') !== -1; });
    candidates = popular.length > 0 ? popular : crossCat;
  } else {
    // Strategy 2: same category (suggest variety)
    var sameCat = DATA.productos.filter(function(p) {
      return p.id !== addedProduct.id && exclude.indexOf(p.id) === -1;
    });
    // Prefer popular or similarly priced
    var popular = sameCat.filter(function(p) { return (p.tags || []).indexOf('popular') !== -1; });
    if (popular.length > 0) {
      candidates = popular;
    } else {
      // Similar price range (±30%)
      var minP = addedProduct.precio * 0.7;
      var maxP = addedProduct.precio * 1.3;
      var similar = sameCat.filter(function(p) { return p.precio >= minP && p.precio <= maxP; });
      candidates = similar.length > 0 ? similar : sameCat;
    }
  }

  if (candidates.length === 0) return null;
  // Pick random from candidates
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function showUpsell(addedProduct) {
  dismissUpsell();
  var suggestion = getUpsellFor(addedProduct);
  if (!suggestion) return;

  upsellProd = suggestion;
  lastUpsellIds.push(suggestion.id);
  if (lastUpsellIds.length > 5) lastUpsellIds.shift();

  document.getElementById('upsell-name').textContent = (suggestion.emoji ? suggestion.emoji + ' ' : '') + suggestion.nombre;
  document.getElementById('upsell-price').textContent = fmt(suggestion.precio);

  var toast = document.getElementById('upsell-toast');
  toast.classList.add('show');

  // Auto-dismiss after 5 seconds
  upsellTimer = setTimeout(function() { dismissUpsell(); }, 5000);
}

function acceptUpsell() {
  if (!upsellProd) return;
  addToCartSilent(upsellProd.id);
  dismissUpsell();
}

function addToCartSilent(id) {
  // Add without triggering another upsell
  var p = DATA.productos.find(function(x) { return x.id === id; });
  if (!p) return;
  cart.push({ _id: ++cartId, id: p.id, nombre: p.nombre, precio: p.precio, qty: 1 });
  updateCart();
}

function dismissUpsell() {
  if (upsellTimer) { clearTimeout(upsellTimer); upsellTimer = null; }
  upsellProd = null;
  document.getElementById('upsell-toast').classList.remove('show');
}

function updateCart() {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const total = cart.reduce((s, i) => s + i.precio * i.qty, 0);

  // FAB
  const fab = document.getElementById('fab');
  fab.classList.toggle('show', count > 0);
  document.getElementById('fab-count').textContent = count;
  document.getElementById('fab-total').textContent = fmt(total);

  // Cart items
  const el = document.getElementById('cart-items');
  if (cart.length === 0) {
    el.innerHTML = '<div class="empty"><span class="empty-ico">🛒</span><p>Tu carrito está vacío</p></div>';
    document.getElementById('cart-footer').style.display = 'none';
    return;
  }

  let html = '';
  for (const item of cart) {
    html += '<div class="cart-item"><div class="ci-info"><span class="ci-name">' + esc(item.nombre) + '</span></div>' +
      '<div class="ci-ctrl"><div class="qty"><button onclick="changeQty(' + item._id + ',-1)">-</button><span>' + item.qty + '</span><button onclick="changeQty(' + item._id + ',1)">+</button></div>' +
      '<span class="ci-sub">' + fmt(item.precio * item.qty) + '</span></div></div>';
  }
  el.innerHTML = html;

  const footer = document.getElementById('cart-footer');
  footer.style.display = 'block';
  const waBtn = CONFIG.whatsapp_telefono
    ? '<button class="btn-wa" onclick="sendWhatsApp()">WhatsApp</button>'
    : '<button class="btn-share" onclick="shareOrder()">Enviar pedido</button>';
  footer.innerHTML = '<div class="total-row"><span class="total-label">Total</span><span class="total-amount">' + fmt(total) + '</span></div>' +
    '<div class="cart-actions"><button class="btn-clear" onclick="clearCart()">Vaciar</button><button class="btn-share" onclick="shareOrder()">Compartir</button>' + waBtn + '</div>';
}

function changeQty(cid, delta) {
  const idx = cart.findIndex(i => i._id === cid);
  if (idx === -1) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  updateCart();
}

function clearCart() {
  cart = [];
  updateCart();
  toggleCart();
}

function toggleCart() {
  document.getElementById('cart-overlay').classList.toggle('open');
}

function buildOrderMsg() {
  if (cart.length === 0) return '';
  let msg = CONFIG.mensaje_header + '\\n\\n';
  for (const item of cart) {
    msg += item.qty + 'x ' + item.nombre + ' (' + fmt(item.precio * item.qty) + ')\\n';
  }
  const total = cart.reduce((s, i) => s + i.precio * i.qty, 0);
  msg += '\\nTotal: ' + fmt(total);
  return msg;
}

function sendWhatsApp() {
  const msg = buildOrderMsg();
  if (!msg) return;
  window.open('https://wa.me/' + CONFIG.whatsapp_telefono + '?text=' + encodeURIComponent(msg), '_blank');
}

function shareOrder() {
  const msg = buildOrderMsg();
  if (!msg) return;
  if (navigator.share) {
    navigator.share({ title: 'Mi pedido — ' + CONFIG.nombre_negocio, text: msg }).catch(function(){});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(msg);
    alert('Pedido copiado al portapapeles');
  }
}

// ─── Chat & AI Assistant ───
const SYSTEM_PROMPT = ${systemPromptJSON};
let chatMsgs = [];
let chatOpen = false;
let chatReady = CONFIG.chat_enabled && CONFIG.ai_endpoint;
let isRecording = false;
let recognition = null;
let speechSynth = window.speechSynthesis || null;

// Show chat FAB only if AI is configured
function initChat() {
  if (!chatReady) return;
  document.getElementById('chat-fab').classList.add('show');
  // Quick suggestion buttons
  const quickEl = document.getElementById('chat-quick');
  const suggestions = ['¿Qué me recomiendas?', 'Algo sin carne', 'Lo más popular', '¿Tenéis ofertas?'];
  quickEl.innerHTML = suggestions.map(function(s) {
    return '<button onclick="sendQuick(this,\\'' + s.replace(/'/g, "\\\\'") + '\\')">' + s + '</button>';
  }).join('');
  // Welcome message
  addBotMsg('¡Hola! 👋 Soy el asistente de ' + CONFIG.nombre_negocio + '. Puedo ayudarte a elegir del menú o hacer tu pedido. ¿Qué te apetece?');
}

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-overlay').classList.toggle('open', chatOpen);
  if (chatOpen) {
    setTimeout(function() { document.getElementById('chat-input').focus(); }, 300);
  }
}

function addBotMsg(text) {
  chatMsgs.push({ role: 'assistant', content: text });
  renderChatMsgs();
}

function addUserMsg(text) {
  chatMsgs.push({ role: 'user', content: text });
  renderChatMsgs();
}

function renderChatMsgs() {
  var el = document.getElementById('chat-msgs');
  var html = '';
  for (var i = 0; i < chatMsgs.length; i++) {
    var m = chatMsgs[i];
    var cls = m.role === 'user' ? 'user' : 'bot';
    html += '<div class="chat-msg ' + cls + '">' + esc(m.content) + '</div>';
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function showTyping() {
  var el = document.getElementById('chat-msgs');
  el.innerHTML += '<div class="chat-msg bot" id="typing"><span class="typing"><span></span><span></span><span></span></span></div>';
  el.scrollTop = el.scrollHeight;
}

function hideTyping() {
  var t = document.getElementById('typing');
  if (t) t.remove();
}

function sendQuick(btn, text) {
  btn.style.display = 'none';
  sendMessage(text);
}

function sendChat() {
  var input = document.getElementById('chat-input');
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  sendMessage(text);
}

function sendMessage(text) {
  addUserMsg(text);
  document.getElementById('chat-send').disabled = true;
  document.getElementById('chat-status').textContent = 'Escribiendo...';
  showTyping();

  // Build messages array for AI (include system prompt + history, keep last 20 msgs)
  var aiMsgs = [{ role: 'system', content: SYSTEM_PROMPT }];
  var history = chatMsgs.slice(-20);
  for (var i = 0; i < history.length; i++) {
    aiMsgs.push({ role: history[i].role, content: history[i].content });
  }

  fetch(CONFIG.ai_endpoint + (CONFIG.ai_chat_path || '/modules/ai-gateway/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: aiMsgs, provider: CONFIG.ai_provider || 'auto' })
  })
  .then(function(res) { return res.json(); })
  .then(function(json) {
    hideTyping();
    document.getElementById('chat-send').disabled = false;
    document.getElementById('chat-status').textContent = 'En línea';
    var reply = (json.data && json.data.content) || 'Lo siento, no he podido responder. Intenta de nuevo.';
    // Check if AI included an order JSON
    var orderMatch = reply.match(/\\{"pedido"\\s*:\\s*\\[.*?\\]\\}/s);
    if (orderMatch) {
      try {
        var orderData = JSON.parse(orderMatch[0]);
        if (orderData.pedido && orderData.pedido.length > 0) {
          applyAIOrder(orderData.pedido);
          reply = reply.replace(orderMatch[0], '').trim();
          if (!reply) reply = '¡Pedido añadido al carrito! Puedes revisarlo y enviarlo por WhatsApp.';
          else reply += '\\n\\n✅ ¡Añadido al carrito!';
        }
      } catch(e) {}
    }
    addBotMsg(reply);
    // Voice output
    if (speechSynth && isRecording) speakText(reply);
  })
  .catch(function(err) {
    hideTyping();
    document.getElementById('chat-send').disabled = false;
    document.getElementById('chat-status').textContent = 'En línea';
    addBotMsg('No puedo conectar con el asistente ahora. ¿Probamos luego?');
  });
}

function applyAIOrder(items) {
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var prod = DATA.productos.find(function(p) { return p.id === item.id; });
    if (prod) {
      var qty = item.qty || 1;
      for (var q = 0; q < qty; q++) {
        cart.push({ _id: ++cartId, id: prod.id, nombre: prod.nombre, precio: prod.precio, qty: 1 });
      }
    }
  }
  // Merge same items
  var merged = {};
  for (var j = 0; j < cart.length; j++) {
    var c = cart[j];
    if (merged[c.id]) { merged[c.id].qty += c.qty; }
    else { merged[c.id] = Object.assign({}, c); }
  }
  cart = Object.values(merged);
  updateCart();
}

// ─── Voice Input (Web Speech API) ───
function initVoice() {
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    document.getElementById('chat-mic').style.display = 'none';
    return;
  }
  recognition = new SpeechRec();
  recognition.lang = 'es-ES';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = function(e) {
    var transcript = e.results[0][0].transcript;
    if (transcript) {
      document.getElementById('chat-input').value = transcript;
      sendChat();
    }
    stopVoice();
  };
  recognition.onerror = function() { stopVoice(); };
  recognition.onend = function() { stopVoice(); };
}

function toggleVoice() {
  if (isRecording) { stopVoice(); }
  else { startVoice(); }
}

function startVoice() {
  if (!recognition) return;
  isRecording = true;
  document.getElementById('chat-mic').classList.add('recording');
  document.getElementById('chat-status').textContent = '🎤 Escuchando...';
  try { recognition.start(); } catch(e) {}
}

function stopVoice() {
  isRecording = false;
  document.getElementById('chat-mic').classList.remove('recording');
  document.getElementById('chat-status').textContent = 'En línea';
  try { recognition.stop(); } catch(e) {}
}

// ─── Voice Output (SpeechSynthesis) ───
function speakText(text) {
  if (!speechSynth) return;
  speechSynth.cancel();
  var utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'es-ES';
  utt.rate = 1.05;
  utt.pitch = 1;
  speechSynth.speak(utt);
}

// Init
initChat();
initVoice();
renderCats();
renderGrid();
updateCart();

// PWA: register SW if available
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(function(){});
}
</script>
</body>
</html>`;
}

/**
 * Generate a minimal service worker for offline caching.
 * Uses relative paths (./) so it works in any subdirectory (GitHub Pages, etc.)
 */
function generateServiceWorker(nombre_negocio) {
  return `const CACHE = '${slugify(nombre_negocio)}-v1';
const ASSETS = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    })).catch(() => caches.match(self.registration.scope))
  );
});
`;
}

/**
 * Generate PWA manifest.json
 * Uses relative start_url (".") so it works in any subdirectory (GitHub Pages, etc.)
 */
function generateManifest(nombre_negocio, colorPrimario, colorFondo) {
  return JSON.stringify({
    name: nombre_negocio + ' — Carta Digital',
    short_name: nombre_negocio,
    description: `Carta digital de ${nombre_negocio}`,
    start_url: '.',
    display: 'standalone',
    background_color: colorFondo || '#0a0a0a',
    theme_color: colorPrimario || '#f59e0b',
    icons: [
      { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
      { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' }
    ]
  }, null, 2);
}

/**
 * Generate SVG icon for PWA (works without image processing dependencies)
 */
function generateIcon(size, emoji, colorPrimario, colorFondo) {
  const fontSize = Math.round(size * 0.55);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="${colorFondo || '#0a0a0a'}"/>
  <circle cx="${size/2}" cy="${size/2}" r="${Math.round(size * 0.35)}" fill="${colorPrimario || '#f59e0b'}" opacity="0.15"/>
  <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}">${emoji || '\u{1F355}'}</text>
</svg>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slugify(text) {
  if (!text) return 'carta';
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'carta';
}

module.exports = { generateStaticHTML, generateServiceWorker, generateManifest, generateIcon, escapeHtml, slugify };
