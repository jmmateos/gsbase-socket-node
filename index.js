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

function checkConnectionOptions (CxOptions) {
	if (!CxOptions.host) throw new Error("Connection Options: host is required");
	if (!CxOptions.port) CxOptions.port =8121;
	return CxOptions;
}

function checkLogonOptions (LgOptions) {
	if (!LgOptions.EmGes) throw new Error("Logon Options: Gestora is required");
	if (!LgOptions.Usu) throw new Error("Logon Options: User is required");
	if (!LgOptions.Pwd) throw new Error("Logon Options: Pasword is required");
	if (!LgOptions.Apli) throw new Error("Logon Options: Aplicacion is required");
	if (!LgOptions.Emp) throw new Error("Logon Options: Empresa is required");
	if (!LgOptions.PwApli) LgOptions.PwApli ='';
	if (!LgOptions.PwEmp) LgOptions.PwEmp ='';
	if (!LgOptions.Ventana) LgOptions.Ventana ='';
	return LgOptions;
}

function gsbaseSocket(ConnectionOptions, LogonOptions) {
  var self = this;
  var sock = this.sock = new net.Socket;
  sock.setEncoding('utf8');
  this.retryTimeout = this.retry = 100;
  this.retryMaxTimeout = 2000;
  this.CxOptions = checkConnectionOptions(ConnectionOptions);
  this.LgOptions = checkLogonOptions(LogonOptions);
  this.parser = new Parser;
  this.parser.on('data',function (data) {self.emit('data',data)})
			.on('error', function(err) {self.emit('error',err)});
  this.Buffer = '';
  this.TamResp = 0;
  this.PdteEnvio=false;
  this.connected = false;
  this.connecting = false;
  this.taskRun= [];
  this.taskRunning = {};
  
  this.Ejecutar = function() {
	if (self.taskRun.length == 0) {
		self.close();
	} else {
		self.task = 'run';
		self.PdteEnvio=true;
		var task=self.taskRun.pop()
		self.taskRunning = task
		var res= self.sock.write(task.task);
	}
  } ;

  this.close = function () {
	console.log('Cerrando...');
	self.closing = true;
	self.sock.destroy();
  };

	this.Connect = function (){
		if (self.connected) {
			console.log('server actually connected.'); 
		} else if (self.connecting) {
			console.log('server is connecting.');
		} else {
			console.log('conectar'); 
			self.connecting = true;
			self.type = 'client';
			self.sock.connect(this.CxOptions.port, this.CxOptions.host);
		}
	};

	this.Logon = function () {
		self.task = 'logon';
		self.sock.write(iconv.toEncoding(
			this.parser.Logon(
				this.LgOptions.EmGes,
				this.LgOptions.Usu,
				this.LgOptions.Pwd,
				this.LgOptions.Apli,
				this.LgOptions.Emp,
				this.LgOptions.PwApli,
				this.LgOptions.PwEmp),
			'iso-8859-1'));
	};


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
		self.emit('connect',str.substr(0,str.length-2));
		self.Logon();
	} else if (self.task == 'logon') {
		self.connecting = false;
		self.parser.ResLogon(str, 
			function (err) {
				if (err)  {
					self.close();
					self.emit('error',err);
					
				} else {
					self.emit('logon');
					self.Ejecutar();
				}
			});
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
	if (had_error) return self.emit('error','cerrando por error en la conexión.');
	if (self.closing) {
		return self.emit('close');	
	} else {
		setTimeout(function(){
			self.emit('reconnect attempt');
			sock.destroy();
			self.Connect();
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



gsbaseSocket.prototype.Run = function (Accion, Param, Ventana,callback) {
	callback = typeof Ventana === 'function' ? Ventana:callback;
	Ventana = typeof Ventana !== 'undefined' && typeof Ventana !== 'function' ? Ventana:this.LgOptions.Ventana; 
	
	if (!Ventana) throw new Error('Ventana de ejecución necesaria.');
	var newTask = {}
	newTask.task=iconv.toEncoding(this.parser.Run(Accion, Ventana, Param),'iso-8859-1')
	newTask.callback=callback
	this.taskRun.unshift(newTask);
	this.Connect();

	return this;
};



