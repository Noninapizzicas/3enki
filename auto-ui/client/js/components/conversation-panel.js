/**
 * ConversationPanel Component
 * Panel de conversación completo con soporte para chat AI, markdown, streaming
 * @version 1.0.0
 */

class ConversationPanel {
  constructor(element, config = {}) {
    this.element = element;
    this.config = { ...this.parseConfig(), ...config };
    this.messages = [];
    this.isTyping = false;
    this.eventSource = null;
    this.mqttClient = null;

    this.init();
  }

  parseConfig() {
    const config = {};

    config.variant = this.element.getAttribute('data-variant') || 'ai-chat';
    config.size = this.element.getAttribute('data-size') || 'md';
    config.conversationId = this.element.getAttribute('data-conversation-id');
    config.endpoint = this.element.getAttribute('data-endpoint');
    config.streamingEndpoint = this.element.getAttribute('data-streaming-endpoint');
    config.enableMarkdown = this.element.getAttribute('data-enable-markdown') !== 'false';
    config.enableAttachments = this.element.getAttribute('data-enable-attachments') === 'true';
    config.enableVoice = this.element.getAttribute('data-enable-voice') === 'true';
    config.placeholder = this.element.getAttribute('data-placeholder') || 'Escribe un mensaje...';
    config.sendIcon = this.element.getAttribute('data-send-icon') || '🚀';
    config.aiProvider = this.element.getAttribute('data-ai-provider') || 'deepseek';
    config.showTypingIndicator = this.element.getAttribute('data-show-typing-indicator') !== 'false';
    config.maxMessageLength = parseInt(this.element.getAttribute('data-max-message-length')) || 4000;
    config.autoScroll = this.element.getAttribute('data-auto-scroll') !== 'false';
    config.showTimestamps = this.element.getAttribute('data-show-timestamps') !== 'false';
    config.showAvatars = this.element.getAttribute('data-show-avatars') !== 'false';
    config.enableCommands = this.element.getAttribute('data-enable-commands') !== 'false';
    config.readOnly = this.element.getAttribute('data-read-only') === 'true';
    config.loadOnInit = this.element.getAttribute('data-load-on-init') !== 'false';
    config.mqttEnabled = this.element.getAttribute('data-mqtt-enabled') !== 'false';
    config.disabled = this.element.hasAttribute('disabled');

    const rolesAttr = this.element.getAttribute('data-message-roles');
    config.messageRoles = rolesAttr ? JSON.parse(rolesAttr) : ['user', 'assistant', 'system'];

    const topicsAttr = this.element.getAttribute('data-mqtt-topics');
    config.mqttTopics = topicsAttr ? JSON.parse(topicsAttr) : ['chat.message.sent', 'chat.message.ai.received'];

    return config;
  }

  init() {
    this.render();
    this.attachEventListeners();

    if (this.config.loadOnInit) {
      this.loadMessages();
    }

    if (this.config.mqttEnabled) {
      this.initMQTT();
    }
  }

  render() {
    this.element.classList.add('conversation-panel');
    this.element.classList.add(`conversation-panel--${this.config.variant}`);
    this.element.classList.add(`conversation-panel--${this.config.size}`);
    this.element.setAttribute('role', 'log');
    this.element.setAttribute('aria-label', this.config.ariaLabel || 'Panel de conversación');
    this.element.setAttribute('aria-live', 'polite');

    this.element.innerHTML = `
      <div class="conversation-panel__messages" role="log" aria-live="polite">
        <!-- Messages will be rendered here -->
      </div>

      ${this.config.showTypingIndicator ? `
        <div class="conversation-panel__typing" style="display: none;">
          <div class="conversation-panel__typing-avatar">🤖</div>
          <div class="conversation-panel__typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
      ` : ''}

      ${!this.config.readOnly ? `
        <div class="conversation-panel__input-wrapper">
          ${this.config.enableAttachments ? '<button class="conversation-panel__attach-btn" aria-label="Adjuntar archivo">📎</button>' : ''}
          ${this.config.enableVoice ? '<button class="conversation-panel__voice-btn" aria-label="Grabar voz">🎤</button>' : ''}

          <textarea
            class="conversation-panel__input"
            placeholder="${this.config.placeholder}"
            maxlength="${this.config.maxMessageLength}"
            rows="1"
            ${this.config.disabled ? 'disabled' : ''}
            aria-label="Campo de mensaje"
          ></textarea>

          <div class="conversation-panel__char-count">
            <span class="conversation-panel__char-current">0</span>/<span class="conversation-panel__char-max">${this.config.maxMessageLength}</span>
          </div>

          <button class="conversation-panel__send-btn" aria-label="Enviar mensaje" ${this.config.disabled ? 'disabled' : ''}>
            ${this.config.sendIcon}
          </button>
        </div>
      ` : ''}
    `;

    this.messagesElement = this.element.querySelector('.conversation-panel__messages');
    this.typingElement = this.element.querySelector('.conversation-panel__typing');

    if (!this.config.readOnly) {
      this.inputElement = this.element.querySelector('.conversation-panel__input');
      this.sendBtn = this.element.querySelector('.conversation-panel__send-btn');
      this.charCurrent = this.element.querySelector('.conversation-panel__char-current');
      this.attachBtn = this.element.querySelector('.conversation-panel__attach-btn');
      this.voiceBtn = this.element.querySelector('.conversation-panel__voice-btn');
    }
  }

