/* -*- coding: utf-8 -*-
============================================================================= */
/*jshint asi: true*/

var path = require('path')

var config = require('konfig')({
    path: path.join(__dirname, 'config')
})

var morgan = require('morgan')

var log = null
if (config.app.debug) {
    log = morgan('dev')
} else {
    log = morgan('combined')
}

var util = require("util"),
    async = require("async"),
    express = require('express'),
    http = require('http'),
    net = require('net'),
    url = require('url'),
    uuid = require('uuid'),
    sio = require('socket.io')

/* Express
============================================================================= */

var favicon = require('serve-favicon')
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')

var app = express()
app.use(log)

var server = app.listen(config.app.admin.port)

app.use(favicon(__dirname + '/static/favicon.ico'))

app.use(bodyParser.json())
app.use(bodyParser.urlencoded())
app.use(cookieParser());

if (config.app.admin.cors) {
    app.use(function(req, res, next) {
        res.header('Access-Control-Allow-Origin', config.app.admin.cors);
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    })
}

/* Socket I/O
============================================================================= */

var io = sio.listen(server)
console.log('Admin server has started at port ' + config.app.admin.port)

/* Proxy
============================================================================= */

var proxies = {}

var ProxyObject = function(socket, proxy) {
    var self = this

    this.log = function(message) {
        var self = this
        var prefix = '(' + Object.keys(proxies).length + ')[' + self.id + ']'
        if (self.client) {
            prefix += '[' + self.client.remoteAddress + ':' + self.client.remotePort + '<-' + self.client.localAddress + ':' + self.client.localPort + ']'
        } else {
            prefix += '[null]'
        }
        if (self.socket) {
            prefix += '[' + self.socket.localAddress + ':' + self.socket.localPort + '<-' + self.socket.remoteAddress + ':' + self.socket.remotePort + ']'
        } else {
            prefix += '[null]'
        }
        console.log(prefix + '\n' + message)
    }
    this.destroy = function() {
        var self = this
        var client = self.client
        var events = {
            names: ['error', 'end', 'data'],
            close: function(socket) {
                this.names.forEach(function(evt) {
                    socket.on(evt, function() {})
                })
                socket.end()
            }
        }
        if ((self.client) && (self.client.remoteAddress)) {
            self.log('[POOL] Closing connection')
            events.close(self.client)
        }
        self.client = null
        if ((self.socket) && (self.socket.remoteAddress)) {
            self.log('[MINER] Closing connection')
            events.close(self.socket)
        }
        self.socket = null
        delete proxies[self.id]
        self.log('[PROXY] Closed, ' + Object.keys(proxies).length + ' active proxies')
    }

    this.onServerError = function(err) {
        var self = this
        self.log('[MINER] Error: ' + err.message)
        self.destroy()
    }
    this.onServerEnd = function(data) {
        var self = this
        self.log('[MINER] Disconnected')
        self.socket = null
        self.destroy()
    }
    this.onServerData = function(data) {
        var self = this
        if ((self.client) && (self.client.remoteAddress)) {
            self.log('Q: ' + data)
            self.client.write(data)
        } else {
            self.log('B: ' + data)
            self.buffer += data
        }
    }

    this.onPoolConnect = function(client) {
        var self = this
        self.log('[POOL] Connected')
        if (!self.client) {
            self.log('[POOL] Too late')
            client.end()
            return
        }
        if (self.buffer) {
            self.log('Q: ' + self.buffer)
            self.client.write(self.buffer)
            self.buffer = ''
        }
    }
    this.onPoolError = function(client, err) {
        var self = this
        self.log('[POOL] Error: ' + err.message)
        self.destroy()
    }
    this.onPoolEnd = function(client) {
        var self = this
        self.log('[POOL] Disconnected')
        self.client = null
        self.destroy()
    }
    this.onPoolData = function(client, data) {
        var self = this
        if (self.socket && self.socket.remoteAddress) {
            self.log('A: ' + data)
            self.socket.write(data)
        } else {
            self.log('I: ' + data)
        }
    }

    self.id = uuid.v4()
    self.socket = socket
    self.proxy = proxy
    self.buffer = ''

    proxies[self.id] = this

    self.socket.on('error', function(err) {
        self.onServerError(err)
    })
    self.socket.on('end', function() {
        self.onServerEnd()
    })
    self.socket.on('data', function(data) {
        self.onServerData(data)
    })

    self.log('[POOL] Connecting to ' + JSON.stringify(self.proxy.connect))
    var client = net.connect(self.proxy.connect, function() {
        self.client = client
        self.onPoolConnect(client)
    })
    client.on('error', function(err) {
        self.onPoolError(client, err)
    })
    client.on('end', function() {
        self.onPoolEnd(client)
    })
    client.on('data', function(data) {
        self.onPoolData(client, data)
    })
}

/* Common API functions
============================================================================= */

function makeSocketInfo(socket) {
    var result = null
    if (socket) {
        result = {
            local: {
                host: socket.localAddress,
                port: socket.localPort
            },
            remote: {
                host: socket.remoteAddress,
                port: socket.remotePort
            }
        }
    }
    return result
}

function makeProxesInfo() {
    var result = []
    for (var k in proxies) {
        if (proxies.hasOwnProperty(k)) {
            var proxy = proxies[k]
            var item = {
                id: proxy.id,
                type: "simple",
                miner: makeSocketInfo(proxy.socket),
                pool: makeSocketInfo(proxy.client)
            }
            result.push(item)
        }
    }
    return result
}

/* WebSocket API
============================================================================= */

io.of('/api').on('connection', function(from) {
    var socket = from
    console.log('[API] Connected')

    socket.on('disconnect', function() {
        console.log('[API] Disconnected')
    })

    socket.on('proxies', function(name, fn) {
        if (name == 'list') {
            console.log('[API] proxies.list')
            socket.emit('proxies', 'update', makeProxesInfo())
        }
    })
})

setInterval(function() {
    // Not implemented yet
}, 1000)

/* Http API
============================================================================= */

app.get('/proxies', function(request, response) {
    response.json(makeProxesInfo())
})

/* Admin interface
============================================================================= */

app.use('/static', express.static(__dirname + '/static'))
app.use(express.static(__dirname + '/public'))

/* Starting proxies
============================================================================= */

async.eachSeries(config.app.proxy, function(proxy, callback) {
    var server = net.createServer(function(socket) {
        var po = new ProxyObject(socket, proxy)
        server.on('error', function (err) {
            callback(err)
        })
    })
    server.listen(proxy.listen.port, function() {
        if (proxy.comment) {
            var comment = '(' + proxy.comment + ')'
        }
        console.log('Proxy server started at port ' + proxy.listen.port + ' for ' + proxy.connect.host + ':' + proxy.connect.port, comment || '')
        callback()
    })
}, function(err){
    if (err) {
        console.log('Failed to start a proxy:', err);
    } else {
        console.log('All proxies have been processed successfully');
    }
})
