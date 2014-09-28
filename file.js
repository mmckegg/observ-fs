var Observ = require('observ')
var nodeFs = require('fs')
var nextTick = require('next-tick')

module.exports = ObservFile

function ObservFile(path, encoding, fs){

  if (encoding instanceof Object && !fs) return new ObservFile(path, null, encoding)

  if (arguments.length == 2 && encoding instanceof Object){
    fs = encoding
    encoding = null
  }

  var cache = fileCache[path]
  var startValue = cache ? cache.data : null

  var obs = Observ(startValue)

  obs._obsSet = obs.set
  obs.set = set
  obs.path = path
  obs.fs = fs || nodeFs
  obs.encoding = encoding || 'utf8'
  obs.refresh = refresh.bind(obs)
  obs.queueRefresh = queueRefresh.bind(obs)
  obs.delete = deleteFile.bind(obs)
  obs.close = close
  obs.delay = 200
  obs.ttl = 100
  obs._refreshing = false

  // initialize watch - and create file if doesn't exist on nextTick
  nextTick(function(){
    fs.stat(obs.path, function(err, stats){
      if (err){
        // using '\n' for empty files because blank values are not allowed in level-filesystem :(
        console.log(err, obs.path)
        fs.writeFile(obs.path, '\n', function(err){
          if (!err){
            obs.watcher = fs.watch(obs.path)
            obs.watcher.on('change', obs.queueRefresh)
          } else {
            throw err
          }
        })
      } else {
        if (stats.isFile()){
          obs.watcher = fs.watch(obs.path)
          obs.watcher.on('change', obs.queueRefresh)
          obs.refresh()
        } else {
          throw new Error('unknown file type')
        }
      }
    })
  })

  initCache(path, obs)
  return obs
}

function deleteFile(cb){
  var obs = this
  var cache = fileCache[obs.path]
  var fs = obs.fs
  var path = obs.path

  if (cache){
    var handlers = cache.openHandlers.slice()
    handlers.forEach(function(handler){
      handler._obsSet(null)
      handler.close()
    })
  }

  fs.unlink(path, cb)
}

function refresh(cb){
  var obs = this
  obs._refreshing = false
  clearTimeout(obs._refreshTimeout)
  readThruCache(obs.fs, obs.path, obs.encoding, obs.ttl, function(err, data){
    if (obs() !== data){
      obs._obsSet(data)
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

function set(data){
  var obs = this
  var fs = obs.fs
  var path = obs.path

  if (obs() !== data){

    updateCache(path, data)
    fs.writeFile(path, data, function(err){
      if (err) throw err
    })

    obs._obsSet(data)

    // immediately update all other open handlers (bypass watch)
    var cache = fileCache[path]
    if (cache){
      cache.openHandlers.forEach(function(handler){
        if (handler !== obs){
          handler.refresh()
        }
      })
    }

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

    // close watcher
    obs.watcher.close()
    obs.watcher = null

    // destroy
    obs.fs = null
    obs.path = null

  }

  if (typeof obs.onclose === 'function'){
    obs.onclose(this)
  }
}

var fileCache = {}
function readThruCache(fs, path, encoding, ttl, cb){
  var cache = fileCache[path]
  if (cache.at && Date.now() < (cache.at + ttl)){
    cb(null, cache.data)
    return cache.data
  } else {
    cache.pending.push(cb)
  }
 
  if (cache.pending.length && !cache.reading){
    cache.reading = true
    fs.readFile(path, encoding, function(err, data){
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
    callback(err, data)
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