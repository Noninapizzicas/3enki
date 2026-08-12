/**
 * sonda — REFLEJO JS del micro-agente de vigilancia de fuentes de mercado.
 *
 * Contrato (plan-construccion.md HOJA 3):
 *   entrada = configuración de fuentes (canal, métrica, frecuencia_h, umbral) + cosechas del cajón
 *   salida  = sonda.senales_cosechadas (señales NUEVAS, dedupe por fuente+url) · sonda.fuente.configurada
 *   garantía = custodia el registro de fuentes; dedupe determinista; persiste por proyecto
 *   no hace = no decide si un nicho vale (eso es el evaluador); no analiza el markdown (eso es el cajón)
 *
 * FORMA: REFLEJO del híbrido — op determinista + evento de dominio. El cajón `recolectar`
 * (blueprint, responde:true en sonda.recolectar.request) LEER/PENSAR con crawl4rs y DELEGA
 * el GUARDAR aquí (sonda.cosecha.guardar.request) para que el dedupe y la persistencia sean
 * deterministas. Anti-colisión: recolectar SOLO en el blueprint.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

class SondaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'sonda';
    this.version = 'reflejo-0.1.0';
    this.fuentes = new Map();        // id -> { canal, metrica, frecuencia_h, umbral, url, activa }
    this.ultimaCosecha = null;       // { ts, barrido, senales: [...] }
    this._senalesVistas = new Set(); // dedupe persistente: `${fuente}|${url}`
    this._persistencia = new PosPersistencia({
      modulo: this,
      file: 'sonda.json',
      dir: '/radar',
      snapshot: (pid) => ({
        fuentes: [...this.fuentes.entries()].map(([id, f]) => ({ id, ...f })),
        ultimaCosecha: this.ultimaCosecha,
        senalesVistas: [...this._senalesVistas]
      }),
      hidratar: (pid, data) => {
        (data.fuentes || []).forEach((f) => this.fuentes.set(f.id, f));
        this.ultimaCosecha = data.ultimaCosecha || null;
        this._senalesVistas = new Set(data.senalesVistas || []);
      }
    });
  }

  async onLoad(context) {
    await super.onLoad(context);
    // Egress consciente: la sonda sale a internet (crawl4rs). Interruptor propio.
    this.eventBus?.publish('interruptor.registrar', {
      id: 'sonda',
      label: 'Sonda de nichos (egress a fuentes de mercado)',
      grupo: 'radar',
      descripcion: 'La sonda vigila fuentes (RSS/APIs/feeds) vía crawl4rs y cosecha señales crudas. Apagarla detiene el egress sin tocar el registro de fuentes.',
      default: false
    });
  }

  // ── Handlers ──
  onFuentesListarRequest(e) {
    return this._atender(e, 'fuentes.listar', 'sonda.fuentes.listar.response', (d) => this._listarFuentes(d));
  }

  onFuentesConfigurarRequest(e) {
    return this._atender(e, 'fuentes.configurar', 'sonda.fuentes.configurar.response', (d) => this._configurarFuente(d));
  }

  onCosechaGuardarRequest(e) {
    return this._atender(e, 'cosecha.guardar', 'sonda.cosecha.guardar.response', (d) => this._persistirCosecha(d));
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    const project_id = d.project_id;
    if (!project_id) return;
    await this._persistencia.restaurar(project_id);
  }

  // ── Ops (REFLEJO: deterministas) ──

  _listarFuentes(input) {
    const fuentes = [...this.fuentes.entries()].map(([id, f]) => ({ id, ...f }));
    return {
      status: 200,
      data: {
        fuentes,
        total: fuentes.length,
        ultimaCosecha: this.ultimaCosecha
      }
    };
  }

  _configurarFuente(input) {
    const id = input.id;
    if (!id) return this._invalid('id');
    const base = this.fuentes.get(id) || { canal: undefined, metrica: undefined, frecuencia_h: undefined, umbral: undefined, url: undefined, activa: true };
    const config = { ...base, ...(input.config || {}) };
    // Garantía del contrato (patrón radar-fuente): métrica y frecuencia obligatorias.
    if (!config.metrica || !config.frecuencia_h) {
      return {
        status: 400,
        data: { error: 'INVALID_INPUT', message: 'métrica y frecuencia_h son obligatorias', field: 'config' }
      };
    }
    this.fuentes.set(id, config);
    this._publicarEvento('sonda.fuente.configurada', { id, config });
    this._persistencia.marcarDirty(input.project_id);
    return { status: 200, data: { id, config } };
  }

  _persistirCosecha(input) {
    const senales = Array.isArray(input.senales) ? input.senales : [];
    const añadidas = [];
    const duplicadas = [];
    for (const s of senales) {
      const fuente = s.fuente;
      const url = s.url;
      if (!fuente || !url) continue; // señal malformada: se descarta (no silenciosa, cuenta en data)
      const clave = `${fuente}|${url}`;
      if (this._senalesVistas.has(clave)) {
        duplicadas.push(s);
        continue;
      }
      this._senalesVistas.add(clave);
      añadidas.push({
        titulo: s.titulo,
        fuente,
        url,
        sector: s.sector || null,
        fechaCosecha: new Date().toISOString()
      });
    }
    this.ultimaCosecha = {
      ts: new Date().toISOString(),
      barrido: input.barrido || { fuentesConsultadas: [], ok: true },
      senales: this.ultimaCosecha ? [...this.ultimaCosecha.senales, ...añadidas] : añadidas
    };
    this._persistencia.marcarDirty(input.project_id);
    if (añadidas.length > 0) {
      this._publicarEvento('sonda.senales_cosechadas', {
        senales: añadidas,
        total_nuevas: añadidas.length,
        ultimaCosecha: this.ultimaCosecha.ts
      });
    }
    return {
      status: 200,
      data: {
        añadidas: añadidas.length,
        duplicadas: duplicadas.length,
        malformadas: senales.length - añadidas.length - duplicadas.length,
        senales: añadidas
      }
    };
  }

  _publicarEvento(evento, payload) {
    this.eventBus?.publish(evento, payload);
  }
}

module.exports = SondaReflejo;
