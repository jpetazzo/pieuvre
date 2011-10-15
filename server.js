var http = require('http');
var net = require('net');

var httpPort = process.env.PORT_WWW || 8080;
var proxyPort = process.env.PORT_PROXY || 8081;
var workerPort = process.env.PORT_WORKER || 8082;

var workerPools = {'_all': []};

function addWorkerToPool(worker, pool) {
    if (!(pool in workerPools)) {
	workerPools[pool] = [];
    }
    workerPools[pool].push(worker);
}


function debug (thing, message) {
    console.log(thing+' '+message);
}


http.createServer(function(req, res) {
    console.log(req);
    res.writeHead(200, {
	'Content-Type': 'text/plain'
    });
    res.write('PIEUVRE up and running.\r\n');
    res.write('I have '+workerPools['_all'].length+' worker(s).\r\n');
    workerPools._all.forEach(function (w) {
	res.write(w+'\r\n');
    });
    res.end();
}).listen(httpPort);


http.createServer(function(req, res) {
    var workerList = workerPools._all;
    for (var i=0;
	 i<workerList.length;
	 i++) {
	var w = workerList.shift();
	if (w.state != 'dead') {
	    workerList.push(w);
	}
	if (w.state == 'ready') {
	    w.state = 'busy';
	    w.write(req.method+' '+req.url+' HTTP/'+req.httpVersion+'\r\n');
	    for (var h in req.headers) {
		w.write(h+': '+req.headers[h]+'\r\n');
	    }
	    w.write('\r\n');
	    req.pipe(w, {end: false});
	    w.pipe(res.connection);
	    return;
	}
    }
    res.writeHead(503, 'Gateway Not Available',
		  {'Content-Type': 'text/plain'});
    res.end('No proxy worker was available to satisfy your request.\r\n');
}).listen(proxyPort);


net.createServer(function(stream) {
    stream.id = '';
    stream.toString = function () {
	return ('<WorkerStream['+this.id+']('+this.state+') '
		+this.remoteAddress+':'+this.remotePort+'> ');
    };
    debug(stream, 'connected');
    addWorkerToPool(stream, '_all');
    stream.state = 'new';
    stream.buffer = '';
    stream.write('PIEUVRE/1.0\r\n');
    stream.on('data', function onData(data) {
	// FIXME: protect against buffer overflow.
	this.buffer += data;
	if (this.buffer.search('\n') != -1) {
	    // We discard any junk sent after the first line.
	    this.id = this.buffer.split('\n',1)[0].trim();
	    this.state = 'ready';
	    this.removeListener('data', onData);
	    addWorkerToPool(this.id, this);
	}
    });
    stream.on('end', function(data) {
	debug(this, 'worker disconnected');
	this.state = 'dead';
    });
}).listen(workerPort);


console.log('HTTP monitoring port is '+httpPort);
console.log('HTTP proxy port is '+proxyPort);
console.log('HTTP worker port is '+workerPort);