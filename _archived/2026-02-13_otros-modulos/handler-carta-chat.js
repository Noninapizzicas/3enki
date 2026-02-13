/**
 * carta-chat.js
 * Handler conversacional para gestión de cartas via chat.
 *
 * Escucha mensajes del chat y ejecuta operaciones sobre las cartas:
 * - Comandos directos: /carta, /carta listar, /carta precios...
 * - Lenguaje natural via AI: "sube un 10% las pizzas", "crea carta nocturna"
 *
 * Usa CartaManager como motor y ai-gateway para NLU.
 */

const path = require('path');

// Ruta relativa al módulo — se resuelve en handle()
const CARTA_MANAGER_PATH = '../../../../modules/pizzepos/menu-generator/lib/carta-manager';
const STORAGE_PATH = path.resolve(__dirname, '../storage');

// Instancia compartida entre ejecuciones (se inicializa lazy)
let _manager = null;

function getManager(logger) {
  if (!_manager) {
    const CartaManager = require(CARTA_MANAGER_PATH);
    _manager = new CartaManager(STORAGE_PATH, logger);
    _manager.load();
  }
  return _manager;
}

module.exports = {
  name: 'carta-chat',
  description: 'Gestión conversacional de cartas de pizzepos',
  trigger: 'chat.send.request',

  filter(event) {
    const data = event.data || event;
    const texto = (data.content || '').trim().toLowerCase();
    // Capturar comandos /carta y mensajes que mencionan carta/menú/precio/producto
    if (texto.startsWith('/carta')) return true;
    if (texto.startsWith('/menu')) return true;
    return false;
  },

  async handle(event, { services, logger, emit, config, store }) {
    const data = event.data || event;
    const texto = (data.content || '').trim();
    const chatId = data.chatId || data.chat_id;
    const botName = config?.telegram?.botName || data.botName;

    const manager = getManager(logger);

    logger.info('carta-chat.received', { texto, chatId });

    try {
      let respuesta;

      // Comandos directos (rápidos, sin IA)
      if (texto.toLowerCase().startsWith('/carta')) {
        respuesta = await ejecutarComando(texto, manager, logger);
      } else if (texto.toLowerCase().startsWith('/menu')) {
        respuesta = await ejecutarComando(texto.replace(/^\/menu/i, '/carta'), manager, logger);
      }

      if (respuesta) {
        enviarRespuesta(emit, chatId, botName, respuesta);
      }

    } catch (err) {
      logger.error('carta-chat.error', { error: err.message, stack: err.stack });
      enviarRespuesta(emit, chatId, botName, `Error: ${err.message}`);
    }
  }
};

// ==========================================
// Comandos directos
// ==========================================

async function ejecutarComando(texto, manager, logger) {
  const partes = texto.replace(/^\/carta\s*/i, '').trim();
  const cmd = partes.split(/\s+/)[0]?.toLowerCase() || '';
  const args = partes.slice(cmd.length).trim();

  logger.info('carta-chat.command', { cmd: cmd || 'resumen', args });

  switch (cmd) {
    case '':
    case 'resumen':
      return cmdResumen(manager);

    case 'listar':
      return cmdListar(manager);

    case 'ver':
      return cmdVer(manager, args);

    case 'productos':
      return cmdProductos(manager, args);

    case 'categorias':
      return cmdCategorias(manager, args);

    case 'ingredientes':
      return cmdIngredientes(manager);

    case 'precios':
      return cmdPrecios(manager, args, logger);

    case 'regla':
      return cmdRegla(manager, args, logger);

    case 'nueva':
      return cmdNueva(manager, args, logger);

    case 'duplicar':
      return cmdDuplicar(manager, args, logger);

    case 'eliminar':
      return cmdEliminar(manager, args, logger);

    case 'programar':
      return cmdProgramar(manager, args, logger);

    case 'programacion':
      return cmdProgramacion(manager);

    case 'alergenos':
      return cmdAlergenos(manager, args);

    case 'help':
    case 'ayuda':
      return cmdAyuda();

    default:
      return `Comando no reconocido: "${cmd}"\n\nUsa /carta ayuda para ver comandos disponibles.`;
  }
}

// ==========================================
// Implementación de comandos
// ==========================================

