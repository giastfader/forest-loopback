'use strict';
var P = require('bluebird');
var OperatorValueParser = require('./operator-value-parser');

// jshint sub: true
function LineStatGetter(model, params, opts) {
  function getAggregate() {
    if (params.aggregate === 'Count') {
      return 'COUNT(*)';
    } else {
      return `SUM("${getFieldAggregate()}")`;
    }
  }

  function getColumnName(field) {
    if (field === 'createdAt') { return 'createdat'; }
    if (field === 'updatedAt') { return 'updatedat'; }
    return model.definition.rawProperties[field].postgresql.columnName;
  }

  function getFieldAggregate() {
    // jshint sub: true
    let aggregateField = params['aggregate_field'] || 'id';
    return getColumnName(aggregateField);
  }

  function getFieldGroupByDate() {
    const columnName = getColumnName(params['group_by_date_field']);
    const period = params['time_range'].toLowerCase();
    return `date_trunc('${period}', "${columnName}")`;
  }

  function getFilters() {
    if (params.filters) {
      let filters = [];
      params.filters.forEach(function (filter) {
        filters.push(new OperatorValueParser().perform(model,
          filter.field, filter.value, true));
      });
      return filters.join(' AND ');
    } else {
      return null;
    }
  }

  function createSQLRequest() {
    const table = model.settings.postgresql.table;
    const filters = getFilters();

    let sql = `SELECT ${getAggregate()}, ${getFieldGroupByDate()} AS "date"
      FROM ${table}`;
    if (filters) { sql += ` WHERE ${filters}`; }
    sql += ` GROUP BY "date"`;
    sql += ` ORDER BY "date"`;
    return sql;
  }

  this.perform = function () {
    let sql = createSQLRequest();

    return new P(function (resolve, reject) {
      model.dataSource.connector.query(sql, null, function (error, results) {
        if (error) { return reject(error); }
        resolve(results);
      });
    })
    .then(function (records) {
      return P.map(records, function(record) {
        return {
          label: record.date,
          values: { value: record[params.aggregate.toLowerCase()] }
        };
      });
    })
    .then(function (records) {
      return { value: records };
    });
  };
}

module.exports = LineStatGetter;
