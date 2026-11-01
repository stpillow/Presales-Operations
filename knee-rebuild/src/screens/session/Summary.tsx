import { navigate } from '../../app/router.ts'
import { Button } from '../../components/Button.tsx'
import { ReadingWord, readingSentence } from '../../components/ReadingWord.tsx'
import { exerciseById } from '../../program/program.ts'
import { sessionReading } from '../../rules/reading.ts'
import type { SessionTemplate, SetLog, Side, Workout } from '../../schema/index.ts'
import { durationWords, loadWords, showsLoad, sideWords, stopReasonLabel } from '../SessionRunner.helpers.ts'

interface ExerciseBlock {
  exerciseId: string
  label: string
  sets: SetLog[]
}

/** The logged exercises in slot order, one block per exercise (a mid-session swap gives two). */
export function exerciseBlocks(template: SessionTemplate, sets: readonly SetLog[]): ExerciseBlock[] {
  const blocks: ExerciseBlock[] = []
  for (const slot of template.slots) {
    const slotSets = sets.filter((s) => s.slotId === slot.id)
    for (const id of Array.from(new Set(slotSets.map((s) => s.exerciseId)))) {
      blocks.push({ exerciseId: id, label: slot.label, sets: slotSets.filter((s) => s.exerciseId === id) })
    }
  }
  return blocks
}

function sideLines(block: ExerciseBlock, injuredSide: Side): string[] {
  const exercise = exerciseById(block.exerciseId)
  const sides = Array.from(new Set(block.sets.map((s) => s.side))).sort((a, b) => (a === injuredSide || a === 'both' ? -1 : b === injuredSide ? 1 : 0))
  return sides.map((side) => {
    const sideSets = block.sets.filter((s) => s.side === side).sort((a, b) => a.setNumber - b.setNumber)
    const counts = sideSets.map((s) => s.seconds ?? s.reps ?? 0).join(', ')
    const load = showsLoad(exercise) ? `${loadWords(sideSets.at(-1)?.load ?? 0, exercise)} × ` : ''
    const label = sideWords(side, injuredSide)
    return `${label ? `${label}: ` : ''}${load}${counts}`
  })
}

/** After Finish or End: what was logged, each exercise's session reading in words, and the way back. */
export function Summary({ workout, template, sets, injuredSide }: { workout: Workout; template: SessionTemplate; sets: readonly SetLog[]; injuredSide: Side }) {
  const blocks = exerciseBlocks(template, sets)
  const duration = durationWords(workout.startedAt, workout.finishedAt)
  const lead =
    workout.status === 'abandoned'
      ? `Ended early${duration ? ` · ${duration}` : ''}. The sets logged before the end count.`
      : `Finished${duration ? ` · ${duration}` : ''}${workout.maxPainDuring !== undefined ? ` · max pain ${workout.maxPainDuring}` : ''}.`
  return (
    <section aria-label="Summary" className="flex flex-col gap-6">
      <p className="text-lead text-on-dark">{lead}</p>
      {blocks.length === 0 ? <p className="text-body text-on-dark-dim">Nothing was logged.</p> : null}
      <ul className="flex flex-col gap-4">
        {blocks.map((block) => {
          const exercise = exerciseById(block.exerciseId)
          const reading = sessionReading(block.sets, injuredSide)
          const stop = block.sets.find((s) => s.stopped)
          return (
            <li key={`${block.label}-${block.exerciseId}`} className="flex flex-col gap-1 border-b border-on-dark-faint pb-4">
              <p className="text-body text-on-dark">
                <span className="font-mono text-small text-on-dark-muted">{block.label}</span> {exercise.name}
              </p>
              {sideLines(block, injuredSide).map((line) => (
                <p key={line} className="text-small text-on-dark-dim">
                  {line}
                </p>
              ))}
              {stop ? <p className="text-small text-on-dark">Stopped: {stopReasonLabel(stop.stopReason).toLowerCase()}.</p> : null}
              <ReadingWord result={reading.result} />
              <p className="text-small text-on-dark-dim">Because: {reading.reasons.join('; ') || readingSentence(reading.result)}.</p>
            </li>
          )
        })}
      </ul>
      <p className="text-body text-on-dark-dim">These are the session readings. Tomorrow&apos;s morning check completes them, and the Morning check screen then says what changes next time; until it is done, each reads hold.</p>
      <Button variant="primary" wide onClick={() => navigate({ name: 'today' })}>
        Back to Today
      </Button>
    </section>
  )
}
