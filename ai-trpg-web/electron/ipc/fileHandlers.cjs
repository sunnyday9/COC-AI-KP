const { ipcMain, app, dialog } = require('electron')
const fs = require('fs').promises
const path = require('path')
const { pathToFileURL } = require('url')
const pdfParse = require('pdf-parse')
const { assertRealPathInDir, assertParentRealPathInDir } = require('./pathSafety.cjs')

// 将剧本统一存放到项目根目录的 scripts 目录（ai-trpg-web/scripts）
// __dirname 指向 electron/ipc，所以需要跳两级到项目根再进入 scripts
const SCRIPTS_DIR = path.join(__dirname, '..', '..', 'scripts')
const STORIES_DIR = 'stories'

function getScriptsPath() {
  // 这里直接返回项目内 scripts 目录
  return SCRIPTS_DIR
}

function getStoriesPath() {
  const userData = app.getPath('userData')
  return path.join(userData, STORIES_DIR)
}

async function ensureStoriesDir() {
  const dir = getStoriesPath()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function ensureScriptsDir() {
  const dir = getScriptsPath()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

function registerFileHandlers() {
  ipcMain.handle('file:listScripts', async () => {
    const dir = await ensureScriptsDir()
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files = entries
      .filter((e) => e.isFile() && (e.name.endsWith('.json') || e.name.endsWith('.md')))
      .map((e) => ({ name: e.name, path: path.join(dir, e.name) }))
    return files
  })

  // 保存剧本到脚本库（scripts 目录）——用于 PDF → JSON 剧本生成
  ipcMain.handle('file:saveScriptToLibrary', async (_, filename, content) => {
    const dir = await ensureScriptsDir()
    // 仅替换 Windows 非法文件名字符，尽量保留原始名称（含中文、空格等）
    let safeName = (filename || 'script.json').replace(/[<>:"/\\|?*]+/g, '_')
    safeName = safeName.replace(/[. ]+$/g, '') || 'script.json'
    const base = path.parse(safeName).name.toUpperCase()
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(base)) safeName = '_' + safeName
    const filePath = path.join(dir, safeName)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return { ok: true, path: filePath, name: safeName }
  })

  ipcMain.handle('file:readScript', async (_, filePath) => {
    const dir = getScriptsPath()
    const safePath = await assertRealPathInDir(dir, filePath, 'script path')
    const content = await fs.readFile(safePath, 'utf-8')
    return content
  })

  ipcMain.handle('file:saveScript', async (_, filePath, content) => {
    const dir = getScriptsPath()
    const safePath = await assertParentRealPathInDir(dir, filePath, 'script path')
    await fs.mkdir(path.dirname(safePath), { recursive: true })
    await fs.writeFile(safePath, content, 'utf-8')
    return undefined
  })

  ipcMain.handle('file:deleteScript', async (_, filePath) => {
    const dir = getScriptsPath()
    const safePath = await assertRealPathInDir(dir, filePath, 'script path')
    await fs.unlink(safePath)
    return undefined
  })

  ipcMain.handle('file:importScript', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择剧本文件',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths?.length) return { ok: false, error: 'cancelled' }
    const srcPath = result.filePaths[0]
    const dir = await ensureScriptsDir()
    const filename = path.basename(srcPath)
    const destPath = path.join(dir, filename)
    try {
      const content = await fs.readFile(srcPath, 'utf-8')
      const data = JSON.parse(content)
      if (!data.meta || !data.scenes) throw new Error('Invalid script format')
      await fs.writeFile(destPath, content, 'utf-8')
      return { ok: true, path: destPath, name: filename }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Import failed' }
    }
  })

  const STORY_EXTENSIONS = ['.txt', '.md', '.json', '.pdf', '.docx', '.epub', '.html', '.htm']
  function isStoryFile(name) {
    const lower = name.toLowerCase()
    return STORY_EXTENSIONS.some((ext) => lower.endsWith(ext))
  }

  // Stories handlers
  ipcMain.handle('file:listStories', async () => {
    const dir = await ensureStoriesDir()
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const files = entries
        .filter((e) => e.isFile() && isStoryFile(e.name))
        .map((e) => ({ name: e.name, path: path.join(dir, e.name) }))
      return files
    } catch {
      return []
    }
  })

  ipcMain.handle('file:readStory', async (_, filePath) => {
    const dir = getStoriesPath()
    const safePath = await assertRealPathInDir(dir, filePath, 'story path')
    const ext = path.extname(safePath).toLowerCase()
    if (ext === '.pdf') {
      const dataBuffer = await fs.readFile(safePath)
      const pdfData = await pdfParse(dataBuffer)
      return pdfData.text
    }
    if (['.docx', '.epub'].includes(ext)) {
      try {
        const { parseByExtension } = await import(pathToFileURL(path.join(__dirname, '..', 'rag', 'storyParsers.mjs')).href)
        const dataBuffer = await fs.readFile(safePath)
        return await parseByExtension(ext, dataBuffer)
      } catch {
        return ''
      }
    }
    if (['.html', '.htm'].includes(ext)) {
      try {
        const { parseByExtension } = await import(pathToFileURL(path.join(__dirname, '..', 'rag', 'storyParsers.mjs')).href)
        const content = await fs.readFile(safePath, 'utf-8')
        return await parseByExtension(ext, content)
      } catch {
        return ''
      }
    }
    const content = await fs.readFile(safePath, 'utf-8')
    return content
  })

  // 专用于 RAG 索引：正文由 pdf-parse 提取；仅对 PDF 内嵌图片做 OCR，避免与正文重复
  ipcMain.handle('file:readStoryForRag', async (_, filePath) => {
    const dir = getStoriesPath()
    const safePath = await assertRealPathInDir(dir, filePath, 'story path')
    const ext = path.extname(safePath).toLowerCase()
    if (['.docx', '.epub'].includes(ext)) {
      try {
        const { parseByExtension } = await import(pathToFileURL(path.join(__dirname, '..', 'rag', 'storyParsers.mjs')).href)
        const dataBuffer = await fs.readFile(safePath)
        return (await parseByExtension(ext, dataBuffer)) || ''
      } catch {
        return ''
      }
    }
    if (['.html', '.htm'].includes(ext)) {
      try {
        const { parseByExtension } = await import(pathToFileURL(path.join(__dirname, '..', 'rag', 'storyParsers.mjs')).href)
        const content = await fs.readFile(safePath, 'utf-8')
        return (await parseByExtension(ext, content)) || ''
      } catch {
        return ''
      }
    }
    if (ext !== '.pdf') {
      const content = await fs.readFile(safePath, 'utf-8')
      return content
    }
    const dataBuffer = await fs.readFile(safePath)
    const pdfData = await pdfParse(dataBuffer)
    let mainText = (pdfData.text || '').trim()
    try {
      // Defensive limits: avoid main-process stalls on huge or image-heavy PDFs.
      const stat = await fs.stat(safePath).catch(() => null)
      if (stat && stat.size > 50 * 1024 * 1024) return mainText

      const { PDFDocument, PDFRawStream, PDFName, decodePDFRawStream } = await import('pdf-lib')
      const Tesseract = (await import('tesseract.js')).default
      const doc = await PDFDocument.load(new Uint8Array(dataBuffer))
      const entries = doc.context.enumerateIndirectObjects()
      const imageBuffers = []
      for (const [, obj] of entries) {
        if (imageBuffers.length >= 8) break
        if (!(obj instanceof PDFRawStream)) continue
        const dict = obj.dict
        const subtypeRef = dict.get(PDFName.of('Subtype'))
        if (!subtypeRef) continue
        const subtype = doc.context.lookup(subtypeRef)
        if (!subtype || subtype.encodedName !== '/Image') continue
        let bytes = obj.getContents()
        const filterRef = dict.get(PDFName.of('Filter'))
        if (filterRef) {
          const filter = doc.context.lookup(filterRef)
          const isDCT = filter && filter.encodedName === '/DCTDecode'
          if (!isDCT) {
            try {
              const decoded = decodePDFRawStream({ dict: obj.dict, contents: bytes })
              bytes = decoded.getBytes()
            } catch {
              continue
            }
          }
        }
        const buf = Buffer.from(bytes)
        if (buf.length > 5 * 1024 * 1024) continue
        const isJpeg = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8
        const isPng = buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
        if (isJpeg || isPng) imageBuffers.push(buf)
      }
      if (imageBuffers.length) {
        const worker = await Tesseract.createWorker('chi_sim+eng')
        const imageTexts = []
        for (let i = 0; i < imageBuffers.length; i++) {
          const { data } = await worker.recognize(imageBuffers[i])
          if (data.text && data.text.trim()) {
            imageTexts.push(`[插图 ${i + 1}]\n${data.text.trim()}`)
          }
        }
        await worker.terminate()
        if (imageTexts.length) {
          mainText += '\n\n--- 以下为 PDF 内嵌插图中识别的内容（场景结构图等）---\n\n' + imageTexts.join('\n\n')
        }
      }
    } catch (err) {
      // 内嵌图提取或 OCR 失败时仅保留正文
    }
    return mainText
  })

  ipcMain.handle('file:importStory', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择故事文件',
      properties: ['openFile'],
      filters: [
        { name: 'PDF 文件', extensions: ['pdf'] },
        { name: 'Word 文档', extensions: ['docx'] },
        { name: 'EPUB 电子书', extensions: ['epub'] },
        { name: '文本/网页', extensions: ['txt', 'md', 'json', 'html', 'htm'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePaths?.length) return { ok: false, error: 'cancelled' }
    const srcPath = result.filePaths[0]
    const dir = await ensureStoriesDir()
    const filename = path.basename(srcPath)
    const destPath = path.join(dir, filename)
    try {
      const ext = path.extname(srcPath).toLowerCase()
      const binaryExts = ['.pdf', '.docx', '.epub']
      if (binaryExts.includes(ext)) {
        const dataBuffer = await fs.readFile(srcPath)
        await fs.writeFile(destPath, dataBuffer)
      } else {
        const content = await fs.readFile(srcPath, 'utf-8')
        await fs.writeFile(destPath, content, 'utf-8')
      }
      return { ok: true, path: destPath, name: filename }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Import failed' }
    }
  })

  ipcMain.handle('file:deleteStory', async (_, filePath) => {
    const dir = getStoriesPath()
    const safePath = await assertRealPathInDir(dir, filePath, 'story path')
    await fs.unlink(safePath)
    return undefined
  })
}

module.exports = { registerFileHandlers }
