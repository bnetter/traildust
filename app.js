#!/usr/bin/env node

const _ = require('lodash');
const Promise = require('bluebird');
const glob = Promise.promisify(require('glob'));
const zlib = Promise.promisifyAll(require('zlib'));
const fs = Promise.promisifyAll(require('graceful-fs'));
const ProgressBar = require('progress');
const inquirer = require('inquirer');
const util = require('util');
const colors = require('colors');
const Table = require('cli-table');
const moment = require('moment');
const argv = require('yargs').argv;
const flatten = require('flat');

/**
 * Options:
 * + `path` is the path to the logs
 */

function init() {
  return getLogPath()
    .tap((path) => checkPath(path))
    .then((path) => glob(`${path}/**/*.gz`))
    .then((files) => getEvents(files))
    .then((events) => getCriteria(events))
    .spread((events, criteria) => filterEvents(events, criteria))
    .then((events) => sort(events))
    .tap((events) => display(events))
    .then((events) => askForDetails(events))
    .catch((err) => console.error(`${colors.red.bold('Error:')} ${err.message}`));
}

function getLogPath() {
  const defaultPath = process.cwd() || `${require('os').homedir()}/logs`;
  const question = {
    name: 'path',
    message: 'Where are your Cloudtrail logs located?',
    default: defaultPath
  };

  return new Promise((resolve, reject) => {
    let path = argv.path;

    // If `path` is not set, use the first argument (if it exists)
    if (_.isUndefined(path) && _.isArray(argv._) && argv._.length > 0) {
      path = argv._[0];
    }

    if (!_.isUndefined(path)) {
      return resolve(path);
    }

    // Otherwise, ask for a proper path
    return inquirer.prompt([ question ])
      .then((answers) => resolve(answers.path))
      .catch((err) => reject(err));
  });
}

function checkPath(path) {
  const exists = require('fs').existsSync(path);

  if (!exists) {
    throw new Error(`Your path is incorrect (${colors.grey(path)})`);
  }
}

function getEvents(files) {
  const bar = new ProgressBar('Parsing log files… [:bar] (:current/:total) :elapseds', {
    total: files.length,
    width: 20
  });
  let events = [];

  return Promise.map(files, (file) => {
    return fs.readFileAsync(file)
      .then((file) => zlib.gunzipAsync(file))
      .then((file) => JSON.parse(file))
      .then((json) => {
        events = events.concat(json.Records);
        bar.tick();
      });
  })
    .then(() => {
      console.log(`${colors.bold(events.length + ' events')} were fetched from your log files`);

      return events;
    });
}

function getCriteria(events) {
  if (!_.isUndefined(argv.id)) {
    return Promise.resolve([events, { eventID: argv.id }]);
  }

  if (!_.isUndefined(argv.criteria) && _.isPlainObject(argv.criteria)) {
    return Promise.resolve([events, argv.criteria]);
  }

  return new Promise((resolve) => addCriteria({}, resolve))
    .then((criteria) => [events, criteria]);
}

function addCriteria(criteria, resolve) {
  const questions = [
    {
      type: 'confirm',
      name: 'newCriteria',
      message: 'Do you want to add a new filter?',
      default: false
    },
    {
      name: 'key',
      message: 'Which key are you filtering?',
      when: (answers) => (answers.newCriteria)
    },
    {
      name: 'value',
      message: 'What value are you expecting?',
      when: (answers) => (answers.newCriteria)
    }
  ];

  return inquirer.prompt(questions)
    .then((answers) => {
      if (answers.newCriteria === false || _.isEmpty(answers.key) || _.isEmpty(answers.value)) {
        return resolve(criteria);
      } else {
        criteria[answers.key] = answers.value;

        return addCriteria(criteria, resolve);
      }
    })
}

function filterEvents(events, criteria) {
  const flattenCriteria = flatten(criteria);

  return Promise.filter(events, (ev) => {
    let keep = true;

    _.forEach(flattenCriteria, (value, key) => {
      keep = (keep && _.get(ev, key) === value);
    });

    return keep;
  })
}

function sort(events) {
  return Promise.map(events, (ev) => {
    return {
      id: ev.eventID,
      date: new Date(ev.eventTime),
      user: _.get(ev, 'userIdentity.userName') || _.get(ev, 'userIdentity.accountId', 'Unknown'),
      name: ev.eventName,
      bucket: _.get(ev, 'requestParameters.bucketName', 'Unknown'),
      details: ev
    }
  })
    .then((events) => _.sortBy(events, 'date'));
}

function display(events) {
  var table = new Table({
    head: ['ID', 'Date', 'Action', 'User', 'Bucket']
  });

  _.forEach(events, (ev) => {
    table.push([ev.id, moment(ev.date).format('YYYY-MM-DD HH:mm'), ev.name, ev.user, ev.bucket]);
  });

  return console.log(table.toString());
}

function askForDetails(events) {
  const questions = [
    {
      name: 'eventID',
      message: 'On which event do you want more details?'
    }
  ];

  return inquirer.prompt(questions)
    .then((answers) => {
      if (answers.eventID) {
        const ev = _.filter(events, { id: answers.eventID });

        if (_.isArray(ev) && ev.length === 1) {
          console.log(util.inspect(ev[0].details, false, null));
        }
      }
    });
}

return init();
