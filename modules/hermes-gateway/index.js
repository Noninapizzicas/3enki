'use strict';

const crypto = require('crypto');

class HermesGateway {
  constructor() {
    this.mqtt = null;
    this.bridge = null;
    this.logger = null;
    this.prefix = 'hermes';
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.prefix = core.config?.modules_config?.['hermes-gateway']?.topic_prefix || 'hermes';

    const mqtt = core.eventBus?.mqtt;
    // isConnected puede no existir en el cliente; si hay object, intentamos
    if (!mqtt || (typeof mqtt.isConnected === 'boolean' && !mqtt.isConnected)) {
      this.logger?.warn?.('hermes-gateway.skip', { reason: 'mqtt not available' });
      return;
    }
    this.mqtt = mqtt;

    const bridge = core.moduleLoader?.loadedModules?.get?.('hermes-bridge');
    if (!bridge) {
      this.logger?.warn('hermes-gateway.skip', { reason: 'hermes-bridge not loaded' });
      return;
    }
    this.bridge = bridge;

    await mqtt.subscribe(`${this.prefix}/tool/+`);
    await mqtt.subscribe(`${this.prefix}/catalog`);
    mqtt.on('message', (topic, raw) => this._onMessage(topic, raw));

    this.logger?.info('hermes-gateway.ready', {
      tool_topic: `${this.prefix}/tool/+`,
      catalog_topic: `${this.prefix}/catalog`,
      response: `${this.prefix}/response/{request_id}`
    });
  }

  async _onMessage(topic, raw) {
    if (topic === `${this.prefix}/catalog`) {
      return this._onCatalog(raw);
    }

    if (!topic.startsWith(`${this.prefix}/tool/`)) return;

    const toolName = topic.slice(`${this.prefix}/tool/`.length);
    if (!toolName || toolName === 'response') return;

    let payload;
    try {
      const str = typeof raw === 'string' ? raw : raw.toString();
      payload = JSON.parse(str);
    } catch {
      return;
    }

    const requestId = payload.request_id || crypto.randomUUID();
    const responseTopic = `${this.prefix}/response/${requestId}`;

    try {
      const result = await this.bridge._dispatch(
        toolName,
        payload.args || {},
        payload.context || {}
      );
      this.mqtt.publish(responseTopic, {
        request_id: requestId,
        status: 'success',
        result
      }, { qos: 1 });
    } catch (err) {
      this.mqtt.publish(responseTopic, {
        request_id: requestId,
        status: 'error',
        error: {
          code: err.code || 'UNKNOWN_ERROR',
          message: err.message
        }
      }, { qos: 1 });
    }
  }

  async _onCatalog(raw) {
    let payload;
    try {
      const str = typeof raw === 'string' ? raw : raw.toString();
      payload = JSON.parse(str);
    } catch {
      return;
    }

    const requestId = payload.request_id || crypto.randomUUID();
    const responseTopic = `${this.prefix}/catalog/response/${requestId}`;

    try {
      const tools = this.bridge._buildCatalog();
      this.mqtt.publish(responseTopic, {
        request_id: requestId,
        status: 'success',
        result: tools
      }, { qos: 1 });
    } catch (err) {
      this.mqtt.publish(responseTopic, {
        request_id: requestId,
        status: 'error',
        error: {
          code: 'CATALOG_ERROR',
          message: err.message
        }
      }, { qos: 1 });
    }
  }

  async onUnload() {
    if (this.mqtt) {
      try { await this.mqtt.unsubscribe(`${this.prefix}/tool/+`); } catch {}
      try { await this.mqtt.unsubscribe(`${this.prefix}/catalog`); } catch {}
    }
    this.mqtt = null;
    this.bridge = null;
  }
}

module.exports = HermesGateway;
