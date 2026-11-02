import { beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_DRAFT, forgetSlotDrafts, keepSlotDraft, slotDraft } from './drafts.ts'

describe('slot drafts: what a slot card holds between visits', () => {
  beforeEach(() => forgetSlotDrafts())

  it('starts empty for every slot', () => {
    expect(slotDraft('p1a-1')).toEqual(EMPTY_DRAFT)
    expect(EMPTY_DRAFT).toEqual({ newCue: '', standing: null })
  })

  it('keeps each part per slot, so a card mounted again (the program.md view, another tab) finds what it held', () => {
    keepSlotDraft('p1a-1', 'newCue', 'Knees track over the second toe')
    keepSlotDraft('p1a-1', 'standing', 'A cue runs to 200 characters; this one is 230. Cue 1 is kept as it was until it fits.')
    keepSlotDraft('p1a-2', 'newCue', 'Slow down')
    expect(slotDraft('p1a-1')).toEqual({ newCue: 'Knees track over the second toe', standing: 'A cue runs to 200 characters; this one is 230. Cue 1 is kept as it was until it fits.' })
    expect(slotDraft('p1a-2')).toEqual({ newCue: 'Slow down', standing: null })
    expect(slotDraft('p1b-1')).toEqual(EMPTY_DRAFT)
  })

  it('lets go of a slot once it holds nothing, and of every slot at once', () => {
    keepSlotDraft('p1a-1', 'newCue', 'x')
    keepSlotDraft('p1a-1', 'newCue', '')
    expect(slotDraft('p1a-1')).toEqual(EMPTY_DRAFT)
    keepSlotDraft('p1a-2', 'newCue', 'y')
    forgetSlotDrafts()
    expect(slotDraft('p1a-2')).toEqual(EMPTY_DRAFT)
  })
})
