/**
 * Module dependencies.
 */
var net = require('net')
  , Emitter = require('events').EventEmitter
  , Parser = require('./parse')
  , iconv = require('iconv-lite')
  , fs = require('fs');

/**
 * Application prototype.
 */


module.exports = gsbaseSocket;


function replaceAnsi(text) {
  return text.replace(/\\x[0-9A-Fa-f]{2}/g, function (match) {
	return iconv.fromEncoding(new Buffer(match.replace('\\x',''),'hex'),'iso-8859-1');
  }).replace(/\\n/g, '');
}


function gsbaseSocket() {
  var self = this;
  var sock = this.sock = new net.Socket;
  sock.setEncoding('utf8');
  this.retryTimeout = this.retry = 100;
  this.retryMaxTimeout = 2000;
  this.parser = new Parser;
  this.parser.on('data',function (data) {self.emit('data',data)})
			.on('error', function(err) {self.emit('error',err)});
  this.Buffer = '';
  this.TamResp = 0;
  this.PdteEnvio=false;
  this.taskRun= [];
  this.taskRunning = {};
  
  this.Ejecutar = function() {
	if (self.taskRun.length == 0) return false;
	self.PdteEnvio=true;
	var task=self.taskRun.pop()
	self.taskRunning = task
	var res= self.sock.write(task.task);
  }  

  sock.on('error', function(err){
	if ('ECONNREFUSED' != err.code) {
	  self.emit('error', err);
	} else {
		self.emit('error', err);
	}
  });

  sock.on('data', function(chunk){
	var str = chunk;
	if (self.task == 'connect') {
		self.emit('connect',str);
	} else if (self.task == 'logon') {
		self.parser.ResLogon(str, 
			function (err) {
				if (err)  {
					self.close();
					self.emit('error',err);
					
				} else self.emit('logon');});
	} else if (self.task == 'run') {
		TruncaRespuesta(str);
	}
  });

  function TruncaRespuesta (data) {
		if (self.Buffer == '') {
			//console.log('buffer vacío')
			self.TamResp = self.parser.SizeRes(data);
			//console.log('tamano: %d', self.TamResp);
			data = data.substr(6)
		}
		var resto = self.TamResp-self.Buffer.length;
		self.Buffer += data.substr(0,self.TamResp-self.Buffer.length);
		var restostr=data.substr(resto)
		//console.log('Buff size:%d RestoSTR:%s ... %s',self.Buffer.length,restostr.substr(0,20),restostr.substr(restostr.length-20,20))
		if (self.Buffer.length >= self.TamResp) {
		  self.parser.ResRun(replaceAnsi(self.Buffer),self.taskRunning.callback);
		  //console.log('Buffer:%s ... %s',self.Buffer.substr(0,20),self.Buffer.substr(self.Buffer.length-20,20))
		  self.Buffer = '';
		  self.PdteEnvio=false;
		  self.Ejecutar();
		} 
		if (restostr.length > 0) TruncaRespuesta(data.substr(resto));
  }


  sock.on('end', function() {
	self.connected = false;
	console.log('socket destruido.')
	if (self.closing) return self.emit('close');
  
  });
  
  sock.on('close', function(had_error){
	self.connected = false;
	if (had_error) return self.emit('error','cerrando');
	if (self.closing) {
		return self.emit('close');	
	} else {
		setTimeout(function(){
			self.emit('reconnect attempt');
			sock.destroy();
			self.Connect(self.host,self.port);
			self.retry = Math.min(self.retryMaxTimeout, self.retry * 1.5);
		}, self.retry);
	}
  });

  sock.on('connect', function(){
	self.connected = true;
	self.retry = self.retryTimeout;
	self.task = 'connect';
  });
  
}

gsbaseSocket.prototype.__proto__ = Emitter.prototype;


gsbaseSocket.prototype.Connect = function(host,port){
	port = typeof port !== 'undefined' ? port:8121;
	if (this.connected) {
		console.log('server actually connected.'); 
		this.emit('logon');
	} else {
		this.type = 'client';
		this.port = port;
		this.host = host;
		this.sock.connect(port, host);
	}
	return this;
};

gsbaseSocket.prototype.Logon = function (EmGes,Usu,Pwd,Apli,Emp,PwApli,PwEmp,Ventana) {
	this.EmGes = EmGes;
	this.Usu = Usu;
	this.Pwd = Pwd;
	this.Apli = Apli;
	this.Emp = Emp;
	this.PwApli = typeof PwApli !== 'undefined' ? PwApli:''; 
	this.PwEmp =  typeof PwEmp !== 'undefined' ? PwEmp:''; 
	this.Ventana = typeof Ventana !== 'undefined' ? Ventana:''; 
	this.task = 'logon';
	this.sock.write(iconv.toEncoding(this.parser.Logon(this.EmGes,this.Usu,this.Pwd,this.Apli,this.Emp,this.PwApli,this.PwEmp),'iso-8859-1'));
	return this;
};

gsbaseSocket.prototype.Run = function (Accion, Param, Ventana,callback) {
	callback = typeof Ventana === 'function' ? Ventana:callback;
	Ventana = typeof Ventana !== 'undefined' && typeof Ventana !== 'function' ? Ventana:this.Ventana; 
	
	if (!Ventana) throw new Error('Ventana de ejecución necesaria.');
	var newTask = {}
	newTask.task=iconv.toEncoding(this.parser.Run(Accion, Ventana, Param),'iso-8859-1')
	newTask.callback=callback
	this.task = 'run';
	this.taskRun.unshift(newTask);
	if (!this.PdteEnvio) {
		this.Ejecutar ();
	}
	return this;
};



gsbaseSocket.prototype.close = function(){
	if (this.taskRun.length === 0) {
		console.log('Cerrando...');
		this.closing = true;
		this.sock.destroy();
	} else {
		console.log('Cierre anulado, tareas pendientes...');
	}
  return this;
};