function cmdResumen(manager) {
  const resumen = manager.resumen();
  let msg = `📋 *Estado del sistema de cartas*\n\n`;
  msg += `🧂 Ingredientes: ${resumen.ingredientes}\n`;
  msg += `📜 Cartas: ${resumen.cartas.length}\n`;
  msg += `📅 Programaciones: ${resumen.programacion}\n`;
  msg += `✅ Por defecto: ${resumen.por_defecto}\n\n`;

  if (resumen.cartas.length > 0) {
    msg += `*Cartas disponibles:*\n`;
    for (const c of resumen.cartas) {
      msg += `  • ${c.id} — ${c.nombre} (${c.productos} productos, v${c.version})\n`;
    }
  }
  return msg;
}

function cmdListar(manager) {
  const cartas = manager.listarCartas();
  if (cartas.length === 0) return 'No hay cartas creadas.';

  let msg = `📜 *Cartas disponibles (${cartas.length}):*\n\n`;
  for (const c of cartas) {
    msg += `• *${c.id}*\n`;
    msg += `  ${c.nombre}\n`;
    msg += `  ${c.productos} productos, ${c.categorias} categorías, ${c.reglas} reglas\n`;
    msg += `  v${c.version} — ${c.updated_at}\n\n`;
  }
  return msg;
}

function cmdVer(manager, args) {
  const cartaId = args.trim() || 'carta_principal';
  const carta = manager.obtenerCarta(cartaId);
  if (!carta) return `Carta "${cartaId}" no encontrada.`;

  let msg = `📋 *${carta.meta.nombre}* (v${carta.meta.version})\n`;
  msg += `ID: ${carta.meta.id} | Idioma: ${carta.meta.idioma}\n\n`;

  msg += `*Categorías (${carta.categorias.length}):*\n`;
  for (const cat of carta.categorias.sort((a, b) => a.orden - b.orden)) {
    const prods = carta.productos.filter(p => p.categoria === cat.id);
    msg += `  ${cat.emoji} ${cat.nombre} (${prods.length})\n`;
  }

  msg += `\n*Productos (${carta.productos.length}):*\n`;
  for (const cat of carta.categorias.sort((a, b) => a.orden - b.orden)) {
    const prods = carta.productos.filter(p => p.categoria === cat.id);
    if (prods.length === 0) continue;
    msg += `\n${cat.emoji} *${cat.nombre}*\n`;
    for (const p of prods) {
      msg += `  ${p.emoji || ''} ${p.nombre} — ${p.precio.toFixed(2)}€\n`;
    }
  }

  if (carta.reglas && carta.reglas.length > 0) {
    msg += `\n*Reglas (${carta.reglas.length}):*\n`;
    for (const r of carta.reglas) {
      msg += `  ${r.activa ? '✅' : '❌'} ${r.nombre} (prioridad: ${r.prioridad})\n`;
    }
  }

  return msg;
}

function cmdProductos(manager, args) {
  const cartaId = args.trim() || 'carta_principal';
  const carta = manager.obtenerCarta(cartaId);
  if (!carta) return `Carta "${cartaId}" no encontrada.`;

  let msg = `🍕 *Productos de ${carta.meta.nombre}:*\n\n`;
  for (const cat of carta.categorias.sort((a, b) => a.orden - b.orden)) {
    const prods = carta.productos.filter(p => p.categoria === cat.id);
    if (prods.length === 0) continue;
    msg += `${cat.emoji} *${cat.nombre}*\n`;
    for (const p of prods) {
      const ings = p.ingredientes.length > 0 ? ` (${p.ingredientes.length} ing.)` : '';
      msg += `  ${p.emoji || ''} ${p.nombre} — ${p.precio.toFixed(2)}€${ings}\n`;
    }
    msg += '\n';
  }
  return msg;
}

function cmdCategorias(manager, args) {
  const cartaId = args.trim() || 'carta_principal';
  const carta = manager.obtenerCarta(cartaId);
  if (!carta) return `Carta "${cartaId}" no encontrada.`;

  let msg = `📂 *Categorías de ${carta.meta.nombre}:*\n\n`;
  for (const cat of carta.categorias.sort((a, b) => a.orden - b.orden)) {
    const count = carta.productos.filter(p => p.categoria === cat.id).length;
    msg += `  ${cat.orden}. ${cat.emoji} ${cat.nombre} — ${count} productos\n`;
  }
  return msg;
}

