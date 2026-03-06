import { _electron as electron } from 'playwright-core'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

async function selectFirstNonEmptyOption(page, selector) {
  const selects = await page.$$(selector)
  for (const s of selects) {
    const value = await s.evaluate((el) => {
      const sel = /** @type {HTMLSelectElement} */ (el)
      const opt = Array.from(sel.options).find((o) => o.value && o.value.trim())
      return opt ? opt.value : ''
    })
    if (value) await s.selectOption(value)
  }
}

async function main() {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-coc-e2e-'))

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      E2E_FORCE_PROD: '1',
      E2E_MOCK_AI: '1',
      E2E_USER_DATA_DIR: userDataDir,
    },
  })

  try {
    const page = await app.firstWindow()
    page.on('pageerror', (e) => console.error('[E2E][pageerror]', e))
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('[E2E][console:error]', m.text())
    })
    await page.waitForLoadState('domcontentloaded')

    // Seed a minimal indexed story so HomeView can start game
    const storyId = 'e2e_story'
    await page.evaluate(async ({ storyId }) => {
      const api = window.electronAPI
      if (!api?.ragIndex) throw new Error('electronAPI.ragIndex not available')
      await api.ragIndex({
        scriptId: storyId,
        storyMeta: { name: 'E2E 测试故事' },
        chunks: [
          {
            id: 'c1',
            type: 'scene',
            content: '场景：旧图书馆。线索：一本破损日记提到“钥匙在花瓶里”。',
            metadata: { storyId, sceneId: 'library', source: 'e2e' },
          },
          {
            id: 'c2',
            type: 'npc',
            content: 'NPC：管理员阿洛伊斯，谨慎且不愿谈论地下室。',
            metadata: { storyId, sceneId: 'library', source: 'e2e' },
          },
        ],
      })
    }, { storyId })

    // Reload so HomeView lists indexed stories
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('heading', { name: 'AI COC Keeper' }).first().waitFor({ timeout: 30_000 })

    const indexed = await page.evaluate(async () => {
      const api = window.electronAPI
      if (!api?.ragListStories) return []
      return await api.ragListStories()
    })
    console.log('[E2E] indexedStories', indexed)
    assert(Array.isArray(indexed) && indexed.length > 0, 'No indexed stories returned by ragListStories()')

    // Start game from HomeView
    const storyBtn = page.locator('button', { hasText: 'E2E 测试故事' }).first()
    await storyBtn.waitFor({ timeout: 30_000 })
    await storyBtn.click()
    await page.waitForURL(/\/occupation$/)

    // Select first occupation card
    await page.locator('div.grid').first().waitFor({ timeout: 30_000 })
    const occButtons = page.locator('div.grid button').filter({ has: page.locator('h3') })
    const occCount = await occButtons.count()
    assert(occCount > 0, 'No occupation cards found')
    await occButtons.first().click()
    await page.waitForURL(/\/character-create$/)

    // Roll attributes
    await page.getByRole('button', { name: /投掷属性|重新投掷/ }).click()

    // Fill selects (occupation interpersonal/any + interest skills)
    await selectFirstNonEmptyOption(page, 'select')

    // Fill player name
    await page.getByPlaceholder('调查员').fill('E2E 调查员')

    // Confirm and enter game
    const confirmBtn = page.getByRole('button', { name: '确认角色并进入游戏' })
    await confirmBtn.click()
    await page.waitForURL(/\/game$/)

    // Wait for input enabled after opening (mocked AI finishes)
    const input = page.getByPlaceholder('描述你的行动...')
    await input.waitFor({ state: 'visible', timeout: 30_000 })
    await input.waitFor({ state: 'attached' })
    await page.waitForFunction(
      () => {
        const el = document.querySelector('textarea[placeholder="描述你的行动..."]')
        return el && !(el instanceof HTMLTextAreaElement && el.disabled)
      },
      { timeout: 15_000 }
    )
    await input.fill('我检查书架与花瓶。')
    await page.getByRole('button', { name: '发送' }).click()

    // Basic chat assertion: player message appears
    await page.getByText('我检查书架与花瓶。').waitFor({ timeout: 15_000 })

    // Save / Load smoke in UI
    await page.getByRole('button', { name: /存档/ }).click()
    await page.getByPlaceholder('存档名称').fill('E2E 存档 1')
    await page.getByRole('button', { name: '保存' }).click()
    try {
      await page.getByPlaceholder('存档名称').waitFor({ state: 'detached', timeout: 15_000 })
    } catch (_e) {
      const saveErr = await page.locator('p.text-blood-300').first().innerText().catch(() => '')
      throw new Error(`Save modal did not close. saveError=${saveErr || '(none)'}`)
    }

    await page.getByRole('button', { name: /读档/ }).click()
    // Save list may show id first, then meta name; accept either
    await page.locator('div[class*="rounded-lg"] button').filter({ hasText: /E2E 存档 1|save_\d+/ }).first().waitFor({ timeout: 15_000 })

    console.log('[E2E] PASS')
  } finally {
    await app.close()
    try { await fs.rm(userDataDir, { recursive: true, force: true }) } catch (_e) {}
  }
}

main().catch((err) => {
  console.error('[E2E] FAIL', err)
  process.exit(1)
})

