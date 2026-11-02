/**
 * What a slot's card on the Program screen holds that isn't stored yet: the new-cue field's text and
 * the editor's last refusal. A card unmounts when the editor's view changes or Shawn leaves for
 * another tab, so they wait here, by slot id, until the app closes; the card reads them back when
 * it mounts again, so "It waits in the new-cue field" holds (Program.helpers `unaddedCueWords`).
 * Nothing here is a decision or a write; a reload starts empty, as any unsaved field does.
 */
export interface SlotDraft {
  /** The new-cue field's text, typed but not added. */
  newCue: string
  /** The editor's last refusal or failed save, kept under the slot after it closes. */
  standing: string | null
}

export const EMPTY_DRAFT: Readonly<SlotDraft> = Object.freeze({ newCue: '', standing: null })

const drafts = new Map<string, SlotDraft>()

/** What the slot's card held when it last unmounted; empty for a slot it never held anything for. */
export function slotDraft(slotId: string): SlotDraft {
  return { ...(drafts.get(slotId) ?? EMPTY_DRAFT) }
}

/** Keeps one part of the slot's draft; a slot whose parts are all empty again is let go. */
export function keepSlotDraft<K extends keyof SlotDraft>(slotId: string, part: K, value: SlotDraft[K]): void {
  const next = { ...slotDraft(slotId), [part]: value }
  if (next.newCue === EMPTY_DRAFT.newCue && next.standing === EMPTY_DRAFT.standing) drafts.delete(slotId)
  else drafts.set(slotId, next)
}

/** Lets go of every slot's draft. */
export function forgetSlotDrafts(): void {
  drafts.clear()
}
