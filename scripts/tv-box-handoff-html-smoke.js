#!/usr/bin/env node
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const {
  textPrompts,
  resultPrompts,
  phoneCameraResultPrompts,
  allResultPrompts,
  resultText,
  resultOptions,
  quickPresets,
  schemaVersion
} = require('./tv-box-field-wizard-schema')

const rootDir = path.resolve(__dirname, '..')
const reportDir = process.env.REPORT_DIR || path.join(rootDir, 'reports')
const handoffDir = process.env.HANDOFF_DIR || firstLine(path.join(reportDir, 'tv-box-handoff-latest-path.txt')) || path.join(reportDir, 'tv-box-handoff')
const startHerePath = path.join(handoffDir, 'START_HERE.html')
const operationCardPath = path.join(handoffDir, 'OPERATION_CARD.html')
const hardwareSelectionCardPath = path.join(handoffDir, 'HARDWARE_SELECTION_CARD.html')
const fieldReturnCardPath = path.join(handoffDir, 'FIELD_RETURN_CARD.html')
const fieldWizardPath = path.join(handoffDir, 'FIELD_WIZARD_OFFLINE.html')
const outputJsonPath = process.env.TV_BOX_HANDOFF_HTML_SMOKE_JSON || path.join(reportDir, 'tv-box-handoff-html-smoke-latest.json')
const outputMarkdownPath = process.env.TV_BOX_HANDOFF_HTML_SMOKE_MD || path.join(reportDir, 'tv-box-handoff-html-smoke-latest.md')
const checks = []

function firstLine(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).find(Boolean) || ''
  } catch {
    return ''
  }
}

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    fail(`${label} is missing: ${filePath}`)
  }
}

function note(label, evidence = '') {
  checks.push({
    label,
    status: 'pass',
    evidence
  })
}

function writeReport(status, error = null) {
  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true })
  const report = {
    generatedAtUtc: new Date().toISOString(),
    status,
    handoffDir,
    startHerePath,
    operationCardPath,
    hardwareSelectionCardPath,
    fieldReturnCardPath,
    fieldWizardPath,
    checks,
    error: error ? {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || ''
    } : null
  }
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`)

  const markdown = `# HelloTV 交付网页离线冒烟

- 生成时间 UTC: \`${report.generatedAtUtc}\`
- 状态: \`${report.status}\`
- 交付目录: \`${report.handoffDir}\`
- START_HERE: \`${report.startHerePath}\`
- OPERATION_CARD: \`${report.operationCardPath}\`
- HARDWARE_SELECTION_CARD: \`${report.hardwareSelectionCardPath}\`
- FIELD_RETURN_CARD: \`${report.fieldReturnCardPath}\`
- FIELD_WIZARD_OFFLINE: \`${report.fieldWizardPath}\`

## 检查项

| 项 | 状态 | 证据 |
| --- | --- | --- |
${report.checks.map((item) => `| ${item.label.replace(/\|/g, '/')} | \`${item.status}\` | ${(item.evidence || '').replace(/\|/g, '/')} |`).join('\n')}

