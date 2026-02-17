import type { RAGChunk } from '../types/script'

/**
 * 智能分块：按句子和段落边界分割，保持语义完整性
 * 优先保持段落完整，其次保持句子完整，避免在单词中间分割
 */
export function textToChunks(
  content: string,
  storyId: string,
  options?: { chunkSize?: number; overlap?: number; minChunkSize?: number }
): RAGChunk[] {
  const chunkSize = options?.chunkSize ?? 800
  const overlap = options?.overlap ?? 100
  const minChunkSize = options?.minChunkSize ?? 200

  // 先按双换行分割段落（保留段落结构）
  const rawParagraphs = content.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0)

  const chunks: RAGChunk[] = []
  let chunkIndex = 0

  // 将段落按句子分割（支持中文和英文标点）
  function splitIntoSentences(text: string): string[] {
    // 匹配句子结束符：. ! ? 。！？以及可能的引号
    return text.split(/([.!?。！？][\s"'"'"'"'"]*)/)
      .filter((s) => s.trim().length > 0)
      .reduce<string[]>((acc, part, idx, arr) => {
        if (idx === 0) {
          acc.push(part)
        } else if (/^[.!?。！？]/.test(part)) {
          // 标点符号，合并到前一句
          if (acc.length > 0) acc[acc.length - 1] += part
        } else {
          acc.push(part)
        }
        return acc
      }, [])
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }

  let currentChunk = ''
  let currentLength = 0

  for (const para of rawParagraphs) {
    const sentences = splitIntoSentences(para)
    const paraText = para + '\n\n'

    // 如果当前块加上整个段落不超过大小，直接添加
    if (currentLength + paraText.length <= chunkSize) {
      currentChunk = currentChunk ? currentChunk + paraText : para
      currentLength += paraText.length
      continue
    }

    // 如果单个段落就超过大小，按句子分割
    if (paraText.length > chunkSize) {
      // 先保存当前块（如果有）
      if (currentChunk.trim() && currentLength >= minChunkSize) {
        chunks.push({
          id: `story-${storyId}-chunk-${chunkIndex}`,
          content: currentChunk.trim(),
          type: 'rule',
          metadata: { storyId, chunkIndex: chunkIndex.toString() },
        })
        chunkIndex++
        currentChunk = ''
        currentLength = 0
      }

      // 按句子处理长段落
      for (const sentence of sentences) {
        const sentenceText = sentence + (sentence.match(/[.!?。！？]$/) ? ' ' : '. ')
        const sentenceLength = sentenceText.length

        // 如果当前块加上句子不超过大小，添加
        if (currentLength + sentenceLength <= chunkSize) {
          currentChunk = currentChunk ? currentChunk + sentenceText : sentenceText
          currentLength += sentenceLength
        } else {
          // 保存当前块
          if (currentChunk.trim() && currentLength >= minChunkSize) {
            chunks.push({
              id: `story-${storyId}-chunk-${chunkIndex}`,
              content: currentChunk.trim(),
              type: 'rule',
              metadata: { storyId, chunkIndex: chunkIndex.toString() },
            })
            chunkIndex++

            // 重叠：保留最后几个句子
            const overlapSentences = currentChunk.split(/[.!?。！？]\s+/).filter(Boolean)
            const overlapCount = Math.max(1, Math.floor(overlapSentences.length * 0.3))
            const overlapText = overlapSentences.slice(-overlapCount).join('. ') + '. '
            currentChunk = overlapText + sentenceText
            currentLength = overlapText.length + sentenceLength
          } else {
            // 当前块太小，直接替换
            currentChunk = sentenceText
            currentLength = sentenceLength
          }
        }
      }
      // 段落结束后添加换行
      if (currentChunk) {
        currentChunk += '\n\n'
        currentLength += 2
      }
    } else {
      // 段落会超过大小，但当前块加上它会超，先保存当前块
      if (currentChunk.trim() && currentLength >= minChunkSize) {
        chunks.push({
          id: `story-${storyId}-chunk-${chunkIndex}`,
          content: currentChunk.trim(),
          type: 'rule',
          metadata: { storyId, chunkIndex: chunkIndex.toString() },
        })
        chunkIndex++

        // 重叠：保留当前块的末尾部分
        const overlapText = currentChunk.slice(-Math.min(overlap, currentChunk.length))
        currentChunk = overlapText + paraText
        currentLength = overlapText.length + paraText.length
      } else {
        // 当前块太小，直接添加段落（即使会超过大小）
        currentChunk = currentChunk ? currentChunk + paraText : para
        currentLength += paraText.length
      }
    }
  }

  // 保存最后一块
  if (currentChunk.trim()) {
    chunks.push({
      id: `story-${storyId}-chunk-${chunkIndex}`,
      content: currentChunk.trim(),
      type: 'rule',
      metadata: { storyId, chunkIndex: chunkIndex.toString() },
    })
  }

  return chunks.length > 0 ? chunks : [
    {
      id: `story-${storyId}-chunk-0`,
      content: content.trim() || '(空内容)',
      type: 'rule',
      metadata: { storyId, chunkIndex: '0' },
    },
  ]
}

/**
 * 将 Markdown 文件转换为 RAG chunks
 * 按标题层级分割，保持章节结构，智能合并小章节
 */
