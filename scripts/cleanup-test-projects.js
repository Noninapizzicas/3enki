#!/usr/bin/env node
/**
 * Cleanup Test Projects Script
 *
 * Deletes all test projects from the database and filesystem,
 * keeping only system projects (system, _prompts).
 *
 * Usage: node scripts/cleanup-test-projects.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

let initSqlJs;
try {
  initSqlJs = require('sql.js');
} catch (err) {
  console.error('Error: sql.js not found. Run: npm install sql.js');
  process.exit(1);
}

const PROJECTS_PATH = path.resolve(__dirname, '../data/projects');
const STORAGE_PATH = path.resolve(__dirname, '../data/storage');
const SYSTEM_PROJECTS = ['system', '_prompts'];

const isDryRun = process.argv.includes('--dry-run');

function deleteDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Cleanup Test Projects');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE - DELETING DATA'}`);
  console.log('');

  if (!isDryRun) {
    console.log('⚠️  WARNING: This will permanently delete all test projects!');
    console.log('   Press Ctrl+C within 3 seconds to cancel...');
    await new Promise(r => setTimeout(r, 3000));
    console.log('');
  }

  const SQL = await initSqlJs();

  // Check system database
  const systemDbPath = path.join(PROJECTS_PATH, 'system', 'db.sqlite');
  if (!fs.existsSync(systemDbPath)) {
    console.error('System database not found at:', systemDbPath);
    process.exit(1);
  }

  // Load and clean system database
  console.log('Loading system database...');
  const systemDbData = fs.readFileSync(systemDbPath);
  const systemDb = new SQL.Database(systemDbData);

  // Get all projects
  const projects = [];
  const stmt = systemDb.prepare('SELECT id, name FROM projects');
  while (stmt.step()) {
    projects.push(stmt.getAsObject());
  }
  stmt.free();

  const testProjects = projects.filter(p => !SYSTEM_PROJECTS.includes(p.id));
  console.log(`Found ${testProjects.length} test projects to delete`);
  console.log('');

  let stats = { deleted: 0, dirsDeleted: 0, storageDeleted: 0 };

  for (const project of testProjects) {
    console.log(`[DELETE] ${project.name || project.id}`);

    if (!isDryRun) {
      // Delete from database
      systemDb.run('DELETE FROM projects WHERE id = ?', [project.id]);

      // Delete project directory
      const projectDir = path.join(PROJECTS_PATH, project.id);
      if (deleteDirectory(projectDir)) {
        stats.dirsDeleted++;
        console.log(`  - Deleted: ${projectDir}`);
      }

      // Delete storage directory
      const storageDir = path.join(STORAGE_PATH, project.id);
      if (deleteDirectory(storageDir)) {
        stats.storageDeleted++;
        console.log(`  - Deleted: ${storageDir}`);
      }

      stats.deleted++;
    }
  }

  // Save system database
  if (!isDryRun && stats.deleted > 0) {
    const data = systemDb.export();
    fs.writeFileSync(systemDbPath, Buffer.from(data));
    console.log('');
    console.log('System database updated');
  }

  systemDb.close();

  console.log('');
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));

  if (isDryRun) {
    console.log(`Would delete ${testProjects.length} projects`);
    console.log('Run without --dry-run to apply changes');
  } else {
    console.log(`Deleted ${stats.deleted} projects from database`);
    console.log(`Deleted ${stats.dirsDeleted} project directories`);
    console.log(`Deleted ${stats.storageDeleted} storage directories`);
  }

  console.log('');
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
