export interface EnvConfig {
  maccmsApiUrl: string
  maccmsTimeout: number
  appPackageName: string
  appVersion: string
  useMockData: boolean
  debugMode: boolean
  devServerHost: string
  devServerPort: number
}

class EnvironmentManager {
  private config: EnvConfig

  constructor() {
    this.config = this.loadConfig()
  }

  private loadConfig(): EnvConfig {
    const env = import.meta.env || {}
    
    return {
      maccmsApiUrl: env.VITE_MACCMS_API_URL || 'http://mockapi.quicktv.net/api',
      maccmsTimeout: parseInt(env.VITE_MACCMS_TIMEOUT || '10000'),
      appPackageName: env.VITE_APP_PACKAGE_NAME || 'es.tv.huan.hellotv',
      appVersion: env.VITE_APP_VERSION || '1.0.0',
      useMockData: env.VITE_USE_MOCK_DATA === 'true',
      debugMode: env.VITE_DEBUG_MODE === 'true',
      devServerHost: env.VITE_DEV_SERVER_HOST || '0.0.0.0',
      devServerPort: parseInt(env.VITE_DEV_SERVER_PORT || '38989')
    }
  }

  getConfig(): EnvConfig {
    return { ...this.config }
  }

  get maccmsApiUrl(): string {
    return this.config.maccmsApiUrl
  }

  get maccmsTimeout(): number {
    return this.config.maccmsTimeout
  }

  get appPackageName(): string {
    return this.config.appPackageName
  }

  get appVersion(): string {
    return this.config.appVersion
  }

  get useMockData(): boolean {
    return this.config.useMockData
  }

  get debugMode(): boolean {
    return this.config.debugMode
  }

  get devServerHost(): string {
    return this.config.devServerHost
  }

  get devServerPort(): number {
    return this.config.devServerPort
  }

  isDevelopment(): boolean {
    return import.meta.env.MODE === 'development'
  }

  isProduction(): boolean {
    return import.meta.env.MODE === 'production'
  }

  updateConfig(updates: Partial<EnvConfig>): void {
    this.config = {
      ...this.config,
      ...updates
    }
  }
}

export const envManager = new EnvironmentManager()
export default envManager
