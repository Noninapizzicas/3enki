/**
 * Block Palette Generator
 * Genera la paleta de bloques desde el inventario del sistema
 */

const fs = require('fs');
const path = require('path');

class BlockGenerator {
  constructor(inventoryPath) {
    this.inventory = this.loadInventory(inventoryPath);
  }

  loadInventory(inventoryPath) {
    try {
      const data = fs.readFileSync(inventoryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('[scratch-designer] Error loading inventory:', error.message);
      return null;
    }
  }

  generateAll() {
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
    return [{
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
    }];
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
        props: { separador: { tipo: "boolean", default: true } }
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
          slots_evento: c.interacciones ? c.interacciones.map(i => `on_${i}`) : ["on_click"]
        });
      });
    }

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

    events.escucha.push({
      id: "on-evento-custom",
      nombre: "Cuando evento",
      categoria: "evento",
      forma: "hat",
      conexiones: { arriba: false, abajo: true },
      props: { evento: { tipo: "string", requerido: true, placeholder: "modulo.evento" } }
    });

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
      navegacion: [
        { id: "navegar", nombre: "Navegar a", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true }, props: { url: { tipo: "string", requerido: true } } },
        { id: "navegar-modulo", nombre: "Abrir modulo", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true }, props: { modulo: { tipo: "modulo_ref", requerido: true } } },
        { id: "volver", nombre: "Volver atras", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true } }
      ],
      api: [],
      modulo: [],
      ui: [
        { id: "mostrar-toast", nombre: "Mostrar toast", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true }, props: { mensaje: { tipo: "string", requerido: true }, tipo: { tipo: "enum", opciones: ["success", "error", "warning", "info"] } } },
        { id: "abrir-modal", nombre: "Abrir modal", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true }, acepta_hijos: true },
        { id: "cerrar-modal", nombre: "Cerrar modal", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true } },
        { id: "refrescar", nombre: "Refrescar vista", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true } },
        { id: "reproducir-sonido", nombre: "Reproducir sonido", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true }, props: { sonido: { tipo: "enum", opciones: ["notification", "success", "error", "sent"] } } }
      ],
      datos: [
        { id: "set-variable", nombre: "Guardar en", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true }, props: { nombre: { tipo: "string", requerido: true }, valor: { tipo: "any" } } },
        { id: "filtrar-lista", nombre: "Filtrar lista", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true }, props: { lista: { tipo: "variable" }, campo: { tipo: "string" }, valor: { tipo: "any" } } }
      ]
    };

    // API blocks from inventory
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
              props: api.metodo !== "GET" && api.metodo !== "DELETE" ? { body: { tipo: "object" } } : {}
            });
          });
        }
      });
    }

    // Generic API blocks
    actions.api.push(
      { id: "api-get", nombre: "GET", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true }, props: { endpoint: { tipo: "string", requerido: true }, guardar_en: { tipo: "variable" } } },
      { id: "api-post", nombre: "POST", categoria: "accion", forma: "statement", conexiones: { arriba: true, abajo: true }, props: { endpoint: { tipo: "string", requerido: true }, body: { tipo: "object" }, guardar_en: { tipo: "variable" } } }
    );

    return actions;
  }

  generateConditionBlocks() {
    return [
      { id: "si", nombre: "Si", categoria: "condicion", forma: "c-block", conexiones: { arriba: true, abajo: true }, acepta_hijos: true, slots: ["condicion", "entonces"], props: { condicion: { tipo: "boolean" } } },
      { id: "si-sino", nombre: "Si / Sino", categoria: "condicion", forma: "c-block", conexiones: { arriba: true, abajo: true }, acepta_hijos: true, slots: ["condicion", "entonces", "sino"] },
      { id: "repetir", nombre: "Por cada item en", categoria: "condicion", forma: "c-block", conexiones: { arriba: true, abajo: true }, acepta_hijos: true, props: { lista: { tipo: "variable" }, item_var: { tipo: "string", default: "item" } } },
      { id: "comparar", nombre: "Comparar", categoria: "condicion", forma: "reporter", retorna: "boolean", props: { izq: { tipo: "any" }, operador: { tipo: "enum", opciones: ["==", "!=", ">", "<", ">=", "<=", "contains"] }, der: { tipo: "any" } } },
      { id: "y", nombre: "Y", categoria: "condicion", forma: "reporter", retorna: "boolean", props: { a: { tipo: "boolean" }, b: { tipo: "boolean" } } },
      { id: "o", nombre: "O", categoria: "condicion", forma: "reporter", retorna: "boolean", props: { a: { tipo: "boolean" }, b: { tipo: "boolean" } } },
      { id: "no", nombre: "No", categoria: "condicion", forma: "reporter", retorna: "boolean", props: { valor: { tipo: "boolean" } } }
    ];
  }

  generateDataBlocks() {
    const data = [];

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

    data.push(
      { id: "data-evento", nombre: "Datos del evento", categoria: "datos", forma: "reporter", descripcion: "Payload del evento que disparo esta accion" },
      { id: "data-params", nombre: "Parametro URL", categoria: "datos", forma: "reporter", props: { nombre: { tipo: "string" } } },
      { id: "data-variable", nombre: "Variable", categoria: "datos", forma: "reporter", props: { nombre: { tipo: "string" } } },
      { id: "data-usuario", nombre: "Usuario actual", categoria: "datos", forma: "reporter" }
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

  findBlockDefinition(tipo) {
    const blocks = this.generateAll();
    for (const categoria of Object.values(blocks)) {
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
}

module.exports = BlockGenerator;
