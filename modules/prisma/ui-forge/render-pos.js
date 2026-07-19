/**
 * render-pos — la primera salida del taller: el POS de DOS ZONAS dirigido por el ProductoUniversal.
 *
 * DETERMINISTA (v0.1, sin LLM). Proyecta el catálogo a la vista POS y compone un bundle
 * interactivo (HTML+CSS+JS vanilla, piel teal):
 *   - grid de productos; cada botón tiene DOS ZONAS:
 *       cuerpo  → añadir rápido (con defaults)
 *       franja  → personalizar (OpcionesRenderer), SOLO si el producto declara opciones
 *   - OpcionesRenderer dibuja el control según opciones[].modo (ELEGIR_UNO/VARIOS/QUITAR/LIBRE)
 *   - carrito cliente + total en céntimos (tasa con los deltas de la selección)
 *   - Cobrar → resumen + método de pago (v0.1 cliente; el enganche al backend carrito/cobro por
 *     el bus es follow-up — aquí queda el LUGAR marcado)
 * La lógica de qué controles salen NO se copia de pizzepos: se DERIVA del producto.
 */

'use strict';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── proyección server-side: catálogo → vista POS (conserva opciones con modo+deltas en céntimos) ──
function _delta(v) { return Number.isInteger(v.delta_centimos) ? v.delta_centimos : Math.round((v.delta_precio || 0) * 100); }

function _opcionesPOS(p) {
  const ops = (p.contrato && Array.isArray(p.contrato.opciones)) ? p.contrato.opciones : (Array.isArray(p.opciones) ? p.opciones : []);
  const out = [];
  for (const o of ops) {
    const esLibre = o.modo === 'LIBRE' || o.sub_forma === 'personalizacion_libre';
    const valores = (Array.isArray(o.valores) ? o.valores : []).filter(v => v && v.disponible !== false)
      .map(v => ({ id: v.id, etiqueta: v.etiqueta, delta_centimos: _delta(v) }));
    if (!esLibre && valores.length === 0) continue;
    out.push({ id: o.id, etiqueta: o.etiqueta, modo: o.modo || (esLibre ? 'LIBRE' : 'ELEGIR_UNO'), valores });
  }
  return out;
}

function _precioCentimos(p) {
  if (Number.isInteger(p.precio_base_centimos)) return p.precio_base_centimos;
  const attrs = (p.contrato && Array.isArray(p.contrato.atributos_saber)) ? p.contrato.atributos_saber : [];
  const precio = attrs.find(a => a && String(a.nombre).toLowerCase() === 'precio');
  if (precio && typeof precio.valor === 'number') return Math.round(precio.valor * 100);
  return null; // consultar
}

function _proyectarPOS(catalogo) {
  const cats = (Array.isArray(catalogo && catalogo.categorias) ? catalogo.categorias : []).slice()
    .sort((a, b) => (a.orden || 0) - (b.orden || 0))
    .map(c => ({ id: c.id, nombre: c.nombre || c.id }));
  const productos = (Array.isArray(catalogo && catalogo.productos) ? catalogo.productos : []).map(p => {
    const idn = p.identidad || {};
    const ejes = p.ejes || {};
    const nat = p.naturalezas || {};
    const restr = Array.isArray(p.restricciones) ? p.restricciones : [];
    return {
      id: p.id,
      nombre: p.nombre || idn.que_es || 'Producto',
      categoria_id: p.categoria_id || null,
      precio_centimos: _precioCentimos(p),
      origen: nat.origen === 'elaborado' ? 'elaborado' : 'de_reventa',
      requiere_cita: !!(ejes.tiempo && ejes.tiempo !== 'ninguno'),
      avisos: restr.filter(r => r && r.tipo === 'verdad_obligatoria').map(r => r.regla),
      opciones: _opcionesPOS(p)
    };
  }).filter(p => p.nombre);
  return { comercio: { nombre: (catalogo.meta && catalogo.meta.nombre) || 'Comercio' }, categorias: cats, productos };
}

