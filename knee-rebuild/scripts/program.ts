/**
 * Prints a session from the seed data, the way the Session runner will see it.
 *
 *   npm run program -- --week 5 --session B
 *
 * Uses the nominal phase for the week; the app itself advances phases on gate confirmation.
 */
import { parseArgs } from 'node:util'
import { exerciseById, nominalPhaseForWeek, program, templateFor } from '../src/program/program.ts'
import { isDeloadWeek } from '../src/rules/calendar.ts'
import { prescribedSets } from '../src/rules/deload.ts'
import { slotsForWeek } from '../src/rules/session.ts'
import { SessionLetter, type Slot } from '../src/schema/index.ts'

const { values } = parseArgs({
  options: {
    week: { type: 'string', short: 'w' },
    session: { type: 'string', short: 's' },
  },
})

const week = Number(values.week)
const letterResult = SessionLetter.safeParse((values.session ?? '').toUpperCase())
if (!Number.isInteger(week) || week < 1 || week > 12 || !letterResult.success) {
  console.error('usage: npm run program -- --week <1-12> --session <A|B|C>')
  process.exit(2)
}
const letter = letterResult.data

const phase = nominalPhaseForWeek(week)
if (phase.number > 3) {
  console.error(`week ${week} is Phase 4, whose sessions are not written yet`)
  process.exit(2)
}
const template = templateFor(phase.number, letter)
const deload = isDeloadWeek(week)
const injured = program.injuredSide

function repsText(slot: Slot): string {
  const range = slot.repsMin === slot.repsMax ? `${slot.repsMin}` : `${slot.repsMin}–${slot.repsMax}`
  const unit = { reps: '', seconds: ' s', minutes: ' min', yards: ' yd', steps: ' steps' }[slot.repUnit]
  const side = slot.perSideLabel ? ` ${slot.perSideLabel}` : ''
  return `${range}${unit}${side}`
}

function loadText(slot: Slot): string {
  const ex = exerciseById(slot.exerciseId)
  const parts: string[] = []
  switch (ex.loadType) {
    case 'dumbbell-each':
      parts.push(`dumbbells, ${ex.increment} lb steps`)
      break
    case 'dumbbell-single':
      parts.push(`one dumbbell, ${ex.increment} lb steps`)
      break
    case 'stack':
      parts.push(ex.loadDirection === 'down' ? 'assist stack, one plate less is harder' : 'stack, one plate steps')
      break
    case 'smith-plates':
      parts.push('Smith, track plates, 10 lb steps')
      break
    case 'plates':
      parts.push(`plates, ${ex.increment} lb steps`)
      break
    case 'step-height':
      parts.push(`${slot.heightIn ?? '?'} in. step${slot.heightMaxIn ? ` to ${slot.heightMaxIn} in.` : ''}, 2 in. risers`)
      if (ex.holdsLoad) parts.push('holds dumbbells')
      break
    case 'band':
      parts.push('mini band')
      break
    case 'bodyweight':
    case 'time':
      parts.push('bodyweight')
      break
  }
  if (slot.rangeStopDeg) parts.push(`range 90° to ${slot.rangeStopDeg}°`)
  if (slot.loadBeforeHeightLb) parts.push(`load to ${slot.loadBeforeHeightLb} lb before height`)
  if (slot.loadNote) parts.push(slot.loadNote)
  return parts.join(' · ')
}

const rpe = (slot: Slot) =>
  slot.rpeTarget === undefined ? '' : `, RPE ${slot.rpeTarget}${slot.rpeTargetEnd ? `→${slot.rpeTargetEnd}` : ''}`

console.log(`${program.title} · Week ${week} · Session ${letter} · Phase ${phase.number}: ${phase.name}`)
console.log(deload ? 'Deload week: sets × 2/3 rounded down, minimum 2; loads unchanged; no progression' : 'Not a deload week')
const circuitMinutes = program.warmUp.lift.circuitMinutesByPhase[String(phase.number)]
console.log(`Warm-up: 5 min upright bike, then the ${circuitMinutes}-minute knee circuit (${program.warmUp.lift.circuit.length} items)`)
console.log('')

for (const slot of slotsForWeek(template, week)) {
  const ex = exerciseById(slot.exerciseId)
  const sets = prescribedSets(slot.sets, week)
  const setsText = sets === slot.sets ? `${sets}` : `${sets} (deload, from ${slot.sets})`
  const flags = [
    slot.optional ? 'optional' : '',
    slot.unilateral ? `injured (${injured}) ${slot.injuredOnly ? 'side only' : 'side first'}` : '',
    slot.pairWithSlot ? `paired with ${slot.pairWithSlot.split('-').at(-1)}` : '',
    slot.weeks ? (slot.weeks[0] === slot.weeks[1] ? `week ${slot.weeks[0]}` : `weeks ${slot.weeks[0]}–${slot.weeks[1]}`) : '',
  ].filter(Boolean)
  console.log(`${slot.label.padStart(9)}  ${ex.name}`)
  console.log(`${''.padStart(11)}${setsText} × ${repsText(slot)}${rpe(slot)}   [${slot.prescriptionText}]`)
  console.log(`${''.padStart(11)}${loadText(slot)} · ${slot.progressionRule}${flags.length ? ' · ' + flags.join(' · ') : ''}`)
  if (ex.sideMeaning) console.log(`${''.padStart(11)}${ex.sideMeaning}`)
  for (const cue of slot.cues) console.log(`${''.padStart(11)}${cue}`)
  if (ex.stages) console.log(`${''.padStart(11)}Stages: ${ex.stages.join(' → ')}`)
  if (slot.substitutionIds.length) {
    console.log(`${''.padStart(11)}Swap: ${slot.substitutionIds.map((id) => exerciseById(id).name).join(' → ')}`)
  }
  console.log('')
}