  attachEventListeners() {
    if (this.config.readOnly) return;

    // Send button
    this.sendBtn.addEventListener('click', () => this.sendMessage());

    // Input auto-resize and char count
    this.inputElement.addEventListener('input', (e) => {
      this.autoResizeTextarea();
      this.updateCharCount();
    });

    // Enter to send (Shift+Enter for new line)
    this.inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Attach button
    if (this.attachBtn) {
      this.attachBtn.addEventListener('click', () => this.attachFile());
    }

    // Voice button
    if (this.voiceBtn) {
      this.voiceBtn.addEventListener('click', () => this.startVoiceRecording());
    }
  }

  async loadMessages() {
    if (!this.config.endpoint) return;

    try {
      const response = await fetch(this.config.endpoint);
      const data = await response.json();

      this.messages = data.messages || data || [];
      this.renderMessages();
      this.dispatchEvent('messageLoaded', { messages: this.messages });
    } catch (error) {
      console.error('Error loading messages:', error);
      this.dispatchEvent('error', { error, action: 'loadMessages' });
    }
  }

  renderMessages() {
    this.messagesElement.innerHTML = '';

    this.messages.forEach((message, index) => {
      const messageEl = this.createMessageElement(message, index);
      this.messagesElement.appendChild(messageEl);
    });

    if (this.config.autoScroll) {
      this.scrollToBottom();
    }
  }

