require('./setup/debug')
const fs = require('fs-extra')
const path = require('path')
const json2csv = require('json2csv')
const gCloud = require('./lib/gCloud')
const dbLib = require('./lib/dbLib')
const parseLib = require('./lib/parseLib')
const moment = require('moment')
const logSymbols = require('log-symbols')
const debug = require('debug')('script:regenerate')

const gap = '   '

function finishProcess() {
  process.exit(-1)
}

function getConfiguration(params) {
  const configuration = require('./config')
  const config = configuration.environments[params.environment]
  if (!config) throw new Error('Environment not supported')
  return { ...config, ...{ data: configuration.data }, ...params }
}

function getParameters() {
  const argv = require('minimist')(process.argv.slice(2))
  const iniDate = new Date(argv.ini || argv.i)
  const endDate = new Date(argv.end || argv.e)
  const calculateBy = argv.by || 'h'
  const environment = argv.env || 'test'
  if (!iniDate) {
    debug('ERROR: --ini or -i needed')
    finishProcess()
  }
  if (iniDate.toString() === 'Invalid Date') {
    debug('ERROR: iniDate invalid')
    finishProcess()
  }
  if (!endDate) {
    debug('ERROR: --end or -e needed')
    finishProcess()
  }
  if (endDate.toString() === 'Invalid Date') {
    debug('ERROR: endDate invalid')
    finishProcess()
  }
  return {
    iniDate,
    iniDateString: iniDate.toISOString(),
    endDate,
    endDateString: iniDate.toISOString(),
    environment,
    calculateBy,
  }
}

async function transformQueryInData(res) {
  const data = res.rows
  if (data.length === 0) return null
  const fields = res.fields.map(field => field.name)
  const doubleQuotes = ''
  const content = json2csv.parse(data, fields, doubleQuotes)
  return content
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

async function removeDataFromBQ(config, hourParams, type) {
  const table = `${config.gCloud.bigQuery.dataset}.${config.data[type].gCloud.bigQuery.table}`
  const dateField = config.data[type].gCloud.bigQuery.dateField
  const query =
    `delete from ${table} ` +
    `where ${dateField} >= "${hourParams.iniDateString}" and ${dateField} < "${
      hourParams.endDateString
    }"`
  const res = await gCloud.executeQuery(query)
  debug(`${gap}${gap}${logSymbols.success} Data removed from bigquery`)
  return res
}

async function createQuery(type, hourParams) {
  // eslint-disable-next-line
  const file = path.join(__dirname, `./config/sql/${type}.sql`)
  const query = await fs
    .readFileSync(file)
    .toString()
    .replace('#INI_DATE#', hourParams.iniDateString)
    .replace('#END_DATE#', hourParams.endDateString)
    .trim()
  return query
}

async function getData(type, hourParams) {
  const query = await createQuery(type, hourParams)
  const results = await dbLib.executeQuery(query)
  const content = await transformQueryInData(results)
  debug(
    `${gap}${gap}${logSymbols.success} Data obtained from psql [${content ? content.length : 0}]`
  )
  return content
}

async function uploadData(config, hourParams, type, content) {
  const dateHash = (+new Date()).toString(36)
  const csvName = `${type}_${dateHash}_${hourParams.iniDateString}_${hourParams.endDateString}.csv`
  const fileName = `${type}_regeneration/${csvName}`
  await gCloud.save(config.gCloud.store.bucketName)(fileName)(content)
  debug(`${gap}${gap}${logSymbols.success} Data uploaded to google storage`)
  return fileName
}

async function processData(config, type, fileName) {
  const bucketName = config.gCloud.store.bucketName
  const dataset = config.gCloud.bigQuery.dataset
  const tableName = config.data[type].gCloud.bigQuery.table
  const res = await gCloud.exportData(bucketName)(dataset)(tableName)(fileName)
  if (!res.status)
    debug(
      `${gap}${gap}${logSymbols.error} Error processing from google storage to bigquery: ${
        res.message
      }`
    )
  else debug(`${gap}${gap}${logSymbols.success} Data processed from google storage to bigquery`)
  return res
}

async function regeneratePartial(config, hourParams) {
  const scripts = Object.keys(config.data)
  await asyncForEach(scripts, async type => {
    debug(`${gap}Process [${type}]`)
    const content = await getData(type, hourParams)
    if (!content) {
      await removeDataFromBQ(config, hourParams, type, config)
      debug(`${gap}${gap}${logSymbols.warning} No data found`)
    } else {
      const fileName = await uploadData(config, hourParams, type, content)
      await removeDataFromBQ(config, hourParams, type)
      await processData(config, type, fileName)
    }
  })
}

function calculateNumIterations({ config }) {
  let numIterations = 0
  for (
    let index = config.iniDate;
    index < config.endDate;
    index = new moment(index).add(1, config.calculateBy).toDate() // eslint-disable-line
  ) {
    numIterations++
  }
  return numIterations
}

async function regenerate(config) {
  debug('')
  debug(`Configuration:`)
  debug(`${gap}${logSymbols.info} environment [${config.environment}] `)
  debug(`${gap}${logSymbols.info} date [${config.iniDateString}] to [${config.endDateString}]`)
  debug(`${gap}${logSymbols.info} calculateBy [${config.calculateBy}] `)

  const numIterations = calculateNumIterations({ config })
  let numIteration = 0

  for (
    let index = config.iniDate;
    index < config.endDate;
    index = new moment(index).add(1, config.calculateBy).toDate() // eslint-disable-line
  ) {
    const endDate = new moment(index).add(1, config.calculateBy).toDate() // eslint-disable-line
    const hourParams = {
      iniDate: index,
      iniDateString: index.toISOString(),
      endDate,
      endDateString: endDate.toISOString(),
    }
    numIteration++
    debug('')
    debug(
      `[${numIteration}/${numIterations}] ` +
        `Start Process from [${hourParams.iniDateString}] to [${hourParams.endDateString}]`
    )
    const partialTime = process.hrtime()
    await regeneratePartial(config, hourParams)
    const hrend = process.hrtime(partialTime)
    debug(
      `${gap}${logSymbols.info} ` +
        `Execution time (hr): ${parseLib.secondsToString(hrend[0])} ${hrend[1] / 1000000}ms`
    )
  }
}

async function checkFile(file) {
  const pathLocation = path.join(__dirname, file)
  const exists = await fs.pathExistsSync(pathLocation)
  if (!exists) {
    debug(`${gap}${logSymbols.error} You need to create the file ${file.replace('./', './src/')}`)
    finishProcess()
  } else {
    debug(`${gap}${logSymbols.success} You configuration file ${file.replace('./', './src/')} exists`)
  }
}
async function checkFiles() {
  debug(`Checking files:`)
  await checkFile('./config/index.js')
  await checkFile('./config/gcloud-auth.json')
  const configuration = require('./config')
  for (const data in configuration.data) {
    await checkFile(`./config/sql/${data}.sql`)
  }
}

async function init() {
  const globalTime = process.hrtime()
  try {
    debug('--- INI ---')
    const params = getParameters()
    await checkFiles()
    const config = getConfiguration(params)
    await dbLib.connectDatabase(config.database)
    await regenerate(config)
  } catch (err) {
    debug(logSymbols.error, 'ERROR', err.message, err)
  } finally {
    await dbLib.closeDatabase()
  }

  const hrend = process.hrtime(globalTime)
  debug(
    `${logSymbols.info} ` +
      `Execution time (hr): ${parseLib.secondsToString(hrend[0])} ${hrend[1] / 1000000}ms`
  )
  debug('--- END ---')
}

;(async () => init())()
