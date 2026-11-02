/*
 * A small Markdown reader for the Program screen's reference (M6, brief section 1): docs/program.md
 * as headings, paragraphs, lists, tables and images, for the screen to render as React elements.
 * Display only. The engine never reads program.md; its training content reaches the app through
 * data/program.json, transcribed by hand. It reads what pandoc's export uses and nothing else:
 * `#` headings, paragraphs, `-` and `1.` lists (loose or tight), pipe tables, `<img>` tags (source
 * and alt text only), HTML comments (skipped), `**bold**`, `*italic*` and backslash escapes. Any
 * other HTML is text, so nothing in the file can become markup.
 */

export type Inline = { kind: 'text'; text: string } | { kind: 'strong'; children: Inline[] } | { kind: 'em'; children: Inline[] }

export type Block =
  | { kind: 'heading'; level: number; id: string; text: string; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: Inline[][] }
  /** Each cell is its inlines; an empty cell is []. Every row has the header's width. */
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { kind: 'image'; src: string; alt: string }

export interface ContentsEntry {
  id: string
  text: string
  level: number
}

const ESCAPABLE = /[!-/:-@[-`{-~]/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const IMAGE = /^<img\b[^>]*>\s*$/i
const BULLET = /^[-*+]\s+(.*)$/
const NUMBERED = /^(\d+)[.)]\s+(.*)$/
const TABLE_RULE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

/** The few entities pandoc writes inside an attribute. */
function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name] ?? _)
}

/** The index of the next unescaped `marker` at or after `from` that closes a run (no space before it), or -1. */
function closing(text: string, from: number, marker: string): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') {
      i++
      continue
    }
    if (text.startsWith(marker, i) && i > from && !/\s/.test(text[i - 1] ?? '')) {
      // A single star that is half of a double one belongs to the double one.
      if (marker === '*' && text[i + 1] === '*') {
        i++
        continue
      }
      return i
    }
  }
  return -1
}

function merged(inlines: Inline[]): Inline[] {
  const out: Inline[] = []
  for (const inline of inlines) {
    const last = out[out.length - 1]
    if (inline.kind === 'text' && last?.kind === 'text') out[out.length - 1] = { kind: 'text', text: last.text + inline.text }
    else if (inline.kind !== 'text' || inline.text !== '') out.push(inline)
  }
  return out
}

/** One line's inline marks: `**bold**`, `*italic*` (nested either way) and backslash escapes; everything else is text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let buffer = ''
  const flush = () => {
    if (buffer !== '') out.push({ kind: 'text', text: buffer })
    buffer = ''
  }
  for (let i = 0; i < text.length; ) {
    const ch = text[i] ?? ''
    const next = text[i + 1] ?? ''
    if (ch === '\\' && ESCAPABLE.test(next)) {
      buffer += next
      i += 2
      continue
    }
    const marker = text.startsWith('**', i) ? '**' : ch === '*' ? '*' : null
    // A run opens on a star with no space after it and closes on one with no space before it.
    if (marker !== null && !/\s/.test(text[i + marker.length] ?? ' ')) {
      const end = closing(text, i + marker.length, marker)
      if (end !== -1) {
        flush()
        out.push({ kind: marker === '**' ? 'strong' : 'em', children: parseInline(text.slice(i + marker.length, end)) })
        i = end + marker.length
        continue
      }
    }
    buffer += ch
    i++
  }
  flush()
  return merged(out)
}

/** The words of inlines without their marks. */
export function plainText(inlines: readonly Inline[]): string {
  return inlines.map((i) => (i.kind === 'text' ? i.text : plainText(i.children))).join('')
}

/** A heading's id: its letters and digits, lowercased, runs of anything else one hyphen; "section" when nothing is left. */
export function headingSlug(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'section' : slug
}

/** A table row's cells: the outer pipes off, split on unescaped pipes, each trimmed, an escaped pipe kept as one. */
function cells(line: string): string[] {
  const body = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  const out: string[] = []
  let cell = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '\\' && body[i + 1] === '|') {
      cell += '\\|'
      i++
    } else if (ch === '|') {
      out.push(cell.trim())
      cell = ''
    } else cell += ch
  }
  out.push(cell.trim())
  return out
}

const cellInlines = (cell: string): Inline[] => (cell === '' ? [] : parseInline(cell))

function attribute(tag: string, name: string): string {
  return decodeEntities(new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1] ?? '')
}

/** A line that starts a block of its own, so a paragraph ends before it. */
function startsBlock(line: string, next: string | undefined): boolean {
  return HEADING.test(line) || IMAGE.test(line) || BULLET.test(line) || NUMBERED.test(line) || (line.startsWith('|') && next !== undefined && TABLE_RULE.test(next.trim()))
}

/** program.md as blocks, in order. Comments are skipped; every other line of text lands in a block. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n')
  const blocks: Block[] = []
  const taken = new Map<string, number>()
  const idFor = (text: string) => {
    const slug = headingSlug(text)
    const count = (taken.get(slug) ?? 0) + 1
    taken.set(slug, count)
    return count === 1 ? slug : `${slug}-${count}`
  }

  let i = 0
  const at = (n: number) => lines[n] ?? ''
  const blank = (n: number) => at(n).trim() === ''
  while (i < lines.length) {
    const line = at(i).trim()
    if (line === '') {
      i++
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const raw = heading[2] ?? ''
      const inlines = parseInline(raw)
      const text = plainText(inlines)
      blocks.push({ kind: 'heading', level: (heading[1] ?? '#').length, id: idFor(text), text, inlines })
      i++
      continue
    }

    if (IMAGE.test(line)) {
      blocks.push({ kind: 'image', src: attribute(line, 'src'), alt: attribute(line, 'alt') })
      i++
      continue
    }

    if (line.startsWith('|') && i + 1 < lines.length && TABLE_RULE.test(at(i + 1).trim())) {
      const header = cells(line).map(cellInlines)
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && at(i).trim().startsWith('|')) {
        const row = cells(at(i)).map(cellInlines).slice(0, header.length)
        while (row.length < header.length) row.push([])
        rows.push(row)
        i++
      }
      blocks.push({ kind: 'table', header, rows })
      continue
    }

    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    if (bullet || numbered) {
      const ordered = numbered !== null
      const marker = ordered ? NUMBERED : BULLET
      const textOf = (m: RegExpExecArray) => (ordered ? (m[2] ?? '') : (m[1] ?? ''))
      const items: string[] = []
      const start = ordered ? Number(numbered?.[1] ?? 1) : 1
      while (i < lines.length) {
        const m = marker.exec(at(i).trim())
        if (!m) break
        let item = textOf(m)
        i++
        // The item goes on over indented lines, and over a blank line to an indented one (a loose item's second paragraph).
        for (;;) {
          if (i < lines.length && !blank(i) && /^\s/.test(at(i)) && !marker.test(at(i).trim())) {
            item += ` ${at(i).trim()}`
            i++
            continue
          }
          let j = i
          while (j < lines.length && blank(j)) j++
          if (j > i && j < lines.length && /^\s/.test(at(j)) && !marker.test(at(j).trim())) {
            i = j
            continue
          }
          break
        }
        items.push(item)
        // A blank line between items keeps the list going when the next line is another item of the same kind.
        let j = i
        while (j < lines.length && blank(j)) j++
        if (j < lines.length && marker.test(at(j).trim())) i = j
        else break
      }
      blocks.push({ kind: 'list', ordered, start, items: items.map((t) => parseInline(t.replace(/\\$/, '').trim())) })
      continue
    }

    const paragraph: string[] = []
    while (i < lines.length && !blank(i) && (paragraph.length === 0 || !startsBlock(at(i).trim(), lines[i + 1]))) {
      // Pandoc's hard line break (a trailing backslash) reads as a space here.
      paragraph.push(at(i).trim().replace(/\\$/, '').trim())
      i++
    }
    blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join(' ')) })
  }
  return blocks
}

/** The headings under the title (level 2 and down), in order: the contents list's entries. */
export function contents(blocks: readonly Block[]): ContentsEntry[] {
  return blocks.flatMap((b) => (b.kind === 'heading' && b.level >= 2 ? [{ id: b.id, text: b.text, level: b.level }] : []))
}
