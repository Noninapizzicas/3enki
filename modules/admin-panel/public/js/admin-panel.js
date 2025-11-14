/**
 * Event Core Admin Panel - Frontend Logic
 */
class AdminPanel {
  constructor() {
    this.baseUrl = '/modules/admin-panel/api';
    this.currentTab = 'modules';
    this.data = {
      modules: [],
      plugins: [],
      agents: [],
      prompts: []
    };

    this.init();
  }

  async init() {
    console.log('Admin Panel initializing...');

    // Load initial data
    await this.loadDashboardData();

    // Update timestamp
    this.updateTimestamp();
    setInterval(() => this.updateTimestamp(), 1000);

    console.log('Admin Panel initialized');
  }

  /**
   * Load all dashboard data
   */
  async loadDashboardData() {
    try {
      const response = await fetch(`${this.baseUrl}/dashboard`);
      const data = await response.json();

      // Update summary stats
      document.getElementById('total-modules').textContent = data.summary.total_modules;
      document.getElementById('total-plugins').textContent = data.summary.total_plugins;
      document.getElementById('active-agents').textContent = data.summary.active_agents;
      document.getElementById('total-prompts').textContent = data.summary.total_prompts;

      // Update data cache
      this.data.modules = data.modules;
      this.data.plugins = data.plugins;
      this.data.agents = data.agents;
      this.data.prompts = data.prompts;

      // Render current tab
      this.renderCurrentTab();
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');

    this.currentTab = tabName;
    this.renderCurrentTab();
  }

  /**
   * Render current tab content
   */
  renderCurrentTab() {
    switch (this.currentTab) {
      case 'modules':
        this.renderModules();
        break;
      case 'plugins':
        this.renderPlugins();
        break;
      case 'agents':
        this.renderAgents();
        break;
      case 'prompts':
        this.renderPrompts();
        break;
    }
  }

  /**
   * Render modules list
   */
  renderModules() {
    const container = document.getElementById('modules-container');

    if (this.data.modules.length === 0) {
      container.innerHTML = '<div class="loading">No modules loaded</div>';
      return;
    }

    container.innerHTML = this.data.modules.map(module => `
      <div class="card">
        <div class="card-header">
          <div class="card-title">${module.name}</div>
          <span class="card-badge badge-success">Loaded</span>
        </div>
        <div class="card-body">
          <div class="card-info">
            <div class="card-info-item">
              <span class="card-info-label">Version</span>
              <span class="card-info-value">${module.version || '1.0.0'}</span>
            </div>
            <div class="card-info-item">
              <span class="card-info-label">APIs</span>
              <span class="card-info-value">${module.apis?.length || 0}</span>
            </div>
            <div class="card-info-item">
              <span class="card-info-label">Path</span>
              <span class="card-info-value">/modules/${module.name}</span>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Render plugins list
   */
  renderPlugins() {
    const container = document.getElementById('plugins-container');

    if (this.data.plugins.length === 0) {
      container.innerHTML = '<div class="loading">No plugins available</div>';
      return;
    }

    container.innerHTML = this.data.plugins.map(plugin => `
      <div class="card">
        <div class="card-header">
          <div class="card-title">${plugin.metadata?.name || plugin.name}</div>
          <span class="card-badge badge-success">Active</span>
        </div>
        <div class="card-body">
          <div class="card-info">
            <div class="card-info-item">
              <span class="card-info-label">Version</span>
              <span class="card-info-value">${plugin.metadata?.version || '1.0.0'}</span>
            </div>
            <div class="card-info-item">
              <span class="card-info-label">Functions</span>
              <span class="card-info-value">${Object.keys(plugin.functions || {}).length}</span>
            </div>
            <div class="card-info-item">
              <span class="card-info-label">Auth Type</span>
              <span class="card-info-value">${plugin.metadata?.auth_type || 'none'}</span>
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-primary" onclick="adminPanel.viewPluginDetails('${plugin.metadata?.name || plugin.name}')">View Details</button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Render agents list
   */
  renderAgents() {
    const container = document.getElementById('agents-container');

    if (this.data.agents.length === 0) {
      container.innerHTML = '<div class="loading">No agents configured. Click "Create Agent" to add one.</div>';
      return;
    }

    container.innerHTML = this.data.agents.map(agent => {
      const statusBadge = agent.status === 'active' ? 'badge-success' : 'badge-pending';
      const statusText = agent.status === 'active' ? 'Active' : 'Inactive';

      return `
        <div class="card">
          <div class="card-header">
            <div class="card-title">${agent.name}</div>
            <span class="card-badge ${statusBadge}">${statusText}</span>
          </div>
          <div class="card-body">
            <div class="card-info">
              <div class="card-info-item">
                <span class="card-info-label">Provider</span>
                <span class="card-info-value">${agent.provider}</span>
              </div>
              <div class="card-info-item">
                <span class="card-info-label">Subscribes</span>
                <span class="card-info-value">${agent.subscribes?.join(', ') || 'none'}</span>
              </div>
              <div class="card-info-item">
                <span class="card-info-label">ID</span>
                <span class="card-info-value">${agent.id}</span>
              </div>
            </div>
          </div>
          <div class="card-actions">
            <button class="btn-primary" onclick="adminPanel.toggleAgent('${agent.id}')">
              ${agent.status === 'active' ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn-error" onclick="adminPanel.deleteAgent('${agent.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render prompts list
   */
  renderPrompts() {
    const container = document.getElementById('prompts-container');

    if (this.data.prompts.length === 0) {
      container.innerHTML = '<div class="loading">No prompts available. Click "Create Prompt" to add one.</div>';
      return;
    }

    container.innerHTML = this.data.prompts.map(prompt => `
      <div class="card">
        <div class="card-header">
          <div class="card-title">${prompt.name}</div>
          <span class="card-badge badge-info">v${prompt.version}</span>
        </div>
        <div class="card-body">
          <div class="card-info">
            <div class="card-info-item">
              <span class="card-info-label">Category</span>
              <span class="card-info-value">${prompt.category || 'general'}</span>
            </div>
            <div class="card-info-item">
              <span class="card-info-label">Variables</span>
              <span class="card-info-value">${prompt.variables?.length || 0}</span>
            </div>
            <div class="card-info-item">
              <span class="card-info-label">Updated</span>
              <span class="card-info-value">${this.formatDate(prompt.updated_at)}</span>
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-primary" onclick="adminPanel.viewPrompt('${prompt.name}')">View</button>
          <button class="btn-secondary" onclick="adminPanel.editPrompt('${prompt.name}')">Edit</button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Refresh modules data
   */
  async refreshModules() {
    await this.loadDashboardData();
  }

  /**
   * Refresh plugins data
   */
  async refreshPlugins() {
    await this.loadDashboardData();
  }

  /**
   * Refresh agents data
   */
  async refreshAgents() {
    await this.loadDashboardData();
  }

  /**
   * Refresh prompts data
   */
  async refreshPrompts() {
    await this.loadDashboardData();
  }

  /**
   * View plugin details
   */
  viewPluginDetails(pluginName) {
    const plugin = this.data.plugins.find(p => (p.metadata?.name || p.name) === pluginName);
    if (!plugin) return;

    const functions = Object.entries(plugin.functions || {}).map(([name, func]) => {
      return `
        <div style="margin-bottom: 12px; padding: 12px; background: #0F1216; border-radius: 8px;">
          <strong>${name}</strong><br>
          <small style="color: #9ca3af;">${func.method} ${func.endpoint}</small><br>
          <small style="color: #9ca3af;">${func.description || ''}</small>
        </div>
      `;
    }).join('');

    alert(`Plugin: ${pluginName}\n\nFunctions:\n${Object.keys(plugin.functions || {}).join(', ')}`);
  }

  /**
   * Show create agent modal
   */
  showCreateAgentModal() {
    document.getElementById('create-agent-modal').classList.add('active');
  }

  /**
   * Show create prompt modal
   */
  showCreatePromptModal() {
    document.getElementById('create-prompt-modal').classList.add('active');
  }

  /**
   * Close modal
   */
  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  /**
   * Create agent
   */
  async createAgent(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const subscribes = formData.get('subscribes').split(',').map(s => s.trim()).filter(s => s);

    const agentData = {
      name: formData.get('name'),
      provider: formData.get('provider'),
      subscribes: subscribes
    };

    try {
      const response = await fetch(`${this.baseUrl}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentData)
      });

      if (response.ok) {
        this.closeModal('create-agent-modal');
        event.target.reset();
        await this.refreshAgents();
        alert('Agent created successfully!');
      } else {
        alert('Failed to create agent');
      }
    } catch (error) {
      console.error('Error creating agent:', error);
      alert('Error creating agent');
    }
  }

  /**
   * Toggle agent status
   */
  async toggleAgent(agentId) {
    const agent = this.data.agents.find(a => a.id === agentId);
    if (!agent) return;

    // TODO: Implement actual toggle
    agent.status = agent.status === 'active' ? 'inactive' : 'active';
    this.renderAgents();
  }

  /**
   * Delete agent
   */
  async deleteAgent(agentId) {
    if (!confirm('Are you sure you want to delete this agent?')) return;

    try {
      const response = await fetch(`${this.baseUrl}/agents/${agentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await this.refreshAgents();
        alert('Agent deleted successfully!');
      } else {
        alert('Failed to delete agent');
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert('Error deleting agent');
    }
  }

  /**
   * Create prompt
   */
  async createPrompt(event) {
    event.preventDefault();

    const formData = new FormData(event.target);

    const promptData = {
      name: formData.get('name'),
      version: formData.get('version'),
      content: formData.get('content'),
      category: 'user-defined'
    };

    try {
      const response = await fetch(`${this.baseUrl}/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptData)
      });

      if (response.ok) {
        this.closeModal('create-prompt-modal');
        event.target.reset();
        await this.refreshPrompts();
        alert('Prompt created successfully!');
      } else {
        alert('Failed to create prompt');
      }
    } catch (error) {
      console.error('Error creating prompt:', error);
      alert('Error creating prompt');
    }
  }

  /**
   * View prompt
   */
  async viewPrompt(promptName) {
    try {
      const response = await fetch(`${this.baseUrl}/prompts/${promptName}`);
      const prompt = await response.json();

      alert(`Prompt: ${prompt.name}\nVersion: ${prompt.version}\n\nContent:\n${prompt.content}`);
    } catch (error) {
      console.error('Error viewing prompt:', error);
      alert('Error viewing prompt');
    }
  }

  /**
   * Edit prompt
   */
  editPrompt(promptName) {
    alert(`Edit functionality for "${promptName}" coming soon!`);
  }

  /**
   * Update timestamp
   */
  updateTimestamp() {
    const now = new Date();
    const formatted = now.toLocaleString();
    document.getElementById('last-updated').textContent = formatted;
  }

  /**
   * Format date
   */
  formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }
}

// Initialize admin panel
const adminPanel = new AdminPanel();
