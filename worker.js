var net = require('net');
var url = require('url');

var host = process.argv[2] || 'localhost';
var port = process.argv[3] || '8082';
var id = process.argv[4] || process.pid;

net.createConnection(port, host).on('connect', function () {
    this.on('error', function (exception) {
	this.write('HTTP/1.0 500 Internal Server Error\r\n');
	this.write('Content-Type: text/plain\r\n');
	this.write('\r\n');
	this.write(String(exception));
	this.write('\r\n');
	this.end();
    });
    this.buffer = '';
    this.on('data', function onData(data) {
	// FIXME against buffer overflows
	this.buffer += data;
	if (this.buffer.search('\n') != -1) {
	    var serverId = this.buffer.split('\n', 1)[0].trim();
	    console.log('Connected to server: '+serverId);
	    this.buffer = '';
	    this.removeListener('data', onData);
	    this.on('data', function onRequest(data) {
		this.buffer += data;
		if (this.buffer.search('\n') != -1) {
		    var lines = this.buffer.split('\n');
		    var requestLine = lines.shift().trim();
		    this.buffer = lines.join('\n');
		    this.pause();
		    this.removeListener('data',onRequest);
		    var requestArgs = requestLine.split(' ');
		    if (requestArgs.length != 3) {
			return this.emit('error',
					 'Cannot parse: '+requestLine);
		    }
		    var method = requestArgs.shift();
		    var urlObject = url.parse(requestArgs.shift());
		    var protocol = requestArgs.shift();
		    if (urlObject.protocol != 'http:') {
			return this.emit('error', 
					 'Cannot handle protocol: '+
					 urlObject.protocol);
		    }
		    var workerStream = this;
		    console.log('Got request');
		    console.log(urlObject);
		    net.createConnection(
			urlObject.port || 80, urlObject.hostname).on(
			    'connect',
			    function () {
				this.write([method, 
					    ' ',
					    urlObject.pathname,
					    urlObject.search || '',
					    ' ',
					    protocol,
					    '\r\n'].join(''));
				this.pipe(workerStream);
				workerStream.pipe(this, {end:false});
				workerStream.resume();
			    });
		}
	    });
	}
	this.write(id+'\n');
    });
});
