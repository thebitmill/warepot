'use strict';

const p = require('path');

const _ = require('lodash');

const db = require(p.join(PWD, 'server/db'));

const { columns: sqlColumns, where } = require('../util/sql');

const factories = {
  count(table) {
    return function count(json, cb) {
      let query = `SELECT count(id) FROM ${table}`;

      let values;

      if (Object.keys(json).length) {
        query += ` WHERE ${where(json)}`;
        values = _.values(_.omitBy(json, _.isNil));
      }

      query += ';';


      db.query(query, values, (err, result) => {
        if (err) return cb(err);

        cb(null, parseInt(result.rows[0].count, 10));
      });
    };
  },

  create(table) {
    return function create(json, cb) {
      json = _.omitBy(json, _.isUndefined);

      const keys = _.keys(json).map((key) => `"${_.snakeCase(key)}"`);
      const values = _.values(json);

      const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${values.map((v, i) => `$${i + 1}`).join(', ')}) RETURNING *;`;

      db.query(query, values, (err, result) => {
        if (err) return cb(err);

        return cb(null, result.rows[0]);
      });
    };
  },

  // use req.query to query database.
  // should probably be used with `midwest/middleware/format-query` and/or
  // `midwest/middleware/paginate`
  find(table, columns) {
    columns = sqlColumns(columns);

    return function find(json, cb) {
      const page = Math.max(0, json.page);
      const perPage = Math.max(0, json.limit);

      json = _.omit(json, 'limit', 'sort', 'page');

      let query = `SELECT ${columns} FROM ${table}`;

      if (Object.keys(json).length) {
        query += ` WHERE ${where(json)}`;
      }

      if (perPage) {
        query += ` LIMIT ${perPage} OFFSET ${perPage * page}`;
      }

      if (query.sort) {
        query += ` ORDER BY ${json.sort}`;
      }

      query += ';';

      const values = _.values(_.omitBy(json, _.isNil));

      db.query(query, values, (err, result) => {
        if (err) return cb(err);

        cb(null, result.rowCount ? result.rows : undefined);
      });
    };
  },


  findById(table, columns) {
    columns = sqlColumns(columns);

    return function findById(id, cb) {
      if (id === 'new') return cb();

      const query = `SELECT ${columns} FROM ${table} WHERE id = $1;`;

      db.query(query, [id], (err, result) => {
        if (err) return cb(err);

        cb(null, result.rows[0]);
      });
    };
  },

  findOne(table, columns) {
    columns = sqlColumns(columns);

    return function find(json, cb) {
      const query = `SELECT ${columns} FROM ${table} WHERE ${where(json)} LIMIT 1;`;

      const values = _.values(_.omitBy(json, _.isNil));

      db.query(query, values, (err, result) => {
        if (err) return cb(err);

        cb(null, result.rows[0]);
      });
    };
  },

  getAll(table, columns) {
    columns = sqlColumns(columns);

    return function getAll(cb) {
      const query = `SELECT ${columns} FROM ${table};`;

      db.query(query, (err, result) => {
        if (err) return cb(err);

        cb(null, result.rowCount ? result.rows : undefined);
      });
    };
  },

  remove(table) {
    return function remove(id, cb) {
      const query = `DELETE FROM ${table} WHERE id = ${id};`;

      db.query(query, (err, result) => {
        if (err) return cb(err);

        cb(null, result.rowCount);
      });
    };
  },

  // completely replaces the doc
  // SHOULD be used with PUT
  replace(table, columns) {
    function replace(req, res, next) {
      // enable using using _hid (not that _id MUST be a ObjectId)
      const query = {
        [mongoose.Types.ObjectId.isValid(req.params.id) ? '_id' : '_hid']: req.params.id,
      };

      // Note that if no doc is found, both err & doc are null.
      Model.findByIdAndUpdate(query, _.omit(req.body, '_id', '__v'), { new: true, overwrite: true }, (err, doc) => {
        if (err) return void next(err);

        res.locals[singular] = doc.toJSON();

        next();
      });
    }
  },

  update(table) {
    // changes properties passed on req.body
    // SHOULD be used with PATCH
    return function update(id, json, cb) {
      // enable using using _hid (not that _id MUST be a ObjectId)

      const keys = Object.keys(json);

      const query = `UPDATE ${table} SET ${keys.map((key, i) => `${key}=($${i + 1})`).join(' ')} WHERE id = ($${keys.length});`;

      db.query(query, cb);
    };
  },
};

const all = Object.keys(factories);

module.exports = (table, columns, queries, exclude, include) => {
  include = include || _.difference(all, exclude);

  return include.reduce((result, value) => {
    if (factories[value]) {
      result[value] = factories[value](table, columns);
    }

    return result;
  }, {});
};