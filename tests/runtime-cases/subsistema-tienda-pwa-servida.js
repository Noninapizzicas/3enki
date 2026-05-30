#!/usr/bin/env node
/**
 * subsistema-tienda-pwa-servida.js — Test de runtime del caso testigo
 * 'vapers_pwa_no_servida_2026_05_29' (subsistema-tienda.contract.json).
 *
 * Verifica que tras activar la feature 'tienda' en un proyecto, la
 * convencion canonica queda en disco:
 *   1. directorio <base_path>/public/tienda/ creado
 *   2. index.html con slug del proyecto sustituido en {{slug}}
 *   3. manifest.json con start_url '/shop/<slug>/'
 *   4. sw.js minimo
 *   5. config/config.json mergea tienda.public_url '/shop/<slug>'
 *
 * No verifica el symlink /opt/enki/public/shop/<slug> directamente —
 * vive fuera del scope del project_id. Asumimos que si verify_after[]
 * del blueprint paso (project-manager lo enforce post-condition),
 * el symlink existe.
 *
 * Crea un proyecto de prueba con name 'TestShop-<timestamp>' (slug
 * derivado 'testshop-<timestamp>'). Limpia al final. Cero side-effects
 * sobre proyectos reales.
 *
 * Uso:
 *   node tests/runtime-cases/subsistema-tienda-pwa-servida.js \
 *     [--broker wss://enki-ai.online/mqtt]
 *
 * Caso testigo: arquitectura/decisiones/_contratos/subsistema-tienda.contract.json
 *   casos_testigo[0] (vapers_pwa_no_servida_2026_05_29).
 */

'use strict';

const mqtt   = require('mqtt');
const crypto = require('crypto');

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}
const BROKER = flag('broker', 'wss://enki-ai.online/mqtt');

const NAME_TS = `TestShop-${Date.now()}`;
const EXPECTED_SLUG = NAME_TS.toLowerCase();

let client;

function uiRequest(domain, action, data, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const reqId = crypto.randomUUID();
    const respTopic = 'ui/response/' + reqId;
    const reqTopic  = `ui/request/${domain}/${action}`;
    let resolved = false;
    const handler = (topic, msg) => {
      if (topic !== respTopic) return;
      try {
        const env = JSON.parse(msg.toString());
        if (!resolved) {
          resolved = true;
          client.removeListener('message', handler);
          resolve(env);
        }
      } catch (_) {}
    };
    client.subscribe(respTopic, () => {
      client.on('message', handler);
      client.publish(reqTopic, JSON.stringify({ request_id: reqId, data }));
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.removeListener('message', handler);
        reject(new Error(`timeout ${reqTopic} (${timeoutMs}ms)`));
      }
    }, timeoutMs);
  });
}

function busRequest(eventType, data, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const reqId = crypto.randomUUID();
    const responseEvent = eventType.endsWith('.request')
      ? eventType.slice(0, -'.request'.length) + '.response'
      : eventType + '.response';
    const respTopic = 'core/+/events/' + responseEvent.replace(/\./g, '/');
    let resolved = false;
    const handler = (topic, msg) => {
      try {
        const env = JSON.parse(msg.toString());
        const d = env.data || {};
        if (d.request_id !== reqId) return;
        if (!resolved) {
          resolved = true;
          client.removeListener('message', handler);
          resolve(d);
        }
      } catch (_) {}
    };
    client.subscribe(respTopic, () => {
      client.on('message', handler);
      const reqTopic = 'core/*/events/' + eventType.replace(/\./g, '/');
      client.publish(reqTopic, JSON.stringify({
        event_id: crypto.randomUUID(),
        event_type: eventType,
        timestamp: new Date().toISOString(),
        source: { core_id: 'test-shop' },
        data: { ...data, request_id: reqId },
        metadata: {}
      }));
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.removeListener('message', handler);
        reject(new Error(`timeout ${eventType} (${timeoutMs}ms)`));
      }
    }, timeoutMs);
  });
}

let failures = [];
function assert(cond, label) {
  if (cond) console.log('  ' + String.fromCharCode(10003) + ' ' + label);
  else { console.log('  ' + String.fromCharCode(10007) + ' ' + label); failures.push(label); }
}

