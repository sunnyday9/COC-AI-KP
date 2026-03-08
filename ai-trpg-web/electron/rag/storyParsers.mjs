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
 */
export async function parseEpub(buffer) {
  const mod = await import('epub-parser')
  const epubParser = mod.default || mod
  return new Promise((resolve, reject) => {
    epubParser.open(buffer, (err, epubData) => {
      if (err) return reject(err)
      try {
        const opsRoot = epubData?.paths?.opsRoot || ''
        const linearSpine = epubData?.easy?.linearSpine || {}
        const texts = []
        for (const id of Object.keys(linearSpine)) {
          const item = linearSpine[id]?.item
          const href = item?.$?.href
          if (href) {
            const filePath = (opsRoot + href).replace(/\/\/+/g, '/')
            try {
              const html = epubParser.extractText(filePath)
              if (html) texts.push(stripHtml(html))
            } catch {
              // Skip unreadable items
            }
          }
        }
        resolve(texts.join('\n\n'))
      } catch (e) {
        reject(e)
      }
    })
  })
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
