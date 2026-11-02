import { describe, expect, it } from 'vitest'
import { program } from '../program/program.ts'
import { attachChecks, subjectReadings } from '../rules/history.ts'
import type { MilesWeek } from '../rules/progress.ts'
import type { Exercise, MileageWeek, MorningCheck, Run, SessionTemplate, SetLog, Settings, Workout } from '../schema/index.ts'
import {
  axisDate,
  bandCenters,
  clampCenter,
  cleanDaysView,
  columnChartGeometry,
  columnPath,
  comparedWords,
  countUnitFor,
  crossings,
  datePositions,
  exerciseView,
  fmt,
  gatesWords,
  labelledPoints,
  lineChartGeometry,
  linePath,
  lineYAt,
  loadAria,
  loadChart,
  loadReadout,
  loadSubtitle,
  loadTable,
  loggedExercises,
  milesAria,
  milesReadout,
  milesTable,
  milesView,
  nearestIndex,
  niceAxis,
  niceStep,
  pickedRow,
  progressView,
  readoutText,
  scaleLinear,
  spreadLabels,
  stepIndex,
  symmetryAria,
  symmetryAxis,
  symmetryEmptyWords,
  symmetryReadout,
  symmetryRefs,
  symmetryTable,
  textWidth,
  visibleRows,
  type HistoryLike,
} from './Progress.helpers.ts'

const START = '2026-11-02'
const workout = (id: string, date: string, status: Workout['status'] = 'finished', templateId = 'p2-b'): Workout => ({ id, date, templateId, phase: 2, week: 5, isDeload: false, status })
const set = (workoutId: string, side: SetLog['side'], n: number, load: number, reps: number, exerciseId = 'bulgarian-split-squat'): SetLog => ({
  id: `${workoutId}-${exerciseId}-${side}-${n}`,
  workoutId,
  slotId: 'p2b-1',
  exerciseId,
  setNumber: n,
  side,
  load,
  loadUnit: 'lb',
  reps,
  painDuring: 1,
  stopped: false,
})
const timed = (workoutId: string, side: SetLog['side'], n: number, seconds: number, exerciseId = 'single-leg-balance'): SetLog => ({ id: `${workoutId}-${exerciseId}-${side}-${n}`, workoutId, slotId: 'p1a-9', exerciseId, setNumber: n, side, load: 0, loadUnit: 's', seconds, stopped: false })
const check = (date: string, over: Partial<MorningCheck> = {}): MorningCheck => ({ id: `m-${date}`, date, appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [], ...over })
const run = (id: string, date: string, miles: number, maxPain = 1, type: Run['type'] = 'easy'): Run => ({ id, date, type, miles, minutes: 30, effort: 'easy', maxPain, strides: false, tempo: false })
const templates: SessionTemplate[] = [
  { id: 'p2-b', phase: 2, letter: 'B', slots: [] },
  { id: 'p1-a', phase: 1, letter: 'A', slots: [] },
]
const catalog = (over: Partial<Exercise> & Pick<Exercise, 'id' | 'name'>): Exercise => ({ pattern: 'single-leg', equipment: 'dumbbells', loadType: 'dumbbell-each', loadUnit: 'lb', increment: 5, loadDirection: 'up', unilateral: true, requires: [], ...over })
const CATALOG: Exercise[] = [
  catalog({ id: 'bulgarian-split-squat', name: 'Bulgarian split squat' }),
  catalog({ id: 'leg-press', name: 'Leg press, both legs', pattern: 'squat', loadType: 'stack', unilateral: false }),
  catalog({ id: 'single-leg-balance', name: 'Single-leg balance', pattern: 'balance', loadType: 'time', loadUnit: 's', increment: 5 }),
  catalog({ id: 'assisted-pull-up', name: 'Assisted pull-up', pattern: 'pull', loadType: 'stack', unilateral: false, loadDirection: 'down' }),
]
const settings: Settings = {
  injuredSide: 'right',
  startDate: START,
  dumbbellMax: 80,
  restTimerSeconds: 60,
  painPerSet: false,
  currentPhase: 1,
  phaseEnteredWeek: 1,
  redFlag: { active: false, items: [] },
  activeLocationId: 'planet-fitness',
  kit: ['ankle-strap', 'mini-band'],
}

describe('words', () => {
  it('dates under an axis, numbers to one decimal, gates in a list', () => {
    expect(axisDate('2026-11-03')).toBe('Nov 3')
    expect(axisDate('2027-01-25')).toBe('Jan 25')
    expect(fmt(185)).toBe('185')
    expect(fmt(87.5)).toBe('87.5')
    expect(fmt(12.25)).toBe('12.3')
    expect(gatesWords([1])).toBe('Gate 1')
    expect(gatesWords([3, 2])).toBe('Gates 2 and 3')
    expect(gatesWords([1, 2, 3])).toBe('Gates 1, 2 and 3')
  })
})

