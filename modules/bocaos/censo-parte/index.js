'use strict';

/**
 * censo-parte · CUSTODIO · PLAZA — I01 (AltaTienda) · I02 (AltaRider) · M02 (ZonaRider) ·
 * M03 (GuardaSinExclusividad) · P04 (ChecklistAlta).
 *
 * QUIÉN EXISTE PARA EL MERCADO Y QUÉ ACREDITA. Un solo dueño del censo operativo de la plaza.
 *
 * Las cuatro reglas que son el módulo:
 *
 *   1. UN RIDER A MEDIAS NO ENTRA — y no por castigo: porque el censo no puede inventar lo que no
 *      consta. `alta` devuelve COMPLETA o INCOMPLETA con la lista exacta de lo que falta (P04), y
 *      sólo COMPLETA viaja en `vigentes` y se publica como hecho para `estado-parte`.
 *   2. LA LISTA NO TIENE CRITERIOS OCULTOS. Lo que no está en el checklist no se puede exigir
 *      después. Y el checklist se DERIVA del alta (tipo + acreditaciones), no de una memoria.
 *   3. SIN EXCLUSIVIDAD, SIN PERMANENCIA, SIN ANTIGÜEDAD (M03 · Q35: 0). Si el alta trae
 *      exclusividad, permanencia, turno, cuota mínima o disponibilidad mínima semanal, no se
 *      escribe: 409 SIN_EXCLUSIVIDAD nombrando el campo. Nada de eso es elegibilidad.
 *   4. LAS ZONAS LAS DECLARA ÉL (M02), y las cambia cuando quiere. El sistema no le asigna zona ni
 *      se la «sugiere» por densidad: eso sería dirigir su trabajo.
 *
 * Q34 ABIERTA, Y SE DICE. Qué acredita el rider y quién lo verifica no está decidido. Por eso el
 * censo exige que el documento CONSTE (con su referencia) y guarda `verificado` sólo si alguien lo
 * firma; lo que no está verificado aparece en `sin_verificar`. Requerir verificación sería inventar
 * un criterio que nadie ha decidido.
 *
 * ENCAJE CON LAS OTRAS ISLAS (todo por el bus, cero require entre islas):
 *   · `bocaos.terminos_aceptados` (de `terminos-parte`) acredita el documento de reglas aceptadas.
 *   · `bocaos.parte_censada` / `bocaos.censo_actualizado` abren y actualizan la parte en
 *     `estado-parte`: sin alta no hay estado, y la plaza escribe su censo Y su estado.
 *   · `project.create` al `project-manager`: dar de alta una tienda ES crear su proyecto (I01).
 *     Una tienda sin proyecto no tiene carta, ni carrito, ni clientes. La confirmación vuelve como
 *     hecho `project.created` y se casa por `correlation_id`, no por memoria.
 */

const ModuloBocaos = require('../_bocaos');

const TIPOS = ['rider', 'tienda'];
const VEHICULOS = ['moto', 'coche', 'bici'];

// Lo que acredita cada parte (Q34). El vehículo es el permiso/tarjeta del vehículo, no el tipo de
// vehículo: `vehiculo` (moto | coche | bici) es un atributo de la parte, no un documento.
const REQUERIDOS = {
  rider: ['identidad', 'autonomo', 'seguro', 'vehiculo', 'documento_sistema', 'terminos'],
  tienda: ['identidad_fiscal']
};

