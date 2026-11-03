'use strict';

/**
 * acta-decisiones · CUSTODIO · PLAZA — O02 (ActaDeDecisiones).
 *
 * LA MEMORIA DE LO QUE SE DECIDIÓ. Ningún cambio de política (J01, J02, G01, E06) se escribe sin
 * acta: el cambio y el acta se escriben juntos o no hay cambio. Es la única forma de que cambiar
 * el criterio cueste algo.
 *
 * Y las tres reglas que son el módulo:
 *
 *   1. EL ACTA NO SE CORRIGE. Si el motivo era falso, se asienta OTRA que lo dice y que nombra a
 *      la que sustituye (`sustituye_a`). No hay op «corregir», ni «editar», ni «borrar»: un acta
 *      editable no es un acta. La que queda sustituida conserva su texto — lo que se deriva es
 *      quién la sustituye, no se reescribe ella.
 *   2. LA FIRMA LLEVA ÁMBITO Y NO SE CRUZA. Una solicitud de una tienda la firma esa tienda; el
 *      dueño de la plaza no firma por una tienda, ni una tienda firma el acta de otra. El ámbito
 *      viaja en el acta porque con tres unidades (plaza · tienda · nacional) la firma sin ámbito
 *      no dice quién decidió.
 *   3. UN ACTA DICE QUÉ CAMBIÓ, POR QUÉ, QUIÉN Y DESDE CUÁNDO. Sin motivo no hay acta (salvo que
 *      venga de un dictamen firmado: ahí la firma ES la autorización, y el hueco del motivo se
 *      NOMBRA en `faltantes` en vez de inventarse).
 *
 * ENCAJE CON `config-mercado` (que ya existe y no se toca): su `_declarar` exige un `acta` y
 * responde 409 SIN_ACTA sin él. El identificador que él guarda sale de esta cadena, en este orden:
 *
 *     d.acta · d.acta_id · d.dictamen_id · d.firma_id
 *
 * Esta isla usa LA MISMA cadena. Por eso un dictamen que llega por `bocaos.dictamen_firmado` se
 * asienta con el mismo id con el que `config-mercado` sella su política: la referencia del acta
 * apunta a un acta que existe, sin que nadie lea el almacén de nadie.
 *
 * Es una isla: no lee el almacén de nadie, no importa a nadie. Lo que necesita lo pide al bus.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

// Las clases de política que O02 cubre. Un cambio de criterio sin clase sigue siendo acta, pero
// la clase, si viene, tiene que ser una de éstas: no se inventan materias.
const CLASES = ['J01', 'J02', 'J03', 'J04', 'G01', 'E06'];

class ActaDecisiones extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'acta-decisiones';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/acta-decisiones.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onAsentarRequest(e) { return this.servir(e, 'asentar', 'acta-decisiones.asentar', (d) => this._asentar(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'acta-decisiones.de', (d) => this._de(d)); }
  onListarRequest(e) { return this.servir(e, 'listar', 'acta-decisiones.listar', (d) => this._listar(d)); }

  // ================= hechos que escucha =================
  // O02/O04: un dictamen firmado es una decisión. Se asienta con el MISMO id que `config-mercado`
  // usará como acta del cambio de política (misma cadena de fallback, ver cabecera).
  async onDictamenFirmado(e) {
    const d = this.datos(e);
    if (!d.project_id) return null;

    const acta_id = d.acta || d.acta_id || d.dictamen_id || d.firma_id || null;
    if (!acta_id) {
      // El dictamen sin identificador no se puede asentar: se dice, no se inventa uno.
      this.logger?.warn('acta-decisiones.dictamen_sin_id', { caso: d.caso_id || null });
      return null;
    }

    const est = await this.estado(d.project_id);
    if ((est.actas || []).some((a) => a.acta_id === String(acta_id))) return null;   // idempotente

    const r = await this._asentar({
      ...d,
      project_id: d.project_id,
      acta_id: String(acta_id),
      ambito: d.ambito || (d.tienda_id ? 'tienda' : 'plaza'),
      autor: d.autor || d.firmado_por,
      motivo: d.motivo || d.razon || null,
      asunto: d.asunto || (d.clase ? `dictamen ${d.clase}` : 'dictamen firmado'),
      cambio: d.cambio || d.efecto || d.politica || d.valores || d.umbrales || null,
      esperaba: d.esperaba || d.efecto_esperado || null,
      desde: d.desde || d.hora || null
    });
    if (r.status >= 400) {
      this.logger?.warn('acta-decisiones.dictamen_no_asentado', { acta_id: String(acta_id), code: r.error?.code || null });
    }
    return null;
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= O02 · asentar (ORDEN) =================
  async _asentar(d) {
    if (!d.project_id) return this._invalid('project_id');

    const ambito = d.ambito || (d.tienda_id ? 'tienda' : 'plaza');
    if (ambito !== 'plaza' && ambito !== 'tienda') {
      return this._errorResponse(400, 'INVALID_INPUT', 'ambito debe ser plaza | tienda', { field: 'ambito' });
    }
    if (ambito === 'tienda' && !d.tienda_id) return this._invalid('tienda_id');
    if (ambito === 'plaza' && d.tienda_id) {
      // §1.7: la plaza no firma por una tienda. Un acta de plaza con tienda_id sería eso.
      return this._errorResponse(409, 'AMBITO_NO_SE_CRUZA',
        'un acta de plaza no lleva tienda_id: la plaza no firma por una tienda', { field: 'tienda_id' });
    }

    const autor = this._autor(d.autor || d.firmado_por);
    if (!autor) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'autor requerido: un acta sin firma no dice quién decidió', { field: 'autor' });
    }

    const dictamen = d.dictamen_id || d.firma_id || null;
    const motivo = this._texto(d.motivo || d.razon);
    if (!motivo && !dictamen) {
      // O02: «por qué» es un campo, no un adorno. Un acta sin motivo es una firma en blanco.
      return this._errorResponse(400, 'INVALID_INPUT',
        'motivo requerido: si el motivo no consta, no hay acta que lo diga después', { field: 'motivo' });
    }

    const cambio = d.cambio ?? d.que ?? d.decision ?? d.politica ?? d.valores ?? d.umbrales ?? d.efecto ?? null;
    if (cambio === null || cambio === undefined || cambio === '') {
      return this._errorResponse(400, 'INVALID_INPUT',
        'cambio requerido: un acta dice qué se cambió, no sólo que hubo una reunión', { field: 'cambio' });
    }

    const clase = d.clase || (cambio && typeof cambio === 'object' ? cambio.clase : null) || null;
    if (clase && !CLASES.includes(clase)) {
      return this._errorResponse(400, 'INVALID_INPUT', `clase debe ser ${CLASES.join(' | ')}`, { field: 'clase', clases: CLASES });
    }

    const autor_id = this._identidad(d.autor || d.firmado_por);
    if (ambito === 'tienda') {
      const cruz = this._cruce(d, autor_id, autor);
      if (cruz) {
        return this._errorResponse(403, 'AMBITO_NO_SE_CRUZA', cruz, { field: 'autor', ambito, tienda_id: d.tienda_id });
      }
    }

    const desde = this._iso(d.desde || d.vigencia_desde || d.vigente_desde) || this.ahora();
    const asunto = this._texto(d.asunto || d.tema) || (typeof cambio === 'string' ? cambio : (clase ? `cambio de ${clase}` : 'cambio de política'));
    const esperaba = d.esperaba === undefined ? (d.efecto_esperado ?? null) : d.esperaba;
    const tienda_id = ambito === 'tienda' ? d.tienda_id : null;

    const acta_id = String(d.acta_id || d.acta || `acta-${crypto.randomUUID().slice(0, 8)}`);
    const huella = this.huella({ ambito, tienda_id, asunto, cambio, motivo: motivo || null, autor, desde });

    const est = await this.estado(d.project_id);
    est.actas = est.actas || [];

    const ya = est.actas.find((a) => a.acta_id === acta_id);
    if (ya) {
      if (ya.huella === huella) {
        return { status: 200, data: { acta_id, acta: this._vista(ya, est.actas), idempotente: true } };
      }
      // O02: el acta no se corrige. Se asienta otra que la sustituye y lo dice.
      return this._errorResponse(409, 'ACTA_NO_SE_CORRIGE',
        'el acta no se corrige: se asienta otra con otro id que nombra a ésta en sustituye_a',
        { field: 'acta_id', acta_id, acta_en_censo: ya.acta_id, hueco: 'acta editada' });
    }

    const sustituye_a = d.sustituye_a ? String(d.sustituye_a) : null;
    if (sustituye_a) {
      const previa = est.actas.find((x) => x.acta_id === sustituye_a);
      if (!previa) {
        return this._errorResponse(404, 'ACTA_NO_CONSTA',
          'la acta que dice sustituir no consta en esta plaza: no se sustituye el aire', { field: 'sustituye_a' });
      }
      if (sustituye_a === acta_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'un acta no se sustituye a sí misma', { field: 'sustituye_a' });
      }
      if (previa.ambito !== ambito || previa.tienda_id !== tienda_id) {
        return this._errorResponse(403, 'AMBITO_NO_SE_CRUZA',
          'una tienda no sustituye el acta de otra, ni la plaza la de una tienda',
          { field: 'sustituye_a', ambito_previa: previa.ambito });
      }
    }

    const acta = {
      acta_id,
      plaza_id: this.plaza_id || d.plaza_id || d.project_id,
      ambito,
      tienda_id,
      clase,
      asunto,
      cambio,
      motivo: motivo || null,
      esperaba,
      autor,
      autor_id,
      desde,
      asentada_en: this.ahora(),
      sustituye_a,
      dictamen_id: dictamen ? String(dictamen) : null,
      huella,
      // Lo que el acta NO trae se nombra; no se rellena con una suposición.
      faltantes: [
        ...(motivo ? [] : ['motivo']),
        ...(esperaba === null || esperaba === undefined ? ['esperaba'] : [])
      ]
    };

    est.actas.push(acta);
    await this.guardar(d.project_id);

    this.hecho('bocaos.acta_asentada', {
      acta_id,
      plaza_id: acta.plaza_id,
      ambito,
      tienda_id,
      clase,
      asunto,
      cambio,
      motivo: acta.motivo,
      esperaba,
      autor,
      desde,
      sustituye_a,
      huella,
      faltantes: acta.faltantes
    });

    return { status: 201, data: { acta_id, acta: this._vista(acta, est.actas) } };
  }

  // ================= O02 · el acta de un asunto (PREGUNTA) =================
  // `de` responde por la COSA: un acta concreta (acta_id) o la que hoy rige para un asunto, con su
  // cadena de sustituciones. Es la pregunta que hace quien tiene que explicar una decisión.
  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    const est = await this.estado(d.project_id);
    const actas = est.actas || [];

    if (d.acta_id) {
      const a = actas.find((x) => x.acta_id === String(d.acta_id));
      if (!a) return this._errorResponse(404, 'ACTA_NO_CONSTA', 'esa acta no consta en esta plaza', { field: 'acta_id' });
      return { status: 200, data: { acta: this._vista(a, actas) } };
    }

    const asunto = this._texto(d.asunto || d.tema);
    if (!asunto) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'pide un acta_id o un asunto: «de» responde por una cosa concreta', { field: 'asunto' });
    }

    const suyas = actas
      .filter((a) => a.asunto === asunto && (!d.ambito || a.ambito === d.ambito) && (!d.tienda_id || a.tienda_id === d.tienda_id))
      .sort((a, b) => Date.parse(a.asentada_en) - Date.parse(b.asentada_en));
    if (suyas.length === 0) {
      return this._errorResponse(404, 'ACTA_NO_CONSTA',
        `no hay acta de «${asunto}» en esta plaza`, { field: 'asunto', hueco: 'asunto sin acta' });
    }

    const vistas = suyas.map((a) => this._vista(a, actas));
    const vigente = vistas.filter((a) => a.sustituida_por === null).slice(-1)[0] || null;
    return {
      status: 200,
      data: {
        asunto,
        vigente,
        // La cadena entera, en orden: cómo se llegó al texto de hoy.
        cadena: vistas.map((a) => ({ acta_id: a.acta_id, motivo: a.motivo, desde: a.desde, sustituye_a: a.sustituye_a, sustituida_por: a.sustituida_por })),
        n: vistas.length
      }
    };
  }

  // ================= O02 · listar (PREGUNTA) =================
  async _listar(d) {
    if (!d.project_id) return this._invalid('project_id');
    const est = await this.estado(d.project_id);
    const actas = est.actas || [];

    if (d.acta_id) {
      const a = actas.find((x) => x.acta_id === String(d.acta_id));
      if (!a) {
        return this._errorResponse(404, 'ACTA_NO_CONSTA', 'esa acta no consta en esta plaza', { field: 'acta_id' });
      }
      return { status: 200, data: { acta: this._vista(a, actas) } };
    }

    const desde = this._iso(d.desde);
    const hasta = this._iso(d.hasta);
    let lista = actas.filter((a) => {
      if (d.ambito && a.ambito !== d.ambito) return false;
      if (d.tienda_id && a.tienda_id !== d.tienda_id) return false;
      if (d.asunto && a.asunto !== d.asunto) return false;
      if (desde && Date.parse(a.desde) < Date.parse(desde)) return false;
      if (hasta && Date.parse(a.desde) > Date.parse(hasta)) return false;
      return true;
    });

    const vistas = lista.map((a) => this._vista(a, actas));
    const vigentes = vistas.filter((a) => a.sustituida_por === null);

    const salida = {
      plaza_id: this.plaza_id || d.plaza_id || d.project_id,
      n: vistas.length,
      actas: vistas,
      // «Vigente» es un acta que nadie ha sustituido. Se DERIVA; no se escribe un booleano que
      // alguien tendría que acordarse de apagar.
      vigentes,
      sustituidas: vistas.filter((a) => a.sustituida_por !== null)
    };

    // `de_instante`: qué estaba vigente entonces, para explicar una decisión vieja con el texto
    // que se firmó, no con el de hoy.
    const instante = this._iso(d.instante);
    if (instante) {
      const t = Date.parse(instante);
      const vivas = vistas
        .filter((a) => Date.parse(a.desde) <= t)
        .sort((a, b) => {
          const diff = Date.parse(b.desde) - Date.parse(a.desde);
          return diff !== 0 ? diff : (Date.parse(b.asentada_en) - Date.parse(a.asentada_en));
        });
      salida.de_instante = {
        instante,
        vigente: vivas[0] || null,
        sustituida_despues: vivas.length > 1 ? vivas.slice(1) : [],
        // Si no hay ninguna, se dice que no hay: un hueco, no un acta vacía.
        faltantes: vivas.length === 0 ? ['ninguna acta vigente en ese instante'] : []
      };
    }

    return { status: 200, data: salida };
  }

  // ================= utilidades =================
  _vista(acta, todas) {
    const sust = (todas || []).find((x) => x.sustituye_a === acta.acta_id) || null;
    return {
      acta_id: acta.acta_id,
      plaza_id: acta.plaza_id,
      ambito: acta.ambito,
      tienda_id: acta.tienda_id,
      clase: acta.clase,
      asunto: acta.asunto,
      cambio: acta.cambio,
      motivo: acta.motivo,
      esperaba: acta.esperaba,
      autor: acta.autor,
      desde: acta.desde,
      asentada_en: acta.asentada_en,
      sustituye_a: acta.sustituye_a || null,
      sustituida_por: sust ? sust.acta_id : null,
      dictamen_id: acta.dictamen_id || null,
      huella: acta.huella,
      faltantes: acta.faltantes || []
    };
  }

  // El dueño de la plaza no firma por una tienda, y una tienda no firma el acta de otra. Si el
  // autor trae rol e identidad explícitos, se comprueban SIN mirar el almacén: el ámbito está en
  // la propia firma.
  _cruce(d, autor_id, autor) {
    const rol = d.rol || (d.autor && typeof d.autor === 'object' ? d.autor.rol : null) || null;
    if (rol && rol !== 'tienda') {
      return `un acta de tienda la firma la tienda: la firma llega con rol «${rol}»`;
    }
    if (autor_id && autor_id !== d.tienda_id) {
      return `«${autor_id}» no puede firmar el acta de «${d.tienda_id}»: una tienda no escribe actas de otra`;
    }
    if (rol === 'tienda' && !autor_id && autor) {
      // Un nombre sin id no se puede casar con la tienda; queda dicho en la vista como faltante.
      return null;
    }
    return null;
  }

  _identidad(a) {
    if (typeof a === 'string') return null;
    if (a && typeof a === 'object') return a.id || a.parte_id || a.tienda_id || a.rider_id || null;
    return null;
  }

  _autor(a) {
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') {
      return a.id || a.nombre || a.parte_id || a.tienda_id || a.rider_id || a.rol || null;
    }
    return null;
  }

  _texto(v) {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s ? s : null;
  }
}

module.exports = ActaDecisiones;
module.exports.CLASES = CLASES;
