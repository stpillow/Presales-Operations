import { useState } from 'react'
import { columnChartGeometry, trainingLoadAria, trainingLoadNumber, trainingLoadReadout, trainingLoadTable, type TrainingLoadView } from '../Progress.helpers.ts'
import { ChartFrame, GRID, LABEL_TEXT, Legend, TICK_TEXT, YAxis, useWidth } from './ChartFrame.tsx'

const HEIGHT = 208
const MARGIN = { top: 24, right: 8, bottom: 44, left: 40 }

/**
 * Weekly training load (metrics phase 1): a column per program week, week numbers under the axis
 * with "deload" under the deload weeks, and this week's number underlined. The miles chart's
 * geometry without its plan mark: training load has no plan to draw against.
 */
export function TrainingLoadChart({ view }: { view: TrainingLoadView }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [selected, setSelected] = useState<number | null>(null)
  const weeks = view.weeks.map((w) => ({ week: w.week, actual: Math.round(w.load), planned: 0, isDown: w.isDeload }))
  const geo = columnChartGeometry({ width, height: HEIGHT, margin: MARGIN, weeks, labelAt: [] })
  const index = selected ?? view.opening
  const picked = selected === null ? null : geo.columns[selected]
  const labels = view.labelAt.flatMap((i) => {
    const c = geo.columns[i]
    const w = view.weeks[i]
    return c && w && w.load > 0 ? [{ x: c.x, y: c.top - 6, text: trainingLoadNumber(w.load) }] : []
  })

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <Legend items={[{ kind: 'column', name: 'Training load (RPE × min)' }]} />
      <ChartFrame
        label={trainingLoadAria(view)}
        width={width}
        height={HEIGHT}
        positions={geo.centers}
        selected={selected}
        initial={view.opening}
        onSelect={setSelected}
        readout={trainingLoadReadout(view, index)}
        table={trainingLoadTable(view)}
      >
        {picked ? <rect x={picked.x - geo.slot / 2} y={geo.plot.top} width={geo.slot} height={geo.plot.bottom - geo.plot.top} rx={2} className="fill-navy-lift" /> : null}
        <YAxis ticks={geo.ticks} left={geo.plot.left} right={geo.plot.right} />
        {geo.columns.map((c) => (c.path ? <path key={`col-${c.week}`} d={c.path} className="fill-on-dark-dim" /> : null))}
        <line x1={geo.plot.left} x2={geo.plot.right} y1={geo.plot.bottom} y2={geo.plot.bottom} strokeWidth={1} shapeRendering="crispEdges" className={GRID} />
        {labels.map((v) => (
          <text key={`v-${v.x}`} x={v.x} y={v.y} textAnchor="middle" className={LABEL_TEXT}>
            {v.text}
          </text>
        ))}
        {geo.weekLabels.map((w, i) => (
          <g key={`w-${w.text}`}>
            <text x={w.x} y={geo.plot.bottom + 16} textAnchor="middle" className={view.current === i ? 'fill-on-dark font-mono text-label tabular-nums' : TICK_TEXT}>
              {w.text}
            </text>
            {view.current === i ? <line x1={w.x - 8} x2={w.x + 8} y1={geo.plot.bottom + 21} y2={geo.plot.bottom + 21} strokeWidth={2} className="stroke-paper" /> : null}
          </g>
        ))}
        {geo.downLabels.map((d) => (
          <text key={`d-${d.x}`} x={d.x} y={geo.plot.bottom + 36} textAnchor="middle" className="fill-on-dark-muted font-sans text-label">
            {d.text}
          </text>
        ))}
      </ChartFrame>
    </div>
  )
}