function cmdIngredientes(manager) {
  const ingredientes = manager.listarIngredientes();
  if (ingredientes.length === 0) return 'No hay ingredientes registrados.';

  let msg = `🧂 *Ingredientes (${ingredientes.length}):*\n\n`;

  // Agrupar por tipo
  const porTipo = {};
  for (const ing of ingredientes) {
    const tipo = ing.tipo || 'otro';
    if (!porTipo[tipo]) porTipo[tipo] = [];
    porTipo[tipo].push(ing);
  }

  for (const [tipo, ings] of Object.entries(porTipo)) {
    msg += `*${tipo}:*\n`;
    for (const ing of ings) {
      const alerg = ing.alergenos.length > 0 ? ` ⚠️ ${ing.alergenos.join(', ')}` : '';
      const extra = ing.precio_extra > 0 ? ` (+${ing.precio_extra.toFixed(2)}€)` : '';
      msg += `  ${ing.emoji} ${ing.nombre}${extra}${alerg}\n`;
    }
    msg += '\n';
  }
  return msg;
}

/**
 * /carta precios +10% pizzas
 * /carta precios -5% cat_bebidas
 * /carta precios +15% carta_glovo
 * /carta precios =9.99 prod_margherita
 */
function cmdPrecios(manager, args, logger) {
  const match = args.match(/^([+-=])(\d+(?:\.\d+)?)(%)?\s+(.+)$/);
  if (!match) {
    return 'Uso: /carta precios [+-=]VALOR[%] DESTINO\n\n' +
      'Ejemplos:\n' +
      '  /carta precios +10% cat_pizzas\n' +
      '  /carta precios -5% carta_principal\n' +
      '  /carta precios =9.99 prod_margherita';
  }

  const signo = match[1];
  const valor = parseFloat(match[2]);
  const esPorcentaje = match[3] === '%';
  const destino = match[4].trim();

  // Determinar en qué carta operar
  let cartaId = 'carta_principal';
  let filtro = destino;

  // Si el destino es una carta
  if (destino.startsWith('carta_')) {
    cartaId = destino;
    filtro = null;
  }

  const carta = manager.obtenerCarta(cartaId);
  if (!carta) return `Carta "${cartaId}" no encontrada.`;

  let productosAfectados = carta.productos;

  // Filtrar por categoría o producto
  if (filtro) {
    if (filtro.startsWith('cat_')) {
      productosAfectados = carta.productos.filter(p => p.categoria === filtro);
    } else if (filtro.startsWith('prod_')) {
      productosAfectados = carta.productos.filter(p => p.id === filtro);
    } else {
      // Buscar por nombre de categoría
      const cat = carta.categorias.find(c =>
        c.nombre.toLowerCase().includes(filtro.toLowerCase())
      );
      if (cat) {
        productosAfectados = carta.productos.filter(p => p.categoria === cat.id);
      } else {
        // Buscar por nombre de producto
        productosAfectados = carta.productos.filter(p =>
          p.nombre.toLowerCase().includes(filtro.toLowerCase())
        );
      }
    }
  }

  if (productosAfectados.length === 0) {
    return `No se encontraron productos para "${filtro || destino}".`;
  }

  const cambios = [];
  for (const prod of productosAfectados) {
    const anterior = prod.precio;
    if (signo === '=') {
      prod.precio = valor;
    } else if (esPorcentaje) {
      const ajuste = prod.precio * (valor / 100) * (signo === '+' ? 1 : -1);
      prod.precio = Math.round((prod.precio + ajuste) * 100) / 100;
    } else {
      prod.precio = Math.round((prod.precio + valor * (signo === '+' ? 1 : -1)) * 100) / 100;
    }
    cambios.push(`${prod.nombre}: ${anterior.toFixed(2)}€ → ${prod.precio.toFixed(2)}€`);
  }

  manager.guardarCarta(carta);

  logger.info('carta-chat.precios_updated', {
    carta: cartaId,
    destino,
    cambios: productosAfectados.length
  });

  let msg = `💰 *Precios actualizados (${cambios.length}):*\n\n`;
  for (const c of cambios) {
    msg += `  • ${c}\n`;
  }
  msg += `\nCarta "${cartaId}" guardada (v${carta.meta.version}).`;
  return msg;
}

/**
 * /carta regla nueva <nombre> canal=<canal> precio=<+/-X%>
 * /carta regla listar [carta_id]
 * /carta regla eliminar <regla_id> [carta_id]
 */
