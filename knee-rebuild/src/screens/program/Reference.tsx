import { Fragment, type ReactNode } from 'react'
import programMd from '../../../docs/program.md?raw'
import phasesChart from '../../../docs/media/image1.png'
import mileageChart from '../../../docs/media/image2.png'
import { contents, parseMarkdown, plainText, type Block, type Inline } from '../../rules/markdown.ts'
import { tableLayout } from '../Program.helpers.ts'
import { LABEL } from './parts.tsx'

/*
 * program.md as reference (M6 brief section 1): the file bundled at build time (`?raw`), read into
 * blocks by src/rules/markdown.ts and rendered as React elements, so no HTML string is ever set and
 * nothing in the file becomes markup. Display only: the engine runs on data/program.json. The two
 * chart images are bundled assets; an image the bundle doesn't hold shows its alt text, never a fetch.
 */

const BLOCKS: readonly Block[] = parseMarkdown(programMd)
const CONTENTS = contents(BLOCKS)
const IMAGES: Readonly<Record<string, string>> = { 'media/image1.png': phasesChart, 'media/image2.png': mileageChart }
/** Heading ids carry a prefix so they never meet another element's id. */
const ID_PREFIX = 'program-md-'
const CONTENTS_ID = 'program-md-contents'
const FIRST_SECTION = CONTENTS[0]?.id

/** Hash routes own the URL's fragment, so a jump scrolls and moves focus instead of following an #anchor. */
function jumpTo(id: string): void {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ block: 'start' })
  target.focus({ preventScroll: true })
}

export function Reference() {
  return (
    <div className="flex flex-col gap-8">
      <nav id={CONTENTS_ID} tabIndex={-1} aria-labelledby={`${CONTENTS_ID}-label`} className="flex flex-col gap-2 outline-none">
        <h2 id={`${CONTENTS_ID}-label`} className={LABEL}>
          Contents
        </h2>
        <ol className="flex flex-col">
          {CONTENTS.map((entry) => (
            <li key={entry.id} className={entry.level > 2 ? 'pl-4' : ''}>
              <button type="button" onClick={() => jumpTo(`${ID_PREFIX}${entry.id}`)} className="tap w-full py-2 text-left text-body text-on-dark underline underline-offset-4 wrap-anywhere">
                {entry.text}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <article aria-label="program.md" className="flex flex-col gap-4">
        {BLOCKS.map((block, i) => (
          <Fragment key={i}>
            {block.kind === 'heading' && block.level === 2 && block.id !== FIRST_SECTION ? (
              <button type="button" onClick={() => jumpTo(CONTENTS_ID)} className="tap self-start text-small text-on-dark-dim underline underline-offset-4">
                Back to contents
              </button>
            ) : null}
            <BlockView block={block} />
          </Fragment>
        ))}
        <button type="button" onClick={() => jumpTo(CONTENTS_ID)} className="tap self-start text-small text-on-dark-dim underline underline-offset-4">
          Back to contents
        </button>
      </article>
    </div>
  )
}

function Inlines({ inlines }: { inlines: readonly Inline[] }): ReactNode {
  return inlines.map((inline, i) => {
    switch (inline.kind) {
      case 'text':
        return <Fragment key={i}>{inline.text}</Fragment>
      case 'strong':
        return (
          <strong key={i} className="font-semibold text-on-dark">
            <Inlines inlines={inline.children} />
          </strong>
        )
      case 'em':
        return (
          <em key={i}>
            <Inlines inlines={inline.children} />
          </em>
        )
    }
  })
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'heading': {
      // The screen's title is the page's h1, so program.md's levels sit one below it, in Plex Sans.
      const props = { id: `${ID_PREFIX}${block.id}`, tabIndex: -1, className: 'outline-none wrap-anywhere' }
      if (block.level === 1)
        return (
          <h2 {...props} className={`${props.className} font-sans text-h3 font-medium text-on-dark`}>
            <Inlines inlines={block.inlines} />
          </h2>
        )
      if (block.level === 2)
        return (
          <h3 {...props} className={`${props.className} border-t border-on-dark-faint pt-4 font-sans text-lead font-medium text-on-dark`}>
            <Inlines inlines={block.inlines} />
          </h3>
        )
      return (
        <h4 {...props} className={`${props.className} font-sans text-body font-semibold text-on-dark`}>
          <Inlines inlines={block.inlines} />
        </h4>
      )
    }
    case 'paragraph':
      return (
        <p className="text-body text-on-dark-dim wrap-anywhere">
          <Inlines inlines={block.inlines} />
        </p>
      )
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i} className="wrap-anywhere">
          <Inlines inlines={item} />
        </li>
      ))
      return block.ordered ? (
        <ol start={block.start} className="flex list-decimal flex-col gap-2 pl-6 text-body text-on-dark-dim">
          {items}
        </ol>
      ) : (
        <ul className="flex list-disc flex-col gap-2 pl-6 text-body text-on-dark-dim">{items}</ul>
      )
    }
    case 'table':
      return tableLayout(block) === 'grid' ? <GridTable table={block} /> : <StackedTable table={block} />
    case 'image': {
      const src = IMAGES[block.src]
      return src ? (
        <figure className="flex flex-col gap-2">
          <img src={src} alt={block.alt} className="h-auto w-full rounded-sm" />
        </figure>
      ) : (
        <p className="text-small text-on-dark-muted">Image not in the app: {block.alt}</p>
      )
    }
  }
}

type Table = Extract<Block, { kind: 'table' }>

/** A table that fits a phone: a real table, its header cells as column headers. */
function GridTable({ table }: { table: Table }) {
  return (
    <table className="w-full border-collapse text-left text-small">
      <thead>
        <tr>
          {table.header.map((cell, j) => (
            <th key={j} scope="col" className="border-b border-on-dark-faint px-2 py-2 align-bottom font-mono text-label font-normal uppercase tracking-[0.22em] text-on-dark-muted">
              <Inlines inlines={cell} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className="border-b border-on-dark-faint px-2 py-2 align-top text-on-dark-dim wrap-anywhere">
                <Inlines inlines={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A wide table, one row at a time: each filled cell under its column's header, so the page never scrolls sideways. */
function StackedTable({ table }: { table: Table }) {
  const headers = table.header.map((cell) => plainText(cell))
  return (
    <ul aria-label={`Table: ${headers.filter(Boolean).join(', ')}`} className="flex flex-col">
      {table.rows.map((row, i) => (
        <li key={i} className="border-t border-on-dark-faint py-3">
          <dl className="flex flex-col gap-1">
            {row.map((cell, j) =>
              cell.length === 0 ? null : (
                <div key={j} className="flex flex-col">
                  {headers[j] ? <dt className={LABEL}>{headers[j]}</dt> : null}
                  <dd className="text-body text-on-dark-dim wrap-anywhere">
                    <Inlines inlines={cell} />
                  </dd>
                </div>
              ),
            )}
          </dl>
        </li>
      ))}
    </ul>
  )
}
