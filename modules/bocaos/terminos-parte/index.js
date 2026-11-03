'use strict';

/**
 * terminos-parte · CUSTODIO · PLAZA — I08 (TérminosParte).
 *
 * LO QUE CADA PARTE ACEPTÓ, CON VERSIÓN Y HORA. Sin términos vigentes no hay propuesta ni devengo
 * para esa parte: no se puede cobrar por algo que nadie aceptó.
 *
 * Las tres reglas que son el módulo:
 *
 *   1. NO ES RETROACTIVO. Aceptar la v2 no reescribe la v1: la lista de aceptaciones es append-only
 *      y cada pregunta lleva su instante. Quien no acepta la nueva sigue con la vieja hasta que la
 *      acepte o se vaya — y se va sin penalización (M03).
 *   2. UNA VERSIÓN ES UN TEXTO, NO UN NÚMERO. Si dos partes dicen «v3» y las cláusulas son
 *      distintas, no son la misma v3: 409 VERSION_CONTRADICHA. Un número que puede significar dos
 *      cosas no sirve para explicar un cargo.
 *   3. LA ACEPTA LA PARTE, NO LA SALA. Ni la plaza ni el sistema aceptan en nombre de nadie: el
 *      consentimiento es de quien lo da.
 *
 * LA PUERTA SE DEVUELVE, NO SE SUPONE. `vigentes` devuelve `puerta: { propuesta, devengo }` para
 * que `enlace` y `liquidacion` no tengan que re-interpretar los términos: preguntan al dueño. Y
 * cuando no hay términos, la respuesta es 404 NO_CONSTA con el hueco nombrado — no una versión 0
 * inventada.
 *
 * Es una isla: no lee el almacén de nadie. Que la parte esté en el censo lo PREGUNTA al bus
 * (`censo-parte.de.request`); si el censo no contesta, se acepta y se dice que no se pudo verificar
 * (`censo_verificado: false`) en vez de inventar un alta o bloquear un consentimiento.
 */

const ModuloBocaos = require('../_bocaos');

