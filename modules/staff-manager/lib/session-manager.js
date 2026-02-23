/**
 * SessionManager - Control de jornada por NFC
 *
 * Gestiona sesiones de turno: tap_in (entrada) y tap_out (salida).
 * Cada toque NFC del empleado llama a tapIn o tapOut según el estado actual.
 *
 * Casos edge manejados:
 *   - Tap doble entrada: retorna sesión activa sin crear duplicado
 *   - Olvido de tap_out: cierre automático a medianoche (close_reason: "auto_midnight")
 *   - Cierre manual por manager: close_reason: "manager"
 *
 * Almacena en SQLite separado (data/staff/staff_sessions.db).
 */

const fs     = require('fs').promises;
const path   = require('path');
const crypto = require('crypto');

const CLOSE_REASONS = {
  MANUAL:         'manual',
  AUTO_MIDNIGHT:  'auto_midnight',
  MANAGER:        'manager'
};

class SessionManager {
  /**
   * @param {object} opts
   * @param {string}   opts.dataPath        - Directorio para staff_sessions.db
   * @param {object}   [opts.logger]        - Logger del core
   * @param {Function} [opts.onSessionEvent] - Callback(type, data) para eventos
   */
  constructor({ dataPath, logger, onSessionEvent }) {
    this.dataPath        = dataPath;
    this.logger          = logger;
    this.onSessionEvent  = onSessionEvent || (() => {});
    this.db              = null;
    this.SQL             = null;
    this._saveTimer      = null;
    this._midnightTimer  = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize(SQL) {
    this.SQL = SQL;
    await this._loadOrCreate();
    this._startAutoSave();
    this._scheduleMidnightClose();
  }

  async close() {
    if (this._saveTimer)     clearInterval(this._saveTimer);
    if (this._midnightTimer) clearTimeout(this._midnightTimer);
    await this._persist();
    if (this.db) this.db.close();
  }

  // ── Tap In ────────────────────────────────────────────────────────────────

  /**
   * Registra la entrada de un empleado.
   * Si ya tiene sesión activa, retorna esa sesión sin crear una nueva.
   *
   * @param {object} opts
   * @param {string} opts.employee_id
   * @param {string} [opts.device_id]  - ID del dispositivo/tablet (opcional)
   * @returns {{ already_active: boolean, session: object }}
   */
  tapIn({ employee_id, device_id }) {
    if (!employee_id) throw new Error('employee_id requerido');

    const existing = this.getActiveSession(employee_id);
    if (existing) {
      return { already_active: true, session: existing };
    }

    const id            = `sess-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const now           = new Date().toISOString();
    const session_token = crypto.randomBytes(32).toString('hex');

    this.db.run(
      `INSERT INTO shift_sessions
         (id, employee_id, device_id, tap_in_at, session_token, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, employee_id, device_id || null, now, session_token, now]
    );

    const session = this.getSession(id);
    this.logger?.info('staff.session.tap_in', { session_id: id, employee_id, device_id });
    this.onSessionEvent('tap_in', session);
    return { already_active: false, session };
  }

  // ── Tap Out ───────────────────────────────────────────────────────────────

  /**
   * Registra la salida de un empleado.
   * Si no tiene sesión activa, informa sin error.
   *
   * @param {object} opts
   * @param {string} opts.employee_id
   * @returns {{ had_active: boolean, session?: object, duration_minutes?: number }}
   */
  tapOut({ employee_id }) {
    if (!employee_id) throw new Error('employee_id requerido');

    const active = this.getActiveSession(employee_id);
    if (!active) {
      return { had_active: false };
    }

    const now = new Date().toISOString();
    this.db.run(
      `UPDATE shift_sessions SET tap_out_at = ?, close_reason = ? WHERE id = ?`,
      [now, CLOSE_REASONS.MANUAL, active.id]
    );

    const session          = this.getSession(active.id);
    const duration_minutes = this._durationMinutes(session.tap_in_at, session.tap_out_at);

    this.logger?.info('staff.session.tap_out', { session_id: session.id, employee_id, duration_minutes });
    this.onSessionEvent('tap_out', { ...session, duration_minutes });
    return { had_active: true, session, duration_minutes };
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Sesión activa de un empleado (sin tap_out), o null. */
  getActiveSession(employee_id) {
    const stmt = this.db.prepare(
      `SELECT * FROM shift_sessions
        WHERE employee_id = ? AND tap_out_at IS NULL
        ORDER BY tap_in_at DESC LIMIT 1`
    );
    stmt.bind([employee_id]);
    const exists = stmt.step();
    const row    = exists ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  }

  /** Obtiene una sesión por ID. */
  getSession(id) {
    const stmt = this.db.prepare('SELECT * FROM shift_sessions WHERE id = ?');
    stmt.bind([id]);
    const exists = stmt.step();
    const row    = exists ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  }

  /** Lista todas las sesiones actualmente abiertas (sin tap_out). */
  listActiveSessions() {
    const stmt = this.db.prepare(
      'SELECT * FROM shift_sessions WHERE tap_out_at IS NULL ORDER BY tap_in_at'
    );
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  /**
   * Lista sesiones de un día concreto.
   * @param {string} date - Formato YYYY-MM-DD
   */
  listSessionsByDate(date) {
    const stmt = this.db.prepare(
      `SELECT * FROM shift_sessions WHERE tap_in_at LIKE ? ORDER BY tap_in_at`
    );
    stmt.bind([`${date}%`]);
    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      if (row.tap_out_at) row.duration_minutes = this._durationMinutes(row.tap_in_at, row.tap_out_at);
      rows.push(row);
    }
    stmt.free();
    return rows;
  }

  /**
   * Lista últimas N sesiones de un empleado.
   * @param {string} employee_id
   * @param {number} [limit=30]
   */
  listSessionsByEmployee(employee_id, limit = 30) {
    const stmt = this.db.prepare(
      `SELECT * FROM shift_sessions
        WHERE employee_id = ?
        ORDER BY tap_in_at DESC LIMIT ?`
    );
    stmt.bind([employee_id, limit]);
    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      if (row.tap_out_at) row.duration_minutes = this._durationMinutes(row.tap_in_at, row.tap_out_at);
      rows.push(row);
    }
    stmt.free();
    return rows;
  }

