/**
 * carta-manager.js
 * Motor de gestión de cartas: carga, resolución, reglas, alérgenos.
 *
 * Responsabilidades:
 *  - Cargar cartas e ingredientes desde JSON (filesystem = persistencia)
 *  - Resolver carta activa según contexto (hora, canal, zona, fecha)
 *  - Aplicar reglas de precio/disponibilidad
 *  - Calcular alérgenos desde ingredientes (solo cuando se piden)
 *  - Guardar cambios de vuelta a JSON
 *
 * NO es un módulo event-core. Es una librería que usa el módulo menu-generator.
 */

const fs = require('fs');
const path = require('path');

class CartaManager {

  /**
   * @param {string} storagePath - Ruta base: data/projects/pizzepos/storage/
   * @param {object} [logger] - Logger opcional (usa console si no hay)
   */
  constructor(storagePath, logger) {
    this.storagePath = storagePath;
    this.cartasDir = path.join(storagePath, 'cartas');
    this.ingredientesPath = path.join(storagePath, 'ingredientes.json');
    this.programacionPath = path.join(storagePath, 'programacion.json');
    this.logger = logger || console;

    // Cache en memoria (se carga desde disco)
    this._ingredientes = null;    // Map<id, ingrediente>
    this._programacion = null;    // objeto programacion.json
    this._cartas = new Map();     // Map<carta_id, carta_completa>
  }

  // ==========================================
  // Carga desde disco
  // ==========================================

  /**
   * Carga todo desde disco. Llamar al inicializar.
   */
  async load() {
    this._ingredientes = this._loadIngredientes();
    this._programacion = this._loadProgramacion();
    this._cartas = this._loadCartas();

    this.logger.info('carta-manager.loaded', {
      ingredientes: this._ingredientes.size,
      cartas: this._cartas.size,
      programaciones: this._programacion.programacion.length
    });
  }

