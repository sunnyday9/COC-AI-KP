/**
 * Story file parsers — extract plain text from various formats.
 * Used by fileHandlers for RAG indexing.
 */
import { JSDOM } from 'jsdom'

function stripHtml(html) {
  if (!html || typeof html !== 'string') return ''
  try {
    const dom = new JSDOM(html)
    return (dom.window.document.body?.textContent || '').trim()
  } catch {
    return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

/**
 * Parse DOCX buffer to plain text.
 */
export async function parseDocx(buffer) {
  const mammoth = (await import('mammoth')).default || (await import('mammoth'))
  const result = await mammoth.extractRawText({ buffer })
  return (result?.value || '').trim()
}

/**
 * Parse EPUB buffer to plain text (chapter contents concatenated).
 * Uses epub2 which provides a clean Promise-based API.
 */
export async function parseEpub(buffer) {
  const { createTempFile } = await getTempFileHelper()
  const tmpPath = await createTempFile(buffer, '.epub')
  try {
    const EPub = (await import('epub2')).default || (await import('epub2')).EPub
    const epub = await EPub.createAsync(tmpPath)
    const flow = epub.flow || []
    const texts = []
    for (const chapter of flow) {
      if (!chapter.id) continue
      try {
        const html = await new Promise((resolve, reject) => {
          epub.getChapter(chapter.id, (err, data) => {
            if (err) reject(err)
            else resolve(data)
          })
        })
        if (html) texts.push(stripHtml(html))
      } catch {
        // Skip unreadable chapters
      }
    }
    return texts.join('\n\n')
  } finally {
    try { const { unlink } = await import('node:fs/promises'); await unlink(tmpPath) } catch {}
  }
}

/**
 * Helper to write buffer to a temp file (epub2 requires a file path).
 */
async function getTempFileHelper() {
  const { writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { randomBytes } = await import('node:crypto')
  return {
    createTempFile: async (buffer, ext) => {
      const name = `coc_epub_${randomBytes(8).toString('hex')}${ext}`
      const p = join(tmpdir(), name)
      await writeFile(p, buffer)
      return p
    },
  }
}

/**
 * Parse HTML string to plain text.
 */
export function parseHtml(htmlString) {
  return stripHtml(htmlString || '')
}

/**
 * Parse story content by extension. Returns plain text.
 * @param {string} ext - e.g. '.docx', '.epub', '.html'
 * @param {Buffer|string} data - file buffer (docx, epub) or string (html, txt, md)
 */
export async function parseByExtension(ext, data) {
  const e = (ext || '').toLowerCase()
  if (e === '.docx') {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf-8')
    return parseDocx(buf)
  }
  if (e === '.epub') {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'binary')
    return parseEpub(buf)
  }
  if (e === '.html' || e === '.htm') {
    return parseHtml(typeof data === 'string' ? data : String(data))
  }
  return null
}
