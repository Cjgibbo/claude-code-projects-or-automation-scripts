/**
 * AOP Template Engine — MUSTARD Guided Workbook Builder
 *
 * Assembles a complete MUSTARD guided workbook .docx from:
 *   - A content JSON file (series metadata + lesson data)
 *   - A catalog JSON file (back cover listings)
 *
 * Returns a Buffer ready to write to disk.
 *
 * MUSTARD is a standalone guided workbook — no separate Teacher's Guide.
 * It uses fill-in-the-blank and guided discovery format aimed at new
 * Christians and casual learners. An answer key ships as a separate
 * single-sheet insert (see mustard-key-builder.js).
 *
 * Page count strategy:
 *   - Cover is separate stock at the printer.
 *   - Body pages must be a multiple of 4 for saddle-stitch binding.
 *   - Notes page included by default for padding.
 *
 * Content JSON schema (mustard.json):
 *   meta: { imprint, imprintTag, title, subtitle, productType, productDesc }
 *   insideFrontCover: { heading, paragraphs[] }
 *   lessons[]: {
 *     num, title, keyIdea,
 *     scriptures[],
 *     keyTerms[]: { term, ref, definition },
 *     guidedDiscovery[]: {
 *       num, text,
 *       lines?        — ruled lines for open response (default 3)
 *       fillBlanks?   — string of blanks to render (e.g. "_______ , _______")
 *       scale?        — true renders "1 · · · · 5 · · · · 10"
 *       sentence?     — finish-the-sentence template text
 *       fields?       — [{label, lines}] labeled fill-in fields
 *       followUp?     — {text, lines} follow-up question after main answer area
 *     },
 *     sitWith,
 *     challenge,
 *     notesPrompts[]: { text, lines? }
 *   }
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
 * Render a single guided-discovery question.
 *
 * Supports multiple answer formats:
 *   - fillBlanks: renders a line of underscores/blanks
 *   - scale: renders a 1–10 scale
 *   - sentence: renders a fill-in-the-sentence template
 *   - fields: renders labeled blank fields
 *   - (default): renders ruled lines for open-ended response
 *
 * Any question may also have a followUp — a secondary question
 * rendered after the main answer area.
 */
function renderQuestion(q) {
  const items = [];

  // Question text (bold, numbered)
  items.push(bodyRuns([
    { text: `${q.num}. `, bold: true },
    { text: q.text, bold: true }
  ], { before: 200 }));

  // Main answer area — determined by question type
  if (q.fillBlanks) {
    // Fill-in-the-blank: render the blank template
    items.push(bodyP(q.fillBlanks, { before: 100 }));
  } else if (q.scale) {
    // 1–10 scale
    items.push(new Paragraph({
      spacing: { before: 100, after: 60, line: 276 },
      children: [new TextRun({
        text: '1 · · · · 5 · · · · 10',
        font: 'Georgia', size: 24, color: '000000'
      })]
    }));
  } else if (q.sentence) {
    // Finish-the-sentence template
    items.push(bodyP(q.sentence, { before: 100 }));
  } else if (q.fields) {
    // Labeled fields (e.g., "Description 1: _____________")
    items.push(spacer(60));
    for (const field of q.fields) {
      items.push(bodyRuns([{ text: field.label, bold: true }], { before: 120 }));
      items.push(...ruled(field.lines || 1));
    }
  } else {
    // Default: open-ended with ruled lines
    items.push(...ruled(q.lines || 3));
  }

  // Follow-up question (if present)
  if (q.followUp) {
    items.push(bodyP(q.followUp.text, { before: 120 }));
    items.push(...ruled(q.followUp.lines || 2));
  }

  return items;
}

/**
 * Build a single lesson's content from its data object.
 *
 * MUSTARD lessons have a fixed structure:
 *   1. Lesson heading
 *   2. Key Idea
 *   3. This Week's Scriptures (bullet list)
 *   4. Key Terms (bold term + definition)
 *   5. Guided Discovery (various question types)
 *   6. Something to Sit With (pondering close — not in the SW)
 *   7. This Week's Challenge
 *   8. My Notes
 */
function buildLesson(lesson) {
  const children = [];

  // ── Lesson heading ──
  children.push(new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [new TextRun({
      text: `Lesson ${lesson.num}`,
      font: 'Georgia', size: 36, bold: true, color: '000000'
    })]
  }));
  children.push(new Paragraph({
    spacing: { before: 0, after: 200 },
    children: [new TextRun({
      text: lesson.title,
      font: 'Georgia', size: 28, italics: true
    })]
  }));

  // ── Key Idea ──
  children.push(bodyRuns([
    { text: 'Key Idea: ', bold: true },
    { text: lesson.keyIdea }
  ]));

  // ── This Week's Scriptures ──
  children.push(heading3("This Week's Scriptures"));
  children.push(bodyP(
    "Look up and read each passage before you start the questions.",
    { italic: true }
  ));
  for (const ref of lesson.scriptures) {
    children.push(bulletP(ref));
  }

  // ── Key Terms ──
  children.push(heading3('Key Terms'));
  for (const term of lesson.keyTerms) {
    children.push(bodyRuns([
      { text: term.term, bold: true },
      { text: ` (${term.ref}) — ${term.definition}` }
    ]));
  }

  // ── Guided Discovery ──
  children.push(heading3('Guided Discovery'));
  children.push(bodyP(
    "Open your Bible and work through these. Write your answers in the spaces.",
    { italic: true }
  ));
  for (const q of lesson.guidedDiscovery) {
    children.push(...renderQuestion(q));
  }

  // ── Something to Sit With ──
  children.push(heading3('Something to Sit With'));
  children.push(bodyP(lesson.sitWith, { italic: true }));

  // ── This Week's Challenge ──
  children.push(heading3("This Week's Challenge"));
  children.push(bodyP(lesson.challenge));
  // Challenge always gets 3 ruled lines for writing
  children.push(...ruled(3));

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
async function buildMustardWorkbook(content, catalog) {
  // Build all lesson content
  const lessonChildren = content.lessons.map(lesson => buildLesson(lesson));

  // Assemble sections
  const coverSection = buildCover(content.meta);
  const insideFrontCover = buildInsideFrontCover(content.insideFrontCover);

  // Each lesson gets its own page-break section
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

module.exports = { buildMustardWorkbook };
