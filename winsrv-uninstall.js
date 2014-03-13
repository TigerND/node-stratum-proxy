var Service = require('node-windows').Service;

// Create a new service object
var svc = new Service({
  name:'node-stratum-proxy',
  script: require('path').join(__dirname,'stratum-proxy.js')
});

// Listen for the "uninstall" event so we know when it's done.
svc.on('uninstall',function(){
  console.log('Uninstall complete.');
  console.log('The service exists: ',svc.exists);
});

// Uninstall the service.
svc.uninstall();