describe('scales and ticks', () => {
  it('maps a domain onto a range; a zero-width domain lands in the middle', () => {
    const y = scaleLinear([0, 20], [200, 0])
    expect(y(0)).toBe(200)
    expect(y(10)).toBe(100)
    expect(scaleLinear([5, 5], [0, 100])(5)).toBe(50)
  })

  it('picks 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(18, 4)).toBe(5)
    expect(niceStep(5, 4)).toBe(2)
    expect(niceStep(30, 4)).toBe(10)
    expect(niceStep(0.8, 4)).toBe(0.2)
    expect(niceStep(0, 4)).toBe(1)
  })

  it('covers the data with clean ticks on one axis', () => {
    expect(niceAxis(0, 18)).toEqual({ min: 0, max: 20, ticks: [0, 5, 10, 15, 20] })
    expect(niceAxis(70, 100)).toEqual({ min: 70, max: 100, ticks: [70, 80, 90, 100] })
    expect(niceAxis(20, 25).ticks).toEqual([20, 22, 24, 26])
  })

  it('gives a single value room on both sides and never goes below the floor', () => {
    const one = niceAxis(25, 25)
    expect(one.min).toBeLessThan(25)
    expect(one.max).toBeGreaterThan(25)
    expect(niceAxis(0, 0)).toEqual({ min: 0, max: 1, ticks: [0, 0.5, 1] })
    expect(niceAxis(2, 3).min).toBeGreaterThanOrEqual(0)
  })

  it('a whole-number axis never shows half steps', () => {
    expect(niceAxis(8, 8).ticks).toEqual([7, 7.5, 8, 8.5, 9])
    expect(niceAxis(8, 8, 4, 0, 1).ticks).toEqual([7, 8, 9])
  })
})

describe('positions and hit testing', () => {
  it('spaces dates by the days between them; one date sits in the middle', () => {
    expect(datePositions(['2026-11-03', '2026-11-05', '2026-11-13'], 0, 100)).toEqual([0, 20, 100])
    expect(datePositions(['2026-11-03'], 0, 100)).toEqual([50])
    expect(datePositions([], 0, 100)).toEqual([])
  })

  it('splits a width into equal slots, one per week', () => {
    expect(bandCenters(4, 0, 100)).toEqual({ centers: [12.5, 37.5, 62.5, 87.5], slot: 25 })
    expect(bandCenters(0, 0, 100)).toEqual({ centers: [], slot: 0 })
  })

  it('a tap anywhere picks the nearest date, the earlier on a tie; nothing with no dates', () => {
    const xs = [10, 50, 90]
    expect(nearestIndex(xs, 0)).toBe(0)
    expect(nearestIndex(xs, 69)).toBe(1)
    expect(nearestIndex(xs, 71)).toBe(2)
    expect(nearestIndex(xs, 30)).toBe(0)
    expect(nearestIndex(xs, 400)).toBe(2)
    expect(nearestIndex([], 10)).toBeNull()
  })

  it('arrow keys step through the dates, Home and End jump, other keys do nothing', () => {
    expect(stepIndex(null, 'ArrowLeft', 4)).toBe(3)
    expect(stepIndex(3, 'ArrowLeft', 4)).toBe(2)
    expect(stepIndex(0, 'ArrowLeft', 4)).toBe(0)
    expect(stepIndex(2, 'ArrowRight', 4)).toBe(3)
    expect(stepIndex(3, 'ArrowRight', 4)).toBe(3)
    expect(stepIndex(2, 'Home', 4)).toBe(0)
    expect(stepIndex(0, 'End', 4)).toBe(3)
    expect(stepIndex(1, 'Enter', 4)).toBeNull()
    expect(stepIndex(null, 'ArrowRight', 0)).toBeNull()
  })
})

