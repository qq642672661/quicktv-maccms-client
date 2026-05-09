#!/usr/bin/env zx
const run = require('./process')

async function dev() {
  await run(`tsx ./build/build-flavor.ts`, '')
  // await run(`eslint -c eslint.config.mjs`, '')
  process.env.WEBPACK_DEV_SERVER_BASE_PORT = '38989'
  await run(`hippy-dev -c ./scripts/quicktvui-webpack.dev.ts`, '')
}

dev().catch((e) => {
  console.error(e)
})
