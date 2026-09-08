'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const FORMAS_SOPORTADAS = Object.freeze(['caja', 'cilindro']);
const FORMATOS_SOPORTADOS = Object.freeze(['stl']);

function construirScad(params) {
  const { forma, dimensiones = {} } = params;

  if (forma === 'caja') {
    const { ancho = 40, alto = 20, profundo = 30, pared = 2 } = dimensiones;
    return [
      `ancho = ${ancho};`,
      `alto = ${alto};`,
      `profundo = ${profundo};`,
      `pared = ${pared};`,
      '',
      'difference() {',
      '    cube([ancho, alto, profundo]);',
      '    translate([pared, pared, pared])',
      '        cube([ancho - pared*2, alto - pared*2, profundo - pared + 0.1]);',
      '}'
    ].join('\n');
  }

  if (forma === 'cilindro') {
    const { radio = 10, alto = 15 } = dimensiones;
    return [
      `radio = ${radio};`,
      `alto = ${alto};`,
      '',
      'cylinder(h=alto, r=radio, $fn=64);'
    ].join('\n');
  }

  return `// forma '${forma}' no soportada`;
}

function estimarMinutos(params) {
  const { dimensiones = {} } = params;
  const { ancho = 10, alto = 10, profundo = 10 } = dimensiones;
  const volumen = ancho * alto * profundo;
  return Math.max(1, Math.round(volumen / 2000));
}

class DisenadorParametricoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'disenador_parametrico';
    this.version = 'reflejo-0.1.0';
  }

  onGenerarStlRequest(e) {
    return this._atender(e, 'generar_stl', 'disenador.generar_stl.response', d => this._generarStl(d));
  }

  onEstimarTiempoRequest(e) {
    return this._atender(e, 'estimar_tiempo', 'disenador.estimar_tiempo.response', d => this._estimarTiempo(d));
  }

  async _generarStl(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');

    const params = input.parametros || {};
    const formato = params.formato || 'stl';

    if (!FORMATOS_SOPORTADOS.includes(formato)) {
      return this._errorResponse(422, 'INVALID_FORMAT', `Formato '${formato}' no soportado`, {
        hint: `Formatos soportados: ${FORMATOS_SOPORTADOS.join(', ')}. El gcode lo genera el slicer, no el diseñador.`
      });
    }

    const scad_content = construirScad(params);

    try {
      const result = await this._mcpCall('export_model', {
        output_format: formato,
        scad_content
      });

      const sc = result.structuredContent || {};
      return {
        status: 200,
        data: {
          project_id: pid,
          archivo: sc.output_path,
          bytes: sc.file_size_bytes,
          formato
        }
      };
    } catch (err) {
      return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', `OpenSCAD MCP no disponible: ${err.message}`);
    }
  }

  async _estimarTiempo(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');

    const params = input.parametros || {};
    const minutos = estimarMinutos(params);

    return {
      status: 200,
      data: { project_id: pid, minutos }
    };
  }
}

DisenadorParametricoReflejo.construirScad = construirScad;
DisenadorParametricoReflejo.estimarMinutos = estimarMinutos;

module.exports = DisenadorParametricoReflejo;
