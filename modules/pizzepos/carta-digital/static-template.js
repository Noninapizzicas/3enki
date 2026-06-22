/**
 * Static Template Generator for Carta Digital
 *
 * Generates a self-contained HTML file with all product data,
 * cart logic, and WhatsApp integration embedded.
 * No backend or network connection needed.
 *
 * Output: Single HTML file deployable to GitHub Pages, Netlify, etc.
 *
 * DISEÑO POR PROYECTO: el RUNTIME (carrito/pedido/chat) es fijo y compartido; el LOOK
 * (card_template + tema_css) lo compone ENKI por proyecto (cajón diseñar_carta_digital)
 * y se inyecta via options.diseno. Se acoplan por el CONTRATO de slots: el card_template
 * trae placeholders {{...}} + data-accion (detalle|add) + data-producto-id; el runtime
 * rellena los slots y delega los clics por data-accion. Sin diseño → semilla inmersiva.
 */

// Semilla inmersiva: card foto-hero, descripción delante, gancho acento. Es lo que el
// diseñador web produce por defecto; Enki la reemplaza por la suya por proyecto.
const DEFAULT_CARD_TEMPLATE = [
  '<article class="dish" data-producto-id="{{id}}" data-accion="detalle">',
  '  <div class="dish-photo">{{visual}}<div class="dish-badges">{{gancho}}{{badges}}</div></div>',
  '  <div class="dish-body">',
  '    <div class="dish-head"><h3 class="dish-name">{{nombre}}</h3><span class="dish-price">{{precio}}</span></div>',
  '    <p class="dish-desc">{{descripcion}}</p>',
  '    {{alergenos}}',
  '    <button class="dish-add" data-accion="add" data-producto-id="{{id}}" aria-label="{{add_label}}">Añadir</button>',
  '  </div>',
  '</article>'
].join('\n');

