(function ($, undefined) {
	'use strict';

	var uuid = window.uuid;

	var SolrModel = Backbone.Model.extend({

		crudSolrKeyMap: {
			'create': 'add',
			'read': 'select',
			'update': 'add',
			'delete': 'delete'
		},

		solrDefaults: {
			boost: 1.0,
			overwrite: true,
			commitWithin: 1000
		},

		_stringifyMultiObjects: function (attributes) {
			return this._traverseMultiObjects(attributes, function (arrVal) {
				if (_.isObject(arrVal)) {
					return JSON.stringify(arrVal);
				} else {
					return arrVal;
				}
			});
		},

		_parseMultiObjects: function (attributes) {
			return this._traverseMultiObjects(attributes, function (arrVal) {
				try {
					return JSON.parse(arrVal);
				} catch (e) {
					return arrVal;
				}
			});
		},

		_traverseMultiObjects: function (attributes, callback) {
			var attrs = {};
			_.each(attributes, function (value, key) {
				if (_.isArray(value)) {
					value = _.map(value, function (arrVal) {
						return callback(arrVal);
					});
				}

				attrs[key] = value;
			});

			return attrs;
		},

		_crudSolrData: function (method) {
			if (method === 'delete') {
				// Only ID
				return { id : this.id };
			} else {
				// All attributes, including ID
				// This is necessary since Solr does not make a difference between update
				// and create.
				var attributes = _.omit(this.attributes, '_version_');

				// Solr specifies _version_ attribute to distinguish between
				// create and update. See http://yonik.com/solr/optimistic-concurrency/
				// attributes._version_ = method === 'create' ? 0.5 : 1;

				attributes = this._stringifyMultiObjects(attributes);

				return _.extend({ doc: attributes }, this.solrDefaults);
			}
		},

		_parseToSolrData: function (method) {
			var
				data = {},

				key = this.crudSolrKeyMap[method],

				value = this._crudSolrData(method);

			data[key] = value;

			return data;
		},

		urlRoot: function (method) {
			return this.collection.url + '/' +
				(method === 'read' ? 'get' : 'update') + '?wt=json';
		},

		sync: function (method, model, options) {
			if (method === 'create') {
				if (this.has('id')) { throw 'ERROR: Trying to create new comment with already existing ID'; }
				this.set('id', uuid.v4(), { silent: true });
			}

			options.url = model.urlRoot(method);

			if (method !== 'read') {
				options.contentType = 'application/json';
				options.method = 'POST';
			} else {
				// We only support fetching by ID so far
				options.method = 'GET';
				options.data = {
					id: model.get('id')
				};
				// options.contentType = 'application/json';
				return Backbone.Model.prototype.sync.apply(this, arguments);
			}

			var data = this._parseToSolrData(method);

			return Backbone.ajax(_.extend({
				data: JSON.stringify(data),
			}, options));
		},

		parse: function (fields) {
			if (!_.isObject(fields)) {
				return;
			}

			// Fetching a model separately will produce this response
			if (fields.response && fields.response.docs) {
				fields = fields.response.docs[0];
			} else if (fields.doc !== undefined) {
				fields = fields.doc;
			}

			var result = {};

			_.each(fields, function (value, key) {
				if (_.isArray(value) && value.length === 1) {
					result[key] = value[0];
				} else {
					result[key] = value;
				}
			});

			result = this._parseMultiObjects(result);

			return result;
		}
	});

	var SolrCollection = Backbone.Collection.extend({
		url: '/solr/collection1',
		model: SolrModel,

		parse: function (response) {
			var jsonArray = [];

			_.each(response.response.docs, function (doc) {
				jsonArray.push(doc);
			});

			return jsonArray;
		},

		_splitQuery: function (query) {
			var string = "";
			_.each(query, function (value, key) {
				string += key + ':' + '"' + value + '"' + '&';
			});
			return _.initial(string.split('&')).join('&');
		},

		sync: function (method, model, options) {
			if (method === 'read') {
				options.url = this.url + '/select';

				options.data = options.data || {};

				(options = options || {}).data = {
					fq: 'modeltype:' + options.query.modeltype,
					q: this._splitQuery(_.omit(options.query, 'modeltype')),
					wt: 'json'
				};

			}

			return Backbone.Collection.prototype.sync.apply(this, arguments);
		}
	});

	window.SolrBackbone = {
		Model: SolrModel,
		Collection: SolrCollection
	};
}(jQuery));