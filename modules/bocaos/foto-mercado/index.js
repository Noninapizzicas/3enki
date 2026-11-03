'use strict';

/**
 * foto-mercado · REFLEJO · PLAZA — A02 (FotoDelMercado) + A03 (Congelada) + A04 (Elegibles).
 *
 * La foto del instante: riders de ESTA plaza con su posición, paradas, promesas, capacidad, el
 * local y la política que rige. Se congela con su HUELLA y no vuelve a leer el mundo: dentro
 * del cuello nadie lee el mundo, porque si leyera, la explicación dejaría de ser cierta.
 *
 * Sin estado, sin persistencia: si guardara una copia habría dos verdades y una sería vieja.
 * Lo que necesita de otros módulos lo PIDE AL BUS; el dato vuelve en la response y viaja con
 * la foto. Un rider de otra plaza no aparece (A35). Un dato ausente NO descarta: entra con su
 * lista de faltantes, porque descartar es decidir (A04).
 */

const ModuloBocaos = require('../_bocaos');

// Default de la plaza (F0 §6: 800 m · 4 min · 6 min · > 0). Si nadie ha declarado política,
// se dice: capa plaza, versión 0, autor «sin declarar» y fuente default — no se finge acta.
const POLITICA_DEFAULT = {
  capa: 'plaza',
  version: 0,
  autor: 'sin declarar',
  fuente: 'default-f0',
  umbrales: { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 },
  ventana_s: 20,
  orden: 'declarado'
};

