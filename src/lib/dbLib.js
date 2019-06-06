const { Client } = require('pg')

let client = null

async function executeQuery(query) {
  return await client.query(query)
}

async function connectDatabase(config) {
  client = new Client(config)
  await client.connect()
}

async function closeDatabase() {
  await client.end()
}
module.exports = {
  connectDatabase,
  closeDatabase,
  executeQuery,
}