// Q34: el documento que explica, por escrito, que hay un sistema que decide a quién se le propone
// cada pedido. Es exigible por norma y es la única forma de que la explicación de cada propuesta
// tenga sentido (I02).
const ALIAS = {
  identidad: ['identidad', 'dni', 'nie', 'documento_identidad', 'kyc'],
  autonomo: ['autonomo', 'autónomo', 'alta_autonomo', 'reta', 'ruta', 'alta_reta', 'fiscal_autonomo'],
  seguro: ['seguro', 'poliza', 'póliza', 'seguro_rc', 'rc'],
  vehiculo: ['vehiculo', 'vehículo', 'permiso_vehiculo', 'tarjeta_vehiculo', 'tarjeta_vehículo', 'itv'],
  documento_sistema: ['documento_sistema', 'documento_informativo', 'documento_decision_automatica',
    'documento_decisiones', 'reglamento_sistema', 'informativa_automatizada'],
  terminos: ['terminos', 'términos', 'reglas', 'reglas_aceptadas', 'terminos_aceptados', 'condiciones_aceptadas'],
  identidad_fiscal: ['identidad_fiscal', 'nif', 'cif', 'vat', 'fiscal', 'identidad']
};

// M03: lo que NO puede entrar en la elegibilidad, ni con otro nombre. Se busca en las llaves del
// alta y en los textos de las condiciones, no en las referencias de documentos.
const PROHIBIDO = [
  [/exclusiv/i, 'exclusividad'],
  [/permanenc/i, 'permanencia'],
  [/^turno$|turnos|turno_/i, 'turno'],
  [/cuota/i, 'cuota mínima'],
  [/antig[uü]edad/i, 'antigüedad'],
  [/prioridad|prioritario/i, 'prioridad por trabajar solo con nosotros'],
  [/solo_con_nosotros|sólo_con_nosotros|solo_nosotros/i, 'solo con nosotros'],
  [/(min|horas|disponibilidad)[\s_.-]*(semanal|semanales|minima|mínima|minimas|mínimas)/i, 'disponibilidad mínima'],
  [/fidelidad|compromiso_minimo|compromiso_mínimo/i, 'compromiso mínimo']
];

