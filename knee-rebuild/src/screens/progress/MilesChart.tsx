import { useState } from 'react'
import { columnChartGeometry, milesAria, milesReadout, milesTable, type MilesView } from '../Progress.helpers.ts'
import { ChartFrame, GRID, LABEL_TEXT, Legend, TICK_TEXT, YAxis, useWidth } from './ChartFrame.tsx'

const HEIGHT = 208
const MARGIN = { top: 24, right: 8, bottom: 44, left: 32 }

/**
 * Weekly miles for the 12 weeks, from `milesSeries`: a column of actual miles per week, the plan
 * as a short 2 px mark across each week's slot, week numbers under the axis with "deload" under
 * the down weeks, and this week's number underlined.
 */
export function MilesChart({ view }: { view: MilesView }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [selected, setSelected] = useState<number | null>(null)
  const geo = columnChartGeometry({ width, height: HEIGHT, margin: MARGIN, weeks: view.weeks, labelAt: view.labelAt })
  const index = selected ?? view.opening
  const readout = milesReadout(view, index)
  const picked = selected === null ? null : geo.columns[selected]

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <Legend
        items={[
          { kind: 'column', name: 'Actual miles' },
          { kind: 'plan', name: 'Plan' },
        ]}
      />
      <ChartFrame label={milesAria(view)} width={width} height={HEIGHT} positions={geo.centers} selected={selected} initial={view.opening} onSelect={setSelected} readout={readout} table={milesTable(view)}>
        {picked ? <rect x={picked.x - geo.slot / 2} y={geo.plot.top} width={geo.slot} height={geo.plot.bottom - geo.plot.top} rx={2} className="fill-navy-lift" /> : null}
        <YAxis ticks={geo.ticks} left={geo.plot.left} right={geo.plot.right} />
        {geo.columns.map((c) => (c.path ? <path key={`col-${c.week}`} d={c.path} className="fill-on-dark-dim" /> : null))}
        {geo.columns.map((c) => (
          <line key={`plan-${c.week}`} x1={c.planX1} x2={c.planX2} y1={c.planY} y2={c.planY} strokeWidth={2} className="stroke-paper" />
        ))}
        <line x1={geo.plot.left} x2={geo.plot.right} y1={geo.plot.bottom} y2={geo.plot.bottom} strokeWidth={1} shapeRendering="crispEdges" className={GRID} />
        {geo.valueLabels.map((v) => (
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
