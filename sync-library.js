#!/usr/bin/env node
/**
 * sync-library.js — push approved Photo Pilot finals to the dashboard.
 *
 * Reads every <slug>.json sidecar in the local Repository (Photos/ + Videos/),
 * copies the paired media into public/library/, regenerates
 * public/library/manifest.json, then commits and pushes (which triggers the
 * Render redeploy).
 *
 * Usage:
 *   node sync-library.js              copy + manifest + commit + push
 *   node sync-library.js --no-push    copy + manifest + commit, no push
 *   node sync-library.js --dry-run    report what would change, touch nothing
 *
 * Source folder defaults to the Photo Pilot Repository; override with the
 * OB_REPOSITORY environment variable if it ever moves.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOURCE = process.env.OB_REPOSITORY ||
  'C:\\Users\\Banjo\\Projects\\Olivia Blaire Travel\\Photo Pilot - iPhone Batch\\Repository';
const DEST = path.join(__dirname, 'public', 'library');
const MANIFEST = path.join(DEST, 'manifest.json');

const dryRun = process.argv.includes('--dry-run');
const noPush = process.argv.includes('--no-push');

const MANIFEST_FIELDS = ['seo_filename', 'alt_text', 'caption_angle', 'tier',
  'brand_score', 'engagement_score', 'destination', 'has_people',
  'stitch_group', 'date_taken', 'privacy_flag', 'media_type'];

function collectEntries() {
  const entries = [];
  const problems = [];
  for (const sub of ['Photos', 'Videos']) {
    const dir = path.join(SOURCE, sub);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.toLowerCase().endsWith('.json')) continue;
      const sidecarPath = path.join(dir, file);
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
      } catch (err) {
        problems.push(`${sub}/${file}: unreadable JSON (${err.message})`);
        continue;
      }
      const mediaName = meta.seo_filename;
      const mediaPath = mediaName && path.join(dir, mediaName);
      if (!mediaName || !fs.existsSync(mediaPath)) {
        problems.push(`${sub}/${file}: media file "${mediaName}" not found`);
        continue;
      }
      const entry = { url: '/library/' + mediaName };
      for (const f of MANIFEST_FIELDS) entry[f] = meta[f] !== undefined ? meta[f] : null;
      entries.push({ entry, mediaPath, mediaName });
    }
  }
  entries.sort((a, b) => (b.entry.date_taken || '').localeCompare(a.entry.date_taken || ''));
  return { entries, problems };
}

function sync() {
  const { entries, problems } = collectEntries();
  for (const p of problems) console.warn('WARN  ' + p);
  if (!fs.existsSync(DEST) && !dryRun) fs.mkdirSync(DEST, { recursive: true });

  const keep = new Set(entries.map(e => e.mediaName));
  let added = 0, updated = 0, removed = 0, unchanged = 0;

  for (const { mediaPath, mediaName } of entries) {
    const destPath = path.join(DEST, mediaName);
    const src = fs.statSync(mediaPath);
    if (!fs.existsSync(destPath)) {
      if (!dryRun) fs.copyFileSync(mediaPath, destPath);
      console.log('ADD   ' + mediaName);
      added++;
    } else if (fs.statSync(destPath).size !== src.size) {
      if (!dryRun) fs.copyFileSync(mediaPath, destPath);
      console.log('UPDATE ' + mediaName);
      updated++;
    } else {
      unchanged++;
    }
  }

  if (fs.existsSync(DEST)) {
    for (const file of fs.readdirSync(DEST)) {
      if (file === 'manifest.json' || keep.has(file)) continue;
      if (!dryRun) fs.unlinkSync(path.join(DEST, file));
      console.log('REMOVE ' + file + ' (no longer in Repository)');
      removed++;
    }
  }

  const manifest = {
    generated: new Date().toISOString(),
    count: entries.length,
    items: entries.map(e => e.entry)
  };
  if (!dryRun) fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

  const flagged = entries.filter(e => e.entry.privacy_flag).length;
  console.log(`\nLibrary: ${entries.length} items (${flagged} privacy-flagged) — ` +
    `${added} added, ${updated} updated, ${removed} removed, ${unchanged} unchanged`);
  if (dryRun) { console.log('Dry run — nothing written.'); return; }

  const status = execSync('git -C "' + __dirname + '" status --porcelain public/library', { encoding: 'utf8' }).trim();
  if (!status) { console.log('No changes to commit — dashboard already up to date.'); return; }

  execSync('git -C "' + __dirname + '" add public/library', { stdio: 'inherit' });
  const msg = `Sync photo library: ${entries.length} items (+${added} ~${updated} -${removed})`;
  execSync('git -C "' + __dirname + '" commit -m "' + msg + '"', { stdio: 'inherit' });
  if (noPush) { console.log('Committed. Skipping push (--no-push) — run "git push" to deploy.'); return; }
  execSync('git -C "' + __dirname + '" push', { stdio: 'inherit' });
  console.log('Pushed — Render will redeploy with the updated library in about a minute.');
}

sync();
