/**
 * AOP Template Engine — MUSTARD Answer Key Builder
 *
 * Assembles a single loose-leaf answer key insert (front/back, 2 pages)
 * for a MUSTARD guided workbook series.
 *
 * Returns a Buffer ready to write to disk.
 *
 * The answer key is NOT saddle-stitched — it's a single sheet folded
 * or inserted loose into the workbook. No cover, no back cover.
 * No multiple-of-4 page constraint.
 *
 * Content JSON schema (key.json):
 *   meta: { title, subtitle }
 *   intro: string — how-to-use paragraph
 *   lessons[]: {
 *     num, title,
 *     answers[]: {
 *       num,
 *       answer — direct answer text (or "Personal response." etc.)
 *       note?  — italic guidance text for the leader
 *     }
 *   }
 *   footer?: string — e.g. "Printable PDF version available at..."
 */

const docx = require('docx');
const {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, BorderStyle, convertInchesToTwip
} = docx;

const { spacer, bodyP, bodyRuns, divider } = require('./helpers');

// ── Page size constants (US Letter in DXA) ──
const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;

/**
 * Build the answer key header (title block).
 */
function buildHeader(meta) {
  return [
    spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({
        text: `${meta.title} — Leader's Answer Key`,
        font: 'Georgia', size: 32, bold: true, color: '000000'
      })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({
        text: meta.subtitle || '',
        font: 'Georgia', size: 24, italics: true, color: '000000'
      })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({
        text: 'Ancient Order Publishing — MUSTARD Series',
        font: 'Georgia', size: 20, italics: true, color: '444444'
      })]
    }),
  ];
}

/**
 * Build all lesson answer blocks.
 */
function buildAnswers(lessons) {
  const children = [];

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];

    // Divider between lessons
    if (i > 0) children.push(divider());

    // Lesson heading — compact for the answer key
    children.push(new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [new TextRun({
        text: `Lesson ${lesson.num}: ${lesson.title}`,
        font: 'Georgia', size: 26, bold: true, color: '000000'
      })]
    }));

    // Each answer
    for (const a of lesson.answers) {
      const runs = [
        { text: `${a.num}. `, bold: true }
      ];

      if (a.answer) {
        runs.push({ text: a.answer });
      }

      if (a.note) {
        // Add space before italic note if there was answer text
        if (a.answer) {
          runs.push({ text: ' ' });
        }
        runs.push({ text: a.note, italic: true });
      }

      children.push(bodyRuns(runs, { before: 80, after: 40 }));
    }
  }

  return children;
}

/**
 * Main build function.
 *
 * @param {Object} content  - Parsed answer key JSON (meta + intro + lessons + answers)
 * @returns {Promise<Buffer>} - The .docx file as a buffer
 */
async function buildAnswerKey(content) {
  const headerBlock = buildHeader(content.meta);
  const answersBlock = buildAnswers(content.lessons);

  const footerChildren = [];
  if (content.footer) {
    footerChildren.push(divider());
    footerChildren.push(bodyP(content.footer, { italic: true, align: AlignmentType.CENTER }));
  }

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: 'Normal', name: 'Normal',
          run: { font: 'Georgia', size: 20, color: '000000' },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: {
            top: convertInchesToTwip(0.75),
            bottom: convertInchesToTwip(0.75),
            left: convertInchesToTwip(0.75),
            right: convertInchesToTwip(0.75),
          },
        },
      },
      children: [
        ...headerBlock,
        bodyP(content.intro, { before: 160, after: 120 }),
        ...answersBlock,
        ...footerChildren,
      ],
    }]
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildAnswerKey };
