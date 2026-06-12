#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs"
import { glob } from "tinyglobby"

const versionType = process.argv[2] // 'patch', 'minor', or 'major'

if (!["patch", "minor", "major"].includes(versionType)) {
  console.error("Usage: node bump-version.mjs [patch|minor|major]")
  process.exit(1)
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split(".").map(Number)

  switch (type) {
    case "major":
      return `${major + 1}.0.0`
    case "minor":
      return `${major}.${minor + 1}.0`
    case "patch":
      return `${major}.${minor}.${patch + 1}`
    default:
      throw new Error(`Invalid version type: ${type}`)
  }
}

// Find all package.json files
const packageFiles = await glob(["**/package.json"], {
  ignore: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
})

let newVersion

for (const file of packageFiles) {
  const content = readFileSync(file, "utf-8")
  const pkg = JSON.parse(content)

  if (pkg.version) {
    const oldVersion = pkg.version
    newVersion = bumpVersion(oldVersion, versionType)
    pkg.version = newVersion

    writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n")
    console.log(`${file}: ${oldVersion} → ${newVersion}`)
  }
}

console.log(`\nAll packages bumped to ${newVersion}`)
