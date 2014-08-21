/* -*- coding: utf-8 -*-
============================================================================= */
/*jshint asi: true*/

var path = require('path')

var pkg = require(path.join(path.dirname(__dirname), 'package.json'))

var opts = {
    name: 'nw-' + pkg.name,
    script: path.join(path.dirname(__dirname), pkg.main),
    description: pkg.description
}

var Service = require('node-windows').Service

// Create a new service object
var svc = new Service({
    name: opts.name,
    script: opts.script
});

// Listen for the "uninstall" event so we know when it's done.
svc.on('uninstall', function() {
    console.log('Uninstall complete.')
    //console.log('The service exists: ', svc.exists)
});

// Uninstall the service.
console.log('Removing', opts.script)
svc.uninstall()
