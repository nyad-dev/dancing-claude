import { expect, test } from 'claude-code/testing'

const band = (bodyColumns: number) => ({
  plugin: 'dancing-claude',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns, scroll: { offset: 0, bodyRows: 20 }, view: {} },
})

test('Clawd draws above the prompt on the terminal, as wide as the band', async $ => {
  const ui = await $.ui.mount({ ...band(100), surface: 'terminal' })
  const raster = await ui.find({ type: 'Raster', key: 'clawd' })
  expect(raster).toBeDefined()
  await ui.unmount()
})

test('Clawd draws as an animated SVG on the desktop', async $ => {
  const ui = await $.ui.mount({ ...band(100), surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('Clawd yields the band to a survey', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>survey</Text>
  })
  const ui = await $.ui.mount({ ...band(100), surface: 'terminal', props: { ...band(100).props, hasSurvey: true } })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ text: 'survey' })).toBeDefined()
  await ui.unmount()
})