describe('label selection and placement', () => {
  it('labels the last point and the highest when it is another, higher point', () => {
    expect(labelledPoints([20, 30, 25])).toEqual({ last: 2, extreme: 1 })
    expect(labelledPoints([20, 25, 30])).toEqual({ last: 2, extreme: null })
    expect(labelledPoints([30, 25, 30])).toEqual({ last: 2, extreme: null })
    expect(labelledPoints([])).toEqual({ last: null, extreme: null })
  })

  it('pushes colliding end labels apart, keeps them in order and inside the plot', () => {
    expect(spreadLabels([50, 100], 14, 0, 200)).toEqual([50, 100])
    expect(spreadLabels([100, 96], 14, 0, 200)).toEqual([110, 96])
    expect(spreadLabels([198, 199], 14, 0, 200)).toEqual([186, 200])
    expect(spreadLabels([1, 2], 14, 0, 200)).toEqual([1, 15])
  })

  it('estimates text widths and keeps a centred label inside its bounds', () => {
    expect(textWidth('Nov 3')).toBe(36)
    expect(textWidth('deload', 12, false)).toBe(40.32)
    expect(clampCenter(5, 40, 0, 343)).toBe(20)
    expect(clampCenter(340, 40, 0, 343)).toBe(323)
    expect(clampCenter(100, 40, 0, 343)).toBe(100)
  })

  it('draws a line through its points, and a column rounded at the top and square at the baseline', () => {
    expect(linePath([{ x: 0, y: 10 }, { x: 5.555, y: 20 }])).toBe('M0 10L5.56 20')
    expect(columnPath(50, 20, 100, 40)).toBe('M40 100V44A4 4 0 0 1 44 40H56A4 4 0 0 1 60 44V100Z')
    expect(columnPath(50, 20, 100, 98)).toBe('M40 100V100A2 2 0 0 1 42 98H58A2 2 0 0 1 60 100V100Z')
    expect(columnPath(50, 20, 100, 100)).toBeNull()
  })
})

describe('lineChartGeometry', () => {
  const margin = { top: 20, right: 80, bottom: 28, left: 40 }
  const axis = niceAxis(20, 30)

  it('puts the dates across the plot, one end label per line, and the extreme only on the line it is about', () => {
    const geo = lineChartGeometry({
      width: 343,
      height: 200,
      margin,
      dates: ['2026-11-03', '2026-11-10', '2026-11-17'],
      lines: [
        { key: 'right', points: [{ date: '2026-11-03', value: 20 }, { date: '2026-11-10', value: 30 }, { date: '2026-11-17', value: 25 }] },
        { key: 'left', points: [{ date: '2026-11-03', value: 25 }, { date: '2026-11-10', value: 30 }, { date: '2026-11-17', value: 30 }] },
      ],
      axis,
      extremeFor: 'right',
    })
    expect(geo.plot).toEqual({ left: 40, right: 263, top: 20, bottom: 172 })
    expect(geo.xs).toEqual([48, 151.5, 255])
    expect(geo.lines[0]?.extreme?.value).toBe(30)
    expect(geo.lines[1]?.extreme).toBeNull()
    expect(geo.ends.map((e) => e.keys)).toEqual([['right'], ['left']])
    expect(geo.ends.every((e) => e.x === 265)).toBe(true)
    expect(geo.dateLabels.map((d) => d.text)).toEqual(['Nov 3', 'Nov 17'])
    expect(geo.ticks[0]).toEqual({ value: axis.min, y: 172 })
  })

  it('two sides ending on the same point share one label; a line that ends early gets a leader', () => {
    const shared = lineChartGeometry({
      width: 343,
      height: 200,
      margin,
      dates: ['2026-11-03', '2026-11-10'],
      lines: [
        { key: 'right', points: [{ date: '2026-11-03', value: 20 }, { date: '2026-11-10', value: 25 }] },
        { key: 'left', points: [{ date: '2026-11-03', value: 25 }, { date: '2026-11-10', value: 25 }] },
      ],
      axis,
    })
    expect(shared.ends).toHaveLength(1)
    expect(shared.ends[0]?.keys).toEqual(['right', 'left'])
    expect(shared.ends[0]?.leader).toBe(false)

    const early = lineChartGeometry({
      width: 343,
      height: 200,
      margin,
      dates: ['2026-11-03', '2026-11-10'],
      lines: [
        { key: 'right', points: [{ date: '2026-11-03', value: 20 }, { date: '2026-11-10', value: 22 }] },
        { key: 'left', points: [{ date: '2026-11-03', value: 28 }] },
      ],
      axis,
    })
    expect(early.ends.find((e) => e.keys[0] === 'left')?.leader).toBe(true)
  })

  it('drops the first date label when it would touch the last, and places reference lines on the same scale', () => {
    const geo = lineChartGeometry({
      width: 343,
      height: 200,
      margin,
      dates: ['2026-11-03', '2026-11-04'],
      lines: [{ key: 'x', points: [{ date: '2026-11-03', value: 85 }, { date: '2026-11-04', value: 90 }] }],
      axis: niceAxis(70, 100),
      refs: [
        { value: 80, label: 'Gate 1 · 80%' },
        { value: 90, label: 'Gates 2 and 3 · 90%' },
      ],
    })
    // Two days apart still spans the plot, so both labels fit.
    expect(geo.dateLabels).toHaveLength(2)
    expect(geo.refs.map((r) => [r.value, r.label])).toEqual([
      [80, 'Gate 1 · 80%'],
      [90, 'Gates 2 and 3 · 90%'],
    ])
    expect(geo.refs[0]?.y).toBeGreaterThan(geo.refs[1]?.y ?? 0)

    const one = lineChartGeometry({ width: 343, height: 200, margin, dates: ['2026-11-03'], lines: [{ key: 'x', points: [{ date: '2026-11-03', value: 85 }] }], axis: niceAxis(70, 100) })
    expect(one.dateLabels.map((d) => d.text)).toEqual(['Nov 3'])
    expect(one.xs).toEqual([151.5])

    const narrow = lineChartGeometry({ width: 140, height: 200, margin, dates: ['2026-11-03', '2026-11-04'], lines: [], axis: niceAxis(70, 100) })
    expect(narrow.dateLabels.map((d) => d.text)).toEqual(['Nov 4'])
  })
})

