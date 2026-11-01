import type { Equipment, EquipmentId, Exercise, IsoDate, Location, Requirement, RunType, SessionTemplate, Slot } from '../schema/index.ts'
import { slotsForPhaseWeek } from './session.ts'

/**
 * Where you train (M4b, design section 3): what a gym has, which exercise each slot runs there,
 * how far a balance ladder can climb, and what typed equipment matches. Pure: the location, the
 * program's equipment list and Settings.kit come in as arguments.
 */

/** The list item a gym's dumbbell max stands for: a max above 0 means dumbbells, 0 means none. */
export const DUMBBELLS: EquipmentId = 'dumbbells'

export type Available = ReadonlySet<EquipmentId>

/**
 * What is here: the gym's `present` items plus the kit (carried to every gym). Two things the list
 * alone doesn't say:
 * - An item the program's list added after this gym's list was made (`addedIn` above `listVersion`)
 *   counts as here at a gym started from Planet Fitness's list when that list has it, and not here
 *   at a gym started empty, unless `present` names it.
 * - Dumbbells follow `dumbbellMaxLb`, whatever `present` says.
 * An item marked off from the runner or Today is not here, even if `present` or the new-item rule
 * says it is; the kit is never marked off (PROGRAM-QUESTIONS 72).
 */
export function availableEquipment(
  location: Pick<Location, 'present' | 'dumbbellMaxLb' | 'startedFrom' | 'listVersion' | 'markedOff'>,
  vocabulary: readonly Pick<Equipment, 'id' | 'addedIn'>[],
  planetFitness: readonly EquipmentId[],
  kit: readonly EquipmentId[],
): Available {
  const here = new Set<EquipmentId>(location.present)
  if (location.startedFrom === 'planet-fitness') {
    const listed = new Set(planetFitness)
    for (const item of vocabulary) if (item.addedIn > location.listVersion && listed.has(item.id)) here.add(item.id)
  }
  for (const { id } of location.markedOff) here.delete(id)
  if (location.dumbbellMaxLb > 0) here.add(DUMBBELLS)
  else here.delete(DUMBBELLS)
  for (const id of kit) here.add(id)
  return here
}

/** Whether one requirement holds: the item is here, or (for `anyOf`) any one of them is. */
export function requirementHolds(requirement: Requirement, available: Available): boolean {
  return typeof requirement === 'string' ? available.has(requirement) : requirement.anyOf.some((id) => available.has(id))
}

/** The requirements that don't hold here, in the exercise's order; empty means it runs. */
export function missingFor(requires: readonly Requirement[], available: Available): Requirement[] {
  return requires.filter((r) => !requirementHolds(r, available))
}

export type ExerciseLookup = ReadonlyMap<string, Exercise>

function lookup(byId: ExerciseLookup, id: string): Exercise {
  const exercise = byId.get(id)
  if (!exercise) throw new Error(`unknown exercise: ${id}`)
  return exercise
}

/** A slot's exercises in the program's order: its own, then its substitutions. */
export function slotOrder(slot: Pick<Slot, 'exerciseId' | 'substitutionIds'>): string[] {
  return [slot.exerciseId, ...slot.substitutionIds]
}

export interface PassedOver {
  exerciseId: string
  /** What this gym lacks for it. */
  missing: Requirement[]
}

export interface SlotRoute {
  /** `own`: the slot's exercise runs. `moved`: a substitution runs. `none`: nothing on the list is here. */
  kind: 'own' | 'moved' | 'none'
  /** The exercise to run; on `none`, the slot's own, kept so the runner can offer Skip or Do it anyway. */
  exerciseId: string
  /** The exercises ahead of it in the program's order, each with what is missing. */
  passedOver: PassedOver[]
}

/**
 * Which exercise a slot runs at this gym: the first of [own, ...substitutionIds] whose requirements
 * all hold. Nothing from outside the slot's list is ever picked (Shawn's Nov 1 answer 6).
 */
export function routeSlot(slot: Pick<Slot, 'exerciseId' | 'substitutionIds'>, byId: ExerciseLookup, available: Available): SlotRoute {
  const passedOver: PassedOver[] = []
  for (const [index, id] of slotOrder(slot).entries()) {
    const missing = missingFor(lookup(byId, id).requires, available)
    if (missing.length === 0) return { kind: index === 0 ? 'own' : 'moved', exerciseId: id, passedOver }
    passedOver.push({ exerciseId: id, missing })
  }
  return { kind: 'none', exerciseId: slot.exerciseId, passedOver }
}

