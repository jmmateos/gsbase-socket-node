/**
 * Module dependencies.
 */

 var py = require('./python')
	 // , script = py.createScript()
	 , iconv = require('iconv-lite')
	  , Emitter = require('events').EventEmitter;
	  
/**
 * Application prototype.
 */
module.exports = Parse;

function decimalToHex(d) {
  var hex = Number(d).toString(16);
  hex = "000000".substr(0, 6 - hex.length) + hex; 
  return hex;
};

function isError(data) {
	if (data.substr(1,6) == 'Error:' && data.indexOf('line:') != -1) 
		return true
	else	return false;
}

function Parse() {
  var self = this;
  this.i = 0;
  this.delimiter ='\x02'
};

Parse.prototype.__proto__ = Emitter.prototype;
 
Parse.prototype.Logon = function (EmGes,Usu,Pwd,Apli,Emp,PwApli,PwEmp) {
	var Cadena = "p_logon"+this.delimiter+EmGes+","+Usu+","+Pwd+","+Apli+","+Emp+","+PwApli+","+PwEmp;
	var len=Cadena.length;
	Cadena = decimalToHex(len) + Cadena;
	return Cadena;
};

Parse.prototype.ResLogon = function (data, callback) {
	var tamano = data.substr(0,6);
	tamano = parseInt(tamano,16);
	var datos = data.substr(6,tamano);
	if (datos.search("Ok") < 0 ) {
		var datos = datos.substr(1);
		if (callback && typeof callback == 'function') callback(datos);
		else return datos;
	} else {
		if (callback && typeof callback == 'function') callback(null);
		else return null;
	}
};

Parse.prototype.Run = function (Accion, Ventana, Parametros) {
	var Cadena = Accion + "|" + Ventana + this.delimiter + Parametros;
	var len =Cadena.length;
	Cadena = decimalToHex(len) + Cadena;
	return Cadena;
};

Parse.prototype.SizeRes = function (data) {
	var tamano = data.substr(0,6);
	tamano = parseInt(tamano,16);
	return tamano;
}

Parse.prototype.ResRun = function (data,callback) {
	var self=this
	if (isError(data)) {
		if (typeof callback === 'function')
			callback(data.substr(1,data.length-1))
		else
			self.emit('error',data.substr(1,data.length-1));
	}
	var datos = data.substr(0,data.length-1);
	try {
		datosjson = JSON.parse(datos);
		//console.log("JSON.PARSE |"+datos+"|"+datosjson+"|");
		if (typeof callback === 'function')
			callback(null,datosjson);
		else
			self.emit('data',datosjson);
	} catch (e) {
	  if (e instanceof SyntaxError) {
			var script = py.createScript();
			//console.log("JSON ERROR ", e.name , e.message);
			script
			  .write('#!/usr/bin/python')
			  .write('# -*- coding: utf-8 -*-')
			  .write('import json')
			  .write('print(json.dumps(' + datos +',False,False))')
			  .once('data', function(data) {
			  		//console.log("PYTHON PARSE");
			  		try {
			  			var datosjson = JSON.parse(data);
						if (typeof callback === 'function')
							callback(null,datosjson);
						else
							self.emit('data',datosjson);
					} catch (e) {
						//console.log("PYTHON ERROR ", e.name , e.message);
						if (typeof callback === 'function')
							callback(e)
						else
							self.emit('error',e);
					}
			  })
			  .once('error', function(err) {
				console.log(err);
				if (typeof callback === 'function')
					callback(new Error(err  ))
				else
					self.emit('error',err);
			  })
			  .exec();	
	  } else {
		if (typeof callback === 'function')
			callback(e)
		else
			self.emit('error',e);
	  }
	}
	return this;
};