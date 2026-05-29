#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { spawnSync } = require('child_process')
const { textPrompts, resultPrompts, phoneCameraResultPrompts, allResultPrompts, resultText, schemaVersion } = require('./tv-box-field-wizard-schema')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const outputEnvPath = process.env.TV_BOX_FIELD_WIZARD_ENV || path.join(reportDir, 'tv-box-field-wizard-latest.env')
const outputJsonPath = process.env.TV_BOX_FIELD_WIZARD_JSON || path.join(reportDir, 'tv-box-field-wizard-latest.json')
const outputMarkdownPath = process.env.TV_BOX_FIELD_WIZARD_MD || path.join(reportDir, 'tv-box-field-wizard-latest.md')
const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const assumeDefaults = args.has('--defaults') || process.env.TV_BOX_FIELD_WIZARD_ASSUME_DEFAULTS === 'true'
const shouldRunRecord = !dryRun && !args.has('--no-run')

function usage() {
  console.log(`HelloTV 电视盒子现场验收向导

用法:
  npm run tv-box:field-wizard
  npm run tv-box:field-wizard -- --dry-run --defaults

交互模式会逐项询问盒子、遥控器、摄像头、麦克风和验收结果。
--dry-run 只生成向导记录，不调用 tv-box:field-record。
--defaults 使用默认值，适合 CI/交付包生成示例。
`)
}

function env(name, fallback = '') {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

function normalizeResult(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['1', 'p', 'pass', 'passed', 'ok', 'true', 'yes', 'y', '通过', '正常', '好'].includes(normalized)) return 'pass'
  if (['2', 'f', 'fail', 'failed', 'false', 'no', 'n', '失败', '不通过', '异常', '坏'].includes(normalized)) return 'fail'
  if (['3', 's', 'skip', 'skipped', '跳过', '未测', '没测'].includes(normalized)) return 'skip'
  if (['4', 'na', 'n/a', 'not_applicable', 'not-applicable', '不适用', '无', '没有'].includes(normalized)) return 'na'
  if (['5', 'u', 'unknown', '未知', '不清楚', ''].includes(normalized)) return 'unknown'
  return ''
}

function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`
}

function markdownCell(value) {
  return String(value || '').replace(/\|/g, '/')
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer))
  })
}

async function askText(rl, key, label, fallback) {
  const defaultValue = env(key, fallback)
  if (assumeDefaults) return defaultValue
  const suffix = defaultValue ? ` [${defaultValue}]` : ''
  const answer = await ask(rl, `${label}${suffix}: `)
  return answer.trim() || defaultValue
}

async function askResult(rl, key, label) {
  const defaultValue = normalizeResult(env(key)) || 'unknown'
  if (assumeDefaults) return defaultValue
  for (;;) {
    const answer = await ask(rl, `${label} 1通过 2失败 3跳过 4不适用 5未知 [${resultText[defaultValue]}]: `)
    const result = normalizeResult(answer || defaultValue)
    if (result) return result
    console.log('请输入 1/2/3/4/5，或 pass/fail/skip/na/unknown。')
  }
}

async function askAppendMatrix(rl) {
  if (args.has('--append')) return true
  if (args.has('--no-append') || assumeDefaults) return false
  const answer = await ask(rl, '是否把本次结果追加到累计兼容性矩阵？输入 y 才追加；直接回车只刷新 latest [n]: ')
  return ['y', 'yes', 'true', '1', '追加', '是'].includes(answer.trim().toLowerCase())
}

function writeOutputs(record) {
  fs.mkdirSync(reportDir, { recursive: true })
  const repoRelativeEnvPath = path.relative(rootDir, outputEnvPath) || outputEnvPath
  const envLines = Object.entries(record.env)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join('\n')
  fs.writeFileSync(outputEnvPath, `${envLines}\n`)
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(record, null, 2)}\n`)

  const markdown = `# HelloTV 电视盒子现场验收向导记录

- 生成时间 UTC: \`${record.generatedAtUtc}\`
- schema: \`${record.schemaVersion}\`
- dry run: \`${record.dryRun}\`
- 是否追加累计矩阵: \`${record.appendMatrix}\`
- env 文件: \`${repoRelativeEnvPath}\`

## 现场信息

| 项目 | 值 |
| --- | --- |
${textPrompts.map(([key, label]) => `| ${label} | ${markdownCell(record.env[key]) || '未填写'} |`).join('\n')}

## 验收结果

| 项目 | 结果 |
| --- | --- |
${allResultPrompts.map(([key, label]) => `| ${label} | ${resultText[record.env[key]] || record.env[key] || '未知'} |`).join('\n')}

## 下一步

- 如只是生成示例或未完成实机测试，保持 \`FIELD_APPEND_MATRIX=false\`，不要污染累计矩阵。
- 如已经在真实电视盒子前逐项测完，重新运行 \`npm run tv-box:field-wizard\`，最后选择追加累计矩阵。
- 需要复用本次字段时，可执行：

\`\`\`bash
source ${repoRelativeEnvPath}
npm run tv-box:field-record
npm run tv-box:compatibility-summary
\`\`\`

如果是在解压后的交付目录里查看本文件，env 文件就在同一目录，可改为 \`source ./tv-box-field-wizard-latest.env\`。

## 备注

${record.env.FIELD_NOTES || '无'}
`
  fs.writeFileSync(outputMarkdownPath, markdown)
}

