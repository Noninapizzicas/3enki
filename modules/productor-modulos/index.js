/**
 * productor-modulos — REFLEJO JS: valida y escribe módulos en modules/<nombre>/.
 *
 * Recibe un diseño de disenador-modulos, lo valida contra el patrón real,
 * pide confirmación vía interruptor, y materializa los archivos.
 *
 * v0.1.0: tool productor.producir + interruptor de seguridad.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const MODULES_DIR = path.resolve(__dirname, '..');
const REBANADA_PATH = path.resolve(__dirname, '../../arquitectura/cabecera/patron/modulo-real.md');
const INTERRUPTOR_ID = 'productor-modulos.habilitado';

class ProductorModulosReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'productor-modulos';
    this.version = 'reflejo-0.1.0';
    this._habilitado = false;  // leído del interruptor al arrancar
  }

  // ── Lifecycle ──

  async onLoad(context) {
    await super.onLoad(context);
    // Registra el interruptor
    this._publicarEvento('interruptor.registrar', {
      id: INTERRUPTOR_ID,
      label: 'Productor de Módulos',
      descripcion: 'Permite escribir módulos en modules/ desde el diseño de disenador-modulos.',
      grupo: 'sistema',
      default: false
    });
  }

  onProjectActivated(e) {
    // No persiste datos por proyecto, solo existe a nivel sistema
  }

  // ── Interruptor ──

  onInterruptorCambiado(e) {
    const d = (e && (e.data || e)) || {};
    if (d.id === INTERRUPTOR_ID) {
      this._habilitado = d.enabled === true;
      if (this.logger) this.logger.info('interruptor ' + INTERRUPTOR_ID + ' → ' + this._habilitado);
    }
  }

  onSolicitarRegistro() {
    this._publicarEvento('interruptor.registrar', {
      id: INTERRUPTOR_ID, label: 'Productor de Módulos',
      descripcion: 'Permite escribir módulos en modules/.',
      grupo: 'sistema', default: false
    });
  }

  // ── Validación ──

  _validarDiseno(nombre, moduleJson, indexJs) {
    const errores = [];

    // Validar nombre
    if (!nombre || !/^[a-z][a-z0-9_-]*$/.test(nombre)) {
      errores.push('nombre: debe ser snake_case (letras minúsculas, números, guiones)');
    }

    // Validar module.json
    if (!moduleJson) {
      errores.push('module_json: requerido');
    } else {
      if (!moduleJson.name) errores.push('module_json.name: requerido');
      if (!moduleJson.version) errores.push('module_json.version: requerido');
      if (!moduleJson.description) errores.push('module_json.description: requerido');
      if (!Array.isArray(moduleJson.subscribes)) {
        errores.push('module_json.subscribes: debe ser un array');
      } else {
        for (const s of moduleJson.subscribes) {
          if (!s.event) errores.push('subscribes[].event: requerido');
          if (!s.handler) errores.push('subscribes[].handler: requerido para ' + (s.event || '?'));
        }
      }
    }

    // Validar index.js
    if (!indexJs) {
      errores.push('index_js: requerido');
    } else {
      if (!indexJs.includes('ModuloHibridoReflejo')) {
        errores.push('index_js: debe extender ModuloHibridoReflejo');
      }
      if (!indexJs.includes('extends')) {
        errores.push('index_js: debe tener class ... extends ModuloHibridoReflejo');
      }
      // Verificar que los handlers declarados existen como métodos
      if (moduleJson && Array.isArray(moduleJson.subscribes)) {
        for (const s of moduleJson.subscribes) {
          if (s.handler && !indexJs.includes(s.handler)) {
            errores.push('index_js: falta el handler ' + s.handler + ' declarado en subscribes');
          }
        }
      }
    }

    // Validar colisión
    const targetDir = path.join(MODULES_DIR, nombre);
    if (fs.existsSync(targetDir)) {
      errores.push('conflicto: ya existe modules/' + nombre + '/');
    }

    return errores;
  }

  // ── Tools ──

  async toolProducir(params) {
    if (!this._habilitado) {
      return { status: 403, data: {
        error: 'FORBIDDEN',
        message: 'Interruptor ' + INTERRUPTOR_ID + ' está OFF. Actívalo en el panel para autorizar.'
      }};
    }

    const { nombre, module_json, index_js, test_js } = params;
    const errores = this._validarDiseno(nombre, module_json, index_js);

    if (errores.length > 0) {
      this._publicarEvento('productor.modulo.rechazado', { nombre, errores });
      return { status: 400, data: { error: 'VALIDATION_ERROR', errores }};
    }

    try {
      const targetDir = path.join(MODULES_DIR, nombre);
      fs.mkdirSync(targetDir, { recursive: true });

      // Escribir module.json
      fs.writeFileSync(
        path.join(targetDir, 'module.json'),
        JSON.stringify(module_json, null, 2) + '\n',
        'utf-8'
      );

      // Escribir index.js
      if (index_js) {
        fs.writeFileSync(path.join(targetDir, 'index.js'), index_js, 'utf-8');
      }

      // Escribir test si existe
      let files = ['module.json', 'index.js'];
      if (test_js) {
        const testDir = path.resolve(__dirname, '../../tests/unit');
        fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(
          path.join(testDir, nombre + '__principal.test.js'),
          test_js, 'utf-8'
        );
        files.push('tests/unit/' + nombre + '__principal.test.js');
      }

      this._publicarEvento('productor.modulo.producido', { nombre, path: 'modules/' + nombre + '/', files });

      return { status: 201, data: {
        ok: true,
        nombre,
        path: 'modules/' + nombre + '/',
        files
      }};

    } catch (e) {
      return { status: 500, data: {
        error: 'UNKNOWN_ERROR',
        message: e.message
      }};
    }
  }

  async toolValidar(params) {
    const { nombre, module_json, index_js } = params;
    const errores = this._validarDiseno(nombre, module_json, index_js);

    if (errores.length > 0) {
      return { status: 400, data: { error: 'VALIDATION_ERROR', errores }};
    }
    return { status: 200, data: { ok: true, message: 'Diseño válido' }};
  }
}

module.exports = ProductorModulosReflejo;
