'use strict';
/**
 * politica-admision — P04 · CUSTODIO CON PERSISTENCIA (PA1–PA4, O12, I7).
 *
 * La POLÍTICA es el DATO que dice qué actos pide cada acto de entrada y en qué
 * estados del hilo se admite. Sin ella la puerta rechaza TODO con
 * MOTIVO_POLITICA_NO_DECLARADA (O12) — y eso es correcto: la puerta no inventa
 * políticas, las recibe. Este módulo es el único que las declara y las custodia.
 *
 * Por qué un módulo y no un fichero de config: la política CAMBIA (se redefine),
 * tiene EMISOR (quién la declara) y VERSION (cuántas veces se redefinió), y su
 * ausencia es una señal honesta (404), no un valor por defecto. Un dato con dueño
 * y ciclo de vida es un custodio.
 *
 * Almacén: snapshot JSON POR PROYECTO (`/conversaciones/politica.json` vía
 * PosPersistencia, misma carpeta que el ledger de llaves), restaurado en
 * `project.activated`. NO es append-only: una política es VIGENTE o no lo es.
 * Redefinir SOBREESCRIBE y sube `version` (la historia no se pide aquí; el hecho
 * `politica.definida` la deja trazada).
 *
 * Invariantes:
 *   PA1  único escritor de la política de admisión.
 *   PA2  sin `emisor` no hay declaración (la política tiene quién la declara).
 *   PA3  sin declaración NO hay política por defecto: se responde 404 y el
 *        coordinador corta la cadena (jamás se inventa un «todo permitido»).
 *   PA4  `actosPorEntrada` es obligatorio y no vacío; los actos son LEER|ESCRIBIR.
 *   O12  la ausencia se declara (404 RESOURCE_NOT_FOUND), no se rellena.
 *   I7   LEER ≠ ESCRIBIR: cada acto de entrada declara el conjunto EXACTO de
 *        actos que pide.
 *
 * Contrato:
 *   politica.definir.request   { request_id, project_id, actosPorEntrada,
 *                                estadosQueAdmiten?, emisor, ahora? }
 *     → politica.definir.response { request_id, status, data: { politica, redefinida } }
 *     → politica.definir.failed   (payload inválido: error de dominio, nunca timeout)
 *     → politica.definida         (hecho, tras escribir)
 *   politica.consultar.request { request_id, project_id }
 *     → politica.consultar.response { request_id, status, data: { politica } }
 *     → politica.consultar.failed   (sólo payload inválido: sin project_id)
 *     (proyecto sin política declarada → status 404 RESOURCE_NOT_FOUND)
 *   project.activated          → restaura la política del proyecto
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

// Los ÚNICOS actos del sistema de conversaciones (I7). Cualquier otro nombre es
// un error de quien declara, no un acto nuevo.
const ACTOS = ['LEER', 'ESCRIBIR'];
// Defaults DECLARADOS (no estimados): los estados del hilo que admiten entrada
// cuando quien declara no dice nada. Un hilo ARCHIVADA/CERRADA no admite nada.
const ESTADOS_POR_DEFECTO = ['ABIERTA', 'ACTIVA'];

const MOTIVOS = {
  PAYLOAD_INVALIDO: 'PAYLOAD_INVALIDO',
  ACTOS_POR_ENTRADA_AUSENTE: 'ACTOS_POR_ENTRADA_AUSENTE',
  ACTO_INVALIDO: 'ACTO_INVALIDO',
  ACTOS_VACIOS: 'ACTOS_VACIOS',
  SIN_EMISOR: 'SIN_EMISOR',
  ESTADOS_QUE_ADMITEN_INVALIDO: 'ESTADOS_QUE_ADMITEN_INVALIDO',
  POLITICA_NO_DECLARADA: 'POLITICA_NO_DECLARADA'
};

class PoliticaAdmision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'politica-admision';
    this.version = 'reflejo-0.1.0';

    // project_id → Política vigente. Un solo valor por proyecto (PA1): no hay
    // ledger, porque de una política sólo interesa la VIGENTE.
    this.politicas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'politica.json',
      dir: '/conversaciones',
      snapshot: (pid) => ({ politica: this.politicas.get(pid) || null }),
      hidratar: (pid, data) => this._hidratar(pid, data)
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Handlers RPC — una línea cada uno (patrón real del bus)
  // ───────────────────────────────────────────────────────────────────────

  onPoliticaDefinirRequest(e) {
    return this._atender(e, 'politica.definir', 'politica.definir.response', (d) => this._definir(d));
  }

  onPoliticaConsultarRequest(e) {
    return this._atender(e, 'politica.consultar', 'politica.consultar.response', (d) => this._consultar(d));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Proyecciones
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Declarar/redefinir la política del proyecto. SOBREESCRIBE (una política es
   * vigente o no lo es) y sube `version`.
   */
  async _definir(d = {}) {
    const rid = d.request_id || null;
    const project_id = d.project_id;
    if (!project_id) {
      return this._falloDefinir(MOTIVOS.PAYLOAD_INVALIDO, 'project_id', 'project_id requerido', rid);
    }

    // PA4 — actosPorEntrada obligatorio y no vacío.
    const crudo = d.actosPorEntrada;
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) {
      return this._falloDefinir(
        MOTIVOS.ACTOS_POR_ENTRADA_AUSENTE,
        'actosPorEntrada',
        'actosPorEntrada requerido: { ACTO_DE_ENTRADA: [actos que pide] } (p. ej. { "ESCRIBIR": ["LEER","ESCRIBIR"] })',
      rid);
    }
    const entradas = Object.keys(crudo);
    if (!entradas.length) {
      return this._falloDefinir(
        MOTIVOS.ACTOS_POR_ENTRADA_AUSENTE,
        'actosPorEntrada',
        'actosPorEntrada no puede estar vacío: sin entradas declaradas no hay política',
      rid);
    }

    const actosPorEntrada = {};
    const pedidos = new Set();
    for (const entrada of entradas) {
      const actoEntrada = this._acto(entrada);
      if (!actoEntrada) {
        return this._falloDefinir(
          MOTIVOS.ACTO_INVALIDO,
          `actosPorEntrada.${entrada}`,
          `acto de entrada inválido: "${entrada}" (válidos: ${ACTOS.join(', ')}; LEER ≠ ESCRIBIR)`,
        rid);
      }
      const lista = crudo[entrada];
      if (!Array.isArray(lista) || lista.length === 0) {
        return this._falloDefinir(
          MOTIVOS.ACTOS_VACIOS,
          `actosPorEntrada.${entrada}`,
          `actosPorEntrada.${entrada} debe ser un array no vacío de actos (${ACTOS.join(', ')})`,
        rid);
      }
      const actos = [];
      for (const a of lista) {
        const acto = this._acto(a);
        if (!acto) {
          return this._falloDefinir(
            MOTIVOS.ACTO_INVALIDO,
            `actosPorEntrada.${entrada}`,
            `acto inválido: "${a}" en actosPorEntrada.${entrada} (válidos: ${ACTOS.join(', ')}; LEER ≠ ESCRIBIR)`,
          rid);
        }
        if (!actos.includes(acto)) actos.push(acto);
        pedidos.add(acto);
      }
      // Un acto de entrada declarado DOS veces con distinta capitalización es
      // una declaración ambigua: se nombra en vez de elegir por el declarante.
      if (Object.prototype.hasOwnProperty.call(actosPorEntrada, actoEntrada)) {
        return this._falloDefinir(
          MOTIVOS.PAYLOAD_INVALIDO,
          `actosPorEntrada.${actoEntrada}`,
          `el acto de entrada ${actoEntrada} está declarado dos veces`,
        rid);
      }
      actosPorEntrada[actoEntrada] = actos;
    }

    // PA2 — sin emisor no hay declaración.
    if (!d.emisor || typeof d.emisor !== 'string' || !d.emisor.trim()) {
      return this._falloDefinir(
        MOTIVOS.SIN_EMISOR,
        'emisor',
        'emisor requerido: toda política tiene quién la declara',
      rid);
    }

    // estadosQueAdmiten es OPCIONAL; si viene, se valida (y se dice el default).
    let estadosQueAdmiten;
    if (d.estadosQueAdmiten === undefined || d.estadosQueAdmiten === null) {
      estadosQueAdmiten = [...ESTADOS_POR_DEFECTO];
    } else if (Array.isArray(d.estadosQueAdmiten) && d.estadosQueAdmiten.length) {
      estadosQueAdmiten = [...new Set(d.estadosQueAdmiten.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
      if (!estadosQueAdmiten.length) {
        return this._falloDefinir(MOTIVOS.ESTADOS_QUE_ADMITEN_INVALIDO, 'estadosQueAdmiten',
          'estadosQueAdmiten debe ser un array no vacío de estados del hilo (p. ej. ["ABIERTA","ACTIVA"])', rid);
      }
    } else {
      return this._falloDefinir(MOTIVOS.ESTADOS_QUE_ADMITEN_INVALIDO, 'estadosQueAdmiten',
        'estadosQueAdmiten debe ser un array no vacío de estados del hilo, o omitirse (default ABIERTA, ACTIVA)', rid);
    }

    // La MISMA política se expresa en la forma que la puerta ya sabe leer
    // (`actosPorEstado`): en estos estados se admiten TODOS los actos que la
    // propia política declara como pedibles. Derivación, no estimación — el
    // conjunto sale de actosPorEntrada[·].
    const actosPedibles = ACTOS.filter((a) => pedidos.has(a));
    const actosPorEstado = {};
    for (const estado of estadosQueAdmiten) actosPorEstado[estado] = [...actosPedibles];

    const previa = this.politicas.get(project_id) || null;
    const politica = {
      project_id,
      actosPorEntrada,
      estadosQueAdmiten,
      actosPorEstado,
      emisor: d.emisor.trim(),
      definidaEn: d.ahora || new Date().toISOString(),
      version: (previa?.version || 0) + 1
    };

    this.politicas.set(project_id, politica);
    this._persist.marcarDirty(project_id);

    // El hecho se publica DESPUÉS de escribir: describe lo que hay, no lo que se pidió.
    await this._publicarEvento('politica.definida', {
      project_id,
      version: politica.version,
      redefinida: Boolean(previa),
      actosPorEntrada,
      estadosQueAdmiten,
      emisor: politica.emisor,
      definidaEn: politica.definidaEn
    });

    this.metrics?.increment(`${this.name}.definidas`, { redefinida: String(Boolean(previa)) });
    this.logger?.info('politica-admision.definida', {
      module: this.name, project_id, version: politica.version, emisor: politica.emisor
    });

    return {
      status: previa ? 200 : 201,
      data: { politica: this._copia(politica), redefinida: Boolean(previa) }
    };
  }

  /** La política vigente del proyecto, o 404 honesto (O12). NUNCA un default. */
  async _consultar(d = {}) {
    if (!d.project_id) {
      await this._publicarEvento('politica.consultar.failed', {
        request_id: d.request_id || null,
        motivo: MOTIVOS.PAYLOAD_INVALIDO,
        field: 'project_id'
      });
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido',
        { kind: 'domain', motivo: MOTIVOS.PAYLOAD_INVALIDO, field: 'project_id' });
    }
    const politica = this.politicas.get(d.project_id);
    if (!politica) {
      // La AUSENCIA es una RESPUESTA (404), no un fallo del RPC: el par .failed
      // queda para payloads inválidos. Así el coordinador propaga el 404 literal
      // (`RESOURCE_NOT_FOUND`) en vez de un genérico FAILED.
      return this._errorResponse(
        404,
        'RESOURCE_NOT_FOUND',
        'El proyecto no ha declarado política de admisión',
        { kind: 'domain', entity_type: 'politica_admision', entity_id: d.project_id, motivo: MOTIVOS.POLITICA_NO_DECLARADA }
      );
    }
    return { status: 200, data: { politica: this._copia(politica) } };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  /** Normaliza un acto declarado a LEER|ESCRIBIR; cualquier otra cosa → null. */
  _acto(v) {
    if (typeof v !== 'string') return null;
    const a = v.trim().toUpperCase();
    return ACTOS.includes(a) ? a : null;
  }

  /** Copia defensiva: la política que sale no comparte referencias con el store. */
  _copia(politica) {
    return JSON.parse(JSON.stringify(politica));
  }

  async _falloDefinir(motivo, field, message, request_id = null) {
    await this._publicarEvento('politica.definir.failed', {
      request_id,
      motivo,
      field
    });
    return this._errorResponse(400, 'INVALID_INPUT', message, { kind: 'domain', motivo, field });
  }

  _hidratar(project_id, data) {
    const p = data?.politica;
    if (!p || typeof p !== 'object' || !p.actosPorEntrada) return;
    if (!this.politicas.has(project_id)) this.politicas.set(project_id, { ...p, project_id });
  }
}

module.exports = PoliticaAdmision;
