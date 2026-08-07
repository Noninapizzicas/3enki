const BaseModule = require('../_shared/base-module');

class MotorVerifCommit extends BaseModule {
  constructor() {
    super();
    this.name = 'motor-verif-commit';
    this.version = '0.1.0';
  }

  _atender(evento, contexto, respuesta, siguiente) {
    const tipo = evento && (evento.tipo || evento.type || evento.nombre);

    if (tipo === 'modulo.prueba' || tipo === 'test') {
      return respuesta({
        ok: true,
        motor: this.name,
        mensaje: 'motor-verif-commit operativo'
      });
    }

    if (tipo && (tipo.includes('verif.commit') || tipo.includes('commit.verif'))) {
      const datos = evento.payload || evento.datos || evento;
      const commit = datos.commit || datos.mensaje || datos.message || datos.sha || '';
      const valido = typeof commit === 'string' && commit.trim().length > 0;
      return respuesta({
        ok: true,
        valido,
        motor: this.name,
        mensaje: valido ? 'Commit verificado' : 'Commit vacío o inexistente'
      });
    }

    return siguiente();
  }
}

module.exports = MotorVerifCommit;