// 계약 테스트 ④ — contract/examples/ 공통 JSON과 ③ TS 사본(examples.ts)이 같은 값인지 본다(CONTRACTS.md 「9」).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { EXAMPLES } from './examples'

const EXAMPLES_DIR = fileURLToPath(new URL('../../../contract/examples/', import.meta.url))

/** contract/examples/ 아래 모든 .json — 기준 상대 경로('auth/me-response.json' 꼴), 정렬 */
const jsonFiles = readdirSync(EXAMPLES_DIR, { recursive: true, encoding: 'utf8' })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => p.endsWith('.json'))
  .sort()

describe('contract examples ④ — TS 사본 = 공통 JSON', () => {
  it('공통 JSON마다 TS 사본이 있고, 사본마다 공통 JSON이 있다', () => {
    assert.deepStrictEqual(Object.keys(EXAMPLES).sort(), jsonFiles)
  })

  for (const file of jsonFiles) {
    it(file, () => {
      const json: unknown = JSON.parse(readFileSync(join(EXAMPLES_DIR, file), 'utf8'))
      assert.deepStrictEqual(EXAMPLES[file], json)
    })
  }
})
