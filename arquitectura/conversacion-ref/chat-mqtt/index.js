class ChatMqttModule {
  constructor() {
    this.name = 'chat-mqtt';
    this.version = '1.0.0';
    this.logger = null;
    this.mqtt = null;
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.mqtt = context.uiHandler?.mqtt || null;

    this.logger.info('chat-mqtt.loaded', {
      module: this.name,
      mqtt_available: !!this.mqtt
    });
  }

  async onUnload() {
    this.mqtt = null;
    this.logger?.info('chat-mqtt.unloaded', { module: this.name });
  }

  // ==========================================
  // Mensajes del asistente → frontend
  // ==========================================

  onChatAssistantSaved(event) {
    const { conversation_id, message_id, content, source } = event.data || event;
    if (!conversation_id || !content) return;

    this._publish(`conversation/${conversation_id}/message`, {
      id: message_id || null,
      role: 'assistant',
      content,
      source: source || { type: 'unknown' },
      streaming: false,
      timestamp: new Date().toISOString()
    }, { qos: 1 });
  }

  // ==========================================
  // Estado del agente → frontend
  // ==========================================

  onAgentProgress(event) {
    const { conversation_id, message, step } = event.data || event;
    if (!conversation_id) return;

    this._publish(`conversation/${conversation_id}/agent_status`, {
      status: 'working',
      message: message || null,
      step: step || null,
      timestamp: new Date().toISOString()
    }, { qos: 0 });
  }

  onAgentCompleted(event) {
    const { conversation_id } = event.data || event;
    if (!conversation_id) return;

    this._publish(`conversation/${conversation_id}/agent_status`, {
      status: 'idle',
      timestamp: new Date().toISOString()
    }, { qos: 1 });
  }

  onAgentFailed(event) {
    const { conversation_id } = event.data || event;
    if (!conversation_id) return;

    this._publish(`conversation/${conversation_id}/agent_status`, {
      status: 'idle',
      timestamp: new Date().toISOString()
    }, { qos: 1 });
  }

  onAgentQuestion(event) {
    const { conversation_id, question, options } = event.data || event;
    if (!conversation_id || !question) return;

    this._publish(`conversation/${conversation_id}/agent_question`, {
      question,
      options: options || null,
      timestamp: new Date().toISOString()
    }, { qos: 1 });
  }

  // ==========================================
  // Helper
  // ==========================================

  _publish(topic, payload, opts = {}) {
    if (!this.mqtt) {
      this.logger.warn('chat-mqtt.no_client', { topic });
      return;
    }
    this.mqtt.publish(topic, JSON.stringify(payload), opts);
  }
}

module.exports = ChatMqttModule;
