'use strict';

/**
 * HorarioServicio — el ESTADO DE SERVICIO de un negocio, en una sola función pura.
 *
 * Responde a una pregunta: ¿se puede aceptar un pedido AHORA?
 *   - por HORARIO: franjas por día de la semana, con excepciones por fecha
 *   - por INTERRUPTOR: cierre arbitrario del dueño (saturación, imprevisto) con
 *     reapertura automática si declara un `hasta`
 *
 * Sin I/O, sin relojes propios: recibe `ahora` y devuelve el estado. Quien decide
 * si frena el pedido es la puerta (pizzepos/pedidos), no este módulo.
 *
 * Degradación honesta: sin bloque `servicio` no hay horario → siempre abierto.
 * Un horario ausente NUNCA cierra el negocio por accidente; un día con lista
 * vacía SÍ (es una decisión escrita: ese día no se abre).
 *
 * Config (proyecto → config.json):
 *   "servicio": {
 *     "zona_horaria": "Europe/Madrid",
 *     "horario": {
 *       "lunes": [],                          // cerrado
 *       "martes": ["19:30-23:30"],            // una franja
 *       "sabado": ["13:00-16:00", "19:30-00:30"]  // dos franjas, la 2ª cruza medianoche
 *     },
 *     "excepciones": [
 *       { "fecha": "2026-12-25", "cerrado": true, "motivo": "Navidad" },
 *       { "fecha": "2026-10-26", "franjas": ["21:00-23:30"], "motivo": "Abrimos tarde" }
 *     ],
 *     "interruptor": { "abierto": true, "motivo": null, "hasta": null, "aviso": null },
 *     "recogida": { "direccion": "Juan Carlo I, 49", "ciudad": "Lorca", "maps_url": "..." }
 *   }
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DIAS_CON_TILDE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ZONA_POR_DEFECTO = 'Europe/Madrid';
const MIN_DIA = 24 * 60;
const DIAS_BUSQUEDA = 14;

// ── tiempo en la zona del negocio ───────────────────────────────────────────

// Partes de un instante EN LA ZONA DEL NEGOCIO (el servidor corre en UTC; comparar
// la hora del servidor con el horario de Lorca da dos horas de error).
function partesEnZona(fecha, zona) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zona || ZONA_POR_DEFECTO,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
  });
  const partes = {};
  for (const p of fmt.formatToParts(fecha)) partes[p.type] = p.value;
  const diaSemana = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(partes.weekday);
  const anio = Number(partes.year);
  const mes = Number(partes.month);
  const dia = Number(partes.day);
  // 'en-US' con hour12:false devuelve 24 en lugar de 00 en algunos motores.
  const hora = Number(partes.hour) % 24;
  const minuto = Number(partes.minute);
  return {
    anio, mes, dia,
    dia_semana: diaSemana < 0 ? 0 : diaSemana,
    minutos: hora * 60 + minuto,
    hora: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`,
    fecha: `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  };
}

// Instante real (Date) que corresponde a una hora LOCAL de la zona.
function instanteEnZona(fechaKey, minutos, zona) {
  const [anio, mes, dia] = String(fechaKey).split('-').map(Number);
  const hora = Math.floor(minutos / 60) % 24;
  const minuto = minutos % 60;
  const objetivo = Date.UTC(anio, mes - 1, dia, hora, minuto);
  let t = objetivo;
  for (let i = 0; i < 2; i++) {
    const p = partesEnZona(new Date(t), zona);
    const local = Date.UTC(p.anio, p.mes - 1, p.dia, Math.floor(p.minutos / 60), p.minutos % 60);
    t = objetivo - (local - t);
  }
  return new Date(t);
}

function fechaKey(fecha, zona) {
  return partesEnZona(fecha, zona).fecha;
}

function sumarDias(fechaKey_, dias) {
  const [anio, mes, dia] = String(fechaKey_).split('-').map(Number);
  const t = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return t.toISOString().slice(0, 10);
}

// ── franjas ─────────────────────────────────────────────────────────────────

function aMinutos(hhmm) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59) return null;
  return h * 60 + mm;
}

function aHHMM(minutos) {
  const m = ((minutos % MIN_DIA) + MIN_DIA) % MIN_DIA;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Acepta "19:30-23:30" | "19:30 a 23:30" | { desde, hasta } | [desde, hasta].
// Si `hasta` es menor que `desde` la franja cruza medianoche (23:30-00:30).
function normalizarFranja(raw) {
  let desde = null;
  let hasta = null;
  if (typeof raw === 'string') {
    const m = /^\s*(\d{1,2}[:.]\d{2})\s*(?:-|a|–|—)\s*(\d{1,2}[:.]\d{2})\s*$/i.exec(raw);
    if (!m) return null;
    desde = aMinutos(m[1]);
    hasta = aMinutos(m[2]);
  } else if (Array.isArray(raw)) {
    desde = aMinutos(raw[0]);
    hasta = aMinutos(raw[1]);
  } else if (raw && typeof raw === 'object') {
    desde = aMinutos(raw.desde);
    hasta = aMinutos(raw.hasta);
  }
  if (desde === null || hasta === null) return null;
  const cruza = hasta <= desde;
  return { desde, hasta: cruza ? hasta + MIN_DIA : hasta, cruza_medianoche: cruza };
}

function normalizarFranjas(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.map(normalizarFranja).filter(Boolean);
}

function textoFranja(f) {
  if (!f) return '';
  return `${aHHMM(f.desde)}-${aHHMM(f.hasta)}`;
}

function textoHorario(franjas) {
  if (!Array.isArray(franjas) || franjas.length === 0) return 'cerrado';
  return franjas.map(textoFranja).join(' · ');
}

// ¿El minuto del día cae dentro de alguna franja? `minutos` puede venir desplazado
// +1440 para evaluar las franjas de ayer que cruzan medianoche.
function dentroDe(franjas, minutos) {
  for (const f of franjas) {
    if (minutos >= f.desde && minutos < f.hasta) return f;
  }
  return null;
}

// ── configuración ──────────────────────────────────────────────────────────

function normalizarServicio(servicio) {
  const s = (servicio && typeof servicio === 'object') ? servicio : {};
  const horario = (s.horario && typeof s.horario === 'object') ? s.horario : null;
  const franjasPorDia = {};
  if (horario) {
    for (let i = 0; i < 7; i++) {
      const clave = DIAS[i];
      const conTilde = DIAS_CON_TILDE[i];
      const lista = Array.isArray(horario[clave]) ? horario[clave]
        : (Array.isArray(horario[conTilde]) ? horario[conTilde] : []);
      franjasPorDia[i] = normalizarFranjas(lista);
    }
  }
  const excepciones = new Map();
  if (Array.isArray(s.excepciones)) {
    for (const e of s.excepciones) {
      if (!e || typeof e !== 'object' || !e.fecha) continue;
      excepciones.set(String(e.fecha).slice(0, 10), e);
    }
  }
  const interruptor = (s.interruptor && typeof s.interruptor === 'object') ? s.interruptor : {};
  const recogida = (s.recogida && typeof s.recogida === 'object') ? s.recogida : {};
  return {
    zona: s.zona_horaria || ZONA_POR_DEFECTO,
    tiene_horario: !!horario,
    franjasPorDia,
    excepciones,
    interruptor,
    recogida,
    aviso_cierre: typeof s.aviso_cierre === 'string' ? s.aviso_cierre : null
  };
}

function franjasDeFecha(cfg, fechaKey_) {
  const exc = cfg.excepciones.get(fechaKey_);
  if (exc && Array.isArray(exc.franjas)) return normalizarFranjas(exc.franjas);
  const [anio, mes, dia] = String(fechaKey_).split('-').map(Number);
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return cfg.franjasPorDia[diaSemana] || [];
}

function esCerradoPorExcepcion(cfg, fechaKey_) {
  const exc = cfg.excepciones.get(fechaKey_);
  return !!(exc && exc.cerrado === true);
}

// Próxima apertura: la primera franja futura en los próximos DIAS_BUSQUEDA días.
function proximaApertura(cfg, ahora) {
  if (!cfg.tiene_horario) return null;
  for (let d = 0; d <= DIAS_BUSQUEDA; d++) {
    const fk = sumarDias(ahora.fecha, d);
    if (esCerradoPorExcepcion(cfg, fk)) continue;
    const franjas = franjasDeFecha(cfg, fk);
    for (const f of franjas) {
      const desde = d === 0 ? f.desde : f.desde + (d * MIN_DIA);
      if (desde > ahora.minutos) {
        return {
          fecha: fk,
          desde: aHHMM(f.desde),
          hasta: aHHMM(f.hasta),
          iso: instanteEnZona(fk, f.desde, cfg.zona).toISOString()
        };
      }
    }
  }
  return null;
}

// ── el estado ───────────────────────────────────────────────────────────────

/**
 * @param {object} servicio  bloque `servicio` del config del proyecto (puede ser null)
 * @param {Date}   [ahora]   instante de referencia (inyectable en tests)
 * @returns {{abierto:boolean, motivo:string|null, hasta:string|null, aviso:string|null,
 *            franja_actual:object|null, franjas_hoy:Array, proxima_apertura:object|null,
 *            ahora:object, zona_horaria:string}}
 */
