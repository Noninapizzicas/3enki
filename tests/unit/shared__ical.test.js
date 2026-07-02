/**
 * Tests de _shared/ical — serializador iCalendar (RFC 5545) puro, sin deps.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const ical = require('../../modules/_shared/ical.js');

const NOW = '2026-07-01T10:20:30.000Z';

test('VCALENDAR con un VEVENT: cabecera, fechas flotantes y SUMMARY', () => {
  const ics = ical.toIcs({ nowIso: NOW, name: 'Agenda', events: [
    { uid: 'r1@x', start: '2026-07-06T09:00', end: '2026-07-06T10:00', summary: 'Silla · Ana' }
  ] });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('VERSION:2.0'));
  assert.ok(ics.includes('X-WR-CALNAME:Agenda'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('UID:r1@x'));
  assert.ok(ics.includes('DTSTAMP:20260701T102030Z'));      // UTC, del nowIso inyectado
  assert.ok(ics.includes('DTSTART:20260706T090000'));       // flotante (reloj de pared, sin Z)
  assert.ok(ics.includes('DTEND:20260706T100000'));
  assert.ok(ics.includes('SUMMARY:Silla · Ana'));
  assert.ok(ics.trim().endsWith('END:VCALENDAR'));
  assert.ok(ics.includes('\r\n'));                          // CRLF
});

test('evento de día completo → VALUE=DATE sin hora', () => {
  const ics = ical.toIcs({ nowIso: NOW, events: [{ uid: 'a1', start: '2026-07-06', allDay: true, summary: 'Máquina' }] });
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260706'));
  assert.ok(!ics.includes('20260706T'));                    // no lleva parte de hora
});

test('escapa coma y punto y coma en el texto', () => {
  const ics = ical.toIcs({ nowIso: NOW, events: [{ uid: 'e1', start: '2026-07-06T09:00', summary: 'Corte, tinte; Ana' }] });
  assert.ok(ics.includes('SUMMARY:Corte\\, tinte\\; Ana'));
});

test('STATUS se emite cuando se da', () => {
  const ics = ical.toIcs({ nowIso: NOW, events: [{ uid: 'c1', start: '2026-07-06T09:00', summary: 'x', status: 'CANCELLED' }] });
  assert.ok(ics.includes('STATUS:CANCELLED'));
});

test('plegado de líneas largas a 75 octetos (continuación con espacio)', () => {
  const larga = 'A'.repeat(120);
  const ics = ical.toIcs({ nowIso: NOW, events: [{ uid: 'l1', start: '2026-07-06T09:00', summary: larga }] });
  assert.ok(ics.includes('\r\n '));                         // hay al menos una continuación plegada
  assert.ok(ics.split('\r\n').every(l => l.length <= 75));  // ninguna línea supera 75
});

test('evento sin uid o sin start se ignora (no rompe)', () => {
  const ics = ical.toIcs({ nowIso: NOW, events: [{ start: '2026-07-06T09:00' }, { uid: 'ok', start: 'basura' }, { uid: 'ok2', start: '2026-07-06T09:00' }] });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);   // solo el válido
});

test('parseIcs: round-trip (toIcs → parseIcs) conserva fechas, allDay y texto', () => {
  const ics = ical.toIcs({ nowIso: NOW, events: [
    { uid: 'r1', start: '2026-07-06T09:00', end: '2026-07-06T10:00', summary: 'Corte, tinte' },
    { uid: 'a1', start: '2026-08-15', allDay: true, summary: 'Vacaciones' }
  ] });
  const evs = ical.parseIcs(ics);
  assert.equal(evs.length, 2);
  const cita = evs.find(e => e.uid === 'r1');
  assert.equal(cita.start, '2026-07-06T09:00');
  assert.equal(cita.end, '2026-07-06T10:00');
  assert.equal(cita.allDay, false);
  assert.equal(cita.summary, 'Corte, tinte');      // des-escapado
  const vac = evs.find(e => e.uid === 'a1');
  assert.equal(vac.allDay, true);
  assert.equal(vac.start, '2026-08-15');
});

test('parseIcs: deshace el plegado de líneas largas', () => {
  const larga = 'Z'.repeat(120);
  const evs = ical.parseIcs(ical.toIcs({ nowIso: NOW, events: [{ uid: 'l1', start: '2026-07-06T09:00', summary: larga }] }));
  assert.equal(evs[0].summary, larga);             // reconstruido pese al fold
});

console.log('shared__ical: asserts definidos');
