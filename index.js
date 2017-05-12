'use strict';

var twig = require('rbc-twig-compiler').twig;
var through = require('through2');
var path = require('path');

var config = {
    extensions: ['.twig', '.html'],
    relativePath: false,
    allowInlineIncludes: true,
    autoescape: false,
    replacePaths: null //{'/app': '@app', '/common': '@common'}
};


/**
 * Random alpha-numeric string
 * @returns {String}
 */
function randomString() {
    var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var length = 32;
    var result = '';
    var time = '' + Date.now();

    for (var i = length; i > 0; --i) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }

    result += time.substring(time.length - 5);

    return result;
}

/**
 * Takes a set of user-supplied options, and determines which set of file-
 * extensions to run twigify on.
 * @param   {object | array}    options
 * @param   {object}            options.extensions
 * @returns {Array}
 */
function getExtensions(options) {
    var extensions = config.extensions;

    if (options) {
        if (Object.prototype.toString.call(options) === '[object Array]') {
            extensions = options;
        } else if (options.extensions) {
            extensions = options.extensions;
        }
    }

    // Lowercase all file extensions for case-insensitive matching.
    extensions = extensions.map(function(ext) {
        return ext.toLowerCase();
    });

    return extensions;
}

/**
 * Returns whether the filename ends in a Twigifiable extension. Case
 * insensitive.
 * @param   {string} filename
 * @return  {boolean}
 */
function hasTwigifiableExtension(filename, extensions) {
    var file_extension = path.extname(filename).toLowerCase();
    return extensions.indexOf(file_extension) > -1;
}

/**
 * Compile twig template
 */
function compile(id, tplString) {
    var template = twig({
        id: randomString(),
        data: tplString
    });

    var tokens = JSON.stringify(template.tokens);

    if (config.relativePath) {
        return 'Twig.twig({ id: __filename, path: __dirname, data:' + tokens + ', precompiled: true, allowInlineIncludes: ' + config.allowInlineIncludes + ', autoescape: ' + config.autoescape + ' })';
    } else {
        if (config.replacePaths) {
            //console.log('origin: ' + id);
            for (var search in config.replacePaths) {
                var pos = id.lastIndexOf(search);
                if (pos > -1) {
                    id = id.substring(pos);
                    id = id.replace(search, config.replacePaths[search]);
                    //console.log('new : ' + id);
                    break;
                }
            }
        }

        // the id will be the filename to the require()ing module
        return 'Twig.twig({ id: "' + id + '", data:' + tokens + ', precompiled: true, allowInlineIncludes: ' + config.allowInlineIncludes + ', autoescape: ' + config.autoescape + ' })';
    }
}

/**
 * Wrap as module
 */
function process(source) {
    return ('\nmodule.exports = ' + source + ';');
}


/**
 * Exposes the Browserify transform function.
 * This handles two use cases:
 * - Factory: given no arguments or options as first argument it returns
 *   the transform function
 * - Standard: given file (and optionally options) as arguments a stream is
 *   returned. This follows the standard pattern for browserify transformers.
 * @param   {string} file
 * @param   {object} params
 * @returns {stream | function} depending on if first argument is string.
 */
module.exports = function (file, params) {
    /*
     {Array} params.extensions - массив расширений
     */

    /**
     * The function Browserify will use to transform the input.
     * @param {String} file
     * @param {Object} [params]
     * @returns {Stream}
     */
    function twigifyTransform(file) {
        if (!params) {
            params = {};
        }

        var ext = getExtensions(params.extensions);
        if (!hasTwigifiableExtension(file, ext)) {
            return through();
        }

        if (params.relativePath != undefined) {
            config.relativePath = !!params.relativePath;
        }

        if (params.allowInlineIncludes != undefined) {
            config.allowInlineIncludes = !!params.allowInlineIncludes;
        }

        if (params.autoescape != undefined) {
            config.autoescape = !!params.autoescape;
        }

        if (typeof params.replacePaths == 'object') {
            config.replacePaths = params.replacePaths;
        }

        var buffers = [];

        function push(chunk, enc, next) {
            buffers.push(chunk);
            next();
        }

        function end(next) {
            var tplString = Buffer.concat(buffers).toString();
            var compiledTwig;

            try {
                compiledTwig = compile(file, tplString);
            } catch (e) {
                console.log('Twig compile error: ' + e.message);
            }

            this.push(process(compiledTwig));
            next();
        }

        return through(push, end);
    }

    if (typeof file !== 'string') {
        // Factory: return a function.
        // Set options variable here so it is ready for when browserifyTransform
        // is called. Note: first argument is the options.
        params = file;
        return twigifyTransform;
    } else {
        return twigifyTransform(file);
    }
};
