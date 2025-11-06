/**
 * Event Core Dashboard - Frontend Logic
 */

class Dashboard {
    constructor() {
        this.cores = [];
        this.logsSse = null;
        this.eventsSse = null;
        this.autoScroll = true;
        this.maxLogs = 500;
        this.maxEvents = 100;

        this.init();
    }

    /**
     * Initialize dashboard
     */
    init() {
        console.log('Initializing Event Core Dashboard...');

        // Initial data fetch
        this.refreshCores();

        // Setup SSE connections
        this.connectLogsStream();
        this.connectEventsStream();

        // Auto-refresh cores every 10 seconds
        setInterval(() => this.refreshCores(), 10000);

        // Setup auto-scroll toggle
        document.getElementById('auto-scroll')?.addEventListener('change', (e) => {
            this.autoScroll = e.target.checked;
        });

        // Update last updated timestamp
        this.updateTimestamp();
        setInterval(() => this.updateTimestamp(), 1000);
    }

    /**
     * Refresh cores list
     */
    async refreshCores() {
        try {
            const response = await fetch('/modules/dashboard/api/cores');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.cores = data.cores || [];

            this.renderCores();
            this.updateStats();

            // Update status indicator
            this.setStatus('ok', 'Connected');
        } catch (error) {
            console.error('Failed to fetch cores:', error);
            this.setStatus('error', 'Connection Error');
        }
    }

    /**
     * Render cores grid
     */
    renderCores() {
        const container = document.getElementById('cores-grid');
        if (!container) return;

        if (this.cores.length === 0) {
            container.innerHTML = '<div class="loading">No cores discovered yet. Waiting for heartbeats...</div>';
            return;
        }

        container.innerHTML = this.cores.map(core => this.renderCoreCard(core)).join('');
    }

    /**
     * Render single core card
     */
    renderCoreCard(core) {
        const statusClass = core.is_alive ? 'alive' : 'dead';
        const statusText = core.is_alive ? 'Online' : 'Offline';

        return `
            <div class="core-card">
                <div class="core-card-header">
                    <div class="core-id">${this.escapeHtml(core.id)}</div>
                    <div class="core-status ${statusClass}">${statusText}</div>
                </div>
                <div class="core-details">
                    <div class="core-detail-row">
                        <span class="core-detail-label">Version</span>
                        <span class="core-detail-value">${this.escapeHtml(core.version)}</span>
                    </div>
                    <div class="core-detail-row">
                        <span class="core-detail-label">Host</span>
                        <span class="core-detail-value">${this.escapeHtml(core.host)}:${core.port}</span>
                    </div>
                    <div class="core-detail-row">
                        <span class="core-detail-label">Uptime</span>
                        <span class="core-detail-value">${this.formatUptime(core.uptime_ms)}</span>
                    </div>
                    <div class="core-detail-row">
                        <span class="core-detail-label">Heartbeats</span>
                        <span class="core-detail-value">${core.heartbeat_count}</span>
                    </div>
                </div>
                ${this.renderModules(core.modules)}
            </div>
        `;
    }

    /**
     * Render modules list
     */
    renderModules(modules) {
        if (!modules || modules.length === 0) {
            return '';
        }

        return `
            <div class="core-modules">
                <div class="core-modules-title">Modules (${modules.length})</div>
                <div class="core-modules-list">
                    ${modules.map(m => `<span class="module-badge">${this.escapeHtml(m)}</span>`).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Update header stats
     */
    updateStats() {
        const totalCores = this.cores.length;
        const aliveCores = this.cores.filter(c => c.is_alive).length;

        document.getElementById('total-cores').textContent = `${aliveCores}/${totalCores}`;
    }

    /**
     * Connect to logs SSE stream
     */
    connectLogsStream() {
        if (this.logsSse) {
            this.logsSse.close();
        }

        try {
            this.logsSse = new EventSource('/modules/dashboard/api/logs/stream');

            this.logsSse.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.addLog(data);
                } catch (error) {
                    console.error('Failed to parse log event:', error);
                }
            };

            this.logsSse.onerror = () => {
                console.error('Logs SSE connection error');
                // Will auto-reconnect
            };
        } catch (error) {
            console.error('Failed to connect logs stream:', error);
        }
    }

    /**
     * Connect to events SSE stream
     */
    connectEventsStream() {
        if (this.eventsSse) {
            this.eventsSse.close();
        }

        try {
            this.eventsSse = new EventSource('/modules/dashboard/api/events/stream');

            this.eventsSse.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.addEvent(data);
                } catch (error) {
                    console.error('Failed to parse event:', error);
                }
            };

            this.eventsSse.onerror = () => {
                console.error('Events SSE connection error');
                // Will auto-reconnect
            };
        } catch (error) {
            console.error('Failed to connect events stream:', error);
        }
    }

    /**
     * Add log to container
     */
    addLog(data) {
        const container = document.getElementById('logs-container');
        if (!container) return;

        // Determine log level and format
        const message = data.message || {};
        const level = this.extractLogLevel(data.topic, message);
        const timestamp = new Date(data.timestamp).toLocaleTimeString();

        const logHtml = `
            <div class="log-item">
                <span class="log-timestamp">${timestamp}</span>
                <span class="log-level log-${level}">${level.toUpperCase()}</span>
                <span class="log-message">${this.formatLogMessage(message)}</span>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', logHtml);

        // Limit logs
        while (container.children.length > this.maxLogs) {
            container.removeChild(container.firstChild);
        }

        // Auto-scroll
        if (this.autoScroll) {
            container.scrollTop = container.scrollHeight;
        }
    }