describe('reference labels keep clear of the data', () => {
  it('reads where a line crosses x, and nothing where it does not reach', () => {
    const dots = [{ x: 0, y: 100 }, { x: 10, y: 50 }, { x: 20, y: 50 }]
    expect(lineYAt(dots, 5)).toBe(75)
    expect(lineYAt(dots, 15)).toBe(50)
    expect(lineYAt(dots, 30)).toBeNull()
    expect(lineYAt([{ x: 5, y: 9 }], 5)).toBe(9)
    expect(lineYAt([], 5)).toBeNull()
  })

  it('counts how much of a label box a line runs through', () => {
    const flat = [{ x: 0, y: 50 }, { x: 100, y: 50 }]
    expect(crossings([flat], { x0: 10, x1: 30, y0: 40, y1: 48 })).toBeGreaterThan(0)
    expect(crossings([flat], { x0: 10, x1: 30, y0: 10, y1: 20 })).toBe(0)
  })

  it('puts a gate’s label at the end of the plot the line keeps away from', () => {
    const margin = { top: 24, right: 56, bottom: 28, left: 44 }
    const axis = niceAxis(70, 100)
    const refs = [{ value: 80, label: 'Gate 1 · 80%' }]
    // The line starts just over 80% at the left and climbs away to the right: the label goes right.
    const rising = lineChartGeometry({ width: 343, height: 200, margin, dates: ['2026-11-07', '2026-12-12'], lines: [{ key: 's', points: [{ date: '2026-11-07', value: 82 }, { date: '2026-12-12', value: 100 }] }], axis, refs })
    expect(rising.refs[0]).toMatchObject({ anchor: 'end', labelX: 283 })
    // Far from the line on both sides, it stays at the left.
    const high = lineChartGeometry({ width: 343, height: 200, margin, dates: ['2026-11-07', '2026-12-12'], lines: [{ key: 's', points: [{ date: '2026-11-07', value: 98 }, { date: '2026-12-12', value: 100 }] }], axis, refs })
    expect(high.refs[0]).toMatchObject({ anchor: 'start', labelX: 48 })
  })
})

describe('columnChartGeometry', () => {
  const plan: MileageWeek[] = program.mileagePlan
  const weeks: MilesWeek[] = plan.map((w) => ({ week: w.week, planned: w.targetMiles, isDown: w.isDown, actual: w.week === 1 ? 9.5 : w.week === 2 ? 11 : 0 }))
  const geo = columnChartGeometry({ width: 343, height: 208, margin: { top: 24, right: 8, bottom: 44, left: 32 }, weeks, labelAt: [1, 0, 5] })

  it('caps columns at 24 px and well inside the slot; the plan mark sits within the slot', () => {
    expect(geo.colWidth).toBeLessThanOrEqual(24)
    expect(geo.colWidth).toBeLessThan(geo.slot)
    for (const c of geo.columns) {
      expect(c.planX2 - c.planX1).toBeLessThan(geo.slot)
      expect(c.planX2 - c.planX1).toBeGreaterThan(geo.colWidth)
    }
    // Neighbouring weeks' marks stay apart, so two equal weeks read as two marks, not one line.
    for (let i = 1; i < geo.columns.length; i++) {
      const prev = geo.columns[i - 1]
      const next = geo.columns[i]
      if (prev && next) expect(next.planX1 - prev.planX2).toBeGreaterThanOrEqual(4)
    }
    expect(geo.columns[2]?.path).toBeNull()
    expect(geo.columns[0]?.path).toMatch(/^M/)
  })

  it('labels the deload weeks under the axis, inside the chart, and values only where asked and logged', () => {
    expect(geo.downLabels).toHaveLength(3)
    expect(geo.weekLabels.map((w) => w.text)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])
    const last = geo.downLabels.at(-1)
    expect((last?.x ?? 0) + textWidth('deload', 12, false) / 2).toBeLessThanOrEqual(343)
    expect(geo.valueLabels.map((v) => v.text)).toEqual(['11', '9.5'])
    expect(geo.ticks.at(-1)?.value).toBe(20)
  })

  it('a value sits on its own column’s cap, and over the plan mark only when the mark crowds the cap', () => {
    const few: MilesWeek[] = [
      { week: 1, planned: 10, actual: 2, isDown: false },
      { week: 2, planned: 11, actual: 10.5, isDown: false },
    ]
    const g = columnChartGeometry({ width: 343, height: 208, margin: { top: 24, right: 8, bottom: 44, left: 32 }, weeks: few, labelAt: [0, 1] })
    const [low, close] = g.valueLabels
    expect(low?.y).toBe((g.columns[0]?.top ?? 0) - 6)
    expect(close?.y).toBe((g.columns[1]?.planY ?? 0) - 6)
  })
})