function estadoServicio(servicio, ahora) {
  const cfg = normalizarServicio(servicio);
  const instante = (ahora instanceof Date && !Number.isNaN(ahora.getTime())) ? ahora : new Date();
  const p = partesEnZona(instante, cfg.zona);

  const ayerKey = sumarDias(p.fecha, -1);
  const franjasHoy = franjasDeFecha(cfg, p.fecha);
  const franjasAyer = franjasDeFecha(cfg, ayerKey);

  // Franja en curso: primero las de hoy; después las de ayer que cruzan medianoche.
  const franjaHoy = dentroDe(franjasHoy, p.minutos);
  const franjaAyer = franjaHoy ? null : dentroDe(franjasAyer, p.minutos + MIN_DIA);
  const franjaActual = franjaHoy || franjaAyer || null;

  const base = {
    ahora: { fecha: p.fecha, hora: p.hora, minutos: p.minutos, dia_semana: DIAS[p.dia_semana] },
    zona_horaria: cfg.zona,
    franjas_hoy: franjasHoy.map(textoFranja),
    horario_hoy: textoHorario(franjasHoy),
    recogida: {
      direccion: cfg.recogida.direccion || null,
      ciudad: cfg.recogida.ciudad || null,
      maps_url: cfg.recogida.maps_url || null,
      notas: cfg.recogida.notas || null
    }
  };

  // 1. INTERRUPTOR (la tecla del dueño). Manda sobre el horario: si él cierra, está cerrado.
  const int_ = cfg.interruptor;
  if (int_ && int_.abierto === false) {
    const hasta = int_.hasta ? String(int_.hasta) : null;
    const hastaMs = hasta ? Date.parse(hasta) : NaN;
    const reabreSolo = Number.isFinite(hastaMs);
    if (!reabreSolo || instante.getTime() < hastaMs) {
      return {
        ...base,
        abierto: false,
        motivo: int_.motivo || 'manual',
        motivo_texto: textoMotivo(int_.motivo || 'manual', int_.motivo_texto),
        hasta,
        aviso: int_.aviso || cfg.aviso_cierre || null,
        franja_actual: franjaActual ? textoFranja(franjaActual) : null,
        proxima_apertura: reabreSolo
          ? { fecha: null, desde: null, hasta: null, iso: new Date(hastaMs).toISOString() }
          : proximaApertura(cfg, p)
      };
    }
    // hasta vencido → el interruptor se suelta solo (abrir cuando amaine).
  }

  // 2. EXCEPCIÓN de la fecha (día cerrado a propósito, o franjas distintas).
  if (esCerradoPorExcepcion(cfg, p.fecha)) {
    const exc = cfg.excepciones.get(p.fecha);
    return {
      ...base,
      abierto: false,
      motivo: 'excepcion',
      motivo_texto: exc.motivo || 'Hoy cerrado',
      hasta: null,
      aviso: exc.aviso || null,
      franja_actual: null,
      proxima_apertura: proximaApertura(cfg, p)
    };
  }

  // 3. HORARIO. Sin bloque de horario no hay restricción (degradación honesta).
  if (!cfg.tiene_horario) {
    return {
      ...base,
      abierto: true,
      motivo: null,
      motivo_texto: null,
      hasta: null,
      aviso: null,
      franja_actual: null,
      proxima_apertura: null
    };
  }

  if (franjaActual) {
    return {
      ...base,
      abierto: true,
      motivo: null,
      motivo_texto: null,
      hasta: null,
      aviso: null,
      franja_actual: textoFranja(franjaActual),
      proxima_apertura: null
    };
  }

  return {
    ...base,
    abierto: false,
    motivo: 'horario',
    motivo_texto: 'Fuera de horario',
    hasta: null,
    aviso: null,
    franja_actual: null,
    proxima_apertura: proximaApertura(cfg, p)
  };
}

