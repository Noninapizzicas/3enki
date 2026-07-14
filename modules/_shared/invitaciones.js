/**
 * invitaciones — el banco PURO de la cadena de delegación de capacidades.
 *
 * Una invitación es una CAPACIDAD portable firmada: quien la posee puede redimirla para obtener
 * un cert scopeado a {project, role}. La invariante que la hace segura es la MONOTONÍA: nadie
 * otorga más de lo que su propia autoridad tiene (system → project-admin → member, solo baja).
 *
 * Banco PURO (sin I/O, sin bus): la FIRMA se inyecta (la clave del emisor — CA raíz en R1, o un
 * cert admin:system:root en R2 — el banco no sabe ni le importa cuál). Reusa el mismo primitivo
 * RS256 que enki-token. Lo consumen el módulo invitaciones (emitir/listar/revocar) y el redentor
 * (verificar → issueFromPublicKey). Ver arquitectura/cabecera/sistema-nervioso/invitaciones.md.
 */

'use strict';

const crypto = require('crypto');

const ACCIONES = new Set(['crear-proyecto', 'unirse-proyecto']);

// ── LA INVARIANTE: ¿la autoridad del emisor puede otorgar este grant? (Specification) ──
// Estructural: valida scope/accion/project. Que el role exista en el catálogo del proyecto lo
// cierra el redentor (que sí tiene el catálogo, Fase 2) — el banco no lo conoce a propósito.
function puedeOtorgar(autoridad, grant) {
  if (!autoridad || !grant || !grant.role || !ACCIONES.has(grant.accion)) return false;
  if (autoridad.scope === 'system') return true;                    // la raíz: crea proyectos y otorga cualquier rol
  if (autoridad.role === 'project-admin') {
    // el admin de proyecto solo invita a SU proyecto, y no crea proyectos nuevos ni escala a system
    return grant.accion === 'unirse-proyecto' && grant.project === autoridad.scope;
  }
  return false;                                                     // member y demás no delegan
}

// JSON estable (mismo texto en emisor y verificador → la firma cuadra a ambos lados)
function _canonical(inv) {
  return JSON.stringify({
    id: inv.id,
    otorga: { accion: inv.otorga.accion, project: inv.otorga.project ?? null, role: inv.otorga.role },
    limites: { expira_at: inv.limites.expira_at ?? null, usos_max: inv.limites.usos_max ?? 1 }
  });
}

// ── EMITIR: la Factory. firmar(canonicalString) → firma (base64/hex). El emisor pone su clave. ──
function emitir({ autoridad, grant, limites = {}, firmar, id = null }) {
  if (typeof firmar !== 'function') throw new Error('emitir: firmar(canonical) requerido');
  if (!puedeOtorgar(autoridad, grant)) {
    throw new Error(`monotonia: ${autoridad?.scope}/${autoridad?.role} no puede otorgar ` +
      `${grant?.accion}:${grant?.role}${grant?.project ? '@' + grant.project : ''}`);
  }
  const _id = id || 'inv_' + crypto.randomBytes(8).toString('hex');
  const inv = {
    id: _id,
    emisor: { scope: autoridad.scope, role: autoridad.role },
    otorga: { accion: grant.accion, project: grant.project ?? null, role: grant.role },
    limites: { expira_at: limites.expira_at ?? null, usos_max: limites.usos_max ?? 1, usos: 0 }
  };
  inv.firma = firmar(_canonical(inv));
  return inv;
}

// ── VERIFICAR: Specification FÉRTIL — nunca un "no" pelado, nombra lo que falta. ──
// verificarFirma(canonical, firma) → bool (valida contra el cert del emisor). ahoraSec opcional.
function verificar(invitacion, { verificarFirma, ahoraSec = null } = {}) {
  const faltan = [];
  if (!invitacion || !invitacion.otorga || !invitacion.emisor || !invitacion.firma) {
    return { valida: false, faltan: ['estructura de la invitación'] };
  }
  // monotonía re-chequeada (por si el emisor mintió al fabricarla)
  if (!puedeOtorgar(invitacion.emisor, invitacion.otorga)) {
    faltan.push('monotonia: el emisor no tenía autoridad para otorgar esto');
  }
  // firma contra el cert del emisor
  let firmaOk = false;
  try { firmaOk = typeof verificarFirma === 'function' && verificarFirma(_canonical(invitacion), invitacion.firma); }
  catch { firmaOk = false; }
  if (!firmaOk) faltan.push('firma inválida (¿la firmó de verdad el emisor?)');
  // caducidad
  const now = Number.isFinite(ahoraSec) ? ahoraSec : Math.floor(Date.now() / 1000);
  const exp = invitacion.limites?.expira_at ? Math.floor(new Date(invitacion.limites.expira_at).getTime() / 1000) : null;
  if (exp !== null && Number.isFinite(exp) && now > exp) faltan.push('caducada');
  // usos
  if ((invitacion.limites?.usos || 0) >= (invitacion.limites?.usos_max || 1)) faltan.push('sin usos disponibles');

  return { valida: faltan.length === 0, faltan };
}

module.exports = { ACCIONES, puedeOtorgar, emitir, verificar };
