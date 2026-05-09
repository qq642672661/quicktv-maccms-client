interface ImportMetaEnv {
  readonly VITE_MACCMS_API_URL: string
  readonly VITE_MACCMS_TIMEOUT: string
  readonly VITE_APP_PACKAGE_NAME: string
  readonly VITE_APP_VERSION: string
  readonly VITE_USE_MOCK_DATA: string
  readonly VITE_DEBUG_MODE: string
  readonly VITE_DEV_SERVER_HOST: string
  readonly VITE_DEV_SERVER_PORT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
