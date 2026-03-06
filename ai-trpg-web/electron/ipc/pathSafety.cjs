const path = require('path')
const fs = require('fs').promises

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0
}

function assertSafeId(id, label = 'id') {
  if (!isNonEmptyString(id)) throw new Error(`${label} must be a non-empty string`)
  if (id.length > 120) throw new Error(`${label} too long`)
  // Prevent path traversal and invalid Windows filename characters.
  if (id.includes('..')) throw new Error(`${label} contains invalid sequence`)
  if (/[<>:"/\\|?*\x00-\x1F]/.test(id)) throw new Error(`${label} contains invalid characters`)
  // Windows treats trailing dots/spaces specially; reject to avoid surprises.
  if (/[. ]$/.test(id)) throw new Error(`${label} must not end with dot/space`)
  return id
}

function isSubpath(rootDir, candidatePath) {
  const root = path.resolve(rootDir)
  const cand = path.resolve(candidatePath)
  const rel = path.relative(root, cand)
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel))
}

function assertPathInDir(rootDir, candidatePath, label = 'path') {
  if (!isNonEmptyString(candidatePath)) throw new Error(`${label} must be a non-empty string`)
  const root = path.resolve(rootDir)
  const cand = path.resolve(candidatePath)
  if (!isSubpath(root, cand)) throw new Error(`${label} is outside the allowed directory`)
  return cand
}

function resolveFileInDir(rootDir, fileName, label = 'file') {
  if (!isNonEmptyString(fileName)) throw new Error(`${label} must be a non-empty string`)
  const full = path.resolve(rootDir, fileName)
  return assertPathInDir(rootDir, full, label)
}

async function assertRealPathInDir(rootDir, candidatePath, label = 'path') {
  const cand = assertPathInDir(rootDir, candidatePath, label)
  try {
    const real = await fs.realpath(cand)
    assertPathInDir(rootDir, real, `${label} (realpath)`)
  } catch {
    // If the path doesn't exist yet (e.g. before write) or realpath fails, fall back to string check.
  }
  return cand
}

async function assertParentRealPathInDir(rootDir, candidatePath, label = 'path') {
  const cand = assertPathInDir(rootDir, candidatePath, label)
  const parent = path.dirname(cand)
  try {
    const realParent = await fs.realpath(parent)
    assertPathInDir(rootDir, realParent, `${label} directory (realpath)`)
  } catch {
    // Parent may not exist yet; creation will still be constrained by the resolved path check above.
  }
  return cand
}

module.exports = {
  assertSafeId,
  assertPathInDir,
  resolveFileInDir,
  assertRealPathInDir,
  assertParentRealPathInDir,
  isSubpath,
}

