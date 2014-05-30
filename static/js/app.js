
app = window.app = {}

app.socket = null

app.onProxiesList = function(proxies) {
	console.log('Proxies list')
	console.log(JSON.stringify(proxies))
	app.updateProxiesCount(Object.keys(proxies).length)
}

app.updateProxiesCount = function(count) {
	if (count == null) {
		$('#proxies-count').html('n/a')
	} else {
		$('#proxies-count').html(count)
	}
}

app.update = function()
{
	if ((app.socket) && (app.socket.socket.connected)) {		
		console.log('Updating')
		
		app.socket.emit('proxies', 'list', function(data) {
			app.onProxiesList(data)
		})
	}
	
	setInterval(function() {
		app.socket.emit('proxies', 'list')
	}, 7000)
}

app.start = function(origin) {

	var address = origin + '/api'
	console.log('Connecting to ' + address)
	app.socket = io.connect(address)
	
	app.socket.on('connect', function() {
		console.log('Connected')
		app.update()
	})
	app.socket.on('disconnect', function () {
		console.log('Disonnected')
		app.updateProxiesCount(null)
	})
	
	app.socket.on('proxies', function (name, data) {				
		if (name == 'update') {
			app.onProxiesList(data)			
		}
	})	
}
