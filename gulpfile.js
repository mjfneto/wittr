// Dependências

var gulp = require('gulp');
/* Loads gulp plugins from package dependencies
 * and attaches them to an object of your choice.
 */
var plugins = require('gulp-load-plugins')();
/* Runs a sequence of gulp tasks in the specified order.
 * This function is designed to solve the situation where
 * you have defined run-order, but choose not to or cannot
 * use dependencies.
 */
var runSequence = require('run-sequence');
/*Similar to rimraf, but with a Promise API and support for
 * multiple files and globbing. It also protects you against
 * deleting the current working directory and above.
 */
var del = require('del');
/* The Lodash library exported as Node.js modules. */
var assign = require('lodash/object/assign');
/* Use a node-style require() to organize your
 * browser code and load modules installed by npm.
 * browserify will recursively analyze all the require()
 * calls in your app in order to build a bundle you can
 * serve up to the browser in a single <script> tag.
 */
var browserify = require('browserify');
/* Update any source file and your browserify
 * bundle will be recompiled on the spot.
 */
var watchify = require('watchify');
var babelify = require('babelify');
var hbsfy = require('hbsfy');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
/* Merge (interleave) a bunch of streams. */
var mergeStream = require('merge-stream');
var through = require('through2');

// Variáveis

var args = process.argv.slice(3);

var jsBundles = {
  'js/polyfills/promise.js': createBundle('./public/js/polyfills/promise.js'),
  'js/polyfills/url.js': createBundle('./public/js/polyfills/url.js'),
  'js/settings.js': createBundle('./public/js/settings/index.js'),
  'js/main.js': createBundle('./public/js/main/index.js'),
  'js/remote-executor.js': createBundle('./public/js/remote-executor/index.js'),
  'js/idb-test.js': createBundle('./public/js/idb-test/index.js'),
  'sw.js': createBundle(['./public/js/sw/index.js', './public/js/sw/preroll/index.js'])
};

// Funções

function createBundle(src) {
  if (!src.push) {
    src = [src];
  }

  var customOpts = {
    entries: src,
    debug: true
  };
  var opts = assign({}, watchify.args, customOpts);
  var b = watchify(browserify(opts));

  b.transform(babelify.configure({
    stage: 1
  }));

  b.transform(hbsfy);
  b.on('log', plugins.util.log);
  return b;
}

function bundle(b, outputPath) {
  var splitPath = outputPath.split('/');
  var outputFile = splitPath[splitPath.length - 1];
  var outputDir = splitPath.slice(0, -1).join('/');

  return b.bundle()
    // log errors if they happen
    .on('error', plugins.util.log.bind(plugins.util, 'Browserify Error'))
    .pipe(source(outputFile))
    // optional, remove if you don't need to buffer file contents
    .pipe(buffer())
    // optional, remove if you dont want sourcemaps
    .pipe(plugins.sourcemaps.init({loadMaps: true})) // loads map from browserify file
       // Add transformation tasks to the pipeline here.
    .pipe(plugins.sourcemaps.write('./')) // writes .map file
    .pipe(gulp.dest('build/public/' + outputDir));
}

// Tarefas

gulp.task('clean', function (done) {
  del(['build'], done);
});

gulp.task('copy', function () {
  return mergeStream(
    gulp.src('public/imgs/**/*').pipe(gulp.dest('build/public/imgs/')),
    gulp.src('public/avatars/**/*').pipe(gulp.dest('build/public/avatars/')),
    gulp.src('server/*.txt').pipe(gulp.dest('build/server/')),
    gulp.src('public/*.json').pipe(gulp.dest('build/public/'))
  );
});

gulp.task('css', function () {
  return gulp.src('public/scss/*.scss')
    .pipe(plugins.sass.sync().on('error', plugins.sass.logError))
    .pipe(plugins.sourcemaps.init())
    .pipe(plugins.sass({ outputStyle: 'compressed' }))
    .pipe(plugins.sourcemaps.write('./'))
    .pipe(gulp.dest('build/public/css/'));
});

gulp.task('js:browser', function () {
  return mergeStream.apply(null,
    Object.keys(jsBundles).map(function(key) {
      return bundle(jsBundles[key], key);
    })
  );
});

gulp.task('js:server', function () {
  return gulp.src('server/**/*.js')
    .pipe(plugins.sourcemaps.init())
    .pipe(plugins.babel({stage: 1}))
    .on('error', plugins.util.log.bind(plugins.util))
    .pipe(plugins.sourcemaps.write('.'))
    .pipe(gulp.dest('build/server'));
});

gulp.task('templates:server', function () {
  return gulp.src('templates/*.hbs')
    .pipe(plugins.handlebars())
    .on('error', plugins.util.log.bind(plugins.util))
    .pipe(through.obj(function(file, enc, callback) {
      // Don't want the whole lib
      file.defineModuleOptions.require = {Handlebars: 'handlebars/runtime'};
      callback(null, file);
    }))
    .pipe(plugins.defineModule('commonjs'))
    .pipe(plugins.rename(function(path) {
      path.extname = '.js';
    }))
    .pipe(gulp.dest('build/server/templates'));
});

gulp.task('watch', function () {
  gulp.watch(['public/scss/**/*.scss'], ['css']);
  gulp.watch(['templates/*.hbs'], ['templates:server']);
  gulp.watch(['server/**/*.js'], ['js:server']);
  gulp.watch(['public/imgs/**/*', 'public/avatars/**/*', 'server/*.txt', 'public/*.json'], ['copy']);

  Object.keys(jsBundles).forEach(function(key) {
    var b = jsBundles[key];
    b.on('update', function() {
      return bundle(b, key);
    });
  });
});

gulp.task('server', function() {
  plugins.developServer.listen({
    path: './index.js',
    cwd: './build/server',
    args: args
  });

  gulp.watch([
    'build/server/**/*.js'
  ], plugins.developServer.restart);
});

gulp.task('serve', function(callback) {
  runSequence('clean', ['css', 'js:browser', 'templates:server', 'js:server', 'copy'], ['server', 'watch'], callback);
});
