import type { IsoDate, MorningCheck, Run, Workout } from '../schema/index.ts'

/**
 * The link a morning check stores, computed for yesterday only. One session that day: link it.
 * More than one (a lift and a run stacked, a moved session, an earlier attempt): no link. None: no
 * link. Planned workouts never happened and don't count. Since Nov 2 (M4 review) a link only adds
 * its session: the date rule in morningCheckApplies covers every session of the day before either
 * way, so one logged for that day after the check was saved still reads it.
 */
export function checkLink(workouts: readonly Workout[], runs: readonly Run[], date: IsoDate): MorningCheck['appliesTo'] {
  const lifts = workouts.filter((w) => w.date === date && w.status !== 'planned')
  const dayRuns = runs.filter((r) => r.date === date)
  if (lifts.length + dayRuns.length !== 1) return null
  const lift = lifts[0]
  if (lift) return { kind: 'workout', id: lift.id }
  const run = dayRuns[0]
  return run ? { kind: 'run', id: run.id } : null
}
