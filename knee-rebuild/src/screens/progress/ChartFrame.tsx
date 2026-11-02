import { useId, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react'
import { Button } from '../../components/Button.tsx'
import { focusIndex, nearestIndex, stepIndex, type MarkKind, type NumbersTable, type Readout } from '../Progress.helpers.ts'

/** The chart's width before it is measured: a 375 px phone less the 16 px gutters. */
export const PHONE_WIDTH = 343

/** The width of the element the ref is on, kept current as it resizes, so chart text stays at its type size. */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(PHONE_WIDTH)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const w = Math.floor(el.getBoundingClientRect().width)
      if (w > 0) setWidth(w)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

export const TICK_TEXT = 'fill-on-dark-muted font-mono text-label tabular-nums'
export const LABEL_TEXT = 'fill-on-dark font-mono text-label tabular-nums'
export const GRID = 'stroke-on-dark-faint'
/** The date labels' baseline under the plot: clear of the lowest tick label, which is centred on the baseline. */
export const DATE_LABEL_DY = 21

/**
 * A chart's frame: the readout line above it, the SVG (role img, one-sentence name), and the
 * "Show the numbers" table twin. A tap, a drag or a hover anywhere on the chart selects the nearest
 * date, never only the dot; focus selects the date the readout opened on (`initial`, else the
 * latest), and the arrow keys step through the dates from there.
 */
export function ChartFrame({
  label,
  width,
  height,
  positions,
  selected,
  initial,
  onSelect,
  readout,
  table,
  children,
}: {
  label: string
  width: number
  height: number
  /** The x of each selectable date, in SVG pixels. */
  positions: readonly number[]
  selected: number | null
  /** The index the readout shows with nothing picked (this week on the miles chart); the latest when absent. */
  initial?: number
  onSelect: Dispatch<SetStateAction<number | null>>
  readout: Readout | null
  table: NumbersTable
  children: ReactNode
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [open, setOpen] = useState(false)
  const tableId = useId()
  const readoutId = useId()

  const pick = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const box = svg.getBoundingClientRect()
    if (!(box.width > 0)) return
    const i = nearestIndex(positions, ((clientX - box.left) / box.width) * width)
    if (i !== null) onSelect(i)
  }

  return (
    <div className="flex flex-col gap-2">
      <ReadoutLine id={readoutId} readout={readout} />
      <div
        role="group"
        aria-label="Tap the chart, or use the left and right arrows, to read a date"
        aria-describedby={readoutId}
        tabIndex={0}
        className="rounded-sm"
        onFocus={() => onSelect((s) => focusIndex(s, initial, positions.length))}
        onKeyDown={(e) => {
          const next = stepIndex(selected, e.key, positions.length, initial)
          if (next === null) return
          e.preventDefault()
          onSelect(next)
        }}
      >
        <svg
          ref={svgRef}
          role="img"
          aria-label={label}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block touch-pan-y select-none"
          onPointerDown={(e) => pick(e.clientX)}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' || e.buttons > 0) pick(e.clientX)
          }}
        >
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
          {children}
        </svg>
      </div>
      <Button variant="quiet" className="self-start px-0!" aria-expanded={open} aria-controls={tableId} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide the numbers' : 'Show the numbers'}
      </Button>
      <div id={tableId}>{open ? <TableView table={table} /> : null}</div>
    </div>
  )
}

/** The values at the selected date, each led by its value with the series' own mark beside it. */
function ReadoutLine({ id, readout }: { id: string; readout: Readout | null }) {
  return (
    <p id={id} aria-live="polite" className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 text-small text-on-dark-dim">
      {readout ? (
        <>
          {readout.parts.map((part, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {part.mark ? <Mark kind={part.mark} /> : null}
              <span className="font-medium text-on-dark tabular-nums">{part.value}</span>
              {part.name ? <span>{part.name}</span> : null}
            </span>
          ))}
          <span className="text-on-dark-muted">{readout.when}</span>
        </>
      ) : (
        'Nothing to read yet.'
      )}
    </p>
  )
}

/** The same shape the chart draws, small, for legends and readouts. */
export function Mark({ kind }: { kind: MarkKind }) {
  return (
    <svg aria-hidden="true" width={14} height={14} viewBox="0 0 14 14" className="shrink-0">
      {kind === 'dot' ? <circle cx={7} cy={7} r={4} className="fill-green-bright" /> : null}
      {kind === 'ring' ? <circle cx={7} cy={7} r={3.5} strokeWidth={2} className="fill-navy stroke-on-dark-muted" /> : null}
      {kind === 'column' ? <path d="M3 13V5A2 2 0 0 1 5 3H9A2 2 0 0 1 11 5V13Z" className="fill-on-dark-dim" /> : null}
      {kind === 'plan' ? <line x1={1} x2={13} y1={7} y2={7} strokeWidth={2} className="stroke-paper" /> : null}
    </svg>
  )
}

/** A legend for two series: the mark, then the words. Text stays in text colors; the mark carries the hue. */
export function Legend({ items }: { items: { kind: MarkKind; name: string }[] }) {
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-6 gap-y-1">
      {items.map((item) => (
        <li key={item.name} className="inline-flex items-center gap-2 text-small text-on-dark-dim">
          <Mark kind={item.kind} />
          {item.name}
        </li>
      ))}
    </ul>
  )
}

/** The table twin. */
export function TableView({ table }: { table: NumbersTable }) {
  return (
    <table className="w-full border-collapse text-left text-small">
      <caption className="sr-only">{table.caption}</caption>
      <thead>
        <tr>
          {table.head.map((h, i) => (
            <th key={i} scope="col" className="py-2 pr-3 font-mono text-label font-normal uppercase tracking-[0.22em] text-on-dark-muted">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, r) => (
          <tr key={r} className="border-t border-on-dark-faint">
            {row.map((cell, c) =>
              c === 0 ? (
                <th key={c} scope="row" className="py-2 pr-3 font-normal text-on-dark-dim">
                  {cell}
                </th>
              ) : (
                <td key={c} className="py-2 pr-3 text-on-dark tabular-nums">
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A dot on a line: filled for the injured side (or the only line), a hollow ring for the other side; each wears a 2 px navy ring. */
export function Marker({ x, y, kind }: { x: number; y: number; kind: 'dot' | 'ring' }) {
  return (
    <g>
      <circle cx={x} cy={y} r={6} className="fill-navy" />
      {kind === 'dot' ? <circle cx={x} cy={y} r={4} className="fill-green-bright" /> : <circle cx={x} cy={y} r={3.5} strokeWidth={2} className="fill-navy stroke-on-dark-muted" />}
    </g>
  )
}

/** Hairline gridlines and their tick labels on the one y-axis. */
export function YAxis({ ticks, left, right, suffix = '' }: { ticks: readonly { value: number; y: number }[]; left: number; right: number; suffix?: string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t.value}>
          <line x1={left} x2={right} y1={t.y} y2={t.y} strokeWidth={1} shapeRendering="crispEdges" className={GRID} />
          <text x={left - 6} y={t.y} dy="0.32em" textAnchor="end" className={TICK_TEXT}>
            {t.value}
            {suffix}
          </text>
        </g>
      ))}
    </g>
  )
}

/** The crosshair at the selected date. */
export function Crosshair({ x, top, bottom }: { x: number | null; top: number; bottom: number }) {
  if (x === null) return null
  return <line x1={x} x2={x} y1={top} y2={bottom} strokeWidth={1} shapeRendering="crispEdges" className="stroke-on-dark-dim" />
}