async function main() {
  console.log('=== Test: subsistema-tienda-pwa-servida ===');
  console.log('BROKER:   ', BROKER);
  console.log('PROJECT:  ', NAME_TS, ' (slug esperado:', EXPECTED_SLUG + ')');
  console.log('');

  client = mqtt.connect(BROKER, {
    clientId: 'test-shop-' + Date.now(),
    connectTimeout: 8000,
    reconnectPeriod: 0
  });
  await new Promise((res, rej) => {
    client.on('connect', res);
    client.on('error', rej);
    setTimeout(() => rej(new Error('mqtt connect timeout')), 10000);
  });

  let projectId = null;

  try {
    // ============================================================
    // PASO 1 — Crear proyecto de prueba
    // ============================================================
    console.log('PASO 1: crear proyecto de prueba');
    const created = await uiRequest('project', 'create', {
      name: NAME_TS,
      description: 'Test runtime subsistema-tienda — borrar tras la sesion'
    });
    projectId = created?.data?.project?.id || created?.data?.id;
    assert(!!projectId, `proyecto creado (project_id: ${projectId || 'AUSENTE'})`);
    if (!projectId) {
      console.log('  Response: ' + JSON.stringify(created).slice(0, 400));
      throw new Error('proyecto no creado, abort');
    }
    console.log('');

    // ============================================================
    // PASO 2 — Activar feature 'tienda'
    // ============================================================
    console.log('PASO 2: activar feature tienda');
    const featRes = await uiRequest('project', 'add-features', {
      id: projectId,
      features: ['tienda']
    });
    const applied = featRes?.data?.applied || [];
    assert(applied.includes('tienda'),
      `feature tienda aplicada (applied: ${JSON.stringify(applied)})`);
    if (featRes?.data?.warnings) {
      console.log('  warnings:', JSON.stringify(featRes.data.warnings));
    }
    if (!applied.includes('tienda')) {
      console.log('  Response: ' + JSON.stringify(featRes).slice(0, 400));
    }
    console.log('');

    // ============================================================
    // PASO 3 — Verificar index.html
    // ============================================================
    console.log('PASO 3: verificar public/tienda/index.html');
    const idx = await busRequest('fs.read.request', {
      project_id: projectId,
      path: '/public/tienda/index.html'
    });
    assert(idx && idx.content && idx.content.length > 0,
      `index.html existe (size: ${idx?.content?.length || 0} bytes)`);
    assert(idx && idx.content && idx.content.includes(EXPECTED_SLUG),
      `index.html contiene slug '${EXPECTED_SLUG}' (sustitucion {{slug}} aplicada)`);
    assert(idx && idx.content && !idx.content.includes('{{slug}}'),
      `index.html NO contiene {{slug}} sin sustituir`);
    console.log('');

    // ============================================================
    // PASO 4 — Verificar manifest.json
    // ============================================================
    console.log('PASO 4: verificar public/tienda/manifest.json');
    const mfRaw = await busRequest('fs.read.request', {
      project_id: projectId,
      path: '/public/tienda/manifest.json'
    });
    assert(mfRaw && mfRaw.content, 'manifest.json existe');
    let manifest = null;
    try { manifest = JSON.parse(mfRaw.content); }
    catch (_) { failures.push('manifest.json no es JSON valido'); }
    if (manifest) {
      assert(manifest.name === EXPECTED_SLUG, `manifest.name === '${EXPECTED_SLUG}' (real: '${manifest.name}')`);
      assert(manifest.start_url === `/shop/${EXPECTED_SLUG}/`,
        `manifest.start_url === '/shop/${EXPECTED_SLUG}/' (real: '${manifest.start_url}')`);
      assert(manifest.display === 'standalone', `manifest.display === 'standalone'`);
    }
    console.log('');

    // ============================================================
    // PASO 5 — Verificar sw.js
    // ============================================================
    console.log('PASO 5: verificar public/tienda/sw.js');
    const sw = await busRequest('fs.read.request', {
      project_id: projectId,
      path: '/public/tienda/sw.js'
    });
    assert(sw && sw.content && sw.content.includes('addEventListener'),
      `sw.js existe y contiene addEventListener (size: ${sw?.content?.length || 0} bytes)`);
    console.log('');

    // ============================================================
    // PASO 6 — Verificar config/config.json
    // ============================================================
    console.log('PASO 6: verificar config/config.json (tienda merged)');
    const cfgRaw = await busRequest('fs.read.request', {
      project_id: projectId,
      path: '/config/config.json'
    });
    let config = null;
    try { config = JSON.parse(cfgRaw.content); }
    catch (_) { failures.push('config.json no es JSON valido'); }
    if (config) {
      assert(config.tienda && config.tienda.enabled === true, `config.tienda.enabled === true`);
      assert(config.tienda && config.tienda.slug === EXPECTED_SLUG,
        `config.tienda.slug === '${EXPECTED_SLUG}' (real: '${config.tienda?.slug}')`);
      assert(config.tienda && config.tienda.public_url === `/shop/${EXPECTED_SLUG}`,
        `config.tienda.public_url === '/shop/${EXPECTED_SLUG}' (real: '${config.tienda?.public_url}')`);
      assert(config.tienda && config.tienda.bundle_dir === 'public/tienda',
        `config.tienda.bundle_dir === 'public/tienda'`);
    }
    console.log('');

    // ============================================================
    // RESULTADO
    // ============================================================
    if (failures.length === 0) {
      console.log('=== PASS — caso testigo vapers_pwa_no_servida cerrado ===');
      console.log('La feature tienda crea bundle canonico + config correctos en el proyecto.');
      console.log('Caddy con bloque /shop/* servira el contenido desde /opt/enki/public/shop/<slug>/');
      console.log('(verificacion HTTP queda fuera del scope del bus; depende de symlink + reload Caddy).');
    } else {
      console.log('=== FAIL — caso testigo NO esta cerrado ===');
      for (const f of failures) console.log('  - ' + f);
    }
  } catch (err) {
    console.log('');
    console.log('=== ERROR INESPERADO ===');
    console.log(err && err.message ? err.message : JSON.stringify(err));
    if (err && err.stack) console.log(err.stack);
    failures.push('error: ' + (err.message || 'unknown'));
  } finally {
    // ============================================================
    // CLEANUP — eliminar proyecto de prueba
    // ============================================================
    if (projectId) {
      console.log('');
      console.log('CLEANUP: eliminando proyecto de prueba ' + projectId);
      try {
        await uiRequest('project', 'delete', { id: projectId });
        console.log('  ' + String.fromCharCode(10003) + ' proyecto eliminado');
      } catch (err) {
        console.log('  ' + String.fromCharCode(10007) + ' delete fallo: ' + err.message);
        console.log('  ' + 'MANUAL: borrar /opt/enki/data/projects/' + EXPECTED_SLUG + '/ y entry SQLite');
      }
    }
    client.end();
    process.exit(failures.length === 0 ? 0 : 1);
  }
}

main();