function cmdRegla(manager, args, logger) {
  const subCmd = args.split(/\s+/)[0]?.toLowerCase() || '';
  const subArgs = args.slice(subCmd.length).trim();

  if (subCmd === 'listar' || subCmd === '') {
    const cartaId = subArgs.trim() || 'carta_principal';
    const carta = manager.obtenerCarta(cartaId);
    if (!carta) return `Carta "${cartaId}" no encontrada.`;
    if (!carta.reglas || carta.reglas.length === 0) {
      return `Carta "${cartaId}" no tiene reglas.`;
    }
    let msg = `📏 *Reglas de ${carta.meta.nombre}:*\n\n`;
    for (const r of carta.reglas) {
      msg += `• *${r.id}* — ${r.nombre}\n`;
      msg += `  ${r.activa ? '✅ Activa' : '❌ Inactiva'} | Prioridad: ${r.prioridad}\n`;
      if (r.condiciones) msg += `  Condiciones: ${JSON.stringify(r.condiciones)}\n`;
      if (r.efectos) msg += `  Efectos: ${JSON.stringify(r.efectos)}\n`;
      msg += '\n';
    }
    return msg;
  }

  if (subCmd === 'nueva') {
    // Parsear: nombre canal=X zona=Y precio=+X% categorias=cat_a,cat_b
    const nombre = subArgs.match(/^"([^"]+)"|^(\S+)/);
    if (!nombre) return 'Uso: /carta regla nueva "Nombre" canal=X precio=+10%';

    const reglaId = 'regla_' + Date.now().toString(36);
    const regla = {
      id: reglaId,
      nombre: nombre[1] || nombre[2],
      activa: true,
      prioridad: 10,
      condiciones: {},
      efectos: {}
    };

    // Parsear key=value
    const pares = subArgs.matchAll(/(\w+)=([^\s]+)/g);
    for (const [, key, val] of pares) {
      switch (key) {
        case 'canal':
          regla.condiciones.canal = val.split(',');
          break;
        case 'zona':
          regla.condiciones.zona = val.split(',');
          break;
        case 'categorias':
          regla.condiciones.categorias = val.split(',');
          break;
        case 'productos':
          regla.condiciones.productos = val.split(',');
          break;
        case 'horario': {
          const [desde, hasta] = val.split('-');
          regla.condiciones.horario = { desde, hasta };
          break;
        }
        case 'dias':
          regla.condiciones.dias = val.split(',');
          break;
        case 'precio':
          regla.efectos.precio = val;
          break;
        case 'precio_fijo':
          regla.efectos.precio_fijo = parseFloat(val);
          break;
        case 'disponible':
          regla.efectos.disponible = val === 'true';
          break;
        case 'etiqueta':
          regla.efectos.etiqueta = val.replace(/_/g, ' ');
          break;
        case 'prioridad':
          regla.prioridad = parseInt(val, 10);
          break;
        case 'carta':
          // handled below
          break;
      }
    }

    const cartaId = subArgs.match(/carta=(\S+)/)?.[1] || 'carta_principal';
    const carta = manager.obtenerCarta(cartaId);
    if (!carta) return `Carta "${cartaId}" no encontrada.`;

    if (!carta.reglas) carta.reglas = [];
    carta.reglas.push(regla);
    manager.guardarCarta(carta);

    logger.info('carta-chat.regla_created', { reglaId, cartaId });
    return `✅ Regla "${regla.nombre}" creada en ${cartaId}\n\nID: ${reglaId}\nCondiciones: ${JSON.stringify(regla.condiciones)}\nEfectos: ${JSON.stringify(regla.efectos)}`;
  }

  if (subCmd === 'eliminar') {
    const partes = subArgs.split(/\s+/);
    const reglaId = partes[0];
    const cartaId = partes[1] || 'carta_principal';
    if (!reglaId) return 'Uso: /carta regla eliminar <regla_id> [carta_id]';

    const carta = manager.obtenerCarta(cartaId);
    if (!carta) return `Carta "${cartaId}" no encontrada.`;
    if (!carta.reglas) return 'La carta no tiene reglas.';

    const antes = carta.reglas.length;
    carta.reglas = carta.reglas.filter(r => r.id !== reglaId);

    if (carta.reglas.length === antes) return `Regla "${reglaId}" no encontrada.`;

    manager.guardarCarta(carta);
    logger.info('carta-chat.regla_deleted', { reglaId, cartaId });
    return `🗑️ Regla "${reglaId}" eliminada de ${cartaId}.`;
  }

  if (subCmd === 'activar' || subCmd === 'desactivar') {
    const partes = subArgs.split(/\s+/);
    const reglaId = partes[0];
    const cartaId = partes[1] || 'carta_principal';
    if (!reglaId) return `Uso: /carta regla ${subCmd} <regla_id> [carta_id]`;

    const carta = manager.obtenerCarta(cartaId);
    if (!carta || !carta.reglas) return 'Carta o reglas no encontradas.';

    const regla = carta.reglas.find(r => r.id === reglaId);
    if (!regla) return `Regla "${reglaId}" no encontrada.`;

    regla.activa = subCmd === 'activar';
    manager.guardarCarta(carta);
    return `${subCmd === 'activar' ? '✅' : '❌'} Regla "${regla.nombre}" ${subCmd === 'activar' ? 'activada' : 'desactivada'}.`;
  }

  return 'Subcomandos: listar, nueva, eliminar, activar, desactivar';
}

