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
 *   tg  — Teacher's Guide
 *   sw  — Student Workbook
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
  sw: { label: 'Student Workbook', builder: () => require('./engine/sw-builder').buildStudentWorkbook },
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
  const { label, builder } = PRODUCTS[product];
  console.log(`Building ${label}: ${content.meta.title} — ${content.meta.subtitle}`);

  const build = builder();
  const buffer = await build(content, catalog);

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
