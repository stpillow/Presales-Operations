import { useState } from 'react'
import type { SymmetryPoint } from '../../rules/progress.ts'
import type { Side } from '../../schema/index.ts'
import { EXTREME_ABOVE_DY, EXTREME_BELOW_DY, REF_ABOVE_DY, REF_BELOW_DY, fmt, lineChartGeometry, symmetryAria, symmetryAxis, symmetryReadout, symmetryTable, type CountUnit, type SymmetryRef } from '../Progress.helpers.ts'
import { ChartFrame, Crosshair, DATE_LABEL_DY, GRID, LABEL_TEXT, Marker, TICK_TEXT, YAxis, useWidth } from './ChartFrame.tsx'

const HEIGHT = 200
const MARGIN = { top: 24, right: 56, bottom: 28, left: 44 }
const KEY = 'symmetry'

/**
 * Symmetry over time, from `symmetrySeries`: one line in percent, with the gates' lines as solid
 * hairlines labelled in words ("Gate 1 · 80%"). One series, so no legend: the heading names it.
 */
export function SymmetryChart({ points, name, injuredSide, countUnit, refs }: { points: readonly SymmetryPoint[]; name: string; injuredSide: Side; countUnit: CountUnit; refs: readonly SymmetryRef[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [selected, setSelected] = useState<number | null>(null)
  const geo = lineChartGeometry({
    width,
    height: HEIGHT,
    margin: MARGIN,
    dates: points.map((p) => p.date),
    lines: [{ key: KEY, points: points.map((p) => ({ date: p.date, value: p.percent })) }],
    axis: symmetryAxis(points, refs),
    refs: refs.map((r) => ({ value: r.percent, label: r.label })),
    extremeFor: KEY,
  })
  const index = selected === null ? points.length - 1 : Math.min(selected, points.length - 1)
  const readout = symmetryReadout(points, index, injuredSide, countUnit, selected === null)
  const crossX = selected === null ? null : (geo.xs[index] ?? null)
  const line = geo.lines[0]

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <ChartFrame
        label={symmetryAria(points, name, injuredSide, refs)}
        width={width}
        height={HEIGHT}
        positions={geo.xs}
        selected={selected}
        onSelect={setSelected}
        readout={readout}
        table={symmetryTable(points, name, injuredSide, countUnit)}
      >
        <YAxis ticks={geo.ticks} left={geo.plot.left} right={geo.plot.right} suffix="%" />
        {geo.refs.map((r) => (
          <line key={`ref-${r.value}`} x1={geo.plot.left} x2={geo.plot.right} y1={r.y} y2={r.y} strokeWidth={1} shapeRendering="crispEdges" className="stroke-on-dark-dim" />
        ))}
        <line x1={geo.plot.left} x2={geo.plot.right} y1={geo.plot.bottom} y2={geo.plot.bottom} strokeWidth={1} shapeRendering="crispEdges" className={GRID} />
        <Crosshair x={crossX} top={geo.plot.top} bottom={geo.plot.bottom} />
        {line ? (
          <>
            <path d={line.path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-green-bright" />
            {line.dots.map((d, i) => (
              <Marker key={i} x={d.x} y={d.y} kind="dot" />
            ))}
            {line.extreme ? (
              <text x={line.extreme.x} y={line.extreme.y + (line.extremeBelow ? EXTREME_BELOW_DY : EXTREME_ABOVE_DY)} textAnchor="middle" strokeWidth={3} strokeLinejoin="round" style={{ paintOrder: 'stroke' }} className={`${LABEL_TEXT} stroke-navy`}>
                {fmt(line.extreme.value)}%
              </text>
            ) : null}
          </>
        ) : null}
        {/* The gates' words go on after the line and every hairline, so their navy halo keeps both off the letters. */}
        {geo.refs.map((r) => (
          <text
            key={`ref-label-${r.value}`}
            x={r.labelX}
            y={r.y + (r.below ? REF_BELOW_DY : REF_ABOVE_DY)}
            textAnchor={r.anchor}
            strokeWidth={3}
            strokeLinejoin="round"
            style={{ paintOrder: 'stroke' }}
            className="fill-on-dark-dim stroke-navy font-sans text-label"
          >
            {r.label}
          </text>
        ))}
        {geo.ends.map((end) => (
          <g key={end.keys.join('+')}>
            {end.leader ? <line x1={end.dotX + 6} y1={end.dotY} x2={end.x - 3} y2={end.y} strokeWidth={1} className={GRID} /> : null}
            <text x={end.x} y={end.y} dy="0.32em" strokeWidth={3} strokeLinejoin="round" style={{ paintOrder: 'stroke' }} className={`${LABEL_TEXT} stroke-navy`}>
              {fmt(end.value)}%
            </text>
          </g>
        ))}
        {geo.dateLabels.map((d) => (
          <text key={d.text} x={d.x} y={geo.plot.bottom + DATE_LABEL_DY} textAnchor="middle" className={TICK_TEXT}>
            {d.text}
          </text>
        ))}
      </ChartFrame>
    </div>
  )
}
