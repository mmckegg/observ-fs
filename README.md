observ-fs
===

Create observable file system scopes using [observ/unidirectional](http://github.com/raynos/observ) pattern.

## Install via [npm](https://npmjs.org/package/observ-fs)

```bash
$ npm install observ-fs
```

## Directory API 

```js
var ObservDirectory = require('observ-fs/directory')
```

### `var directory = ObservDirectory([path, fs, cb])`

Create a directory observer. All arguments are optional. The directory will not be created if it doesn't exist, instead `null' will be emitted as value.

### `directory(function(data){ })`

Emits a list of all files and sub-directories in `path` whenever any child changes.

### `directory.set(path[, fs, cb])`

Change the target of the directory observer. `cb` called after refresh.

### `directory.refresh(cb)`

Reload children and emit result (also calls `cb` with `directory` instance on load).

### `directory.close()`

Stop watching.

### `var removeListener = directory.onClose(callback)`

Get notified by `callback` when the directory is closed.

### `directory.exists` (getter)

## File API 

```js
var ObservFile = require('observ-fs/file')
```

### `var file = ObservFile(path[, encoding="utf8", fs, cb])`

Create a file observer. Unlike `ObservDirectory`, the path cannot be changed later but the file will be created if it doesn't exist.

### `file(function(data){ })`

Any changes made to the file will be emitted.

### `file.set(data[, cb])`

Update the file with `data` specified.

### `file.refresh(cb)`

Reload the file from disk and emit the data.

### `file.delete(cb)`

Delete the file stored on disk and close all other watchers.

### `file.close()`

Close the watcher.

### `var removeListener = file.onClose(callback)`

Get notified by `callback` when the file is closed.
