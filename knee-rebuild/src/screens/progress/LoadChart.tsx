import { useState } from 'react'
import { EXTREME_ABOVE_DY, EXTREME_BELOW_DY, fmt, lineChartGeometry, loadAria, loadReadout, loadTable, niceAxis, type ChartLine, type EndLabel, type LoadChart as LoadChartModel } from '../Progress.helpers.ts'
import { ChartFrame, Crosshair, DATE_LABEL_DY, GRID, LABEL_TEXT, Legend, Marker, TICK_TEXT, YAxis, useWidth } from './ChartFrame.tsx'

const HEIGHT = 216
const MARGIN = { top: 24, right: 80, bottom: 28, left: 40 }

const strokeFor = (line: ChartLine) => (line.role === 'other' ? 'stroke-on-dark-muted' : 'stroke-green-bright')

/**
 * Load over time for one exercise, from `loadSeries`: one line, or two for a two-sided exercise
 * (the injured side green with filled dots, the other side muted with rings), a legend for two,
 * labels at the line ends and on the injured side's extreme, and one y-axis.
 */
export function LoadChart({ chart, name }: { chart: LoadChartModel; name: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [selected, setSelected] = useState<number | null>(null)
  const values = chart.lines.flatMap((l) => l.points.map((p) => p.value))
  // Whole pounds, reps and seconds: never a half step on the axis.
  const axis = niceAxis(Math.min(...values), Math.max(...values), 4, 0, 1)
  const primary = chart.lines[0]
  const geo = lineChartGeometry({
    width,
    height: HEIGHT,
    margin: MARGIN,
    dates: chart.dates,
    lines: chart.lines.map((l) => ({ key: l.key, points: l.points })),
    axis,
    ...(primary ? { extremeFor: primary.key } : {}),
  })
  const index = selected === null ? chart.dates.length - 1 : Math.min(selected, chart.dates.length - 1)
  const readout = loadReadout(chart, index, selected === null)
  const crossX = selected === null ? null : (geo.xs[index] ?? null)
  const byKey = new Map<string, ChartLine>(chart.lines.map((l) => [l.key, l]))
  // The injured side draws last, on top: it is the line the chart is about.
  const drawOrder = [...geo.lines].reverse()

  return (
    <div ref={ref} className="flex flex-col gap-3">
      {chart.lines.length > 1 ? <Legend items={chart.lines.map((l) => ({ kind: l.role === 'other' ? 'ring' : 'dot', name: l.name }))} /> : null}
      <ChartFrame label={loadAria(chart, name)} width={width} height={HEIGHT} positions={geo.xs} selected={selected} onSelect={setSelected} readout={readout} table={loadTable(chart, name)}>
        <YAxis ticks={geo.ticks} left={geo.plot.left} right={geo.plot.right} />
        <line x1={geo.plot.left} x2={geo.plot.right} y1={geo.plot.bottom} y2={geo.plot.bottom} strokeWidth={1} shapeRendering="crispEdges" className={GRID} />
        <Crosshair x={crossX} top={geo.plot.top} bottom={geo.plot.bottom} />
        {drawOrder.map((g) => {
          const line = byKey.get(g.key)
          if (!line) return null
          return <path key={g.key} d={g.path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className={strokeFor(line)} />
        })}
        {drawOrder.map((g) => {
          const line = byKey.get(g.key)
          if (!line) return null
          return (
            <g key={`${g.key}-dots`}>
              {g.dots.map((d, i) => (
                <Marker key={i} x={d.x} y={d.y} kind={line.role === 'other' ? 'ring' : 'dot'} />
              ))}
            </g>
          )
        })}
        {geo.lines.map((g) =>
          g.extreme ? (
            <text key={`${g.key}-extreme`} x={g.extreme.x} y={g.extreme.y + (g.extremeBelow ? EXTREME_BELOW_DY : EXTREME_ABOVE_DY)} textAnchor="middle" strokeWidth={3} strokeLinejoin="round" style={{ paintOrder: 'stroke' }} className={`${LABEL_TEXT} stroke-navy`}>
              {fmt(g.extreme.value)}
            </text>
          ) : null,
        )}
        {geo.ends.map((end) => (
          <EndText key={end.keys.join('+')} end={end} lines={byKey} />
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

/** "185 right" at a line's end; "185 both" when the two sides end on the same point; a leader when it sits off its dot. */
function EndText({ end, lines }: { end: EndLabel; lines: Map<string, ChartLine> }) {
  const named = end.keys.map((k) => lines.get(k)).filter((l): l is ChartLine => l !== undefined)
  const side = named.length > 1 ? 'both' : named.length === 1 && named[0]?.role !== 'both' ? named[0]?.key : ''
  return (
    <g>
      {end.leader ? <line x1={end.dotX + 6} y1={end.dotY} x2={end.x - 3} y2={end.y} strokeWidth={1} className={GRID} /> : null}
      {/* The navy halo keeps a leader or a gridline from striking through the words. */}
      <text x={end.x} y={end.y} dy="0.32em" strokeWidth={3} strokeLinejoin="round" style={{ paintOrder: 'stroke' }} className={`${LABEL_TEXT} stroke-navy`}>
        {fmt(end.value)}
        {side ? <tspan className="fill-on-dark-dim font-sans">{` ${side}`}</tspan> : null}
      </text>
    </g>
  )
}

