
var path = require('path')

var config = require('konfig')({ path: path.join(__dirname, 'config') })

var express = require('express'),
	jade = require('jade'),
	net = require('net'),
	url = require('url'),
	uuid = require('uuid')

var app = express();

var proxies = {}

var ProxyObject = function(socket, proxy) {
	var self = this
	
	this.log = function(message) {
		var self = this
		var prefix = '(' + Object.keys(proxies).length + ')[' + self.id + ']['
		if (self.client) {
			prefix += self.client.remoteAddress + ':' + self.client.remotePort + '<-'
		}
		prefix += self.socket.localAddress + ':' + self.socket.localPort + '<-' + self.socket.remoteAddress + ':' + self.socket.remotePort + ']'
		console.log(prefix + '\n' + message)
	}
	this.destroy = function() {
		var client = self.client
		if (client) {
			self.client = null
			self.log('Closing pool connection')
			client.end()
		}
		if (self.socket.address()) {
			self.log('Closing client connection')
			self.socket.end()
		}
		delete proxies[self.id]
		self.log('Proxy closed')
	}

	this.onServerError = function(err) {
		var self = this
		self.log('Client Error: ' + err.message)
		self.destroy()
	}
	this.onServerData = function(data) {
		var self = this
		if (self.client && self.connected) {
			self.log('Q: ' + data)
			self.client.write(data)
		} else {
			self.log('B: ' + data)
			self.buffer += data
		}
	}
	this.onServerEnd = function(data) {
		var self = this
		self.log('Client disconnected')
		self.destroy()
	}

	this.onPoolConnect = function(client) {
		var self = this
		self.log('Connected to the pool')
		if (!self.client) {
			self.log('Too late')
			client.end()
			return
		}
		self.connected = true
		if (self.buffer) {
			self.log('Q: ' + self.buffer)
			self.client.write(self.buffer)
			self.buffer = ''
		}			
	}
	this.onPoolData = function(client, data) {
		var self = this
		self.log('A: ' + data)
		self.socket.write(data)
	}
	this.onPoolError = function(client, err) {
		var self = this
		self.log('Pool Error: ' + err.message)
	}
	this.onPoolEnd = function(client) {
		var self = this
		self.log('Disconnected from pool')
		self.destroy()
	}

	self.id = uuid.v4()
	self.socket = socket
	self.proxy = proxy
	self.buffer = ''

	proxies[self.id] = this

	self.socket.on('error', function(err) {
		self.onServerError(err)
	})
	self.socket.on('data', function(data){
		self.onServerData(data)
	})
	self.socket.on('end', function() {
		self.onServerEnd()
	})

	self.log('Connecting to ' + JSON.stringify(self.proxy.connect))
	self.connected = false
	var client = net.connect(self.proxy.connect, function() {
		self.client = client
		self.onPoolConnect(client)
	})
	client.on('error', function(err) {
		self.onPoolError(client, err)
	})
	client.on('data', function(data) {
		self.onPoolData(client, data)
	})
	client.on('end', function() {
		self.onPoolEnd(client)
	})
}

app.get('/', function(request, response) {
	response.render(path.join(__dirname, 'templates/index.jade'), {
		"connections": Object.keys(proxies).length
	})
})

var servers = new Array()
config.app.proxy.forEach(function(proxy) {
	var server = net.createServer(function(socket) {
		var po = new ProxyObject(socket, proxy)
	})
	server.listen(proxy.listen.port, function() {
		console.log('Proxy server started at port ' + proxy.listen.port)
	})
})

app.listen(config.app.admin.port);
console.log('Admin server has started at port ' + config.app.admin.port);

