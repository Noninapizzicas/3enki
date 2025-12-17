#!/usr/bin/env node
/**
 * Repair Projects Script
 *
 * This script repairs existing projects that are missing:
 * - Database files (db.sqlite)
 * - Storage directories (uploads, exports, temp, files)
 *
 * Usage: node scripts/repair-projects.js [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 */

const fs = require('fs');
const path = require('path');

// Try to load sql.js
let initSqlJs;
try {
  initSqlJs = require('sql.js');
} catch (err) {
  console.error('Error: sql.js not found. Run: npm install sql.js');
  process.exit(1);
}

// Configuration
const PROJECTS_PATH = path.resolve(__dirname, '../data/projects');
const STORAGE_PATH = path.resolve(__dirname, '../data/storage');

const DEFAULT_SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
`;

const STORAGE_DIRECTORIES = ['uploads', 'exports', 'temp', 'files'];

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('='.repeat(60));
  console.log('Project Repair Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Projects path: ${PROJECTS_PATH}`);
  console.log(`Storage path: ${STORAGE_PATH}`);
  console.log('');

  // Initialize sql.js
  console.log('Initializing sql.js...');
  const SQL = await initSqlJs();
  console.log('sql.js initialized successfully');
  console.log('');

  // Check if system database exists
  const systemDbPath = path.join(PROJECTS_PATH, 'system', 'db.sqlite');
  if (!fs.existsSync(systemDbPath)) {
    console.error('Error: System database not found at:', systemDbPath);
    console.error('Cannot proceed without system database.');
    process.exit(1);
  }

  // Load system database to get project list
  console.log('Loading system database...');
  const systemDbData = fs.readFileSync(systemDbPath);
  const systemDb = new SQL.Database(systemDbData);

  // Get all projects
  const projects = [];
  const stmt = systemDb.prepare('SELECT id, name, is_active FROM projects');
  while (stmt.step()) {
    projects.push(stmt.getAsObject());
  }
  stmt.free();
  systemDb.close();

  console.log(`Found ${projects.length} projects in system database`);
  console.log('');

  // Statistics
  let stats = {
    totalProjects: projects.length,
    directoriesCreated: 0,
    databasesCreated: 0,
    storageDirectoriesCreated: 0,
    alreadyComplete: 0,
    errors: []
  };

  // Process each project
  for (const project of projects) {
    // Skip system projects
    if (project.id === 'system' || project.id === '_prompts') {
      console.log(`[SKIP] ${project.id} (system project)`);
      continue;
    }

    console.log('');
    console.log(`[PROJECT] ${project.name || project.id}`);
    console.log(`  ID: ${project.id}`);
    console.log(`  Active: ${project.is_active ? 'Yes' : 'No'}`);

    const projectDir = path.join(PROJECTS_PATH, project.id);
    const dbPath = path.join(projectDir, 'db.sqlite');
    const storageDir = path.join(STORAGE_PATH, project.id);

    let needsRepair = false;

    // Check project directory
    if (!fs.existsSync(projectDir)) {
      console.log(`  [FIX] Creating project directory`);
      needsRepair = true;
      if (!isDryRun) {
        try {
          fs.mkdirSync(projectDir, { recursive: true });
          stats.directoriesCreated++;
        } catch (err) {
          console.log(`  [ERROR] Failed to create directory: ${err.message}`);
          stats.errors.push({ project: project.id, error: err.message, type: 'directory' });
        }
      }
    }

    // Check database file
    if (!fs.existsSync(dbPath)) {
      console.log(`  [FIX] Creating database with default schema`);
      needsRepair = true;
      if (!isDryRun) {
        try {
          // Ensure directory exists
          if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
          }

          // Create database with schema
          const db = new SQL.Database();
          db.exec(DEFAULT_SCHEMA);

          // Save to file
          const data = db.export();
          const buffer = Buffer.from(data);
          fs.writeFileSync(dbPath, buffer);
          db.close();

          stats.databasesCreated++;
          console.log(`  [OK] Database created`);
        } catch (err) {
          console.log(`  [ERROR] Failed to create database: ${err.message}`);
          stats.errors.push({ project: project.id, error: err.message, type: 'database' });
        }
      }
    } else {
      console.log(`  [OK] Database exists`);
    }

    // Check storage directories
    for (const dir of STORAGE_DIRECTORIES) {
      const storageDirPath = path.join(storageDir, dir);
      if (!fs.existsSync(storageDirPath)) {
        console.log(`  [FIX] Creating storage/${dir}`);
        needsRepair = true;
        if (!isDryRun) {
          try {
            fs.mkdirSync(storageDirPath, { recursive: true });
            stats.storageDirectoriesCreated++;
          } catch (err) {
            console.log(`  [ERROR] Failed to create storage directory: ${err.message}`);
            stats.errors.push({ project: project.id, error: err.message, type: 'storage' });
          }
        }
      }
    }

    if (!needsRepair) {
      console.log(`  [OK] Project is complete`);
      stats.alreadyComplete++;
    }
  }

  // Print summary
  console.log('');
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total projects scanned: ${stats.totalProjects}`);
  console.log(`Already complete: ${stats.alreadyComplete}`);

  if (isDryRun) {
    console.log('');
    console.log('DRY RUN - No changes were made');
    console.log('Run without --dry-run to apply changes');
  } else {
    console.log(`Directories created: ${stats.directoriesCreated}`);
    console.log(`Databases created: ${stats.databasesCreated}`);
    console.log(`Storage directories created: ${stats.storageDirectoriesCreated}`);
  }

  if (stats.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    for (const err of stats.errors) {
      console.log(`  - ${err.project}: ${err.type} - ${err.error}`);
    }
  }

  console.log('');
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
