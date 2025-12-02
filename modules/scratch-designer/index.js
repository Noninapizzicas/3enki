/**
 * Scratch Designer Module
 * Sistema de bloques tipo Scratch para diseño visual de UI
 * Output: JSON
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ScratchDesigner {
  constructor(core) {
    this.core = core;
    this.designs = new Map();
    this.blocksCache = null;

    // Cargar inventario del sistema
    this.inventory = this.loadInventory();

    // Generar paleta de bloques desde inventario
    this.blocks = this.generateBlockPalette();
  }

  // ============================================================
  // CARGA DE INVENTARIO
  // ============================================================

  loadInventory() {
    try {
      const inventoryPath = path.join(__dirname, '../../INVENTARIO-SISTEMA.json');
      const data = fs.readFileSync(inventoryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('[scratch-designer] Error loading inventory:', error.message);
      return null;
    }
  }

  // ============================================================
  // GENERACION DE PALETA DE BLOQUES
  // ============================================================

  generateBlockPalette() {
    if (!this.inventory) {
      return this.getDefaultBlocks();
    }

    return {
      categorias: this.getCategorias(),
      pantalla: this.generateScreenBlocks(),
      layout: this.generateLayoutBlocks(),
      contenedor: this.generateContainerBlocks(),
      componente: this.generateComponentBlocks(),
      modulo: this.generateModuleBlocks(),
      evento: this.generateEventBlocks(),
      accion: this.generateActionBlocks(),
      condicion: this.generateConditionBlocks(),
      datos: this.generateDataBlocks()
    };
  }

  getCategorias() {
    return {
      pantalla:    { color: "#9333EA", icono: "📱", nombre: "Pantalla" },
      layout:      { color: "#3B82F6", icono: "📐", nombre: "Layout" },
      contenedor:  { color: "#06B6D4", icono: "📦", nombre: "Contenedor" },
      componente:  { color: "#22C55E", icono: "🧩", nombre: "Componente" },
      modulo:      { color: "#F59E0B", icono: "⚡", nombre: "Modulo" },
      evento:      { color: "#EF4444", icono: "📡", nombre: "Evento" },
      accion:      { color: "#EC4899", icono: "▶️", nombre: "Accion" },
      condicion:   { color: "#F97316", icono: "❓", nombre: "Condicion" },
      datos:       { color: "#8B5CF6", icono: "💾", nombre: "Datos" }
    };
  }

  generateScreenBlocks() {
    return [
      {
        id: "screen",
        nombre: "Pantalla",
        categoria: "pantalla",
        forma: "hat",
        conexiones: { arriba: false, abajo: true },
        acepta_hijos: true,
        props: {
          id: { tipo: "string", requerido: true, placeholder: "mi-pantalla" },
          nombre: { tipo: "string", requerido: true, placeholder: "Mi Pantalla" },
          tipo: { tipo: "enum", opciones: ["mobile", "tablet", "desktop"], default: "mobile" },
          icono: { tipo: "emoji", default: "📱" }
        }
      }
    ];
  }

  generateLayoutBlocks() {
    return [
      {
        id: "layout-fullscreen",
        nombre: "Fullscreen",
        categoria: "layout",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        acepta_hijos: true,
        slots: ["content"]
      },
      {
        id: "layout-sidebar",
        nombre: "Con Sidebar",
        categoria: "layout",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        acepta_hijos: true,
        slots: ["sidebar", "content"],
        props: {
          sidebar_posicion: { tipo: "enum", opciones: ["left", "right"], default: "right" },
          sidebar_ancho: { tipo: "string", default: "80px" }
        }
      },
      {
        id: "layout-three-panel",
        nombre: "3 Paneles",
        categoria: "layout",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        acepta_hijos: true,
        slots: ["header", "topbar", "sidebar", "content", "bottom"]
      },
      {
        id: "layout-two-column",
        nombre: "2 Columnas",
        categoria: "layout",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        acepta_hijos: true,
        slots: ["left", "right"],
        props: {
          left_width: { tipo: "string", default: "65%" },
          right_width: { tipo: "string", default: "35%" }
        }
      }
    ];
  }

  generateContainerBlocks() {
    const containers = [];

    // Desde el inventario de componentes propios
    if (this.inventory?.componentes_ui?.propios?.contenedores) {
      this.inventory.componentes_ui.propios.contenedores.forEach(c => {
        containers.push({
          id: c.id,
          nombre: c.nombre,
          categoria: "contenedor",
          forma: "statement",
          conexiones: { arriba: true, abajo: true },
          acepta_hijos: true,
          acepta_tipos: c.acepta || ["any"],
          descripcion: c.descripcion,
          props: this.extractContainerProps(c)
        });
      });
    }

    // Añadir bloques contenedores adicionales
    containers.push(
      {
        id: "grid",
        nombre: "Grid",
        categoria: "contenedor",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        acepta_hijos: true,
        props: {
          columnas_mobile: { tipo: "number", default: 2 },
          columnas_tablet: { tipo: "number", default: 3 },
          columnas_desktop: { tipo: "number", default: 4 },
          gap: { tipo: "string", default: "12px" }
        }
      },
      {
        id: "grupo-botones",
        nombre: "Grupo Botones",
        categoria: "contenedor",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        acepta_hijos: true,
        acepta_tipos: ["emoji-button", "boton"],
        props: {
          separador: { tipo: "boolean", default: true }
        }
      }
    );

    return containers;
  }

  extractContainerProps(container) {
    const props = {};
    if (container.posicion) {
      props.posicion = { tipo: "enum", opciones: Array.isArray(container.posicion) ? container.posicion : [container.posicion] };
    }
    if (container.draggable !== undefined) {
      props.draggable = { tipo: "boolean", default: container.draggable };
    }
    if (container.collapsible !== undefined) {
      props.colapsable = { tipo: "boolean", default: container.collapsible };
    }
    if (container.tamanos) {
      props.tamano = { tipo: "enum", opciones: container.tamanos };
    }
    return props;
  }

  generateComponentBlocks() {
    const components = [];

    // Componentes interactivos desde inventario
    if (this.inventory?.componentes_ui?.propios?.interactivos) {
      this.inventory.componentes_ui.propios.interactivos.forEach(c => {
        components.push({
          id: c.id,
          nombre: c.nombre,
          categoria: "componente",
          forma: "statement",
          conexiones: { arriba: true, abajo: true },
          descripcion: c.descripcion,
          props: this.extractComponentProps(c),
          slots_evento: c.interacciones ?
            c.interacciones.map(i => `on_${i}`) :
            ["on_click"]
        });
      });
    }

    // Componentes basicos
    components.push(
      {
        id: "boton",
        nombre: "Boton",
        categoria: "componente",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: {
          texto: { tipo: "string" },
          icono: { tipo: "emoji" },
          variante: { tipo: "enum", opciones: ["primary", "secondary", "ghost", "danger"] },
          tamano: { tipo: "enum", opciones: ["sm", "md", "lg"] }
        },
        slots_evento: ["on_click"]
      },
      {
        id: "input-texto",
        nombre: "Input Texto",
        categoria: "componente",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: {
          placeholder: { tipo: "string" },
          tipo: { tipo: "enum", opciones: ["text", "password", "email", "number"] },
          binding: { tipo: "variable" }
        },
        slots_evento: ["on_change", "on_submit"]
      },
      {
        id: "tabla",
        nombre: "Tabla",
        categoria: "componente",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: {
          datos: { tipo: "binding" },
          columnas: { tipo: "array" },
          ordenable: { tipo: "boolean", default: true },
          paginado: { tipo: "boolean", default: true }
        },
        slots_evento: ["on_row_click", "on_action"]
      },
      {
        id: "stat-card",
        nombre: "Stat Card",
        categoria: "componente",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: {
          label: { tipo: "string" },
          valor: { tipo: "binding" },
          icono: { tipo: "emoji" },
          color: { tipo: "enum", opciones: ["primary", "success", "warning", "danger", "info"] }
        }
      },
      {
        id: "lista-items",
        nombre: "Lista Items",
        categoria: "componente",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        acepta_hijos: true,
        props: {
          datos: { tipo: "binding" },
          item_component: { tipo: "string" }
        },
        slots_evento: ["on_item_click"]
      }
    );

    return components;
  }

  extractComponentProps(component) {
    const props = {};
    if (component.tipo === "boton" || component.id.includes("button")) {
      props.emoji = { tipo: "emoji", requerido: true };
      props.tooltip = { tipo: "string" };
    }
    return props;
  }

  generateModuleBlocks() {
    const modules = [];

    // Modulos principales
    if (this.inventory?.modulos?.principales?.modulos) {
      this.inventory.modulos.principales.modulos.forEach(m => {
        modules.push({
          id: `mod-${m.id}`,
          nombre: m.nombre,
          categoria: "modulo",
          forma: "reporter",
          icono: m.icono,
          modulo_ref: m.id,
          descripcion: m.descripcion,
          tiene_ui: m.tiene_ui
        });
      });
    }

    // Modulos de negocio
    if (this.inventory?.modulos?.negocio_restaurante?.modulos) {
      this.inventory.modulos.negocio_restaurante.modulos.forEach(m => {
        modules.push({
          id: `mod-${m.id}`,
          nombre: m.nombre,
          categoria: "modulo",
          forma: "reporter",
          icono: m.icono,
          modulo_ref: m.id,
          descripcion: m.descripcion,
          tiene_ui: m.tiene_ui
        });
      });
    }

    return modules;
  }

  generateEventBlocks() {
    const events = { escucha: [], emite: [] };

    // Generar bloques de escucha desde el inventario de eventos
    if (this.inventory?.eventos) {
      Object.entries(this.inventory.eventos).forEach(([modulo, data]) => {
        if (data.publica && Array.isArray(data.publica)) {
          data.publica.forEach(evento => {
            events.escucha.push({
              id: `on-${evento.replace(/\./g, '-')}`,
              nombre: `Cuando ${evento}`,
              categoria: "evento",
              forma: "hat",
              conexiones: { arriba: false, abajo: true },
              evento: evento,
              modulo_origen: modulo
            });
          });
        }
      });
    }

    // Bloque generico de escucha
    events.escucha.push({
      id: "on-evento-custom",
      nombre: "Cuando evento",
      categoria: "evento",
      forma: "hat",
      conexiones: { arriba: false, abajo: true },
      props: {
        evento: { tipo: "string", requerido: true, placeholder: "modulo.evento" }
      }
    });

    // Bloque de emitir evento
    events.emite.push({
      id: "emit-evento",
      nombre: "Emitir evento",
      categoria: "evento",
      forma: "statement",
      conexiones: { arriba: true, abajo: true },
      props: {
        evento: { tipo: "string", requerido: true },
        payload: { tipo: "object" }
      }
    });

    return events;
  }

  generateActionBlocks() {
    const actions = {
      navegacion: [],
      api: [],
      modulo: [],
      ui: [],
      datos: []
    };

    // Acciones de navegacion
    actions.navegacion = [
      {
        id: "navegar",
        nombre: "Navegar a",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: { url: { tipo: "string", requerido: true } }
      },
      {
        id: "navegar-modulo",
        nombre: "Abrir modulo",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: { modulo: { tipo: "modulo_ref", requerido: true } }
      },
      {
        id: "volver",
        nombre: "Volver atras",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true }
      }
    ];

    // Acciones API desde inventario
    if (this.inventory?.acciones) {
      Object.entries(this.inventory.acciones).forEach(([modulo, apis]) => {
        if (Array.isArray(apis)) {
          apis.forEach(api => {
            actions.api.push({
              id: `api-${modulo}-${api.path.replace(/[/:]/g, '-')}`,
              nombre: `${api.metodo} ${api.descripcion}`,
              categoria: "accion",
              forma: "statement",
              conexiones: { arriba: true, abajo: true },
              modulo: modulo,
              metodo: api.metodo,
              endpoint: `/modules/${modulo}${api.path}`,
              props: api.metodo !== "GET" && api.metodo !== "DELETE" ?
                { body: { tipo: "object" } } : {}
            });
          });
        }
      });
    }

    // Acciones genericas de API
    actions.api.push(
      {
        id: "api-get",
        nombre: "GET",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: {
          endpoint: { tipo: "string", requerido: true },
          guardar_en: { tipo: "variable" }
        }
      },
      {
        id: "api-post",
        nombre: "POST",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: {
          endpoint: { tipo: "string", requerido: true },
          body: { tipo: "object" },
          guardar_en: { tipo: "variable" }
        }
      }
    );

    // Acciones UI
    actions.ui = [
      {
        id: "mostrar-toast",
        nombre: "Mostrar toast",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: {
          mensaje: { tipo: "string", requerido: true },
          tipo: { tipo: "enum", opciones: ["success", "error", "warning", "info"] }
        }
      },
      {
        id: "abrir-modal",
        nombre: "Abrir modal",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        acepta_hijos: true
      },
      {
        id: "cerrar-modal",
        nombre: "Cerrar modal",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true }
      },
      {
        id: "refrescar",
        nombre: "Refrescar vista",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true }
      },
      {
        id: "reproducir-sonido",
        nombre: "Reproducir sonido",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: {
          sonido: { tipo: "enum", opciones: ["notification", "success", "error", "sent"] }
        }
      }
    ];

    // Acciones de datos
    actions.datos = [
      {
        id: "set-variable",
        nombre: "Guardar en",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: {
          nombre: { tipo: "string", requerido: true },
          valor: { tipo: "any" }
        }
      },
      {
        id: "filtrar-lista",
        nombre: "Filtrar lista",
        categoria: "accion",
        forma: "statement",
        conexiones: { arriba: true, abajo: true },
        props: {
          lista: { tipo: "variable" },
          campo: { tipo: "string" },
          valor: { tipo: "any" }
        }
      }
    ];

    return actions;
  }

  generateConditionBlocks() {
    return [
      {
        id: "si",
        nombre: "Si",
        categoria: "condicion",
        forma: "c-block",
        conexiones: { arriba: true, abajo: true },
        acepta_hijos: true,
        slots: ["condicion", "entonces"],
        props: {
          condicion: { tipo: "boolean" }
        }
      },
      {
        id: "si-sino",
        nombre: "Si / Sino",
        categoria: "condicion",
        forma: "c-block",
        conexiones: { arriba: true, abajo: true },
        acepta_hijos: true,
        slots: ["condicion", "entonces", "sino"]
      },
      {
        id: "repetir",
        nombre: "Por cada item en",
        categoria: "condicion",
        forma: "c-block",
        conexiones: { arriba: true, abajo: true },
        acepta_hijos: true,
        props: {
          lista: { tipo: "variable" },
          item_var: { tipo: "string", default: "item" }
        }
      },
      {
        id: "comparar",
        nombre: "Comparar",
        categoria: "condicion",
        forma: "reporter",
        retorna: "boolean",
        props: {
          izq: { tipo: "any" },
          operador: { tipo: "enum", opciones: ["==", "!=", ">", "<", ">=", "<=", "contains"] },
          der: { tipo: "any" }
        }
      },
      {
        id: "y",
        nombre: "Y",
        categoria: "condicion",
        forma: "reporter",
        retorna: "boolean",
        props: { a: { tipo: "boolean" }, b: { tipo: "boolean" } }
      },
      {
        id: "o",
        nombre: "O",
        categoria: "condicion",
        forma: "reporter",
        retorna: "boolean",
        props: { a: { tipo: "boolean" }, b: { tipo: "boolean" } }
      },
      {
        id: "no",
        nombre: "No",
        categoria: "condicion",
        forma: "reporter",
        retorna: "boolean",
        props: { valor: { tipo: "boolean" } }
      }
    ];
  }

  generateDataBlocks() {
    const data = [];

    // Endpoints desde inventario
    if (this.inventory?.acciones) {
      Object.entries(this.inventory.acciones).forEach(([modulo, apis]) => {
        if (Array.isArray(apis)) {
          apis.filter(api => api.metodo === "GET" && !api.path.includes(":")).forEach(api => {
            data.push({
              id: `data-${modulo}-${api.path.replace(/\//g, '-')}`,
              nombre: `${modulo}: ${api.descripcion}`,
              categoria: "datos",
              forma: "reporter",
              endpoint: `/modules/${modulo}${api.path}`,
              modulo: modulo
            });
          });
        }
      });
    }

    // Datos especiales
    data.push(
      {
        id: "data-evento",
        nombre: "Datos del evento",
        categoria: "datos",
        forma: "reporter",
        descripcion: "Payload del evento que disparo esta accion"
      },
      {
        id: "data-params",
        nombre: "Parametro URL",
        categoria: "datos",
        forma: "reporter",
        props: { nombre: { tipo: "string" } }
      },
      {
        id: "data-variable",
        nombre: "Variable",
        categoria: "datos",
        forma: "reporter",
        props: { nombre: { tipo: "string" } }
      },
      {
        id: "data-usuario",
        nombre: "Usuario actual",
        categoria: "datos",
        forma: "reporter"
      }
    );

    return data;
  }

  getDefaultBlocks() {
    return {
      categorias: this.getCategorias(),
      pantalla: this.generateScreenBlocks(),
      layout: this.generateLayoutBlocks(),
      contenedor: [],
      componente: [],
      modulo: [],
      evento: { escucha: [], emite: [] },
      accion: { navegacion: [], api: [], modulo: [], ui: [], datos: [] },
      condicion: this.generateConditionBlocks(),
      datos: []
    };
  }

  // ============================================================
  // HANDLERS API
  // ============================================================

  handleGetAllBlocks(req, res) {
    res.json({
      success: true,
      blocks: this.blocks
    });
  }

  handleGetModuleBlocks(req, res) {
    res.json({
      success: true,
      blocks: this.blocks.modulo
    });
  }

  handleGetEventBlocks(req, res) {
    res.json({
      success: true,
      blocks: this.blocks.evento
    });
  }

  handleGetActionBlocks(req, res) {
    res.json({
      success: true,
      blocks: this.blocks.accion
    });
  }

  handleGetComponentBlocks(req, res) {
    res.json({
      success: true,
      blocks: this.blocks.componente
    });
  }

  handleGetContainerBlocks(req, res) {
    res.json({
      success: true,
      blocks: this.blocks.contenedor
    });
  }

  handleGetDataBlocks(req, res) {
    res.json({
      success: true,
      blocks: this.blocks.datos
    });
  }

  handleGetConditionBlocks(req, res) {
    res.json({
      success: true,
      blocks: this.blocks.condicion
    });
  }

  // ============================================================
  // CRUD DESIGNS
  // ============================================================

  handleListDesigns(req, res) {
    const designs = Array.from(this.designs.values()).map(d => ({
      id: d.id,
      nombre: d.nombre,
      tipo: d.tipo,
      icono: d.icono,
      updated_at: d.updated_at
    }));
    res.json({ success: true, designs });
  }

  handleCreateDesign(req, res) {
    const { nombre, tipo = "screen", icono = "📱" } = req.body;

    const design = {
      id: uuidv4(),
      nombre,
      tipo,
      icono,
      bloques: [],
      conexiones: [],
      variables: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.designs.set(design.id, design);

    if (this.core?.publish) {
      this.core.publish("scratch.design.created", { design_id: design.id, nombre });
    }

    res.json({ success: true, design });
  }

  handleGetDesign(req, res) {
    const { id } = req.params;
    const design = this.designs.get(id);

    if (!design) {
      return res.status(404).json({ success: false, error: "Design not found" });
    }

    res.json({ success: true, design });
  }

  handleUpdateDesign(req, res) {
    const { id } = req.params;
    const design = this.designs.get(id);

    if (!design) {
      return res.status(404).json({ success: false, error: "Design not found" });
    }

    const { nombre, bloques, conexiones, variables } = req.body;

    if (nombre) design.nombre = nombre;
    if (bloques) design.bloques = bloques;
    if (conexiones) design.conexiones = conexiones;
    if (variables) design.variables = variables;
    design.updated_at = new Date().toISOString();

    this.designs.set(id, design);

    if (this.core?.publish) {
      this.core.publish("scratch.design.updated", { design_id: id });
    }

    res.json({ success: true, design });
  }

  handleDeleteDesign(req, res) {
    const { id } = req.params;

    if (!this.designs.has(id)) {
      return res.status(404).json({ success: false, error: "Design not found" });
    }

    this.designs.delete(id);

    if (this.core?.publish) {
      this.core.publish("scratch.design.deleted", { design_id: id });
    }

    res.json({ success: true });
  }

  handleDuplicateDesign(req, res) {
    const { id } = req.params;
    const original = this.designs.get(id);

    if (!original) {
      return res.status(404).json({ success: false, error: "Design not found" });
    }

    const duplicate = {
      ...JSON.parse(JSON.stringify(original)),
      id: uuidv4(),
      nombre: `${original.nombre} (copia)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.designs.set(duplicate.id, duplicate);

    res.json({ success: true, design: duplicate });
  }

  // ============================================================
  // VALIDACION
  // ============================================================

  handleValidateConnection(req, res) {
    const { bloque_origen, bloque_destino, tipo_conexion } = req.body;

    const origen = this.findBlockDefinition(bloque_origen.tipo);
    const destino = this.findBlockDefinition(bloque_destino.tipo);

    if (!origen || !destino) {
      return res.json({ valid: false, error: "Bloque no encontrado" });
    }

    let valid = false;
    let error = null;

    switch (tipo_conexion) {
      case "abajo":
        valid = origen.conexiones?.abajo && destino.conexiones?.arriba;
        if (!valid) error = "Los bloques no pueden conectarse verticalmente";
        break;
      case "hijo":
        valid = origen.acepta_hijos === true;
        if (origen.acepta_tipos && !origen.acepta_tipos.includes(bloque_destino.tipo)) {
          valid = false;
          error = `Este contenedor solo acepta: ${origen.acepta_tipos.join(", ")}`;
        }
        break;
      case "slot":
        valid = origen.slots?.includes(tipo_conexion);
        break;
      default:
        error = "Tipo de conexion no valido";
    }

    res.json({ valid, error });
  }

  handleValidateDesign(req, res) {
    const { bloques, conexiones } = req.body;
    const errores = [];
    const warnings = [];

    // Validar que hay al menos una pantalla
    const pantallas = bloques.filter(b => b.tipo === "screen");
    if (pantallas.length === 0) {
      errores.push("El diseño debe tener al menos una pantalla");
    }

    // Validar props requeridos
    bloques.forEach(bloque => {
      const def = this.findBlockDefinition(bloque.tipo);
      if (def?.props) {
        Object.entries(def.props).forEach(([prop, config]) => {
          if (config.requerido && !bloque.props?.[prop]) {
            errores.push(`Bloque "${bloque.tipo}": falta prop requerido "${prop}"`);
          }
        });
      }
    });

    // Validar conexiones
    conexiones.forEach(conn => {
      const resultado = this.validateConnectionInternal(conn, bloques);
      if (!resultado.valid) {
        errores.push(resultado.error);
      }
    });

    res.json({
      valid: errores.length === 0,
      errores,
      warnings
    });
  }

  validateConnectionInternal(conexion, bloques) {
    // Implementacion simplificada
    return { valid: true };
  }

  findBlockDefinition(tipo) {
    // Buscar en todas las categorias
    for (const categoria of Object.values(this.blocks)) {
      if (Array.isArray(categoria)) {
        const found = categoria.find(b => b.id === tipo);
        if (found) return found;
      } else if (typeof categoria === 'object') {
        for (const subcategoria of Object.values(categoria)) {
          if (Array.isArray(subcategoria)) {
            const found = subcategoria.find(b => b.id === tipo);
            if (found) return found;
          }
        }
      }
    }
    return null;
  }

  // ============================================================
  // EXPORT
  // ============================================================

  handleExportJSON(req, res) {
    const { design_id } = req.body;
    const design = this.designs.get(design_id);

    if (!design) {
      return res.status(404).json({ success: false, error: "Design not found" });
    }

    const json = this.convertDesignToJSON(design);

    if (this.core?.publish) {
      this.core.publish("scratch.design.exported", { design_id, format: "json" });
    }

    res.json({
      success: true,
      format: "json",
      output: json
    });
  }

  handleExportModuleUI(req, res) {
    const { design_id } = req.body;
    const design = this.designs.get(design_id);

    if (!design) {
      return res.status(404).json({ success: false, error: "Design not found" });
    }

    const moduleUI = this.convertDesignToModuleUI(design);

    res.json({
      success: true,
      format: "module-ui",
      output: moduleUI
    });
  }

  convertDesignToJSON(design) {
    // Convertir bloques del canvas a estructura JSON de pantalla
    const output = {
      id: design.id,
      nombre: design.nombre,
      tipo: design.tipo || "screen",
      icono: design.icono,
      generado_por: "scratch-designer",
      generado_at: new Date().toISOString(),
      layout: null,
      componentes: [],
      eventos_globales: [],
      datos_iniciales: {}
    };

    // Procesar bloques en orden
    design.bloques.forEach(bloque => {
      this.processBlockToJSON(bloque, output);
    });

    return output;
  }

  processBlockToJSON(bloque, output) {
    switch (bloque.categoria) {
      case "pantalla":
        output.id = bloque.props?.id || output.id;
        output.nombre = bloque.props?.nombre || output.nombre;
        output.tipo = bloque.props?.tipo || output.tipo;
        break;
      case "layout":
        output.layout = {
          tipo: bloque.tipo,
          slots: {},
          props: bloque.props || {}
        };
        break;
      case "contenedor":
      case "componente":
        output.componentes.push({
          tipo: bloque.tipo,
          props: bloque.props || {},
          hijos: bloque.hijos?.map(h => this.processChildBlock(h)) || [],
          eventos: bloque.eventos || {}
        });
        break;
      case "evento":
        if (bloque.evento) {
          output.eventos_globales.push({
            escucha: bloque.evento,
            acciones: bloque.acciones || []
          });
        }
        break;
    }
  }

  processChildBlock(bloque) {
    return {
      tipo: bloque.tipo,
      props: bloque.props || {},
      hijos: bloque.hijos?.map(h => this.processChildBlock(h)) || [],
      eventos: bloque.eventos || {}
    };
  }

  convertDesignToModuleUI(design) {
    // Convertir a formato de module.json ui section
    return {
      enabled: true,
      version: "2.0",
      title: design.nombre,
      icon: design.icono,
      description: `Generado por Scratch Designer`,
      views: {
        main: this.convertDesignToJSON(design)
      }
    };
  }

  handleHealthCheck(req, res) {
    res.json({
      status: "ok",
      module: "scratch-designer",
      blocks_loaded: Object.keys(this.blocks).length,
      designs_count: this.designs.size,
      inventory_loaded: !!this.inventory
    });
  }
}

module.exports = ScratchDesigner;
