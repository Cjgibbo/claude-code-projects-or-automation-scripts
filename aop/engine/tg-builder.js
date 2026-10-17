/**
 * AOP Template Engine — Teacher's Guide Builder
 *
 * Assembles a complete Teacher's Guide .docx from:
 *   - A content JSON file (series metadata + lesson data)
 *   - A catalog JSON file (back cover listings)
 *
 * Returns a Buffer ready to write to disk.
 *
 * Page count strategy:
 *   - Cover is separate stock at the printer (different sheet/tray).
 *   - Body pages must be a multiple of 4 for saddle-stitch binding.
 *   - If 1 page short, a Notes page is inserted before the back cover.
 *   - The builder always includes the Notes page by default — remove only
 *     if the body already lands on a multiple of 4 without it.
 */

const docx = require('docx');
const {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, SectionType, convertInchesToTwip
} = docx;

const {
  ruled, spacer, bodyP, bodyRuns, heading2, heading3,
  bulletP, bulletRuns, divider, questionBlock
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
 * This is the core rendering function — it maps the content JSON's
 * section types to docx paragraph objects.
 */
function buildLesson(lesson) {
  const { num, title, aim, scriptures, time, beforeClass, sections } = lesson;
  const children = [];

  // Lesson heading
  children.push(new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text: `Lesson ${num}`, font: 'Georgia', size: 36, bold: true, color: '000000' })]
  }));
  children.push(new Paragraph({
    spacing: { before: 0, after: 200 },
    children: [new TextRun({ text: title, font: 'Georgia', size: 28, italics: true })]
  }));

  // Metadata block
  children.push(bodyRuns([{ text: 'Aim: ', bold: true }, { text: aim }]));
  children.push(bodyRuns([{ text: 'Scripture Texts: ', bold: true }, { text: scriptures.join(', ') }]));
  children.push(bodyRuns([{ text: 'Estimated Time: ', bold: true }, { text: time }]));
  children.push(bodyRuns([{ text: 'Before Class: ', bold: true }, { text: beforeClass }]));
  children.push(divider());

  // Process content sections
  for (const section of sections) {
    switch (section.type) {
      case 'heading':
        children.push(heading3(section.text));
        break;
      case 'body':
        children.push(bodyP(section.text));
        break;
      case 'bodyBold':
        children.push(bodyRuns([{ text: section.label, bold: true }, { text: ' ' + section.text }]));
        break;
      case 'notes':
        children.push(heading3('Notes'));
        children.push(...ruled(section.count || 5));
        break;
      case 'question':
        children.push(...questionBlock(section.num, section.question, section.coaching, section.lines || 4));
        break;
      case 'questionIntro':
        children.push(bodyP(section.text, { italic: true }));
        break;
      case 'closingPrompt':
        children.push(bodyRuns([{ text: section.text, bold: true }], { before: 200 }));
        children.push(bodyP(section.instruction, { italic: true }));
        break;
      case 'closingBullet':
        children.push(bulletRuns([{ text: section.label, bold: true }, { text: ' ' + section.text }]));
        break;
      case 'closingNotes':
        children.push(heading3('Closing Notes'));
        children.push(...ruled(section.count || 5));
        break;
      case 'divider':
        children.push(divider());
        break;
      case 'bullet':
        children.push(bulletP(section.text, { bold: section.bold }));
        break;
    }
  }

  return children;
}

/**
 * Build the series overview + lesson 1 combined section.
 */
function buildOverviewSection(content, lesson1Children) {
  const overviewChildren = [];

  overviewChildren.push(heading2(`Series Overview: ${content.meta.title} — ${content.meta.subtitle}`));
  overviewChildren.push(bodyRuns([{ text: 'Imprint: ', bold: true }, { text: `${content.meta.imprint} (${content.meta.imprintTag})` }]));
  overviewChildren.push(bodyRuns([{ text: 'Length: ', bold: true }, { text: `${content.lessons.length} lessons (1 month)` }]));
  overviewChildren.push(bodyRuns([{ text: 'Target: ', bold: true }, { text: content.meta.target || 'Adult Bible class, 45–60 minutes per session' }]));
  overviewChildren.push(spacer(100));

  for (const lesson of content.lessons) {
    overviewChildren.push(bodyRuns([
      { text: `Lesson ${lesson.num}: `, bold: true },
      { text: `${lesson.title} — ${lesson.summary || lesson.aim.split(',')[0]}` }
    ]));
  }
  overviewChildren.push(divider());

  return {
    properties: { type: SectionType.NEXT_PAGE, ...pageProps },
    children: [...overviewChildren, ...lesson1Children],
  };
}

/**
 * Main build function.
 *
 * @param {Object} content  - Parsed content JSON (meta + insideFrontCover + lessons)
 * @param {Object} catalog  - Parsed catalog JSON (back cover listings)
 * @returns {Promise<Buffer>} - The .docx file as a buffer
 */
async function buildTeachersGuide(content, catalog) {
  // Build all lesson content
  const lessonChildren = content.lessons.map(lesson => buildLesson(lesson));

  // Assemble sections
  const coverSection = buildCover(content.meta);
  const insideFrontCover = buildInsideFrontCover(content.insideFrontCover);
  const overviewAndLesson1 = buildOverviewSection(content, lessonChildren[0]);

  // Lessons 2+ each get their own section
  const lessonSections = lessonChildren.slice(1).map(children => ({
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
      overviewAndLesson1,
      ...lessonSections,
      notesPage,
      backCover,
    ]
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildTeachersGuide };
