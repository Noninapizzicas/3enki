/**
 * Project Manager - Features / Blueprints
 * Add modular features to projects using blueprint definitions
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = {

  /**
   * UI Handler: Lista de features/modules disponibles
   */
  async handleUIListFeatures(data, request) {
    const bpDir = path.join(process.cwd(), 'blueprints', 'project-types');
    const { projectId } = data || {};

    let installedFeatures = [];
    let systemProjects = [];
    if (projectId) {
      const project = this.getProject(projectId);
      if (project) {
        installedFeatures = project.metadata?.features || [];

        if (project.system_id) {
          try {
            const system = await this.getSystem(project.system_id, crypto.randomUUID());
            if (system && system.projects) {
              systemProjects = system.projects
                .filter(p => p.id !== projectId)
                .map(p => {
                  const fullProject = this.getProject(p.id);
                  return {
                    id: p.id, name: p.name, role: p.systemRole,
                    features: fullProject?.metadata?.features || []
                  };
                });
            }
          } catch { /* no system */ }
        }
      }
    }

    try {
      const files = await fs.promises.readdir(bpDir);
      const features = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = JSON.parse(await fs.promises.readFile(path.join(bpDir, file), 'utf-8'));
          const featureId = content.id || file.replace('.json', '');

          let handlersAvailable = true;
          if (content.copyHandlersFrom) {
            const sourcePath = path.join(this.projectsBasePath, content.copyHandlersFrom, 'handlers');
            try { await fs.promises.access(sourcePath); } catch { handlersAvailable = false; }
          }

          const subProject = systemProjects.find(p => p.features.includes(featureId));

          features.push({
            id: featureId,
            label: content.label || featureId,
            icon: content.icon || '',
            description: content.description || '',
            dependencies: content.dependencies || [],
            installed: installedFeatures.includes(featureId),
            handlersAvailable,
            subProjectId: subProject?.id || null,
            subProjectName: subProject?.name || null
          });
        } catch (err) {
          this.logger.warn({ file, error: err.message }, 'Invalid blueprint file, skipping');
        }
      }

      return { features, projectId: projectId || null, systemProjects };
    } catch (err) {
      this.logger.warn({ error: err.message }, 'Could not read blueprints directory');
      return { features: [], projectId: projectId || null, systemProjects: [] };
    }
  },

  /**
   * UI Handler: Add features/modules to an existing project
   */
  async handleUIAddFeatures(data, request) {
    const { id, features } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const project = this.getProject(id);
    if (!project) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    const selectedFeatures = Array.isArray(features) ? features : [];
    if (selectedFeatures.length === 0) throw { status: 400, code: 'VALIDATION_ERROR', message: 'At least one feature is required' };

    const existingFeatures = project.metadata?.features || [];
    const newFeatures = selectedFeatures.filter(f => !existingFeatures.includes(f));
    if (newFeatures.length === 0) {
      return { applied: [], skipped: selectedFeatures, reason: 'all_already_installed' };
    }

    // Load blueprints
    const bpDir = path.join(process.cwd(), 'blueprints', 'project-types');
    const blueprints = new Map();
    const loadErrors = [];

    for (const featureId of newFeatures) {
      try {
        const bpPath = path.join(bpDir, `${featureId}.json`);
        blueprints.set(featureId, JSON.parse(await fs.promises.readFile(bpPath, 'utf-8')));
      } catch (err) {
        loadErrors.push({ featureId, error: err.message });
      }
    }

    // Validate dependencies
    const missingDeps = [];
    for (const [featureId, blueprint] of blueprints) {
      for (const dep of (blueprint.dependencies || [])) {
        if (!existingFeatures.includes(dep) && !newFeatures.includes(dep)) {
          missingDeps.push({ feature: featureId, requires: dep });
        }
      }
    }

    if (missingDeps.length > 0) {
      throw {
        status: 400, code: 'MISSING_DEPENDENCIES',
        message: `Dependencias no satisfechas: ${missingDeps.map(d => `${d.feature} requiere ${d.requires}`).join(', ')}`,
        missingDeps
      };
    }

    // Auto-create system if needed
    let systemId = project.system_id;
    if (!systemId) {
      const system = await this.createSystem(project.name, `Sistema de ${project.name}`, { rootProjectId: id }, correlationId);
      systemId = system.id;
      await this.addProjectToSystem(systemId, id, 'root', correlationId);
    }

    // Create sub-projects per feature
    const applied = [];
    const createdProjects = [];
    const warnings = [];

    for (const [featureId, blueprint] of blueprints) {
      try {
        const subName = `${blueprint.label} ${project.name}`;

        const subProject = await this.createProject(
          subName, blueprint.description || '',
          {
            color: project.metadata?.color || 'blue',
            icon: blueprint.icon || '📁',
            workspaceType: featureId,
            features: [featureId],
            parentProjectId: id
          },
          correlationId
        );

        // Initialize filesystem from blueprint
        const subBasePath = subProject.base_path;
        await fs.promises.mkdir(path.join(subBasePath, 'config'), { recursive: true });
        await fs.promises.mkdir(path.join(subBasePath, 'handlers'), { recursive: true });
        await this.initializeFromBlueprint(subBasePath, this.slugify(subName), blueprint, correlationId);

        await this.addProjectToSystem(systemId, subProject.id, featureId, correlationId);

        try {
          await this.linkProjects(id, subProject.id, 'related_to', `Módulo ${blueprint.label}`, correlationId);
        } catch (err) {
          this.logger.warn({ correlationId, featureId, error: err.message }, 'Link already exists or failed');
        }

        // Dependencies between features
        for (const dep of (blueprint.dependencies || [])) {
          const depProject = [...this.projects.values()].find(
            p => p.system_id === systemId && p.metadata?.features?.includes(dep) && p.id !== subProject.id
          );
          if (depProject) {
            try {
              await this.addDependency(subProject.id, depProject.id, 'data', `${featureId} depende de ${dep}`, correlationId);
            } catch (err) {
              this.logger.warn({ correlationId, error: err.message }, 'Dependency already exists');
            }
          }
        }

        applied.push(featureId);
        createdProjects.push({ id: subProject.id, name: subName, feature: featureId, systemId, role: featureId });

        this.logger.info({ correlationId, featureId, subProjectId: subProject.id, systemId }, 'Feature sub-project created and integrated');
      } catch (err) {
        this.logger.error({ correlationId, featureId, error: err.message }, 'Feature apply failed');
        warnings.push({ featureId, warning: `Error: ${err.message}` });
      }
    }

    // Update root project metadata
    const updatedFeatures = [...new Set([...existingFeatures, ...applied])];
    await this.updateProject(id, {
      metadata: { ...(project.metadata || {}), features: updatedFeatures, systemId }
    }, correlationId);

    return {
      applied, createdProjects, systemId,
      skipped: selectedFeatures.filter(f => existingFeatures.includes(f)),
      warnings: warnings.length > 0 ? warnings : undefined,
      loadErrors: loadErrors.length > 0 ? loadErrors : undefined
    };
  }
};