describe('cleanDaysView', () => {
  const base = { runs: [] as Run[], checks: [] as MorningCheck[], templates }

  it('says there is nothing to count before the first reading', () => {
    expect(cleanDaysView({ ...base, readings: [], today: '2026-11-09', records: [] })).toMatchObject({ count: 0, unit: null, context: 'no readings yet' })
  })

  it('counts from the first reading when none was a hold or back-off', () => {
    const records = attachChecks([workout('w1', '2026-11-03')], [set('w1', 'both', 1, 20, 8, 'leg-press')], [check('2026-11-04')])
    const readings = subjectReadings(records, [], [check('2026-11-04')], 'right')
    expect(cleanDaysView({ ...base, readings, today: '2026-11-09', records, checks: [check('2026-11-04')] })).toEqual({ count: 7, unit: 'days', context: 'since the first reading, with no hold or back-off yet', note: null })
  })

  it('names the last hold or back-off, and says when a session is still waiting for its morning check', () => {
    const checks = [check('2026-11-04')]
    const records = attachChecks([workout('w1', '2026-11-03'), workout('w2', '2026-11-09', 'finished', 'p1-a')], [set('w1', 'both', 1, 20, 8, 'leg-press'), set('w2', 'both', 1, 20, 8, 'leg-press')], checks)
    const readings = subjectReadings(records, [], checks, 'right')
    const view = cleanDaysView({ ...base, readings, today: '2026-11-09', records, checks })
    expect(view.count).toBe(0)
    expect(view.context).toBe('since the last hold or back-off')
    expect(view.note).toBe('Hold on Monday Nov 9 (Session A). Its morning check isn’t in yet, and a session with no morning check reads hold.')
    // Two days on, the window for that check has passed: the hold stands, without the waiting line.
    expect(cleanDaysView({ ...base, readings, today: '2026-11-11', records, checks })).toMatchObject({ count: 2, unit: 'days', note: 'Hold on Monday Nov 9 (Session A).' })
  })

  it('a run that read back off is named by its type, and one day reads "day"', () => {
    const runs = [run('r1', '2026-11-04', 3, 7)]
    const checks = [check('2026-11-05')]
    const readings = subjectReadings([], runs, checks, 'right')
    expect(cleanDaysView({ ...base, readings, today: '2026-11-05', records: [], runs, checks })).toEqual({ count: 1, unit: 'day', context: 'since the last hold or back-off', note: 'Back off on Wednesday Nov 4 (Run: easy).' })
  })
})

describe('the exercise list', () => {
  const records = attachChecks(
    [workout('w1', '2026-11-03'), workout('w2', '2026-11-10'), workout('w3', '2026-11-12', 'in-progress')],
    [set('w1', 'right', 1, 20, 8), set('w1', 'left', 1, 25, 8), set('w2', 'both', 1, 90, 10, 'leg-press'), set('w2', 'right', 1, 25, 8), set('w3', 'both', 1, 40, 8, 'assisted-pull-up')],
    [],
  )

  it('lists exercises from sessions that happened, most recent first, with what they are', () => {
    const rows = loggedExercises(records, CATALOG)
    expect(rows.map((r) => r.id)).toEqual(['bulgarian-split-squat', 'leg-press'])
    expect(rows[0]).toEqual({ id: 'bulgarian-split-squat', name: 'Bulgarian split squat', detail: 'Single-leg · per side · last Nov 10 · 2 sessions', lastDate: '2026-11-10', twoSided: true })
    expect(rows[1]?.detail).toBe('Squat · last Nov 10 · 1 session')
    expect(rows[1]?.twoSided).toBe(false)
  })

  it('among one session’s exercises, the knee’s work leads: lower body, then per side, then by name', () => {
    const one = attachChecks(
      [workout('w1', '2026-11-03')],
      [set('w1', 'both', 1, 8, 8, 'dead-bug'), set('w1', 'both', 1, 90, 10, 'leg-press'), set('w1', 'right', 1, 20, 8), set('w1', 'both', 1, 40, 8, 'assisted-pull-up')],
      [],
    )
    expect(loggedExercises(one, [...CATALOG, catalog({ id: 'dead-bug', name: 'Dead bug', pattern: 'core', unilateral: false })]).map((r) => r.id)).toEqual(['bulgarian-split-squat', 'leg-press', 'assisted-pull-up', 'dead-bug'])
  })

  it('an exercise missing from the catalog is listed by its id', () => {
    const odd = attachChecks([workout('w1', '2026-11-03')], [set('w1', 'both', 1, 10, 8, 'old-thing')], [])
    expect(loggedExercises(odd, CATALOG)[0]).toMatchObject({ name: 'old-thing', detail: 'last Nov 3 · 1 session' })
  })

  it('keeps the pick while it is listed, else shows the most recent; shows the first few until asked for all', () => {
    const rows = loggedExercises(records, CATALOG)
    expect(pickedRow(rows, 'leg-press')?.id).toBe('leg-press')
    expect(pickedRow(rows, 'gone')?.id).toBe('bulgarian-split-squat')
    expect(pickedRow([], null)).toBeNull()
    expect(visibleRows(rows, false, 1).map((r) => r.id)).toEqual(['bulgarian-split-squat'])
    expect(visibleRows(rows, true, 1)).toHaveLength(2)
  })
})

