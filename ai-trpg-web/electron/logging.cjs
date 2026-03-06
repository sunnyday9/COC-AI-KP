const LEVELS = new Set(['debug', 'info', 'warn', 'error'])

function log(level, component, message, meta) {
  const lv = LEVELS.has(level) ? level : 'info'
  const ts = new Date().toISOString()
  const base = `[${ts}][${component}][${lv.toUpperCase()}] ${message}`
  const data = meta && Object.keys(meta).length ? meta : undefined
  if (lv === 'error') {
    console.error(base, data ?? '')
  } else if (lv === 'warn') {
    console.warn(base, data ?? '')
  } else if (lv === 'debug') {
    console.debug ? console.debug(base, data ?? '') : console.log(base, data ?? '')
  } else {
    console.log(base, data ?? '')
  }
}

function logInfo(component, message, meta) {
  log('info', component, message, meta)
}

function logWarn(component, message, meta) {
  log('warn', component, message, meta)
}

function logError(component, message, meta) {
  log('error', component, message, meta)
}

module.exports = {
  log,
  logInfo,
  logWarn,
  logError,
}

