var ObservDirectory = require('../directory')
var fs = require('fs')
var join = require('path').join
var test = require('tape')
var rimraf = require('rimraf')

var tmpdir = join(__dirname, 'tmp')
rimraf.sync(tmpdir)
fs.mkdirSync(tmpdir)

test(function(t){

  var observ = ObservDirectory(tmpdir, fs)

  var changes = []
  observ(function(value){
    changes.push(value)
  })

  fs.writeFile(join(tmpdir, 'test-1'), 'test 1')
  fs.writeFile(join(tmpdir, 'test-2'), 'test 2')
  fs.writeFile(join(tmpdir, 'test-3'), 'test 3')

  setTimeout(function(){
    fs.unlink(join(tmpdir, 'test-2'))
  }, 400)


  setTimeout(function(){
    t.deepEqual(changes.length, 3)
    t.deepEqual(changes[0], [])

    t.equal(changes[1].length, 3)
    t.equal(changes[1][0].fileName, 'test-1')
    t.equal(changes[1][1].fileName, 'test-2')
    t.equal(changes[1][2].fileName, 'test-3')

    t.equal(changes[2].length, 2)

    observ.close()
    t.end()
  }, 1000)

})

test('set', function(t){
  t.plan(1)

  var observ = ObservDirectory()

  observ(function(data){
    t.ok(data)
    observ.close()
  })

  setTimeout(function(){
    observ.set(tmpdir, fs)
  }, 100)

})

test('set without fs', function(t){
  t.plan(1)

  var observ = ObservDirectory()

  observ(function(data){
    t.ok(data)
    observ.close()
  })

  setTimeout(function(){
    observ.set(tmpdir)
  }, 100)

})