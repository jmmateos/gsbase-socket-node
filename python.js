var spawn = require('child_process').spawn
  , fs = require('fs')
  , Stream = require('stream').Stream
  , os = require('os')
;

exports.createScript = function () {
  var mod = new Stream;
  mod.buf = '';
  
  mod.write = function (src) {
    this.buf = this.buf + src + '\n';
    return this;
  };

  mod.exec = function () {
	var self = this;
	var ficpy = os.tmpDir() + '/src' + Math.floor((Math.random()*100)+1) + '.py';
	this.ficpy = ficpy;
    fs.writeFileSync(ficpy, this.buf,'utf8');

    // reset
    this.buf = '';
	this.bufout = '';
    var py = exports.py = spawn('python', [ficpy]);

    py.stdout.on('data', function (data) {
      self.bufout += data;
    });
	
	py.stderr.on('data', function (data) {
      mod.emit('error', data.toString());
    });
	
	py.on('exit', function(code) {
		fs.unlink(self.ficpy);
		if (code == 0) mod.emit('data', self.bufout);
	});
    
    return this;
  }
  
  return mod;
}


