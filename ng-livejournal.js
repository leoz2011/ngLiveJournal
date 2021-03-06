/*global angular:true, browser:true */

/**
* @license LiveJournal API Module for AngularJS
* (c) 2014 - 2015 Leonid Zolotarev
* License: MIT
*/
(function () {
	'use strict';

	angular.module('ngLiveJournal', ['angular-md5','ngLogExt'])
	.factory('ngLJService', ['$http','$q','$log','md5',
		function($http,$q,$log,md5) {

		var log = $log.context('LJ');
		var x2js = new X2JS();

		var hostName = 'http://www.livejournal.com';
		var pathName = '/interface/xmlrpc';

		var URL = '';

		function setConfig(useProxy) {
			if (useProxy) {
				URL = pathName;
			}
			else {
				URL = hostName + pathName;
			}
			log.debug('setConfig:', URL);
		};

		function newCall(params) {
			var q = $q.defer();
			$http({
				method: 'POST',
				url: URL,
				data: params,
				headers: {
					'Content-Type': 'text/xml'
				}
			}).
			success(function(data, status) {
				log.debug('newCall - success:', status);

				if (!data) {
					var msg = 'No data received';
					log.debug('newCall - data error:', msg);
					q.reject(msg);
				}
				else {
					var xmlDoc = x2js.parseXmlString(data);

					try {
						var response = XMLRPC.parseDocument(xmlDoc);
						log.debug('newCall - response:', response);
						q.resolve(response);
					}
					catch(err) {
						log.debug('newCall - parse error:', err);
						q.reject(err);
					}
				}
			}).
			error(function(data, status) {
				log.debug('newCall - POST error', data, status);
				q.reject(data);
			});
			return q.promise;
		};

		function getEmbed(journal,ditemid,moduleid) {
			
			var q = $q.defer();
			var url = 'http://' + journal + '.livejournal.com/' + ditemid + '.html';

			$http({
				method: 'GET',
				url: url
			}).
			success(function(data, status) {
				log.debug('getEmbed - success:', status);

				if (!data) {
					var msg = 'No data received';
					log.debug('getEmbed - data error:', msg);
					q.reject(msg);
				}
				else {

					data = data.match('<iframe(.|\n)*?src="(.|\n)*?moduleid=' + moduleid + '(.|\n)*?"(.|\n)*?>(.|\n)*?<\/iframe>');

					if (!data || !data[0]) {
						var msg = 'No data found';
						log.debug('getEmbed - data not found error:', msg);
						q.reject(msg);
					}
					else {
						log.debug('getEmbed - response:', data[0]);
						q.resolve(data[0]);
					}
				}
			}).
			error(function(data, status) {
				log.debug('newCall - GET error', data, status);
				q.reject(data);
			});
			return q.promise;
		};

		function prepareCall(method,params) {
			log.debug('prepareCall:', method);
			var xmlDoc = XMLRPC.document(method, [params]);
			var data;
			if ("XMLSerializer" in window) {
				data = new window.XMLSerializer().serializeToString(xmlDoc);
			} else {
				// IE does not have XMLSerializer
				data = xmlDoc.xml;
			}
			return data;
		};

		function getChallenge() {

			var method = 'LJ.XMLRPC.getchallenge';

			var param = prepareCall(method,null);
			return newCall(param);
		};

		function makeCall(username,password,method,params) {
			if(username) {
				return getChallenge().then(function(response){
					var challenge = response[0].challenge;
					var response = null;
					try {
						response = md5.createHash(challenge + md5.createHash(password));
					}
					catch(err) {
						return null;
					}
					params['auth_method'   ] = 'challenge';
					params['auth_response' ] = response;
					params['username'      ] = username;
					params['auth_challenge'] = challenge;
					var param = prepareCall(method,params);
					return newCall(param);
				},{});
			}
			else {
				var param = prepareCall(method,params);
				return newCall(param);
			}
		};

		// LiveJournal API

		function editEvent(username,password,journal,itemid,body,subject,time) {

			var currentTime = new Date(time);
			var year = currentTime.getFullYear();
			var mon = currentTime.getMonth() + 1;
			var day = currentTime.getDate();
			var hour = currentTime.getHours();
			var min = currentTime.getMinutes();

			var method = 'LJ.XMLRPC.editevent';
			var params = {
				'ver'        : '1',
				'usejournal' : journal,
				'itemid'     : itemid,
				'event'      : body,
				'subject'    : subject,
				'year'       : year,
				'mon'        : mon,
				'day'        : day,
				'hour'       : hour,
				'min'        : min
			};

			return makeCall(username,password,method,params);
		};

		function deleteEvent(username,password,journal,itemid) {
			return editEvent(username,password,journal,itemid,null,null,null);
		};

		function postEvent(username,password,journal,body,subject) {

			var currentTime = new Date();
			var year = currentTime.getFullYear();
			var mon = currentTime.getMonth() + 1;
			var day = currentTime.getDate();
			var hour = currentTime.getHours();
			var min = currentTime.getMinutes();

			var method = 'LJ.XMLRPC.postevent';
			var params = {
				'ver'         : '1',
				'event'       : body,
				'subject'     : subject,
				'security'    : 'public',
				'lineendings' : 'pc',
				'year'        : year,
				'mon'         : mon,
				'day'         : day,
				'hour'        : hour,
				'min'         : min,
				'usejournal'  : journal
			};

			return makeCall(username,password,method,params);
		};

		function deleteComments(username,password,journal,ditemid,dtalkid) {

			var method = 'LJ.XMLRPC.deletecomments';
			var params = {
				'ver'     : '1',
				'journal' : journal,
				'ditemid' : ditemid,
				'dtalkid' : dtalkid
			};

			return makeCall(username,password,method,params);
		};

		function addComment(username,password,journal,ditemid,parent,body,subject) {

			var method = 'LJ.XMLRPC.addcomment';
			var params = {
				'ver'     : '1',
				'journal' : journal,
				'ditemid' : ditemid,
				'parent'  : parent,
				'body'    : body,
				'subject' : subject
			};

			return makeCall(username,password,method,params);
		};

		function doLogin(username,password) {

			var method = 'LJ.XMLRPC.login';
			var params = {
				'ver'          : '1',
				'getpickws'    : '1',
				'getpickwurls' : '1'
			};

			return makeCall(username,password,method,params);
		};

		function getFriends(username,password) {

			var method = 'LJ.XMLRPC.getfriends';
			var params = {
				'ver' : '1'
			};

			return makeCall(username,password,method,params);
		};

		function getUserpics(username,password,journal) {

			var method = 'LJ.XMLRPC.getuserpics';
			var params = {
				'ver'        : '1',
				'usejournal' : journal
			};

			return makeCall(username,password,method,params);
		};

		function getEvent(username,password,journal,itemid) {

			var method = 'LJ.XMLRPC.getevents';
			var params = {
				'ver'        : '1',
				'selecttype' : 'one',
				'itemid'     : itemid,
				'usejournal' : journal
			};

			return makeCall(username,password,method,params);
		};

		function getEvents(username,password,journal,count,last_date) {

			var method = 'LJ.XMLRPC.getevents';
			var params = {
				'ver'        : '1',
				'selecttype' : 'lastn',
				'truncate'   : '4',
				'howmany'    : count,
				'usejournal' : journal
			};
			if (last_date) {
				params['beforedate'] = last_date;
			}

			return makeCall(username,password,method,params);
		};

		function getComments(username,password,journal,itemid) {

			var method = 'LJ.XMLRPC.getcomments';
			var ditemid = itemid * 256;
			var params = {
				'ver'     : '1',
				'journal' : journal,
				'ditemid' : ditemid
			};

			return makeCall(username,password,method,params);
		};

		// Utilities API

		function decodeArrayBuffer(buf) {
			if (!buf) {
				return ' ';
			}
			if (buf.constructor == String) {
				return buf;
			}
			if (buf.constructor == Number) {
				return buf.toString();
			}
			var uintArray = new Uint8Array(buf);
			var encodedString = String.fromCharCode.apply(null, uintArray);
			var decodedString = decodeURIComponent(escape(encodedString));
			return decodedString;
		};

		return {
			edit_event          : editEvent,
			delete_event        : deleteEvent,
			post_event          : postEvent,
			delete_comments     : deleteComments,
			add_comment         : addComment,
			do_login            : doLogin,
			get_friends         : getFriends,
			get_userpics        : getUserpics,
			get_event           : getEvent,
			get_events          : getEvents,
			get_comments        : getComments,
			get_embed           : getEmbed,
			decode_array_buffer : decodeArrayBuffer,
			set_config          : setConfig
		};
	}]);
})();
