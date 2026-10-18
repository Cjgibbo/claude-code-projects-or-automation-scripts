#!/usr/bin/env node
/**
 * AOP Verify — Page Count Checker
 *
 * Usage:
 *   node verify.js <series-slug> <product>
 *   node verify.js output/prayer-drawing-near-to-god-tg.docx
 *
 * Converts .docx → PDF via LibreOffice, counts pages with pdfinfo,
 * and checks the saddle-stitch multiple-of-4 rule.
 *
 * Rules:
 *   - Cover is separate stock → not counted in body page total.
 *   - Body pages must be a multiple of 4 for saddle-stitch binding.
 *   - Answer key (key) is a loose insert — no page count constraint.
 *
 * Exit codes:
 *   0 — pass
 *   1 — fail (page count violation or error)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getPageCount(docxPath) {
  // Convert to PDF in a temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aop-verify-'));
  try {
    execSync(
      `libreoffice --headless --convert-to pdf --outdir "${tmpDir}" "${docxPath}"`,
      { stdio: 'pipe', timeout: 60000 }
    );

    const pdfName = path.basename(docxPath, '.docx') + '.pdf';
    const pdfPath = path.join(tmpDir, pdfName);

    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF conversion failed — expected ${pdfPath}`);
    }

    const info = execSync(`pdfinfo "${pdfPath}"`, { encoding: 'utf8' });
    const match = info.match(/^Pages:\s+(\d+)/m);
    if (!match) throw new Error('Could not read page count from pdfinfo');

    return parseInt(match[1], 10);
  } finally {
    // Clean up temp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  let docxPath, product;

  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  if (!arg1) {
    console.error('Usage:');
    console.error('  node verify.js <series-slug> <product>');
    console.error('  node verify.js output/some-file.docx');
    process.exit(1);
  }

  if (arg1.endsWith('.docx')) {
    // Direct path mode
    docxPath = path.resolve(arg1);
    // Infer product from filename: <slug>-<product>.docx
    const base = path.basename(docxPath, '.docx');
    const lastDash = base.lastIndexOf('-');
    product = lastDash !== -1 ? base.substring(lastDash + 1) : null;
  } else if (arg2) {
    // slug + product mode
    const slug = arg1;
    product = arg2;
    docxPath = path.join(__dirname, 'output', `${slug}-${product}.docx`);
  } else {
    console.error('Usage: node verify.js <series-slug> <product>');
    process.exit(1);
  }

  if (!fs.existsSync(docxPath)) {
    console.error(`File not found: ${docxPath}`);
    console.error('Run build.js first to generate the .docx.');
    process.exit(1);
  }

  console.log(`Verifying: ${path.basename(docxPath)}`);

  // Get page count
  const totalPages = getPageCount(docxPath);
  console.log(`Total pages (including cover): ${totalPages}`);

  // Answer key — no page constraint, just report
  if (product === 'key') {
    console.log(`Product: Answer Key (loose insert — no saddle-stitch constraint)`);
    console.log(`Target: 2 pages (front/back of one sheet)`);
    if (totalPages === 2) {
      console.log('✓ PASS — 2 pages, fits on one sheet');
    } else if (totalPages <= 2) {
      console.log(`✓ PASS — ${totalPages} page(s), fits on one sheet`);
    } else {
      console.log(`⚠ WARNING — ${totalPages} pages, exceeds single-sheet target`);
      // Not a hard fail — just a warning
    }
    process.exit(0);
  }

  // All other products: cover is page 1 (separate stock), body is the rest
  const bodyPages = totalPages - 1;
  console.log(`Body pages (excluding cover): ${bodyPages}`);

  const remainder = bodyPages % 4;

  if (remainder === 0) {
    console.log(`✓ PASS — ${bodyPages} body pages (${bodyPages / 4} sheets, multiple of 4)`);
    process.exit(0);
  } else {
    const needed = 4 - remainder;
    const target = bodyPages + needed;
    console.log(`✗ FAIL — ${bodyPages} body pages is not a multiple of 4`);
    console.log(`  Need ${needed} more page(s) to reach ${target}`);
    console.log(`  Add or adjust notes pages to pad.`);
    process.exit(1);
  }
}

main();
