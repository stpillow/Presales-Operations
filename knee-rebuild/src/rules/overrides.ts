import { CUE_MAX, showsText, type Exercise, type IsoDate, type ProgramOverride, type SessionTemplate, type Slot } from '../schema/index.ts'

/*
 * The Program screen's edits (M6, brief section 1). Shawn can rewrite a slot's cues and reorder,
 * remove or add its substitutions; the edit is stored as an override (Dexie version 4) and laid over
 * program.md's slot here, before anything routes or prescribes from it. Substitution edits change
 * the gym's routing, the runner's Swap list and where a back-off on bodyweight work moves
 * (PROGRAM-QUESTIONS 49) exactly as if program.md had written them that way. The seed slot is never
 * written; every function here returns new objects.
 */

/** What an edit sets on a slot: its cues and its substitutions, in order. */
export interface SlotEdit {
  cues: readonly string[]
  substitutionIds: readonly string[]
}

/** Which part of a slot runs on Shawn's words rather than program.md's. */
export interface Edited {
  cues: boolean
  substitutions: boolean
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * A substitution list as it can run on this slot: the slot's own exercise and repeats taken out,
 * and, with the catalog given, ids it no longer has (a later program.md may retire an exercise an
 * edit added), so the list never names something the engine can't look up.
 */
function runnable(slot: Slot, ids: readonly string[], known?: ReadonlySet<string>): string[] {
  const seen = new Set<string>([slot.exerciseId])
  const out: string[] = []
  for (const id of ids) {
    if (seen.has(id) || (known !== undefined && !known.has(id))) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * The slot the engine runs: program.md's slot with Shawn's edits laid over it. The cues and the
 * substitutions an override sets replace program.md's; a part it leaves out stays program.md's, and
 * everything else on the slot (exercise, sets, reps, rule, group) is always program.md's. An
 * override for another slot is ignored. `known`, the catalog's exercise ids, drops a substitution
 * the catalog no longer has; the slot's own exercise and repeats are always dropped.
 */
export function applyOverrides(slot: Slot, override: ProgramOverride | undefined, known?: ReadonlySet<string>): Slot {
  const own = { ...slot, cues: [...slot.cues], substitutionIds: [...slot.substitutionIds] }
  if (!override || override.slotId !== slot.id) return own
  return {
    ...own,
    ...(override.cues !== undefined ? { cues: [...override.cues] } : {}),
    ...(override.substitutionIds !== undefined ? { substitutionIds: runnable(slot, override.substitutionIds, known) } : {}),
  }
}

/** The stored overrides by slot id; a slot listed twice keeps its last row. */
export function overridesBySlot(overrides: readonly ProgramOverride[]): Map<string, ProgramOverride> {
  return new Map(overrides.map((o) => [o.slotId, o]))
}

/** A template with each slot's override laid over it (`applyOverrides`); the template as written is left alone. */
export function applyToTemplate(template: SessionTemplate, overrides: ReadonlyMap<string, ProgramOverride>, known?: ReadonlySet<string>): SessionTemplate {
  return { ...template, slots: template.slots.map((slot) => applyOverrides(slot, overrides.get(slot.id), known)) }
}

/** The slot's lists as they run: what the editor starts from. */
export function slotEdit(slot: Slot, override: ProgramOverride | undefined, known?: ReadonlySet<string>): SlotEdit {
  const applied = applyOverrides(slot, override, known)
  return { cues: applied.cues, substitutionIds: applied.substitutionIds }
}

/** Which part runs on Shawn's words: a list counts as edited only when what runs differs from what program.md writes. */
export function editedParts(slot: Slot, override: ProgramOverride | undefined, known?: ReadonlySet<string>): Edited {
  const applied = applyOverrides(slot, override, known)
  return { cues: !sameList(applied.cues, slot.cues), substitutions: !sameList(applied.substitutionIds, slot.substitutionIds) }
}

/**
 * A cue as it would be stored: every run of spaces, tabs, line breaks and other control characters
 * (a pasted bell or escape the eye can't see) one space, the ends trimmed. Plain text, one line,
 * which is what the schema's `Cue` takes.
 */
export function cleanCue(text: string): string {
  return text.replace(/[\s\p{Cc}]+/gu, ' ').trim()
}

/** A cue's length once cleaned, in characters as the schema counts them (code points): an emoji is one, not two. */
export function cueLength(text: string): number {
  return [...cleanCue(text)].length
}

/**
 * What is wrong with a cue, in words, measured as it would be stored; null when it can be saved.
 * It takes exactly what the schema's `Cue` takes once cleaned, so the screen never sends a cue the
 * phone then refuses without a sentence.
 */
export function cueProblem(text: string): string | null {
  const cue = cleanCue(text)
  if (!showsText(cue)) return 'A cue needs at least one word.'
  const length = cueLength(cue)
  if (length > CUE_MAX) return `A cue runs to ${CUE_MAX} characters; this one is ${length}.`
  return null
}

/**
 * The row to store for an edit: only the part that differs from program.md's slot, cues cleaned,
 * so the slot follows program.md on the part Shawn didn't change. Null when the edit comes back to
 * program.md's own lists on both counts: the row goes.
 */
export function overrideFor(slot: Slot, edit: SlotEdit, editedOn: IsoDate): ProgramOverride | null {
  const cues = edit.cues.map(cleanCue)
  const substitutionIds = runnable(slot, edit.substitutionIds)
  const cuesEdited = !sameList(cues, slot.cues)
  const subsEdited = !sameList(substitutionIds, slot.substitutionIds)
  if (!cuesEdited && !subsEdited) return null
  return { slotId: slot.id, ...(cuesEdited ? { cues } : {}), ...(subsEdited ? { substitutionIds } : {}), editedOn }
}

/**
 * Why a row can't be stored for this slot, in words, one sentence a problem; empty when it can. The
 * repo refuses a row with any: substitutions come from the catalog only, never the slot's own
 * exercise, each once; each cue is one the screen would take.
 */
export function overrideProblems(slot: Slot, override: ProgramOverride, catalog: ReadonlyMap<string, Pick<Exercise, 'id' | 'name'>>): string[] {
  if (override.slotId !== slot.id) return [`That edit is for slot ${override.slotId}, not ${slot.id}.`]
  const problems: string[] = []
  const name = (id: string) => catalog.get(id)?.name ?? id
  const seen = new Set<string>()
  for (const id of override.substitutionIds ?? []) {
    if (id === slot.exerciseId) problems.push(`${name(id)} is this slot’s own exercise, so it is never its substitution.`)
    else if (!catalog.has(id)) problems.push(`${id} is not in the program’s catalog; substitutions come from the catalog only.`)
    else if (seen.has(id)) problems.push(`${name(id)} is listed twice.`)
    seen.add(id)
  }
  ;(override.cues ?? []).forEach((cue, i) => {
    const problem = cueProblem(cue)
    if (problem) problems.push(`Cue ${i + 1}: ${problem}`)
  })
  return problems
}

/** The list with the item at `index` one place up (-1) or down (1); an item at the end it would leave stays. */
export function moveItem<T>(list: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by
  const out = [...list]
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return out
  const [item] = out.splice(index, 1) as [T]
  out.splice(to, 0, item)
  return out
}

/** The list without the item at `index`. */
export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

/** The list with `item` at `index`, clamped to the list: how a removed item is put back where it was. */
export function insertItem<T>(list: readonly T[], index: number, item: T): T[] {
  const out = [...list]
  out.splice(Math.min(Math.max(index, 0), list.length), 0, item)
  return out
}

/** The list with the item at `index` replaced; an index past the end changes nothing. */
export function replaceItem<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((x, i) => (i === index ? item : x))
}

/** A cue added at the end of the list, cleaned. */
export function withCueAdded(edit: SlotEdit, text: string): SlotEdit {
  return { ...edit, cues: [...edit.cues, cleanCue(text)] }
}

/** A substitution added at the end of the list: once, and never the slot's own exercise. */
export function withSubstitutionAdded(slot: Slot, edit: SlotEdit, exerciseId: string): SlotEdit {
  if (exerciseId === slot.exerciseId || edit.substitutionIds.includes(exerciseId)) return edit
  return { ...edit, substitutionIds: [...edit.substitutionIds, exerciseId] }
}

/**
 * What Add can offer a slot: every catalog exercise but its own and those already on its list
 * (never a new exercise). Its own exercise's pattern first, as most likely to do the slot's job;
 * then the rest, grouped by pattern in the order the patterns first appear in the catalog, catalog
 * order inside each.
 */
export function addableSubstitutions(slot: Slot, edit: SlotEdit, catalog: readonly Exercise[]): { samePattern: Exercise[]; others: Exercise[] } {
  const taken = new Set([slot.exerciseId, ...edit.substitutionIds])
  const pattern = catalog.find((e) => e.id === slot.exerciseId)?.pattern
  const open = catalog.filter((e) => !taken.has(e.id))
  const patterns = [...new Set(catalog.map((e) => e.pattern))].filter((p) => p !== pattern)
  return {
    samePattern: open.filter((e) => e.pattern === pattern),
    others: patterns.flatMap((p) => open.filter((e) => e.pattern === p)),
  }
}