class CensoParte extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'censo-parte';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/censo-parte.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onAltaRequest(e) { return this.servir(e, 'alta', 'censo-parte.alta', (d) => this._alta(d)); }
  onChecklistRequest(e) { return this.servir(e, 'checklist', 'censo-parte.checklist', (d) => this._checklist(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'censo-parte.de', (d) => this._de(d)); }
  onVigentesRequest(e) { return this.servir(e, 'vigentes', 'censo-parte.vigentes', (d) => this._vigentes(d)); }
  onZonaRequest(e) { return this.servir(e, 'zona', 'censo-parte.zona', (d) => this._zona(d)); }

  // ================= hechos que escucha =================
  // I08 → I02: la aceptación de términos la escribe `terminos-parte` (único dueño). Aquí sólo se
  // proyecta como acreditación del alta, con la fuente nombrada.
  async onTerminosAceptados(e) {
    const d = this.datos(e);
    if (!d.project_id) return null;
    const parte_id = d.parte_id || d.rider_id || d.tienda_id;
    if (!parte_id) return null;

    const est = await this.estado(d.project_id);
    const parte = est.partes?.[parte_id];
    if (!parte) {
      // El hecho no se tira: se apunta para cuando el alta llegue.
      est.pendientes = est.pendientes || {};
      est.pendientes[parte_id] = {
        terminos: { version: String(d.version), hora: this._iso(d.hora) || this.ahora(), fuente: 'terminos-parte' }
      };
      await this.guardar(d.project_id);
      return null;
    }

    parte.acreditaciones = parte.acreditaciones || {};
    parte.acreditaciones.terminos = {
      ref: `terminos-v${d.version}`,
      version: String(d.version),
      hora: this._iso(d.hora) || this.ahora(),
      por: 'terminos-parte',
      verificado: true,
      fuente: 'terminos-parte'
    };
    const antes = parte.estado_alta;
    this._recalcular(parte);
    await this.guardar(d.project_id);
    // Si los términos eran lo último que faltaba, esto ES el alta: se publica como tal.
    this._publicarCambio(parte, antes === 'COMPLETA' ? 'terminos_aceptados' : 'alta completada');
    return null;
  }

  // I01: la confirmación del proyecto de la tienda vuelve como hecho. Se casa por correlation_id
  // (lo mandamos nosotros al pedirlo), no por nombre ni por memoria.
  async onProjectCreado(e) {
    const d = (e && e.data) || e || {};
    const corr = d.correlation_id || null;
    if (!corr) return null;
    for (const project_id of this._mem.keys()) {
      const est = this._mem.get(project_id);
      const parte = est?.partes?.[corr];
      if (!parte || !parte.proyecto || parte.proyecto.project_id) continue;
      parte.proyecto.project_id = d.project_id || d.id || null;
      parte.proyecto.creado_en = this._iso(d.created_at) || this.ahora();
      await this.guardar(project_id);
      return null;
    }
    return null;
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= I01/I02 · el alta (ORDEN) =================
  async _alta(d) {
    if (!d.project_id) return this._invalid('project_id');

    const tipo = d.tipo || (d.rider_id ? 'rider' : (d.tienda_id ? 'tienda' : null));
    if (!tipo || !TIPOS.includes(tipo)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'tipo requerido: rider | tienda', { field: 'tipo' });
    }
    const parte_id = d.parte_id || (tipo === 'rider' ? d.rider_id : d.tienda_id);
    if (!parte_id) return this._invalid(tipo === 'rider' ? 'rider_id' : 'tienda_id');

    // M03 · antes que nada: si el alta trae una condición que en la práctica es exclusividad, no
    // se escribe ni una línea del censo.
    const violacion = this._sinExclusividad(d);
    if (violacion) {
      return this._errorResponse(409, 'SIN_EXCLUSIVIDAD',
        `«${violacion.campo}» es ${violacion.que}: la elegibilidad de una propuesta no lleva nada de eso (M03)`,
        { field: violacion.campo, hueco: violacion.que, condicion: 'Q35 = 0' });
    }

    const zonas = d.zonas === undefined ? undefined : this._zonas(d.zonas);
    if (zonas === false) {
      return this._errorResponse(400, 'INVALID_INPUT', 'zonas debe ser una lista de zonas con nombre', { field: 'zonas' });
    }
    if (d.vehiculo !== undefined && !VEHICULOS.includes(d.vehiculo)) {
      return this._errorResponse(400, 'INVALID_INPUT', `vehiculo debe ser ${VEHICULOS.join(' | ')}`, { field: 'vehiculo' });
    }

    const est = await this.estado(d.project_id);
    est.partes = est.partes || {};
    const existente = est.partes[parte_id];

    if (existente && existente.estado_alta === 'COMPLETA') {
      return this._errorResponse(409, 'YA_EN_CENSO',
        'la parte ya está en el censo completa: lo suyo se declara (I03/I04/M02), no se vuelve a dar de alta',
        { field: 'parte_id', estado_alta: existente.estado_alta, alta_en: existente.alta_en });
    }
    if (existente && existente.tipo !== tipo) {
      return this._errorResponse(409, 'PARTE_YA_EN_CENSO',
        `«${parte_id}» ya consta como ${existente.tipo}: una parte no cambia de naturaleza`,
        { field: 'tipo', tipo_en_censo: existente.tipo });
    }

    const hora = this._iso(d.hora) || this.ahora();
    const autor = this._autorDeclarante(d, parte_id);
    const docs = this._docs(d, tipo, autor, hora);
    const antes = existente ? existente.estado_alta : null;

    const parte = existente || {
      parte_id,
      tipo,
      rider_id: tipo === 'rider' ? parte_id : null,
      tienda_id: tipo === 'tienda' ? parte_id : null,
      plaza_id: this.plaza_id || d.plaza_id || d.project_id,
      creada_en: hora,
      alta_en: null,
      historial: []
    };

    parte.nombre = this._texto(d.nombre) || parte.nombre || null;
    parte.identidad = this._identidad(d, tipo) || parte.identidad || null;
    parte.zonas = zonas === undefined ? (parte.zonas || null) : zonas;
    parte.vehiculo = d.vehiculo === undefined ? (parte.vehiculo || null) : d.vehiculo;
    parte.chat_id = d.chat_id === undefined ? (parte.chat_id || null) : this._contacto(d.chat_id);
    parte.acreditaciones = { ...(parte.acreditaciones || {}), ...docs };
    parte.actualizada_en = hora;

    // Un hecho de términos que llegó antes que el alta no se pierde (mismo patrón que estado-parte
    // con la capacidad de ruta-viva).
    const pend = est.pendientes?.[parte_id];
    if (pend?.terminos) {
      parte.acreditaciones.terminos = {
        ref: `terminos-v${pend.terminos.version}`,
        version: pend.terminos.version,
        hora: pend.terminos.hora,
        por: pend.terminos.fuente,
        verificado: true,
        fuente: pend.terminos.fuente
      };
      delete est.pendientes[parte_id];
    }

    const eraIncompleta = antes === 'INCOMPLETA';
    this._recalcular(parte, autor);

    if (parte.estado_alta === 'COMPLETA' && !parte.alta_en) parte.alta_en = hora;
    parte.historial.push({
      estado_alta: parte.estado_alta,
      hora,
      autor,
      motivo: antes === null ? 'alta' : (eraIncompleta ? 'alta completada' : 'alta ampliada'),
      faltantes: [...parte.faltantes]
    });

    est.partes[parte_id] = parte;

    // I01 · dar de alta una tienda ES crear su proyecto. Se PIDE al bus (evento, no require) y se
    // apunta lo pedido: si el project-manager no contesta, queda como hueco nombrado.
    if (tipo === 'tienda' && parte.estado_alta === 'COMPLETA' && !parte.proyecto) {
      parte.proyecto = {
        solicitado_en: hora,
        correlation_id: parte_id,
        project_id: null,
        hueco: null
      };
      try {
        this.eventBus?.publish('project.create', {
          name: parte.nombre || parte_id,
          description: `tienda de la plaza ${parte.plaza_id}`,
          correlation_id: parte_id,
          plaza_id: parte.plaza_id,
          tienda_id: parte_id
        });
      } catch (_) {
        parte.proyecto.hueco = 'project-manager no recibió la petición';
      }
    }

    await this.guardar(d.project_id);
    this._publicarCambio(parte, 'alta');

    return {
      status: existente ? 200 : 201,
      data: {
        parte: this._vista(parte),
        estado_alta: parte.estado_alta,
        // La lista va en la RESPUESTA, no en la memoria de nadie: es lo que se le dice al rider.
        checklist: this._checklistDe(parte)
      }
    };
  }

  // ================= P04 · checklist (PREGUNTA) =================
  // Sirve antes del alta (con lo que se piensa presentar) y después (con lo que consta).
  async _checklist(d) {
    if (!d.project_id) return this._invalid('project_id');
    const parte_id = d.parte_id || d.rider_id || d.tienda_id || null;
    const est = await this.estado(d.project_id);

    if (parte_id) {
      const parte = est.partes?.[parte_id];
      if (parte) {
        return { status: 200, data: { parte_id, tipo: parte.tipo, ...this._checklistDe(parte), estado_alta: parte.estado_alta } };
      }
    }

    const tipo = d.tipo || (d.rider_id ? 'rider' : (d.tienda_id ? 'tienda' : null));
    if (!tipo || !TIPOS.includes(tipo)) {
      return this._errorResponse(404, 'PARTE_NO_CONSTA',
        'ni la parte está en el censo ni se dice qué tipo es: no se puede decir qué falta',
        { field: 'parte_id', hueco: 'parte sin alta' });
    }

    // Sin parte en el censo: se calcula sobre lo que trae la pregunta. Sin guardar nada.
    const ficticia = { tipo, acreditaciones: this._docs(d, tipo, null, this.ahora()) };
    return { status: 200, data: { parte_id: null, tipo, ...this._checklistDe(ficticia), estado_alta: null } };
  }

  // ================= I01/I02 · la ficha (PREGUNTA) =================
  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    const est = await this.estado(d.project_id);
    const partes = est.partes || {};
    const parte_id = d.parte_id || d.rider_id || d.tienda_id || null;

    if (parte_id) {
      const parte = partes[parte_id];
      if (!parte) {
        return this._errorResponse(404, 'PARTE_NO_CONSTA', 'esa parte no está en el censo de esta plaza', { field: 'parte_id' });
      }
      return { status: 200, data: { parte: this._vista(parte) } };
    }

    const todas = Object.values(partes).map((p) => this._vista(p));
    return {
      status: 200,
      data: {
        plaza_id: this.plaza_id || d.plaza_id || d.project_id,
        instante: this._iso(d.instante) || this.ahora(),
        n: todas.length,
        partes: todas,
        riders: todas.filter((p) => p.tipo === 'rider'),
        tiendas: todas.filter((p) => p.tipo === 'tienda'),
        incompletas: todas.filter((p) => p.estado_alta !== 'COMPLETA').map((p) => ({ parte_id: p.parte_id, tipo: p.tipo, faltantes: p.faltantes }))
      }
    };
  }

  // ================= A04/I01/I02 · quién existe para el mercado (PREGUNTA) =================
  // ELEGIBILIDAD SIN ADORNOS: alta completa y, si se pregunta por zona, la zona declarada. Ni
  // antigüedad, ni exclusividad, ni «prioridad». Lo que no aparece se dice por qué.
  async _vigentes(d) {
    if (!d.project_id) return this._invalid('project_id');
    const est = await this.estado(d.project_id);
    const zona = d.zona || null;
    const tipo = d.tipo || null;
    if (tipo && !TIPOS.includes(tipo)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'tipo debe ser rider | tienda', { field: 'tipo' });
    }

    const todas = Object.values(est.partes || {});
    const dentro = [];
    const excluidas = [];
    for (const p of todas) {
      if (tipo && p.tipo !== tipo) continue;
      if (p.estado_alta !== 'COMPLETA') {
        excluidas.push({ parte_id: p.parte_id, tipo: p.tipo, motivo: 'alta incompleta', faltantes: p.faltantes });
        continue;
      }
      if (zona && Array.isArray(p.zonas) && p.zonas.length > 0 && !p.zonas.includes(zona)) {
        excluidas.push({ parte_id: p.parte_id, tipo: p.tipo, motivo: 'zona no declarada', zonas: p.zonas });
        continue;
      }
      dentro.push(this._vista(p));
    }

    return {
      status: 200,
      data: {
        plaza_id: this.plaza_id || d.plaza_id || d.project_id,
        instante: this._iso(d.instante) || this.ahora(),
        zona,
        // Los criterios, escritos. Si algún día se añade uno, tendrá que verse aquí.
        criterios: ['alta completa', ...(zona ? ['zona declarada por la parte'] : [])],
        n: dentro.length,
        partes: dentro,
        riders: dentro.filter((p) => p.tipo === 'rider'),
        tiendas: dentro.filter((p) => p.tipo === 'tienda'),
        excluidas
      }
    };
  }

  // ================= M02 · las zonas del rider (ORDEN) =================
  async _zona(d) {
    if (!d.project_id) return this._invalid('project_id');
    const parte_id = d.parte_id || d.rider_id;
    if (!parte_id) return this._invalid('rider_id');

    const est = await this.estado(d.project_id);
    const parte = est.partes?.[parte_id];
    if (!parte) {
      return this._errorResponse(404, 'PARTE_NO_CONSTA',
        'sin alta no hay zonas: el censo no inventa partes', { field: 'parte_id', hueco: 'parte sin alta' });
    }
    if (parte.tipo !== 'rider') {
      return this._errorResponse(409, 'ZONA_NO_APLICA', 'las zonas son del rider (M02); la tienda tiene radio, no zonas', { field: 'parte_id' });
    }
    if (!this._esLaParte(d, parte)) {
      // M02: ni el sistema ni la sala le asignan zona. Es suyo, como la pausa.
      return this._errorResponse(403, 'ZONA_NO_ES_SUYA',
        'las zonas las declara él, y las cambia él: el sistema no le asigna zona', { field: 'zonas' });
    }

    const zonas = this._zonas(d.zonas);
    if (zonas === false || zonas === null) {
      // Un rider sin zonas no recibe nada; una lista vacía significaría «todas», que es lo
      // contrario de lo que ha dicho. Para no recibir, la pausa (I04).
      return this._errorResponse(400, 'INVALID_INPUT',
        'zonas debe ser una lista con al menos una zona: para no recibir propuestas está la pausa (I04)',
        { field: 'zonas' });
    }

    const hora = this._iso(d.hora) || this.ahora();
    const antes = parte.zonas || null;
    parte.zonas = zonas;
    parte.actualizada_en = hora;
    parte.historial.push({ zonas, hora, autor: this._autorDeclarante(d, parte_id), motivo: 'zonas declaradas' });
    await this.guardar(d.project_id);

    // M02: la zona es la ficha del censo; el hecho la lleva a quien la proyecta (estado-parte).
    this.hecho('bocaos.censo_actualizado', {
      parte_id,
      tipo: parte.tipo,
      plaza_id: parte.plaza_id,
      rider_id: parte.rider_id || null,
      tienda_id: parte.tienda_id || null,
      zonas,
      antes,
      estado_alta: parte.estado_alta,
      motivo: 'zonas_declaradas',
      hora
    });

    return { status: 200, data: { parte: this._vista(parte) } };
  }

  // ================= derivaciones =================
  // P04: la lista se DERIVA del tipo y de lo que consta. Un requisito que no está aquí no se
  // puede exigir después.
  _checklistDe(parte) {
    const requeridos = [...(REQUERIDOS[parte.tipo] || [])];
    const acreditados = [];
    const faltantes = [];
    for (const doc of requeridos) {
      const a = parte.acreditaciones?.[doc];
      if (a && a.ref) acreditados.push(doc);
      else faltantes.push(doc);
    }
    return {
      requeridos,
      acreditados,
      faltantes,
      // Q34 abierta: se dice lo que está presentado y sin verificar. No se inventa un criterio.
      sin_verificar: acreditados.filter((doc) => parte.acreditaciones[doc] && !parte.acreditaciones[doc].verificado)
    };
  }

  _recalcular(parte, autor) {
    const chk = this._checklistDe(parte);
    parte.faltantes = chk.faltantes;
    parte.estado_alta = chk.faltantes.length === 0 ? 'COMPLETA' : 'INCOMPLETA';
    parte.sin_verificar = chk.sin_verificar;
    if (autor) parte.ultimo_autor = autor;
    return parte;
  }

  // Publica el hecho que corresponde al cambio de estado del alta. Tres hechos, tres consumidores
  // distintos y ningún solapamiento: `parte_censada` abre el estado, `censo_incompleto` avisa a la
  // sala, `censo_actualizado` dice que una parte completa cambió algo de lo suyo.
  _publicarCambio(parte, motivo) {
    const esAlta = motivo === 'alta' || motivo === 'alta completada';
    const base = {
      parte_id: parte.parte_id,
      tipo: parte.tipo,
      plaza_id: parte.plaza_id,
      rider_id: parte.rider_id || null,
      tienda_id: parte.tienda_id || null,
      nombre: parte.nombre || null,
      zonas: parte.zonas || null,
      vehiculo: parte.vehiculo || null,
      chat_id: parte.chat_id || null,
      estado_alta: parte.estado_alta,
      acreditados: parte.estado_alta === 'COMPLETA' ? (this._checklistDe(parte).acreditados) : [],
      alta_en: parte.alta_en || null
    };

    if (parte.estado_alta === 'COMPLETA') {
      if (esAlta) this.hecho('bocaos.parte_censada', { ...base, motivo });
      else this.hecho('bocaos.censo_actualizado', { ...base, motivo });
      return;
    }
    this.hecho('bocaos.censo_incompleto', { ...base, motivo, faltantes: [...parte.faltantes] });
  }

  // M03 · La guarda. Mira las LLAVES del alta y el TEXTO de las condiciones; las referencias de
  // documentos no se escanean (una póliza puede llamarse como quiera).
  _sinExclusividad(d) {
    const llaves = Object.keys(d).filter((k) => !['project_id', 'plaza_id', 'parte_id', 'rider_id', 'tienda_id',
      'tipo', 'nombre', 'identidad', 'documentos', 'acreditaciones', 'docs', 'zonas', 'vehiculo', 'chat_id',
      'autor', 'rol', 'hora', 'request_id', 'identidad_fiscal', 'autonomo', 'seguro', 'terminos',
      'documento_sistema', 'motivo'].includes(k));
    for (const k of llaves) {
      for (const [re, que] of PROHIBIDO) if (re.test(k)) return { campo: k, que };
    }
    const textos = ['condiciones', 'condicion', 'requisitos', 'criterios', 'terminos_elegibilidad', 'elegibilidad'];
    for (const campo of textos) {
      const v = d[campo];
      if (v === undefined || v === null) continue;
      const piezas = Array.isArray(v) ? v : [v];
      for (const p of piezas) {
        if (typeof p === 'string') {
          for (const [re, que] of PROHIBIDO) if (re.test(p)) return { campo, que };
          continue;
        }
        if (p && typeof p === 'object') {
          for (const k of Object.keys(p)) {
            for (const [re, que] of PROHIBIDO) if (re.test(k)) return { campo: `${campo}.${k}`, que };
          }
        }
      }
    }
    return null;
  }

  // Acepta `acreditaciones` / `documentos` / `docs` y, además, los documentos sueltos en el alta
  // (los que NO son atributos de la parte: `vehiculo` suelto es el vehículo, no el permiso).
  _docs(d, tipo, autor, hora) {
    const fuente = d.acreditaciones || d.documentos || d.docs || {};
    const out = {};
    const meter = (k, v) => {
      const clave = this._canonDoc(k, tipo);
      if (!clave) return;
      const doc = this._doc(v, autor, hora);
      if (doc) out[clave] = doc;
    };
    if (fuente && typeof fuente === 'object' && !Array.isArray(fuente)) {
      for (const [k, v] of Object.entries(fuente)) meter(k, v);
    }
    for (const k of ['identidad', 'autonomo', 'seguro', 'documento_sistema', 'terminos', 'identidad_fiscal']) {
      if (d[k] !== undefined) meter(k, d[k]);
    }
    return out;
  }

  _canonDoc(k, tipo) {
    const limpio = String(k).trim().toLowerCase();
    for (const [canon, alias] of Object.entries(ALIAS)) {
      if (!alias.includes(limpio)) continue;
      // Para una tienda, «identidad» es su identidad FISCAL; para un rider, la personal.
      if (canon === 'identidad' && tipo === 'tienda') return 'identidad_fiscal';
      if (canon === 'identidad_fiscal' && tipo === 'rider') return 'identidad';
      return canon;
    }
    return limpio;
  }

  // Una acreditación SIN referencia no acredita: es una afirmación. Se guarda con ref null y no
  // cuenta en el checklist — así el hueco se ve en vez de taparse con un «ok».
  _doc(v, autor, hora) {
    if (v === null || v === undefined || v === false) return null;
    if (typeof v === 'string') {
      const ref = v.trim();
      return ref ? { ref, por: autor || null, hora, verificado: false, fuente: 'alta' } : null;
    }
    if (typeof v === 'object') {
      const ref = v.ref || v.url || v.documento || v.archivo || v.id || v.hash || null;
      if (!ref) return null;
      return {
        ref: String(ref),
        por: v.por || v.verificado_por || autor || null,
        hora: this._iso(v.hora) || hora,
        verificado: v.verificado === true || !!v.verificado_por,
        fuente: v.fuente || 'alta'
      };
    }
    return null;
  }

  _identidad(d, tipo) {
    const i = d.identidad || d.identidad_fiscal || null;
    if (!i) return null;
    if (typeof i === 'string') return { ref: i.trim(), tipo };
    if (typeof i === 'object') {
      return {
        nif: i.nif || i.cif || i.vat || null,
        razon_social: i.razon_social || i.razonSocial || i.nombre || null,
        titular: i.titular || i.nombre_titular || null,
        documento: i.documento || i.numero || null
      };
    }
    return null;
  }

  _contacto(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s ? s : null;
  }

  _zonas(v) {
    if (v === null) return null;
    if (!Array.isArray(v)) return false;
    const zonas = v.map((z) => String(z).trim()).filter(Boolean);
    return zonas.length > 0 ? [...new Set(zonas)] : null;
  }

  _autorDeclarante(d, parte_id) {
    const a = d.autor;
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') return a.id || a.parte_id || a.rider_id || a.tienda_id || a.rol || parte_id;
    return d.rol ? `${d.rol}:${parte_id}` : parte_id;
  }

  _esLaParte(d, parte) {
    const rol = d.rol || (d.autor && typeof d.autor === 'object' ? d.autor.rol : null) || null;
    const quien = d.autor && typeof d.autor === 'object'
      ? (d.autor.id || d.autor.parte_id || d.autor.rider_id || d.autor.tienda_id || null)
      : (d.rider_id || d.parte_id || null);
    return rol === 'rider' && (quien === null || quien === parte.parte_id);
  }

  _texto(v) {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s ? s : null;
  }

  _vista(parte) {
    const chk = this._checklistDe(parte);
    const acreditaciones = Object.entries(parte.acreditaciones || {}).map(([doc, a]) => ({
      doc, ref: a.ref, por: a.por || null, hora: a.hora || null, verificado: !!a.verificado, fuente: a.fuente || 'alta'
    }));
    return {
      parte_id: parte.parte_id,
      rider_id: parte.rider_id || null,
      tienda_id: parte.tienda_id || null,
      tipo: parte.tipo,
      plaza_id: parte.plaza_id,
      nombre: parte.nombre || null,
      identidad: parte.identidad || null,
      zonas: parte.zonas || null,
      vehiculo: parte.vehiculo || null,
      chat_id: parte.chat_id || null,
      estado_alta: parte.estado_alta,
      alta_en: parte.alta_en || null,
      actualizada_en: parte.actualizada_en || null,
      requeridos: chk.requeridos,
      acreditados: chk.acreditados,
      faltantes: chk.faltantes,
      sin_verificar: chk.sin_verificar,
      acreditaciones,
      proyecto: parte.proyecto || null,
      // Lo que el censo NO tiene se dice: no se rellena con un valor de folleto.
      huecos: [
        ...(parte.zonas ? [] : (parte.tipo === 'rider' ? ['sin zonas declaradas'] : [])),
        ...(parte.vehiculo ? [] : (parte.tipo === 'rider' ? ['sin vehículo declarado'] : [])),
        ...(parte.chat_id ? [] : (parte.tipo === 'rider' ? ['sin contacto declarado'] : []))
      ]
    };
  }
}

module.exports = CensoParte;
module.exports.REQUERIDOS = REQUERIDOS;
module.exports.TIPOS = TIPOS;
