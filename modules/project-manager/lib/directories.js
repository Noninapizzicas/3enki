/**
 * Project Manager - Directory Management
 * Gestión de directorios de proyecto, blueprints, schema init
 */

const fs = require('fs');
const path = require('path');

module.exports = {

  /**
   * Create project directory structure
   */
  async createProjectDirectories(projectId, name, correlationId) {
    const slug = this.slugify(name);
    const basePath = path.join(this.projectsBasePath, slug);

    this.logger.debug('project.directories.creating', { correlationId, projectId, basePath });

    try {
      await fs.promises.mkdir(path.join(basePath, 'db'), { recursive: true });
      await fs.promises.mkdir(path.join(basePath, 'storage'), { recursive: true });
      this.logger.debug('project.directories.created', { correlationId, projectId });
      return basePath;
    } catch (error) {
      this.logger.error('project.directories.create.failed', { correlationId, projectId, error: error.message });
      throw error;
    }
  },

  /**
   * Delete project directories
   */
  async deleteProjectDirectories(basePath, correlationId) {
    this.logger.debug('project.directories.deleting', { correlationId, basePath });

    try {
      await fs.promises.rm(basePath, { recursive: true, force: true });
      this.logger.debug('project.directories.deleted', { correlationId, basePath });
    } catch (error) {
      this.logger.warn('project.directories.delete.failed', { correlationId, basePath, error: error.message });
    }
  },

  /**
   * Check if a project name already exists (checks directory on disk)
   */
  async projectNameExists(name, correlationId) {
    const slug = this.slugify(name);
    const basePath = path.join(this.projectsBasePath, slug);

    try {
      await fs.promises.access(basePath);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Initialize database schema for new project
   * Note: This is fire-and-forget - we don't wait for completion
   * since the project can be used immediately with default schema
   */
  async initializeProjectSchema(projectId, correlationId) {
    this.logger.debug('project.schema.initializing', { correlationId, projectId });

    try {
      await this.eventBus.publish('db.schema.init.request', {
        project_id: projectId,
        schema: this.config.defaultSchema,
        correlation_id: correlationId
      });
      this.logger.debug('project.schema.init.requested', { correlationId, projectId });
    } catch (err) {
      this.logger.warn('project.schema.init.failed', { correlationId, projectId, error: err.message });
    }
  },

  /**
   * Initialize project from a blueprint project definition
   * Copies handlers, creates config, and sets up directory structure
   */
  async initializeFromBlueprint(basePath, slug, projectDef, correlationId) {
    this.logger.info('project.blueprint.initializing', { correlationId, slug });

    // 1. Create directories
    const dirs = projectDef.directories || ['config', 'handlers'];
    for (const dir of dirs) {
      await fs.promises.mkdir(path.join(basePath, dir), { recursive: true });
    }

    // 2. Create config.json (replace {{slug}} with actual slug)
    if (projectDef.config && Object.keys(projectDef.config).length > 0) {
      const configStr = JSON.stringify(projectDef.config, null, 2)
        .replace(/\{\{slug\}\}/g, slug);
      const configDir = path.join(basePath, 'config');
      await fs.promises.mkdir(configDir, { recursive: true });
      await fs.promises.writeFile(path.join(configDir, 'config.json'), configStr, 'utf-8');
    }

    // 3. Copy handlers from source project
    if (projectDef.copyHandlersFrom) {
      const sourcePath = path.join(this.projectsBasePath, projectDef.copyHandlersFrom, 'handlers');
      const targetPath = path.join(basePath, 'handlers');

      try {
        await fs.promises.mkdir(targetPath, { recursive: true });
        const files = await fs.promises.readdir(sourcePath);
        let copied = 0;

        for (const file of files) {
          if (!file.endsWith('.js')) continue;
          const srcFile = path.join(sourcePath, file);
          const stat = await fs.promises.stat(srcFile);
          if (stat.isFile()) {
            await fs.promises.copyFile(srcFile, path.join(targetPath, file));
            copied++;
          }
        }

        this.logger.info('project.blueprint.handlers.copied', { correlationId, source: projectDef.copyHandlersFrom, copied });
      } catch (error) {
        this.logger.warn('project.blueprint.handlers.copy.failed', { correlationId, source: projectDef.copyHandlersFrom, error: error.message });
      }
    }

    // 4. Create initial seed files
    if (projectDef.initialFiles) {
      for (const [filePath, content] of Object.entries(projectDef.initialFiles)) {
        const fullPath = path.join(basePath, filePath);
        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.promises.writeFile(fullPath, JSON.stringify(content, null, 2), 'utf-8');
      }
    }

    this.logger.info('project.blueprint.initialized', { correlationId, slug });
  }
};