describe('loadChart', () => {
  it('draws the injured side first and the other side second, in pounds', () => {
    const records = attachChecks([workout('w1', '2026-11-03'), workout('w2', '2026-11-10')], [set('w1', 'right', 1, 20, 8), set('w1', 'left', 1, 25, 8), set('w2', 'right', 1, 25, 7)], [])
    const view = exerciseView({ records, setLogs: records.flatMap((r) => r.sets), row: loggedExercises(records, CATALOG)[0]!, injuredSide: 'right', catalog: CATALOG })
    const chart = view.chart
    expect(chart.measure).toBe('load')
    expect(chart.lines.map((l) => [l.key, l.role, l.name])).toEqual([
      ['right', 'injured', 'Right · injured'],
      ['left', 'other', 'Left'],
    ])
    expect(chart.dates).toEqual(['2026-11-03', '2026-11-10'])
    const readout = loadReadout(chart, 1, false)
    expect(readout && readoutText(readout)).toBe('25 lb × 7 right, injured · not logged (left) · Tuesday Nov 10')
    expect(readout?.parts.map((p) => p.mark)).toEqual(['dot', 'ring'])
    const latest = loadReadout(chart, 0, true)
    expect(latest && readoutText(latest)).toBe('20 lb × 8 right, injured · 25 lb × 8 left · Tuesday Nov 3, the latest')
    expect(loadReadout(chart, 5, false)).toBeNull()
    expect(loadSubtitle(chart, view.exercise, 'Bulgarian split squat')).toBe('The heaviest set of each session, in pounds, one line per side.')
    expect(loadAria(chart, 'Bulgarian split squat')).toBe(
      'Line chart of the heaviest load in pounds per session for Bulgarian split squat, the right side, injured, as filled dots and the left side as rings, 2 sessions from Nov 3 to Nov 10.',
    )
    expect(loadTable(chart, 'Bulgarian split squat')).toEqual({
      caption: 'Bulgarian split squat: heaviest set per session',
      head: ['Date', 'Right · injured', 'Left'],
      rows: [
        ['Tuesday Nov 10', '25 lb × 7', 'not logged'],
        ['Tuesday Nov 3', '20 lb × 8', '25 lb × 8'],
      ],
    })
    // The injured side is the left one on another install.
    expect(loadChart([{ date: '2026-11-03', side: 'right', load: 20, count: 8 }, { date: '2026-11-03', side: 'left', load: 15, count: 8 }], 'left', 'reps').lines.map((l) => l.role)).toEqual(['injured', 'other'])
  })

  it('charts the best set’s seconds when no load is logged, and says so', () => {
    const records = attachChecks([workout('w1', '2026-11-03')], [timed('w1', 'right', 1, 20), timed('w1', 'right', 2, 30)], [])
    const sets = records.flatMap((r) => r.sets)
    expect(countUnitFor(sets, 'single-leg-balance')).toBe('seconds')
    expect(countUnitFor(sets, 'leg-press')).toBe('reps')
    const row = loggedExercises(records, CATALOG)[0]!
    const view = exerciseView({ records, setLogs: sets, row, injuredSide: 'right', catalog: CATALOG })
    expect(view.chart.measure).toBe('count')
    expect(view.chart.lines[0]?.points).toEqual([{ date: '2026-11-03', value: 30, load: 0, count: 30 }])
    const readout = loadReadout(view.chart, 0, true)
    expect(readout && readoutText(readout)).toBe('30 s right, injured · Tuesday Nov 3, the latest')
    expect(loadSubtitle(view.chart, view.exercise, row.name)).toBe('No load is logged for Single-leg balance, so this is the best set’s seconds per session.')
  })

  it('a two-leg exercise is one line with no side names; assisted work says lower is stronger', () => {
    const chart = loadChart([{ date: '2026-11-03', side: 'both', load: 40, count: 8 }, { date: '2026-11-10', side: 'both', load: 35, count: 8 }], 'right', 'reps')
    expect(chart.lines.map((l) => l.role)).toEqual(['both'])
    const readout = loadReadout(chart, 1, false)
    expect(readout && readoutText(readout)).toBe('35 lb × 8 · Tuesday Nov 10')
    expect(loadSubtitle(chart, CATALOG[3] ?? null, 'Assisted pull-up')).toBe('The heaviest set of each session, in pounds. The load is the assist, so lower is stronger.')
    expect(loadTable(chart, 'Assisted pull-up').head).toEqual(['Date', 'Heaviest set'])
  })

  it('two-leg sets of a per-side exercise stay in the table, not on the chart', () => {
    const chart = loadChart(
      [
        { date: '2026-11-03', side: 'both', load: 40, count: 8 },
        { date: '2026-11-10', side: 'right', load: 20, count: 8 },
        { date: '2026-11-10', side: 'left', load: 20, count: 8 },
      ],
      'right',
      'reps',
    )
    expect(chart.lines.map((l) => l.key)).toEqual(['right', 'left'])
    expect(chart.extra.map((l) => l.key)).toEqual(['both'])
    expect(chart.dates).toEqual(['2026-11-10'])
    expect(loadTable(chart, 'X').head).toEqual(['Date', 'Right · injured', 'Left', 'Both legs'])
    expect(loadSubtitle(chart, null, 'X')).toContain('Two-leg sets of it are in the numbers, not drawn.')
  })
})

