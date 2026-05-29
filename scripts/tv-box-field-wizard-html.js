#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
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
const outputHtmlPath = process.env.TV_BOX_FIELD_WIZARD_HTML || path.join(reportDir, 'tv-box-field-wizard-offline.html')

function safeScriptJson(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

function buildHtml() {
  const schemaJson = safeScriptJson({
    textPrompts,
    resultPrompts,
    phoneCameraResultPrompts,
    allResultPrompts,
    resultText,
    resultOptions,
    quickPresets,
    schemaVersion
  })

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HelloTV 电视盒子离线现场验收表</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --ink: #172033;
      --muted: #5d6b82;
      --line: #d8dfeb;
      --panel: #ffffff;
      --primary: #1457d9;
      --primary-ink: #ffffff;
      --pass: #0f7b45;
      --fail: #b42318;
      --skip: #7a5300;
      --na: #43536b;
      --unknown: #4b5565;
      --soft: #eef3fa;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
      font-size: 18px;
      line-height: 1.55;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px 20px 56px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 34px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 24px;
      letter-spacing: 0;
    }
    h3 {
      margin: 0 0 8px;
      font-size: 20px;
      letter-spacing: 0;
    }
    p {
      margin: 8px 0;
    }
    .lead {
      color: var(--muted);
      font-size: 20px;
      margin-bottom: 20px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 20px;
      margin: 16px 0;
      box-shadow: 0 1px 2px rgba(20, 35, 58, 0.05);
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 12px;
      margin: 14px 0 0;
    }
    .step {
      background: var(--soft);
      border: 1px solid #d4deeb;
      border-radius: 8px;
      padding: 14px;
      min-height: 118px;
    }
    .preset-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .preset-button {
      min-height: 88px;
      padding: 14px;
      text-align: left;
      background: #ffffff;
    }
    .preset-button strong {
      display: block;
      margin-bottom: 4px;
      font-size: 18px;
    }
    .preset-button span {
      display: block;
      color: var(--muted);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    label {
      display: block;
      font-weight: 700;
      margin-bottom: 6px;
    }
    input[type="text"], textarea {
      width: 100%;
      border: 1px solid #bfccdc;
      border-radius: 6px;
      padding: 12px;
      color: var(--ink);
      font: inherit;
      background: #ffffff;
    }
    textarea {
      min-height: 108px;
      resize: vertical;
    }
    .hint {
      display: block;
      color: var(--muted);
      font-size: 15px;
      font-weight: 500;
      margin-top: 4px;
    }
    .result-row {
      border-top: 1px solid var(--line);
      padding: 16px 0;
    }
    .result-row:first-child {
      border-top: 0;
      padding-top: 0;
    }
    .result-buttons {
      display: grid;
      grid-template-columns: repeat(5, minmax(100px, 1fr));
      gap: 8px;
      margin-top: 8px;
    }
    button, .file-button {
      appearance: none;
      border: 1px solid #b7c4d8;
      border-radius: 6px;
      padding: 12px 14px;
      background: #ffffff;
      color: var(--ink);
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      text-align: center;
      min-height: 48px;
    }
    button:hover, .file-button:hover {
      border-color: var(--primary);
    }
    button.primary {
      background: var(--primary);
      border-color: var(--primary);
      color: var(--primary-ink);
    }
    button.secondary {
      background: #24415f;
      border-color: #24415f;
      color: #ffffff;
    }
    button.danger {
      background: #ffffff;
      border-color: #d92d20;
      color: #b42318;
    }
    button.selected {
      border-width: 2px;
      color: #ffffff;
      padding: 11px 13px;
    }
    button.selected[data-value="pass"] {
      background: var(--pass);
      border-color: var(--pass);
    }
    button.selected[data-value="fail"] {
      background: var(--fail);
      border-color: var(--fail);
    }
    button.selected[data-value="skip"] {
      background: var(--skip);
      border-color: var(--skip);
    }
    button.selected[data-value="na"] {
      background: var(--na);
      border-color: var(--na);
    }
    button.selected[data-value="unknown"] {
      background: var(--unknown);
      border-color: var(--unknown);
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .checkbox-line {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 12px 0;
      font-weight: 700;
    }
    .checkbox-line input {
      width: 22px;
      height: 22px;
    }
    .summary {
      white-space: pre-wrap;
      background: #111827;
      color: #f8fafc;
      border-radius: 8px;
      padding: 16px;
      overflow: auto;
      font-size: 16px;
    }
    .status {
      border-left: 5px solid var(--primary);
      background: #eef4ff;
      padding: 12px 14px;
      border-radius: 6px;
      margin: 12px 0;
      color: #17315f;
      font-weight: 700;
    }
    .status.fail {
      border-color: var(--fail);
      background: #fff1f0;
      color: #912018;
    }
    .status.pass {
      border-color: var(--pass);
      background: #ecfdf3;
      color: #05603a;
    }
    .small {
      color: var(--muted);
      font-size: 15px;
    }
    .hidden-input {
      display: none;
    }
    @media (max-width: 760px) {
      body {
        font-size: 17px;
      }
      main {
        padding: 20px 12px 40px;
      }
      h1 {
        font-size: 28px;
      }
      .result-buttons {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .toolbar button, .file-button {
        width: 100%;
      }
    }
    @media print {
      body {
        background: #ffffff;
      }
      .toolbar, .file-button, #importJson {
        display: none !important;
      }
      .panel {
        box-shadow: none;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>HelloTV 电视盒子离线现场验收表</h1>
    <p class="lead">不用联网、不用 npm。现场人员填完后下载 JSON、Markdown 或 env 文件，发给工程人员即可沉淀兼容性矩阵。</p>

    <section class="panel">
      <h2>现场三步</h2>
      <div class="steps">
        <div class="step">
          <h3>1. 填盒子信息</h3>
          <p>能填多少填多少，不知道就留空；摄像头和麦克风没有也可以写 none。</p>
        </div>
        <div class="step">
          <h3>2. 点验收结果</h3>
          <p>通过、失败、跳过、不适用、未知五选一；不要猜，不确定就选未知。</p>
        </div>
        <div class="step">
          <h3>3. 下载并发送</h3>
          <p>下载 JSON 或 Markdown，连同电视屏幕照片、INSTALL_LOG.txt 一起发给维护人员。</p>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>盒子、遥控器、摄像头、麦克风</h2>
      <div id="textFields" class="grid"></div>
    </section>

    <section class="panel">
      <h2>验收结果</h2>
      <p class="small">已经现场确认过时，可先点一个模板，再只修改少数不符合的项目。</p>
      <div id="presetButtons" class="preset-grid"></div>
      <div id="resultFields"></div>
      <label for="FIELD_NOTES">备注</label>
      <textarea id="FIELD_NOTES" placeholder="例如：摄像头重插后可识别；没有数字键；麦克风是遥控器内置麦。"></textarea>
      <label class="checkbox-line">
        <input id="FIELD_APPEND_MATRIX" type="checkbox">
        这是已测过真实盒子的有效样本，允许工程人员追加累计兼容性矩阵
      </label>
      <p class="small">未勾选时也会生成记录，但工程人员默认只作为 latest 参考，不污染累计 CSV。</p>
    </section>

    <section class="panel">
      <h2>生成记录</h2>
      <div class="toolbar">
        <button class="primary" id="generateButton" type="button">生成记录</button>
        <button id="downloadJsonButton" type="button">下载 JSON</button>
        <button id="downloadMarkdownButton" type="button">下载 Markdown</button>
        <button id="downloadEnvButton" type="button">下载 env</button>
        <button id="copyButton" type="button">复制摘要</button>
        <button class="secondary" id="printButton" type="button">打印/存 PDF</button>
        <label class="file-button" for="importJson">导入旧 JSON</label>
        <input class="hidden-input" id="importJson" type="file" accept=".json,application/json">
        <button class="danger" id="clearButton" type="button">清空草稿</button>
      </div>
      <div id="verdict" class="status">还未生成记录。</div>
      <pre id="summary" class="summary">点击“生成记录”后，这里会显示可复制给维护人员的摘要。</pre>
      <p class="small">工程人员拿到 env 后可在源码工程执行：<br>source ./tv-box-field-wizard-latest.env<br>npm run tv-box:field-record<br>npm run tv-box:compatibility-summary</p>
    </section>
  </main>

  <script>
    'use strict';
    const SCHEMA = ${schemaJson};
    const DRAFT_KEY = 'hellotv-tv-box-field-wizard-offline-draft-v1';
    const state = {
      record: null,
      results: {},
      lastPreset: ''
    };

    function byId(id) {
      return document.getElementById(id);
    }

    function makeSafeId(key, value) {
      return key + '__' + value;
    }

    function setText(id, text) {
      byId(id).textContent = text;
    }

    function nowLocalText() {
      const now = new Date();
      return now.getFullYear()
        + '-' + String(now.getMonth() + 1).padStart(2, '0')
        + '-' + String(now.getDate()).padStart(2, '0')
        + ' ' + String(now.getHours()).padStart(2, '0')
        + ':' + String(now.getMinutes()).padStart(2, '0');
    }

    function fileStamp() {
      const now = new Date();
      return now.getFullYear()
        + String(now.getMonth() + 1).padStart(2, '0')
        + String(now.getDate()).padStart(2, '0')
        + '-'
        + String(now.getHours()).padStart(2, '0')
        + String(now.getMinutes()).padStart(2, '0')
        + String(now.getSeconds()).padStart(2, '0');
    }

    function resultLabel(value) {
      return SCHEMA.resultText[value] || value || '未知';
    }

    function escapeMarkdownCell(value) {
      return String(value || '').replace(/\\|/g, '/').replace(/\\r?\\n/g, ' ');
    }

    function shellQuote(value) {
      return "'" + String(value || '').replace(/'/g, "'\\\\''") + "'";
    }

    function normalizeResult(value) {
      const normalized = String(value || '').trim().toLowerCase();
      return SCHEMA.resultText[normalized] ? normalized : 'unknown';
    }

    function setResult(key, value) {
      state.results[key] = normalizeResult(value);
      SCHEMA.resultOptions.forEach(function(option) {
        const button = byId(makeSafeId(key, option[0]));
        if (!button) return;
        button.classList.toggle('selected', option[0] === state.results[key]);
        button.setAttribute('aria-pressed', option[0] === state.results[key] ? 'true' : 'false');
      });
      saveDraft();
    }

    function appendNote(text) {
      const notes = byId('FIELD_NOTES');
      const current = notes.value.trim();
      if (current.indexOf(text) >= 0) return;
      notes.value = current ? current + '\\n' + text : text;
    }

    function defaultTextValue(key) {
      const prompt = SCHEMA.textPrompts.find(function(item) {
        return item[0] === key;
      });
      return prompt ? prompt[2] || '' : '';
    }

    function setTextFieldValue(key, value, overwrite) {
      const input = byId(key);
      if (!input) return;
      const current = input.value.trim();
      if (!overwrite && current && current !== defaultTextValue(key)) return;
      input.value = value;
    }

    function applyPreset(presetKey) {
      const preset = SCHEMA.quickPresets.find(function(item) {
        return item.key === presetKey;
      });
      if (!preset) return;

      Object.keys(preset.textDefaults || {}).forEach(function(key) {
        setTextFieldValue(key, preset.textDefaults[key], false);
      });
      Object.keys(preset.results || {}).forEach(function(key) {
        setResult(key, preset.results[key]);
      });
      state.lastPreset = preset.key;
      appendNote('已套用模板：' + preset.title + '。请只在现场真实测过后使用，并把不符合的项目改成失败/未知。');
      refreshOutput(buildRecord());
    }

    function renderPresetButtons() {
      const container = byId('presetButtons');
      container.innerHTML = '';
      SCHEMA.quickPresets.forEach(function(preset) {
        const button = document.createElement('button');
        button.id = 'preset__' + preset.key;
        button.type = 'button';
        button.className = 'preset-button';
        const title = document.createElement('strong');
        title.textContent = preset.title;
        const description = document.createElement('span');
        description.textContent = preset.description;
        button.appendChild(title);
        button.appendChild(description);
        button.addEventListener('click', function() {
          applyPreset(preset.key);
        });
        container.appendChild(button);
      });
    }

    function renderTextFields() {
      const container = byId('textFields');
      container.innerHTML = '';
      SCHEMA.textPrompts.forEach(function(item) {
        const key = item[0];
        const label = item[1];
        const fallback = item[2] || '';
        const wrapper = document.createElement('div');
        const labelNode = document.createElement('label');
        labelNode.setAttribute('for', key);
        labelNode.textContent = label;
        const input = document.createElement('input');
        input.id = key;
        input.type = 'text';
        input.value = fallback;
        input.autocomplete = 'off';
        input.addEventListener('input', saveDraft);
        const hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = fallback ? '默认值：' + fallback : '不知道可以留空';
        wrapper.appendChild(labelNode);
        wrapper.appendChild(input);
        wrapper.appendChild(hint);
        container.appendChild(wrapper);
      });
    }

    function renderResultFields() {
      const container = byId('resultFields');
      container.innerHTML = '';
      SCHEMA.allResultPrompts.forEach(function(item) {
        const key = item[0];
        const label = item[1];
        state.results[key] = state.results[key] || 'unknown';
        const row = document.createElement('div');
        row.className = 'result-row';
        const title = document.createElement('label');
        title.textContent = label;
        const buttons = document.createElement('div');
        buttons.className = 'result-buttons';
        SCHEMA.resultOptions.forEach(function(option) {
          const value = option[0];
          const text = option[1];
          const button = document.createElement('button');
          button.id = makeSafeId(key, value);
          button.type = 'button';
          button.dataset.value = value;
          button.textContent = text;
          button.setAttribute('aria-pressed', 'false');
          button.addEventListener('click', function() {
            setResult(key, value);
          });
          buttons.appendChild(button);
        });
        row.appendChild(title);
        row.appendChild(buttons);
        container.appendChild(row);
        setResult(key, state.results[key]);
      });
    }

    function collectEnv() {
      const env = {};
      SCHEMA.textPrompts.forEach(function(item) {
        const key = item[0];
        env[key] = byId(key).value.trim();
      });
      SCHEMA.allResultPrompts.forEach(function(item) {
        const key = item[0];
        env[key] = normalizeResult(state.results[key]);
      });
      env.FIELD_NOTES = byId('FIELD_NOTES').value.trim();
      env.FIELD_APPEND_MATRIX = byId('FIELD_APPEND_MATRIX').checked ? 'true' : 'false';
      return env;
    }

    function classifyRecord(env) {
      const failures = [];
      const unknowns = [];
      SCHEMA.resultPrompts.forEach(function(item) {
        const key = item[0];
        const value = normalizeResult(env[key]);
        if (value === 'fail') failures.push(item[1]);
        if (value === 'unknown') unknowns.push(item[1]);
      });
      SCHEMA.phoneCameraResultPrompts.forEach(function(item) {
        const key = item[0];
        const value = normalizeResult(env[key]);
        if (value === 'fail') failures.push(item[1]);
      });
      const corePass = env.FIELD_REMOTE_FOCUS === 'pass'
        && env.FIELD_LIVE_PLAYBACK === 'pass'
        && env.FIELD_SUPPORT_CODE === 'pass';
      const helpPass = env.FIELD_ZERO_KEY_HELP === 'pass'
        || env.FIELD_HELP_KEY_SHORTCUTS === 'pass'
        || env.FIELD_NUMERIC_SHORTCUTS === 'pass';
      const practicePass = env.FIELD_REMOTE_PRACTICE === 'pass';
      const exitPass = env.FIELD_EXIT_CONFIRM === 'pass';
      const cameraPass = env.FIELD_CAMERA_PERMISSION === 'pass'
        && env.FIELD_CAMERA_PREVIEW === 'pass';
      const audioUsable = env.FIELD_AUDIO_INPUT === 'pass'
        || env.FIELD_AUDIO_INPUT === 'skip'
        || env.FIELD_AUDIO_INPUT === 'na';

      if (failures.length > 0) {
        return {
          level: 'needs_fix',
          text: '有失败项，先不要标记交付完成。',
          failures: failures,
          unknowns: unknowns
        };
      }
      if (corePass && helpPass && practicePass && exitPass && cameraPass && audioUsable) {
        return {
          level: 'recommended',
          text: '核心遥控器、直播、帮助/自检、退出确认、摄像头与音频字段已形成推荐样本。',
          failures: failures,
          unknowns: unknowns
        };
      }
      if (corePass && helpPass && practicePass && exitPass) {
        return {
          level: 'tv_core_ready',
          text: '看电视核心链路和防误退出可用，摄像头/麦克风还需要继续补测或确认。',
          failures: failures,
          unknowns: unknowns
        };
      }
      return {
        level: unknowns.length > 0 ? 'needs_manual_acceptance' : 'watch',
        text: '还需要补充现场验收，尤其是遥控器、直播和维护码。',
        failures: failures,
        unknowns: unknowns
      };
    }

    function buildRecord() {
      const env = collectEnv();
      const verdict = classifyRecord(env);
      return {
        generatedAtUtc: new Date().toISOString(),
        generatedAtLocal: nowLocalText(),
        tool: 'FIELD_WIZARD_OFFLINE.html',
        schemaVersion: SCHEMA.schemaVersion,
        appliedPreset: state.lastPreset,
        appendMatrix: env.FIELD_APPEND_MATRIX === 'true',
        verdict: verdict,
        env: env
      };
    }

    function buildMarkdown(record) {
      const env = record.env;
      const lines = [];
      lines.push('# HelloTV 电视盒子离线现场验收记录');
      lines.push('');
      lines.push('- 生成时间 UTC: \`' + record.generatedAtUtc + '\`');
      lines.push('- 本地时间: \`' + record.generatedAtLocal + '\`');
      lines.push('- 工具: \`' + record.tool + '\`');
      lines.push('- 套用模板: \`' + (record.appliedPreset || 'none') + '\`');
      lines.push('- 是否允许追加累计矩阵: \`' + record.appendMatrix + '\`');
      lines.push('- 预判结论: \`' + record.verdict.level + '\` - ' + record.verdict.text);
      lines.push('');
      lines.push('## 现场信息');
      lines.push('');
      lines.push('| 项目 | 值 |');
      lines.push('| --- | --- |');
      SCHEMA.textPrompts.forEach(function(item) {
        lines.push('| ' + item[1] + ' | ' + (escapeMarkdownCell(env[item[0]]) || '未填写') + ' |');
      });
      lines.push('');
      lines.push('## 验收结果');
      lines.push('');
      lines.push('| 项目 | 结果 |');
      lines.push('| --- | --- |');
      SCHEMA.allResultPrompts.forEach(function(item) {
        lines.push('| ' + item[1] + ' | ' + resultLabel(env[item[0]]) + ' |');
      });
      lines.push('');
      lines.push('## 备注');
      lines.push('');
      lines.push(env.FIELD_NOTES || '无');
      lines.push('');
      lines.push('## 工程人员导入');
      lines.push('');
      lines.push('\`\`\`bash');
      lines.push('source ./tv-box-field-wizard-latest.env');
      lines.push('npm run tv-box:field-record');
      lines.push('npm run tv-box:compatibility-summary');
      lines.push('\`\`\`');
      lines.push('');
      if (record.verdict.failures.length > 0) {
        lines.push('## 失败项');
        lines.push('');
        record.verdict.failures.forEach(function(label) {
          lines.push('- ' + label);
        });
        lines.push('');
      }
      if (record.verdict.unknowns.length > 0) {
        lines.push('## 待补测');
        lines.push('');
        record.verdict.unknowns.forEach(function(label) {
          lines.push('- ' + label);
        });
        lines.push('');
      }
      return lines.join('\\n');
    }

    function buildEnv(record) {
      return Object.keys(record.env)
        .map(function(key) {
          return 'export ' + key + '=' + shellQuote(record.env[key]);
        })
        .join('\\n') + '\\n';
    }

    function buildSummary(record) {
      const env = record.env;
      const lines = [];
      lines.push('HelloTV 电视盒子离线验收摘要');
      lines.push('时间：' + record.generatedAtLocal);
      lines.push('盒子：' + [env.FIELD_BOX_BRAND, env.FIELD_BOX_MODEL, env.FIELD_ANDROID_SDK ? 'SDK' + env.FIELD_ANDROID_SDK : ''].filter(Boolean).join(' / '));
      lines.push('遥控器：' + (env.FIELD_REMOTE_MODEL || '未填写'));
      lines.push('摄像头：' + (env.FIELD_CAMERA_MODEL || '无/未填写') + ' / ' + (env.FIELD_CAMERA_CONNECTION || 'unknown'));
      lines.push('麦克风：' + (env.FIELD_MICROPHONE_MODEL || '无/未填写') + ' / ' + (env.FIELD_MICROPHONE_CONNECTION || 'unknown'));
      lines.push('结论：' + record.verdict.level + '，' + record.verdict.text);
      lines.push('套用模板：' + (record.appliedPreset || 'none'));
      lines.push('允许追加矩阵：' + env.FIELD_APPEND_MATRIX);
      lines.push('失败项：' + (record.verdict.failures.join('、') || '无'));
      lines.push('待补测：' + (record.verdict.unknowns.join('、') || '无'));
      lines.push('备注：' + (env.FIELD_NOTES || '无'));
      return lines.join('\\n');
    }

    function refreshOutput(record) {
      state.record = record;
      const summary = buildSummary(record);
      setText('summary', summary);
      const verdict = byId('verdict');
      verdict.textContent = record.verdict.level + '：' + record.verdict.text;
      verdict.className = 'status';
      if (record.verdict.level === 'recommended' || record.verdict.level === 'tv_core_ready') {
        verdict.classList.add('pass');
      }
      if (record.verdict.level === 'needs_fix') {
        verdict.classList.add('fail');
      }
      saveDraft();
    }

    function downloadText(filename, text, type) {
      const blob = new Blob([text], { type: type + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function() {
        URL.revokeObjectURL(url);
      }, 1000);
    }

    function ensureRecord() {
      if (!state.record) {
        refreshOutput(buildRecord());
      }
      return state.record;
    }

    function saveDraft() {
      try {
        const draft = {
          env: collectEnv(),
          results: state.results,
          lastPreset: state.lastPreset,
          record: state.record
        };
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch (error) {
        // File URLs or strict browsers may deny localStorage; the form still works.
      }
    }

    function loadDraft() {
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (!draft || !draft.env) return;
        SCHEMA.textPrompts.forEach(function(item) {
          const key = item[0];
          if (draft.env[key] !== undefined) byId(key).value = draft.env[key];
        });
        if (draft.env.FIELD_NOTES !== undefined) byId('FIELD_NOTES').value = draft.env.FIELD_NOTES;
        byId('FIELD_APPEND_MATRIX').checked = draft.env.FIELD_APPEND_MATRIX === 'true';
        Object.keys(draft.results || {}).forEach(function(key) {
          state.results[key] = normalizeResult(draft.results[key]);
          setResult(key, state.results[key]);
        });
        state.lastPreset = draft.lastPreset || draft.record && draft.record.appliedPreset || '';
        if (draft.record) refreshOutput(draft.record);
      } catch (error) {
        // Bad draft data should not block field acceptance.
      }
    }

    function clearDraft() {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch (error) {}
      SCHEMA.textPrompts.forEach(function(item) {
        byId(item[0]).value = item[2] || '';
      });
      SCHEMA.allResultPrompts.forEach(function(item) {
        setResult(item[0], 'unknown');
      });
      byId('FIELD_NOTES').value = '';
      byId('FIELD_APPEND_MATRIX').checked = false;
      state.record = null;
      state.lastPreset = '';
      setText('verdict', '还未生成记录。');
      byId('verdict').className = 'status';
      setText('summary', '点击“生成记录”后，这里会显示可复制给维护人员的摘要。');
      saveDraft();
    }

    function importRecord(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function() {
        try {
          const record = JSON.parse(String(reader.result || '{}'));
          const env = record.env || {};
          SCHEMA.textPrompts.forEach(function(item) {
            const key = item[0];
            if (env[key] !== undefined) byId(key).value = env[key];
          });
          SCHEMA.allResultPrompts.forEach(function(item) {
            const key = item[0];
            setResult(key, env[key] || 'unknown');
          });
          byId('FIELD_NOTES').value = env.FIELD_NOTES || '';
          byId('FIELD_APPEND_MATRIX').checked = env.FIELD_APPEND_MATRIX === 'true' || record.appendMatrix === true;
          state.lastPreset = record.appliedPreset || '';
          refreshOutput(buildRecord());
        } catch (error) {
          window.alert('JSON 读取失败，请确认文件是本表导出的记录。');
        }
      };
      reader.readAsText(file, 'utf-8');
    }

    function copySummary() {
      const text = byId('summary').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          window.alert('摘要已复制。');
        }).catch(function() {
          fallbackCopy(text);
        });
        return;
      }
      fallbackCopy(text);
    }

    function fallbackCopy(text) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      window.alert('摘要已复制。');
    }

    function bindActions() {
      byId('generateButton').addEventListener('click', function() {
        refreshOutput(buildRecord());
      });
      byId('downloadJsonButton').addEventListener('click', function() {
        const record = ensureRecord();
        downloadText('tv-box-field-wizard-offline-' + fileStamp() + '.json', JSON.stringify(record, null, 2) + '\\n', 'application/json');
      });
      byId('downloadMarkdownButton').addEventListener('click', function() {
        const record = ensureRecord();
        downloadText('tv-box-field-wizard-offline-' + fileStamp() + '.md', buildMarkdown(record) + '\\n', 'text/markdown');
      });
      byId('downloadEnvButton').addEventListener('click', function() {
        const record = ensureRecord();
        downloadText('tv-box-field-wizard-latest.env', buildEnv(record), 'text/plain');
      });
      byId('copyButton').addEventListener('click', copySummary);
      byId('printButton').addEventListener('click', function() {
        ensureRecord();
        window.print();
      });
      byId('clearButton').addEventListener('click', function() {
        if (window.confirm('确认清空本机草稿？')) clearDraft();
      });
      byId('importJson').addEventListener('change', function(event) {
        importRecord(event.target.files && event.target.files[0]);
        event.target.value = '';
      });
      byId('FIELD_NOTES').addEventListener('input', saveDraft);
      byId('FIELD_APPEND_MATRIX').addEventListener('change', saveDraft);
      document.addEventListener('keydown', function(event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          refreshOutput(buildRecord());
        }
      });
    }

    renderTextFields();
    renderPresetButtons();
    renderResultFields();
    bindActions();
    loadDraft();
  </script>
</body>
</html>
`
}

fs.mkdirSync(path.dirname(outputHtmlPath), { recursive: true })
fs.writeFileSync(outputHtmlPath, buildHtml())
console.log(`Offline field wizard HTML written to: ${outputHtmlPath}`)
