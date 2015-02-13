var ObservFile = require('../file')
var fs = require('fs')
var join = require('path').join
var test = require('tape')
var rimraf = require('rimraf')

var tmpdir = join(__dirname, 'tmp')
rimraf.sync(tmpdir)
fs.mkdirSync(tmpdir)

test(function(t){
  var path = join(__dirname, 'tmp', 'test.txt')
  var observ1 = ObservFile(path, fs)
  observ1.ttl = 100 // allow write hijack

  var observ2 = null

  var changes1 = []
  var changes2 = []

  t.equal(observ1(), null)

  observ1(function(value){
    changes1.push(value)
  })

  observ1.set('initial value')

  setTimeout(function(){
    observ2 = ObservFile(path, fs)
    observ2.ttl = 100 // allow write hijack

    t.equal(observ2(), 'initial value')

    observ2(function(value){
      changes2.push(value)
    })
  }, 150)


  setTimeout(function(){
    observ1.set('new value')
  }, 300)

  setTimeout(function(){
    fs.writeFile(path, 'hijacked value')
  }, 550) //TODO: these delays shouldn't have to be so high 

  setTimeout(function(){
    observ1.delete()
  }, 900)

  setTimeout(function(){
    t.deepEqual(changes1, [ 'initial value', 'new value', 'hijacked value', null ])
    t.deepEqual(changes2, [ 'new value', 'hijacked value', null ])
    t.end()
  }, 1100)
})

