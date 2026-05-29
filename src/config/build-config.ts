import envManager from './env-manager'

const debug = envManager.debugMode
const env = !envManager.isProduction()

export default {
  DEBUG: debug,
  testEnv: env,
  useMockData: envManager.useMockData,
  VUE_PLUGIN_VERSION: 1,
  isLowEndDev: false,
  packageName: envManager.appPackageName,
  requestBaseUrl: envManager.maccmsApiUrl,
  tvBoxSimpleMode: envManager.tvBoxSimpleMode,
  tabContentPageSize: 10,
  defaultSourceUrl: '',
  
  get maccmsApiUrl() {
    return envManager.maccmsApiUrl
  },
  
  get maccmsTimeout() {
    return envManager.maccmsTimeout
  },
  
  isDevelopment() {
    return envManager.isDevelopment()
  },
  
  isProduction() {
    return envManager.isProduction()
  }
}
