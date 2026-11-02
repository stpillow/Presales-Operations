import { expect, test, type Locator, type Page } from '@playwright/test'

/*
 * The Program screen's editor on the built app, held the way Shawn holds the phone. What the unit
 * tests can't reach: what a typed new cue does when the view or the screen changes before Add cue.
 */

/** Tuesday of week 1: Phase 1, as a fresh phone starts. */
const TUESDAY_WEEK_1 = '2026-11-03T09:00:00-05:00'
const LEG_PRESS = 'Leg press, both legs'

let errors: string[] = []

test.beforeEach(async ({ page }) => {
  errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  await page.clock.install({ time: new Date(TUESDAY_WEEK_1) })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  await page.goto('/#/program')
  await expect(page.getByRole('heading', { name: 'Program', level: 1 })).toBeVisible()
  await expect(page.getByText('Opening storage…')).toHaveCount(0)
})

test.afterEach(() => {
  expect(errors).toEqual([])
})

/** Phase 1 A's first slot, the leg press: its list item. */
function legPressSlot(page: Page): Locator {
  return page.getByRole('region', { name: 'Session A' }).getByRole('listitem').filter({ has: page.getByRole('heading', { name: LEG_PRESS, level: 3 }) })
}

const editButton = (page: Page) => page.getByRole('button', { name: `Edit cues and substitutions for ${LEG_PRESS}, slot 1` })
const doneButton = (page: Page) => page.getByRole('button', { name: `Done editing ${LEG_PRESS}, slot 1` })
const newCueField = (page: Page) => legPressSlot(page).getByLabel('A new cue, in your words')

test('a new cue typed but not added survives the program.md view and another tab, as its line says', async ({ page }) => {
  const cue = 'Knees track over the second toe'
  await editButton(page).click()
  await newCueField(page).fill(cue)

  // To program.md and back with the editor open: the editor and its field are as they were.
  await page.getByRole('radio', { name: /program\.md/ }).click()
  await expect(page.getByRole('heading', { name: LEG_PRESS, level: 3 })).toHaveCount(0)
  await page.getByRole('radio', { name: /This phase/ }).click()
  await expect(newCueField(page)).toHaveValue(cue)

  // Closed, the slot says the cue waits; it still does after the reference view and after another tab.
  await doneButton(page).click()
  const waits = legPressSlot(page).getByText(`Your new cue wasn’t added yet: “${cue}”.`, { exact: false })
  await expect(waits).toBeVisible()
  await page.getByRole('radio', { name: /program\.md/ }).click()
  await page.getByRole('radio', { name: /This phase/ }).click()
  await expect(waits).toBeVisible()
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Today' }).click()
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  // Back the way the tabs go, More then Program: the same page, no reload.
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Program', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Program', level: 1 })).toBeVisible()
  await expect(waits).toBeVisible()

  // It waits in the field, as the line says, and Add cue adds it.
  await editButton(page).click()
  await expect(newCueField(page)).toHaveValue(cue)
  await legPressSlot(page).getByRole('button', { name: 'Add cue' }).click()
  await expect(newCueField(page)).toHaveValue('')
  await doneButton(page).click()
  await expect(legPressSlot(page).getByRole('listitem').filter({ hasText: cue })).toHaveCount(1)
  await expect(waits).toHaveCount(0)
})
