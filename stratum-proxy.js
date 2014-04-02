
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
		if (self.socket) {
			prefix += self.socket.localAddress + ':' + self.socket.localPort + '<-' + self.socket.remoteAddress + ':' + self.socket.remotePort + ']'
		} else {
			prefix += 'null]'
		}
		console.log(prefix + '\n' + message)
	}
	this.destroy = function() {
		if (self.id) {
			var client = self.client		
			if ((client) && (client.remoteAddress)) {
				self.log('Closing pool connection')
				client.end()
			}
			if ((self.socket) && (self.socket.remoteAddress)) {
				self.log('Closing client connection')
				self.socket.end()
			}
			self.log('Proxy closed')			
			delete proxies[self.id]
			self.id = null
		}
	}

	this.onServerError = function(err) {
		var self = this
		self.log('Client Error: ' + err.message)
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
	this.onServerEnd = function(data) {
		var self = this
		self.log('Client disconnected')
		self.socket = null
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
		if (self.buffer) {
			self.log('Q: ' + self.buffer)
			self.client.write(self.buffer)
			self.buffer = ''
		}			
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
	this.onPoolError = function(client, err) {
		var self = this
		self.log('Pool Error: ' + err.message)
	}
	this.onPoolEnd = function(client) {
		var self = this
		self.log('Disconnected from pool')
		self.client = null
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
		console.log('Proxy server started at port ' + proxy.listen.port + ' for ' + proxy.connect.host + ':' + proxy.connect.port)
	})
})

app.listen(config.app.admin.port);
console.log('Admin server has started at port ' + config.app.admin.port);