function runCommand(command, commandArgs, envVars) {
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    env: { ...process.env, ...envVars },
    stdio: 'inherit'
  })
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

async function main() {
  if (args.has('--help') || args.has('-h')) {
    usage()
    return
  }

  if (!process.stdin.isTTY && !assumeDefaults) {
    console.error('非交互环境请加 --defaults，或直接使用 FIELD_* 环境变量运行 tv-box:field-record。')
    process.exit(1)
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const answers = {}
  try {
    if (!assumeDefaults) {
      console.log('HelloTV 电视盒子现场验收向导')
      console.log('结果输入：1通过，2失败，3跳过，4不适用，5未知。')
      console.log('不确定就回车，后面可以重跑补齐。')
      console.log('')
    }

    for (const [key, label, fallback] of textPrompts) {
      answers[key] = await askText(rl, key, label, fallback)
    }
    for (const [key, label] of resultPrompts) {
      answers[key] = await askResult(rl, key, label)
    }
    if (!assumeDefaults) {
      console.log('')
      console.log('手机当电视摄像头属于可选实测项；没测就选不适用或未知，不影响只看电视核心验收。')
    }
    for (const [key, label] of phoneCameraResultPrompts) {
      answers[key] = await askResult(rl, key, label)
    }
    answers.FIELD_NOTES = await askText(rl, 'FIELD_NOTES', '备注，例如 摄像头重插后可识别', '')
    answers.FIELD_APPEND_MATRIX = (await askAppendMatrix(rl)) ? 'true' : 'false'
  } finally {
    rl.close()
  }

  const record = {
    generatedAtUtc: new Date().toISOString(),
    tool: 'tv-box:field-wizard',
    schemaVersion,
    projectRoot: rootDir,
    dryRun,
    appendMatrix: answers.FIELD_APPEND_MATRIX === 'true',
    env: answers
  }

  writeOutputs(record)
  console.log(`现场验收向导记录已生成: ${outputMarkdownPath}`)
  console.log(`可复用环境变量: ${outputEnvPath}`)

  if (shouldRunRecord) {
    runCommand('npm', ['run', '-s', 'tv-box:field-record'], answers)
    runCommand('npm', ['run', '-s', 'tv-box:compatibility-summary'], answers)
    runCommand('npm', ['run', '-s', 'tv-box:easy-summary'], answers)
  } else {
    console.log('dry-run/no-run 模式：没有调用 tv-box:field-record。')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
