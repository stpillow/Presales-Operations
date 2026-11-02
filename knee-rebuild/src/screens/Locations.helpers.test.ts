import { describe, expect, it } from 'vitest'
import { homeLocation } from '../db/migrations.ts'
import { program } from '../program/program.ts'
import { availableEquipment, equipmentChecklist } from '../rules/equipment.ts'
import { newLocation } from '../rules/locations.ts'
import type { Location } from '../schema/index.ts'
import { archiveAsk, archivedWords, failedWords, locationRows, notHereWords, rackWords } from './Locations.helpers.ts'

const KIT = ['ankle-strap', 'mini-band']
const checklist = equipmentChecklist(program.equipment, program.exercises)
const availableOf = (l: Location) => availableEquipment(l, program.equipment, program.planetFitness, KIT)
const lists = { planetFitness: program.planetFitness, equipmentListVersion: program.equipmentListVersion }

const home = homeLocation(80, program.planetFitness, '2026-11-02', program.equipmentListVersion)
const marriott: Location = {
  ...newLocation('loc-1', { name: 'Marriott Downtown', startedFrom: 'empty', dumbbellMaxLb: 25, createdOn: '2026-11-09' }, lists),
  present: ['smith-machine', 'flat-bench', 'adjustable-bench', 'cable-station', 'mats'],
}
const hotel: Location = { ...newLocation('loc-2', { name: 'Hotel gym', startedFrom: 'planet-fitness', dumbbellMaxLb: 0, createdOn: '2026-11-03' }, lists), archived: true }

describe('rackWords and notHereWords', () => {
  it('says the rack and the count in words', () => {
    expect(rackWords(80)).toBe('Dumbbells to 80 lb')
    expect(rackWords(25)).toBe('Dumbbells to 25 lb')
    expect(rackWords(0)).toBe('No dumbbells')
    expect(notHereWords(0)).toBe('everything here')
    expect(notHereWords(1)).toBe('1 not here')
    expect(notHereWords(3)).toBe('3 not here')
  })
})

describe('locationRows', () => {
  it("lists Planet Fitness first, marks the active gym, and leaves archived gyms out", () => {
    const rows = locationRows([marriott, hotel, home], 'loc-1', checklist, availableOf)
    expect(rows.map((r) => [r.name, r.active, r.archivable])).toEqual([
      ['Planet Fitness', false, false],
      ['Marriott Downtown', true, true],
    ])
  })

  it("counts what the home gym lacks of the checklist: only the lying leg curl, which Shawn's club has none of", () => {
    const [row] = locationRows([home], 'planet-fitness', checklist, availableOf)
    expect(row?.summary).toBe('Dumbbells to 80 lb · 1 not here')
  })

  it('counts every checklist item a gym started empty lacks, leaving the rack and the bag to their own words', () => {
    const total = checklist.flatMap((g) => g.items).length
    const [, row] = locationRows([home, marriott], 'planet-fitness', checklist, availableOf)
    expect(row?.summary).toBe(`Dumbbells to 25 lb · ${total - 5} not here`)
  })

  it('counts a mark-off as not here', () => {
    const marked = { ...home, markedOff: [{ id: 'seated-leg-press', on: '2026-11-10' }] }
    expect(locationRows([marked], 'planet-fitness', checklist, availableOf)[0]?.summary).toBe('Dumbbells to 80 lb · 2 not here')
  })
})

describe('archiving in words', () => {
  it('asks once, inline, and says what it came to', () => {
    expect(archiveAsk('Marriott Downtown')).toBe('Archive Marriott Downtown? It leaves the lists; its sessions keep pointing at it, and nothing is deleted.')
    expect(archivedWords('Marriott Downtown', true, 'Planet Fitness')).toBe('Marriott Downtown is archived. It was the active gym, so Planet Fitness is active again.')
    expect(archivedWords('Hotel gym', false, 'Planet Fitness')).toBe('Hotel gym is archived.')
  })

  it('says a failed write in one sentence', () => {
    expect(failedWords('The switch', new Error('quota'), 'Today still plans at Planet Fitness.')).toBe('The switch did not save (quota); Today still plans at Planet Fitness.')
    expect(failedWords('Archiving', 'blocked', 'Hotel gym is still listed.')).toBe('Archiving did not save (blocked); Hotel gym is still listed.')
  })
})
