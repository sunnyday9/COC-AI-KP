const fs = require('fs')
const path = require('path')
const os = require('os')
const pdfParse = require('pdf-parse')

// This debug helper is optional; kept for local troubleshooting.
// It is not part of the automated test suite.

function makeSimplePdf(plainText) {
  const objs = []
  objs.push('1 0 obj' + NL + '<< /Type /Catalog /Pages 2 0 R >>' + NL + 'endobj' + NL)
  objs.push('2 0 obj' + NL + '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' + NL + 'endobj' + NL)
  objs.push(
    '3 0 obj' +
      NL +
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> >>' +
      NL +
      'endobj' +
      NL
  )
  const safeText = String(plainText).replace(/[()\\]/g, '')
  const content = `BT /F1 14 Tf 50 200 Td (${safeText}) Tj ET`
  objs.push(
    '4 0 obj' +
      NL +
      `<< /Length ${Buffer.byteLength(content, 'ascii')} >>` +
      NL +
      'stream' +
      NL +
      content +
      NL +
      'endstream' +
      NL +
      'endobj' +
      NL
  )
  objs.push('5 0 obj' + NL + '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' + NL + 'endobj' + NL)

  let out = '%PDF-1.1' + NL
  const offsets = [0]
  for (let i = 0; i < objs.length; i++) {
    offsets.push(Buffer.byteLength(out, 'ascii'))
    out += objs[i]
  }

  const xrefStart = Buffer.byteLength(out, 'ascii')
  out += 'xref' + NL + '0 6' + NL
  out += '0000000000 65535 f ' + NL
  for (let i = 1; i <= 5; i++) {
    const off = String(offsets[i]).padStart(10, '0')
    out += `${off} 00000 n ` + NL
  }
  out += 'trailer' + NL + '<< /Size 6 /Root 1 0 R >>' + NL + 'startxref' + NL
  out += String(xrefStart) + NL + '%%EOF' + NL
  return Buffer.from(out, 'ascii')
}

async function run() {
  const buf = makeSimplePdf('Library clue: KEY IN VASE')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfdbg-'))
  const p = path.join(dir, 't.pdf')
  fs.writeFileSync(p, buf)
  console.log('written', p, 'bytes', buf.length)
  console.log('tail', buf.toString('ascii').slice(-250))
  try {
    const r = await pdfParse(buf)
    console.log('ok text:', JSON.stringify(r.text))
  } catch (e) {
    console.error('parse error:', e && e.message ? e.message : e)
  }
}

run()