class FotoMercado extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'foto-mercado';
    this.version = 'reflejo-0.1.0';
  }

  onComponerRequest(e) { return this.servir(e, 'componer', 'foto-mercado.componer', (d) => this._componer(d)); }
  onElegiblesRequest(e) { return this.servir(e, 'elegibles', 'foto-mercado.elegibles', (d) => this._elegibles(d)); }
  onReproducirRequest(e) { return this.servir(e, 'reproducir', 'foto-mercado.reproducir', (d) => this._reproducir(d)); }

  // ================= A02 · componer =================
  async _componer(d) {
    if (!d.project_id) return this._invalid('project_id');
    const pedido = d.pedido && typeof d.pedido === 'object' ? d.pedido : {};
    const plaza_id = d.plaza_id || pedido.plaza_id;
    if (!plaza_id) return this._invalid('plaza_id');
    const instante = this._iso(d.instante) || this.ahora();

    const [parte, ruta, config] = await Promise.all([
      this._rpc('estado-parte.de.request', { project_id: d.project_id, plaza_id }),
      // La tienda del pedido viaja con la pregunta: sin saber CUÁL es la tienda, «ETA a la
      // tienda» no es un dato, es una impresión. Y el instante viaja también, para que la
      // frescura de un punto se juzgue contra la hora de la foto y no contra la de ahora.
      this._rpc('ruta-viva.de.request', {
        project_id: d.project_id,
        plaza_id,
        tienda: pedido.punto || null,
        destino: pedido.destino || null,
        instante
      }),
      this._rpc('config-mercado.politica.request', { project_id: d.project_id, plaza_id, instante })
    ]);

    const huecos = [];
    if (!parte?.data?.riders) huecos.push('sin estado del parte');
    if (!ruta?.data?.rutas) huecos.push('sin rutas vivas');
    if (!config?.data?.politica) huecos.push('sin política declarada (se usa default de la plaza)');

    const politica = config?.data?.politica || POLITICA_DEFAULT;
    const rutas = new Map((ruta?.data?.rutas || []).map((r) => [r.rider_id, r]));

    const riders = [];
    for (const r of parte?.data?.riders || []) {
      // A35: un rider de otra plaza no aparece en esta foto.
      if (r.plaza_id && r.plaza_id !== plaza_id) continue;
      const viva = rutas.get(r.rider_id) || {};
      const faltantes = [];
      if (!viva.posicion) faltantes.push('sin posición fresca');
      if (!Number.isInteger(r.capacidad)) faltantes.push('sin capacidad declarada');
      if (!Array.isArray(r.zonas) || r.zonas.length === 0) faltantes.push('sin zonas declaradas');
      if (!r.coste) faltantes.push('sin coste del rider');
      riders.push({
        rider_id: r.rider_id,
        plaza_id: r.plaza_id || plaza_id,
        estado: r.estado || null,
        zonas: r.zonas || null,
        capacidad: Number.isInteger(r.capacidad) ? r.capacidad : null,
        coste: r.coste || null,
        posicion: viva.posicion || null,
        paradas: Array.isArray(viva.paradas) ? viva.paradas : [],
        promesas: viva.promesas || {},
        eta_tienda_min: Number.isFinite(viva.eta_tienda_min) ? viva.eta_tienda_min : null,
        faltantes
      });
    }

    const foto = {
      foto_id: null,   // se rellena con la huella (abajo): la huella ES la identidad de la foto
      plaza_id,
      pedido_id: pedido.pedido_id || null,
      pedido: {
        pedido_id: pedido.pedido_id || null,
        punto: pedido.punto || null,
        destino: pedido.destino || null,
        zona: pedido.zona || null,
        hora_listo: this._iso(pedido.hora_listo),
        precio_congelado: pedido.precio_congelado || null,
        oferta_reparto_cents: pedido.oferta_reparto_cents ?? null
      },
      instante,
      politica,
      riders,
      huecos
    };
    foto.huella = this._huellaDe(foto);
    foto.foto_id = `foto-${foto.huella.slice(0, 12)}`;

    // A03: se congela y se publica con su huella.
    this.hecho('bocaos.foto_congelada', {
      foto_id: foto.foto_id,
      huella: foto.huella,
      plaza_id: foto.plaza_id,
      pedido_id: foto.pedido_id,
      instante: foto.instante,
      politica: foto.politica,
      riders: foto.riders,
      huecos: foto.huecos
    });

    return { status: 200, data: { foto } };
  }

  // ================= A04 · elegibles =================
  async _elegibles(d) {
    const foto = d.foto;
    if (!foto || !Array.isArray(foto.riders)) return this._invalid('foto');
    const zona_pedido = foto.pedido?.zona || d.zona || null;

    const candidatos = [];
    const descartados = [];
    foto.riders.forEach((r, orden) => {
      const faltantes = [...(r.faltantes || [])];
      if (r.estado && !['activo', 'disponible'].includes(r.estado)) {
        return descartados.push({ rider_id: r.rider_id, razon: `estado:${r.estado}` });
      }
      if (!r.estado) faltantes.push('sin estado declarado');
      if (zona_pedido && Array.isArray(r.zonas) && r.zonas.length > 0 && !r.zonas.includes(zona_pedido)) {
        return descartados.push({ rider_id: r.rider_id, razon: `fuera de zona:${zona_pedido}` });
      }
      if (r.capacidad === 0) {
        return descartados.push({ rider_id: r.rider_id, razon: 'sin capacidad' });
      }
      candidatos.push({
        rider_id: r.rider_id,
        estado: r.estado || null,
        capacidad: r.capacidad,
        coste: r.coste || null,
        posicion: r.posicion || null,
        paradas: r.paradas || [],
        promesas: r.promesas || {},
        eta_tienda_min: r.eta_tienda_min ?? null,
        faltantes: [...new Set(faltantes)],
        orden
      });
    });

    // Orden DECLARADO (el de la foto). Sin puntuación, sin reordenar por conveniencia (A22/A28).
    return { status: 200, data: { candidatos, descartados, politica: foto.politica, huella: foto.huella } };
  }

  // ================= A03 · reproducir =================
  async _reproducir(d) {
    const foto = d.foto;
    if (!foto) return this._invalid('foto');
    const recalculada = this._huellaDe(foto);
    if (recalculada !== foto.huella) {
      return this._errorResponse(409, 'FOTO_ALTERADA', 'la foto no reproduce su huella: alguien la tocó', {
        field: 'huella', esperada: foto.huella, recalculada
      });
    }
    return { status: 200, data: { foto, huella: recalculada } };
  }

  // La huella cubre SÓLO lo que el cuello miró: plaza, pedido, instante, política y riders.
  _huellaDe(foto) {
    return this.huella({
      plaza_id: foto.plaza_id,
      pedido_id: foto.pedido_id,
      instante: foto.instante,
      politica: foto.politica,
      riders: foto.riders
    });
  }
}

module.exports = FotoMercado;
module.exports.POLITICA_DEFAULT = POLITICA_DEFAULT;
