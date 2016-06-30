/**
 * fis.baidu.com
 */
var fs = require('fs');
var request = require('request');
var _ = fis.util;
var archiver = require('archiver')

function upload(receiver, to, release, content, file, callback) {
    var subpath = file.subpath;
    fis.util.upload(
        //url, request options, post data, file
        receiver, null, {
            to: encodeURIComponent(to + release)
        }, content, encodeURIComponent(subpath),
        function(err, res) {
            if (err || res.trim() != '0') {
                callback('upload file [' + subpath + '] to [' + to +
                    '] by receiver [' + receiver + '] error [' + (err || res) + ']');
            } else {
                var time = '[' + fis.log.now(true) + ']';
                process.stdout.write(
                    ' - '.green.bold +
                    time.grey + ' ' +
                    subpath.replace(/^\//, '') +
                    ' >> '.yellow.bold +
                    to + release +
                    '\n'
                );
                callback();
            }
        }
    );
}

function normalizePath(to, root) {
    var cwd = process.cwd();
    if (!to) {
        to = '/';
    } else if (to[0] === '.') {
        to = fis.util(cwd + '/' + to);
    } else if (/^output\b/.test(to)) {
        to = fis.util(root + '/' + to);
    } else {
        to = fis.util(to);
    }
    return to;
}

module.exports = function(options, modified, total, callback) {
    if (!options.to) {
        throw new Error('options.to is required!');
    } else if (!options.receiver) {
        throw new Error('options.receiver is required!');
    }

    var to = options.to,
        type = options.type,
        reTryCount = options.retry,
        ignoreExt = options.ignoreExt,
        zipFile = options.file || "publish/publish.zip";
    var receiver = options.receiver;

    if(receiver === 'http://wapstatic.kf0309.3g.qq.com/receiver/receiver2.php'){
        fis.log.warn(receiver + "即将过期，请使用\n" + "http://wapstatic.kf0309.3g.qq.com/deploy");
    }

    var steps = [];

    var realModified = modified.filter(function(file) {
        return !file._fromCache;
    });
    if (!realModified.length) {
        return fis.log.info('nothing need to upload!');
    }

    if (type === "zip") {
        var archive = archiver('zip');
        var targetPath = normalizePath(zipFile, fis.project.getProjectPath());
        if (!fis.util.exists(targetPath)) {
            fis.util.mkdir(fis.util.pathinfo(targetPath).dirname);
        }
        var output = fs.createWriteStream(targetPath);
        output.on('close', function() {
            fis.log.debug('\nzip end!');
            process.stdout.write("\nUpload start!\n");
            var path = fis.project.getProjectPath() + "/" + zipFile;
            var formData = {
                to: to,
                type: type,
                file: fs.createReadStream(path)
            };
            request.post({url:receiver, formData: formData}, function optionalCallback(err, httpResponse, body) {
              if (err) {
                return console.error('upload failed:', err);
              }
              fs.unlink(path);
              process.stdout.write("Upload successful!");
            });
        });

        archive.pipe(output);

        modified.forEach(function(file) {
            if(ignoreExt.indexOf(file.ext) != -1){
                return;
            }
            if (!file.release) {
                fis.log.error('unable to get release path of file[' + file.realpath + ']: Maybe this file is neither in current project or releasable');
            }
            archive.append(file.getContent(), {
                name: file.getHashRelease()
            });
        });

        archive.finalize();

    } else {
        modified.forEach(function(file) {
            steps.push(function(next) {
                if(ignoreExt.indexOf(file.ext) != -1){
                    return;
                }
                var _upload = arguments.callee;
                upload(receiver, to, file.getHashRelease(), file.getContent(), file, function(error) {
                    if (error) {
                        if (!--reTryCount) {
                            throw new Error(error);
                        } else {
                            _upload();
                        }
                    } else {
                        next();
                    }
                });
            });
        });
    }

    _.reduceRight(steps, function(next, current) {
        return function() {
            current(next);
        };
    }, callback)();
};

module.exports.options = {
    // 允许重试两次。
    retry: 2,
    ignoreExt: [".zip"]
};