function generateStaticHTML(carta, config, options = {}) {
  const {
    nombre_negocio = config.nombre_negocio || 'Pizzicas',
    moneda = config.moneda || '€',
    whatsapp_telefono = config.whatsapp_telefono || '',
    mensaje_header = config.mensaje_header || '¡Hola! Quiero pedir:',
    // Slug del proyecto: se hornea para que el mensaje wa.me lleve la cabecera
    // canónica "PEDIDO <slug>-<NONCE>" que el whatsapp-bot (parser) entiende.
    project_slug = config.project_slug || '',
    // Base href absoluta del bundle (ALOJADO: '/shop/<slug>/'). Resuelve los assets relativos
    // (img/·manifest·sw·iconos) aunque se abra la URL SIN barra final (/shop/<slug> → si no,
    // el navegador resolvería img/ contra /shop/ y daría 404). SUELTO (raíz) no la setea.
    base_href = config.base_href || '',
    tema = config.tema || {},
    lang = 'es',
    // CHAT IA — el cerebro es el cf-worker (Cloudflare + DeepSeek), del escenario SUELTO
    // (export-cli + cf-worker/deploy.js). El worker hornea el SYSTEM_PROMPT y la API key
    // server-side; la PWA solo le hace POST <ai_endpoint>/chat con SSE. NO hay cerebro en
    // el core: ai-gateway habla MQTT (turnos), no sirve HTTP-SSE para clientes anónimos.
    // El chat se enciende SOLO si se configura ai_endpoint = URL del worker. En ALOJADO
    // (publicar → /shop/<slug>) no se setea → chat OFF por diseño (autoservicio puro).
    ai_endpoint = config.ai_endpoint || '',
    ai_provider = config.ai_provider || 'auto',
    ai_chat_path = config.ai_chat_path || '/chat',
    chat_enabled = config.chat_enabled !== false && !!ai_endpoint,
    // Endpoint de pedido online (tienda-api). Si está → la PWA hace POST (escenario
    // ALOJADO: VPS+dominio). Si NO → checkout por WhatsApp (escenario PWA suelta).
    pedido_endpoint = config.pedido_endpoint || '',
    // Pago online: si el proyecto tiene pasarela, ofrece "Pagar ahora" (además de recoger).
    pago_online = config.pago_online === true
  } = options;

  // DISEÑO por proyecto (lo compone Enki): card_template + tema_css. Si no hay → semilla.
  const diseno = options.diseno || config.diseno || {};
  const cardTemplate = (diseno && typeof diseno.card_template === 'string' && diseno.card_template.trim())
    ? diseno.card_template : DEFAULT_CARD_TEMPLATE;
  const disenoCss = (diseno && typeof diseno.tema_css === 'string') ? diseno.tema_css : '';

  const colorPrimario = tema.color_primario || '#f59e0b';
  const colorFondo = tema.color_fondo || '#0a0a0a';
  const colorTexto = tema.color_texto || '#e5e5e5';
  const logoEmoji = tema.logo_emoji || '🍕';

  // Prepare data
  const categorias = (carta.categorias || []).map(c => ({
    id: c.id, nombre: c.nombre, orden: c.orden, icon: c.icon || null
  }));

  const imgs = Array.isArray(carta.productos) ? carta.productos : [];
  const productos = imgs.map(p => {
    const principal = Array.isArray(p.imagenes) ? (p.imagenes.find(im => im.principal) || p.imagenes[0]) : null;
    return {
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      precio: p.precio,
      descripcion: p.descripcion || null,
      emoji: p.emoji || null,
      tags: p.tags || [],
      imagen: p.imagen || null,
      // Texto alternativo accesible (WCAG 1.1.1): el alt que puso el usuario en
      // contenido, o el nombre del producto como fallback.
      imagen_alt: (principal && principal.alt) ? principal.alt : (p.nombre || ''),
      // Alérgenos canónicos (1169/2011) ya normalizados por la proyección.
      alergenos: Array.isArray(p.alergenos) ? p.alergenos : [],
      gancho: p.gancho || null,   // reclamo del marketing (etiqueta corta)
      ingredientes: (p.ingredientes || []).map(i => ({
        nombre: i.nombre, emoji: i.emoji || null, tipo: i.tipo || null,
        precio_extra: i.precio_extra ?? null
      }))
    };
  });
  // Leyenda de alérgenos presentes (id/nombre/emoji), de la proyección.
  const alergenosLeyenda = Array.isArray(carta.alergenos_leyenda) ? carta.alergenos_leyenda : [];
  // Catálogo de extras añadibles (ya viene gateado a precio_extra>0 desde index.js).
  const catalogoIngredientes = Array.isArray(carta.catalogo_ingredientes) ? carta.catalogo_ingredientes : [];

  const dataJSON = JSON.stringify({ categorias, productos, alergenos_leyenda: alergenosLeyenda, catalogo_ingredientes: catalogoIngredientes });
  const configJSON = JSON.stringify({
    nombre_negocio, moneda, whatsapp_telefono, mensaje_header, project_slug,
    ai_endpoint, ai_provider, ai_chat_path, chat_enabled, pedido_endpoint, pago_online
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
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${base_href ? '<base href="' + escapeHtml(base_href) + '">\n' : ''}<meta name="theme-color" content="${colorFondo}">
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
.card-visual{position:relative;width:100%;aspect-ratio:1/1;background:#1a1a1a;display:flex;align-items:center;justify-content:center;overflow:hidden}
.card-img{width:100%;height:100%;object-fit:cover}
.card-ph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:linear-gradient(135deg,#1a1a1a,#222);font-size:2.5rem;opacity:.6}
.badges{position:absolute;top:6px;left:6px;display:flex;gap:4px}
.badge{padding:2px 6px;border-radius:4px;background:rgba(34,197,94,.85);color:#fff;font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.badge.gancho{background:var(--primary);text-transform:none;letter-spacing:0;font-size:.55rem}
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
/* Grupo por familia (espeja .tipo-section del comandero VariacionesPanel): barra de color a la
   izquierda + cabecera con el color de la familia (var --fam la pone el helper por grupo). */
.ing-group{margin-bottom:14px;border-left:3px solid var(--fam,#444);padding-left:12px}
.ing-group-head{display:flex;align-items:center;gap:6px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--fam,#888);margin:0 0 8px}
.ing-group-count{color:#666;font-weight:400}
.ing-group .ing-list{margin-bottom:0}
.ing-list{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
/* Botón de ingrediente: tamaño del comandero (.chip → padding 8px 12px) en vez de píldora fina. */
.ing-chip{display:flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid #2a2a2a;border-radius:12px;background:#1a1a1a;font-size:.8rem;color:#ccc}
/* En un grupo, el chip de añadir hereda el color de la familia (borde tenue + estado added). */
.ing-group .ing-add{border-color:color-mix(in srgb,var(--fam) 28%,#2a2a2a)}
.ing-group .ing-add.added{border-color:var(--fam);background:color-mix(in srgb,var(--fam) 16%,transparent);color:var(--fam)}
/* Alérgenos (1169/2011) */
.card-alerg{font-size:.95rem;letter-spacing:2px;margin-top:4px;line-height:1}
.alerg-list{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.alerg-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid #6b4a00;border-radius:20px;background:#241c08;font-size:.78rem;color:#f5d99a}
.alerg-aviso{font-size:.72rem;color:var(--text-mid,#888);margin:6px 0 0;line-height:1.4}
/* Accesibilidad (WCAG 2.1 AA) */
.skip-link{position:absolute;left:-9999px;top:0;z-index:1000;background:var(--primary,#f59e0b);color:#000;padding:10px 16px;border-radius:0 0 8px 0;font-weight:600}
.skip-link:focus{left:0}
:focus-visible{outline:3px solid var(--primary,#f59e0b);outline-offset:2px}
@media (prefers-reduced-motion: reduce){*{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
.ing-chip.queso{border-color:rgba(250,204,21,.25)}.ing-chip.carne{border-color:rgba(239,68,68,.2)}.ing-chip.verdura{border-color:rgba(34,197,94,.2)}.ing-chip.marisco{border-color:rgba(59,130,246,.2)}
.ing-removable{font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .12s}
.ing-chip.removed{border-color:#ef4444;background:rgba(239,68,68,.15);color:#ef4444;text-decoration:line-through}
.ing-add{font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .12s}
.ing-chip.added{border-color:#22c55e;background:rgba(34,197,94,.15);color:#22c55e}
.ing-add-price{font-size:.65rem;color:#888;margin-left:2px}.ing-chip.added .ing-add-price{color:#22c55e}
.dish-special{cursor:pointer;border:1px dashed var(--primary);background:rgba(245,158,11,.06)}
/* Preview de las dos mitades (espeja .pizza-preview del MitadMitadPanel del comandero) */
.mitad-preview{display:flex;align-items:stretch;justify-content:center;gap:8px;margin:12px 0}
.mitad-box{flex:1;max-width:150px;min-height:84px;padding:14px 10px;border:2px dashed #444;border-radius:12px;background:#1a1a1a;color:#777;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;position:relative;-webkit-tap-highlight-color:transparent;transition:all .15s}
.mitad-box.active{border-style:solid;border-color:#8b5cf6;background:rgba(139,92,246,.1);color:#cbb6ff}
.mitad-box.selected{border-style:solid;border-color:#22c55e;background:rgba(34,197,94,.1);color:#fff}
.mitad-box-emoji{font-size:1.8rem;line-height:1}
.mitad-box-ph{font-size:1.4rem;opacity:.6}
.mitad-box-nombre{font-size:.78rem;font-weight:600;text-align:center;line-height:1.2}
.mitad-box-label{font-size:.66rem;text-transform:uppercase;letter-spacing:.5px}
.mitad-box-mods{font-size:.6rem;color:#22c55e;line-height:1.2;text-align:center}
.mitad-box-clear{position:absolute;top:6px;right:6px;width:18px;height:18px;background:#ef4444;border-radius:50%;font-size:.6rem;display:flex;align-items:center;justify-content:center;color:#fff}
.mitad-div{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#8b5cf6;font-size:1rem}
.mitad-div-line{width:2px;height:18px;background:#444}
.mitad-precio{display:flex;align-items:center;justify-content:center;gap:6px;margin:12px 0;padding:10px;background:rgba(34,197,94,.1);border-radius:8px;font-size:.85rem;color:#888}
.mitad-precio strong{font-size:1.15rem;font-weight:800;color:#22c55e}
/* Selector de lado activo (espeja .lado-selector del comandero) */
.mitad-lados{display:flex;gap:8px;margin:12px 0}
.mitad-lado{flex:1;padding:10px;border:1px solid #333;border-radius:8px;background:#222;color:#888;font:inherit;font-size:.75rem;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .15s}
.mitad-lado.active{background:rgba(139,92,246,.2);border-color:#8b5cf6;color:#b69bff}
/* Grid 2-col de botones partidos (espeja .pizzas-grid del comandero) */
.mitad-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:4px}
.mitad-pick{display:flex;align-items:stretch;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden;background:#1a1a1a}
.mitad-pick-main{flex:1;display:inline-flex;align-items:center;flex-wrap:wrap;gap:4px;padding:10px 12px;border:none;background:transparent;color:#ccc;font:inherit;font-size:.8rem;cursor:pointer;text-align:left;-webkit-tap-highlight-color:transparent}
.mitad-pick-name{font-weight:600}
.mitad-pick-main:active{background:rgba(245,158,11,.12)}
.mitad-pick-var{border:none;border-left:1px solid #2a2a2a;background:transparent;color:var(--primary);font-size:1rem;padding:0 12px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.mitad-pick-var:active{background:rgba(245,158,11,.18)}
@media (max-width:400px){.mitad-box{max-width:120px;padding:12px 8px;min-height:76px}.mitad-box-emoji{font-size:1.5rem}}
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
.btn-wa:disabled{opacity:.6;cursor:not-allowed}
.cart-nombre{width:100%;box-sizing:border-box;margin:8px 0;padding:10px 12px;border:1px solid #333;border-radius:10px;background:#111;color:var(--text);font-size:.85rem}
.cart-nombre:focus{outline:none;border-color:var(--primary)}
.pedido-ok{text-align:center;padding:24px 16px}
.pedido-ok-check{font-size:2.5rem;line-height:1}
.pedido-ok h3{margin:12px 0 4px;font-size:1.1rem}
.pedido-ok p{color:var(--text-mid,#888);font-size:.85rem;margin:0 0 12px}
.pedido-codigo{font-size:1.8rem;font-weight:800;letter-spacing:4px;color:var(--primary);background:#111;border:2px dashed var(--primary);border-radius:12px;padding:14px;margin:0 auto 16px;display:inline-block}
.btn-wa:active{background:#1da851}
.empty{text-align:center;padding:40px 20px;color:#555}
.empty-ico{font-size:2.5rem;display:block;margin-bottom:8px}
.btn-repeat{margin-top:12px;padding:10px 20px;border:1px solid var(--primary);border-radius:10px;background:rgba(245,158,11,.1);color:var(--primary);font-size:.8rem;font-weight:600;cursor:pointer;transition:background .15s}
.btn-repeat:active{background:rgba(245,158,11,.25)}


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
.stream-cursor{display:inline-block;width:2px;height:1em;background:var(--primary);margin-left:2px;vertical-align:text-bottom;animation:blink .6s step-end infinite}
#stream-bubble{min-height:1.4em;white-space:pre-wrap}
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
/* ── Carta INMERSIVA (semilla) — navegación relajada, foto-hero, descripción delante ── */
.content{max-width:760px;margin:0 auto}
.grid{display:grid;grid-template-columns:1fr;gap:22px}
@media(min-width:720px){.grid{grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:26px}}
.dish{display:flex;flex-direction:column;background:var(--bg-card);border:1px solid var(--border);border-radius:18px;overflow:hidden;cursor:pointer;transition:transform .12s,border-color .15s;-webkit-tap-highlight-color:transparent}
.dish:active{transform:scale(.99)}
.dish-photo{position:relative;width:100%;aspect-ratio:16/10;background:#1a1a1a;display:flex;align-items:center;justify-content:center;overflow:hidden}
.dish-photo img{width:100%;height:100%;object-fit:cover}
.dish-photo .ph{font-size:3rem;opacity:.5}
.dish-badges{position:absolute;top:10px;left:10px;display:flex;gap:5px;flex-wrap:wrap}
.dish-body{padding:16px 16px 18px;display:flex;flex-direction:column;gap:9px}
.dish-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.dish-name{margin:0;font-size:1.15rem;font-weight:700;line-height:1.2}
.dish-price{font-size:1.2rem;font-weight:800;color:var(--primary);white-space:nowrap;font-variant-numeric:tabular-nums}
.dish-desc{margin:0;font-size:.9rem;color:var(--text-mid);line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dish-desc:empty{display:none}
.dish-add{align-self:flex-start;margin-top:2px;padding:9px 20px;border:none;border-radius:22px;background:var(--primary);color:#000;font-weight:700;font-size:.85rem;cursor:pointer;-webkit-tap-highlight-color:transparent}
.dish-add:active{filter:brightness(1.1)}
/* ── tema por proyecto (lo compone Enki; sobreescribe la semilla) ── */
${disenoCss}
</style>
</head>
<body>
<a href="#contenido" class="skip-link">Saltar al contenido</a>
<!-- Header -->
<header class="header">
  <div class="brand">
    <span class="brand-name">${escapeHtml(nombre_negocio)}</span>
    <span class="brand-sub">Carta Digital</span>
  </div>
</header>

<!-- Categories -->
<nav class="cats" id="cats" aria-label="Categorías"></nav>

<!-- Grid -->
<main class="content" id="contenido">
  <div class="grid" id="grid" role="list" aria-label="Productos"></div>
</main>

<!-- Cart FAB -->
<button class="fab" id="fab" onclick="toggleCart()" aria-label="Ver carrito">
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
      <span class="cart-title" id="cart-title">Tu pedido</span>
      <button class="close-btn" onclick="toggleCart()" aria-label="Cerrar carrito">✕</button>
    </header>
    <div class="cart-items" id="cart-items"></div>
    <div class="cart-footer" id="cart-footer" style="display:none"></div>
  </div>
</div>

<!-- Chat widget -->
<button class="chat-fab" id="chat-fab" onclick="asistente()" title="Asistente" aria-label="Abrir asistente">💬</button>
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
      <button class="close-btn" onclick="toggleChat()" aria-label="Cerrar asistente">✕</button>
    </div>
    <div class="chat-msgs" id="chat-msgs"></div>
    <div class="chat-quick" id="chat-quick"></div>
    <div class="chat-input-row">
      <button class="chat-btn chat-btn-mic" id="chat-mic" onclick="toggleVoice()" title="Hablar" aria-label="Hablar por voz">🎤</button>
      <textarea class="chat-input" id="chat-input" rows="1" placeholder="Escribe tu mensaje..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat()}"></textarea>
      <button class="chat-btn chat-btn-send" id="chat-send" onclick="sendChat()" title="Enviar" aria-label="Enviar mensaje">➤</button>
    </div>
  </div>
</div>

<script>
// Data — embedded at build time
const DATA = ${dataJSON};
const CONFIG = ${configJSON};
const CARD_TEMPLATE = ${JSON.stringify(cardTemplate)};
const MONEDA = '${escapeHtml(moneda)}';

// i18n — auto-detect language
var TRANSLATIONS = {
  es: { cart_title:'Tu pedido', cart_empty:'Tu carrito está vacío', add:'Añadir', total:'Total', clear:'Vaciar', share:'Compartir', no_products:'No hay productos', offers:'Ofertas', add_upsell:'+ Añadir', chat_placeholder:'Escribe tu mensaje...', chat_welcome:'¡Hola! 👋 Soy el asistente de {name}. Puedo ayudarte a elegir del menú o hacer tu pedido. ¿Qué te apetece?', q1:'¿Qué me recomiendas?', q2:'Algo sin carne', q3:'Lo más popular', q4:'¿Tenéis ofertas?', order_added:'¡Pedido añadido al carrito! Puedes revisarlo y enviarlo por WhatsApp.', added_suffix:'✅ ¡Añadido al carrito!', chat_error:'No puedo conectar con el asistente ahora. ¿Probamos luego?', repeat_order:'Repetir último pedido', combo:'Combo', offer:'Oferta', save:'Ahorra', reviews:'Reseñas', write_review:'Escribir reseña', your_name:'Tu nombre', your_comment:'¿Qué te ha parecido? (opcional)', send_review:'Enviar', cancel:'Cancelar', review_thanks:'¡Gracias por tu reseña!', review_exists:'Ya has dejado una reseña', reviews_label:'reseñas' },
  en: { cart_title:'Your order', cart_empty:'Your cart is empty', add:'Add', total:'Total', clear:'Clear', share:'Share', no_products:'No products', offers:'Offers', add_upsell:'+ Add', chat_placeholder:'Type your message...', chat_welcome:'Hi! 👋 I\\'m the {name} assistant. I can help you choose from our menu or place your order. What do you fancy?', q1:'What do you recommend?', q2:'Something without meat', q3:'Most popular', q4:'Any offers?', order_added:'Order added to cart! Review and send via WhatsApp.', added_suffix:'✅ Added to cart!', chat_error:'Cannot connect to the assistant right now. Try again later?', repeat_order:'Repeat last order', combo:'Combo', offer:'Offer', save:'Save', reviews:'Reviews', write_review:'Write a review', your_name:'Your name', your_comment:'How was it? (optional)', send_review:'Send', cancel:'Cancel', review_thanks:'Thanks for your review!', review_exists:'You already left a review', reviews_label:'reviews' },
  fr: { cart_title:'Votre commande', cart_empty:'Votre panier est vide', add:'Ajouter', total:'Total', clear:'Vider', share:'Partager', no_products:'Pas de produits', offers:'Offres', add_upsell:'+ Ajouter', chat_placeholder:'Écrivez votre message...', chat_welcome:'Bonjour! 👋 Je suis l\\'assistant de {name}. Je peux vous aider à choisir ou passer commande. Qu\\'est-ce qui vous ferait plaisir?', q1:'Que recommandez-vous?', q2:'Sans viande', q3:'Les plus populaires', q4:'Des offres?', order_added:'Commande ajoutée au panier! Vérifiez et envoyez par WhatsApp.', added_suffix:'✅ Ajouté au panier!', chat_error:'Impossible de se connecter. Réessayez plus tard?', repeat_order:'Répéter la commande', combo:'Combo', offer:'Offre', save:'Économie', reviews:'Avis', write_review:'Écrire un avis', your_name:'Votre nom', your_comment:'Votre avis (facultatif)', send_review:'Envoyer', cancel:'Annuler', review_thanks:'Merci pour votre avis!', review_exists:'Vous avez déjà laissé un avis', reviews_label:'avis' },
  de: { cart_title:'Ihre Bestellung', cart_empty:'Ihr Warenkorb ist leer', add:'Hinzufügen', total:'Gesamt', clear:'Leeren', share:'Teilen', no_products:'Keine Produkte', offers:'Angebote', add_upsell:'+ Hinzufügen', chat_placeholder:'Nachricht schreiben...', chat_welcome:'Hallo! 👋 Ich bin der Assistent von {name}. Ich kann Ihnen bei der Auswahl helfen. Was möchten Sie?', q1:'Was empfehlen Sie?', q2:'Etwas ohne Fleisch', q3:'Am beliebtesten', q4:'Gibt es Angebote?', order_added:'Bestellung zum Warenkorb hinzugefügt! Per WhatsApp senden.', added_suffix:'✅ Zum Warenkorb!', chat_error:'Verbindung nicht möglich. Später versuchen?', repeat_order:'Letzte Bestellung', combo:'Combo', offer:'Angebot', save:'Sparen', reviews:'Bewertungen', write_review:'Bewertung schreiben', your_name:'Ihr Name', your_comment:'Wie war es? (optional)', send_review:'Senden', cancel:'Abbrechen', review_thanks:'Danke für Ihre Bewertung!', review_exists:'Sie haben bereits bewertet', reviews_label:'Bewertungen' },
  it: { cart_title:'Il tuo ordine', cart_empty:'Il carrello è vuoto', add:'Aggiungi', total:'Totale', clear:'Svuota', share:'Condividi', no_products:'Nessun prodotto', offers:'Offerte', add_upsell:'+ Aggiungi', chat_placeholder:'Scrivi il tuo messaggio...', chat_welcome:'Ciao! 👋 Sono l\\'assistente di {name}. Posso aiutarti a scegliere dal menu. Cosa ti va?', q1:'Cosa mi consigli?', q2:'Qualcosa senza carne', q3:'I più popolari', q4:'Ci sono offerte?', order_added:'Ordine aggiunto al carrello! Invia tramite WhatsApp.', added_suffix:'✅ Aggiunto al carrello!', chat_error:'Non riesco a connettermi. Riproviamo dopo?', repeat_order:'Ripeti ultimo ordine', combo:'Combo', offer:'Offerta', save:'Risparmio', reviews:'Recensioni', write_review:'Scrivi recensione', your_name:'Il tuo nome', your_comment:'Come è stato? (opzionale)', send_review:'Invia', cancel:'Annulla', review_thanks:'Grazie per la recensione!', review_exists:'Hai già lasciato una recensione', reviews_label:'recensioni' }
};
var userLang = (navigator.language || 'es').slice(0, 2).toLowerCase();
var T = TRANSLATIONS[userLang] || TRANSLATIONS.es;

// State
let catActiva = DATA.categorias.length > 0 ? DATA.categorias[0].id : null;
let cart = [];
let cartId = 0;
let detailProd = null;
let quitarSel = new Set();   // índices de ingredientes que el cliente quita en el detalle
let anadirSel = new Map();   // id → extra que el cliente añade (del catálogo gateado a precio>0)
let detailExtrasById = {};   // lookup id → extra del producto abierto
// Mitad y mitad + Al gusto (adaptan MitadMitadPanel / AlGustoPanel del comandero)
let mitadCat = null, mitadIzq = null, mitadDer = null, mitadLado = 'izq';
// Variaciones por mitad (espeja varIzquierda/varDerecha del MitadMitadPanel del comandero).
// { quitar:[nombres], anadir:[{id,nombre,precio_extra}], extras } | null = mitad sin personalizar.
let mitadVarIzq = null, mitadVarDer = null;
let mitadVarLado = null, mitadVarPizza = null;   // lado/pizza en edición de variaciones
let alGustoCat = null, alGustoBase = 0, alGustoBaseId = null;

// localStorage keys
var LS_CART = 'carta_cart_' + (CONFIG.nombre_negocio || 'default').replace(/\\s/g, '_');
var LS_LAST_ORDER = 'carta_last_order_' + (CONFIG.nombre_negocio || 'default').replace(/\\s/g, '_');

// Restore cart from localStorage
try {
  var saved = localStorage.getItem(LS_CART);
  if (saved) {
    var parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.length > 0) {
      cart = parsed;
      cartId = cart.reduce(function(m, i) { return Math.max(m, i._id || 0); }, 0);
    }
  }
} catch(e) {}

function saveCartToStorage() {
  try { localStorage.setItem(LS_CART, JSON.stringify(cart)); } catch(e) {}
}

function saveLastOrder() {
  if (cart.length === 0) return;
  try { localStorage.setItem(LS_LAST_ORDER, JSON.stringify(cart)); } catch(e) {}
}

function getLastOrder() {
  try {
    var saved = localStorage.getItem(LS_LAST_ORDER);
    return saved ? JSON.parse(saved) : null;
  } catch(e) { return null; }
}

function repeatLastOrder() {
  var last = getLastOrder();
  if (!last || !Array.isArray(last) || last.length === 0) return;
  for (var i = 0; i < last.length; i++) {
    var item = last[i];
    cart.push({ _id: ++cartId, id: item.id, nombre: item.nombre, precio: item.precio, qty: item.qty || 1, detalle: item.detalle || null, es_oferta: item.es_oferta || false });
  }
  updateCart();
}

// i18n — apply translations to static DOM elements
function applyTranslations() {
  var ct = document.getElementById('cart-title'); if (ct) ct.textContent = T.cart_title;
  var ci = document.getElementById('chat-input'); if (ci) ci.placeholder = T.chat_placeholder;
  var ua = document.getElementById('upsell-add'); if (ua) ua.textContent = T.add_upsell;
}

// Helpers
function fmt(p) { return p.toFixed(2) + ' ' + MONEDA; }
function esc(s) { const d=document.createElement('div');d.textContent=s;return d.innerHTML; }

// Normaliza para comparar ingredientes sin depender del id exacto (acentos/caja/espacios).
function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim(); }
// Conjunto de exclusión = ids + nombres normalizados de los ingredientes BASE de un producto.
// Robusto al desajuste de id entre la carta (base) y el catálogo de extras (mismo tipo de bug
// que "pizza"): un ingrediente ya en el producto NO se ofrece como extra (lo espeja el comandero).
function baseExcludeSet(p) {
  const s = new Set();
  for (const bi of ((p && p.ingredientes) || [])) {
    if (!bi) continue;
    if (bi.id) s.add(norm(bi.id));
    if (bi.nombre) s.add(norm(bi.nombre));
  }
  return s;
}

// Familias de extra — MISMO sistema que el comandero (VariacionesPanel.tipoConfig):
// orden visual + etiqueta + emoji. La familia llega en ing.tipo (= familia de la proyección).
const FAM_CONFIG = {
  queso:   { emoji: '🧀', label: 'Queso',            orden: 1, color: '#facc15' },
  verdura: { emoji: '🥬', label: 'Verdura',          orden: 2, color: '#22c55e' },
  carne:   { emoji: '🍖', label: 'Carne y Embutido', orden: 3, color: '#ef4444' },
  marisco: { emoji: '🐟', label: 'Pescado/Marisco',  orden: 4, color: '#3b82f6' },
  salsa:   { emoji: '🍅', label: 'Salsa',            orden: 5, color: '#f59e0b' },
  masa:    { emoji: '🫓', label: 'Masa/Base',        orden: 6, color: '#a78bfa' },
  otro:    { emoji: '📦', label: 'Otro',             orden: 9, color: '#888888' }
};
function famInfo(t) { return FAM_CONFIG[t] || FAM_CONFIG.otro; }
// Pinta los extras AGRUPADOS por familia, ordenados, con cabecera por grupo (mismo sistema
// que el comandero). Puebla detailExtrasById. selSet marca los ya añadidos; fn = handler onclick.
function renderExtrasAgrupados(extras, selSet, fn) {
  const handler = fn || 'toggleAnadir';
  const byTipo = {};
  for (const e of extras) { detailExtrasById[e.id] = e; const t = e.tipo || 'otro'; (byTipo[t] = byTipo[t] || []).push(e); }
  const tipos = Object.keys(byTipo).sort(function(a, b) { return famInfo(a).orden - famInfo(b).orden; });
  let html = '';
  for (const t of tipos) {
    const info = famInfo(t);
    const lista = byTipo[t].slice().sort(function(a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });
    const cls = t ? ' ' + t : '';
    html += '<div class="ing-group" style="--fam:' + info.color + '"><div class="ing-group-head"><span>' + info.emoji + '</span><span>' + info.label + '</span><span class="ing-group-count">(' + lista.length + ')</span></div><div class="ing-list">';
    for (const e of lista) {
      const ad = (selSet && selSet.has(e.id)) ? ' added' : '';
      html += '<button type="button" class="ing-chip ing-add' + cls + ad + '" onclick="' + handler + '(\\'' + e.id + '\\', this)">' + (e.emoji ? '<span style="font-size:.85rem">' + e.emoji + '</span>' : '') + '<span style="font-weight:500">' + esc(e.nombre) + '</span><span class="ing-add-price">+' + fmt(e.precio_extra) + '</span></button>';
    }
    html += '</div></div>';
  }
  return html;
}

// Alérgenos (1169/2011): mapa id→{nombre,emoji} desde la leyenda de la proyección.
var ALERG = {};
(DATA.alergenos_leyenda || []).forEach(function(a){ ALERG[a.id] = a; });
function alergNombres(ids) {
  return (ids || []).map(function(id){ return (ALERG[id] && ALERG[id].nombre) || id; });
}
// Chips compactos (emoji) para la tarjeta, con nombre accesible para lector de pantalla.
function alergChipsCompact(ids) {
  if (!ids || !ids.length) return '';
  var emojis = ids.map(function(id){ return (ALERG[id] && ALERG[id].emoji) || '⚠️'; }).join(' ');
  var label = 'Alérgenos: ' + alergNombres(ids).join(', ');
  return '<div class="card-alerg" role="img" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + emojis + '</div>';
}

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
// Rellena el CARD_TEMPLATE (diseño por proyecto o semilla) con los slots del producto.
// El runtime pre-renderiza lo dinámico (visual, badges, alérgenos); el template arregla el look.
function fillCard(p) {
  const ings = p.ingredientes || [];
  const preview = ings.slice(0, 5).map(i => i.emoji || (i.nombre || '').slice(0, 8)).join(' ') + (ings.length > 5 ? ' …' : '');
  const tags = p.tags || [];
  let badges = '';
  if (tags.includes('vegano')) badges += '<span class="badge">Vegano</span>';
  else if (tags.includes('vegetariano')) badges += '<span class="badge">Vegetariano</span>';
  if (tags.includes('popular')) badges += '<span class="badge popular">Popular</span>';
  if (tags.includes('picante')) badges += '<span class="badge picante">Picante</span>';
  if (tags.includes('premium')) badges += '<span class="badge premium">Premium</span>';
  if (tags.includes('nuevo')) badges += '<span class="badge nuevo">Nuevo</span>';
  const visual = p.imagen
    ? '<img src="' + esc(p.imagen) + '" alt="' + esc(p.imagen_alt || p.nombre) + '" loading="lazy">'
    : '<span class="ph" role="img" aria-label="' + esc(p.nombre) + '">' + (p.emoji || '${logoEmoji}') + '</span>';
  const slots = {
    id: esc(p.id),
    nombre: (p.emoji ? p.emoji + ' ' : '') + esc(p.nombre),
    precio: fmt(p.precio),
    visual: visual,
    gancho: p.gancho ? '<span class="badge gancho">' + esc(p.gancho) + '</span>' : '',
    badges: badges,
    descripcion: p.descripcion ? esc(p.descripcion) : esc(preview),
    alergenos: alergChipsCompact(p.alergenos),
    ingredientes: esc(preview),
    add_label: 'Añadir ' + esc(p.nombre)
  };
  return CARD_TEMPLATE.replace(/\\{\\{(\\w+)\\}\\}/g, function (m, k) { return (k in slots) ? slots[k] : ''; });
}

function renderGrid() {
  const prods = catActiva ? DATA.productos.filter(p => p.categoria === catActiva) : DATA.productos;
  const el = document.getElementById('grid');
  // Entradas Mitad/Al gusto: solo en categorías "pizza" (por nombre) y si los datos las soportan.
  let head = '';
  if (catActiva && isPizzaCat(catActiva)) {
    if (pizzasOf(catActiva).length >= 2) head += specialCard('½', 'Mitad y mitad', 'Combina dos medias pizzas', 'showMitad(\\'' + catActiva + '\\')');
    if (extrasForGroup(catGrpKeys(catActiva), {}).length) head += specialCard('🍕', 'Crea tu pizza', 'Elige tus ingredientes', 'showAlGusto(\\'' + catActiva + '\\')');
  }
  if (prods.length === 0 && !head) { el.innerHTML = '<div style="text-align:center;padding:60px;color:#666;grid-column:1/-1">' + T.no_products + '</div>'; return; }
  el.innerHTML = head + prods.map(fillCard).join('');
  if (!el._delegado) {
    // Delegación por data-accion: el diseño NO necesita saber nombres de función.
    el.addEventListener('click', function (e) {
      const add = e.target.closest('[data-accion="add"]');
      if (add) { e.stopPropagation(); addToCart(add.getAttribute('data-producto-id')); return; }
      const det = e.target.closest('[data-accion="detalle"]');
      if (det) { showDetail(det.getAttribute('data-producto-id')); }
    });
    el._delegado = true;
  }
}

// Detail
function showDetail(id) {
  detailProd = DATA.productos.find(p => p.id === id);
  if (!detailProd) return;
  quitarSel = new Set();   // cada apertura empieza limpia (sin quitados heredados)
  anadirSel = new Map();
  detailExtrasById = {};
  const p = detailProd;

  const visualEl = document.getElementById('detail-visual');
  visualEl.innerHTML = (p.imagen
    ? '<img src="' + esc(p.imagen) + '" alt="' + esc(p.imagen_alt || p.nombre) + '" style="width:100%;height:100%;object-fit:cover">'
    : '<span class="detail-ph" role="img" aria-label="' + esc(p.nombre) + '">' + (p.emoji || '${logoEmoji}') + '</span>')
    + '<button class="close-btn" onclick="closeDetail()" aria-label="Cerrar">✕</button>';

  const tags = p.tags || [];
  const TAG_COLORS = {vegano:'#22c55e',vegetariano:'#4ade80',picante:'#ef4444',popular:'${colorPrimario}',nuevo:'#3b82f6',premium:'#a855f7',especial:'#ec4899',clasico:'#6b7280'};
  let tagsHtml = '';
  for (const t of tags) {
    if (TAG_COLORS[t]) tagsHtml += '<span class="detail-tag" style="background:' + TAG_COLORS[t] + '">' + t + '</span>';
  }

  // Ingredientes TOCABLES: pulsar uno lo marca como "quitar" (rojo, tachado). Adaptado del
  // VariacionesPanel del comandero — aquí solo la mitad "quitar" (la base del producto ya viaja).
  const ings = p.ingredientes || [];
  let ingsHtml = '';
  for (let idx = 0; idx < ings.length; idx++) {
    const i = ings[idx];
    const cls = i.tipo ? ' ' + i.tipo : '';
    ingsHtml += '<button type="button" class="ing-chip ing-removable' + cls + '" data-ing-idx="' + idx + '" onclick="toggleQuitar(' + idx + ', this)">' + (i.emoji ? '<span style="font-size:.85rem">' + i.emoji + '</span>' : '') + '<span style="font-weight:500">' + esc(i.nombre) + '</span></button>';
  }

  // Extras AÑADIBLES (1b): del catálogo (ya gateado a precio>0), mismo grupo que el producto,
  // que NO sean ya base (exclusión por id O nombre, robusta). Espeja "añadir" del VariacionesPanel.
  const grpKeys = [p.categoria_id, (p.categoria || '').toLowerCase()].filter(Boolean);
  const extras = extrasForGroup(grpKeys, baseExcludeSet(p));
  const extrasHtml = extras.length ? renderExtrasAgrupados(extras, anadirSel, 'toggleAnadir') : '';

  // Declaración de alérgenos por NOMBRE (1169/2011 — el texto es lo legalmente exigible).
  let alergHtml = '';
  if (p.alergenos && p.alergenos.length) {
    let chips = '';
    for (const id of p.alergenos) {
      const a = ALERG[id] || { nombre: id, emoji: '⚠️' };
      chips += '<span class="alerg-chip">' + a.emoji + ' ' + esc(a.nombre) + '</span>';
    }
    alergHtml = '<h3 class="section-title">Alérgenos</h3><div class="alerg-list">' + chips + '</div>';
  }

  document.getElementById('detail-content').innerHTML =
    '<div class="detail-header"><h2 class="detail-nombre">' + (p.emoji ? p.emoji + ' ' : '') + esc(p.nombre) + '</h2><span class="detail-precio">' + fmt(p.precio) + '</span></div>' +
    (tagsHtml ? '<div class="detail-tags">' + tagsHtml + '</div>' : '') +
    (p.descripcion ? '<p class="detail-desc">' + esc(p.descripcion) + '</p>' : '') +
    (ingsHtml ? '<h3 class="section-title">Ingredientes <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#777">· toca para quitar</span></h3><div class="ing-list">' + ingsHtml + '</div>' : '') +
    (extrasHtml ? '<h3 class="section-title">Añadir extras</h3>' + extrasHtml : '') +
    alergHtml;

  renderDetailFooter();

  document.getElementById('detail-overlay').classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
  detailProd = null;
  mitadCat = null; mitadIzq = null; mitadDer = null; mitadLado = 'izq';
  mitadVarIzq = null; mitadVarDer = null; mitadVarLado = null; mitadVarPizza = null;
  alGustoCat = null; alGustoBase = 0; alGustoBaseId = null;
}

// Detalle → carrito: arma la personalización (sin X · con Y) y delega en addToCart.
function detailTotal() {
  if (!detailProd) return 0;
  let extra = 0;
  anadirSel.forEach(function(e) { extra += Number(e.precio_extra) || 0; });
  return detailProd.precio + extra;
}

function renderDetailFooter() {
  document.getElementById('detail-footer').innerHTML =
    '<button class="btn btn-primary" onclick="addDetailToCart()">' + T.add + ' ' + fmt(detailTotal()) + '</button>';
}

function toggleQuitar(idx, btn) {
  if (quitarSel.has(idx)) { quitarSel.delete(idx); btn.classList.remove('removed'); }
  else { quitarSel.add(idx); btn.classList.add('removed'); }
}

function toggleAnadir(id, btn) {
  const e = detailExtrasById[id];
  if (!e) return;
  if (anadirSel.has(id)) { anadirSel.delete(id); btn.classList.remove('added'); }
  else { anadirSel.set(id, e); btn.classList.add('added'); }
  // El precio cambia con cada extra. Mismo toggle en dos contextos: detalle normal y
  // personalización de una mitad — cada uno repinta SU footer (no se pisan).
  if (mitadVarLado) renderMitadVarFooter(); else renderDetailFooter();
}

function addDetailToCart() {
  if (!detailProd) return;
  const p = detailProd;
  const ings = p.ingredientes || [];
  const quitados = [];
  quitarSel.forEach(function(idx) { if (ings[idx]) quitados.push(ings[idx].nombre); });
  const anadidos = [];
  let extra = 0;
  anadirSel.forEach(function(e) { anadidos.push(e.nombre); extra += Number(e.precio_extra) || 0; });
  const partes = [];
  if (quitados.length) partes.push('sin ' + quitados.join(', '));
  if (anadidos.length) partes.push('con ' + anadidos.join(', '));
  const detalle = partes.length ? partes.join(' · ') : null;
  // anadir POR IDS (lo que re-tasa el bot); quitar por NOMBRE (gratis, solo nota de cocina).
  const anadirIds = Array.from(anadirSel.keys());
  const estructura = { producto_id: p.id, tipo: 'normal', quitar: quitados, anadir: anadirIds };
  addToCart(p.id, { detalle: detalle, precio: p.precio + extra, estructura: estructura });
  closeDetail();
}

// Cart
function addToCart(id, opts) {
  const p = DATA.productos.find(x => x.id === id);
  if (!p) return;
  opts = opts || {};
  const precio = (opts.precio != null) ? opts.precio : p.precio;
  // estructura = la forma POR IDS para el payload #P1 (el bot la re-tasa). Por defecto, normal.
  const estructura = opts.estructura || { producto_id: p.id, tipo: 'normal' };
  cart.push({ _id: ++cartId, id: p.id, nombre: p.nombre, precio: precio, qty: 1, detalle: opts.detalle || null, estructura: estructura });
  updateCart();
  showUpsell(p);
}

// ─── Mitad y mitad + Al gusto (adaptan MitadMitadPanel / AlGustoPanel del comandero) ───
// Familia "pizza" = categoría COMPONIBLE (admite mitad/al-gusto). Dos señales, ninguna
// frágil al nombre exacto (el bug previo: "Pizzicas" no contenía "pizza"):
//   1) la raíz "pizz" en nombre/id (Pizzas · Pizzicas · Pizze · Pizza…).
//   2) data-driven, como el comandero: sus productos llevan ingredientes (son componibles);
//      las bebidas (sin ingredientes) quedan fuera. Los sub-gates (≥2 productos para mitad,
//      extras del grupo para al-gusto) acotan el resto.
function isPizzaCat(catId) {
  const c = DATA.categorias.find(x => x.id === catId);
  if (!c) return false;
  if (((c.nombre || '') + ' ' + (c.id || '')).toLowerCase().indexOf('pizz') >= 0) return true;
  return DATA.productos.some(function (p) {
    return p.categoria === catId && Array.isArray(p.ingredientes) && p.ingredientes.length > 0;
  });
}
function pizzasOf(catId) { return DATA.productos.filter(p => p.categoria === catId); }
function catGrpKeys(catId) {
  const c = DATA.categorias.find(x => x.id === catId);
  return [catId, (c && c.nombre) || ''].filter(Boolean).map(s => String(s).toLowerCase());
}
// excludeSet: Set de tokens normalizados (id y/o nombre) a excluir (los base del producto).
// Acepta {} (sin .has) como "sin exclusión" para los call sites que no excluyen (al-gusto/gate).
function extrasForGroup(grpKeys, excludeSet) {
  const hasExcl = excludeSet && typeof excludeSet.has === 'function' && excludeSet.size;
  return (DATA.catalogo_ingredientes || []).filter(function (ing) {
    if (!ing) return false;
    if (hasExcl && (excludeSet.has(norm(ing.id)) || excludeSet.has(norm(ing.nombre)))) return false;
    const g = ing.grupos || [];
    if (g.length && grpKeys.length) {
      let ok = false;
      for (let k = 0; k < g.length; k++) { if (grpKeys.indexOf(String(g[k]).toLowerCase()) >= 0) { ok = true; break; } }
      if (!ok) return false;
    }
    return true;
  });
}
function specialCard(emoji, title, sub, onclickJs) {
  return '<article class="dish dish-special" onclick="' + onclickJs + '">' +
    '<div class="dish-photo"><span class="detail-ph" style="font-size:2.4rem">' + emoji + '</span></div>' +
    '<div class="dish-body"><div class="dish-head"><h3 class="dish-name">' + title + '</h3></div>' +
    '<p class="dish-desc">' + sub + '</p></div></article>';
}

// Mitad: eliges dos medias; precio = el mayor (igual que MitadMitadPanel).
function showMitad(catId) {
  mitadCat = catId; mitadIzq = null; mitadDer = null; mitadLado = 'izq';
  mitadVarIzq = null; mitadVarDer = null; mitadVarLado = null; mitadVarPizza = null;
  document.getElementById('detail-visual').innerHTML = '<span class="detail-ph">½+½</span><button class="close-btn" onclick="closeDetail()" aria-label="Cerrar">✕</button>';
  renderMitad();
  document.getElementById('detail-overlay').classList.add('open');
}
// Texto compacto de las variaciones de una mitad: "(sin X, + Y)" — espeja PedidoItem.formatMitad.
function mitadModsTxt(v) {
  if (!v) return '';
  var mods = [];
  (v.quitar || []).forEach(function (n) { mods.push('sin ' + n); });
  (v.anadir || []).forEach(function (a) { mods.push('+ ' + (a.nombre || a)); });
  return mods.length ? ' (' + mods.join(', ') + ')' : '';
}
// Caja de una mitad (espeja .mitad del MitadMitadPanel del comandero): vacía = placeholder +
// label (punteada, morada si es el lado activo); llena = emoji + nombre (+ mods) + ✕ para vaciar.
function mitadSlot(lado, pizza) {
  const ph = lado === 'izq' ? '👈' : '👉';
  const lbl = lado === 'izq' ? 'Izquierda' : 'Derecha';
  const v = lado === 'izq' ? mitadVarIzq : mitadVarDer;
  if (pizza) {
    const mods = mitadModsTxt(v);
    return '<button type="button" class="mitad-box selected" onclick="mitadClear(\\'' + lado + '\\')" aria-label="Quitar ' + esc(pizza.nombre) + '">' +
      '<span class="mitad-box-emoji">' + (pizza.emoji || '🍕') + '</span>' +
      '<span class="mitad-box-nombre">' + esc(pizza.nombre) + '</span>' +
      (mods ? '<span class="mitad-box-mods">' + esc(mods) + '</span>' : '') +
      '<span class="mitad-box-clear">✕</span></button>';
  }
  const active = mitadLado === lado ? ' active' : '';
  return '<button type="button" class="mitad-box' + active + '" onclick="mitadFocus(\\'' + lado + '\\')">' +
    '<span class="mitad-box-ph">' + ph + '</span><span class="mitad-box-label">' + lbl + '</span></button>';
}
function renderMitad() {
  const pizzas = pizzasOf(mitadCat);
  // Grid 2-col de botones partidos (como el .pizzas-grid del comandero): cuerpo = mitad tal cual,
  // zona "✏️" = mitad + variaciones de ESA mitad, en un gesto.
  let grid = '<div class="mitad-grid">';
  for (const p of pizzas) {
    grid += '<span class="mitad-pick">' +
      '<button type="button" class="mitad-pick-main" onclick="pickMitad(\\'' + p.id + '\\', false)">' + (p.emoji ? p.emoji + ' ' : '') + '<span class="mitad-pick-name">' + esc(p.nombre) + '</span><span class="ing-add-price">' + fmt(p.precio) + '</span></button>' +
      '<button type="button" class="mitad-pick-var" onclick="pickMitad(\\'' + p.id + '\\', true)" title="Elegir y personalizar" aria-label="Elegir y personalizar ' + esc(p.nombre) + '">✏️</button>' +
      '</span>';
  }
  grid += '</div>';
  // Preview (dos cajas + divisor ➕) · caja de precio · selector de lado · grid. Espeja el comandero.
  const preview = '<div class="mitad-preview">' + mitadSlot('izq', mitadIzq) +
    '<span class="mitad-div"><span class="mitad-div-line"></span>➕<span class="mitad-div-line"></span></span>' +
    mitadSlot('der', mitadDer) + '</div>';
  const precioBox = '<div class="mitad-precio">💰 Precio: <strong>' + fmt(mitadTotal()) + '</strong></div>';
  const ladoSel = '<div class="mitad-lados">' +
    '<button type="button" class="mitad-lado' + (mitadLado === 'izq' ? ' active' : '') + '" onclick="mitadFocus(\\'izq\\')">👈 Seleccionar izquierda</button>' +
    '<button type="button" class="mitad-lado' + (mitadLado === 'der' ? ' active' : '') + '" onclick="mitadFocus(\\'der\\')">👉 Seleccionar derecha</button></div>';
  document.getElementById('detail-content').innerHTML =
    '<div class="detail-header"><h2 class="detail-nombre">½+½ Mitad y mitad</h2></div>' +
    preview + precioBox + ladoSel + grid;
  renderMitadFooter();
}
function mitadFocus(lado) { mitadLado = lado; renderMitad(); }
function mitadClear(lado) {
  if (lado === 'izq') { mitadIzq = null; mitadVarIzq = null; mitadLado = 'izq'; }
  else { mitadDer = null; mitadVarDer = null; mitadLado = 'der'; }
  renderMitad();
}
function pickMitad(pid, conVar) {
  const p = DATA.productos.find(x => x.id === pid);
  if (!p) return;
  const lado = mitadLado;   // el lado que recibe ANTES de avanzar (como elegirPizza del comandero)
  if (mitadLado === 'izq') { mitadIzq = p; mitadVarIzq = null; mitadLado = 'der'; }
  else { mitadDer = p; mitadVarDer = null; }
  if (conVar) showMitadVar(lado, p);
  else renderMitad();
}
// Personalizar una mitad: reusa la maquinaria de showDetail (toggleQuitar/toggleAnadir sobre
// quitarSel/anadirSel) pero scopeada a la pizza de esa mitad. Espeja VariacionesPanel.
function showMitadVar(lado, pizza) {
  mitadVarLado = lado; mitadVarPizza = pizza;
  const v = lado === 'izq' ? mitadVarIzq : mitadVarDer;
  quitarSel = new Set(); anadirSel = new Map(); detailExtrasById = {};
  // Restaura selección previa si esta mitad ya estaba personalizada.
  const ings = pizza.ingredientes || [];
  if (v) {
    for (let i = 0; i < ings.length; i++) { if ((v.quitar || []).indexOf(ings[i].nombre) >= 0) quitarSel.add(i); }
  }
  let ingsHtml = '';
  for (let idx = 0; idx < ings.length; idx++) {
    const i = ings[idx];
    const cls = i.tipo ? ' ' + i.tipo : '';
    const rm = quitarSel.has(idx) ? ' removed' : '';
    ingsHtml += '<button type="button" class="ing-chip ing-removable' + cls + rm + '" onclick="toggleQuitar(' + idx + ', this)">' + (i.emoji ? '<span style="font-size:.85rem">' + i.emoji + '</span>' : '') + '<span style="font-weight:500">' + esc(i.nombre) + '</span></button>';
  }
  const grpKeys = [pizza.categoria_id, (pizza.categoria || '').toLowerCase()].filter(Boolean);
  const extras = extrasForGroup(grpKeys, baseExcludeSet(pizza));
  let extrasHtml = '';
  if (extras.length) {
    for (const e of extras) detailExtrasById[e.id] = e;
    if (v) { (v.anadir || []).forEach(function (a) { if (a.id && detailExtrasById[a.id]) anadirSel.set(a.id, detailExtrasById[a.id]); }); }
    extrasHtml = renderExtrasAgrupados(extras, anadirSel, 'toggleAnadir');
  }
  document.getElementById('detail-content').innerHTML =
    '<div class="detail-header"><h2 class="detail-nombre">' + (pizza.emoji ? pizza.emoji + ' ' : '') + '½ ' + esc(pizza.nombre) + '</h2></div>' +
    '<p class="detail-desc">Personaliza esta mitad' + (lado === 'izq' ? ' (izquierda)' : ' (derecha)') + '</p>' +
    (ingsHtml ? '<h3 class="section-title">Ingredientes <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#777">· toca para quitar</span></h3><div class="ing-list">' + ingsHtml + '</div>' : '') +
    (extrasHtml ? '<h3 class="section-title">Añadir extras</h3>' + extrasHtml : '');
  renderMitadVarFooter();
}
function mitadVarExtras() {
  let x = 0; anadirSel.forEach(function (e) { x += Number(e.precio_extra) || 0; }); return x;
}
function renderMitadVarFooter() {
  const x = mitadVarExtras();
  document.getElementById('detail-footer').innerHTML =
    '<button class="btn btn-secondary" onclick="confirmMitadVar()">↩ Volver</button>' +
    '<button class="btn btn-primary" onclick="confirmMitadVar()">Aplicar' + (x > 0 ? ' +' + fmt(x) : '') + '</button>';
}
function confirmMitadVar() {
  const p = mitadVarPizza; if (!p) { renderMitad(); return; }
  const ings = p.ingredientes || [];
  const quitar = []; quitarSel.forEach(function (idx) { if (ings[idx]) quitar.push(ings[idx].nombre); });
  const anadir = []; let extras = 0;
  anadirSel.forEach(function (e) { anadir.push({ id: e.id, nombre: e.nombre, precio_extra: Number(e.precio_extra) || 0 }); extras += Number(e.precio_extra) || 0; });
  const v = (quitar.length || anadir.length) ? { quitar: quitar, anadir: anadir, extras: extras } : null;
  if (mitadVarLado === 'izq') mitadVarIzq = v; else mitadVarDer = v;
  mitadVarLado = null; mitadVarPizza = null;
  // limpia el scratch para no contaminar el showDetail normal
  quitarSel = new Set(); anadirSel = new Map(); detailExtrasById = {};
  renderMitad();
}
function mitadTotal() {
  // Política (= comandero): base = mayor de las dos + extras COMPLETOS de cada mitad.
  if (mitadIzq && mitadDer) {
    return Math.max(mitadIzq.precio, mitadDer.precio) +
      (mitadVarIzq ? mitadVarIzq.extras : 0) + (mitadVarDer ? mitadVarDer.extras : 0);
  }
  return (mitadIzq || mitadDer || { precio: 0 }).precio;
}
function renderMitadFooter() {
  const ready = mitadIzq && mitadDer;
  document.getElementById('detail-footer').innerHTML = ready
    ? '<button class="btn btn-primary" onclick="addMitadToCart()">' + T.add + ' ' + fmt(mitadTotal()) + '</button>'
    : '<button class="btn btn-primary" disabled style="opacity:.5">Elige las dos mitades</button>';
}
function addMitadToCart() {
  if (!(mitadIzq && mitadDer)) return;
  // Nombre + detalle por mitad: "½ Bachata (sin anchoas, + bacon) + ½ Tropical (+ ajo)".
  const izqTxt = '½ ' + mitadIzq.nombre + mitadModsTxt(mitadVarIzq);
  const derTxt = '½ ' + mitadDer.nombre + mitadModsTxt(mitadVarDer);
  const mods = (mitadModsTxt(mitadVarIzq) || mitadModsTxt(mitadVarDer)) ? (izqTxt + ' + ' + derTxt) : null;
  // anadir POR IDS para el payload #P1 (el bot re-tasa con ellos).
  const idsDe = function (v) { return (v && Array.isArray(v.anadir)) ? v.anadir.map(function (a) { return a.id; }).filter(Boolean) : []; };
  cart.push({
    _id: ++cartId,
    id: 'mitad_' + mitadIzq.id + '_' + mitadDer.id,
    nombre: '½ ' + mitadIzq.nombre + ' + ½ ' + mitadDer.nombre,
    precio: mitadTotal(), qty: 1,
    detalle: mods,
    // Estructura por mitad (para el intake de autoservicio → cocina, igual que el comandero).
    tipo: 'mitad_mitad',
    pizza_izquierda: { id: mitadIzq.id, nombre: mitadIzq.nombre, precio: mitadIzq.precio, quitar: mitadVarIzq ? mitadVarIzq.quitar : [], anadir: mitadVarIzq ? mitadVarIzq.anadir : [] },
    pizza_derecha: { id: mitadDer.id, nombre: mitadDer.nombre, precio: mitadDer.precio, quitar: mitadVarDer ? mitadVarDer.quitar : [], anadir: mitadVarDer ? mitadVarDer.anadir : [] },
    // estructura por ids (anadir como ids) — lo que viaja en #P1 y re-tasa el bot.
    estructura: {
      tipo: 'mitad_mitad',
      pizza_izquierda: { id: mitadIzq.id, quitar: mitadVarIzq ? mitadVarIzq.quitar : [], anadir: idsDe(mitadVarIzq) },
      pizza_derecha: { id: mitadDer.id, quitar: mitadVarDer ? mitadVarDer.quitar : [], anadir: idsDe(mitadVarDer) }
    }
  });
  updateCart();
  closeDetail();
}

// Al gusto: base (la pizza más barata de la familia) + extras del catálogo (gateado a precio>0).
function showAlGusto(catId) {
  alGustoCat = catId;
  detailProd = null; quitarSel = new Set(); anadirSel = new Map(); detailExtrasById = {};
  const pz = pizzasOf(catId);
  // base = la pizza más barata de la familia; guardamos su ID para que el bot re-tase al_gusto.
  let base = null;
  for (const p of pz) { if (!base || p.precio < base.precio) base = p; }
  alGustoBase = base ? base.precio : 0;
  alGustoBaseId = base ? base.id : null;
  document.getElementById('detail-visual').innerHTML = '<span class="detail-ph">🍕</span><button class="close-btn" onclick="closeDetail()" aria-label="Cerrar">✕</button>';
  const extras = extrasForGroup(catGrpKeys(catId), {});
  const extrasHtml = extras.length ? renderExtrasAgrupados(extras, anadirSel, 'toggleAnadirAG') : '';
  document.getElementById('detail-content').innerHTML =
    '<div class="detail-header"><h2 class="detail-nombre">🍕 Crea tu pizza</h2><span class="detail-precio">desde ' + fmt(alGustoBase) + '</span></div>' +
    (extrasHtml ? '<h3 class="section-title">Ingredientes</h3>' + extrasHtml : '<p class="detail-desc">No hay ingredientes disponibles.</p>');
  renderAlGustoFooter();
  document.getElementById('detail-overlay').classList.add('open');
}
function alGustoTotal() {
  let x = alGustoBase;
  anadirSel.forEach(function (e) { x += Number(e.precio_extra) || 0; });
  return x;
}
function renderAlGustoFooter() {
  document.getElementById('detail-footer').innerHTML =
    '<button class="btn btn-primary" onclick="addAlGustoToCart()">' + T.add + ' ' + fmt(alGustoTotal()) + '</button>';
}
function toggleAnadirAG(id, btn) {
  const e = detailExtrasById[id];
  if (!e) return;
  if (anadirSel.has(id)) { anadirSel.delete(id); btn.classList.remove('added'); }
  else { anadirSel.set(id, e); btn.classList.add('added'); }
  renderAlGustoFooter();
}
function addAlGustoToCart() {
  const anadidos = [];
  let extra = 0;
  anadirSel.forEach(function (e) { anadidos.push(e.nombre); extra += Number(e.precio_extra) || 0; });
  const anadirIds = Array.from(anadirSel.keys());
  cart.push({
    _id: ++cartId, id: 'algusto_' + cartId, nombre: 'Pizza al gusto',
    precio: alGustoBase + extra, qty: 1,
    detalle: anadidos.length ? 'con ' + anadidos.join(', ') : null,
    // estructura por ids: el bot re-tasa base(precio de alGustoBaseId) + Σ extras.
    estructura: { tipo: 'al_gusto', producto_id: alGustoBaseId, base_id: alGustoBaseId, anadir: anadirIds }
  });
  updateCart();
  closeDetail();
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
  saveCartToStorage();
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
    var repeatBtn = getLastOrder() ? '<button class="btn-repeat" onclick="repeatLastOrder()">🔄 ' + T.repeat_order + '</button>' : '';
    el.innerHTML = '<div class="empty"><span class="empty-ico">🛒</span><p>' + T.cart_empty + '</p>' + repeatBtn + '</div>';
    document.getElementById('cart-footer').style.display = 'none';
    return;
  }

  let html = '';
  for (const item of cart) {
    var detalleHtml = item.detalle ? '<span class="ci-var add">' + esc(item.detalle) + '</span>' : '';
    html += '<div class="cart-item"><div class="ci-info"><span class="ci-name">' + esc(item.nombre) + '</span>' + detalleHtml + '</div>' +
      '<div class="ci-ctrl"><div class="qty"><button onclick="changeQty(' + item._id + ',-1)">-</button><span>' + item.qty + '</span><button onclick="changeQty(' + item._id + ',1)">+</button></div>' +
      '<span class="ci-sub">' + fmt(item.precio * item.qty) + '</span></div></div>';
  }
  el.innerHTML = html;

  const footer = document.getElementById('cart-footer');
  footer.style.display = 'block';
  // Mode-aware: ALOJADO (pedido_endpoint) → pedir online + código de recogida.
  // SUELTA → WhatsApp. Si hay ambos, los dos (el cliente elige; no excluir).
  // Pagar ahora (pasarela) — solo si el proyecto tiene pago online. No excluye: la recogida sigue.
  const pagarBtn = (CONFIG.pedido_endpoint && CONFIG.pago_online)
    ? '<button class="btn-wa" id="btn-pagar" onclick="pagarAhora()">💳 Pagar ahora</button>'
    : '';
  const onlineBtn = CONFIG.pedido_endpoint
    ? '<button class="' + (CONFIG.pago_online ? 'btn-share' : 'btn-wa') + '" id="btn-pedir" onclick="pedirOnline()">Pedir y pagar al recoger</button>'
    : '';
  const waBtn = CONFIG.whatsapp_telefono
    ? '<button class="' + (CONFIG.pedido_endpoint ? 'btn-share' : 'btn-wa') + '" onclick="sendWhatsApp()">WhatsApp</button>'
    : (CONFIG.pedido_endpoint ? '' : '<button class="btn-share" onclick="shareOrder()">' + T.share + '</button>');
  const nombreInput = (CONFIG.whatsapp_telefono || CONFIG.pedido_endpoint)
    ? '<input id="cliente-nombre" class="cart-nombre" type="text" placeholder="¿A nombre de? (obligatorio)" aria-label="A nombre de" autocomplete="name" required>'
    : '';
  footer.innerHTML = '<div class="total-row"><span class="total-label">' + T.total + '</span><span class="total-amount">' + fmt(total) + '</span></div>' +
    nombreInput +
    '<div class="cart-actions"><button class="btn-clear" onclick="clearCart()">' + T.clear + '</button>' + pagarBtn + onlineBtn + waBtn + '</div>';
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

// Nonce 4 chars sin caracteres ambiguos (no O,0,1,I) — idempotencia del pedido.
function _pedNonce() {
  var ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  for (var k = 0; k < 4; k++) s += ch.charAt(Math.floor(Math.random() * ch.length));
  return s;
}
function _pedEur(n) { return Number(n).toFixed(2).replace('.', ',') + ' EUR'; }
// Nombre que el cliente escribió en el carrito (etiqueta humana del pedido).
function _pedNombre() {
  var nm = document.getElementById('cliente-nombre');
  return nm && nm.value ? nm.value.trim().replace(/\\s+/g, ' ').slice(0, 60) : '';
}

// Pedido CODIFICADO POR IDS (lo autoritativo). El bot lo re-tasa contra la carta; los
// precios del texto humano son SOLO para que el cliente vea su pedido. Cada item lleva su
// estructura (normal/al_gusto/mitad) + cantidad. Nombres solo en 'quitar' (gratis, nota cocina).
function buildOrderItems() {
  return cart.map(function (it) {
    var e = it.estructura || { producto_id: it.id, tipo: 'normal' };
    var out = { cantidad: it.qty };
    for (var k in e) { if (Object.prototype.hasOwnProperty.call(e, k)) out[k] = e[k]; }
    return out;
  });
}
// '#P1 <base64url(JSON)>' — utf8-safe (acentos en 'quitar'). El parser del bot lo decodifica.
function buildP1Line() {
  try {
    var json = JSON.stringify({ v: 1, items: buildOrderItems() });
    var b64 = btoa(unescape(encodeURIComponent(json)));
    var b64url = b64.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    return '#P1 ' + b64url;
  } catch (e) { return ''; }
}

// Mensaje wa.me en FORMATO CANÓNICO que el whatsapp-bot (parser) entiende:
//   PEDIDO <slug>-<NONCE4>
//   - <cant> x <descripcion>
//   Total: <X,XX> EUR
//   Nombre: <nombre del cliente>
//   #P1 <base64url>   ← AUTORITATIVO (ids); el bot re-tasa con esto, ignora los precios del texto
function buildOrderMsg() {
  if (cart.length === 0) return '';
  if (!CONFIG.project_slug) return '';        // sin slug no se puede formar el pedido canónico
  var nombre = _pedNombre();
  if (!nombre) return '';                     // sin nombre no se forma (sendWhatsApp avisa)
  var msg = 'PEDIDO ' + CONFIG.project_slug + '-' + _pedNonce() + '\\n';
  for (var idx = 0; idx < cart.length; idx++) {
    var item = cart[idx];
    var desc = item.nombre + (item.detalle ? ' [' + item.detalle + ']' : '');
    msg += '- ' + item.qty + ' x ' + desc + ' (' + _pedEur(item.precio * item.qty) + ')\\n';
  }
  var total = cart.reduce(function(s, i) { return s + i.precio * i.qty; }, 0);
  msg += 'Total: ' + _pedEur(total) + '\\n';
  msg += 'Nombre: ' + nombre;
  var p1 = buildP1Line();
  if (p1) msg += '\\n' + p1;
  return msg;
}

function sendWhatsApp() {
  if (!_pedNombre()) {
    var nm = document.getElementById('cliente-nombre');
    if (nm) { nm.focus(); nm.style.borderColor = '#ff5252'; }
    alert('Escribe a nombre de quién es el pedido.');
    return;
  }
  const msg = buildOrderMsg();
  if (!msg) return;
  var total = cart.reduce(function(s, i) { return s + i.precio * i.qty; }, 0);
  saveLastOrder();
  window.open('https://wa.me/' + CONFIG.whatsapp_telefono + '?text=' + encodeURIComponent(msg), '_blank');
}

// Pagar AHORA (pasarela): POST con pago_online → tienda-api crea el pedido + inicia el pago
// → checkout_url; la PWA redirige a la pasarela. Si no hay pasarela, el pedido ya quedó (recogida).
async function pagarAhora() {
  if (cart.length === 0 || !CONFIG.pedido_endpoint) return;
  var total = cart.reduce(function(s, i){ return s + i.precio * i.qty; }, 0);
  var nombreEl = document.getElementById('cliente-nombre');
  var nombre = nombreEl && nombreEl.value ? nombreEl.value.trim() : '';
  var body = {
    items: cart.map(function(i){ return { cantidad: i.qty, descripcion: i.nombre + (i.detalle ? ' [' + i.detalle + ']' : '') }; }),
    total_centimos: Math.round(total * 100),
    pago_online: true,
    return_url: location.origin + location.pathname
  };
  if (nombre) body.nombre_cliente = nombre;
  var btn = document.getElementById('btn-pagar');
  if (btn) { btn.disabled = true; btn.textContent = 'Conectando…'; }
  try {
    var r = await fetch(CONFIG.pedido_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var data = await r.json().catch(function(){ return null; });
    var url = data && data.data && data.data.checkout_url;
    if (r.ok && url) {
      saveLastOrder();
      window.location.href = url;   // → pasarela (Stripe)
      return;
    }
    // Sin pasarela: el pedido SÍ se creó (recogida). Mostramos el código.
    var codigo = data && data.data && data.data.codigo_recogida;
    if (r.ok && codigo) { mostrarConfirmacion(codigo); cart = []; updateCart(); return; }
    throw new Error((data && data.error && data.error.message) || ('HTTP ' + r.status));
  } catch (e) {
    alert('No se pudo iniciar el pago.' + (CONFIG.whatsapp_telefono ? ' Prueba por WhatsApp.' : ' Inténtalo de nuevo.'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💳 Pagar ahora'; }
  }
}

// Pedido ONLINE (escenario alojado): POST a tienda-api → pedido.crear-tienda → código de recogida.
async function pedirOnline() {
  if (cart.length === 0 || !CONFIG.pedido_endpoint) return;
  var total = cart.reduce(function(s, i){ return s + i.precio * i.qty; }, 0);
  var nombreEl = document.getElementById('cliente-nombre');
  var nombre = nombreEl && nombreEl.value ? nombreEl.value.trim() : '';
  var body = {
    items: cart.map(function(i){ return { cantidad: i.qty, descripcion: i.nombre + (i.detalle ? ' [' + i.detalle + ']' : '') }; }),
    total_centimos: Math.round(total * 100)
  };
  if (nombre) body.nombre_cliente = nombre;
  var btn = document.getElementById('btn-pedir');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    var r = await fetch(CONFIG.pedido_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var data = await r.json().catch(function(){ return null; });
    var codigo = data && data.data && data.data.codigo_recogida;
    if (r.ok && codigo) {
      saveLastOrder();
      mostrarConfirmacion(codigo);
      cart = []; updateCart();
    } else {
      throw new Error((data && data.error && data.error.message) || ('HTTP ' + r.status));
    }
  } catch (e) {
    alert('No se pudo enviar el pedido.' + (CONFIG.whatsapp_telefono ? ' Prueba por WhatsApp.' : ' Inténtalo de nuevo en un momento.'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Pedir para recoger'; }
  }
}

// Confirmación accesible: muestra el código de recogida (pickup + confirmación, sin pago).
function mostrarConfirmacion(codigo) {
  var el = document.getElementById('cart-items');
  var footer = document.getElementById('cart-footer');
  if (footer) footer.style.display = 'none';
  if (el) {
    el.innerHTML = '<div class="pedido-ok" role="status" aria-live="polite">' +
      '<div class="pedido-ok-check">✅</div>' +
      '<h3>¡Pedido confirmado!</h3>' +
      '<p>Enséñalo al recogerlo. Tu código de recogida:</p>' +
      '<div class="pedido-codigo">' + esc(codigo) + '</div>' +
      '<button class="btn-wa" onclick="toggleCart()">Cerrar</button></div>';
  }
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

// El asistente (Enki). ALOJADO → chat in-app. SUELTO (sin backend) → por WhatsApp.
function initChat() {
  if (chatReady) {
    document.getElementById('chat-fab').classList.add('show');
    const quickEl = document.getElementById('chat-quick');
    const suggestions = [T.q1, T.q2, T.q3, T.q4];
    quickEl.innerHTML = suggestions.map(function(s) {
      return '<button onclick="sendQuick(this,\\'' + s.replace(/'/g, "\\\\'") + '\\')">' + s + '</button>';
    }).join('');
    addBotMsg(T.chat_welcome.replace('{name}', CONFIG.nombre_negocio));
  } else if (CONFIG.whatsapp_telefono) {
    // PWA suelta sin backend: el asistente se habla por WhatsApp (whatsapp-bot → Enki).
    document.getElementById('chat-fab').classList.add('show');
  }
}

// Dispatcher del FAB del asistente: in-app o WhatsApp según el escenario.
function asistente() {
  if (chatReady) { toggleChat(); return; }
  if (CONFIG.whatsapp_telefono) {
    var msg = 'Hola, quiero preguntar sobre la carta de ' + CONFIG.nombre_negocio;
    window.open('https://wa.me/' + CONFIG.whatsapp_telefono + '?text=' + encodeURIComponent(msg), '_blank');
  }
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

// Streaming bubble: shows tokens as they arrive
function showStreamBubble() {
  hideTyping();
  var el = document.getElementById('chat-msgs');
  el.innerHTML += '<div class="chat-msg bot" id="stream-bubble"><span class="stream-cursor"></span></div>';
  el.scrollTop = el.scrollHeight;
}

function appendToStream(text) {
  var bubble = document.getElementById('stream-bubble');
  if (!bubble) return;
  // Remove cursor, append text, re-add cursor
  var cursor = bubble.querySelector('.stream-cursor');
  if (cursor) cursor.remove();
  bubble.innerHTML += esc(text);
  bubble.innerHTML += '<span class="stream-cursor"></span>';
  var el = document.getElementById('chat-msgs');
  el.scrollTop = el.scrollHeight;
}

function finalizeStream() {
  var bubble = document.getElementById('stream-bubble');
  if (!bubble) return '';
  var cursor = bubble.querySelector('.stream-cursor');
  if (cursor) cursor.remove();
  var text = bubble.textContent || '';
  bubble.remove();
  return text;
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
  document.getElementById('chat-status').textContent = 'Pensando...';
  showTyping();

  // Build messages array for AI (strip system — server adds it)
  var history = chatMsgs.slice(-20);
  var aiMsgs = [];
  for (var i = 0; i < history.length; i++) {
    aiMsgs.push({ role: history[i].role, content: history[i].content });
  }

  var endpoint = CONFIG.ai_endpoint + (CONFIG.ai_chat_path || '/chat');   // cerebro = cf-worker (suelto)

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: aiMsgs, provider: CONFIG.ai_provider || 'auto', stream: true })
  })
  .then(function(res) {
    // Check if response is SSE streaming
    var ct = res.headers.get('Content-Type') || '';
    if (ct.indexOf('text/event-stream') !== -1 && res.body) {
      return handleStreamResponse(res);
    }
    // Fallback: non-streaming JSON response
    return res.json().then(function(json) {
      hideTyping();
      var reply = (json.data && json.data.content) || 'Lo siento, no he podido responder. Intenta de nuevo.';
      processAIReply(reply);
    });
  })
  .catch(function(err) {
    hideTyping();
    finalizeStream();
    document.getElementById('chat-send').disabled = false;
    document.getElementById('chat-status').textContent = 'En línea';
    addBotMsg(T.chat_error);
  });
}

function handleStreamResponse(res) {
  showStreamBubble();
  document.getElementById('chat-status').textContent = 'Escribiendo...';

  var reader = res.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  var fullContent = '';

  function pump() {
    return reader.read().then(function(result) {
      if (result.done) {
        // Stream finished
        var reply = finalizeStream() || fullContent;
        processAIReply(reply);
        return;
      }

      buffer += decoder.decode(result.value, { stream: true });
      var lines = buffer.split('\\n');
      buffer = lines.pop() || '';

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || !line.startsWith('data: ')) continue;
        var data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          var chunk = JSON.parse(data);
          var delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
          if (delta && delta.content) {
            fullContent += delta.content;
            appendToStream(delta.content);
          }
        } catch(e) {}
      }

      return pump();
    });
  }

  return pump();
}

function processAIReply(reply) {
  document.getElementById('chat-send').disabled = false;
  document.getElementById('chat-status').textContent = 'En línea';

  // Check if AI included an order JSON
  var orderMatch = reply.match(/\\{"pedido"\\s*:\\s*\\[.*?\\]\\}/s);
  if (orderMatch) {
    try {
      var orderData = JSON.parse(orderMatch[0]);
      if (orderData.pedido && orderData.pedido.length > 0) {
        applyAIOrder(orderData.pedido);
        reply = reply.replace(orderMatch[0], '').trim();
        if (!reply) reply = T.order_added;
        else reply += '\\n\\n' + T.added_suffix;
      }
    } catch(e) {}
  }
  addBotMsg(reply);
  // Voice output
  if (speechSynth && isRecording) speakText(reply);
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
applyTranslations();
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
