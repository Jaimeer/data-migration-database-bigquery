const moment = require('moment')

function secondsToString(seconds) {
  const date = moment()
    .startOf('day')
    .seconds(seconds)
  return `${date.format('H')}h ${date.format('mm')}m ${date.format('ss')}s`
}

module.exports = {
  secondsToString,
}
