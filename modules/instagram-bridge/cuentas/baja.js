'use strict';

/**
 * baja — B4 · BajaYTraspaso · CUSTODIO (la pluma es la de B1).
 *
 * Retirar una cuenta y cambiar de dueno una cuenta son los dos actos del final
 * del ciclo de vida. Ninguno borra nada: el padron es la memoria de quien publico
 * que, y una memoria que se puede vaciar no sirve para reconstruir nada.
 *
 * LAS TRES REGLAS, y por que cada una existe:
 *
 *   1. **Dar de baja ARCHIVA, no borra.** El asiento se queda para siempre con su
 *      `archivo` (motivo, quien, momento, autorizacion) y su `historia`. Despues
 *      de la baja, `consultar` sigue encontrando la cuenta: retirada no es
 *      desaparecida. Esta pieza lo COMPRUEBA leyendo el asiento despues de
 *      escribir: si el asiento no esta o no quedo archivado, la baja se declara
 *      inconsistente en vez de decir que fue bien.
 *
 *   2. **El traspaso conserva la historia y NO reescribe el sello.** Cambiar de
 *      proyecto anade un paso a `historia` (de/a/motivo/momento/quien); el `alta`
 *      de nacimiento y el `sello` (P1) quedan exactamente como estaban. Se
 *      comprueba comparando el asiento de antes con el de despues: si el sello o
 *      el alta cambiaron, el traspaso se rechaza aunque el padron haya dicho que
 *      si.
 *
 *   3. **Sin autorizacion no hay baja.** El padron ya lo impone; B4 no lo relaja
 *      ni lo rellena: una baja sin `autorizacion_id` se rechaza nombrando lo que
 *      falta.
 *
 * EL TRASPASO TIENE UNA PUERTA MAS: el proyecto destino necesita FICHA (E1). Una
 * cuenta que se muda a un proyecto que no ha declarado como habla no puede
 * operar; el traspaso queda PENDIENTE y **la cuenta sigue sirviendo a quien
 * servia**. Mudarla de todas formas seria dejar una cuenta sin voz en un proyecto
 * que no la conoce.
 *
 * BORRAR NO VIVE AQUI. Esta pieza no borra: dice que se perderia y que hace falta
 * una orden explicita distinta, registrada en Q5. Si el padron no tiene la
 * operacion de borrado, no se inventa en el borde.
 *
 * CUSTODIO: no tiene almacen propio ni candado propio, porque comparte el padron
 * con B1 (un padron, una pluma). El single-writer es el de B1 y esta pieza pasa
 * por el.
 *
 * Ver plan-construccion.md (flujo 6/7, bloque 15) y diseno-oop.md "B4 · BajaYTraspaso".
 */

const { es_objeto, es_instante, texto_no_vacio, QUIENES, clonar } = require('../core/formas');
const padron_puro = require('./padron');

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  SIN_AUTORIZACION: 'sin_autorizacion',
  SIN_PADRON: 'sin_padron',
  SIN_FICHAS: 'sin_fichas',
  CUENTA_DESCONOCIDA: 'cuenta_desconocida',
  CUENTA_DE_OTRO_PROYECTO: 'cuenta_de_otro_proyecto',
  CUENTA_ARCHIVADA: 'cuenta_archivada',
  YA_ARCHIVADA: 'ya_archivada',
  FICHA_DESTINO_AUSENTE: 'ficha_destino_ausente',
  ARCHIVO_INCONSISTENTE: 'archivo_inconsistente',
  SE_REESCRIBIO_LA_HISTORIA: 'se_reescribio_la_historia',
  BORRAR_NO_ES_DAR_DE_BAJA: 'borrar_no_es_dar_de_baja'
});

const SE_PIERDE_AL_BORRAR = Object.freeze([
  'el asiento del padron (que cuenta servia a que proyecto y en que aparato)',
  'su archivo (motivo, quien, momento y autorizacion de la baja)',
  'su historia (traspasos, realtas y el cierre)'
]);

