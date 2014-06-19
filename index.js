var pg = require('pg');
var Q = require('q');
var _ = require('lodash');

var sprintf = require('util').format;
var uri = require('../config').db.uri;

function pluckId (row) {
	return +row.id;
}

function SqlError (args, error) {
	this.name = 'SqlError';
	this.args = args;
	this.details = error;
	this.message = 'Can\'t complete SQL query due to error.';
}

function query () {
	var deferred = Q.defer();
	var args = Array.prototype.slice.call(arguments);
	
	pg.connect(methods.uri, function (error, client, done) {
		if (error) {
			return deferred.reject(new SqlError(args, error));
		}

		args.push(function (error, result) {
			done();
			if (error) {
				deferred.reject(new SqlError(args, error));
			} else {
				deferred.resolve(result.rows);
			}
		});

		client.query.apply(client, args);
	});

	return deferred.promise;
}

function querySingle () {
	return query.apply(this, arguments).then(function (rows) {
		return rows && rows.length && rows[0];
	});
}

function insert (table, row) {
	_.extend(row, {
		created_at: new Date(),
		creator_id: this.user.id
	});

	var names = _.keys(row).join(', ');
	var values = _.values(row);
	var placeholders = values.map(function (item, index) {
		return '$' + (index + 1);
	}).join(', ');

	var sql = sprintf(
		'insert into %s (%s) values (%s) returning id',
		table, names, placeholders);

	return querySingle(sql, values).then(pluckId);
}

function updateInternal (table, row) {
	if (!row.id) {
		throw new Error('Can\'t update row without id.');
	}

	var params = [row.id];
	delete row.id;
	
	var names = _.keys(row).filter(function (key) {
		return key !== 'id';
	}).map(function (key, index) {
		params.push(row[key]);
		return key + ' = $' + (index + 2);
	}).join(', ');

	var sql = sprintf('update %s set %s where id = $1 returning id', table, names);
	return querySingle(sql, params).then(pluckId);
}

function update (table, row) {
	return updateInternal.call(this, table, _.extend(row, {
		updated_at: new Date(),
		updater_id: this.user.id
	}));
}

function remove (table, id) {
	return updateInternal.call(this, table, {
		id: id,
		remover_id: this.user.id,
		removed_at: new Date()
	}).then(function () {
		return querySingle('delete from ' + table + ' where id = $1', [id]);
	});
}

function find (table, id) {
	return querySingle('select * from ' + table + ' where id = $1', [id]);
}

function end () {
	pg.end();
}

var methods = {
	query: query,
	querySingle: querySingle,
	insert: insert,
	update: update,
	remove: remove,
	find: find,
	end: end
};

try {
	require.resolve('./config');
	methods.uri = require('./config').db.uri;
} catch (e) {
	methods.uri = process.env.PG_URI || '';
}

module.exports = methods;
