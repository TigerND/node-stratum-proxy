var Service = require('node-windows').Service;

// Create a new service object
var svc = new Service({
  name:'cgminer2http',
  description: 'Simple CGMiner/BFGMiner API to HTTP proxy.',
  script: require('path').join(__dirname,'cgminer2http.js'),
  env:{
    name: "NODE_ENV",
    value: "production"
  }
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install',function(){
  svc.start();
});

// Just in case this file is run twice.
svc.on('alreadyinstalled',function(){
  console.log('This service is already installed.');
});

// Listen for the "start" event and let us know when the
// process has actually started working.
svc.on('start',function(){
  console.log(svc.name+' started!');
});

// Install the script as a service.
svc.install();