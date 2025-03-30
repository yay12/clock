#!/usr/bin/env node

import fs from 'fs'
import minimist from 'minimist'
import * as glob from 'glob'
import gitignore from 'ignore'
import { readRc, runWithConfig, report } from '../lib/index.js'

let helpMessage = `
This is zhlint!

Usage:
  zhlint <file-pattern>[, ...]
  zhlint <file-pattern>[, ...] --fix
  zhlint --fix <file-pattern>
  zhlint --fix=<file-pattern>
  zhlint <input-file-path> --output <output-file-path>
  zhlint <input-file-path> --output=<output-file-path>
  zhlint --help
  zhlint --version

Config arguments:

  --config <filepath>
    .zhlintrc by default

  --ignore <filepath>
  --file-ignore <filepath>
    .zhlintignore by default
  
  --case-ignore <filepath>
    .zhlintcaseignore by default

  --dir    <path>
    current directory by default

Examples:
  zhlint foo.md
  zhlint foo.md --fix
  zhlint *.md
  zhlint *.md --fix
  zhlint foo.md bar.md
  zhlint foo.md bar.md --fix
  zhlint --fix foo.md
  zhlint --fix=foo.md
  zhlint --fix *.md
  zhlint --fix=*.md
  zhlint foo.md --output dest.md
  zhlint foo.md --output=dest.md
`.trim()

let main = () => {
  let argv = minimist(process.argv.slice(2))

  let help = () => console.log(helpMessage)

  if (argv.v || argv.version) {
    console.log(require('../package.json').version)
    return
  }

  if (argv.h || argv.help) {
    help()
    return
  }

  // To support other CLI conventions like `lint-staged`.
  if (typeof argv.fix === 'string') {
    argv._.push(argv.fix)
    argv.fix = true
  }

  if (argv._ && argv._.length) {
    let [filePattern] = [...argv._]
    let configDir = argv.dir
    let configPath = argv.config
    let fileIgnorePath = argv.ignore || argv['file-ignore']
    let caseIgnorePath = argv['case-ignore']
    let config = readRc(configDir, configPath, fileIgnorePath, caseIgnorePath)
    let fileIgnore = gitignore().add(config.fileIgnores)
    let fileIgnoreFilter = fileIgnore.createFilter()
    try {
      let files = glob.sync(filePattern)
      let resultList = files.filter(fileIgnoreFilter).map((file) => {
        console.log(`[start] ${file}`)
        let origin = fs.readFileSync(file, { encoding: 'utf8' })
        let { result, validations } = runWithConfig(origin, config)
        return {
          file,
          origin,
          result,
          validations
        }
      })
      let exitCode = report(resultList)
      if (argv.o || argv.output) {
        if (files.length === 1) {
          let { file, result } = resultList[0]
          fs.writeFileSync(argv.o || argv.output, result)
          console.log(`[output] ${file} -> ${argv.o || argv.output}`)
        } else {
          console.error(
            `Sorry. If you use argument '--output' or '-o', you could only pass one file as the input.`
          )
        }
      } else if (argv.f || argv.fix) {
        resultList.forEach(({ file, value, result }) => {
          if (value !== result) {
            fs.writeFileSync(file, result)
            console.log(`[fixed] ${file}`)
          }
        })
      } else {
        if (exitCode) {
          process.exit(exitCode)
        }
      }
    } catch (e) {
      console.error(e)
    }
    return
  }

  help()
}

main()
