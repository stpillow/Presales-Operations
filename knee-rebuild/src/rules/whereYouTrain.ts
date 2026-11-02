import type { Equipment, EquipmentId, Location, Program } from '../schema/index.ts'
import { DUMBBELLS, availableEquipment, matchTyped, normalizeTyped, type Available, type ChecklistGroup } from './equipment.ts'
import { withPresent } from './locations.ts'

/*
 * The decisions behind Where you train and the location editor (M4b, design sections 5 and 6):
 * what a gym lacks of the checklist, which substitution-table row speaks for an item, what the
 * editor's "Not here" writes, what typed equipment comes to, and whether a name is taken. Pure:
 * the screens ask these and write the answer through src/db/repo.ts.
 */

/**
 * What a gym lacks of the editor's checklist (`equipmentChecklist`: the items the program uses,
 * less dumbbells and the bag), in the list's order. Where you train counts them: "3 not here".
 */
export function checklistNotHere(checklist: readonly ChecklistGroup[], available: Available): EquipmentId[] {
  return checklist.flatMap((group) => group.items.map((entry) => entry.item.id)).filter((id) => !available.has(id))
}

export type SubstitutionRow = Program['substitutionTable'][number]

/**
 * Substitution-table rows whose "Taken or missing" names list items in words other than the list's
 * names and aliases. program.md's bare "leg press" is both presses (PROGRAM-QUESTIONS 65), "Hip
 * abductor or adductor machine" is both hip machines, and "Medicine ball (Phase 3)" is the medicine
 * ball. "Dumbbell bench" names the dumbbell bench press, an exercise, so no item takes that row: a
 * flat bench also seats the Bulgarians and the hip thrusts, which a chest press doesn't stand in for.
 */
const ROW_ITEMS: Readonly<Record<string, readonly EquipmentId[]>> = {
  'Leg press': ['seated-leg-press', 'leg-press-45'],
  'Hip abductor or adductor machine': ['hip-abductor-machine', 'hip-adductor-machine'],
  'Medicine ball (Phase 3)': ['medicine-ball'],
}

/** The items a substitution-table row speaks for: the pinned readings above, otherwise the item whose name or alias the row's words are (`normalizeTyped`). */
export function rowItems(row: Pick<SubstitutionRow, 'takenOrMissing'>, vocabulary: readonly Pick<Equipment, 'id' | 'name' | 'aliases'>[]): EquipmentId[] {
  const pinned = ROW_ITEMS[row.takenOrMissing]
  if (pinned) return [...pinned]
  const words = normalizeTyped(row.takenOrMissing)
  return vocabulary.filter((item) => [item.name, ...item.aliases].some((name) => normalizeTyped(name) === words)).map((item) => item.id)
}

/** The editor's "If not here: …": the substitution table's row for an item, or null where the table gives none. */
export function ifNotHere(
  itemId: EquipmentId,
  vocabulary: readonly Pick<Equipment, 'id' | 'name' | 'aliases'>[],
  table: readonly SubstitutionRow[],
): SubstitutionRow | null {
  return table.find((row) => rowItems(row, vocabulary).includes(itemId)) ?? null
}

/** "New on the program's list": an item the list added after this gym's list was made (design section 2). */
export function newOnList(item: Pick<Equipment, 'addedIn'>, location: Pick<Location, 'listVersion'>): boolean {
  return item.addedIn > location.listVersion
}

/**
 * What the editor's "Not here" writes. `unlist` takes the item off the gym's list (`setPresent`).
 * At a gym started from Planet Fitness's list, an item the program's list added after the gym's
 * was made counts as here whatever the gym's list says (`availableEquipment`), so taking it off
 * would change nothing: it is marked off instead (`markOff`), which beats the list (PROGRAM-QUESTIONS 75).
 */
export function notHereWrite(
  location: Location,
  itemId: EquipmentId,
  vocabulary: readonly Pick<Equipment, 'id' | 'addedIn'>[],
  planetFitness: readonly EquipmentId[],
): 'unlist' | 'mark-off' {
  return availableEquipment(withPresent(location, itemId, false), vocabulary, planetFitness, []).has(itemId) ? 'mark-off' : 'unlist'
}

export type TypedOutcome =
  /** Nothing typed. */
  | { kind: 'empty' }
  /** An item a session uses, not here yet: "Matches Bosu or balance pad. Mark it here?", marked only on that tap. */
  | { kind: 'mark'; id: EquipmentId }
  /** Already here: nothing to write. */
  | { kind: 'already'; id: EquipmentId }
  /** Carried to every gym (`Settings.kit`): "In your bag" says whether he has it, never a gym's list (PROGRAM-QUESTIONS 75). */
  | { kind: 'bag'; id: EquipmentId }
  /** Dumbbells: the gym's dumbbell max says whether it has them, whatever its list says. */
  | { kind: 'rack' }
  /** On the program's list, but nothing the program does uses it: kept on the gym's list for the next program update (design section 6). */
  | { kind: 'unused'; id: EquipmentId }
  /** Near misses (`matchTyped`): a tap on one, or "Neither: keep as typed". Nothing is marked without that tap. */
  | { kind: 'choose'; ids: EquipmentId[] }
  /** Nothing on the list: kept as typed (the gym's extras) for the next program.md update. */
  | { kind: 'keep' }

/**
 * What an item named in "Something else here?" comes to, typed exactly or picked from the near
 * misses: the bag and the rack first (neither is a gym's list), then here already, then whether
 * the program uses it (`usedEquipment`).
 */
export function itemOutcome(
  id: EquipmentId,
  vocabulary: readonly Pick<Equipment, 'id' | 'carried'>[],
  used: ReadonlySet<EquipmentId>,
  available: Available,
): Exclude<TypedOutcome, { kind: 'empty' | 'choose' | 'keep' }> {
  if (vocabulary.find((item) => item.id === id)?.carried) return { kind: 'bag', id }
  if (id === DUMBBELLS) return { kind: 'rack' }
  if (available.has(id)) return { kind: 'already', id }
  return used.has(id) ? { kind: 'mark', id } : { kind: 'unused', id }
}

/**
 * What typed equipment comes to (design section 6): `matchTyped` against what is here (so an item
 * marked off reads as not here, and marking it clears the mark), then `itemOutcome` for an exact
 * name or alias. Near misses are offered, never marked; text that matches nothing is kept.
 */
export function typedOutcome(
  text: string,
  vocabulary: readonly Pick<Equipment, 'id' | 'name' | 'aliases' | 'carried'>[],
  used: ReadonlySet<EquipmentId>,
  available: Available,
): TypedOutcome {
  const match = matchTyped(text, vocabulary, [...available])
  switch (match.kind) {
    case 'empty':
      return { kind: 'empty' }
    case 'unknown':
      return { kind: 'keep' }
    case 'suggest':
      return { kind: 'choose', ids: match.ids }
    case 'known':
    case 'already':
      return itemOutcome(match.id, vocabulary, used, available)
  }
}

/**
 * Another gym the lists offer already goes by this name (`normalizeTyped`: case, accents and
 * punctuation aside), so Today's Change couldn't tell the two apart. Archived gyms have left the
 * lists, so their names are free again; `exceptId` is the gym being renamed.
 */
export function nameTaken(locations: readonly Pick<Location, 'id' | 'name' | 'archived'>[], name: string, exceptId: string | null): boolean {
  const wanted = normalizeTyped(name)
  return locations.some((l) => !l.archived && l.id !== exceptId && normalizeTyped(l.name) === wanted)
}
