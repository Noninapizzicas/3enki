/**
 * Design Exporter
 * Converts scratch designs to JSON/module-ui format
 */

class DesignExporter {
  toJSON(design) {
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

    if (design.bloques) {
      design.bloques.forEach(bloque => {
        this.processBlock(bloque, output);
      });
    }

    return output;
  }

  processBlock(bloque, output) {
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
          hijos: bloque.hijos?.map(h => this.processChild(h)) || [],
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

  processChild(bloque) {
    return {
      tipo: bloque.tipo,
      props: bloque.props || {},
      hijos: bloque.hijos?.map(h => this.processChild(h)) || [],
      eventos: bloque.eventos || {}
    };
  }

  toModuleUI(design) {
    return {
      enabled: true,
      version: "2.0",
      title: design.nombre,
      icon: design.icono,
      description: "Generado por Scratch Designer",
      views: {
        main: this.toJSON(design)
      }
    };
  }
}

module.exports = DesignExporter;
