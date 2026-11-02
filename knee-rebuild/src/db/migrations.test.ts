import { describe, expect, it } from 'vitest'
import { Location, PLANET_FITNESS_LOCATION_ID } from '../schema/index.ts'
import { HOME_ADDITIONS, homeLocation } from './migrations.ts'

describe('homeLocation', () => {
  const list = ['smith-machine', 'seated-leg-press', 'mats', 'rower']

  it('is Planet Fitness, started from its list, with the dumbbell max passed in', () => {
    const home = homeLocation(80, list, '2026-11-01', 1)
    expect(Location.parse(home)).toEqual(home)
    expect(home).toMatchObject({
      id: PLANET_FITNESS_LOCATION_ID,
      name: 'Planet Fitness',
      dumbbellMaxLb: 80,
      startedFrom: 'planet-fitness',
      listVersion: 1,
      extras: [],
      markedOff: [],
      createdOn: '2026-11-01',
      archived: false,
    })
  })

  it('has the list plus both leg presses and the rower, each once, list first', () => {
    expect(HOME_ADDITIONS).toEqual(['seated-leg-press', 'leg-press-45', 'rower'])
    expect(homeLocation(80, list, '2026-11-01', 1).present).toEqual(['smith-machine', 'seated-leg-press', 'mats', 'rower', 'leg-press-45'])
    expect(homeLocation(80, [], '2026-11-01', 1).present).toEqual(['seated-leg-press', 'leg-press-45', 'rower'])
  })

  it('takes the dumbbell max, creation date and list version as given', () => {
    const home = homeLocation(60, list, '2026-12-01', 3)
    expect([home.dumbbellMaxLb, home.createdOn, home.listVersion]).toEqual([60, '2026-12-01', 3])
  })

  it('does not share arrays with its input or between calls', () => {
    const input = [...list]
    const first = homeLocation(80, input, '2026-11-01', 1)
    first.present.push('bosu')
    first.extras.push({ id: 'x', text: 'kettlebells', addedOn: '2026-11-02' })
    expect(input).toEqual(list)
    expect(homeLocation(80, input, '2026-11-01', 1)).toMatchObject({ present: [...list, 'leg-press-45'], extras: [] })
  })
})
