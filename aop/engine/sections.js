/**
 * AOP Template Engine — Section Builders
 *
 * Parameterized builders for the structural sections of every booklet:
 * cover page, inside front cover, back cover/catalog, notes page.
 * Each accepts content data and returns a docx section object.
 */

const {
  Paragraph, TextRun, AlignmentType, BorderStyle,
  SectionType, convertInchesToTwip
} = require('docx');

const { spacer, bodyP, bulletP, divider, heading2, bodyRuns, ruled } = require('./helpers');

// ── Page size constants (US Letter in DXA) ──
const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;

/**
 * Build the front cover section.
 *
 * @param {Object} meta - Series metadata
 * @param {string} meta.imprint     - e.g. "ALEXANDER"
 * @param {string} meta.imprintTag  - e.g. "Learn"
 * @param {string} meta.title       - e.g. "Prayer"
 * @param {string} meta.subtitle    - e.g. "Drawing Near to God"
 * @param {string} meta.productType - e.g. "Teacher's Guide"
 * @param {string} meta.productDesc - e.g. "A Four-Lesson Study for Adult Bible Classes"
 */
function buildCover(meta) {
  return {
    properties: {
      page: {
        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1), right: convertInchesToTwip(1) },
      },
      pageNumbers: { start: undefined },
    },
    children: [
      spacer(2400),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: 'ANCIENT ORDER PUBLISHING', font: 'Georgia', size: 22, bold: true, characterSpacing: 200 })]
      }),
      spacer(120),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 2, color: '333333', space: 8 },
          bottom: { style: BorderStyle.SINGLE, size: 2, color: '333333', space: 8 }
        },
        children: [new TextRun({ text: `${meta.imprint}  Series`, font: 'Georgia', size: 20, italics: true, characterSpacing: 100 })]
      }),
      spacer(600),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: meta.title, font: 'Georgia', size: 52, bold: true })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: meta.subtitle, font: 'Georgia', size: 32, italics: true })]
      }),
      spacer(600),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        border: { top: { style: BorderStyle.SINGLE, size: 1, color: '555555', space: 12 } },
        children: [new TextRun({ text: meta.productType, font: 'Georgia', size: 28, bold: true })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [new TextRun({ text: meta.productDesc, font: 'Georgia', size: 20, italics: true })]
      }),
    ]
  };
}

/**
 * Build the inside front cover section.
 *
 * @param {Object} content
 * @param {string} content.heading     - e.g. "How to Use This Guide"
 * @param {Array}  content.paragraphs  - Array of strings or {label, text} objects
 */
function buildInsideFrontCover(content) {
  const children = [spacer(400), heading2(content.heading)];

  for (const item of content.paragraphs) {
    if (typeof item === 'string') {
      children.push(bodyP(item));
    } else if (item.label && item.text) {
      children.push(bodyRuns([
        { text: item.label, bold: true },
        { text: ' ' + item.text }
      ]));
    }
  }

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1), right: convertInchesToTwip(1.5) },
      },
    },
    children,
  };
}

/**
 * Build the Notes filler page (used when body needs padding to hit a multiple of 4).
 */
function buildNotesPage() {
  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.5), right: convertInchesToTwip(1) },
      },
    },
    children: [
      new Paragraph({
        spacing: { before: 200, after: 200 },
        children: [new TextRun({ text: 'Notes', font: 'Georgia', size: 32, bold: true, color: '000000' })]
      }),
      ...ruled(18),
    ]
  };
}

/**
 * Build the back cover / catalog section.
 *
 * @param {Object} catalog - Catalog data from shared/catalog.json
 * @param {Array}  catalog.imprints - Array of { name, tag, description, titles[] }
 */
function buildBackCover(catalog) {
  const children = [
    spacer(400),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: 'Also from Ancient Order Publishing', font: 'Georgia', size: 28, bold: true })]
    }),
    spacer(200),
    divider(),
    spacer(100),
  ];

  for (const imprint of catalog.imprints) {
    children.push(new Paragraph({
      spacing: { before: 200, after: 40 },
      children: [new TextRun({ text: `${imprint.name}  —  ${imprint.tag}`, font: 'Georgia', size: 24, bold: true, characterSpacing: 80 })]
    }));
    children.push(bodyP(imprint.description, { italic: true, before: 0 }));
    children.push(spacer(60));
    for (const title of imprint.titles) {
      children.push(bulletP(title));
    }
    children.push(spacer(200));
  }

  children.push(divider());
  children.push(spacer(100));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 60 },
    children: [new TextRun({ text: 'Ancient Order Publishing', font: 'Georgia', size: 20, bold: true })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [new TextRun({ text: 'A division of Sturm & Róisín LLC', font: 'Georgia', size: 18, italics: true })]
  }));

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        margin: { top: convertInchesToTwip(1.25), bottom: convertInchesToTwip(1.25), left: convertInchesToTwip(1), right: convertInchesToTwip(1) },
      },
    },
    children,
  };
}

module.exports = { buildCover, buildInsideFrontCover, buildNotesPage, buildBackCover, PAGE_WIDTH, PAGE_HEIGHT };
