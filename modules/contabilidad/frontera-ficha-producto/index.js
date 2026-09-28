/**
 * contabilidad/frontera-ficha-producto — CONVERSOR STATELESS (H2, hoja del plan).
 *
 * FRONTERA UNICA DE FORMATOS (invariante 10 del dominio): por donde CRUZA el
 * coste de la ficha de producto de OTRA vertical (ficha, receta, tarifa, otro)
 * al dato interno contable. El coste EXTERNO se adapta a la forma interna; NO se
 * reinterpreta ni se recalcula. La fuente de coste es DECLARABLE por negocio
 * (canal/catalogo); si falta una fuente -> SE CREA (invariante de puerto
 * abierto, _crearFrontera). NUNCA se inventa un coste: si el dato no viene, se
 * marca AUSENTE y se declara [ABIERTO] — dato ausente = desconocido (invariante
 * 7), jamas 0.
 *
 * CONVERSOR (patron real, stateless): sin PosPersistencia ni project.activated
 * en el CODIGO — entra objeto, sale objeto. El catalogo declarable de fuentes de
 * coste vive SOLO en memoria del proceso (_fuentes), no en disco: es el registro
 * de adaptadores puestos en el sitio, no una parcela de dominio. Emisor/par de
 * fallo: exito publica contabilidad.coste_leido; error su par determinista. NO
 * REUTILIZA: la frontera de coste (ficha/receta/otro) es declarable por negocio;
 * `pizzepos/escandallo` es mono-negocio y se pone POR ENCIMA, no se toca.
 *
 * Ver hoja H2 del diseno-oop y bloque `frontera-ficha-producto` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Marcador de coste ausente: NUNCA se inventa (ni 0 ni un valor por defecto).
const AUSENTE = 'AUSENTE';
// Marca de valor no declarado (abierto en el diseno).
const ABIERTO = '[ABIERTO]';

class FronteraFichaProducto extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'frontera-ficha-producto';
    this.version = 'reflejo-0.1.0';
    // Catalogo DECLARABLE de fuentes de coste por negocio: negocio -> fuente de
    // coste (canal + adaptador + mapa de campos). Solo memoria: si falta, se CREA.
    this._fuentes = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onCosteRequest(e) {
    return this._atender(e, 'coste', 'contabilidad.ficha.coste.response', async (d) => {
      const res = this._leerCoste(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.coste_leido', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.ficha.coste.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  // leerCoste(producto) -> Coste | AUSENTE — UNICA puerta de formato del coste.
  // Adapta el coste de la fuente al dato interno; si no viene, AUSENTE (nunca 0).
  _leerCoste(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const negocio = (input && (input.negocio || input.id_negocio)) || pid;
    const producto = (input && (input.producto || input.ficha || input.hecho)) || null;
    if (!producto || typeof producto !== 'object') return this._invalid('producto');

    // De donde sale el coste: declarado por negocio o en el payload. Si NO esta
    // declarado, se marca [ABIERTO] (el sistema no asume una fuente de coste).
    const fuente = (input && input.fuente) || this._fuentes.get(negocio) || null;
    if (!fuente) {
      return {
        status: 200,
        data: {
          project_id: pid,
          negocio,
          producto: producto.codigo || producto.id || null,
          coste: null,
          ausente: true,
          simbolico: AUSENTE,
          fuente: null,
          abierto: ABIERTO,
          no_inventa: true,
          nota: 'fuente de coste NO declarada: se marca [ABIERTO] y AUSENTE, NUNCA se inventa un coste'
        }
      };
    }

    // Mapa de campos declarado: { campoFuente: campoInterno } (por defecto, el
    // propio campo `coste`/`coste_unitario` de la fuente).
    const adaptado = this._adaptar(fuente, producto);
    const importe = this._importeDe(adaptado);

    if (!Number.isFinite(importe)) {
      return {
        status: 200,
        data: {
          project_id: pid,
          negocio,
          producto: producto.codigo || producto.id || null,
          coste: null,
          ausente: true,
          simbolico: AUSENTE,
          fuente: fuente.canal || fuente.nombre || null,
          abierto: null,
          no_inventa: true,
          nota: 'el coste no viene en la fuente: dato ausente = desconocido (invariante 7), jamas 0'
        }
      };
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        negocio,
        producto: producto.codigo || producto.id || null,
        coste: this._round(importe, 4),
        moneda: adaptado.moneda || (input && input.moneda) || null,
        unidad: adaptado.unidad || null,
        fuente: fuente.canal || fuente.nombre || null,
        ausente: false,
        simbolico: null,
        no_inventa: true,
        adaptado: true
      }
    };
  }

  // crearFrontera(negocio) -> ok — invariante de puerto abierto: si falta, se crea.
  _crearFrontera(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const negocio = (input && (input.negocio || input.id_negocio)) || pid;
    const canal = (input && (input.canal || input.fuente)) || null;
    if (!canal) return this._invalid('canal');

    const fuente = {
      negocio,
      canal,
      adaptador: (input && input.adaptador) || null,
      mapa: (input && input.mapa) || null,
      creado_en: new Date().toISOString()
    };
    this._fuentes.set(negocio, fuente);
    return {
      status: 200,
      data: { project_id: pid, negocio, fuente, creada: true, puerto_abierto: true }
    };
  }

  // ── helpers internos (adaptacion de formato, sin juicio de dominio) ──
  _adaptar(fuente, producto) {
    const origen = (producto.payload !== undefined ? producto.payload : (producto.datos || producto)) || {};
    const salida = { ...origen };
    const mapa = fuente && fuente.mapa;
    if (mapa && typeof mapa === 'object') {
      for (const [destino, campoFuente] of Object.entries(mapa)) {
        if (origen[campoFuente] !== undefined) salida[destino] = origen[campoFuente];
      }
    }
    return salida;
  }

  _importeDe(obj) {
    const v = obj && (obj.coste ?? obj.coste_unitario ?? obj.precio_coste ?? obj.importe);
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  // ── Tools ──
  toolLeerCoste(params) { return this._leerCoste(params); }
  toolCrearFrontera(params) { return this._crearFrontera(params); }
}

module.exports = FronteraFichaProducto;