describe('symmetry', () => {
  it('reads the gates’ lines from the program: Gate 1 at 80%, gates 2 and 3 at 90%', () => {
    expect(symmetryRefs(program.gates)).toEqual([
      { percent: 80, label: 'Gate 1 · 80%' },
      { percent: 90, label: 'Gates 2 and 3 · 90%' },
    ])
  })

  it('says what was compared, loads or counts, in the readout and the table (56 against 62 is 90.3%)', () => {
    const records = attachChecks([workout('w1', '2026-11-03'), workout('w2', '2026-11-10')], [set('w1', 'right', 1, 56, 8), set('w1', 'left', 1, 62, 8), set('w2', 'right', 1, 25, 7), set('w2', 'left', 1, 25, 8)], [])
    const row = loggedExercises(records, CATALOG)[0]!
    const view = exerciseView({ records, setLogs: records.flatMap((r) => r.sets), row, injuredSide: 'right', catalog: CATALOG })
    expect(view.symmetry.map((p) => [p.percent, p.basis])).toEqual([
      [90.3, 'load'],
      [87.5, 'count'],
    ])
    const first = symmetryReadout(view.symmetry, 0, 'right', 'reps', false)
    expect(first && readoutText(first)).toBe('90.3% right ÷ left · 56 lb against 62 lb, loads compared · Tuesday Nov 3')
    const latest = symmetryReadout(view.symmetry, 1, 'right', 'reps', true)
    expect(latest && readoutText(latest)).toBe('87.5% right ÷ left · 7 against 8 reps, counts compared · Tuesday Nov 10, the latest')
    expect(symmetryTable(view.symmetry, 'Bulgarian split squat', 'right', 'reps')).toEqual({
      caption: 'Bulgarian split squat: right ÷ left per session',
      head: ['Date', 'Right ÷ left', 'Compared'],
      rows: [
        ['Tuesday Nov 10', '87.5%', '7 against 8 reps, counts compared'],
        ['Tuesday Nov 3', '90.3%', '56 lb against 62 lb, loads compared'],
      ],
    })
    expect(comparedWords({ basis: 'count', injured: 25, other: 30 }, 'seconds')).toBe('25 against 30 seconds, counts compared')
    expect(symmetryAria(view.symmetry, 'Bulgarian split squat', 'right', symmetryRefs(program.gates))).toBe(
      'Line chart of the right side as a percent of the left side for Bulgarian split squat, 2 sessions, against reference lines at 80% and 90%; latest 87.5% on Nov 10.',
    )
  })

  it('the axis always shows both gates’ lines and 100%', () => {
    const refs = symmetryRefs(program.gates)
    expect(symmetryAxis([{ date: '2026-11-03', percent: 95, basis: 'load', injured: 19, other: 20 }], refs)).toEqual({ min: 70, max: 100, ticks: [70, 80, 90, 100] })
    expect(symmetryAxis([{ date: '2026-11-03', percent: 56, basis: 'load', injured: 14, other: 25 }], refs).min).toBeLessThanOrEqual(56)
    expect(symmetryAxis([{ date: '2026-11-03', percent: 112, basis: 'count', injured: 9, other: 8 }], refs).max).toBeGreaterThanOrEqual(112)
  })

  it('says why there is no line: nothing logged, a two-leg exercise, or one side only', () => {
    expect(symmetryEmptyWords(null, null, 'right')).toBe('Log a session with single-leg work to see this: the injured side as a percent of the other, per session.')
    const press = loadChart([{ date: '2026-11-03', side: 'both', load: 90, count: 10 }], 'right', 'reps')
    expect(symmetryEmptyWords({ id: 'leg-press', name: 'Leg press, both legs', detail: '', lastDate: '2026-11-03', twoSided: false }, press, 'right')).toBe(
      'Leg press, both legs is logged as one set, not one per side, so it has no side-to-side number. Pick a per-side exercise above to see its symmetry.',
    )
    const oneSide = loadChart([{ date: '2026-11-03', side: 'right', load: 0, count: 30 }], 'right', 'seconds')
    expect(symmetryEmptyWords({ id: 'single-leg-balance', name: 'Single-leg balance', detail: '', lastDate: '2026-11-03', twoSided: true }, oneSide, 'right')).toBe(
      'Symmetry shows once both sides of Single-leg balance are logged in the same session. So far only the right side is logged. The right side is logged first, then the other.',
    )
  })
})

