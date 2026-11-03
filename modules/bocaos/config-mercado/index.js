'use strict';

/**
 * config-mercado · CUSTODIO · PLAZA
 * J01 (ConfigUmbrales) · J02 (ConfigVentana) · J03 (ConfigZona) · J04 (VersiónEfectiva) ·
 * J05 (SimuladorDeUmbrales) · G01 (VentanaEspera).
 *
 * LA POLÍTICA DE LA PLAZA, CON VIGENCIA. Dos capas y una precedencia que es una TABLA:
 *
 *     política(pedido) = declaración de la TIENDA, si existe y está vigente
 *                        si no, la de la PLAZA (su default)
 *                        si no, el default de la F0 — y se dice: fuente «default-f0»
 *
 * La tienda NUEVA no configura nada: hereda el default de la plaza. Y la plaza no legisla por
 * la tienda que ya declaró: su default sólo rige donde no hay declaración.
 *
 * Lo que este módulo es, en tres reglas que no se negocian:
 *
 *   1. LA FORMA ES CERRADA. Cuatro umbrales (m · min · min · c€), comparados en AND. Una tienda
 *      sólo puede fijar ESOS cuatro números: no hay dónde poner un quinto criterio, y si lo
 *      intenta no se escribe (FORMA_CERRADA). Ni pesos, ni «contexto», ni orden distinto de
 *      «declarado» (A22/A28).
 *   2. NINGUNA VERSIÓN SIN AUTOR, VIGENCIA Y ACTA. Un cambio sin acta es 409 y no se escribe.
 *      Una vigencia que empieza ANTES de la anterior es 409: un umbral nuevo no reabre casos
 *      pasados, porque `politica(instante)` devuelve la que estaba viva en aquel instante.
 *   3. CADA VALOR LLEVA SU SELLO (versión · autor · desde). La explicación de una propuesta de
 *      hace tres semanas dice con qué números se juzgó, no con los de hoy.
 *
 * El coste del rider (Q57) vive aquí porque es config del proyecto: 0,140 €/km moto ·
 * 0,250 coche · 0,020 bici. El €/min NO se configura, se DERIVA del precio medio del reparto
 * en la zona — si se fija, el cuarto umbral miente en la mitad de los barrios.
 *
 * Es una isla: no lee el almacén de nadie. Lo que necesita de otro lo pide al bus.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

// La FORMA la fija la vertical. Cuatro números, en m · min · min · c€, en AND. Ni uno más.
const UMBRALES = ['desvio_m', 'espera_min', 'retraso_min', 'cobra_min_cents'];

// F0 §6 + Q57 + Q28. El barrio, sin configurar nada.
const FORMA = {
  umbrales: { desvio_m: 800, espera_min: 4, retraso_min: 6, cobra_min_cents: 0 },
  // J02: una propuesta CADUCA. 20 s de validez · 10 s de decisión tras el acuse · 5 s de acuse.
  ventana: { validez_s: 20, decision_s: 10, acuse_s: 5, tope_candidatos: 3 },
  // G01: tres esperas porque las sufre gente distinta. Sumarlas es que pague el que no fue.
  esperas: { n1_tienda_min: 8, n2_portal_min: 5, n3_entrega_min: 10 },
  // Q57: coste por km del vehículo; el €/min se deriva (o se declara con su derivación).
  coste_rider: { vehiculos: { moto: 0.14, coche: 0.25, bici: 0.02 }, eur_min: 0.257 },
  // J03: la cobertura de la plaza por zona (la otra mitad de la intersección es D06).
  cobertura: { zonas: [] },
  // Parámetros DECLARADOS de la medida de una ruta (B01 frescura · B04 orden · B05 capacidad).
  // Sin ellos, «fresco» sería una impresión, el orden cambiaría entre dos lecturas iguales y la
  // capacidad efectiva saldría de la nada.
  ruta: { frescura_s: 90, velocidad_kmh: 18, factor_calle: 1.35, coste_parada_min: 3, desvio_por_parada_m: 400 },
  orden: 'declarado',
  campo_cobra: 'paga'
};

class ConfigMercado extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'config-mercado';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/config-mercado.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onDeclararRequest(e) { return this.servir(e, 'declarar', 'config-mercado.declarar', (d) => this._declarar(d)); }
  onPoliticaRequest(e) { return this.servir(e, 'politica', 'config-mercado.politica', (d) => this._politica(d)); }
  onSimularRequest(e) { return this.servir(e, 'simular', 'config-mercado.simular', (d) => this._simular(d)); }

  // ================= hechos que escucha =================
  // O02: un criterio también cambia por dictamen firmado. Entra por la MISMA puerta (declarar),
  // así que el acta no es opcional ni por esta vía.
  async onDictamenFirmado(e) {
    const d = this.datos(e);
    if (!d.project_id) return null;
    const bruto = d.politica || d.valores || d.umbrales;
    if (!bruto) return null;
    // El dictamen puede traer los cuatro números sueltos: se recogen bajo `umbrales`.
    const valores = Object.keys(bruto).some((k) => UMBRALES.includes(k)) ? { umbrales: bruto } : bruto;
    return this._declarar({
      ...d,
      ambito: d.ambito || (d.tienda_id ? 'tienda' : 'plaza'),
      valores,
      acta: d.acta || d.acta_id || d.dictamen_id || d.firma_id,
      autor: d.autor || d.firmado_por
    });
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= J01 · declarar (ORDEN) =================
  async _declarar(d) {
    if (!d.project_id) return this._invalid('project_id');

    const ambito = d.ambito || (d.tienda_id ? 'tienda' : 'plaza');
    if (ambito !== 'plaza' && ambito !== 'tienda') {
      return this._errorResponse(400, 'INVALID_INPUT', 'ambito debe ser plaza | tienda', { field: 'ambito' });
    }
    if (ambito === 'tienda' && !d.tienda_id) return this._invalid('tienda_id');
    if (ambito === 'plaza' && d.tienda_id) {
      // §1.7: la plaza sólo mueve su default. No declara por una tienda.
      return this._errorResponse(409, 'PLAZA_NO_LEGISLA_POR_TIENDA',
        'una declaración de plaza no lleva tienda_id: la plaza sólo mueve su default', { field: 'tienda_id' });
    }

    const autor = this._autor(d.autor);
    if (!autor) {
      return this._errorResponse(400, 'INVALID_INPUT', 'autor requerido: ninguna versión sin autor', { field: 'autor' });
    }
    const acta = d.acta || d.acta_id || (d.autor && typeof d.autor === 'object' ? d.autor.acta : null) || null;
    if (!acta) {
      // O02: sin acta no hay cambio. Se dice el hueco; no se escribe la política.
      return this._errorResponse(409, 'SIN_ACTA',
        'ningún cambio de criterio se escribe sin acta (O02)', { field: 'acta', hueco: 'sin acta' });
    }

    const desde = this._iso(d.desde) || this.ahora();
    const zona = d.zona || null;

    // La base es la que rige hoy en esa capa: la tienda hereda el default de la plaza, y una
    // declaración de plaza que sólo mueve un número no borra los otros tres.
    const est = await this.estado(d.project_id);
    est.declaraciones = est.declaraciones || [];
    const base = (await this._politica({
      project_id: d.project_id,
      plaza_id: d.plaza_id,
      instante: desde,
      tienda_id: ambito === 'tienda' ? d.tienda_id : null,
      zona
    })).data.politica;

    const dado = d.valores || d.politica || this._soloValores(d);
    const { valores, rechazos } = this._valores(dado, base);
    if (rechazos.length > 0) {
      return this._errorResponse(409, 'FORMA_CERRADA',
        'la forma la fija la vertical: cuatro umbrales y nada más. Esto no tiene dónde ponerse',
        { field: 'valores', rechazos });
    }

    const declaracion_id = d.declaracion_id || `cfg-${crypto.randomUUID().slice(0, 8)}`;
    const ya = est.declaraciones.find((x) => x.declaracion_id === declaracion_id);
    if (ya) {
      return { status: 200, data: { declaracion_id, version: ya.version, idempotente: true, politica: this._forma(ya, desde) } };
    }

    // La vigencia no reescribe el pasado: ninguna declaración del mismo ámbito puede estar
    // fechada DESPUÉS de ésta. Si lo está, alguien intenta meter un criterio por debajo.
    const mismoAmbito = est.declaraciones.filter((x) => x.ambito === ambito && x.tienda_id === (ambito === 'tienda' ? d.tienda_id : null) && x.zona === zona);
    const futura = mismoAmbito.find((x) => Date.parse(x.desde) > Date.parse(desde));
    if (futura) {
      return this._errorResponse(409, 'VIGENCIA_RETROACTIVA',
        `no se reescribe el pasado: ya hay una declaración vigente desde ${futura.desde} (v${futura.version})`,
        { field: 'desde', desde, vigente_desde: futura.desde, version_vigente: futura.version, hueco: 'vigencia hacia atrás' });
    }

    const version = mismoAmbito.length + 1;
    const decl = {
      declaracion_id,
      ambito,
      tienda_id: ambito === 'tienda' ? d.tienda_id : null,
      zona,
      plaza_id: this.plaza_id || d.plaza_id || d.project_id,
      version,
      autor,
      acta: String(acta),
      desde,
      declarado_en: this.ahora(),
      valores
    };
    est.declaraciones.push(decl);
    await this.guardar(d.project_id);

    this.hecho('bocaos.politica_declarada', {
      declaracion_id,
      plaza_id: decl.plaza_id,
      ambito,
      capa: ambito,
      tienda_id: decl.tienda_id,
      zona,
      version,
      autor,
      acta: decl.acta,
      desde,
      umbrales: valores.umbrales,
      ventana: valores.ventana,
      ventana_s: valores.ventana.validez_s,
      esperas: valores.esperas,
      coste_rider: valores.coste_rider,
      cobertura: valores.cobertura,
      ruta: valores.ruta,
      orden: valores.orden,
      campo_cobra: valores.campo_cobra
    });

    return { status: 201, data: { declaracion_id, version, desde, capa: ambito, politica: this._forma(decl, desde) } };
  }

  // ================= J04 · política vigente (PREGUNTA) =================
  async _politica(d) {
    if (!d.project_id) return this._invalid('project_id');
    const instante = this._iso(d.instante) || this.ahora();
    const est = await this.estado(d.project_id);

    const tienda_id = d.tienda_id || null;
    const zona = d.zona || null;

    const elegida = this._resolver(est, { tienda_id, zona, instante });
    const politica = elegida
      ? this._forma(elegida, instante)
      : {
        ...this._defaultForma(),
        politica_id: 'default-f0',
        resuelta_en: instante,
        instante,
        tienda_id,
        zona,
        plaza_id: this.plaza_id || d.plaza_id || d.project_id
      };

    return {
      status: 200,
      data: {
        politica,
        // La precedencia se DEVUELVE, no se supone: quien explica dice qué capa juzgó.
        precedencia: {
          tienda_declarada: !!(elegida && elegida.ambito === 'tienda'),
          capa: politica.capa,
          autor: politica.autor,
          version: politica.version,
          declarada: !!elegida
        }
      }
    };
  }

  // ================= J05 · simular (PREGUNTA) =================
  // Recalcula sobre HECHOS YA ESCRITOS y no aplica nada. Si el simulador pudiera aplicar, el
  // dueño dejaría de decidir.
  async _simular(d) {
    if (!d.project_id) return this._invalid('project_id');
    const hechos = Array.isArray(d.hechos) ? d.hechos : (Array.isArray(d.medidas) ? d.medidas : null);
    if (!hechos || hechos.length === 0) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'hechos requeridos: el simulador recalcula sobre hechos reales, no sobre un ejemplo de folleto',
        { field: 'hechos' });
    }

    const base = (await this._politica({
      project_id: d.project_id, plaza_id: d.plaza_id, tienda_id: d.tienda_id, zona: d.zona, instante: d.instante
    })).data.politica;

    const { valores, rechazos } = this._valores(
      { umbrales: (d.alternativa && d.alternativa.umbrales) || d.umbrales_alternativos || d.umbrales || {} },
      base
    );
    if (rechazos.length > 0) {
      return this._errorResponse(409, 'FORMA_CERRADA', 'la alternativa también es de cuatro números', { field: 'alternativa', rechazos });
    }

    const filas = hechos.map((h, i) => {
      const m = {
        desvio_m: h.desvio_m ?? h.medidas?.desvio_m ?? null,
        espera_min: h.espera_min ?? h.medidas?.espera_min ?? null,
        retraso_min: h.retraso_min ?? h.medidas?.retraso_min ?? 0,
        cobra_cents: h.cobra_cents ?? h.medidas?.cobra_cents ?? null
      };
      const antes = this._pasa(m, base.umbrales);
      const ahora = this._pasa(m, valores.umbrales);
      return {
        i,
        pedido_id: h.pedido_id || null,
        rider_id: h.rider_id || null,
        medidas: m,
        antes,
        ahora,
        cambia: antes.pasa !== ahora.pasa
      };
    });
    const cuenta = (k) => filas.filter((f) => f[k].pasa).length;

    return {
      status: 200,
      data: {
        simulacion: {
          base: { capa: base.capa, version: base.version, autor: base.autor, umbrales: base.umbrales },
          alternativa: { umbrales: valores.umbrales },
          filas,
          resumen: {
            n: filas.length,
            pasan_antes: cuenta('antes'),
            pasan_ahora: cuenta('ahora'),
            ganan: filas.filter((f) => !f.antes.pasa && f.ahora.pasa).length,
            pierden: filas.filter((f) => f.antes.pasa && !f.ahora.pasa).length
          },
          // Se dice lo que el simulador NO puede decir.
          limites: [
            'recalcula sobre hechos ya escritos; del futuro sólo da una extrapolación',
            'no simula riders que no estaban en la foto de ese instante',
            'no aplica: aplicar exige declarar (J01) y acta (O02)'
          ],
          aplicada: false
        }
      }
    };
  }

  // ================= la precedencia, como tabla =================
  _resolver(est, { tienda_id, zona, instante }) {
    const t = Date.parse(instante);
    const vivas = (est.declaraciones || []).filter((x) => Date.parse(x.desde) <= t);
    const enZona = (x) => x.zona === null || x.zona === zona;

    const porFecha = (a, b) => {
      const d = Date.parse(b.desde) - Date.parse(a.desde);
      if (d !== 0) return d;
      return b.version - a.version;
    };

    if (tienda_id) {
      const deTienda = vivas.filter((x) => x.ambito === 'tienda' && x.tienda_id === tienda_id && enZona(x)).sort(porFecha);
      if (deTienda.length > 0) return deTienda[0];
    }
    const dePlaza = vivas.filter((x) => x.ambito === 'plaza' && enZona(x)).sort(porFecha);
    return dePlaza[0] || null;
  }

  // La política, con sus sellos: cada valor con su versión, su autor y su fecha.
  _forma(decl, instante) {
    const v = decl.valores;
    const sello = { version: decl.version, autor: decl.autor, desde: decl.desde, acta: decl.acta };
    const sellos = {};
    for (const k of UMBRALES) sellos[k] = { valor: v.umbrales[k], ...sello };
    return {
      politica_id: decl.declaracion_id,
      capa: decl.ambito,
      version: decl.version,
      autor: decl.autor,
      acta: decl.acta,
      desde: decl.desde,
      fuente: 'declarada',
      declarada: true,
      plaza_id: decl.plaza_id,
      tienda_id: decl.tienda_id,
      zona: decl.zona,
      umbrales: v.umbrales,
      ventana: v.ventana,
      ventana_s: v.ventana.validez_s,
      orden: v.orden,
      campo_cobra: v.campo_cobra,
      esperas: v.esperas,
      coste_rider: v.coste_rider,
      cobertura: v.cobertura,
      ruta: v.ruta,
      sellos,
      resuelta_en: instante || null,
      instante: instante || null
    };
  }

  _defaultForma() {
    return {
      politica_id: 'default-f0',
      capa: 'plaza',
      version: 0,
      autor: 'sin declarar',
      acta: null,
      desde: null,
      fuente: 'default-f0',
      declarada: false,
      tienda_id: null,
      zona: null,
      umbrales: { ...FORMA.umbrales },
      ventana: { ...FORMA.ventana },
      ventana_s: FORMA.ventana.validez_s,
      orden: FORMA.orden,
      campo_cobra: FORMA.campo_cobra,
      esperas: { ...FORMA.esperas },
      coste_rider: { vehiculos: { ...FORMA.coste_rider.vehiculos }, eur_min: FORMA.coste_rider.eur_min, derivado: false },
      cobertura: { zonas: [] },
      ruta: { ...FORMA.ruta },
      sellos: {}
    };
  }

  // ================= validación de la FORMA =================
  // Lo que llega plano en el payload (sin envoltorio `valores`) se recoge aquí: sólo la forma.
  _soloValores(d) {
    const out = {};
    for (const k of ['umbrales', 'ventana', 'esperas', 'coste_rider', 'cobertura', 'ruta', 'orden', 'campo_cobra']) {
      if (d[k] !== undefined) out[k] = d[k];
    }
    return out;
  }

  // Devuelve los valores fusionados sobre la base y la lista de lo que NO tiene dónde ponerse.
  _valores(dado, base) {
    const b = {
      umbrales: { ...(base.umbrales || FORMA.umbrales) },
      ventana: { ...(base.ventana || FORMA.ventana) },
      esperas: { ...(base.esperas || FORMA.esperas) },
      coste_rider: JSON.parse(JSON.stringify(base.coste_rider || FORMA.coste_rider)),
      cobertura: { zonas: [...((base.cobertura && base.cobertura.zonas) || [])] },
      ruta: { ...(base.ruta || FORMA.ruta) },
      orden: base.orden || FORMA.orden,
      campo_cobra: base.campo_cobra || FORMA.campo_cobra
    };
    const rechazos = [];
    const entra = dado && typeof dado === 'object' ? { ...dado } : {};

    // Q57: el €/min se DERIVA. `derivar` no es un valor de la forma: es la receta del valor,
    // así que se saca antes de validar la forma cerrada y no se guarda como número.
    let derivar = null;
    if (entra.coste_rider && typeof entra.coste_rider === 'object') {
      derivar = entra.coste_rider.derivar || null;
      const copia = { ...entra.coste_rider };
      delete copia.derivar;
      entra.coste_rider = copia;
    }

    // 1 · nada que no esté en la forma
    const permitidas = ['umbrales', 'ventana', 'esperas', 'coste_rider', 'cobertura', 'ruta', 'orden', 'campo_cobra'];
    for (const k of Object.keys(entra)) {
      if (!permitidas.includes(k)) rechazos.push(k);
    }

    // 2 · fusión estricta, llave por llave
    const fusion = (destino, origen, camino) => {
      for (const k of Object.keys(origen)) {
        if (!(k in destino)) { rechazos.push(`${camino}.${k}`); continue; }
        const v = origen[k];
        if (destino[k] && typeof destino[k] === 'object' && !Array.isArray(destino[k])) {
          if (!v || typeof v !== 'object' || Array.isArray(v)) { rechazos.push(`${camino}.${k}`); continue; }
          fusion(destino[k], v, `${camino}.${k}`);
        } else {
          destino[k] = v;
        }
      }
    };
    for (const k of ['umbrales', 'ventana', 'esperas', 'coste_rider', 'ruta']) {
      if (entra[k] !== undefined) {
        if (!entra[k] || typeof entra[k] !== 'object' || Array.isArray(entra[k])) { rechazos.push(k); continue; }
        fusion(b[k], entra[k], k);
      }
    }
    if (entra.cobertura !== undefined) {
      if (!entra.cobertura || !Array.isArray(entra.cobertura.zonas)) rechazos.push('cobertura');
      else b.cobertura.zonas = entra.cobertura.zonas.map(String);
    }
    if (entra.orden !== undefined) b.orden = entra.orden;
    if (entra.campo_cobra !== undefined) b.campo_cobra = entra.campo_cobra;

    // 3 · los valores, uno a uno
    const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    for (const k of UMBRALES) {
      if (!num(b.umbrales[k])) rechazos.push(`umbrales.${k}`);
    }
    if (!Number.isInteger(b.umbrales.cobra_min_cents)) rechazos.push('umbrales.cobra_min_cents');
    for (const k of ['validez_s', 'decision_s', 'acuse_s', 'tope_candidatos']) {
      if (!Number.isInteger(b.ventana[k]) || b.ventana[k] <= 0) rechazos.push(`ventana.${k}`);
    }
    // J02: la ventana es finita y coherente. No se alarga sola mientras alguien duda.
    if (b.ventana.acuse_s > b.ventana.decision_s || b.ventana.decision_s > b.ventana.validez_s) {
      rechazos.push('ventana.incoherente (acuse <= decision <= validez)');
    }
    for (const k of ['n1_tienda_min', 'n2_portal_min', 'n3_entrega_min']) {
      if (!num(b.esperas[k])) rechazos.push(`esperas.${k}`);
    }
    for (const [vehiculo, eurKm] of Object.entries(b.coste_rider.vehiculos || {})) {
      if (!num(eurKm) || eurKm <= 0) rechazos.push(`coste_rider.vehiculos.${vehiculo}`);
    }
    if (!num(b.coste_rider.eur_min)) rechazos.push('coste_rider.eur_min');
    if (!num(b.ruta.frescura_s) || b.ruta.frescura_s <= 0) rechazos.push('ruta.frescura_s');
    if (!num(b.ruta.velocidad_kmh) || b.ruta.velocidad_kmh <= 0) rechazos.push('ruta.velocidad_kmh');
    if (!num(b.ruta.factor_calle) || b.ruta.factor_calle < 1) rechazos.push('ruta.factor_calle');
    // A22/A28: el orden es el declarado. Cualquier otro es un optimizador con otro nombre.
    if (b.orden !== 'declarado') rechazos.push('orden (sólo «declarado»)');
    if (!['paga', 'neto'].includes(b.campo_cobra)) rechazos.push('campo_cobra (paga | neto)');

    // 4 · Q57: el €/min se DERIVA, no se fija a mano
    if (derivar) {
      const precio = Number(derivar.precio_medio_eur);
      const km = Number(derivar.km_medios);
      const min = Number(derivar.minutos_medios);
      const eurKm = Number(derivar.eur_km ?? b.coste_rider.vehiculos.moto);
      if ([precio, km, min, eurKm].every(Number.isFinite) && min > 0) {
        b.coste_rider.eur_min = this._round(Math.max(0, (precio - km * eurKm) / min), 3);
        b.coste_rider.derivado = true;
        b.coste_rider.derivacion = { precio_medio_eur: precio, km_medios: km, minutos_medios: min, eur_km: eurKm };
      } else {
        rechazos.push('coste_rider.derivar');
      }
    }

    return { valores: b, rechazos: [...new Set(rechazos)] };
  }

  // A12 · cuatro comparaciones en AND. La misma tabla que usa el enlace, aquí para simular.
  _pasa(m, u) {
    const ok = (v, max) => Number.parseFloat(v) < Number.parseFloat(max);
    if (!ok(m.desvio_m, u.desvio_m ?? 800)) return { pasa: false, fallo: 'desvio' };
    if (!ok(m.espera_min, u.espera_min ?? 4)) return { pasa: false, fallo: 'espera' };
    if (!ok(m.retraso_min ?? 0, u.retraso_min ?? 6)) return { pasa: false, fallo: 'retraso' };
    if (!(Number.parseFloat(m.cobra_cents) > Number.parseFloat(u.cobra_min_cents ?? 0))) return { pasa: false, fallo: 'cobra' };
    return { pasa: true, fallo: null };
  }

  _autor(a) {
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') {
      return a.id || a.nombre || a.rider_id || a.tienda_id || a.rol || null;
    }
    return null;
  }
}

module.exports = ConfigMercado;
module.exports.FORMA = FORMA;
module.exports.UMBRALES = UMBRALES;
