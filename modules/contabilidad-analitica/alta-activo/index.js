/**
 * contabilidad-analitica/alta-activo — CUSTODIO CON PERSISTENCIA (F1, hoja del plan).
 *
 * La PARCELA DEL INMOVILIZADO: la ficha de cada BIEN de la empresa (la maquina, el vehiculo,
 * el local, el ordenador). Es la raiz del grupo F — sin esta ficha no hay amortizacion (F2),
 * ni valor neto (F4), ni baja (F3).
 *
 * LOS DATOS DEL BIEN SON DECLARABLES: su valor, su fecha de alta, su vida util y su metodo
 * entran como DATO declarado por el negocio. El modulo NUNCA los estima, NUNCA inventa una
 * vida util, NUNCA asume un valor residual ni un metodo. Un dato que no llega queda `null` =
 * desconocido y se declara en `abierto` — jamas se rellena con un valor por defecto.
 *
 * LA VALORACION DEL ALTA ES REFLEJO HIDRATADOR: el modulo RECIBE la valoracion ya hecha
 * (el valor del bien llega declarado); no la calcula ni la deriva.
 *
 * UN SOLO ESCRITOR: solo el camino de alta (rol ALTA_INMOVILIZADO) registra activos;
 * cualquier otro rol es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - `registrar` es UPSERT declarativo por `id_activo`: el mismo id ACTUALIZA la ficha (el dueno
 *    corrige) y apila el cambio en su historial; nunca se borra en silencio.
 *  - Nada cableado: ninguna vida util fiscal, ningun coeficiente, ningun metodo, ningun tipo de
 *    bien, ninguna cuenta contable. Todo entra como dato declarado.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja F1 del plan-construccion y diseno-oop.md (CLASE AltaActivo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor: el alta del inmovilizado la declara el dueno/asesor.
const ROL_ESCRITOR = 'ALTA_INMOVILIZADO';

// Campos DECLARABLES del bien (el molde). Ningun valor cableado: solo los nombres del molde.
const CAMPOS_ACTIVO = ['id_activo', 'denominacion', 'valor', 'fecha_alta', 'vida_util', 'metodo', 'valor_residual', 'cuenta', 'tipo', 'moneda'];

class AltaActivo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'alta-activo';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, activos: Map<id_activo, Activo>, orden: [id, ...] }
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'alta-activo.json',
      dir: '/contabilidad/alta-activo',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, activos: [...p.activos.values()], orden: p.orden };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const activos = new Map();
        const orden = [];
        for (const a of (data.activos || [])) {
          if (!a || a.id_activo == null) continue;
          activos.set(String(a.id_activo), a);
          orden.push(String(a.id_activo));
        }
        this._parcelas.set(pid, {
          esquema: data.esquema || 'contabilidad-alta-activo-v1',
          activos,
          orden: Array.isArray(data.orden) ? data.orden.map(String) : orden
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la parcela del inmovilizado del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una linea, delega a _atender) ──
  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'alta-activo.registrar.response', async (d) => {
      const res = this._registrar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: el bien quedo en la parcela. Lo LEEN plan-amortizacion (F2),
        // valor-neto-contable (F4) y baja-activo (F3).
        this.eventBus?.publish('contabilidad.activo_registrado', {
          project_id: res.data.project_id,
          id_activo: res.data.activo.id_activo,
          activo: res.data.activo,
          alta: res.data.alta,
          actualizado: res.data.actualizado,
          abierto: res.data.activo.abierto,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('alta-activo.registrar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de escritura (UN escritor): el alta del bien ──
  _registrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el camino de alta registra inmovilizado.
    const rol = input.rol;
    if (rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el camino de alta (ALTA_INMOVILIZADO) registra activos en la parcela del inmovilizado',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: rol ?? null });
    }

    const fuente = (input.activo && typeof input.activo === 'object') ? input.activo : input;
    const id_activo = fuente.id_activo != null ? String(fuente.id_activo).trim() : '';
    if (!id_activo) return this._invalid('activo.id_activo');

    const parcela = this._obtenerOCrear(pid);
    const existente = parcela.activos.get(id_activo) || null;
    const ahora = new Date().toISOString();

    // Los CAMPOS del bien se toman DECLARADOS. Un campo ausente queda null y se declara abierto.
    const declarado = {};
    const abierto = [];
    for (const campo of CAMPOS_ACTIVO) {
      const raw = fuente[campo];
      if (raw === undefined || raw === null || raw === '') {
        declarado[campo] = (existente && campo !== 'id_activo') ? existente[campo] : null;
        abierto.push(campo);
      } else {
        declarado[campo] = (campo === 'valor' || campo === 'valor_residual') ? this._num(raw) : raw;
      }
    }
    // Un valor que no es numero NO se estima: queda null (desconocido).
    if (declarado.valor === undefined) declarado.valor = null;

    const activo = existente || {
      id_activo,
      denominacion: null,
      valor: null,
      fecha_alta: null,
      vida_util: null,
      metodo: null,
      valor_residual: null,
      cuenta: null,
      tipo: null,
      moneda: null,
      estado: 'ALTA',
      historial: []
    };

    for (const campo of CAMPOS_ACTIVO) {
      if (campo === 'id_activo') continue;
      activo[campo] = declarado[campo];
    }
    activo.abierto = abierto.filter((c) => c !== 'id_activo');
    activo.registrado_en = activo.registrado_en || ahora;
    activo.updated_at = ahora;
    activo.historial = Array.isArray(activo.historial) ? activo.historial : [];
    activo.historial.push({ estado: activo.estado, valor: activo.valor, por: ROL_ESCRITOR, en: ahora });

    parcela.activos.set(id_activo, activo);
    if (!parcela.orden.includes(id_activo)) parcela.orden.push(id_activo);
    parcela.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        activo,
        alta: !existente,
        actualizado: Boolean(existente),
        // Lo que el negocio aun no ha declarado del bien (nada se rellena solo).
        abierto
      }
    };
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-alta-activo-v1', activos: new Map(), orden: [] };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // Lectura directa de la parcela (mismo proceso) — no muta.
  activosDe(pid) {
    const p = pid ? this._parcelas.get(pid) : null;
    return p ? [...p.activos.values()] : [];
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolRegistrar(params) { return this._registrar(params); }
}

module.exports = AltaActivo;
