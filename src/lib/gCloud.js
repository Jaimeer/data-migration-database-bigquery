'use strict'

const _ = require('lodash/fp')
const Readable = require('stream').Readable
const { Storage } = require('@google-cloud/storage')
const { BigQuery } = require('@google-cloud/bigquery')

const storage = new Storage()

const fileFactory = data => ({
  root: _.get('bucket.name', data),
  file: _.get('name', data),
})

const exportFactory = data => {
  const errors = _.compose(
    _.get('status.errorResult'),
    _.head
  )(data)
  return {
    status: !errors,
    message: _.getOr('SUCCESS', 'message', errors),
  }
}

const queryFactory = data => {
  return data
}

const exists = (bucketName, fileName) =>
  storage
    .bucket(bucketName)
    .file(fileName)
    .exists()
    .then(_.head)
    .catch(err => {
      throw err.message
    })

const save = bucketName => fileName => content => {
  const file = storage.bucket(bucketName).file(fileName)
  const stream = new Readable()
  stream.push(content)
  stream.push(null)
  return new Promise((resolve, reject) => {
    stream.pipe(
      file
        .createWriteStream()
        .on('error', reject)
        .on('finish', () =>
          _.compose(
            resolve,
            fileFactory
          )(file)
        )
    )
  })
}

const exportData = bucketName => dataset => tableName => fileData => {
  const bigquery = new BigQuery()
  const file = storage.bucket(bucketName).file(fileData)
  return bigquery
    .dataset(dataset)
    .table(tableName)
    .load(file, { format: 'CSV', skipLeadingRows: 1 })
    .then(exportFactory)
    .catch(err => {
      throw err.message
    })
}

const executeQuery = sqlQuery => {
  const bigquery = new BigQuery()

  const options = {
    query: sqlQuery,
    timeoutMs: 100000, // Time out after 100 seconds.
    useLegacySql: false, // Use standard SQL syntax for queries.
  }
  return bigquery
    .query(options)
    .then(queryFactory)
    .catch(err => {
      throw err.message
    })
}
module.exports = {
  exists,
  save,
  exportData,
  executeQuery,
}
