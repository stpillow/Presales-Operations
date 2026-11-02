import { describe, expect, it } from 'vitest'
import { SCREEN_NAMES, crashWords } from './ErrorBoundary.helpers.ts'

describe('crashWords: what a screen that threw says instead of a blank app', () => {
  it('names the screen, says in words that what was saved is kept, and points to Today or Reload', () => {
    expect(crashWords('week')).toEqual({
      title: 'Week stopped',
      sentence: 'Something on the Week screen went wrong, so it stopped rather than show you something wrong. Everything already saved stays on this phone.',
      next: 'Go to Today, or reload the app.',
    })
    expect(crashWords('session').sentence).toContain('the Session runner screen')
  })

  it('says the same of the whole app when no screen can be named', () => {
    expect(crashWords(null)).toEqual({
      title: 'The app stopped',
      sentence: 'Something in the app went wrong, so it stopped rather than show you something wrong. Everything already saved stays on this phone.',
      next: 'Go to Today, or reload the app.',
    })
  })

  it('names every route by the words its screen or button uses, each once', () => {
    expect(SCREEN_NAMES).toEqual({
      today: 'Today',
      session: 'Session runner',
      morning: 'Morning check',
      run: 'Log a run',
      week: 'Week',
      progress: 'Progress',
      gates: 'Gates',
      program: 'Program',
      settings: 'Settings',
      more: 'More',
      locations: 'Where you train',
      location: 'Location editor',
      'new-location': 'New location',
      'next-update': 'For the next program update',
    })
    const names = Object.values(SCREEN_NAMES)
    expect(new Set(names).size).toBe(names.length)
  })
})