/**
 * The exercises a cap or a back-off may move to from `currentId`: the entries of [own, ...subs]
 * after it in that order whose requirements hold here. Never the current exercise and never an
 * earlier one, so a gym never walks a slot backward from the engine's pick. An exercise that isn't
 * on the slot's list has nothing ahead of it, so every entry that holds is offered (as
 * `nextSubstitution` reads it; PROGRAM-QUESTIONS 74).
 */
export function fallbacksAfter(slot: Pick<Slot, 'exerciseId' | 'substitutionIds'>, currentId: string, byId: ExerciseLookup, available: Available): Exercise[] {
  const order = slotOrder(slot)
  return order
    .slice(order.indexOf(currentId) + 1)
    .filter((id) => id !== currentId)
    .map((id) => lookup(byId, id))
    .filter((exercise) => missingFor(exercise.requires, available).length === 0)
}

/**
 * How far a stage ladder can climb here: the index of the last stage before the first one whose
 * `stageRequires` don't hold ("Bosu isn't marked here; staying at folded mat, eyes closed").
 * Null when every stage can run or the exercise has no stages; -1 when not even the first stage
 * can (a bosu and no mat: PROGRAM-QUESTIONS 73).
 */
export function stageCeiling(exercise: Pick<Exercise, 'stages' | 'stageRequires'>, available: Available): number | null {
  if (!exercise.stages || !exercise.stageRequires) return null
  const firstMissing = exercise.stageRequires.findIndex((needs) => missingFor(needs, available).length > 0)
  return firstMissing === -1 ? null : firstMissing - 1
}

export type RunSwapType = Extract<RunType, 'elliptical-swap' | 'rower-swap'>

/** The machine each run swap needs. */
export const RUN_SWAP_MACHINE: Readonly<Record<RunSwapType, EquipmentId>> = { 'elliptical-swap': 'elliptical', 'rower-swap': 'rower' }

export interface RunSwapHere {
  type: RunSwapType
  here: boolean
}

/** Both run swaps in program.md's order ("elliptical or rower"), each marked here or not; both stay loggable. */
export function runSwapsHere(available: Available): RunSwapHere[] {
  return (['elliptical-swap', 'rower-swap'] as const).map((type) => ({ type, here: available.has(RUN_SWAP_MACHINE[type]) }))
}

/**
 * The swap to suggest on a Hold run day: the first one here, elliptical then rower. Null when
 * neither machine is here: no suggestion, he picks (Shawn's Nov 1 answer 7).
 */
export function suggestedRunSwap(available: Available): RunSwapType | null {
  return runSwapsHere(available).find((swap) => swap.here)?.type ?? null
}

export type TypedMatch =
  | { kind: 'known' | 'already'; id: EquipmentId }
  | { kind: 'suggest'; ids: EquipmentId[] }
  | { kind: 'unknown' }
  | { kind: 'empty' }