export function markdownToChunks(
  content: string,
  storyId: string,
  options?: { chunkSize?: number; overlap?: number; minChunkSize?: number }
): RAGChunk[] {
  const chunkSize = options?.chunkSize ?? 1000
  const overlap = options?.overlap ?? 150
  const minChunkSize = options?.minChunkSize ?? 300

  // 按标题分割（保留标题层级信息）
  const sections: Array<{ level: number; title: string; content: string }> = []
  const lines = content.split('\n')
  let currentSection: { level: number; title: string; content: string } | null = null

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      // 保存上一个章节
      if (currentSection) {
        sections.push(currentSection)
      }
      currentSection = {
        level: headerMatch[1].length,
        title: headerMatch[2].trim(),
        content: line + '\n',
      }
    } else if (currentSection) {
      currentSection.content += line + '\n'
    } else {
      // 文件开头没有标题的内容
      if (sections.length === 0) {
        sections.push({ level: 0, title: '', content: line + '\n' })
      } else {
        sections[sections.length - 1].content += line + '\n'
      }
    }
  }
  if (currentSection) {
    sections.push(currentSection)
  }

  const chunks: RAGChunk[] = []
  let chunkIndex = 0
  let currentChunk = ''
  let currentLength = 0
  let currentTitle = ''

  for (const section of sections) {
    const sectionText = section.content.trim()
    const sectionLength = sectionText.length

    // 如果当前块加上章节不超过大小，合并
    if (currentLength + sectionLength <= chunkSize) {
      if (section.level > 0 && !currentTitle) {
        currentTitle = section.title
      }
      currentChunk = currentChunk ? currentChunk + '\n\n' + sectionText : sectionText
      currentLength += sectionLength + 2
    } else {
      // 保存当前块
      if (currentChunk.trim() && currentLength >= minChunkSize) {
        chunks.push({
          id: `story-${storyId}-chunk-${chunkIndex}`,
          content: currentChunk.trim(),
          type: 'rule',
          metadata: {
            storyId,
            chunkIndex: chunkIndex.toString(),
            ...(currentTitle ? { title: currentTitle } : {}),
          },
        })
        chunkIndex++

        // 重叠：保留当前块的末尾部分
        const overlapText = currentChunk.slice(-Math.min(overlap, currentChunk.length))
        currentChunk = overlapText + '\n\n' + sectionText
        currentLength = overlapText.length + sectionLength + 2
        currentTitle = section.level > 0 ? section.title : ''
      } else {
        // 当前块太小，直接替换
        currentChunk = sectionText
        currentLength = sectionLength
        currentTitle = section.level > 0 ? section.title : ''
      }
    }

    // 如果单个章节就超过大小，按段落进一步分割
    if (sectionLength > chunkSize) {
      // 先保存当前块
      if (currentChunk.trim() && currentLength >= minChunkSize) {
        chunks.push({
          id: `story-${storyId}-chunk-${chunkIndex}`,
          content: currentChunk.trim(),
          type: 'rule',
          metadata: {
            storyId,
            chunkIndex: chunkIndex.toString(),
            ...(currentTitle ? { title: currentTitle } : {}),
          },
        })
        chunkIndex++
        currentChunk = ''
        currentLength = 0
        currentTitle = ''
      }

      // 对长章节按段落分割
      const paragraphs = sectionText.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
      for (const para of paragraphs) {
        const paraText = para + '\n\n'
        if (currentLength + paraText.length <= chunkSize) {
          currentChunk = currentChunk ? currentChunk + paraText : para
          currentLength += paraText.length
        } else {
          if (currentChunk.trim() && currentLength >= minChunkSize) {
            chunks.push({
              id: `story-${storyId}-chunk-${chunkIndex}`,
              content: currentChunk.trim(),
              type: 'rule',
              metadata: {
                storyId,
                chunkIndex: chunkIndex.toString(),
                ...(currentTitle ? { title: currentTitle } : {}),
              },
            })
            chunkIndex++
            const overlapText = currentChunk.slice(-Math.min(overlap, currentChunk.length))
            currentChunk = overlapText + paraText
            currentLength = overlapText.length + paraText.length
          } else {
            currentChunk = para
            currentLength = paraText.length
          }
        }
      }
    }
  }

  // 保存最后一块
  if (currentChunk.trim()) {
    chunks.push({
      id: `story-${storyId}-chunk-${chunkIndex}`,
      content: currentChunk.trim(),
      type: 'rule',
      metadata: {
        storyId,
        chunkIndex: chunkIndex.toString(),
        ...(currentTitle ? { title: currentTitle } : {}),
      },
    })
  }

  return chunks.length > 0 ? chunks : [
    {
      id: `story-${storyId}-chunk-0`,
      content: content.trim() || '(空内容)',
      type: 'rule',
      metadata: { storyId, chunkIndex: '0' },
    },
  ]
}

/**
 * 清理 PDF 提取的文本：移除多余的空白、修复换行问题
 */
function cleanPdfText(text: string): string {
  return text
    // 移除多个连续空格
    .replace(/[ \t]+/g, ' ')
    // 修复 PDF 中常见的单词间换行（保留连字符）
    .replace(/([a-zA-Z])-\s*\n\s*([a-zA-Z])/g, '$1$2')
    // 移除单词中间的换行（PDF 常见问题）
    .replace(/([a-zA-Z0-9])\s*\n\s*([a-zA-Z0-9])/g, '$1 $2')
    // 规范化段落分隔（多个换行变为双换行）
    .replace(/\n{3,}/g, '\n\n')
    // 移除行首行尾空白
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

/**
 * 根据文件扩展名选择合适的分块方法
 */
export function fileToChunks(
  content: string,
  storyId: string,
  filename: string
): RAGChunk[] {
  const ext = filename.toLowerCase().split('.').pop() || ''
  
  // PDF 文件：先清理文本，然后按文本处理
  if (ext === 'pdf') {
    const cleaned = cleanPdfText(content)
    return textToChunks(cleaned, storyId)
  }
  
  // Markdown 文件：按标题分割
  if (ext === 'md' || ext === 'markdown') {
    return markdownToChunks(content, storyId)
  }
  
  // 其他文本文件：按段落和句子分割
  return textToChunks(content, storyId)
}
