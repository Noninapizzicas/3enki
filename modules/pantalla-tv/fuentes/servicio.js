'use strict';

/**
 * BLOQUE servicio — su identidad es el AHORA: si está abierto, hasta cuándo,
 * dónde y cómo se pide. Su forma: cabecera (estado), cinta (una línea) y
 * contacto (columna fija).
 * Fuente: servicio/config.json (horario vivo + excepciones + recogida) y marca (teléfono/voz).
 * Cadencia: fijo. El estado NO se congela aquí: viaja el horario y lo calcula la
 * pantalla cada segundo (una tele encendida 12 h no puede fiarse de un "abierto"
 * calculado al publicar).
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const ABREV = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom' };

/**
 * Resumen del horario para la tarjeta de contacto: agrupa días con las mismas
 * franjas y NO anuncia los días cerrados (una lista de siete líneas con tres
 * "cerrado" en el escaparate solo invita a no venir).
 * Devuelve [{ dias: 'Lun-Jue', franjas: ['18:00-23:30'] }, ...]
 */
function resumenHorario(horario) {
  const orden = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const clave = d => (Array.isArray(horario[d]) ? horario[d].join(',') : '');
  const grupos = [];
  let act = null;
  for (const d of orden) {
    const k = clave(d);
    if (act && act.k === k) act.hasta = d;
    else { act = { k, desde: d, hasta: d }; grupos.push(act); }
  }
  return grupos
    .filter(g => g.k)
    .map(g => ({
      dias: g.desde === g.hasta ? ABREV[g.desde] : `${ABREV[g.desde]}-${ABREV[g.hasta]}`,
      franjas: g.k.split(',').filter(Boolean)
    }));
}

module.exports = {
  id: 'servicio',
  cadencia: 'fijo',
  forma: 'cabecera',

  piezas(ctx) {
    const s = ctx.servicio || {};
    const horario = s.horario || {};
    const recogida = s.recogida || {};
    const marca = ctx.proyeccion.branding || {};
    const negocio = marca.negocio || {};
    const tel = negocio.telefono || ctx.telefono || null;

    const piezas = [
      {
        id: 'servicio.estado', bloque: 'servicio.estado', forma: 'cabecera', posicion: 'centro', cadencia: 'fijo',
        titulo: 'Estado', datos: {
          tipo: 'estado',
          horario, excepciones: s.excepciones || [], interruptor: s.interruptor || {},
          zona_horaria: s.zona_horaria || 'Europe/Madrid',
          lema: marca.lema || null
        }
      },
      {
        id: 'servicio.cinta', bloque: 'servicio.cinta', forma: 'cinta', posicion: null, cadencia: 'fijo',
        titulo: 'cinta', datos: {
          textos: [
            marca.lema,
            tel ? String(tel).replace(/\D/g,'').replace(/^(\d{3})(\d{2})(\d{2})(\d{2})$/,'$1 $2 $3 $4') : null,
            recogida.direccion ? `${recogida.direccion}, ${recogida.ciudad || ''}`.replace(/,\s*$/, '') : null,
            'Masa madre · horno de leña',
            'Pedidos por WhatsApp'
          ].filter(Boolean)
        }
      }
    ];

    const hayContacto = recogida.direccion || tel;
    if (hayContacto) {
      piezas.push({
        id: 'servicio.contacto', bloque: 'servicio.contacto', forma: 'contacto', posicion: null, cadencia: 'fijo',
        titulo: 'Dónde estamos',
        subtitulo: [recogida.direccion, recogida.ciudad].filter(Boolean).join(', '),
        datos: {
          telefono: tel,
          direccion: recogida.direccion || null,
          ciudad: recogida.ciudad || null,
          maps_url: recogida.maps_url || null,
          whatsapp: ctx.whatsapp_url || null,
          horario: resumenHorario(horario)
        }
      });
    }

    return piezas;
  },

  /** Lo usa el cableado para no inventar horarios: expone los días tal cual. */
  DIAS
};
