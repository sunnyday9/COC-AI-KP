const { registerSettingsHandlers } = require('./settingsHandlers.cjs')
const { registerFileHandlers } = require('./fileHandlers.cjs')
const { registerSaveHandlers } = require('./saveHandlers.cjs')
const { registerAIHandlers } = require('./aiHandlers.cjs')
const { registerKPAgentHandlers } = require('./kpAgentHandlers.cjs')

function registerAllHandlers() {
  registerSettingsHandlers()
  registerFileHandlers()
  registerSaveHandlers()
  registerAIHandlers()
  registerKPAgentHandlers()
}

module.exports = { registerAllHandlers }
