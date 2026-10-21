'use strict';
const assert = require('assert');
const HorariosCasa = require('../../modules/horarios_casa');

describe('horarios_casa (reflejo)', () => {
  it('instancia + handlers', () => {
    const m = new HorariosCasa();
    assert.strictEqual(m.name, 'horarios_casa');
    assert.strictEqual(typeof m.onConfigurarHorarioRequest, 'function');
    assert.strictEqual(typeof m.onObtenerHorarioRequest, 'function');
    assert.strictEqual(typeof m.onListarHorariosRequest, 'function');
    assert.strictEqual(typeof m.onVentanaActivaRequest, 'function');
  });

  it('configurar_horario: 200 y persiste', async () => {
    const m = new HorariosCasa();
    const r = await m._configurarHorario({
      project_id: 'p1', persona_id: 'papa',
      ventanas: [{ dias: ['LUN', 'MAR'], desde: '20:00', hasta: '23:00' }]
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.horario.persona_id, 'papa');
    assert.strictEqual(r.data.horario.ventanas.length, 1);
  });

  it('configurar_horario: persona inválida → 422', async () => {
    const m = new HorariosCasa();
    const r = await m._configurarHorario({ project_id: 'p1', persona_id: 'abuela', ventanas: [] });
    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.error.code, 'PARAMETROS_INVALIDOS');
    assert.strictEqual(r.error.message, 'persona_invalida');
  });

  it('configurar_horario: ventana inválida (hasta<=desde) → 422', async () => {
    const m = new HorariosCasa();
    const r = await m._configurarHorario({
      project_id: 'p1', persona_id: 'mama',
      ventanas: [{ dias: ['SAB'], desde: '14:00', hasta: '10:00' }]
    });
    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.error.code, 'PARAMETROS_INVALIDOS');
    assert.strictEqual(r.error.message, 'hasta_debe_ser_mayor_que_desde');
  });

  it('obtener_horario: 404 si no configurado', async () => {
    const m = new HorariosCasa();
    const r = await m._obtenerHorario({ project_id: 'p1', persona_id: 'hijo1' });
    assert.strictEqual(r.status, 404);
  });

  it('ventana_activa: dentro de ventana → activa true', async () => {
    const m = new HorariosCasa();
    await m._configurarHorario({
      project_id: 'p1', persona_id: 'papa',
      ventanas: [{ dias: ['LUN'], desde: '20:00', hasta: '23:00' }]
    });
    // Lunes 2026-09-07 21:30 UTC
    const r = await m._ventanaActiva({ project_id: 'p1', persona_id: 'papa', ahora: '2026-09-07T21:30:00Z' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.activa, true);
  });

  it('ventana_activa: fuera de ventana → activa false', async () => {
    const m = new HorariosCasa();
    await m._configurarHorario({
      project_id: 'p1', persona_id: 'papa',
      ventanas: [{ dias: ['LUN'], desde: '20:00', hasta: '23:00' }]
    });
    // Lunes 2026-09-07 12:00 UTC (fuera)
    const r = await m._ventanaActiva({ project_id: 'p1', persona_id: 'papa', ahora: '2026-09-07T12:00:00Z' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.activa, false);
  });

  it('ventana_activa: sin horario → activa false con motivo', async () => {
    const m = new HorariosCasa();
    const r = await m._ventanaActiva({ project_id: 'p1', persona_id: 'hijo2', ahora: '2026-09-07T21:30:00Z' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.activa, false);
    assert.strictEqual(r.data.motivo, 'sin_horario_configurado');
  });
});