function textoMotivo(motivo, libre) {
  if (libre) return libre;
  switch (motivo) {
    case 'saturacion': return 'Estamos a tope';
    case 'manual':     return 'Cerrado ahora mismo';
    case 'horario':    return 'Fuera de horario';
    case 'excepcion':  return 'Hoy cerrado';
    default:           return 'Cerrado';
  }
}

// Mensaje para el cliente (el que ve en la PWA y el que manda el bot).
function mensajeCierre(estado) {
  if (!estado || estado.abierto) return null;
  const base = estado.aviso || `${estado.motivo_texto || 'Cerrado'}.`;
  const prox = estado.proxima_apertura;
  if (!prox) return base;
  if (prox.iso && !prox.fecha) {
    const p = partesEnZona(new Date(prox.iso), estado.zona_horaria);
    return `${base} Volvemos a las ${p.hora}.`;
  }
  if (prox.fecha) return `${base} Abrimos el ${prox.fecha} a las ${prox.desde}.`;
  return base;
}

module.exports = {
  DIAS,
  DIAS_CON_TILDE,
  ZONA_POR_DEFECTO,
  estadoServicio,
  partesEnZona,
  instanteEnZona,
  fechaKey,
  normalizarFranja,
  normalizarFranjas,
  normalizarServicio,
  textoFranja,
  textoHorario,
  textoMotivo,
  mensajeCierre,
  proximaApertura,
  aMinutos,
  aHHMM
};