function renderPOS(catalogo, marca) {
  const vista = _proyectarPOS(catalogo);
  const visual = (marca && marca.visual) || {};
  const colores = visual.colores || {};
  const accent = colores.primario || colores.principal || colores.acento || '#14b8a6';
  const nombre = vista.comercio.nombre;
  // el catálogo viaja EMBEBIDO (snapshot, como el escaparate): la lógica es cliente; regenerar al cambiar.
  const DATA = JSON.stringify(vista).replace(/</g, '\\u003c');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(nombre)} — POS</title>
<style>
:root{--bg:#0d1512;--bg2:#111e1a;--surface:#16241f;--surface2:#1b2c26;--text:#eaf2ef;--muted:#94aaa3;
--line:rgba(255,255,255,.09);--accent:${esc(accent)};--ink:#04120e;--radius:14px}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
display:flex;flex-direction:column;height:100vh;max-width:520px;margin:0 auto}
header{display:flex;align-items:center;gap:.6rem;padding:.8rem 1rem;background:var(--bg2);border-bottom:1px solid var(--line)}
header .dot{width:9px;height:9px;border-radius:50%;background:var(--accent)}
header .name{font-weight:700}header .tag{margin-left:auto;font-size:.66rem;font-weight:700;padding:.15rem .55rem;border-radius:999px;background:rgba(20,184,166,.16);color:var(--accent)}
.cats{display:flex;gap:.4rem;overflow-x:auto;padding:.6rem 1rem;border-bottom:1px solid var(--line);scrollbar-width:none}
.cats::-webkit-scrollbar{display:none}
.cats button{flex:0 0 auto;background:var(--surface);border:1px solid var(--line);color:var(--muted);font-weight:600;font-size:.85rem;padding:.35rem .8rem;border-radius:999px}
.cats button.on{background:var(--accent);color:var(--ink);border-color:var(--accent)}
.grid{flex:1;overflow-y:auto;padding:.8rem;display:grid;grid-template-columns:1fr 1fr;gap:.6rem;align-content:start}
.prod{border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:var(--surface);display:flex;flex-direction:column}
.prod .main{padding:.7rem;text-align:left;background:none;border:0;color:var(--text);cursor:pointer;display:flex;flex-direction:column;gap:.3rem;min-height:74px}
.prod .main:active{background:var(--surface2)}
.prod .badge{align-self:flex-start;font-size:.63rem;font-weight:600;padding:.1rem .42rem;border-radius:999px;background:rgba(20,184,166,.16);color:var(--accent)}
.prod .badge.rev{background:#2a2f36;color:#c3ccd6}
.prod .n{font-weight:700;font-size:.9rem;line-height:1.2}
.prod .p{margin-top:auto;font-weight:700}.prod .p.cons{color:var(--muted);font-weight:600;font-size:.85rem}
.prod .opts{border-top:1px dashed var(--line);background:var(--surface2);color:var(--accent);font-weight:700;font-size:.76rem;padding:.4rem .7rem;text-align:left;cursor:pointer}
.prod .opts:active{background:#22362f}
.cart{background:var(--bg2);border-top:1px solid var(--line);max-height:46vh;display:flex;flex-direction:column}
.cart .lines{overflow-y:auto;padding:.4rem .9rem;min-height:2.2rem}
.line{display:flex;align-items:center;gap:.6rem;padding:.4rem 0;border-bottom:1px solid var(--line)}
.line:last-child{border-bottom:0}
.line .q{background:var(--surface2);border:1px solid var(--line);border-radius:8px;font-weight:700;font-size:.78rem;padding:.1rem .45rem;color:var(--accent)}
.line .nm{flex:1;font-size:.88rem}.line .nm small{color:var(--muted);font-size:.76rem}
.line .sub{font-weight:700;font-size:.88rem}.line .x{color:var(--muted);cursor:pointer;padding:0 .3rem}
.empty{color:var(--muted);text-align:center;padding:.6rem;font-size:.85rem}
.foot{padding:.7rem .9rem;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:.55rem}
.totalrow{display:flex;align-items:baseline}.totalrow .t{color:var(--muted);font-size:.85rem}.totalrow .v{margin-left:auto;font-size:1.35rem;font-weight:800}
.pays{display:flex;gap:.4rem}.pays button{flex:1;background:var(--surface);border:1px solid var(--line);color:var(--text);font-weight:600;font-size:.8rem;padding:.45rem 0;border-radius:10px}
.pays button.sel{border-color:var(--accent);color:var(--accent);background:rgba(20,184,166,.16)}
.cobrar{width:100%;background:var(--accent);color:var(--ink);border:0;font-weight:800;font-size:1rem;padding:.8rem;border-radius:12px}
.cobrar:disabled{opacity:.4}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:flex-end;z-index:20}
.modal.on{display:flex}
.sheet{background:var(--bg2);width:100%;max-width:520px;margin:0 auto;border-radius:16px 16px 0 0;padding:1rem;max-height:80vh;overflow-y:auto}
.sheet h3{margin:.1rem 0 .2rem}.sheet .sub{color:var(--muted);font-size:.85rem;margin:0 0 .8rem}
.opgroup{margin-bottom:.9rem}.opgroup h4{margin:0 0 .4rem;font-size:.9rem}
.opval{display:flex;align-items:center;gap:.5rem;padding:.4rem .2rem;border-bottom:1px solid var(--line);cursor:pointer}
.opval .d{margin-left:auto;color:var(--muted);font-size:.8rem}
.opval.sel{color:var(--accent)}
.opfree input{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:.5rem .7rem;font-size:.9rem}
.sheet .go{width:100%;margin-top:.6rem;background:var(--accent);color:var(--ink);border:0;font-weight:800;padding:.75rem;border-radius:12px;font-size:.95rem}
.avisos{font-size:.72rem;color:var(--muted);margin:.4rem 0 0}
</style></head><body>
<header><span class="dot"></span><span class="name">${esc(nombre)} · POS</span><span class="tag">prisma</span></header>
<nav class="cats" id="cats"></nav>
<div class="grid" id="grid"></div>
<div class="cart">
  <div class="lines" id="lines"><div class="empty">Toca un producto para empezar</div></div>
  <div class="foot">
    <div class="totalrow"><span class="t" id="cnt">0 artículos</span><span class="v" id="total">0,00 €</span></div>
    <div class="pays" id="pays"><button data-m="efectivo" class="sel">Efectivo</button><button data-m="tarjeta">Tarjeta</button><button data-m="bizum">Bizum</button></div>
    <button class="cobrar" id="cobrar" disabled>Cobrar</button>
  </div>
</div>
<div class="modal" id="modal"><div class="sheet" id="sheet"></div></div>

<script>
const DATA = ${DATA};
const eur = c => (c/100).toFixed(2).replace('.',',') + '\\u00a0€';
let cat = (DATA.categorias[0]||{}).id || null;
let metodo = 'efectivo';
const cart = []; // {key, id, nombre, cantidad, unit, detalle}
const byId = Object.fromEntries(DATA.productos.map(p=>[p.id,p]));
const escT = s => (s==null?'':String(s));

function prodsDe(c){ return DATA.productos.filter(p=>p.categoria_id===c); }
function renderCats(){
  document.getElementById('cats').innerHTML = DATA.categorias.map(c=>
    '<button data-c="'+escT(c.id)+'"'+(c.id===cat?' class="on"':'')+'>'+escT(c.nombre)+'</button>').join('');
}
function badge(p){ return p.requiere_cita ? '<span class="badge">cita</span>'
  : p.origen==='elaborado' ? '<span class="badge">elaborado</span>' : '<span class="badge rev">reventa</span>'; }
function precioLbl(p){ return p.precio_centimos==null ? '<span class="p cons">Consultar ▸</span>' : '<span class="p">'+eur(p.precio_centimos)+'</span>'; }
function renderGrid(){
  document.getElementById('grid').innerHTML = prodsDe(cat).map(p=>{
    const franja = (p.opciones&&p.opciones.length) ? '<button class="opts" data-op="'+escT(p.id)+'">⚙ Opciones ▸</button>' : '';
    return '<div class="prod"><button class="main" data-add="'+escT(p.id)+'">'+badge(p)+'<span class="n">'+escT(p.nombre)+'</span>'+precioLbl(p)+'</button>'+franja+'</div>';
  }).join('') || '<div class="empty">Sin productos en esta categoría</div>';
}
// tasa una selección: base + Σ deltas
function tasar(p, sel){ let c = p.precio_centimos||0; for(const o of (p.opciones||[])){ const chosen=(sel&&sel[o.id])||[]; for(const v of (o.valores||[])) if(chosen.includes(v.id)) c+=v.delta_centimos; } return c; }
function detalleTxt(p, sel){ const parts=[]; for(const o of (p.opciones||[])){ const ch=(sel&&sel[o.id])||[]; const libre=(sel&&sel['_libre_'+o.id]); if(libre) parts.push(escT(libre)); else if(ch.length){ const et=o.valores.filter(v=>ch.includes(v.id)).map(v=>v.etiqueta); if(et.length)parts.push(et.join(', ')); } } return parts.join(' · '); }
function defaults(p){ const sel={}; for(const o of (p.opciones||[])){ if(o.modo==='ELEGIR_UNO' && o.valores[0]) sel[o.id]=[o.valores[0].id]; } return sel; }
function addToCart(p, sel){ const unit=tasar(p,sel); const det=detalleTxt(p,sel); const key=p.id+'|'+det;
  const ex=cart.find(l=>l.key===key); if(ex) ex.cantidad++; else cart.push({key,id:p.id,nombre:p.nombre,cantidad:1,unit,detalle:det}); renderCart(); }
function renderCart(){
  const L=document.getElementById('lines');
  if(!cart.length){ L.innerHTML='<div class="empty">Toca un producto para empezar</div>'; }
  else L.innerHTML=cart.map((l,i)=>'<div class="line"><span class="q">'+l.cantidad+'×</span><span class="nm">'+escT(l.nombre)+(l.detalle?' <small>· '+escT(l.detalle)+'</small>':'')+'</span><span class="sub">'+eur(l.unit*l.cantidad)+'</span><span class="x" data-del="'+i+'">✕</span></div>').join('');
  const tot=cart.reduce((s,l)=>s+l.unit*l.cantidad,0), n=cart.reduce((s,l)=>s+l.cantidad,0);
  document.getElementById('total').textContent=eur(tot);
  document.getElementById('cnt').textContent=n+' artículo'+(n===1?'':'s');
  document.getElementById('cobrar').disabled = n===0;
  document.getElementById('cobrar').textContent = n===0 ? 'Cobrar' : 'Cobrar '+eur(tot);
}
// OpcionesRenderer: dibuja controles por modo (ELEGIR_UNO/VARIOS/QUITAR/LIBRE)
function abrirOpciones(p){
  const sel = defaults(p);
  const ctrl = o => {
    if(o.modo==='LIBRE'||!o.valores.length) return '<div class="opfree"><input data-free="'+escT(o.id)+'" placeholder="'+escT(o.etiqueta)+'…"></div>';
    return o.valores.map(v=>{ const on=(sel[o.id]||[]).includes(v.id);
      return '<div class="opval'+(on?' sel':'')+'" data-o="'+escT(o.id)+'" data-v="'+escT(v.id)+'" data-modo="'+o.modo+'"><span>'+(o.modo==='QUITAR'?'sin ':'')+escT(v.etiqueta)+'</span>'+(v.delta_centimos?'<span class="d">+'+eur(v.delta_centimos)+'</span>':'')+'</div>'; }).join('');
  };
  document.getElementById('sheet').innerHTML =
    '<h3>'+escT(p.nombre)+'</h3><p class="sub">Personaliza y añade</p>'+
    (p.opciones||[]).map(o=>'<div class="opgroup" data-grp="'+escT(o.id)+'"><h4>'+escT(o.etiqueta)+'</h4>'+ctrl(o)+'</div>').join('')+
    (p.avisos&&p.avisos.length?'<p class="avisos">Contiene: '+escT(p.avisos.join(' · '))+'</p>':'')+
    '<button class="go" id="go">Añadir '+eur(tasar(p,sel))+'</button>';
  document.getElementById('modal').classList.add('on');
  const sheet=document.getElementById('sheet');
  const refresh=()=>{ document.getElementById('go').textContent='Añadir '+eur(tasar(p,sel)); };
  sheet.querySelectorAll('.opval').forEach(el=>el.onclick=()=>{ const o=el.dataset.o,v=el.dataset.v,modo=el.dataset.modo; sel[o]=sel[o]||[];
    if(modo==='ELEGIR_UNO'){ sel[o]=[v]; sheet.querySelectorAll('.opval[data-o="'+o+'"]').forEach(e=>e.classList.toggle('sel',e.dataset.v===v)); }
    else { const i=sel[o].indexOf(v); if(i>=0){sel[o].splice(i,1);el.classList.remove('sel');} else {sel[o].push(v);el.classList.add('sel');} } refresh(); });
  sheet.querySelectorAll('input[data-free]').forEach(inp=>inp.oninput=()=>{ sel['_libre_'+inp.dataset.free]=inp.value; });
  document.getElementById('go').onclick=()=>{ addToCart(p,sel); cerrar(); };
}
function cerrar(){ document.getElementById('modal').classList.remove('on'); }
// Cobro (v0.1 cliente; enganche a carrito/cobro por el bus = follow-up marcado)
function abrirCobro(){
  const tot=cart.reduce((s,l)=>s+l.unit*l.cantidad,0);
  document.getElementById('sheet').innerHTML='<h3>Cobrar '+eur(tot)+'</h3><p class="sub">Método: '+metodo+'</p>'+
    '<div class="opgroup">'+cart.map(l=>'<div class="opval"><span>'+l.cantidad+'× '+escT(l.nombre)+'</span><span class="d">'+eur(l.unit*l.cantidad)+'</span></div>').join('')+'</div>'+
    '<button class="go" id="ok">Confirmar cobro</button>';
  document.getElementById('modal').classList.add('on');
  document.getElementById('ok').onclick=()=>{ /* TODO(bus): cobro.crear + cobro.confirmar → carrito.vaciar */ cart.length=0; renderCart(); cerrar(); };
}
// eventos (delegación)
document.getElementById('cats').onclick=e=>{ const b=e.target.closest('button'); if(!b)return; cat=b.dataset.c; renderCats(); renderGrid(); };
document.getElementById('grid').onclick=e=>{ const add=e.target.closest('[data-add]'), op=e.target.closest('[data-op]');
  if(op){ abrirOpciones(byId[op.dataset.op]); return; }
  if(add){ const p=byId[add.dataset.add]; if(p.precio_centimos==null||p.requiere_cita){ abrirOpciones(p); return; } addToCart(p, defaults(p)); } };
document.getElementById('lines').onclick=e=>{ const x=e.target.closest('[data-del]'); if(!x)return; cart.splice(+x.dataset.del,1); renderCart(); };
document.getElementById('pays').onclick=e=>{ const b=e.target.closest('button'); if(!b)return; metodo=b.dataset.m; document.querySelectorAll('#pays button').forEach(x=>x.classList.toggle('sel',x===b)); };
document.getElementById('cobrar').onclick=abrirCobro;
document.getElementById('modal').onclick=e=>{ if(e.target.id==='modal') cerrar(); };
renderCats(); renderGrid(); renderCart();
</script></body></html>`;
}

module.exports = { renderPOS, _proyectarPOS };
