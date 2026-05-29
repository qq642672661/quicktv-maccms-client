#!/usr/bin/env zx
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const androidDir = path.join(rootDir, 'android')
const buildType = process.argv.slice(2).join('') || 'Debug'
const gradleCommand = process.platform.startsWith('win') ? 'gradlew.bat' : './gradlew'
const gradleArgs = ['clean', `assemble${buildType}`]

function hasJavaHome(javaHome) {
  return Boolean(javaHome && fs.existsSync(path.join(javaHome, 'bin', process.platform.startsWith('win') ? 'java.exe' : 'java')))
}

function firstExistingDir(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate))
}

function resolveJavaHome() {
  if (hasJavaHome(process.env.JAVA_HOME)) return process.env.JAVA_HOME

  return firstExistingDir([
    '/opt/homebrew/opt/openjdk@11/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@11/libexec/openjdk.jdk/Contents/Home',
    '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'
  ])
}

function resolveAndroidHome() {
  if (process.env.ANDROID_HOME && fs.existsSync(process.env.ANDROID_HOME)) return process.env.ANDROID_HOME
  if (process.env.ANDROID_SDK_ROOT && fs.existsSync(process.env.ANDROID_SDK_ROOT)) return process.env.ANDROID_SDK_ROOT

  return firstExistingDir([
    '/opt/homebrew/share/android-commandlinetools',
    '/usr/local/share/android-commandlinetools',
    path.join(process.env.HOME || '', 'Library/Android/sdk')
  ])
}

function prependPath(paths, currentPath) {
  const validPaths = paths.filter((candidate) => candidate && fs.existsSync(candidate))
  return [...validPaths, currentPath || ''].join(path.delimiter)
}

function buildEnv() {
  const javaHome = resolveJavaHome()
  const androidHome = resolveAndroidHome()

  if (!javaHome) {
    console.error('ERROR: JDK was not found. On macOS: brew install openjdk@11')
    process.exit(1)
  }

  if (!androidHome) {
    console.error('ERROR: Android SDK was not found. On macOS: brew install android-commandlinetools android-platform-tools')
    process.exit(1)
  }

  return {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
    PATH: prependPath([
      path.join(javaHome, 'bin'),
      path.join(androidHome, 'platform-tools'),
      path.join(androidHome, 'cmdline-tools/latest/bin')
    ], process.env.PATH)
  }
}

function build() {
  const env = buildEnv()

  console.log(`== Build Android APK (${buildType}) ==`)
  console.log(`JAVA_HOME=${env.JAVA_HOME}`)
  console.log(`ANDROID_HOME=${env.ANDROID_HOME}`)

  const result = spawnSync(gradleCommand, gradleArgs, {
    cwd: androidDir,
    env,
    stdio: 'inherit',
    shell: process.platform.startsWith('win')
  })

  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }

  process.exit(result.status === null ? 1 : result.status)
}

build()