describe('milesView', () => {
  const runs = [run('r1', '2026-11-02', 3), run('r2', '2026-11-04', 3.5), run('r3', '2026-11-06', 4), run('r4', '2026-11-11', 4), run('r5', '2026-11-12', 0, 1, 'rower-swap'), run('r6', '2026-11-25', 12)]

  it('opens on this week and labels the latest week with miles and the extreme', () => {
    const view = milesView(program.mileagePlan, runs, START, '2026-11-26')
    expect(view.weeks.map((w) => w.actual).slice(0, 5)).toEqual([10.5, 4, 0, 12, 0])
    expect(view.current).toBe(3)
    expect(view.opening).toBe(3)
    expect(view.labelAt).toEqual([3])
    const readout = milesReadout(view, 3)
    expect(readout && readoutText(readout)).toBe('12 mi actual · 12 mi plan · Week 4, deload, this week')
    expect(readout?.parts.map((p) => p.mark)).toEqual(['column', 'plan'])
    expect(milesAria(view)).toBe('Column chart of miles run each week against the plan, weeks 1 to 12; this week, week 4, 12 of 12 miles.')
    expect(milesTable(view).rows[3]).toEqual(['4', '12 mi', '12 mi', 'deload, this week'])
    expect(milesTable(view).rows[0]).toEqual(['1', '10.5 mi', '10 mi', ''])
    // Every column has a header, the notes column included.
    expect(milesTable(view).head).toEqual(['Week', 'Actual', 'Plan', 'Note'])
  })

  it('labels a higher earlier week too; before the start it opens on week 1, after the plan on week 12', () => {
    const view = milesView(program.mileagePlan, runs.slice(0, 5), START, '2026-11-12')
    expect(view.labelAt).toEqual([1, 0])
    expect(milesView(program.mileagePlan, [], START, '2026-10-30')).toMatchObject({ current: null, opening: 0, anyRuns: false, labelAt: [] })
    expect(milesView(program.mileagePlan, [], START, '2027-03-01')).toMatchObject({ current: null, opening: 11 })
    expect(milesAria(milesView(program.mileagePlan, [], START, '2026-10-30'))).toBe('Column chart of miles run each week against the plan, weeks 1 to 12.')
  })
})

describe('progressView', () => {
  it('composes the stat, the list, the gates’ lines and the miles from stored history', () => {
    const history: HistoryLike = {
      workouts: [workout('w1', '2026-11-03', 'finished', 'p1-a')],
      setLogs: [set('w1', 'right', 1, 20, 8), set('w1', 'left', 1, 20, 8)],
      morningChecks: [check('2026-11-03'), check('2026-11-04')],
      runs: [run('r1', '2026-11-02', 3)],
    }
    const view = progressView({ today: '2026-11-05', settings, history, program: { ...program, exercises: CATALOG } })
    expect(view.clean).toMatchObject({ count: 4, unit: 'days', context: 'since the first reading, with no hold or back-off yet' })
    expect(view.exercises.map((r) => r.id)).toEqual(['bulgarian-split-squat'])
    expect(view.refs).toHaveLength(2)
    expect(view.miles.current).toBe(0)
    expect(view.miles.weeks[0]?.actual).toBe(3)
  })
})
