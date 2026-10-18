#!/usr/bin/env node
/**
 * AOP Build CLI
 *
 * Usage:
 *   node build.js <series-slug> <product>
 *
 * Example:
 *   node build.js prayer-drawing-near-to-god tg
 *
 * Products:
 *   tg      — Teacher's Guide (ALEXANDER / STONE & SCROLL)
 *   sw      — Student Workbook (ALEXANDER / STONE & SCROLL)
 *   mustard — Guided Workbook (MUSTARD)
 *   key     — Leader's Answer Key insert (MUSTARD)
 *
 * Output goes to: output/<series-slug>-<product>.docx
 */

const fs = require('fs');
const path = require('path');

const PRODUCTS = {
  tg: {
    label: "Teacher's Guide",
    builder: () => require('./engine/tg-builder').buildTeachersGuide,
  },
  sw: {
    label: 'Student Workbook',
    builder: () => require('./engine/sw-builder').buildStudentWorkbook,
  },
  mustard: {
    label: 'Guided Workbook (MUSTARD)',
    builder: () => require('./engine/mustard-builder').buildMustardWorkbook,
  },
  key: {
    label: "Leader's Answer Key (MUSTARD)",
    builder: () => require('./engine/mustard-key-builder').buildAnswerKey,
    noCatalog: true,   // answer key doesn't use the catalog
  },
};

async function main() {
  const [slug, product] = process.argv.slice(2);

  if (!slug || !product) {
    console.error('Usage: node build.js <series-slug> <product>');
    console.error('  e.g. node build.js prayer-drawing-near-to-god tg');
    process.exit(1);
  }

  if (!PRODUCTS[product]) {
    console.error(`Unknown product "${product}". Available: ${Object.keys(PRODUCTS).join(', ')}`);
    process.exit(1);
  }

  // Load content
  const contentPath = path.join(__dirname, 'content', slug, `${product}.json`);
  if (!fs.existsSync(contentPath)) {
    console.error(`Content file not found: ${contentPath}`);
    process.exit(1);
  }
  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

  // Load catalog
  const catalogPath = path.join(__dirname, 'shared', 'catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  // Build
  const { label, builder, noCatalog } = PRODUCTS[product];
  console.log(`Building ${label}: ${content.meta.title}${content.meta.subtitle ? ' — ' + content.meta.subtitle : ''}`);

  const build = builder();
  const buffer = noCatalog
    ? await build(content)
    : await build(content, catalog);

  // Write output
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const outFile = path.join(outDir, `${slug}-${product}.docx`);
  fs.writeFileSync(outFile, buffer);
  console.log(`Done → ${outFile}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
