/**
 * ical — serializador iCalendar (RFC 5545) PURO y sin dependencias.
 *
 * El estándar que hablan todos los calendarios (Google/Apple/Outlook). Un `.ics` es
 * texto: VCALENDAR con VEVENTs. Lo emitimos a mano — el formato es simple y así queda
 * testeable offline y reutilizable por cualquier módulo que quiera publicar un feed.
 *
 * v0.1: horas en tiempo FLOTANTE (reloj de pared, sin Z ni TZID) — la mayoría de móviles
 * lo interpretan en su zona local, que es lo que el comerciante quiere ("mi cita a las 9").
 * El tz/DST correcto (TZID + VTIMEZONE, vía luxon) es follow-up. DTSTAMP sí es UTC.
 * Ver arquitectura/decisiones/propuestas/calendario.md.
 */

'use strict';

// escapa los caracteres especiales de un valor de texto iCal (RFC 5545 §3.3.11).
function escapeText(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// plegado de líneas a 75 octetos (§3.1): las continuaciones empiezan con un espacio.
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length) { parts.push(' ' + rest.slice(0, 74)); rest = rest.slice(74); }
  return parts.join('\r\n');
}

// 'YYYY-MM-DDTHH:MM' → { param, val } de fecha iCal. allDay o fecha-sin-hora → VALUE=DATE.
function formatDate(iso, allDay) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(iso || ''));
  if (!m) return null;
  const sinHora = allDay || !m[4];
  if (sinHora) return { param: ';VALUE=DATE', val: `${m[1]}${m[2]}${m[3]}` };
  return { param: '', val: `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00` };   // flotante (reloj de pared)
}

// una fecha UTC ISO (new Date().toISOString()) → forma UTC iCal 'YYYYMMDDTHHMMSSZ'.
function formatStampUTC(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(iso || ''));
  if (!m) return '19700101T000000Z';
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}Z`;
}

/**
 * Construye el texto .ics.
 * @param {Object} o
 * @param {string} [o.prodid]  identificador del producto
 * @param {string} [o.name]    nombre visible del calendario (X-WR-CALNAME)
 * @param {string} [o.nowIso]  timestamp UTC para el DTSTAMP (inyectable para tests deterministas)
 * @param {Array}  o.events    [{ uid, start, end?, allDay?, summary?, status?, description? }]
 */
function toIcs(o = {}) {
  const prodid = o.prodid || '-//Enki//Prisma Calendario//ES';
  const stamp = formatStampUTC(o.nowIso || new Date().toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${prodid}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (o.name) lines.push(`X-WR-CALNAME:${escapeText(o.name)}`);
  for (const ev of (Array.isArray(o.events) ? o.events : [])) {
    const start = formatDate(ev.start, ev.allDay);
    if (!ev || !ev.uid || !start) continue;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeText(ev.uid)}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART${start.param}:${start.val}`);
    if (ev.end) { const end = formatDate(ev.end, ev.allDay); if (end) lines.push(`DTEND${end.param}:${end.val}`); }
    lines.push(`SUMMARY:${escapeText(ev.summary || 'Reserva')}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.status) lines.push(`STATUS:${ev.status}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

module.exports = { toIcs, escapeText, foldLine, formatDate, formatStampUTC };
