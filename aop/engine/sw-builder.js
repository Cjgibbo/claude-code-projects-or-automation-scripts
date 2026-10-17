/**
 * AOP Template Engine — Student Workbook Builder
 *
 * Assembles a complete Student Workbook .docx from:
 *   - A content JSON file (series metadata + lesson data)
 *   - A catalog JSON file (back cover listings)
 *
 * Returns a Buffer ready to write to disk.
 *
 * The Student Workbook is pre-class homework — every question feeds a
 * corresponding teacher discussion question (the preparation loop).
 *
 * Page count strategy (same as TG):
 *   - Cover is separate stock at the printer.
 *   - Body pages must be a multiple of 4 for saddle-stitch binding.
 *   - Notes page included by default for padding.
 */

const docx = require('docx');
const {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, SectionType, convertInchesToTwip
} = docx;

const {
  ruled, spacer, bodyP, bodyRuns, heading2, heading3,
  bulletP, divider
} = require('./helpers');

const {
  buildCover, buildInsideFrontCover, buildNotesPage, buildBackCover
} = require('./sections');

// ── Standard page properties for body sections ──
const pageProps = {
  page: {
    size: { width: 12240, height: 15840 },
    margin: {
      top: convertInchesToTwip(1),
      bottom: convertInchesToTwip(1),
      left: convertInchesToTwip(1),
      right: convertInchesToTwip(1.5),
    },
  },
};

/**
 * Build a single lesson's content from its data object.
 * SW lessons have a fixed structure: scriptures, key idea, key terms,
 * questions with ruled lines, reflection, challenge, and notes.
 */
function buildLesson(lesson) {
  const children = [];

  // ── Lesson heading (matches TG style) ──
  children.push(new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text: `Lesson ${lesson.num}`, font: 'Georgia', size: 36, bold: true, color: '000000' })]
  }));
  children.push(new Paragraph({
    spacing: { before: 0, after: 200 },
    children: [new TextRun({ text: lesson.title, font: 'Georgia', size: 28, italics: true })]
  }));

  // ── This Week's Scriptures ──
  children.push(heading3("This Week's Scriptures"));
  children.push(bodyP(
    "Look up and read each passage before class. Mark anything that stands out to you.",
    { italic: true }
  ));
  for (const ref of lesson.scriptures) {
    children.push(bulletP(ref));
  }

  // ── Key Idea ──
  children.push(heading3('Key Idea'));
  children.push(bodyP(lesson.keyIdea));

  // ── Key Terms ──
  children.push(heading3('Key Terms'));
  for (const term of lesson.keyTerms) {
    children.push(bodyRuns([
      { text: term.term, bold: true },
      { text: ` ${term.ref} — ${term.definition}` }
    ]));
  }

  // ── Read & Answer Before Class ──
  children.push(heading3('Read & Answer Before Class'));
  children.push(bodyP(
    "Read each Scripture passage listed above, then answer the questions below. Write enough that you'll remember your thinking when class discussion starts.",
    { italic: true }
  ));
  for (const q of lesson.questions) {
    children.push(bodyRuns([
      { text: `${q.num}. `, bold: true },
      { text: q.text, bold: true }
    ], { before: 200 }));
    children.push(...ruled(q.lines || 3));
  }

  // ── Something to Think About ──
  children.push(heading3('Something to Think About'));
  children.push(bodyP(lesson.thinkAbout, { italic: true }));

  // ── This Week's Challenge ──
  children.push(heading3(lesson.challengeHeading || "This Week's Challenge"));
  children.push(bodyP(lesson.challenge));
  if (lesson.challengeFields) {
    children.push(spacer(60));
    for (const field of lesson.challengeFields) {
      children.push(bodyRuns([{ text: field.label, bold: true }], { before: 120 }));
      children.push(...ruled(field.lines || 1));
    }
  }

  // ── My Notes ──
  children.push(heading3('My Notes'));
  for (const prompt of lesson.notesPrompts) {
    children.push(bodyRuns([{ text: prompt.text, bold: true }], { before: 160 }));
    children.push(...ruled(prompt.lines || 3));
  }

  return children;
}

/**
 * Main build function.
 *
 * @param {Object} content  - Parsed content JSON (meta + insideFrontCover + lessons)
 * @param {Object} catalog  - Parsed catalog JSON (back cover listings)
 * @returns {Promise<Buffer>} - The .docx file as a buffer
 */
async function buildStudentWorkbook(content, catalog) {
  // Build all lesson content
  const lessonChildren = content.lessons.map(lesson => buildLesson(lesson));

  // Assemble sections
  const coverSection = buildCover(content.meta);
  const insideFrontCover = buildInsideFrontCover(content.insideFrontCover);

  // Each lesson gets its own page-break section (no overview in SW)
  const lessonSections = lessonChildren.map(children => ({
    properties: { type: SectionType.NEXT_PAGE, ...pageProps },
    children,
  }));

  const notesPage = buildNotesPage();
  const backCover = buildBackCover(catalog);

  // Assemble document — Notes page included by default for padding
  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
          run: { font: 'Georgia', size: 28, bold: true, color: '000000' },
        },
        {
          id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal',
          run: { font: 'Georgia', size: 26, bold: true, color: '000000' },
        },
      ],
    },
    numbering: {
      config: [{
        reference: 'default-bullet',
        levels: [{
          level: 0,
          format: docx.LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) }
            }
          }
        }]
      }]
    },
    sections: [
      coverSection,
      insideFrontCover,
      ...lessonSections,
      notesPage,
      backCover,
    ]
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildStudentWorkbook };
