/**
 * contabilidad/consolidacion-grupo — REFLEJO STATELESS (I1 + I2 + I3, hoja del plan).
 *
 * ESTADOS DEL CONJUNTO con CRITERIO DECLARADO: marca de sociedad (I1, mecanico),
 * deteccion y eliminacion del cruce intercompany (I2) y agregacion (I3). Dos
 * niveles: por negocio (AISLADO) y del grupo (CONSOLIDADO).
 *
 * LOS NEGOCIOS NO SE FUGAN (invariante del dominio): este modulo SOLO consolida lo
 * DECLARADO. El aislamiento por negocio lo gobierna `aislamiento-negocio` (I4) —
 * aqui NO se lee ni se escribe la parcela de otro negocio salvo por consolidacion
 * DECLARADA (la lista de sociedades a consolidar y el criterio son PARAMETROS). Si
 * no hay declaracion, NO se consolida: se responde NO_DECLARADO, jamas se mezclan
 * parcelas por iniciativa propia.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated EN EL
 * CODIGO. Cada op entra objeto, sale objeto. Los estados por sociedad se DERIVAN de
 * `estados-contables` (C1/C2) por EVENTO/payload; contrato TOLERANTE: si no
 * responden, se DECLARA la dependencia no disponible y NUNCA se consolidan cifras
 * inventadas. Dependencia por EVENTO, NUNCA require cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.grupo_consolidado; error su par
 * determinista. NO REUTILIZA: la consolidacion multi-sociedad no existe en el
 * inventario (grupo = 0 modulos).
 *
 * Ver hojas I1/I2/I3 del diseno-oop y bloque `consolidacion-grupo` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Criterios de consolidacion DECLARABLES (el criterio del conjunto entra como DATO).
const CRITERIOS = ['INTEGRACION_GLOBAL', 'INTEGRACION_PROPORCIONAL', 'PUESTA_EN_EQUIVALENCIA'];

class ConsolidacionGrupo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'consolidacion-grupo';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir.
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onAgregarRequest(e) {
    return this._atender(e, 'agregar', 'contabilidad.consolidacion.agregar.response', async (d) => {
      const res = await this._agregar(d);
      if (res.status !== 200) {
        this.eventBus?.publish('contabilidad.consolidacion.agregar.failed', res);
        return res;
      }
      if (res.data.consolidado) {
        this.eventBus?.publish('contabilidad.grupo_consolidado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  // etiquetar(asiento, sociedad) -> Asiento (I1, mecanico, cero juicio).
  _etiquetar(input) {
    const asiento = (input && (input.asiento || input)) || null;
    if (!asiento || typeof asiento !== 'object') return this._invalid('asiento');
    const sociedad = (input && (input.sociedad || input.id_sociedad)) || asiento.sociedad || null;
    if (!sociedad) return this._invalid('sociedad');

    return {
      status: 200,
      data: {
        asiento: { ...asiento, sociedad },
        sociedad,
        etiquetado: true,
        mecanico: true,
        determinista: true
      }
    };
  }

  // detectarCruceInterno(asientos, sociedades) -> List<Cruce> (I2).
  // Un cruce es un par debe/haber entre DOS sociedades distintas del grupo.
  _detectarCruceInterno(input) {
    const asientos = this._asientosDe(input);
    if (asientos === null) return this._invalid('asientos');
    const sociedades = this._sociedadesDe(input);

    const cruces = [];
    for (const a of asientos) {
      const apuntes = Array.isArray(a.apuntes) ? a.apuntes : [];
      for (const ap of apuntes) {
        const origen = ap.sociedad || a.sociedad || null;
        const destino = ap.contraparte_sociedad || ap.sociedad_contraparte || null;
        // Cruce interno: la contrapartida pertenece a OTRA sociedad del grupo declarado.
        if (origen && destino && origen !== destino && sociedades.has(origen) && sociedades.has(destino)) {
          cruces.push({
            asiento_id: a.id || a.clave_natural || null,
            clave_natural: a.clave_natural || null,
            sociedad_origen: origen,
            sociedad_destino: destino,
            cuenta: ap.cuenta || null,
            importe: this._round(Number(ap.debe) || Number(ap.haber) || 0, 2),
            lado: (Number(ap.debe) || 0) > 0 ? 'DEBE' : 'HABER'
          });
        }
      }
    }

    return {
      status: 200,
      data: {
        project_id: (input && input.project_id) || null,
        cruces,
        n: cruces.length,
        sociedades: [...sociedades],
        detectado: true,
        determinista: true
      }
    };
  }

  // eliminar(cruces) -> List<Eliminacion> (I2).
  _eliminar(input) {
    const cruces = (input && (input.cruces || input)) || null;
    if (!Array.isArray(cruces)) return this._invalid('cruces');

    const eliminaciones = cruces.map((c) => ({
      clave_natural: c.clave_natural,
      sociedad_origen: c.sociedad_origen,
      sociedad_destino: c.sociedad_destino,
      cuenta: c.cuenta,
      importe: this._round(Number(c.importe) || 0, 2),
      tipo: 'ELIMINACION_INTERCOMPANY',
      // La eliminacion NEUTRALIZA el cruce en la consolidacion: no toca el libro de cada sociedad.
      neutraliza_solo_en_consolidado: true
    }));

    return {
      status: 200,
      data: {
        project_id: (input && input.project_id) || null,
        eliminaciones,
        n: eliminaciones.length,
        total_eliminado: this._round(eliminaciones.reduce((t, e) => t + e.importe, 0), 2),
        no_toca_el_libro: true,
        determinista: true
      }
    };
  }

  // agregar(sociedades) -> EstadosConsolidados (I3, criterio DECLARADO).
  // SOLO consolida lo DECLARADO: sin lista de sociedades ni criterio, NO se consolida.
  async _agregar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const sociedades = this._listaDeclarada(input);
    if (!sociedades || sociedades.length === 0) {
      return {
        status: 200,
        data: {
          project_id: pid,
          consolidado: false,
          no_declarado: true,
          simbolico: 'NO_DECLARADO',
          motivo: 'la lista de sociedades a consolidar no esta declarada: solo se consolida lo DECLARADO',
          aislamiento_intacto: true
        }
      };
    }

    const criterio = this._criterioDe(input);
    if (criterio.error) return criterio.error;

    // Estados por sociedad: en payload o DERIVADOS de estados-contables (C1/C2) por EVENTO.
    const estados = await this._estadosDe(pid, sociedades, input);
    if (estados === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'estados-contables (C1/C2) no respondio: no se consolidan cifras inventadas', {
          dependencia: 'estados-contables', accion: 'NO_CONSOLIDAR_PUBLICAR_FALLO'
        });
    }

    // I2: deteccion y eliminacion del cruce intercompany (solo entre sociedades declaradas).
    const setSociedades = new Set(sociedades);
    const det = this._detectarCruceInterno({ ...input, sociedades: [...setSociedades] });
    const cruces = det.status === 200 ? det.data.cruces : [];
    const elim = this._eliminar({ cruces });
    const eliminaciones = elim.status === 200 ? elim.data.eliminaciones : [];

    // I3: agregacion de los estados por sociedad, con la eliminacion aplicada.
    const agregado = this._sumarEstados(estados, eliminaciones);

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: (input && input.periodo) || null,
        criterio: criterio.criterio,
        sociedades,
        n_sociedades: sociedades.length,
        estados_por_sociedad: estados.map((e) => ({ sociedad: e.sociedad, activo: e.activo, pasivo: e.pasivo, patrimonio: e.patrimonio, resultado: e.resultado })),
        eliminaciones: { n: eliminaciones.length, total: elim.status === 200 ? elim.data.total_eliminado : 0, detalle: eliminaciones },
        consolidado: agregado,
        // Aislamiento intacto: cada negocio conserva su parcela; la consolidacion es una VISTA del conjunto.
        consolidado_con_criterio_declarado: true,
        aislamiento_intacto: true,
        dos_niveles: { por_negocio: 'aislado', del_grupo: 'consolidado' },
        determinista: true
      }
    };
  }

  // ── helpers internos ──

  _listaDeclarada(input) {
    const s = input && (input.sociedades || input.lista_sociedades);
    if (Array.isArray(s)) return s.map((x) => (typeof x === 'string' ? x : (x && (x.id || x.sociedad)))).filter(Boolean);
    return null;
  }

  _sociedadesDe(input) {
    const lista = this._listaDeclarada(input);
    return new Set(Array.isArray(lista) ? lista : []);
  }

  _criterioDe(input) {
    const c = String((input && (input.criterio || input.criterio_consolidacion)) || '').toUpperCase();
    if (!c) {
      return { error: this._errorResponse(422, 'PRECONDITION_FAILED',
        'el criterio de consolidacion no esta declarado: entra como DATO', {
          criterios: CRITERIOS, no_declarado: true
        }) };
    }
    if (!CRITERIOS.includes(c)) {
      return { error: this._errorResponse(422, 'PRECONDITION_FAILED',
        `criterio ${c} no declarado en el catalogo`, { criterios: CRITERIOS }) };
    }
    return { criterio: c };
  }

  _asientosDe(input) {
    const a = input && (input.asientos || input.lineas || input.libro);
    if (Array.isArray(a)) return a;
    return null;
  }

  // Estados por sociedad: en payload o de estados-contables (C1/C2) por EVENTO.
  async _estadosDe(pid, sociedades, input) {
    const declarados = input && (input.estados || input.estados_por_sociedad);
    if (Array.isArray(declarados)) return declarados;

    const estados = [];
    for (const sociedad of sociedades) {
      const resp = await this._rpc('contabilidad.estado.balance.request', {
        project_id: pid,
        proyecto_sociedad: sociedad,
        periodo: (input && input.periodo) || null
      }, { timeout_ms: 4000 });
      if (!resp || resp.status !== 200) return null;
      const b = resp.data && (resp.data.balance || resp.data);
      estados.push({
        sociedad,
        activo: this._round(Number(b && b.activo && b.activo.total) || 0, 2),
        pasivo: this._round(Number(b && b.pasivo && b.pasivo.total) || 0, 2),
        patrimonio: this._round(Number(b && b.patrimonio && b.patrimonio.total) || 0, 2),
        resultado: null
      });
    }
    return estados;
  }

  // Agregacion determinista: suma por sociedad + aplica eliminaciones intercompany.
  _sumarEstados(estados, eliminaciones) {
    const totalEliminado = this._round(eliminaciones.reduce((t, e) => t + (Number(e.importe) || 0), 0), 2);
    const activo = this._round(estados.reduce((t, e) => t + (Number(e.activo) || 0), 0), 2);
    const pasivo = this._round(estados.reduce((t, e) => t + (Number(e.pasivo) || 0), 0), 2);
    const patrimonio = this._round(estados.reduce((t, e) => t + (Number(e.patrimonio) || 0), 0), 2);
    const resultado = this._round(estados.reduce((t, e) => t + (Number(e.resultado) || 0), 0), 2);

    return {
      activo: this._round(activo - totalEliminado, 2),
      pasivo: this._round(pasivo - totalEliminado, 2),
      patrimonio,
      resultado,
      activo_bruto: activo,
      pasivo_bruto: pasivo,
      eliminado_intercompany: totalEliminado
    };
  }

  // ── Tools ──
  toolEtiquetar(params) { return this._etiquetar(params); }
  toolDetectarCruceInterno(params) { return this._detectarCruceInterno(params); }
  toolEliminar(params) { return this._eliminar(params); }
  toolAgregar(params) { return this._agregar(params); }
}

module.exports = ConsolidacionGrupo;
