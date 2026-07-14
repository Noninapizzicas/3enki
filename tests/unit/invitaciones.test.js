'use strict';

/**
 * invitaciones — el banco de la cadena de delegación.
 *
 * Verifica la invariante monotónica (nadie otorga más de lo que tiene), la firma real (RS256,
 * mismo primitivo que enki-token) y el veredicto FÉRTIL de verificar (nombra lo que falta:
 * monotonía, firma, caducidad, usos). Sin I/O, sin bus — par de claves real.
 *
 * Ejecutar: node tests/unit/invitaciones.test.js
 */

const assert = require('assert');
const crypto = require('crypto');
const { puedeOtorgar, emitir, verificar } = require('../../modules/_shared/invitaciones');

function test(desc, fn) { try { fn(); console.log(`✓ ${desc}`); } catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); process.exit(1); } }

// clave del emisor (en prod: la CA raíz en R1). firmar/verificarFirma = el mismo par.
const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const firmar = (canonical) => crypto.sign('RSA-SHA256', Buffer.from(canonical, 'utf8'), kp.privateKey).toString('base64');
const verificarFirma = (canonical, firma) => crypto.verify('RSA-SHA256', Buffer.from(canonical, 'utf8'), kp.publicKey, Buffer.from(firma, 'base64'));

const SYSTEM = { scope: 'system', role: 'system-admin' };
const ADMIN_NONINA = { scope: 'nonina', role: 'project-admin' };
const futuro = () => new Date(Date.now() + 7 * 864e5).toISOString();

console.log('invitaciones — la cadena de delegación de capacidades\n');

// ── monotonía ──
test('monotonía: system puede otorgar crear-proyecto (role project-admin)', () => {
  assert.strictEqual(puedeOtorgar(SYSTEM, { accion: 'crear-proyecto', project: null, role: 'project-admin' }), true);
});
test('monotonía: project-admin puede invitar a SU proyecto (unirse, member)', () => {
  assert.strictEqual(puedeOtorgar(ADMIN_NONINA, { accion: 'unirse-proyecto', project: 'nonina', role: 'member' }), true);
});
test('monotonía: project-admin NO puede crear-proyecto', () => {
  assert.strictEqual(puedeOtorgar(ADMIN_NONINA, { accion: 'crear-proyecto', project: null, role: 'project-admin' }), false);
});
test('monotonía: project-admin NO puede invitar a OTRO proyecto', () => {
  assert.strictEqual(puedeOtorgar(ADMIN_NONINA, { accion: 'unirse-proyecto', project: 'otra-tienda', role: 'member' }), false);
});
test('monotonía: un member no delega', () => {
  assert.strictEqual(puedeOtorgar({ scope: 'nonina', role: 'member' }, { accion: 'unirse-proyecto', project: 'nonina', role: 'member' }), false);
});

// ── emitir + verificar (el caso del admin del sistema) ──
test('emitir: el admin del sistema crea una invitación de proyecto firmada', () => {
  const inv = emitir({ autoridad: SYSTEM, grant: { accion: 'crear-proyecto', project: null, role: 'project-admin' }, limites: { expira_at: futuro() }, firmar });
  assert.ok(inv.id.startsWith('inv_'));
  assert.strictEqual(inv.otorga.role, 'project-admin');
  const v = verificar(inv, { verificarFirma });
  assert.deepStrictEqual(v, { valida: true, faltan: [] });
});

test('emitir: rechaza fabricar una invitación fuera de la autoridad (monotonía)', () => {
  assert.throws(() => emitir({ autoridad: ADMIN_NONINA, grant: { accion: 'crear-proyecto', project: null, role: 'project-admin' }, limites: {}, firmar }), /monotonia/);
});

// ── verificar FÉRTIL: nombra lo que falta ──
test('verificar: firma de OTRA clave → inválida (nombra la firma)', () => {
  const inv = emitir({ autoridad: SYSTEM, grant: { accion: 'crear-proyecto', project: null, role: 'project-admin' }, limites: { expira_at: futuro() }, firmar });
  const otra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const verificarOtra = (c, f) => crypto.verify('RSA-SHA256', Buffer.from(c), otra.publicKey, Buffer.from(f, 'base64'));
  const v = verificar(inv, { verificarFirma: verificarOtra });
  assert.strictEqual(v.valida, false);
  assert.ok(v.faltan.some(f => /firma/.test(f)));
});

test('verificar: manipular el grant invalida la firma', () => {
  const inv = emitir({ autoridad: SYSTEM, grant: { accion: 'crear-proyecto', project: null, role: 'project-admin' }, limites: { expira_at: futuro() }, firmar });
  inv.otorga.role = 'system-admin';   // intento de escalar tras firmar
  const v = verificar(inv, { verificarFirma });
  assert.strictEqual(v.valida, false, 'la firma ya no cuadra con el grant alterado');
});

test('verificar: caducada → nombra la caducidad', () => {
  const inv = emitir({ autoridad: SYSTEM, grant: { accion: 'crear-proyecto', project: null, role: 'project-admin' }, limites: { expira_at: new Date(Date.now() - 864e5).toISOString() }, firmar });
  const v = verificar(inv, { verificarFirma });
  assert.ok(v.faltan.some(f => /caducada/.test(f)));
});

test('verificar: sin usos → nombra los usos', () => {
  const inv = emitir({ autoridad: SYSTEM, grant: { accion: 'crear-proyecto', project: null, role: 'project-admin' }, limites: { expira_at: futuro(), usos_max: 1 }, firmar });
  inv.limites.usos = 1;   // ya se redimió
  const v = verificar(inv, { verificarFirma });
  assert.ok(v.faltan.some(f => /usos/.test(f)));
});

console.log('\n✓ invitaciones: la cadena solo baja (monotonía), la firma prueba al emisor, el veredicto nace fértil');
