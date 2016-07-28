var Observ = require('observ')
var nodeFs = require('fs')
var nextTick = require('next-tick')
var Event = require('geval')
var getDirectory = require('path').dirname
var convertBuffer = require('buffer-to-uint8array')

module.exports = ObservFile

function ObservFile(path, encoding, fs, cb){

  // handle optional args
  if (typeof fs === 'function') return new ObservFile(path, encoding, null, encoding)
  if (typeof encoding === 'function') return new ObservFile(path, null, null, encoding)
  if (encoding instanceof Object && !fs) return new ObservFile(path, null, encoding, null)

  if (arguments.length == 2 && encoding instanceof Object){
    fs = encoding
    encoding = null
  }

  var cache = fileCache[path]
  var startValue = cache ? cache.data : null

  var obs = Observ(startValue)
  obs.onClose = Event(function(broadcast){
    obs._onClose = broadcast
  })

  obs._obsSet = obs.set
  obs.set = set
  obs.path = path
  obs.fs = fs || nodeFs
  obs.encoding = encoding || 'utf8'
  obs.refresh = refresh.bind(obs)
  obs.queueRefresh = queueRefresh.bind(obs)
  obs._handleDirectoryChange = handleDirectoryChange.bind(obs)
  obs.delete = deleteFile.bind(obs)
  obs.close = close.bind(obs)
  obs.delay = 200
  obs.ttl = 500
  obs._refreshing = false
  obs._init = false
  obs._initCb = cb

  obs._queue = []



  // initialize watch - and create file if doesn't exist on nextTick
  nextTick(function(){
    if (!obs._init){
      init(obs)
    }
  })

  initCache(path, obs)
  return obs
}

function init(obs){
  var cb = obs._initCb
  obs._initCb = null
  obs._init = true

  var fs = obs.fs
  fs.stat(obs.path, function (err, stats) {
    if (err) {
      // using '\n' for empty files because blank values are not allowed in level-filesystem :(
      fs.writeFile(obs.path, '\n', function (err) {
        if (!err) {
          if (fs.watch) {
            obs.watcher = fs.watch(obs.path)
            obs.watcher.on('change', obs.queueRefresh)
            obs.dirWatcher = fs.watch(getDirectory(obs.path))
            obs.dirWatcher.on('change', obs._handleDirectoryChange)
          }
        } else {
          throw err
        }

        cb && cb(null, obs)
      })
    } else {
      if (stats.isFile()) {
        if (fs.watch) {
          try {
            obs.watcher = fs.watch(obs.path) // this throws an error when the file isn't present!? (enoent)
          } catch (ex) {
            obs.watcher = null
          }
          if (obs.watcher) {
            obs.watcher.on('change', obs.queueRefresh)
            obs.dirWatcher = fs.watch(getDirectory(obs.path))
            obs.dirWatcher.on('change', obs._handleDirectoryChange)
          }
        }
        obs.refresh(cb)
      } else {
        cb && cb(null, obs)
      }
    }
  })
}

function deleteFile (cb) {
  var obs = this
  var cache = fileCache[obs.path]
  var fs = obs.fs
  var path = obs.path

  if (cache) {
    var handlers = cache.openHandlers.slice()
    handlers.forEach(function (handler) {
      handler._obsSet(null)
      handler.close()
    })
  }

  fs.unlink(path, cb)
}

function handleDirectoryChange () {
  var obs = this
  if (!obs._refreshing) {
    obs._refreshing = true
    obs._refreshTimeout = setTimeout(obs.refresh, obs.delay)
  }
}

