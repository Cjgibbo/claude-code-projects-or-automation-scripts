/**
 * AOP Template Engine — Shared Helpers
 *
 * Reusable docx paragraph/table builders used across all product types
 * (Teacher's Guide, Student Workbook). These handle the Georgia-font,
 * B&W, 12pt-minimum design spec for AOP's older-demographic readership.
 */

const {
  Paragraph, TextRun, AlignmentType, BorderStyle,
  convertInchesToTwip, Table, TableRow, TableCell,
  WidthType, HeightRule
} = require('docx');

/**
 * Table-based ruled writing lines.
 * Paragraph-based bottom borders collapse in LibreOffice — this approach
 * uses TableRow with HeightRule.EXACT to guarantee line height.
 */
function ruled(count = 5) {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const bottomLine = { style: BorderStyle.SINGLE, size: 2, color: '999999' };
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push(new TableRow({
      height: { value: convertInchesToTwip(0.25), rule: HeightRule.EXACT },
      children: [new TableCell({
        borders: { top: noBorder, left: noBorder, right: noBorder, bottom: bottomLine },
        width: { size: 100, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [] })]
      })]
    }));
  }
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: noBorder, left: noBorder, right: noBorder, bottom: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows,
  })];
}

/** Vertical spacer paragraph. */
function spacer(pts = 120) {
  return new Paragraph({ spacing: { before: pts, after: 0 }, children: [] });
}

/** Standard body paragraph — Georgia 12pt, black. */
function bodyP(text, opts = {}) {
  return new Paragraph({
    spacing: { before: opts.before || 120, after: opts.after || 60, line: 276 },
    indent: opts.indent ? { firstLine: convertInchesToTwip(0.3) } : undefined,
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({
      text, font: 'Georgia', size: 24,
      bold: opts.bold, italics: opts.italic,
      color: opts.color || '000000'
    })]
  });
}

/** Body paragraph with multiple styled runs. */
function bodyRuns(runs, opts = {}) {
  return new Paragraph({
    spacing: { before: opts.before || 120, after: opts.after || 60, line: 276 },
    alignment: opts.align || AlignmentType.LEFT,
    children: runs.map(r => new TextRun({
      text: r.text, font: 'Georgia', size: r.size || 24,
      bold: r.bold, italics: r.italic,
      color: r.color || '000000'
    }))
  });
}

/**
 * Heading level 2 — Georgia 16pt bold black.
 * Does NOT use HeadingLevel enum — that applies LibreOffice theme colors (blue).
 */
function heading2(text) {
  return new Paragraph({
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, font: 'Georgia', size: 32, bold: true, color: '000000' })]
  });
}

/**
 * Heading level 3 — Georgia 14pt bold black.
 * Same manual approach as heading2 to avoid theme color bleed.
 */
function heading3(text) {
  return new Paragraph({
    spacing: { before: 280, after: 100 },
    children: [new TextRun({ text, font: 'Georgia', size: 28, bold: true, color: '000000' })]
  });
}

/** Bullet point paragraph. */
function bulletP(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 60, line: 276 },
    bullet: { level: 0 },
    children: [new TextRun({ text, font: 'Georgia', size: 24, bold: opts.bold, italics: opts.italic })]
  });
}

/** Bullet point with multiple styled runs. */
function bulletRuns(runs) {
  return new Paragraph({
    spacing: { before: 80, after: 60, line: 276 },
    bullet: { level: 0 },
    children: runs.map(r => new TextRun({ text: r.text, font: 'Georgia', size: 24, bold: r.bold, italics: r.italic }))
  });
}

/** Horizontal divider line. */
function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: '444444' } },
    children: []
  });
}

/**
 * Discussion question block: numbered bold question, italic coaching note, ruled lines.
 */
function questionBlock(num, questionText, coachingText, notesCount = 4) {
  const items = [];
  items.push(bodyRuns([
    { text: `${num}. `, bold: true },
    { text: questionText, bold: true }
  ], { before: 200 }));
  items.push(bodyP(coachingText, { italic: true, before: 60 }));
  items.push(...ruled(notesCount));
  return items;
}

module.exports = {
  ruled, spacer, bodyP, bodyRuns, heading2, heading3,
  bulletP, bulletRuns, divider, questionBlock
};