class TerminosParte extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'terminos-parte';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/terminos-parte.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onAceptarRequest(e) { return this.servir(e, 'aceptar', 'terminos-parte.aceptar', (d) => this._aceptar(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'terminos-parte.de', (d) => this._de(d)); }
  onVigentesRequest(e) { return this.servir(e, 'vigentes', 'terminos-parte.vigentes', (d) => this._vigentes(d)); }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= I08 · aceptar (ORDEN) =================
  async _aceptar(d) {
    if (!d.project_id) return this._invalid('project_id');
    const parte_id = d.parte_id || d.rider_id || d.tienda_id;
    if (!parte_id) return this._invalid('parte_id');

    const version = d.version === undefined || d.version === null ? null : String(d.version).trim();
    if (!version) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'version requerida: una aceptación sin versión no dice qué se aceptó', { field: 'version' });
    }

    const tipo = d.tipo || (d.rider_id ? 'rider' : (d.tienda_id ? 'tienda' : null));
    if (tipo && tipo !== 'rider' && tipo !== 'tienda') {
      return this._errorResponse(400, 'INVALID_INPUT', 'tipo debe ser rider | tienda', { field: 'tipo' });
    }

    // El consentimiento es de quien lo da: ni la sala ni la plaza aceptan por una parte.
    const quien = this._quien(d, parte_id, tipo);
    if (quien.niega) {
      return this._errorResponse(403, 'TERMINOS_NO_ES_SUYO', quien.niega, { field: 'autor' });
    }

    const hora = this._iso(d.hora) || this.ahora();
    const clausulas = this._clausulas(d.clausulas || d.clausulas_aceptadas || d.reglas || d.texto);
    const huella = this.huella({ version, clausulas: clausulas || null });

    const est = await this.estado(d.project_id);
    est.aceptaciones = est.aceptaciones || {};
    est.versiones = est.versiones || {};
    const propias = est.aceptaciones[parte_id] || [];

    const ya = propias.find((a) => a.version === version);
    if (ya) {
      if (ya.huella === huella) {
        return { status: 200, data: { aceptacion: ya, terminos: this._vigenteDe(propias, this.ahora()), idempotente: true } };
      }
      // Misma parte, misma versión, otro texto: o el texto cambió bajo los pies, o alguien
      // reescribe lo aceptado. Las dos cosas son el mismo problema.
      return this._errorResponse(409, 'TERMINOS_NO_SE_REESCRIBEN',
        `«${parte_id}» ya aceptó la v${version} con otro texto: lo aceptado no se reescribe`,
        { field: 'clausulas', version, hueco: 'texto cambiado bajo la misma versión' });
    }

    // No se reescribe el pasado: si ya hay una aceptación fechada después de ésta, la nueva entra
    // por debajo.
    const futura = propias.find((a) => Date.parse(a.hora) > Date.parse(hora));
    if (futura) {
      return this._errorResponse(409, 'VIGENCIA_RETROACTIVA',
        `no se reescribe el pasado: «${parte_id}» ya aceptó la v${futura.version} en ${futura.hora}`,
        { field: 'hora', hora, aceptada_en: futura.hora, version_posterior: futura.version });
    }

    // I08: una versión es un texto. Si otra parte ya aceptó esa versión con otras cláusulas, el
    // número ha dejado de significar una cosa.
    const vista = est.versiones[version];
    if (vista && vista.huella !== huella) {
      return this._errorResponse(409, 'VERSION_CONTRADICHA',
        `la v${version} ya consta con otro texto: una versión que significa dos cosas no explica un cargo`,
        { field: 'clausulas', version, huella_vista: vista.huella, huella_recibida: huella });
    }

    // Sin alta no hay términos que aceptar (I02). Se PREGUNTA al bus; si el censo no contesta, se
    // acepta y se dice que no se pudo verificar — no se inventa ni el alta ni el bloqueo.
    const censo = await this._censo(d.project_id, parte_id);
    if (censo && censo.status === 404) {
      return this._errorResponse(409, 'PARTE_NO_CENSADA',
        'sin alta en el censo no hay términos: acepta una parte que el mercado conoce',
        { field: 'parte_id', hueco: 'parte sin alta', motivo: 'I08 depende del alta (I01/I02)' });
    }

    const anterior = this._vigenteDe(propias, hora);
    const aceptacion = {
      parte_id,
      tipo: tipo || (censo && censo.data && censo.data.parte ? censo.data.parte.tipo : null),
      version,
      hora,
      clausulas: clausulas || null,
      huella,
      autor: quien.autor,
      // Lo que sustituye, si sustituye algo. La vigencia de la vieja NO se toca: se deriva.
      sustituye_a: anterior ? anterior.version : null,
      censo_verificado: !!censo,
      plaza_id: this.plaza_id || d.plaza_id || d.project_id
    };

    propias.push(aceptacion);
    est.aceptaciones[parte_id] = propias;
    if (!vista) {
      est.versiones[version] = {
        version,
        huella,
        clausulas: clausulas || null,
        primera_aceptacion: hora,
        primera_parte: parte_id
      };
    }
    await this.guardar(d.project_id);

    this.hecho('bocaos.terminos_aceptados', {
      parte_id,
      tipo: aceptacion.tipo,
      plaza_id: aceptacion.plaza_id,
      rider_id: tipo === 'rider' ? parte_id : null,
      tienda_id: tipo === 'tienda' ? parte_id : null,
      version,
      hora,
      clausulas: aceptacion.clausulas,
      huella,
      sustituye_a: aceptacion.sustituye_a,
      censo_verificado: aceptacion.censo_verificado
    });

    return {
      status: 201,
      data: {
        aceptacion,
        terminos: this._vigenteDe(propias, hora),
        puerta: { propuesta: true, devengo: true }
      }
    };
  }

  // ================= I08 · qué aceptó una parte (PREGUNTA) =================
  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    const est = await this.estado(d.project_id);
    const aceptaciones = est.aceptaciones || {};
    const parte_id = d.parte_id || d.rider_id || d.tienda_id || null;

    if (parte_id) {
      const propias = aceptaciones[parte_id];
      if (!propias || propias.length === 0) {
        return this._errorResponse(404, 'TERMINOS_NO_CONSTAN',
          'esa parte no ha aceptado ninguna versión en esta plaza', { field: 'parte_id', hueco: 'sin términos aceptados' });
      }
      const instante = this._iso(d.instante) || this.ahora();
      return {
        status: 200,
        data: {
          parte_id,
          n: propias.length,
          aceptaciones: propias,
          vigente: this._vigenteDe(propias, instante),
          instante
        }
      };
    }

    const partes = Object.keys(aceptaciones);
    return {
      status: 200,
      data: {
        plaza_id: this.plaza_id || d.plaza_id || d.project_id,
        n: partes.length,
        // El catálogo de versiones que este mercado ha visto, con su texto y quién la estrenó.
        versiones: Object.values(est.versiones || {}),
        partes: partes.map((id) => ({
          parte_id: id,
          n: aceptaciones[id].length,
          vigente: this._vigenteDe(aceptaciones[id], this._iso(d.instante) || this.ahora())
        })),
        // Quien está en una versión anterior no es un error: es alguien que no ha aceptado la
        // nueva, y sigue con la vieja hasta que la acepte o se vaya (I08).
        desfasadas: this._desfasadas(aceptaciones, est.versiones || {})
      }
    };
  }

  // ================= I08 · la puerta (PREGUNTA) =================
  async _vigentes(d) {
    if (!d.project_id) return this._invalid('project_id');
    const parte_id = d.parte_id || d.rider_id || d.tienda_id;
    if (!parte_id) return this._invalid('parte_id');

    const instante = this._iso(d.instante) || this.ahora();
    const est = await this.estado(d.project_id);
    const propias = (est.aceptaciones || {})[parte_id] || [];
    const vigente = this._vigenteDe(propias, instante);

    if (!vigente) {
      // Sin términos no hay propuesta ni devengo. Se dice el hueco, no se devuelve una v0.
      return this._errorResponse(404, 'TERMINOS_NO_CONSTAN',
        'sin términos vigentes no hay propuesta ni devengo para esa parte (I08)',
        {
          field: 'parte_id',
          hueco: 'sin términos aceptados',
          instante,
          // Si los aceptó DESPUÉS del instante preguntado, se dice: no es que no haya, es que
          // todavía no había.
          posterior: propias.length > 0 ? propias.map((a) => ({ version: a.version, hora: a.hora })) : null,
          puerta: { propuesta: false, devengo: false }
        });
    }

    const ultima = this._ultimaVersion(est.versiones || {});
    return {
      status: 200,
      data: {
        parte_id,
        instante,
        terminos: vigente,
        puerta: { propuesta: true, devengo: true },
        // Estar en la versión anterior es legítimo; lo que no puede pasar es que nadie lo sepa.
        al_dia: ultima === null || vigente.version === ultima,
        version_ultima: ultima
      }
    };
  }

  // ================= derivaciones =================
  // La versión en vigor PARA ESA PARTE en un instante: la última que aceptó hasta ese momento. No
  // la última del mercado — ése es el error que hace retroactivo un cambio de términos.
  _vigenteDe(propias, instante) {
    const t = Date.parse(instante);
    if (!Number.isFinite(t)) return null;
    const vivas = (propias || [])
      .filter((a) => Date.parse(a.hora) <= t)
      .sort((a, b) => Date.parse(b.hora) - Date.parse(a.hora));
    if (vivas.length === 0) return null;
    const v = vivas[0];
    return {
      parte_id: v.parte_id,
      version: v.version,
      desde: v.hora,
      clausulas: v.clausulas,
      huella: v.huella,
      autor: v.autor,
      sustituye_a: v.sustituye_a || null,
      fuente: 'aceptada'
    };
  }

  _ultimaVersion(versiones) {
    const claves = Object.keys(versiones || {});
    if (claves.length === 0) return null;
    // Orden por PRIMERA aceptación, no por número: las versiones se nombran como quiere el dueño.
    return claves.sort((a, b) => {
      const x = Date.parse(versiones[a].primera_aceptacion) || 0;
      const y = Date.parse(versiones[b].primera_aceptacion) || 0;
      return y - x;
    })[0];
  }

  _desfasadas(aceptaciones, versiones) {
    const ultima = this._ultimaVersion(versiones);
    if (!ultima) return [];
    const ahora = this.ahora();
    return Object.keys(aceptaciones)
      .map((id) => ({ parte_id: id, vigente: this._vigenteDe(aceptaciones[id], ahora) }))
      .filter((x) => x.vigente && x.vigente.version !== ultima)
      .map((x) => ({ parte_id: x.parte_id, version: x.vigente.version, desde: x.vigente.desde }));
  }

  _clausulas(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') {
      const s = v.trim();
      return s ? [s] : null;
    }
    if (Array.isArray(v)) {
      const l = v
        .map((c) => {
          if (typeof c === 'string') return c.trim();
          if (c && typeof c === 'object') return String(c.id || c.clave || c.texto || '').trim();
          return '';
        })
        .filter(Boolean);
      return l.length > 0 ? l : null;
    }
    return null;
  }

  // Quién acepta. Si trae rol, tiene que ser el de la parte; si trae id, el de la parte. Sin rol
  // ni id explícitos se toma la propia parte (la petición llega por su puerta).
  _quien(d, parte_id, tipo) {
    const autor = d.autor;
    const rol = d.rol || (autor && typeof autor === 'object' ? autor.rol : null) || null;
    const id = autor && typeof autor === 'object'
      ? (autor.id || autor.parte_id || autor.rider_id || autor.tienda_id || null)
      : (typeof autor === 'string' ? autor.trim() : null);

    if (rol && tipo && rol !== tipo) {
      return { niega: `una aceptación de ${tipo} la firma la ${tipo}: la firma llega con rol «${rol}»` };
    }
    if (id && id !== parte_id) {
      return { niega: `«${id}» no puede aceptar los términos de «${parte_id}»` };
    }
    return { autor: id || (rol ? `${rol}:${parte_id}` : parte_id) };
  }

  async _censo(project_id, parte_id) {
    try {
      const r = await this._rpc('censo-parte.de.request',
        { project_id, plaza_id: this.plaza_id || null, parte_id }, { timeout_ms: 1200 });
      if (!r || typeof r.status !== 'number') return null;
      return r;
    } catch (_) {
      return null;
    }
  }
}

module.exports = TerminosParte;
