
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
		console.log('(' + Object.keys(proxies).length + ')[' + socket.localAddress + ':' + socket.localPort + '<-' + socket.remoteAddress + ':' + socket.remotePort + '] ' + message)
	}
	this.destroy = function() {
		var client = self.client
		if (client) {
			self.client = null
			self.log('Closing pool connection')
			client.end()
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
		self.log('Q: ' + data)
		if (self.client && self.connected) {
			self.client.write(data)
		} else {
			self.buffer += data
		}
	}
	this.onServerEnd = function(data) {
		var self = this
		self.log('Client disconnected')
		self.destroy()
	}

	this.onPoolConnect = function() {
		var self = this
		self.log('Connected to the pool')
		self.connected = true
		if (self.buffer) {
			self.client.write(self.buffer)
			self.buffer = ''
		}			
	}
	this.onPoolData = function(data) {
		var self = this
		self.log('A: ' + data)
		self.socket.write(data)
	}
	this.onPoolError = function(err) {
		var self = this
		self.log('Pool Error: ' + err.message)
	}
	this.onPoolEnd = function() {
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
	self.client = net.connect(self.proxy.connect, function() {
		self.onPoolConnect()
	})
	self.client.on('error', function(err) {
		self.onPoolError(err)
	})
	self.client.on('data', function(data) {
		self.onPoolData(data)
	})
	self.client.on('end', function() {
		self.onPoolEnd()
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