  /**
   * Cierra todas las sesiones abiertas (usada a medianoche y por manager).
   * @param {string} [reason]
   * @returns {object[]} Sesiones que fueron cerradas
   */
  closeAllActive(reason = CLOSE_REASONS.AUTO_MIDNIGHT) {
    const active = this.listActiveSessions();
    if (active.length === 0) return [];

    const now = new Date().toISOString();
    this.db.run(
      `UPDATE shift_sessions SET tap_out_at = ?, close_reason = ? WHERE tap_out_at IS NULL`,
      [now, reason]
    );

    this.logger?.info('staff.session.auto_closed', { count: active.length, reason });
    active.forEach(s => this.onSessionEvent('auto_closed', { ...s, close_reason: reason }));
    return active;
  }

  /**
   * Cierra la sesión activa de un empleado por acción del manager.
   * @returns {object|null} Sesión cerrada, o null si no había sesión activa
   */
  managerClose(employee_id) {
    const active = this.getActiveSession(employee_id);
    if (!active) return null;

    const now = new Date().toISOString();
    this.db.run(
      `UPDATE shift_sessions SET tap_out_at = ?, close_reason = ? WHERE id = ?`,
      [now, CLOSE_REASONS.MANAGER, active.id]
    );

    const session = this.getSession(active.id);
    this.logger?.info('staff.session.manager_closed', { session_id: session.id, employee_id });
    this.onSessionEvent('manager_close', session);
    return session;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _durationMinutes(start, end) {
    return Math.round((new Date(end) - new Date(start)) / 60000);
  }

  _scheduleMidnightClose() {
    const now      = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 500); // siguiente día 00:00:00.5
    const delay = midnight - now;

    this._midnightTimer = setTimeout(async () => {
      this.closeAllActive(CLOSE_REASONS.AUTO_MIDNIGHT);
      await this._persist();
      this._scheduleMidnightClose(); // re-programar para la próxima medianoche
    }, delay);

    this.logger?.debug('staff.midnight_close.scheduled', {
      in_minutes: Math.round(delay / 60000)
    });
  }

  async _loadOrCreate() {
    const dbPath = path.join(this.dataPath, 'staff_sessions.db');
    try {
      const data = await fs.readFile(dbPath);
      this.db = new this.SQL.Database(data);
      this.logger?.debug('staff.sessions.db.loaded', { path: dbPath });
    } catch {
      this.db = new this.SQL.Database();
      this._createSchema();
      this.logger?.debug('staff.sessions.db.created', { path: dbPath });
    }
  }

  _createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS shift_sessions (
        id            TEXT PRIMARY KEY,
        employee_id   TEXT NOT NULL,
        device_id     TEXT,
        tap_in_at     TEXT NOT NULL,
        tap_out_at    TEXT,
        close_reason  TEXT,
        session_token TEXT NOT NULL,
        created_at    TEXT NOT NULL
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_employee_id ON shift_sessions (employee_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_tap_in_at   ON shift_sessions (tap_in_at)');
  }

  _startAutoSave(intervalMs = 30000) {
    this._saveTimer = setInterval(() => this._persist().catch(() => {}), intervalMs);
  }

  async _persist() {
    const dbPath = path.join(this.dataPath, 'staff_sessions.db');
    await fs.mkdir(this.dataPath, { recursive: true });
    await fs.writeFile(dbPath, Buffer.from(this.db.export()));
  }
}

SessionManager.CLOSE_REASONS = CLOSE_REASONS;

module.exports = SessionManager;