function cmdNueva(manager, args, logger) {
  const match = args.match(/^(\S+)\s+"?([^"]+)"?$/);
  if (!match) {
    return 'Uso: /carta nueva <id> "Nombre de la carta"\n\nEjemplo: /carta nueva carta_nocturna "Carta Nocturna"';
  }

  const id = match[1];
  const nombre = match[2];

  const carta = {
    meta: {
      id,
      nombre,
      version: 0,
      idioma: 'es',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    categorias: [],
    productos: [],
    reglas: []
  };

  manager.guardarCarta(carta);
  logger.info('carta-chat.carta_created', { id });
  return `✅ Carta "${nombre}" creada (${id}).\n\nEstá vacía. Usa /carta duplicar o añade productos.`;
}

function cmdDuplicar(manager, args, logger) {
  const match = args.match(/^(\S+)\s+(\S+)\s*"?([^"]*)"?$/);
  if (!match) {
    return 'Uso: /carta duplicar <origen> <nuevo_id> "Nuevo nombre"\n\nEjemplo: /carta duplicar carta_principal carta_glovo "Carta Glovo"';
  }

  const [, origen, nuevoId, nuevoNombre] = match;
  const carta = manager.duplicarCarta(origen, nuevoId, nuevoNombre || nuevoId);

  logger.info('carta-chat.carta_duplicated', { origen, nuevoId });
  return `✅ Carta duplicada: ${origen} → ${nuevoId}\n"${carta.meta.nombre}" con ${carta.productos.length} productos.`;
}

function cmdEliminar(manager, args, logger) {
  const cartaId = args.trim();
  if (!cartaId) return 'Uso: /carta eliminar <carta_id>';
  if (cartaId === 'carta_principal') return '⚠️ No se puede eliminar la carta principal.';

  manager.eliminarCarta(cartaId);
  logger.info('carta-chat.carta_deleted', { cartaId });
  return `🗑️ Carta "${cartaId}" eliminada.`;
}

/**
 * /carta programar <carta_id> canal=X horario=HH:MM-HH:MM dias=L,M,X prioridad=N
 */
function cmdProgramar(manager, args, logger) {
  const partes = args.split(/\s+/);
  const cartaId = partes[0];
  if (!cartaId) {
    return 'Uso: /carta programar <carta_id> canal=X horario=HH:MM-HH:MM dias=L,M,X\n\n' +
      'Ejemplo: /carta programar carta_nocturna dias=V,S horario=23:00-03:00 prioridad=20';
  }

  const prog = {
    id: 'prog_' + Date.now().toString(36),
    carta: cartaId,
    activa: true,
    prioridad: 10,
    cuando: {},
    donde: {}
  };

  const kvPares = args.matchAll(/(\w+)=([^\s]+)/g);
  for (const [, key, val] of kvPares) {
    switch (key) {
      case 'canal':
        prog.donde.canal = val.split(',');
        break;
      case 'zona':
        prog.donde.zona = val.split(',');
        break;
      case 'horario': {
        const [desde, hasta] = val.split('-');
        prog.cuando.horario = { desde, hasta };
        break;
      }
      case 'dias':
        prog.cuando.dias = val.split(',');
        break;
      case 'fechas': {
        const [desde, hasta] = val.split('-');
        prog.cuando.fechas = { desde, hasta };
        break;
      }
      case 'prioridad':
        prog.prioridad = parseInt(val, 10);
        break;
      case 'display_alergenos':
        prog.display = { mostrar_alergenos: val === 'true' };
        break;
    }
  }

  manager.agregarProgramacion(prog);
  logger.info('carta-chat.programacion_created', { progId: prog.id, cartaId });
  return `📅 Programación creada:\n\nID: ${prog.id}\nCarta: ${cartaId}\nCuándo: ${JSON.stringify(prog.cuando)}\nDónde: ${JSON.stringify(prog.donde)}\nPrioridad: ${prog.prioridad}`;
}

function cmdProgramacion(manager) {
  const progs = manager.listarProgramacion();
  if (progs.length === 0) return 'No hay programaciones. Usa /carta programar <carta_id> ...';

  let msg = `📅 *Programaciones (${progs.length}):*\n\n`;
  for (const p of progs) {
    msg += `• *${p.id}*\n`;
    msg += `  Carta: ${p.carta} | ${p.activa ? '✅' : '❌'} | Prioridad: ${p.prioridad}\n`;
    if (p.cuando && Object.keys(p.cuando).length > 0) msg += `  Cuándo: ${JSON.stringify(p.cuando)}\n`;
    if (p.donde && Object.keys(p.donde).length > 0) msg += `  Dónde: ${JSON.stringify(p.donde)}\n`;
    if (p.display) msg += `  Display: ${JSON.stringify(p.display)}\n`;
    msg += '\n';
  }
  return msg;
}

function cmdAlergenos(manager, args) {
  const destino = args.trim() || '';

  // Alérgenos de un producto concreto
  if (destino.startsWith('prod_')) {
    const carta = manager.obtenerCarta('carta_principal');
    if (!carta) return 'Carta principal no encontrada.';
    const prod = carta.productos.find(p => p.id === destino);
    if (!prod) return `Producto "${destino}" no encontrado.`;

    const alergenos = manager.calcularAlergenos(prod.ingredientes);
    return `⚠️ *Alérgenos de ${prod.nombre}:*\n\n${alergenos.length > 0 ? alergenos.join(', ') : 'Ninguno'}`;
  }

  // Alérgenos de toda la carta
  const cartaId = destino || 'carta_principal';
  const carta = manager.obtenerCarta(cartaId);
  if (!carta) return `Carta "${cartaId}" no encontrada.`;

  let msg = `⚠️ *Alérgenos de ${carta.meta.nombre}:*\n\n`;
  for (const prod of carta.productos) {
    const alergenos = manager.calcularAlergenos(prod.ingredientes);
    if (alergenos.length > 0) {
      msg += `${prod.emoji || ''} ${prod.nombre}: ${alergenos.join(', ')}\n`;
    }
  }
  return msg;
}

function cmdAyuda() {
  return `📋 *Comandos de carta:*

*Consultas:*
  /carta — Resumen del sistema
  /carta listar — Listar cartas
  /carta ver [id] — Ver carta detallada
  /carta productos [id] — Productos de una carta
  /carta categorias [id] — Categorías
  /carta ingredientes — Catálogo de ingredientes
  /carta alergenos [prod_id|carta_id] — Ver alérgenos
  /carta programacion — Ver programaciones

*Precios:*
  /carta precios +10% pizzas — Subir 10% a pizzas
  /carta precios -5% cat_bebidas — Bajar 5% bebidas
  /carta precios =9.99 prod_margherita — Precio fijo

*Reglas:*
  /carta regla listar [carta_id]
  /carta regla nueva "Nombre" canal=X precio=+10%
  /carta regla eliminar <id> [carta_id]
  /carta regla activar|desactivar <id>

*Cartas:*
  /carta nueva <id> "Nombre"
  /carta duplicar <origen> <nuevo_id> "Nombre"
  /carta eliminar <id>

*Programación:*
  /carta programar <carta_id> canal=X horario=HH:MM-HH:MM dias=L,M,X

*Nota:* Si no se especifica carta, opera sobre carta_principal.`;
}

// ==========================================
// Utilidades
// ==========================================

function enviarRespuesta(emit, chatId, botName, texto) {
  if (chatId && botName) {
    emit('telegram.send_message.request', {
      botName,
      chatId,
      text: texto,
      parse_mode: 'Markdown'
    });
  }
  // También emitir como evento genérico para otros consumers
  emit('carta.respuesta', { chatId, texto });
}