function refresh(cb){
  var obs = this
  var fs = obs.fs

  obs._refreshing = false
  clearTimeout(obs._refreshTimeout)

  fs.stat(obs.path, function(err, stats){
    if (err || !stats.isFile()){
      obs.close()
    } else if (!obs._checkMtime || obs._mtime !== stats.mtime.getTime()){
      readThruCache(obs.fs, obs.path, obs.encoding, obs.ttl, function(err, data){
        if (err) return cb&&cb(err)
        if (obs() !== data){
          obs._obsSet(data)
        }
        cb&&cb(null, obs)
      })
      obs._mtime = stats.mtime.getTime()
      obs._checkMtime = true
      cb&&cb(null, obs)
    }
  })
}

function queueRefresh(){
  var obs = this
  obs._checkMtime = false
  if (!obs._refreshing){
    obs._refreshing = true
    obs._refreshTimeout = setTimeout(obs.refresh, obs.delay)
  }
}

function set(data, cb){
  var obs = this
  var path = obs.path

  if (obs() !== data){

    updateCache(path, data)

    if (!obs._init){
      obs._init = 'pre'
    }

    var id = Date.now()

    obs._obsSet(data)

    save(obs, cb)

  } else {
    cb&&cb(null)
  }
}

function flushQueue(obs){
  if (obs._queue.length){
    var cbs = obs._queue.slice()
    obs._queue.length = 0
    save(obs, function(){
      cbs.forEach(function(cb){
        typeof cb === 'function' && cb(null)
      })
    })
  }
}

function save(obs, cb){
  var fs = obs.fs
  var path = obs.path
  var cache = fileCache[path]

  if (cache && !cache.locked){
    cache.locked = true
    nextTick(function(){

      fs.writeFile(path, obs(), function(err){

        cache.locked = false

        if (err&&cb) return cb(err)
        if (err) throw err

        // handle write before initialize
        if (obs._init === 'pre'){
          init(obs)
        }

        cb&&cb(null)
        cache.openHandlers.forEach(flushQueue)
      })

    })
  } else {
    obs._queue.push(cb)
  }

  // immediately update all other open handlers (bypass watch)
  if (cache){
    cache.openHandlers.forEach(function(handler){
      if (handler !== obs){
        handler.refresh()
      }
    })
  }
}

function close(){
  var obs = this

  // clean up cache
  var cache = fileCache[obs.path]
  if (cache){
    var index = cache.openHandlers.indexOf(obs)
    if (~index){
      cache.openHandlers.splice(index, 1)
    }

    // delete cache if all references closed
    if (!cache.openHandlers.length){
      delete fileCache[obs.path]
    }
  }

  if (obs.watcher){
    obs.watcher.close()
    obs.watcher = null
  }

  if (obs.dirWatcher){
    obs.dirWatcher.close()
    obs.dirWatcher = null
  }

  obs._onClose(obs)
}

var fileCache = {}
function readThruCache(fs, path, encoding, ttl, cb){
  var cache = fileCache[path]
  if (!cache){
    return cb(null, null)
  }

  if (cache.at && Date.now() < (cache.at + ttl)){
    cb(null, cache.data)
    return cache.data
  } else {
    cache.pending.push(cb)
  }

  if (cache.pending.length && !cache.reading){
    cache.reading = true

    var useEncoding = encoding === 'arraybuffer' ?
      null : encoding

    fs.readFile(path, useEncoding, function(err, data){

      if (encoding === 'arraybuffer') {
        data = data instanceof Uint8Array ? data.buffer : convertBuffer(data).buffer
      }

      cache.data = data
      cache.reading = false
      cache.at = Date.now()

      while (cache.pending.length){
        var callback = cache.pending.pop()
        callback(err, data)
      }
    })
  }
}

function updateCache(path, data){
  var cache = fileCache[path]
  cache.data = data
  cache.at = Date.now()

  while (cache.pending.length){
    var callback = cache.pending.pop()
    callback(null, data)
  }
}

function initCache(path, handler){
  var cache = fileCache[path]
  if (cache){
    cache.openHandlers.push(handler)
  } else {
    fileCache[path] = {
      data: null,
      at: null,
      reading: false,
      pending: [],
      openHandlers: [handler]
    }
  }
}
