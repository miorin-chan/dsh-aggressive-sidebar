import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Config } from '../index.js'

function validate(value: unknown) {
  return Config['~standard'].validate(value)
}

test('defaults an empty config to the left sidebar and accepts both opening modes', () => {
  for (const [config, expected] of [
    [undefined, 'left-sidebar'],
    [{}, 'left-sidebar'],
    [{ mode: 'fullscreen' }, 'fullscreen'],
    [{ mode: 'left-sidebar' }, 'left-sidebar'],
  ]) {
    const result = validate(config)
    assert.equal(result.issues, undefined)
    assert.equal(result.value.mode.get(), expected)
  }
})

test('rejects a value that is not a plugin opening mode', () => {
  const result = validate({ mode: 'push' })
  assert.equal(result.value, undefined)
  assert.ok(result.issues.some(issue => issue.path?.includes('mode')))
})