  createMessageElement(message, index) {
    const messageEl = document.createElement('div');
    messageEl.className = `conversation-panel__message conversation-panel__message--${message.role}`;
    messageEl.setAttribute('data-message-id', message.id || index);
    messageEl.setAttribute('role', 'article');

    const avatar = this.getAvatarForRole(message.role);

    messageEl.innerHTML = `
      ${this.config.showAvatars ? `<div class="conversation-panel__message-avatar">${avatar}</div>` : ''}

      <div class="conversation-panel__message-content">
        ${this.config.showTimestamps && message.created_at ? `
          <div class="conversation-panel__message-timestamp" title="${new Date(message.created_at).toLocaleString()}">
            ${this.formatTimestamp(message.created_at)}
          </div>
        ` : ''}

        <div class="conversation-panel__message-text">
          ${this.config.enableMarkdown ? this.renderMarkdown(message.content) : this.escapeHtml(message.content)}
        </div>

        <div class="conversation-panel__message-actions">
          <button class="conversation-panel__action-btn" data-action="copy" title="Copiar">📋</button>
          ${message.role === 'assistant' ? '<button class="conversation-panel__action-btn" data-action="regenerate" title="Regenerar">🔄</button>' : ''}
          ${message.role === 'user' ? '<button class="conversation-panel__action-btn" data-action="edit" title="Editar">✏️</button>' : ''}
        </div>
      </div>
    `;

    // Attach action listeners
    const actionButtons = messageEl.querySelectorAll('.conversation-panel__action-btn');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.getAttribute('data-action');
        this.handleMessageAction(action, message, index);
      });
    });

    return messageEl;
  }

  async sendMessage() {
    const content = this.inputElement.value.trim();

    if (!content || this.config.disabled) return;

    // Check for commands
    if (this.config.enableCommands && content.startsWith('/')) {
      this.executeCommand(content);
      return;
    }

    // Create user message
    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: content,
      created_at: new Date().toISOString()
    };

    // Add to messages
    this.messages.push(userMessage);
    this.renderMessages();

    // Clear input
    this.inputElement.value = '';
    this.updateCharCount();
    this.autoResizeTextarea();

    this.dispatchEvent('messageSent', { message: userMessage });

    // Send to backend
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content,
          provider: this.config.aiProvider
        })
      });

      const data = await response.json();

      // Show typing indicator
      if (this.config.showTypingIndicator) {
        this.showTypingIndicator();
      }

      // Handle streaming if available
      if (this.config.streamingEndpoint) {
        this.handleStreaming(data.message_id || data.id);
      } else {
        // Add AI response
        if (data.ai_message || data.message) {
          const aiMessage = data.ai_message || data.message;
          this.addMessage(aiMessage);
        }
      }

    } catch (error) {
      console.error('Error sending message:', error);
      this.dispatchEvent('error', { error, action: 'sendMessage' });
      this.hideTypingIndicator();
    }
  }

  handleStreaming(messageId) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const url = `${this.config.streamingEndpoint}?message_id=${messageId}`;
    this.eventSource = new EventSource(url);

    let streamedContent = '';
    let streamMessageId = null;

    this.dispatchEvent('streamingStart', { messageId });

    this.eventSource.addEventListener('message', (e) => {
      const data = JSON.parse(e.data);

      if (data.done) {
        this.eventSource.close();
        this.hideTypingIndicator();
        this.dispatchEvent('streamingEnd', { messageId, content: streamedContent });
        return;
      }

      if (data.chunk) {
        streamedContent += data.chunk;
        streamMessageId = data.message_id || streamMessageId;

        // Update or create streaming message
        this.updateStreamingMessage(streamMessageId, streamedContent);
        this.dispatchEvent('streamingChunk', { chunk: data.chunk, content: streamedContent });
      }
    });

    this.eventSource.addEventListener('error', (error) => {
      console.error('Streaming error:', error);
      this.eventSource.close();
      this.hideTypingIndicator();
      this.dispatchEvent('error', { error, action: 'streaming' });
    });
  }

  updateStreamingMessage(messageId, content) {
    // Find existing streaming message or create new
    let existingIndex = this.messages.findIndex(m => m.id === messageId);

    if (existingIndex === -1) {
      // Create new message
      this.messages.push({
        id: messageId,
        role: 'assistant',
        content: content,
        created_at: new Date().toISOString(),
        streaming: true
      });
    } else {
      // Update existing
      this.messages[existingIndex].content = content;
    }

    this.renderMessages();
  }

  addMessage(message) {
    this.messages.push(message);
    const messageEl = this.createMessageElement(message, this.messages.length - 1);
    this.messagesElement.appendChild(messageEl);

    if (this.config.autoScroll) {
      this.scrollToBottom();
    }

    this.hideTypingIndicator();
    this.dispatchEvent('messageReceived', { message });
  }

  executeCommand(command) {
    const [cmd, ...args] = command.split(' ');

    switch (cmd) {
      case '/help':
        this.showHelp();
        break;
      case '/clear':
        this.clearMessages();
        break;
      case '/export':
        this.exportConversation();
        break;
      case '/regenerate':
        this.regenerateLastResponse();
        break;
      case '/model':
        if (args[0]) {
          this.changeModel(args[0]);
        }
        break;
      default:
        this.addSystemMessage(`Comando desconocido: ${cmd}. Usa /help para ver comandos disponibles.`);
    }

    this.inputElement.value = '';
    this.dispatchEvent('commandExecuted', { command: cmd, args });
  }

  showHelp() {
    const helpText = `
**Comandos disponibles:**
- \`/help\` - Muestra esta ayuda
- \`/clear\` - Limpia todos los mensajes
- \`/export\` - Exporta conversación en markdown
- \`/regenerate\` - Regenera última respuesta de IA
- \`/model <provider>\` - Cambia modelo (deepseek, openai, claude, ollama)
    `;
    this.addSystemMessage(helpText);
  }

  clearMessages() {
    if (confirm('¿Estás seguro de que quieres limpiar todos los mensajes?')) {
      this.messages = [];
      this.renderMessages();
    }
  }

  exportConversation() {
    let markdown = `# Conversación - ${new Date().toLocaleDateString()}\n\n`;

    this.messages.forEach(msg => {
      const role = msg.role === 'user' ? '👤 Usuario' : '🤖 Asistente';
      markdown += `## ${role}\n${msg.content}\n\n`;
    });

    // Download
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);

    this.addSystemMessage('Conversación exportada exitosamente.');
  }

  regenerateLastResponse() {
    const lastAssistantIndex = this.messages.findLastIndex(m => m.role === 'assistant');
    if (lastAssistantIndex !== -1) {
      this.messages.splice(lastAssistantIndex, 1);
      this.renderMessages();
      this.sendMessage();
    }
  }

  changeModel(provider) {
    const validProviders = ['deepseek', 'openai', 'claude', 'ollama'];
    if (validProviders.includes(provider)) {
      this.config.aiProvider = provider;
      this.addSystemMessage(`Modelo cambiado a: ${provider}`);
    } else {
      this.addSystemMessage(`Proveedor inválido. Usa: ${validProviders.join(', ')}`);
    }
  }

  addSystemMessage(content) {
    this.addMessage({
      id: `sys_${Date.now()}`,
      role: 'system',
      content: content,
      created_at: new Date().toISOString()
    });
  }

  handleMessageAction(action, message, index) {
    switch (action) {
      case 'copy':
        navigator.clipboard.writeText(message.content);
        this.showToast('Mensaje copiado');
        break;
      case 'regenerate':
        this.messages.splice(index, 1);
        this.renderMessages();
        this.sendMessage();
        break;
      case 'edit':
        this.inputElement.value = message.content;
        this.inputElement.focus();
        this.messages.splice(index, 1);
        this.renderMessages();
        break;
    }
  }

  showTypingIndicator() {
    if (this.typingElement) {
      this.typingElement.style.display = 'flex';
      this.isTyping = true;
      this.scrollToBottom();
      this.dispatchEvent('aiTypingStart');
    }
  }

  hideTypingIndicator() {
    if (this.typingElement) {
      this.typingElement.style.display = 'none';
      this.isTyping = false;
      this.dispatchEvent('aiTypingEnd');
    }
  }

  renderMarkdown(text) {
    // Simple markdown rendering (can be enhanced with a library like marked.js)
    let html = this.escapeHtml(text);

    // Code blocks
    html = html.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getAvatarForRole(role) {
    const avatars = {
      user: '👤',
      assistant: '🤖',
      system: '⚙️'
    };
    return avatars[role] || '💬';
  }

  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    if (hours < 24) return `hace ${hours} h`;
    if (days < 7) return `hace ${days} d`;

    return date.toLocaleDateString();
  }

  autoResizeTextarea() {
    this.inputElement.style.height = 'auto';
    this.inputElement.style.height = this.inputElement.scrollHeight + 'px';
  }

  updateCharCount() {
    const length = this.inputElement.value.length;
    this.charCurrent.textContent = length;

    if (length > this.config.maxMessageLength * 0.9) {
      this.charCurrent.classList.add('conversation-panel__char-warning');
    } else {
      this.charCurrent.classList.remove('conversation-panel__char-warning');
    }
  }

  scrollToBottom() {
    this.messagesElement.scrollTop = this.messagesElement.scrollHeight;
  }

  attachFile() {
    // TODO: Integrate with FileDropZone component
    this.dispatchEvent('attachmentAdded');
  }

  startVoiceRecording() {
    // TODO: Implement Web Speech API
    this.dispatchEvent('voiceRecordStart');
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'conversation-panel__toast';
    toast.textContent = message;
    this.element.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

  initMQTT() {
    // Subscribe to MQTT topics for real-time updates
    if (typeof window.mqttClient !== 'undefined') {
      this.config.mqttTopics.forEach(topic => {
        window.mqttClient.subscribe(topic);
      });

      window.mqttClient.on('message', (topic, payload) => {
        if (this.config.mqttTopics.includes(topic)) {
          const data = JSON.parse(payload.toString());

          if (data.conversation_id === this.config.conversationId) {
            this.handleMQTTMessage(topic, data);
          }
        }
      });
    }
  }

  handleMQTTMessage(topic, data) {
    if (topic.includes('message.sent') || topic.includes('message.received')) {
      if (data.message) {
        this.addMessage(data.message);
      }
    }
  }

  dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(`conversationpanel:${eventName}`, {
      detail,
      bubbles: true
    });
    this.element.dispatchEvent(event);
  }

  // Public methods
  send(content) {
    this.inputElement.value = content;
    this.sendMessage();
  }

  clear() {
    this.clearMessages();
  }

  enable() {
    this.config.disabled = false;
    if (this.inputElement) this.inputElement.disabled = false;
    if (this.sendBtn) this.sendBtn.disabled = false;
  }

  disable() {
    this.config.disabled = true;
    if (this.inputElement) this.inputElement.disabled = true;
    if (this.sendBtn) this.sendBtn.disabled = true;
  }

  getMessages() {
    return this.messages;
  }

  destroy() {
    if (this.eventSource) {
      this.eventSource.close();
    }
  }
}

// Auto-initialize
if (typeof window !== 'undefined') {
  window.AutoUI = window.AutoUI || {};
  window.AutoUI.components = window.AutoUI.components || {};
  window.AutoUI.components['conversation-panel'] = ConversationPanel;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConversationPanels);
  } else {
    initConversationPanels();
  }
}

function initConversationPanels() {
  document.querySelectorAll('[data-component="conversation-panel"]').forEach(element => {
    if (!element.__conversationPanel) {
      element.__conversationPanel = new ConversationPanel(element);
    }
  });
}