    /**
     * Extract log level from topic or message
     */
    extractLogLevel(topic, message) {
        if (topic.includes('/logs/error')) return 'error';
        if (topic.includes('/logs/warn')) return 'warn';
        if (topic.includes('/logs/info')) return 'info';
        if (topic.includes('/logs/debug')) return 'debug';

        // Fallback to message level
        if (message.level) return message.level;

        return 'info';
    }

    /**
     * Format log message
     */
    formatLogMessage(message) {
        if (typeof message === 'string') {
            return this.escapeHtml(message);
        }

        if (message.message) {
            return this.escapeHtml(message.message);
        }

        // Display JSON
        try {
            return this.escapeHtml(JSON.stringify(message, null, 2));
        } catch {
            return this.escapeHtml(String(message));
        }
    }

    /**
     * Add event to container
     */
    addEvent(data) {
        const container = document.getElementById('events-container');
        if (!container) return;

        const timestamp = new Date(data.timestamp).toLocaleTimeString();
        const topic = data.topic || 'unknown';
        const message = data.message || {};

        const eventHtml = `
            <div class="event-item">
                <div class="event-topic">${timestamp} - ${this.escapeHtml(topic)}</div>
                <div class="event-data">${this.formatEventData(message)}</div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', eventHtml);

        // Limit events
        while (container.children.length > this.maxEvents) {
            container.removeChild(container.firstChild);
        }
    }

    /**
     * Format event data
     */
    formatEventData(message) {
        try {
            return this.escapeHtml(JSON.stringify(message, null, 2));
        } catch {
            return this.escapeHtml(String(message));
        }
    }

    /**
     * Clear logs
     */
    clearLogs() {
        const container = document.getElementById('logs-container');
        if (!container) return;

        container.innerHTML = '<div class="log-item log-info">Logs cleared.</div>';
    }

    /**
     * Clear events
     */
    clearEvents() {
        const container = document.getElementById('events-container');
        if (!container) return;

        container.innerHTML = '<div class="event-item">Events cleared.</div>';
    }

    /**
     * Toggle section visibility
     */
    toggleSection(sectionId) {
        const container = document.getElementById(`${sectionId}-container`);
        const toggle = document.getElementById(`${sectionId}-toggle`);

        if (!container || !toggle) return;

        if (container.style.display === 'none') {
            container.style.display = 'block';
            toggle.classList.add('open');
        } else {
            container.style.display = 'none';
            toggle.classList.remove('open');
        }
    }

    /**
     * Set status indicator
     */
    setStatus(status, text) {
        const indicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');

        if (indicator) {
            indicator.className = `status-indicator status-${status}`;
        }

        if (statusText) {
            statusText.textContent = text;
        }
    }

    /**
     * Update timestamp
     */
    updateTimestamp() {
        const element = document.getElementById('last-updated');
        if (element) {
            element.textContent = new Date().toLocaleString();
        }
    }

    /**
     * Format uptime in human-readable format
     */
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize dashboard when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.dashboard = new Dashboard();
    });
} else {
    window.dashboard = new Dashboard();
}