/** Typed text as matched: accents, case, punctuation and extra spaces dropped ("45° Leg-press" reads "45 leg press"). */
export function normalizeTyped(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const STEM = 3
const MAX_SUGGESTIONS = 3

function wordsOf(normalized: string): string[] {
  return normalized.split(' ').filter((w) => w.length >= STEM)
}

/**
 * What a typed piece of equipment is. An exact name or alias, after `normalizeTyped`, is `known`
 * (`already` when `present` has it). Otherwise near misses: items sharing the first three letters
 * of a word with one of their names or aliases, at most three ("Rowing machine" suggests Rower and
 * Seated row). A word that points at more than three items ("machine", "leg") says too little on
 * its own: it only ranks, unless no word is that telling, when the items every word points at are
 * suggested if there are three or fewer ("leg press": both presses). Rarer words rank first, a
 * whole word beats a shared stem, and a name the typed words cover breaks a tie. Nothing is ever
 * ticked here; the editor asks first (PROGRAM-QUESTIONS 71).
 */
export function matchTyped(text: string, vocabulary: readonly Pick<Equipment, 'id' | 'name' | 'aliases'>[], present: readonly EquipmentId[]): TypedMatch {
  const typed = normalizeTyped(text)
  if (typed === '') return { kind: 'empty' }
  const exact = vocabulary.find((item) => [item.name, ...item.aliases].some((n) => normalizeTyped(n) === typed))
  if (exact) return { kind: present.includes(exact.id) ? 'already' : 'known', id: exact.id }
  const ids = nearMisses(typed, vocabulary)
  return ids.length > 0 ? { kind: 'suggest', ids } : { kind: 'unknown' }
}

function nearMisses(typed: string, vocabulary: readonly Pick<Equipment, 'id' | 'name' | 'aliases'>[]): EquipmentId[] {
  const items = vocabulary.map((item, order) => {
    const names = [item.name, ...item.aliases].map((n) => normalizeTyped(n).split(' '))
    return { id: item.id, order, names, words: new Set(names.flat().filter((w) => w.length >= STEM)) }
  })
  type Item = (typeof items)[number]
  const pointers = [...new Set(wordsOf(typed))]
    .map((word) => {
      const stem = word.slice(0, STEM)
      return { word, hits: items.filter((item) => [...item.words].some((w) => w.slice(0, STEM) === stem)) }
    })
    .filter((p) => p.hits.length > 0)
  if (pointers.length === 0) return []

  const telling = pointers.filter((p) => p.hits.length <= MAX_SUGGESTIONS)
  let candidates: Item[]
  if (telling.length > 0) {
    candidates = items.filter((item) => telling.some((p) => p.hits.includes(item)))
  } else {
    candidates = items.filter((item) => pointers.every((p) => p.hits.includes(item)))
    if (candidates.length > MAX_SUGGESTIONS) return []
  }
  // Rarer words weigh more, and a whole-word match beats a shared stem ("rowing" in "rowing ergometer").
  const score = (item: Item) =>
    pointers.reduce((sum, p) => (p.hits.includes(item) ? sum + (item.words.has(p.word) ? 2 : 1) / p.hits.length : sum), 0)
  // On a tie, an item with a name the typed words cover entirely ("bench" in "incline bench") goes first.
  const stems = new Set(pointers.map((p) => p.word.slice(0, STEM)))
  const covered = (item: Item) => (item.names.some((ws) => ws.every((w) => w.length >= STEM && stems.has(w.slice(0, STEM)))) ? 1 : 0)
  return candidates
    .map((item) => ({ item, score: score(item), covered: covered(item) }))
    .sort((a, b) => b.score - a.score || b.covered - a.covered || a.item.order - b.item.order)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ item }) => item.id)
}

export interface CoverageMove {
  slotId: string
  /** The slot's own exercise. */
  from: string
  /** What runs instead; on `none`, the own exercise again. */
  to: string
  kind: 'moved' | 'none'
  /** What the gym lacks for the own exercise. */
  missing: Requirement[]
}

export interface TemplateCoverage {
  templateId: string
  /** Slots that don't run their own exercise here, in session order; empty when everything does. */
  moves: CoverageMove[]
}

/** What a gym changes, per template, for the slots that run in this week of the phase ("What this changes", Today's moves). */
export function locationCoverage(templates: readonly SessionTemplate[], phaseWeek: number, byId: ExerciseLookup, available: Available): TemplateCoverage[] {
  return templates.map((template) => ({
    templateId: template.id,
    moves: slotsForPhaseWeek(template, phaseWeek).flatMap((slot): CoverageMove[] => {
      const route = routeSlot(slot, byId, available)
      if (route.kind === 'own') return []
      return [{ slotId: slot.id, from: slot.exerciseId, to: route.exerciseId, kind: route.kind, missing: route.passedOver[0]?.missing ?? [] }]
    }),
  }))
}

export interface ProgramUpdateNote {
  text: string
  locationName: string
  /** When it was typed; items on the program's list carry no date. */
  addedOn?: IsoDate
}

/**
 * Kept for the next program.md update: each gym's typed extras (with the date), then the items on
 * the program's list a gym has that no exercise requires or stages on, in the list's order.
 * Archived gyms are included: what was typed there was promised to be kept (PROGRAM-QUESTIONS 75).
 */
export function forNextProgramUpdate(
  locations: readonly Pick<Location, 'name' | 'present' | 'extras' | 'markedOff'>[],
  vocabulary: readonly Pick<Equipment, 'id' | 'name'>[],
  exercises: readonly Pick<Exercise, 'requires' | 'stageRequires'>[],
): ProgramUpdateNote[] {
  const used = new Set(
    exercises.flatMap((e) => [...e.requires, ...(e.stageRequires ?? []).flat()]).flatMap((r) => (typeof r === 'string' ? [r] : r.anyOf)),
  )
  return locations.flatMap((location) => {
    const markedOff = new Set(location.markedOff.map((m) => m.id))
    const present = new Set(location.present)
    return [
      ...location.extras.map((extra) => ({ text: extra.text, locationName: location.name, addedOn: extra.addedOn })),
      ...vocabulary
        .filter((item) => present.has(item.id) && !markedOff.has(item.id) && !used.has(item.id))
        .map((item) => ({ text: item.name, locationName: location.name })),
    ]
  })
}
