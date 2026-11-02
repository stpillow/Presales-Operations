import { describe, expect, it } from 'vitest'
import programMd from '../../docs/program.md?raw'
import { contents, headingSlug, parseInline, parseMarkdown, plainText, type Block, type Inline } from './markdown.ts'

// The Program screen's reference (M6, brief section 1): program.md parsed into headings, paragraphs,
// lists, tables and images, for display only. The engine never reads it; the seed is data/program.json.

const text = (t: string): Inline => ({ kind: 'text', text: t })

describe('parseInline', () => {
  it('reads bold and italic, nested, and leaves the rest as text', () => {
    expect(parseInline('Plain words')).toEqual([text('Plain words')])
    expect(parseInline('**Session A**')).toEqual([{ kind: 'strong', children: [text('Session A')] }])
    expect(parseInline('*Transcribed (the image is the source):* **Criteria open each gate.**')).toEqual([
      { kind: 'em', children: [text('Transcribed (the image is the source):')] },
      text(' '),
      { kind: 'strong', children: [text('Criteria open each gate.')] },
    ])
    expect(parseInline('a **b *c* d** e')).toEqual([text('a '), { kind: 'strong', children: [text('b '), { kind: 'em', children: [text('c')] }, text(' d')] }, text(' e')])
  })

  it('takes backslash escapes literally: \\# and \\$ are the characters', () => {
    expect(parseInline('\\#')).toEqual([text('#')])
    expect(parseInline('about \\$20 total, \\*not italic\\*')).toEqual([text('about $20 total, *not italic*')])
  })

  it('leaves a lone or spaced star alone: 3 * 4 is not italic', () => {
    expect(parseInline('3 * 4 * 5')).toEqual([text('3 * 4 * 5')])
    expect(parseInline('**not closed')).toEqual([text('**not closed')])
    expect(parseInline('a ** b ** c')).toEqual([text('a ** b ** c')])
  })

  it('never reads HTML: tags stay text, to be rendered as text', () => {
    expect(parseInline('<b>bold</b> & <script>x</script>')).toEqual([text('<b>bold</b> & <script>x</script>')])
  })
})

describe('parseMarkdown: blocks', () => {
  it('reads headings with an id each, paragraphs joined across lines, and skips comments', () => {
    const blocks = parseMarkdown('<!--\nExported from somewhere.\n-->\n\n# Title\n\nOne line\nand the next.\n\n## Phase 1: Foundation (weeks 1–3)\n\nText.')
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, id: 'title', text: 'Title', inlines: [text('Title')] },
      { kind: 'paragraph', inlines: [text('One line and the next.')] },
      { kind: 'heading', level: 2, id: 'phase-1-foundation-weeks-1-3', text: 'Phase 1: Foundation (weeks 1–3)', inlines: [text('Phase 1: Foundation (weeks 1–3)')] },
      { kind: 'paragraph', inlines: [text('Text.')] },
    ])
  })

  it('reads a loose list (items apart) as one list, and an ordered list with its start', () => {
    const blocks = parseMarkdown('- First\n\n- Second\n  goes on\n\n1.  One\n\n2.  Two\n\nAfter.')
    expect(blocks).toEqual([
      { kind: 'list', ordered: false, start: 1, items: [[text('First')], [text('Second goes on')]] },
      { kind: 'list', ordered: true, start: 1, items: [[text('One')], [text('Two')]] },
      { kind: 'paragraph', inlines: [text('After.')] },
    ])
  })

  it('reads a pipe table: the header, each row padded or cut to the header’s width, an escaped pipe kept in its cell', () => {
    const blocks = parseMarkdown('| \\#  | Exercise | Cues |\n|-----|----------|------|\n| 1   | Leg press | Feet high \\| wide |\n| 2   | Leg curl |\n| 3 | Row | a | extra |')
    expect(blocks).toEqual([
      {
        kind: 'table',
        header: [[text('#')], [text('Exercise')], [text('Cues')]],
        rows: [
          [[text('1')], [text('Leg press')], [text('Feet high | wide')]],
          [[text('2')], [text('Leg curl')], []],
          [[text('3')], [text('Row')], [text('a')]],
        ],
      },
    ])
  })

  it('reads an image tag’s source and alt text, and nothing else from it', () => {
    expect(parseMarkdown('<img src="media/image1.png" style="width:6in" alt="four phases &amp; three gates" />')).toEqual([{ kind: 'image', src: 'media/image1.png', alt: 'four phases & three gates' }])
  })

  it('a pipe line with no separator under it is a paragraph, not a table', () => {
    expect(parseMarkdown('| not a table |')).toEqual([{ kind: 'paragraph', inlines: [text('| not a table |')] }])
  })

  it('gives two headings with the same words their own ids', () => {
    const ids = parseMarkdown('## Notes\n\n## Notes\n\n## Notes').map((b) => (b.kind === 'heading' ? b.id : ''))
    expect(ids).toEqual(['notes', 'notes-2', 'notes-3'])
  })

  it('reads CRLF line ends like LF', () => {
    expect(parseMarkdown('# Title\r\n\r\nText.\r\n')).toEqual(parseMarkdown('# Title\n\nText.\n'))
  })
})