  _readJSON(filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      this.logger.error('carta-manager.read_error', { path: filePath, error: err.message });
      return null;
    }
  }

  _writeJSON(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  _loadIngredientes() {
    const data = this._readJSON(this.ingredientesPath);
    if (!data || !data.ingredientes) return new Map();
    const map = new Map();
    for (const ing of data.ingredientes) {
      map.set(ing.id, ing);
    }
    return map;
  }

  _loadProgramacion() {
    const data = this._readJSON(this.programacionPath);
    return data || { meta: {}, por_defecto: 'carta_principal', programacion: [] };
  }

  _loadCartas() {
    const map = new Map();
    if (!fs.existsSync(this.cartasDir)) return map;

    const files = fs.readdirSync(this.cartasDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const carta = this._readJSON(path.join(this.cartasDir, file));
      if (carta && carta.meta && carta.meta.id) {
        map.set(carta.meta.id, carta);
      }
    }
    return map;
  }

  // ==========================================
  // Resolución de carta activa
  // ==========================================

  /**
   * Dado un contexto, devuelve la carta activa con precios resueltos.
   *
   * @param {object} contexto
   * @param {string} [contexto.canal]   - mesa, llevar, domicilio, glovo, whatsapp, qr, web
   * @param {string} [contexto.zona]    - terraza, interior, vip, barra, salon_privado
   * @param {Date}   [contexto.fecha]   - Fecha/hora (default: ahora)
   * @param {string} [contexto.idioma]  - Idioma para traducciones (default: carta.meta.idioma)
   * @param {boolean} [contexto.mostrar_alergenos] - Calcular y adjuntar alérgenos (default: false)
   * @returns {{ carta: object, programacion_aplicada: string|null }}
   */
  resolver(contexto = {}) {
    const ahora = contexto.fecha || new Date();
    const canal = contexto.canal || null;
    const zona = contexto.zona || null;
    const idioma = contexto.idioma || null;
    const mostrarAlergenos = contexto.mostrar_alergenos || false;

    // 1. Encontrar qué programación aplica
    const prog = this._resolverProgramacion(ahora, canal, zona);
    const cartaId = prog ? prog.carta : this._programacion.por_defecto;
    const cartaOriginal = this._cartas.get(cartaId);

    if (!cartaOriginal) {
      this.logger.warn('carta-manager.carta_not_found', { cartaId });
      return { carta: null, programacion_aplicada: null };
    }

    // 2. Clonar carta para no mutar la caché
    const carta = JSON.parse(JSON.stringify(cartaOriginal));

    // 3. Aplicar reglas internas de la carta
    this._aplicarReglas(carta, { canal, zona, ahora });

    // 4. Aplicar override_reglas de la programación (si hay)
    if (prog && prog.override_reglas) {
      this._aplicarReglasOverride(carta, prog.override_reglas, { canal, zona, ahora });
    }

    // 5. Filtrar productos no disponibles
    carta.productos = carta.productos.filter(p => p._disponible !== false);

    // 6. Calcular alérgenos si se pide (cara al público)
    if (mostrarAlergenos) {
      for (const producto of carta.productos) {
        producto.alergenos_calculados = this.calcularAlergenos(producto.ingredientes);
      }
    }

    // 7. Aplicar traducciones si idioma diferente al base
    if (idioma && idioma !== carta.meta.idioma) {
      this._aplicarTraducciones(carta, idioma);
    }

    // 8. Aplicar display de programación
    if (prog && prog.display) {
      carta._display = prog.display;
    }

    // 9. Limpiar campos internos
    for (const producto of carta.productos) {
      delete producto._disponible;
      delete producto._etiquetas;
    }

    return {
      carta,
      programacion_aplicada: prog ? prog.id : null
    };
  }

  /**
   * Resuelve qué programación aplica dado el contexto.
   * Devuelve la de mayor prioridad que cumpla todas sus condiciones.
   */
  _resolverProgramacion(ahora, canal, zona) {
    const candidatas = this._programacion.programacion
      .filter(p => p.activa !== false)
      .filter(p => this._cumpleCondiciones(p, ahora, canal, zona))
      .sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0));

    return candidatas.length > 0 ? candidatas[0] : null;
  }

  /**
   * Verifica si una programación cumple sus condiciones (cuando + donde).
   * Todas las condiciones definidas son AND.
   * Dentro de arrays es OR.
   */
  _cumpleCondiciones(prog, ahora, canal, zona) {
    const cuando = prog.cuando || {};
    const donde = prog.donde || {};

    // Días de la semana
    if (cuando.dias) {
      const diasMap = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
      const hoy = diasMap[ahora.getDay()];
      if (!cuando.dias.includes(hoy)) return false;
    }

    // Horario
    if (cuando.horario) {
      if (!this._dentroDeHorario(ahora, cuando.horario.desde, cuando.horario.hasta)) {
        return false;
      }
    }

    // Rango de fechas
    if (cuando.fechas) {
      const fechaStr = ahora.toISOString().slice(0, 10);
      if (cuando.fechas.desde && fechaStr < cuando.fechas.desde) return false;
      if (cuando.fechas.hasta && fechaStr > cuando.fechas.hasta) return false;
    }

    // Canal
    if (donde.canal) {
      if (!canal || !donde.canal.includes(canal)) return false;
    }

    // Zona
    if (donde.zona) {
      if (!zona || !donde.zona.includes(zona)) return false;
    }

    return true;
  }

  /**
   * Verifica si una hora está dentro de un rango.
   * Soporta rangos nocturnos (23:00 - 03:00).
   */
  _dentroDeHorario(ahora, desde, hasta) {
    const horaActual = ahora.getHours() * 60 + ahora.getMinutes();
    const [dh, dm] = desde.split(':').map(Number);
    const [hh, hm] = hasta.split(':').map(Number);
    const minDesde = dh * 60 + dm;
    const minHasta = hh * 60 + hm;

    if (minDesde <= minHasta) {
      // Rango normal: 12:00 - 16:00
      return horaActual >= minDesde && horaActual < minHasta;
    } else {
      // Rango nocturno: 23:00 - 03:00
      return horaActual >= minDesde || horaActual < minHasta;
    }
  }

  // ==========================================
  // Aplicación de reglas
  // ==========================================

  /**
   * Aplica las reglas internas de una carta a sus productos.
   */
  _aplicarReglas(carta, contexto) {
    if (!carta.reglas || carta.reglas.length === 0) return;

    const reglasActivas = carta.reglas
      .filter(r => r.activa !== false)
      .sort((a, b) => (a.prioridad || 0) - (b.prioridad || 0));

    for (const regla of reglasActivas) {
      const productosAfectados = this._filtrarProductosPorRegla(carta.productos, regla.condiciones, contexto);
      for (const producto of productosAfectados) {
        this._aplicarEfectos(producto, regla.efectos);
      }
    }
  }

  /**
   * Aplica override_reglas de la programación.
   */
  _aplicarReglasOverride(carta, overrideReglas, contexto) {
    for (const regla of overrideReglas) {
      const productosAfectados = this._filtrarProductosPorRegla(
        carta.productos,
        regla.condiciones || {},
        contexto
      );
      for (const producto of productosAfectados) {
        this._aplicarEfectos(producto, regla.efectos);
      }
    }
  }

  /**
   * Filtra productos que cumplen las condiciones de una regla.
   */
  _filtrarProductosPorRegla(productos, condiciones, contexto) {
    if (!condiciones) return productos;

    return productos.filter(p => {
      // Por categoría
      if (condiciones.categorias && !condiciones.categorias.includes(p.categoria)) {
        return false;
      }
      // Por producto específico
      if (condiciones.productos && !condiciones.productos.includes(p.id)) {
        return false;
      }
      // Por canal (viene del contexto, no del producto)
      if (condiciones.canal && contexto.canal && !condiciones.canal.includes(contexto.canal)) {
        return false;
      }
      // Por zona
      if (condiciones.zona && contexto.zona && !condiciones.zona.includes(contexto.zona)) {
        return false;
      }
      // Por horario
      if (condiciones.horario && contexto.ahora) {
        if (!this._dentroDeHorario(contexto.ahora, condiciones.horario.desde, condiciones.horario.hasta)) {
          return false;
        }
      }
      // Por días
      if (condiciones.dias && contexto.ahora) {
        const diasMap = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
        const hoy = diasMap[contexto.ahora.getDay()];
        if (!condiciones.dias.includes(hoy)) return false;
      }
      // Por fechas
      if (condiciones.fechas && contexto.ahora) {
        const fechaStr = contexto.ahora.toISOString().slice(0, 10);
        if (condiciones.fechas.desde && fechaStr < condiciones.fechas.desde) return false;
        if (condiciones.fechas.hasta && fechaStr > condiciones.fechas.hasta) return false;
      }
      return true;
    });
  }

  /**
   * Aplica efectos de una regla a un producto.
   */
  _aplicarEfectos(producto, efectos) {
    if (!efectos) return;

    // Precio porcentual
    if (efectos.precio && typeof efectos.precio === 'string') {
      const match = efectos.precio.match(/^([+-])(\d+(?:\.\d+)?)%$/);
      if (match) {
        const signo = match[1] === '+' ? 1 : -1;
        const porcentaje = parseFloat(match[2]);
        const ajuste = producto.precio * (porcentaje / 100) * signo;
        producto.precio = Math.round((producto.precio + ajuste) * 100) / 100;
      }
    }

    // Precio fijo
    if (efectos.precio_fijo !== undefined) {
      producto.precio = efectos.precio_fijo;
    }

    // Disponibilidad
    if (efectos.disponible !== undefined) {
      producto._disponible = efectos.disponible;
    }

    // Etiqueta
    if (efectos.etiqueta) {
      producto._etiquetas = producto._etiquetas || [];
      producto._etiquetas.push(efectos.etiqueta);
      producto.etiqueta = efectos.etiqueta;
    }

    // Descripción extra
    if (efectos.descripcion_extra) {
      producto.descripcion_extra = efectos.descripcion_extra;
    }
  }

  // ==========================================
  // Alérgenos
  // ==========================================

  /**
   * Calcula los alérgenos de un producto a partir de sus ingredientes.
   * Fuente de verdad: ingredientes.json
   *
   * @param {string[]} ingredienteIds - IDs de ingredientes del producto
   * @returns {string[]} - Alérgenos únicos ordenados
   */
  calcularAlergenos(ingredienteIds) {
    if (!ingredienteIds || ingredienteIds.length === 0) return [];

    const alergenosSet = new Set();
    for (const id of ingredienteIds) {
      const ing = this._ingredientes.get(id);
      if (ing && ing.alergenos) {
        for (const a of ing.alergenos) {
          alergenosSet.add(a);
        }
      }
    }
    return Array.from(alergenosSet).sort();
  }

  /**
   * Calcula alérgenos para un pedido concreto (base +extras -quitados).
   *
   * @param {string[]} ingredientesBase - IDs base del producto
   * @param {string[]} [quitar] - IDs a quitar
   * @param {string[]} [anadir] - IDs a añadir
   * @returns {string[]}
   */
  calcularAlergenosPedido(ingredientesBase, quitar = [], anadir = []) {
    const quitarSet = new Set(quitar);
    const ingredientesFinales = ingredientesBase
      .filter(id => !quitarSet.has(id))
      .concat(anadir);
    return this.calcularAlergenos(ingredientesFinales);
  }

  // ==========================================
  // Traducciones
  // ==========================================

  _aplicarTraducciones(carta, idioma) {
    for (const producto of carta.productos) {
      if (producto.traducciones && producto.traducciones[idioma]) {
        const trad = producto.traducciones[idioma];
        if (trad.nombre) producto.nombre = trad.nombre;
        if (trad.descripcion) producto.descripcion = trad.descripcion;
      }
    }
    for (const cat of carta.categorias) {
      if (cat.traducciones && cat.traducciones[idioma]) {
        const trad = cat.traducciones[idioma];
        if (trad.nombre) cat.nombre = trad.nombre;
      }
    }
  }

  // ==========================================
  // CRUD Cartas
  // ==========================================

  /**
   * Guarda una carta (nueva o existente) a disco.
   */
  guardarCarta(carta) {
    if (!carta.meta || !carta.meta.id) {
      throw new Error('Carta debe tener meta.id');
    }
    carta.meta.updated_at = new Date().toISOString();
    carta.meta.version = (carta.meta.version || 0) + 1;

    const filePath = path.join(this.cartasDir, `${carta.meta.id}.json`);
    this._writeJSON(filePath, carta);
    this._cartas.set(carta.meta.id, carta);

    this.logger.info('carta-manager.carta_saved', {
      id: carta.meta.id,
      version: carta.meta.version,
      productos: carta.productos.length
    });
    return carta;
  }

  /**
   * Obtiene una carta por ID (desde caché).
   */
  obtenerCarta(cartaId) {
    return this._cartas.get(cartaId) || null;
  }

  /**
   * Lista todas las cartas disponibles (resumen).
   */
  listarCartas() {
    return Array.from(this._cartas.values()).map(c => ({
      id: c.meta.id,
      nombre: c.meta.nombre,
      version: c.meta.version,
      idioma: c.meta.idioma,
      productos: c.productos.length,
      categorias: c.categorias.length,
      reglas: (c.reglas || []).length,
      updated_at: c.meta.updated_at
    }));
  }

  /**
   * Elimina una carta del disco y la caché.
   */
  eliminarCarta(cartaId) {
    const filePath = path.join(this.cartasDir, `${cartaId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this._cartas.delete(cartaId);
    this.logger.info('carta-manager.carta_deleted', { id: cartaId });
  }

  /**
   * Duplica una carta existente con nuevo ID y nombre.
   */
  duplicarCarta(cartaIdOrigen, nuevoId, nuevoNombre) {
    const original = this._cartas.get(cartaIdOrigen);
    if (!original) {
      throw new Error(`Carta '${cartaIdOrigen}' no encontrada`);
    }
    const copia = JSON.parse(JSON.stringify(original));
    copia.meta.id = nuevoId;
    copia.meta.nombre = nuevoNombre;
    copia.meta.version = 1;
    copia.meta.created_at = new Date().toISOString();
    return this.guardarCarta(copia);
  }

  // ==========================================
  // CRUD Ingredientes
  // ==========================================

  guardarIngredientes() {
    const data = {
      meta: {
        version: (this._ingredientesMeta?.version || 0) + 1,
        updated_at: new Date().toISOString(),
        alergenos_reconocidos: [
          'gluten', 'crustaceos', 'huevo', 'pescado',
          'cacahuete', 'soja', 'lactosa', 'frutos_secos',
          'apio', 'mostaza', 'sesamo', 'sulfitos',
          'altramuces', 'moluscos'
        ]
      },
      ingredientes: Array.from(this._ingredientes.values())
    };
    this._writeJSON(this.ingredientesPath, data);
    this.logger.info('carta-manager.ingredientes_saved', { count: this._ingredientes.size });
  }

  obtenerIngrediente(id) {
    return this._ingredientes.get(id) || null;
  }

  listarIngredientes() {
    return Array.from(this._ingredientes.values());
  }

  agregarIngrediente(ingrediente) {
    if (!ingrediente.id) {
      throw new Error('Ingrediente debe tener id');
    }
    this._ingredientes.set(ingrediente.id, ingrediente);
    this.guardarIngredientes();
    return ingrediente;
  }

  actualizarIngrediente(id, cambios) {
    const ing = this._ingredientes.get(id);
    if (!ing) throw new Error(`Ingrediente '${id}' no encontrado`);
    Object.assign(ing, cambios);
    this._ingredientes.set(id, ing);
    this.guardarIngredientes();
    return ing;
  }

  eliminarIngrediente(id) {
    this._ingredientes.delete(id);
    this.guardarIngredientes();
  }

  // ==========================================
  // CRUD Programación
  // ==========================================

  guardarProgramacion() {
    this._programacion.meta.updated_at = new Date().toISOString();
    this._writeJSON(this.programacionPath, this._programacion);
    this.logger.info('carta-manager.programacion_saved', {
      count: this._programacion.programacion.length
    });
  }

  agregarProgramacion(prog) {
    if (!prog.id || !prog.carta) {
      throw new Error('Programación debe tener id y carta');
    }
    // Verificar que la carta existe
    if (!this._cartas.has(prog.carta)) {
      throw new Error(`Carta '${prog.carta}' no encontrada`);
    }
    this._programacion.programacion.push(prog);
    this.guardarProgramacion();
    return prog;
  }

  actualizarProgramacion(progId, cambios) {
    const idx = this._programacion.programacion.findIndex(p => p.id === progId);
    if (idx === -1) throw new Error(`Programación '${progId}' no encontrada`);
    Object.assign(this._programacion.programacion[idx], cambios);
    this.guardarProgramacion();
    return this._programacion.programacion[idx];
  }

  eliminarProgramacion(progId) {
    this._programacion.programacion = this._programacion.programacion.filter(p => p.id !== progId);
    this.guardarProgramacion();
  }

  listarProgramacion() {
    return this._programacion.programacion;
  }

  // ==========================================
  // Utilidades
  // ==========================================

  /**
   * Resumen rápido del estado del sistema.
   */
  resumen() {
    return {
      ingredientes: this._ingredientes.size,
      cartas: this.listarCartas(),
      programacion: this._programacion.programacion.length,
      por_defecto: this._programacion.por_defecto
    };
  }
}

module.exports = CartaManager;