function vacio(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function fallo(motivo, extra) {
  return Object.assign({ ok: false, motivo, borrado: false }, extra || {});
}

function igual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// B4 · el custodio
// ---------------------------------------------------------------------------

class BajaYTraspaso {
  /**
   * @param {{padron?:object, fichas?:object}} [opciones]
   *   `padron` es el modulo B1 (con `.baja()`, `.traspaso()` y `.consultar()`);
   *   `fichas` es E1, que decide si el proyecto destino puede hablar por la
   *   cuenta. Sin padron no hay baja: esta pieza no escribe su propio almacen.
   */
  constructor(opciones = {}) {
    this._padron = opciones.padron || null;
    this._fichas = opciones.fichas || (this._padron && this._padron.fichas) || null;
  }

  // ---- la baja (archiva) ---------------------------------------------------

  /**
   * Da de baja una cuenta: la ARCHIVA. No borra el asiento, no borra la historia.
   *
   * @param {{cuenta:string, motivo:string, momento:string, quien:string,
   *          autorizacion_id:string, proyecto?:string}} entrada
   */
  async dar_de_baja(entrada) {
    if (!this._padron) {
      return fallo(MOTIVOS.SIN_PADRON, {
        falta: 'el padron (B1), que es el unico dueno del asiento: la baja no se escribe desde el borde'
      });
    }
    const e = es_objeto(entrada) ? entrada : {};

    const faltan = [];
    for (const campo of ['cuenta', 'motivo']) if (vacio(e[campo])) faltan.push(campo);
    if (vacio(e.momento)) faltan.push('momento');
    if (vacio(e.quien)) faltan.push('quien');
    const invalidos = [];
    if (!faltan.includes('momento') && !es_instante(e.momento)) invalidos.push('momento');
    if (!faltan.includes('quien') && !QUIENES.includes(String(e.quien).trim())) invalidos.push('quien');
    if (faltan.length || invalidos.length) {
      return fallo(MOTIVOS.ENTRADA_INVALIDA, { faltan, invalidos });
    }

    // Sin permiso registrado no se archiva. El padron tambien lo exige; aqui se
    // dice con su nombre y con lo que falta, en vez de dejar que el rechazo
    // llegue disfrazado de "entrada invalida".
    if (vacio(e.autorizacion_id)) {
      return fallo(MOTIVOS.SIN_AUTORIZACION, {
        faltan: ['autorizacion_id'],
        falta: 'la autorizacion registrada que respalda la baja (autorizacion_id)'
      });
    }

    const antes = await this._leer(e.cuenta);
    if (!antes.ok) return antes;
    if (!antes.asiento) return fallo(MOTIVOS.CUENTA_DESCONOCIDA, { cuenta: padron_puro.normalizar_cuenta(e.cuenta) });
    if (antes.asiento.estado === 'archivada') {
      return fallo(MOTIVOS.YA_ARCHIVADA, { asiento: antes.asiento, cuenta: antes.asiento.cuenta });
    }
    if (texto_no_vacio(e.proyecto) && String(e.proyecto).trim() !== antes.asiento.proyecto) {
      return fallo(MOTIVOS.CUENTA_DE_OTRO_PROYECTO, {
        cuenta: antes.asiento.cuenta,
        proyecto_vigente: antes.asiento.proyecto,
        proyecto_ordenado: String(e.proyecto).trim(),
        pista: 'la baja la ordena el proyecto dueno de la cuenta'
      });
    }

    const r = await this._padron.baja({
      plataforma: e.plataforma,
      cuenta: e.cuenta,
      motivo: e.motivo,
      momento: e.momento,
      quien: e.quien,
      autorizacion_id: e.autorizacion_id
    });
    if (!r || r.ok !== true) {
      return fallo((r && r.motivo) || MOTIVOS.ENTRADA_INVALIDA, {
        asiento: r && r.asiento,
        faltan: (r && r.faltan) || [],
        invalidos: (r && r.invalidos) || [],
        pista: r && r.pista
      });
    }

    // "Archivar no borra" se COMPRUEBA: se relee el asiento y se cuenta.
    const despues = await this._leer(e.cuenta);
    if (!despues.ok) return despues;
    const a = despues.asiento;
    if (!a || a.estado !== 'archivada' || !es_objeto(a.archivo)) {
      return fallo(MOTIVOS.ARCHIVO_INCONSISTENTE, {
        cuenta: padron_puro.normalizar_cuenta(e.cuenta),
        detalle: 'despues de la baja el asiento no esta archivado: no se da por buena'
      });
    }
    if (!igual(a.alta, antes.asiento.alta) || !igual(a.sello, antes.asiento.sello)) {
      return fallo(MOTIVOS.ARCHIVO_INCONSISTENTE, {
        cuenta: a.cuenta,
        detalle: 'la baja toco el alta de nacimiento o el sello: eso no es archivar'
      });
    }

    return {
      ok: true,
      archivada: true,
      borrado: false,
      cuenta: a.cuenta,
      proyecto: a.proyecto,
      asiento: a,
      archivo: a.archivo,
      autorizacion_id: a.archivo.autorizacion_id,
      historia: a.historia.length,
      historia_conservada: true,
      sigue_consultable: true,
      resumen: `cuenta ${a.cuenta} archivada: el asiento, su archivo y su historia siguen ahi`
    };
  }

  // ---- el traspaso (conserva la historia) ---------------------------------

  /**
   * Cambia el dueno vigente de una cuenta. Exige ficha en el proyecto destino; si
   * no la hay, el traspaso queda PENDIENTE y la cuenta sigue sirviendo a quien
   * servia (ni se mueve ni se pierde nada).
   *
   * @param {{cuenta:string, proyecto_destino:string, motivo:string, momento:string,
   *          quien:string, aparato?:string, autorizacion_id?:string}} entrada
   */
  async traspasar(entrada) {
    if (!this._padron) {
      return fallo(MOTIVOS.SIN_PADRON, { falta: 'el padron (B1): el traspaso se le pide, no se escribe aqui' });
    }
    const e = es_objeto(entrada) ? entrada : {};

    const faltan = [];
    for (const campo of ['cuenta', 'proyecto_destino', 'motivo', 'momento', 'quien']) {
      if (vacio(e[campo])) faltan.push(campo);
    }
    const invalidos = [];
    if (!faltan.includes('momento') && !es_instante(e.momento)) invalidos.push('momento');
    if (!faltan.includes('quien') && !QUIENES.includes(String(e.quien).trim())) invalidos.push('quien');
    if (faltan.length || invalidos.length) return fallo(MOTIVOS.ENTRADA_INVALIDA, { faltan, invalidos });

    const antes = await this._leer(e.cuenta);
    if (!antes.ok) return antes;
    if (!antes.asiento) return fallo(MOTIVOS.CUENTA_DESCONOCIDA, { cuenta: padron_puro.normalizar_cuenta(e.cuenta) });
    if (antes.asiento.estado === 'archivada') {
      return fallo(MOTIVOS.CUENTA_ARCHIVADA, {
        asiento: antes.asiento,
        pista: 'una cuenta archivada no se traspasa: se da de alta otra vez'
      });
    }

    // La puerta del destino: sin ficha, el proyecto nuevo no sabe como habla la
    // cuenta. Se dice y NO se mueve nada.
    if (!this._fichas) {
      return fallo(MOTIVOS.SIN_FICHAS, {
        falta: 'la ficha del proyecto destino (E1) para comprobar que puede hablar por la cuenta',
        proyecto_actual: antes.asiento.proyecto,
        cuenta_sigue_sirviendo: true
      });
    }
    const ficha = await this._fichas.leer({
      plataforma: e.plataforma,
      cuenta: e.cuenta,
      proyecto: e.proyecto_destino
    });
    if (!ficha || ficha.ok !== true) {
      return fallo((ficha && ficha.motivo) || MOTIVOS.SIN_FICHAS, { cuenta: antes.asiento.cuenta });
    }
    if (ficha.hallada !== true || !ficha.ficha) {
      return fallo(MOTIVOS.FICHA_DESTINO_AUSENTE, {
        pendiente: true,
        cuenta: antes.asiento.cuenta,
        proyecto_actual: antes.asiento.proyecto,
        proyecto_destino: String(e.proyecto_destino).trim(),
        cuenta_sigue_sirviendo: true,
        falta: `la ficha de ${antes.asiento.cuenta} en ${String(e.proyecto_destino).trim()} (E1): sin ficha el proyecto nuevo no puede hablar por la cuenta`
      });
    }

    const sello_antes = clonar(antes.asiento.sello);
    const alta_antes = clonar(antes.asiento.alta);
    const historia_antes = antes.asiento.historia.length;

    const r = await this._padron.traspaso({
      plataforma: e.plataforma,
      cuenta: e.cuenta,
      proyecto_destino: e.proyecto_destino,
      aparato: e.aparato,
      motivo: e.motivo,
      momento: e.momento,
      quien: e.quien,
      autorizacion_id: e.autorizacion_id
    });
    if (!r || r.ok !== true) {
      return fallo((r && r.motivo) || MOTIVOS.ENTRADA_INVALIDA, {
        asiento: r && r.asiento,
        faltan: (r && r.faltan) || [],
        invalidos: (r && r.invalidos) || [],
        pista: r && r.pista
      });
    }

    // Verificacion dura: sello y alta intactos, historia con UN paso mas.
    const despues = await this._leer(e.cuenta);
    if (!despues.ok) return despues;
    const a = despues.asiento;
    const sello_intacto = a && igual(a.sello, sello_antes);
    const alta_intacta = a && igual(a.alta, alta_antes);
    const historia_ok = a && Array.isArray(a.historia) && a.historia.length === historia_antes + 1;
    if (!a || !sello_intacto || !alta_intacta || !historia_ok) {
      return fallo(MOTIVOS.SE_REESCRIBIO_LA_HISTORIA, {
        cuenta: antes.asiento.cuenta,
        sello_intacto,
        alta_intacta,
        historia_antes,
        historia_despues: a ? a.historia.length : null,
        detalle: 'el traspaso reescribio el sello o el alta: no se da por bueno'
      });
    }

    return {
      ok: true,
      traspaso: true,
      borrado: false,
      cuenta: a.cuenta,
      asiento: a,
      de: { proyecto: antes.asiento.proyecto, aparato: antes.asiento.aparato },
      a: { proyecto: a.proyecto, aparato: a.aparato },
      sello_intacto: true,
      alta_intacta: true,
      historia: a.historia.length,
      historia_conservada: true,
      resumen: `cuenta ${a.cuenta} traspasada de ${antes.asiento.proyecto} a ${a.proyecto}: historia conservada, sello intacto`
    };
  }

  // ---- borrar (NO se hace aqui) -------------------------------------------

  /**
   * Borrar NO es dar de baja. Esta pieza no borra el asiento: dice que se
   * perderia y que hace falta una orden explicita distinta, registrada en Q5.
   * Si el padron no tiene la operacion, no se inventa en el borde.
   */
  borrar(entrada) {
    const e = es_objeto(entrada) ? entrada : {};
    return {
      ok: false,
      motivo: MOTIVOS.BORRAR_NO_ES_DAR_DE_BAJA,
      borrado: false,
      cuenta: padron_puro.normalizar_cuenta(e.cuenta) || null,
      orden_explicita: e.orden_explicita === true,
      se_pierde: SE_PIERDE_AL_BORRAR.slice(),
      exige: 'una orden explicita del dueno, registrada en Q5 (RegistroDeAutorizaciones)',
      pista: 'la baja archiva y conserva la historia; borrar es otra operacion y no la hace esta pieza'
    };
  }

  /** El asiento, para quien quiera mirar antes de ordenar una baja o un traspaso. */
  async consultar(sel) {
    const s = es_objeto(sel) ? sel : { cuenta: sel };
    return this._leer(s.cuenta);
  }

  // ---- utilidades ---------------------------------------------------------

  async _leer(cuenta) {
    if (!this._padron) return fallo(MOTIVOS.SIN_PADRON, { falta: 'el padron (B1)' });
    const r = await this._padron.consultar({ cuenta });
    if (!r || r.ok !== true) {
      return fallo((r && r.motivo) || MOTIVOS.ENTRADA_INVALIDA, { cuenta: padron_puro.normalizar_cuenta(cuenta) });
    }
    return { ok: true, asiento: r.asiento ? clonar(r.asiento) : null, cuenta: padron_puro.normalizar_cuenta(cuenta) };
  }
}

/** Factory: la forma comoda para tests y para el loader. */
function crear(opciones = {}) {
  return new BajaYTraspaso(opciones);
}

function describir() {
  return {
    baja: 'archiva: conserva asiento, archivo e historia',
    traspaso: 'cambia de dueno conservando la historia; no reescribe el sello ni el alta de nacimiento',
    puerta_del_traspaso: 'el proyecto destino necesita ficha (E1); sin ella queda pendiente y la cuenta sigue sirviendo al anterior',
    borrar: 'no se hace aqui: exige orden explicita distinta, registrada en Q5, y se dice que se pierde',
    autorizacion: 'sin autorizacion_id no hay baja'
  };
}

module.exports = {
  MOTIVOS,
  SE_PIERDE_AL_BORRAR,
  BajaYTraspaso,
  crear,
  describir
};

// Vista "clase" para quien prefiera el nombre del diseno (B4 · BajaYTraspaso).
module.exports.Baja = Object.freeze({
  dar_de_baja: (instancia, entrada) => instancia.dar_de_baja(entrada),
  traspasar: (instancia, entrada) => instancia.traspasar(entrada),
  borrar: (instancia, entrada) => instancia.borrar(entrada),
  consultar: (instancia, sel) => instancia.consultar(sel)
});
