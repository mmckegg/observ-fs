var Observ = require('observ')
var map = require('map-async')
var join = require('path').join
var getBaseName = require('path').basename
var nodeFs = require('fs')
var deepEqual = require('deep-equal')

module.exports = ObservDirectory

function ObservDirectory(path, fs, cb){
  if (typeof fs == 'function') return new ObservDirectory(path, null, fs)
  if (arguments.length === 1 && path instanceof Object) return new ObservDirectory(null, fs, null)

  var obs = Observ(null)
  obs._obsSet = obs.set
  obs.fs = fs || nodeFs
  obs.queueRefresh = queueRefresh.bind(obs)
  obs.refresh = refresh.bind(obs)
  obs.path = path
  obs.set = set
  obs.close = close
  obs.delay = 100
  obs._refreshing = false

  if (obs.path && obs.fs){
    startWatching(obs)
    obs.refresh(cb)
  }

  return obs
}

function startWatching(obs){
  var fs = obs.fs
  fs.stat(obs.path, function(err, stats){
    if (stats.isDirectory()){
      obs.watcher = fs.watch(obs.path)
      obs.watcher.on('change', obs.queueRefresh)
    }
  })
}


function queueRefresh(){
  var obs = this
  if (!obs._refreshing){
    obs._refreshing = true
    obs._refreshTimeout = setTimeout(obs.refresh, obs.delay)
  }
}

function set(path, fs, cb){
  var obs = this
  if (path !== obs.path || fs !== obs.fs){
    
    obs.close()
    obs.path = path
    obs.fs = fs || obs.fs

    if (obs.path && obs.fs){
      startWatching(obs)
    }
    
    obs.refresh(cb)
  }
}

function close(){
  if (this.watcher){
    this.watcher.close()
    this.watcher = null
  }
}

function refresh(cb){
  var obs = this
  var fs = obs.fs
  var rootPath = obs.path

  obs._refreshing = false
  clearTimeout(obs._refreshTimeout)

  if (fs && rootPath){
    fs.readdir(rootPath, function(err, files){

      if (!files){
        obs._obsSet(null)
        obs.exists = false
        cb&&cb(null, obs)
      }

      map(files, function(file, i, next){
        var path = join(rootPath, file)
        fs.stat(path, function(err, stats){
          if (err) return next(err)
          if (stats.isDirectory()){
            next(null, {
              type: 'directory',
              fileName: getBaseName(path),
              path: path
            })
          } else if (stats.isFile()){
            next(null, {
              type: 'file',
              fileName: getBaseName(path),
              path: path,
              size: stats.size,
              modifiedDate: stats.mtime
            })
          } else {
            next(null, {
              type: 'other',
              fileName: getBaseName(path),
              path: path
            })
          }
        })
      }, function(err, res){
        if (err) return cb&&cb(err)
        if (!deepEqual(obs(), res)){
          obs._obsSet(res)
        }
        cb&&cb(null, obs)
      })
    })
  } else {
    obs._obsSet(null)
    obs.exists = false
    cb&&cb(null, obs)
  }
}