${report.error ? `## 错误\n\n\`${report.error.name}: ${report.error.message}\`\n` : ''}
`
  fs.writeFileSync(outputMarkdownPath, markdown)
  return report
}

function localHrefs(html) {
  return [...html.matchAll(/\bhref=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((href) => href && !/^(https?:|mailto:|tel:|#|javascript:)/i.test(href))
}

function checkStartHereLinks() {
  requireFile(startHerePath, 'START_HERE.html')
  const html = fs.readFileSync(startHerePath, 'utf8')
  assert.match(html, /HelloTV 电视盒子安装首页/, 'START_HERE title is missing')
  assert.match(html, /FIELD_WIZARD_OFFLINE\.html/, 'START_HERE does not link the offline field wizard')
  assert.match(html, /INSTALL_ON_WINDOWS\.bat/, 'START_HERE does not link the Windows helper')
  assert.match(html, /INSTALL_ON_MAC\.command/, 'START_HERE does not link the macOS helper')
  assert.match(html, /PACK_FIELD_RETURN_ON_WINDOWS\.bat/, 'START_HERE does not link the Windows return packer')
  assert.match(html, /PACK_FIELD_RETURN_ON_MAC\.command/, 'START_HERE does not link the macOS return packer')
  note('START_HERE 基础入口文案和安装/验收链接存在', 'title, Windows helper, macOS helper, offline wizard')

  const missing = localHrefs(html).filter((href) => !fs.existsSync(path.join(handoffDir, href)))
  assert.deepEqual(missing, [], `START_HERE has broken local links: ${missing.join(', ')}`)
  note('START_HERE 本地链接完整', `${localHrefs(html).length} local hrefs checked`)
}

function checkOperationCardLinks() {
  requireFile(operationCardPath, 'OPERATION_CARD.html')
  const html = fs.readFileSync(operationCardPath, 'utf8')
  assert.match(html, /HelloTV 电视盒子操作卡/, 'operation card title is missing')
  assert.match(html, /打印操作卡/, 'operation card print action is missing')
  assert.match(html, /方向键移动，OK 进入，返回键回上一步/, 'operation card remote basics are missing')
  assert.match(html, /按钮左上角会显示 1-6/, 'operation card numeric badge explanation is missing')
  assert.match(html, /按 0 或菜单\/信息\/帮助键打开帮助\/自检/, 'operation card 0/menu/info/help rescue is missing')
  assert.match(html, /keyCode/, 'operation card remote keyCode feedback is missing')
  assert.match(html, /直播里按数字键 1-9/, 'operation card live numeric channel shortcut is missing')
  assert.match(html, /频道列表里按 7/, 'operation card live favorite shortcut is missing')
  assert.match(html, /找节目/, 'operation card search flow is missing')
  assert.match(html, /继续看/, 'operation card history flow is missing')
  assert.match(html, /维护码/, 'operation card support code explanation is missing')
  assert.match(html, /音频输入/, 'operation card audio input explanation is missing')
  assert.match(html, /tv-box-support-latest\.zip/, 'operation card support bundle handoff is missing')
  assert.doesNotMatch(html, /\b(?:src|href)=["']https?:/i, 'operation card must not depend on remote scripts, styles, or links')
  note('OPERATION_CARD 可打印操作卡文案完整', 'print action, remote keys, camera/audio/support guidance')

  const missing = localHrefs(html).filter((href) => !fs.existsSync(path.join(handoffDir, href)))
  assert.deepEqual(missing, [], `OPERATION_CARD has broken local links: ${missing.join(', ')}`)
  note('OPERATION_CARD 本地链接完整', `${localHrefs(html).length} local hrefs checked`)
}

function checkHardwareSelectionCardLinks() {
  requireFile(hardwareSelectionCardPath, 'HARDWARE_SELECTION_CARD.html')
  const html = fs.readFileSync(hardwareSelectionCardPath, 'utf8')
  assert.match(html, /HelloTV 电视盒子硬件选型卡/, 'hardware selection card title is missing')
  assert.match(html, /打印选型卡/, 'hardware selection card print action is missing')
  assert.match(html, /优先购买/, 'hardware selection card purchase priority section is missing')
  assert.match(html, /Android TV \/ Google TV \/ 明确带 Leanback Launcher/, 'hardware selection card TV-box priority is missing')
  assert.match(html, /USB Host \/ OTG/, 'hardware selection card USB Host guidance is missing')
  assert.match(html, /方向键、OK\/确认、返回键/, 'hardware selection card remote basics are missing')
  assert.match(html, /UVC/, 'hardware selection card UVC camera guidance is missing')
  assert.match(html, /Logitech C920s \/ C920 Pro HD/, 'hardware selection card primary camera model is missing')
  assert.match(html, /tv-box:c920-acceptance/, 'hardware selection card C920 acceptance command is missing')
  assert.match(html, /FIELD_CAMERA_PREVIEW/, 'hardware selection card C920 real-preview guard is missing')
  assert.match(html, /Logitech C270/, 'hardware selection card fallback camera model is missing')
  assert.match(html, /Jabra Speak 510 UC/, 'hardware selection card USB audio model is missing')
  assert.match(html, new RegExp('Speak2 40/55'), 'hardware selection card current-generation USB audio alternative is missing')
  assert.match(html, /带独立供电 USB Hub/, 'hardware selection card powered USB hub guidance is missing')
  assert.match(html, /现场 6 项快测/, 'hardware selection card field quick-test section is missing')
  assert.match(html, /不能留 <code>unknown<\/code>/, 'hardware selection card unknown closure guard is missing')
  assert.match(html, /handoff_ready_needs_box/, 'hardware selection card no-fake-closure state is missing')
  assert.match(html, /tv-box-hardware-profile-latest\.md/, 'hardware selection card hardware profile link is missing')
  assert.match(html, /TV_BOX_AV_TEST_HARDWARE\.zh-CN\.md/, 'hardware selection card AV test hardware plan link is missing')
  assert.match(html, /FIELD_WIZARD_OFFLINE\.html/, 'hardware selection card offline wizard link is missing')
  assert.match(html, /FIELD_ACCEPTANCE_CHECKLIST\.zh-CN\.md/, 'hardware selection card field checklist link is missing')
  assert.match(html, /FIELD_COMPATIBILITY_MATRIX\.zh-CN\.md/, 'hardware selection card compatibility matrix link is missing')
  assert.doesNotMatch(html, /\b(?:src|href)=["']https?:/i, 'hardware selection card must not depend on remote scripts, styles, or links')
  note('HARDWARE_SELECTION_CARD 可打印硬件选型卡文案完整', 'purchase priorities, remote basics, UVC/camera/audio guidance, no-fake-closure guard')

  const missing = localHrefs(html).filter((href) => !fs.existsSync(path.join(handoffDir, href)))
  assert.deepEqual(missing, [], `HARDWARE_SELECTION_CARD has broken local links: ${missing.join(', ')}`)
  note('HARDWARE_SELECTION_CARD 本地链接完整', `${localHrefs(html).length} local hrefs checked`)
}

function checkFieldReturnCardLinks() {
  requireFile(fieldReturnCardPath, 'FIELD_RETURN_CARD.html')
  const html = fs.readFileSync(fieldReturnCardPath, 'utf8')
  assert.match(html, /HelloTV 电视盒子现场回传卡/, 'field return card title is missing')
  assert.match(html, /打印回传卡/, 'field return card print action is missing')
  assert.match(html, /必须发回 4 样/, 'field return card four-item handoff is missing')
  assert.match(html, /FIELD_WIZARD_OFFLINE\.html/, 'field return card does not link the offline field wizard')
  assert.match(html, /维护码照片/, 'field return card support-code photo guidance is missing')
  assert.match(html, /INSTALL_LOG\.txt/, 'field return card install log guidance is missing')
  assert.match(html, /tv-box-support-latest\.zip/, 'field return card support bundle guidance is missing')
  assert.match(html, /keyCode/, 'field return card unknown keyCode photo guidance is missing')
  assert.match(html, /tv-box:return-inbox/, 'field return card return inbox QA command is missing')
  assert.match(html, /PACK_FIELD_RETURN_ON_WINDOWS\.bat/, 'field return card Windows return packer guidance is missing')
  assert.match(html, /PACK_FIELD_RETURN_ON_MAC\.command/, 'field return card macOS return packer guidance is missing')
  assert.match(html, /不要留 unknown/, 'field return card unknown-value closure guard is missing')
  assert.doesNotMatch(html, /\b(?:src|href)=["']https?:/i, 'field return card must not depend on remote scripts, styles, or links')
  note('FIELD_RETURN_CARD 现场回传卡文案完整', 'JSON, support-code photo, install log/support zip, unknown keyCode')

  const missing = localHrefs(html).filter((href) => !fs.existsSync(path.join(handoffDir, href)))
  assert.deepEqual(missing, [], `FIELD_RETURN_CARD has broken local links: ${missing.join(', ')}`)
  note('FIELD_RETURN_CARD 本地链接完整', `${localHrefs(html).length} local hrefs checked`)
}

function extractInlineScript(html) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  assert.ok(match, 'offline field wizard inline script is missing')
  return match[1]
}

function extractSchema(script) {
  const match = script.match(/const SCHEMA = ([\s\S]*?);\n\s*const DRAFT_KEY/)
  assert.ok(match, 'offline field wizard schema block is missing')
  return JSON.parse(match[1])
}

class FakeClassList {
  constructor() {
    this.values = new Set()
  }

  add(...names) {
    names.forEach((name) => this.values.add(name))
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name))
  }

  toggle(name, force) {
    if (force === undefined) {
      if (this.values.has(name)) {
        this.values.delete(name)
        return false
      }
      this.values.add(name)
      return true
    }
    if (force) this.values.add(name)
    else this.values.delete(name)
    return Boolean(force)
  }

  contains(name) {
    return this.values.has(name)
  }

  toString() {
    return [...this.values].join(' ')
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || 'div').toUpperCase()
    this.ownerDocument = ownerDocument
    this.children = []
    this.attributes = {}
    this.dataset = {}
    this.listeners = {}
    this.classList = new FakeClassList()
    this._id = ''
    this.className = ''
    this.textContent = ''
    this.value = ''
    this.checked = false
    this.type = ''
    this.href = ''
    this.download = ''
  }

  get id() {
    return this._id
  }

  set id(value) {
    if (this._id) this.ownerDocument.unregister(this._id, this)
    this._id = String(value || '')
    if (this._id) this.ownerDocument.register(this)
  }

  setAttribute(name, value) {
    const text = String(value)
    this.attributes[name] = text
    if (name === 'id') this.id = text
    if (name === 'class') this.className = text
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      this.dataset[key] = text
    }
  }

  getAttribute(name) {
    return this.attributes[name]
  }

  appendChild(child) {
    this.children.push(child)
    child.parentNode = this
    this.ownerDocument.registerTree(child)
    return child
  }

  remove() {
    if (!this.parentNode) return
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this)
    this.parentNode = null
  }

  addEventListener(type, listener) {
    this.listeners[type] = this.listeners[type] || []
    this.listeners[type].push(listener)
  }

  dispatch(type, extra = {}) {
    const event = {
      target: this,
      preventDefault() {},
      ...extra
    }
    ;(this.listeners[type] || []).forEach((listener) => listener(event))
  }

  click() {
    if (this.tagName === 'A' && this.download) {
      this.ownerDocument.downloads.push({ filename: this.download, href: this.href })
    }
    this.dispatch('click')
  }

  select() {}
}

class FakeDocument {
  constructor() {
    this.elements = new Map()
    this.downloads = []
    this.body = new FakeElement('body', this)
    this.listeners = {}
  }

  register(element) {
    if (element.id) this.elements.set(element.id, element)
  }

  unregister(id, element) {
    if (this.elements.get(id) === element) this.elements.delete(id)
  }

  registerTree(element) {
    this.register(element)
    element.children.forEach((child) => this.registerTree(child))
  }

  createElement(tagName) {
    return new FakeElement(tagName, this)
  }

  getElementById(id) {
    return this.elements.get(id) || null
  }

  addEventListener(type, listener) {
    this.listeners[type] = this.listeners[type] || []
    this.listeners[type].push(listener)
  }

  execCommand(command) {
    return command === 'copy'
  }

  addStaticElement(id, tagName = 'div') {
    const element = this.createElement(tagName)
    element.id = id
    this.body.appendChild(element)
    return element
  }
}

class FakeBlob {
  constructor(parts, options = {}) {
    this.parts = parts
    this.type = options.type || ''
  }
}

class FakeFileReader {
  readAsText() {
    throw new Error('FileReader should not be used during HTML smoke test')
  }
}

function makeFakeBrowser() {
  const document = new FakeDocument()
  const staticElements = {
    textFields: 'div',
    presetButtons: 'div',
    resultFields: 'div',
    FIELD_NOTES: 'textarea',
    FIELD_APPEND_MATRIX: 'input',
    verdict: 'div',
    summary: 'pre',
    generateButton: 'button',
    downloadJsonButton: 'button',
    downloadMarkdownButton: 'button',
    downloadEnvButton: 'button',
    copyButton: 'button',
    printButton: 'button',
    importJson: 'input',
    clearButton: 'button'
  }
  Object.entries(staticElements).forEach(([id, tagName]) => document.addStaticElement(id, tagName))

  const localStorage = new Map()
  const window = {
    localStorage: {
      getItem: (key) => localStorage.get(key) || null,
      setItem: (key, value) => localStorage.set(key, String(value)),
      removeItem: (key) => localStorage.delete(key)
    },
    setTimeout: (listener) => {
      if (typeof listener === 'function') listener()
    },
    alert: () => {},
    confirm: () => true,
    print: () => {}
  }
  const URL = {
    createObjectURL: () => `blob:hellotv-${document.downloads.length + 1}`,
    revokeObjectURL: () => {}
  }
  return {
    document,
    window,
    context: vm.createContext({
      window,
      document,
      Blob: FakeBlob,
      URL,
      FileReader: FakeFileReader,
      navigator: {
        clipboard: {
          writeText: () => Promise.resolve()
        }
      },
      console
    })
  }
}

function checkOfflineFieldWizard() {
  requireFile(fieldWizardPath, 'FIELD_WIZARD_OFFLINE.html')
  const html = fs.readFileSync(fieldWizardPath, 'utf8')
  assert.match(html, /HelloTV 电视盒子离线现场验收表/, 'offline field wizard title is missing')
  assert.doesNotMatch(html, /\b(?:src|href)=["']https?:/i, 'offline field wizard must not depend on remote scripts or styles')
  assert.match(html, /下载 JSON/, 'offline field wizard JSON download action is missing')
  assert.match(html, /下载 Markdown/, 'offline field wizard Markdown download action is missing')
  assert.match(html, /下载 env/, 'offline field wizard env download action is missing')
  assert.match(html, /快速填表模板|已经现场确认过时/, 'offline field wizard preset helpers are missing')
  note('离线现场验收表基础入口完整', 'title, presets, JSON/Markdown/env download actions')

  const script = extractInlineScript(html)
  const embeddedSchema = extractSchema(script)
  assert.deepEqual(embeddedSchema, {
    textPrompts,
    resultPrompts,
    phoneCameraResultPrompts,
    allResultPrompts,
    resultText,
    resultOptions,
    quickPresets,
    schemaVersion
  }, 'offline field wizard embedded schema drifted from source schema')
  note('离线现场验收表内嵌 schema 与源码一致', `schemaVersion=${schemaVersion}`)

  new vm.Script(script, { filename: 'FIELD_WIZARD_OFFLINE.html.inline.js' })
  note('离线现场验收表内联脚本语法可解析')

  const browser = makeFakeBrowser()
  new vm.Script(script, { filename: 'FIELD_WIZARD_OFFLINE.html.inline.js' }).runInContext(browser.context)
  const { document } = browser

  for (const [key] of textPrompts) {
    assert.ok(document.getElementById(key), `offline field wizard did not render text field: ${key}`)
  }
  for (const [key] of allResultPrompts) {
    for (const [value] of resultOptions) {
      assert.ok(document.getElementById(`${key}__${value}`), `offline field wizard did not render result button: ${key}/${value}`)
    }
  }
  for (const preset of quickPresets) {
    assert.ok(document.getElementById(`preset__${preset.key}`), `offline field wizard did not render preset button: ${preset.key}`)
  }
  note('离线现场验收表动态渲染字段、模板和按钮', `${textPrompts.length} text fields, ${quickPresets.length} presets, ${allResultPrompts.length * resultOptions.length} result buttons`)

  document.getElementById('preset__tv_core_pass').click()
  document.getElementById('generateButton').click()
  assert.match(document.getElementById('verdict').textContent, /tv_core_ready|recommended/, 'offline field wizard TV-core preset did not produce a core-ready verdict')
  assert.match(document.getElementById('summary').textContent, /套用模板：tv_core_pass/, 'offline field wizard summary did not include preset key')
  note('离线现场验收表一键模板可生成核心可用结论', document.getElementById('verdict').textContent)

  document.getElementById('FIELD_BOX_BRAND').value = 'SmokeBox'
  document.getElementById('FIELD_BOX_MODEL').value = 'Offline HTML'
  document.getElementById('FIELD_ANDROID_SDK').value = '31'
  document.getElementById('FIELD_APPEND_MATRIX').checked = true
  for (const [key] of allResultPrompts) {
    document.getElementById(`${key}__pass`).click()
  }
  document.getElementById('generateButton').click()
  assert.match(document.getElementById('verdict').textContent, /recommended/, 'offline field wizard did not produce a recommended verdict for all-pass input')
  assert.match(document.getElementById('summary').textContent, /HelloTV 电视盒子离线验收摘要/, 'offline field wizard summary was not generated')
  note('离线现场验收表可生成全通过推荐结论', document.getElementById('verdict').textContent)

  document.getElementById('downloadJsonButton').click()
  document.getElementById('downloadMarkdownButton').click()
  document.getElementById('downloadEnvButton').click()
  assert.deepEqual(
    document.downloads.map((download) => path.extname(download.filename)).sort(),
    ['.env', '.json', '.md'],
    'offline field wizard did not create JSON/Markdown/env downloads'
  )
  note('离线现场验收表可触发 JSON/Markdown/env 下载', document.downloads.map((download) => download.filename).join(', '))
}

try {
  checkStartHereLinks()
  checkOperationCardLinks()
  checkHardwareSelectionCardLinks()
  checkFieldReturnCardLinks()
  checkOfflineFieldWizard()
  const report = writeReport('pass')
  console.log('TV-box handoff HTML smoke test passed.')
  console.log(`Machine-readable HTML smoke report: ${outputJsonPath}`)
  console.log(`HTML smoke report: ${outputMarkdownPath}`)
  if (report.status !== 'pass') process.exit(1)
} catch (error) {
  writeReport('fail', error)
  throw error
}