describe('headingSlug, plainText and contents', () => {
  it('slugs a heading to lowercase words and digits joined by hyphens', () => {
    expect(headingSlug('Operating rules: criteria, not calendar')).toBe('operating-rules-criteria-not-calendar')
    expect(headingSlug('Phase 3: Power, deceleration and lacrosse prep (weeks 8–12, Dec 21–Jan 24)')).toBe('phase-3-power-deceleration-and-lacrosse-prep-weeks-8-12-dec-21-jan-24')
    expect(headingSlug('—')).toBe('section')
  })

  it('reads the words of inlines without their marks', () => {
    expect(plainText(parseInline('a **b *c* d** e'))).toBe('a b c d e')
  })

  it('lists the headings under the title, in order', () => {
    const blocks = parseMarkdown('# Title\n\n## One\n\nx\n\n### One A\n\n## Two')
    expect(contents(blocks)).toEqual([
      { id: 'one', text: 'One', level: 2 },
      { id: 'one-a', text: 'One A', level: 3 },
      { id: 'two', text: 'Two', level: 2 },
    ])
  })
})

describe('docs/program.md, as the Program screen shows it', () => {
  const blocks = parseMarkdown(programMd)
  const tables = blocks.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
  const lists = blocks.filter((b): b is Extract<Block, { kind: 'list' }> => b.kind === 'list')
  const cell = (inlines: Inline[]) => plainText(inlines)

  it('has the title and the nine sections, in program.md’s order', () => {
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1, text: 'Knee Rebuild: Full-Body Program' })
    expect(contents(blocks).map((c) => c.text)).toEqual([
      'Where you are',
      'Operating rules: criteria, not calendar',
      'Weekly template',
      'Phase 1: Foundation (weeks 1–3, Nov 2–22)',
      'Phase 2: Single-leg strength and balance (weeks 4–7, Nov 23–Dec 20)',
      'Phase 3: Power, deceleration and lacrosse prep (weeks 8–12, Dec 21–Jan 24)',
      'Running and cardio',
      'Warm-up, mobility and recovery',
      'Red flags',
      'Setup notes and substitutions',
    ])
  })

  it('leaves the export comment out and keeps the two chart images with their alt text', () => {
    expect(blocks.some((b) => JSON.stringify(b).includes('Exported from'))).toBe(false)
    expect(blocks.filter((b) => b.kind === 'image')).toEqual([
      { kind: 'image', src: 'media/image1.png', alt: 'four phases, three gates · estimated dates from Nov 2, 2026' },
      { kind: 'image', src: 'media/image2.png', alt: 'typed from the plan above · 12 weeks from Nov 2, 2026' },
    ])
  })

  it('reads Session A’s table: the header with its escaped #, nine rows, the cues verbatim', () => {
    const sessionA = tables.find((t) => t.rows.some((r) => cell(r[1] ?? []) === 'Leg press, both legs'))
    expect(sessionA?.header.map(cell)).toEqual(['#', 'Exercise', 'Sets × reps', 'Cues'])
    expect(sessionA?.rows).toHaveLength(9)
    expect(sessionA?.rows[0]?.map(cell)).toEqual(['1', 'Leg press, both legs', '3 × 10–12, RPE 6→7', 'Feet high and shoulder-width; lower for 3 s; stop at 90° or wherever pain stays at 3 or under; no hard lockout'])
    expect(sessionA?.rows[2]?.[3]).toEqual([])
  })

  it('reads the mileage plan’s twelve weeks and the substitutions table', () => {
    const mileage = tables.find((t) => cell(t.header[0] ?? []) === 'Week')
    expect(mileage?.rows.map((r) => cell(r[2] ?? []))).toEqual(['10', '11', '12', '9', '13', '14', '15', '11', '16', '17', '18', '14'])
    const subs = tables.find((t) => cell(t.header[0] ?? []) === 'Taken or missing')
    expect(subs?.rows).toHaveLength(11)
  })

  it('reads the red flags as one list of seven, and the Phase 4 preview as an ordered list of five', () => {
    const flags = lists.find((l) => cell(l.items[0] ?? []).startsWith('Swelling that shows up within hours'))
    expect(flags?.items).toHaveLength(7)
    expect(lists.find((l) => l.ordered && cell(l.items[0] ?? []) === 'Wall ball and shooting with jog footwork')?.items).toHaveLength(5)
  })

  it('keeps the escaped dollar sign', () => {
    expect(blocks.some((b) => b.kind === 'paragraph' && plainText(b.inlines).includes('about $20 total'))).toBe(true)
  })

  it('drops no words: every word of program.md outside the comment and the image tags is on screen, in order', () => {
    const source = programMd
      .replace(/<!--[\s\S]*?-->/g, '')
      .split('\n')
      .filter((line) => !/^<img\b/.test(line))
      .map((line) => line.replace(/^\s*(\d+[.)]|[-*+])\s+/, ''))
      .join('\n')
    const words = (t: string) => t.match(/[\p{L}\p{N}]+/gu) ?? []
    const shown = blocks.flatMap((b): string[] => {
      switch (b.kind) {
        case 'heading':
          return [b.text]
        case 'paragraph':
          return [plainText(b.inlines)]
        case 'list':
          return b.items.map(plainText)
        case 'table':
          return [...b.header, ...b.rows.flat()].map(plainText)
        case 'image':
          return []
      }
    })
    expect(words(shown.join(' '))).toEqual(words(source))
  })
})
