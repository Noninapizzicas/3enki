/**
 * contabilidad-fiscal/registro-verifactu — CUSTODIO CON PERSISTENCIA (D8, hoja del plan).
 *
 * La CADENA INALTERABLE de la facturacion: un registro ENCADENADO donde cada factura
 * emitida deja su huella, ligada a la huella del eslabon ANTERIOR. Es un registro
 * APPEND-ONLY: una vez encadenada, una factura NO se borra, NO se reordena y NO se muta.
 * Romper la cadena (huella_anterior != ultima_huella) es corrupcion: se rechaza.
 *
 * UN SOLO ESCRITOR de la parcela: este custodio. Ningun otro muta la cadena.
 *   != el cuerpo de la factura (eso es de `emision-factura-venta` O1): aqui solo se
 *   ENCADENA su huella. Lo ausente se declara, no se estima.
 *
 * Invariante: dato ausente = desconocido. Sin factura no hay nada que encadenar (no se
 * inventa un eslabon). La huella se DECLARA o se deriva de la factura declarada (identidad,
 * no juicio). El mismo eslabon (misma huella) no se re-encadena: idempotente.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.factura_emitida`; NINGUN modulo del
 * repo lo emite AUN (lo emite `emision-factura-venta` O1, de un grupo posterior): declararlo
 * daria cadena colgada. NO se declara hasta que su emisor exista.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + APPEND-ONLY.
 * Ver hoja D8 del plan-construccion y diseno-oop.md (CLASE RegistroVerifactu).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// El eslabon de origen: la primera factura encadenada no tiene huella anterior.
const GENESIS = 'GENESIS';

class RegistroVerifactu extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'registro-verifactu';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, registros:[append-only], ultima_huella }
    this._cadenas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'registro-verifactu.json',
      dir: '/contabilidad/registro-verifactu',
      snapshot: (pid) => {
        const c = this._cadenas.get(pid);
        if (!c) return null;
        return { project_id: pid, esquema: c.esquema, registros: c.registros, ultima_huella: c.ultima_huella };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const registros = Array.isArray(data.registros) ? data.registros : [];
        this._cadenas.set(pid, {
          esquema: data.esquema || 'contabilidad-registro-verifactu-v1',
          registros,
          ultima_huella: data.ultima_huella != null ? data.ultima_huella
            : (registros.length > 0 ? registros[registros.length - 1].huella : GENESIS)
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la cadena del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onEncadenarRequest(e) {
    return this._atender(e, 'encadenar', 'registro-verifactu.encadenar.response', async (d) => {
      const res = this._encadenar(d);
      if (res.status === 200) {
        if (res.data.encadenada === true) {
          // R2 · si ESCRIBE, anuncia el HECHO: una factura quedo encadenada en el registro.
          this.eventBus?.publish('contabilidad.factura_encadenada', {
            project_id: res.data.project_id,
            factura: res.data.factura,
            huella: res.data.registro.huella,
            huella_anterior: res.data.registro.huella_anterior,
            posicion: res.data.registro.posicion,
            encadenada_en: res.data.registro.encadenada_en,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('registro-verifactu.encadenar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // encadenar(factura) → Registro (UNICO ESCRITOR de la cadena)
  // ══════════════════════════════════════════════════════════════════════
  _encadenar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La FACTURA: viene declarada. Sin ella no se inventa un eslabon (dato ausente = desconocido).
    const factura = (input.factura && typeof input.factura === 'object') ? input.factura
      : ((input.f && typeof input.f === 'object') ? input.f : null);
    if (!factura) return this._invalid('factura');

    const cadena = this._obtenerOCrear(pid);

    // La huella ANTERIOR es la ultima de la cadena. Si la peticion declara una distinta, la
    // cadena estaria rota: se RECHAZA (la cadena es inalterable, no se reordena).
    const huella_anterior = cadena.ultima_huella || GENESIS;
    if (input.huella_anterior != null && String(input.huella_anterior) !== huella_anterior) {
      return this._errorResponse(409, 'CADENA_ROTA',
        'la huella_anterior declarada no liga con el ultimo eslabon: el registro es inalterable',
        { esperada: huella_anterior, recibida: String(input.huella_anterior) });
    }

    // La HUELLA de la factura: declarada o derivada de su contenido DECLARADO (identidad, no juicio).
    const huella = this._huella(factura, input, huella_anterior);

    // IDEMPOTENCIA: el mismo eslabon (misma huella) NO se re-encadena.
    const ya = cadena.registros.find((r) => r.huella === huella) || null;
    if (ya) {
      return {
        status: 200,
        data: {
          project_id: pid, factura, registro: ya, encadenada: false, ya_existe: true,
          motivo: 'la misma huella ya estaba encadenada (el registro no duplica eslabones)'
        }
      };
    }

    // ── APPEND-ONLY: la cadena SOLO crece. El nuevo eslabon liga con el anterior. ──
    const ahora = new Date().toISOString();
    const registro = {
      id: `vf_${pid}_${cadena.registros.length + 1}`,
      posicion: cadena.registros.length + 1,
      factura: factura.numero != null ? String(factura.numero) : (factura.id != null ? String(factura.id) : null),
      serie: factura.serie != null ? String(factura.serie) : null,
      fecha: factura.fecha != null ? String(factura.fecha) : null,
      huella,
      huella_anterior,                    // el eslabon liga con el anterior: cadena inalterable
      inmutable: true,                    // una vez encadenado, no se muta ni se borra
      encadenada_en: ahora
    };
    cadena.registros.push(registro);
    cadena.ultima_huella = huella;
    cadena.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        factura,
        registro,
        encadenada: true,
        total: cadena.registros.length,
        append_only: true
      }
    };
  }

  // Huella identitaria: la declarada, o hash de la factura + la huella anterior (liga la cadena).
  _huella(factura, input, huella_anterior) {
    if (input.huella != null && String(input.huella).trim() !== '') return String(input.huella).trim();
    if (factura.huella != null && String(factura.huella).trim() !== '') return String(factura.huella).trim();
    const material = JSON.stringify({
      huella_anterior,
      serie: factura.serie !== undefined ? factura.serie : null,
      numero: factura.numero !== undefined ? factura.numero : null,
      fecha: factura.fecha !== undefined ? factura.fecha : null,
      total: factura.total !== undefined ? factura.total : null,
      emisor: factura.emisor !== undefined ? factura.emisor : null,
      receptor: factura.receptor !== undefined ? factura.receptor : null
    });
    return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
  }

  _obtenerOCrear(pid) {
    let c = this._cadenas.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-registro-verifactu-v1', registros: [], ultima_huella: GENESIS };
      this._cadenas.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // Lectura directa de la cadena (mismo proceso) — no muta. Para la inspeccion.
  cadenaDe(pid) {
    const c = pid ? this._cadenas.get(pid) : null;
    return c ? [...c.registros] : [];
  }

  // Verificacion determinista: la cadena liga eslabon a eslabon.
  verificarCadena(pid) {
    const registros = this.cadenaDe(pid);
    let anterior = GENESIS;
    for (const r of registros) {
      if (r.huella_anterior !== anterior) return { ok: false, rota_en: r.posicion, esperada: anterior, recibida: r.huella_anterior };
      anterior = r.huella;
    }
    return { ok: true, eslabones: registros.length };
  }

  // ── Tools ──
  toolEncadenar(params) { return this._encadenar(params); }
}

module.exports = RegistroVerifactu;
