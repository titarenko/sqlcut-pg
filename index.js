var pg = require('pg');
var Q = require('q');

function pluckId (row) {
	return +row.id;
}

function SqlError (args, error) {
	this.name = 'SqlError';
	this.args = args;
	this.details = error;
	this.message = 'Can\'t complete SQL query due to error.';
}

function mysqlToPg (sql) {
	var index = 1;
	return sql.replace(/\?/g, function () {
		return '$' + index++;
	});
}

function ctor (connectionParameters) {
	return function query () {
		var deferred = Q.defer();
		var args = Array.prototype.slice.call(arguments);
		
		var isInsert = args[0].indexOf('insert into') == 0;
		if (isInsert) {
			args[0] += ' returning id';
		}

		args[0] = mysqlToPg(args[0]);
		
		pg.connect(connectionParameters, function (error, client, done) {
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

		var result = deferred.promise;
		if (isInsert) {
			result = result.then(pluckId);
		}

		return result;
	};
}

module.exports = ctor;
