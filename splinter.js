#! /usr/bin/env node

var program = require('commander'),
    fileSystem = require('fs'),
    log = require('npmlog'),
    path = require('path');
    

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};


function collectOutputProcDirs(val, dirs) {
    dirs.push(val);
    return dirs;
}

var outputModuleMap = {};


program
  .version('0.0.1')
  .usage('[options] <JSON Configuration File ...>')
  .option('-o, --outputProcessors <directory name>', 'Directories for Output Processors', collectOutputProcDirs, [])
  .option('-d, --debug', 'Enables debugging')
  .option('-b, --beginning', 'Start processing from beginning of the file')
  .parse(process.argv);


log.level = program.debug ? "info" : "warn";

var outputDirs = [];
if(program.outputProcessors && program.outputProcessors.length !== 0){
    outputDirs = outputDirs.concat(program.outputProcessors);
}

for(var outputDirIdx = 0, outputDirLen = outputDirs.length; outputDirIdx < outputDirLen; outputDirIdx++){
    
    var outputDir = outputDirs[outputDirIdx];
    
    if(fileSystem.existsSync(outputDir)){
        var opFileNames = fileSystem.readdirSync(outputDir);
        for(var opFileNameIdx = 0, opFileNamesLen = opFileNames.length; opFileNameIdx < opFileNamesLen; opFileNameIdx++ ){
            var opFileName = opFileNames[opFileNameIdx];
            if(opFileName.endsWith(".js")){
               var opModule = path.basename(opFileName, ".js");
               outputModuleMap[opModule] = path.resolve(outputDir, opFileName);
            }
            else{
                log.warn("", "Output directory: %s contains non javascipt file: %s; Ignoring...", outputDir, opFileName);
            }
        }

    }
    else{
        log.error("" , "The directory for custom output processors do not exist: %j", outputDir);
        process.exit(1);
    }
}


if (!program.args || program.args.length === 0) {
    program.outputHelp();
    process.exit(1);
}

var splinterProcessor = require('./processor.js').init(program.beginning, outputModuleMap),
    common = require('./common.js'),
    globWatcher = require("globwatcher");

var fileConfigurations = {},
    lineConfigurations = {},
    actionConfigurations = {},
    processorMap = {};

Function.prototype.appendArg = function() {
    var func = this;
    var arg = arguments;
    return function() {
        var newargs = [];
        for (var origArgIndex = 0, origArgLen = arguments.length; origArgIndex < origArgLen; origArgIndex++) {
            newargs.push(arguments[origArgIndex]);
        }
        for (var appendArgIndex = 0, appendArgLen = arg.length; appendArgIndex < appendArgLen; appendArgIndex++) {
            newargs.push(arg[appendArgIndex]);
        }
        return func.apply(this, newargs);
    };
};


program.args.forEach(function(val, index, array) {
    log.info("Reading configuration from file: %j", val);
    var configuration =  (JSON.parse(fileSystem.readFileSync(val, "utf8")));
    _initLogWatch(configuration);
});

function _initLogWatch(configuration) {
    for (var configKey in configuration) {
        if (configKey == 'files') {
            log.info("", "Building file configurations...");
            _appendConfig(fileConfigurations, configuration.files);
            log.info("", "File configurations built: %j", fileConfigurations);
        }
        else if (configKey == 'lines') {
            log.info("", "Bulding line configurations...");
            _appendConfig(lineConfigurations, configuration.lines);
            log.info("", "Line configurations built: %j", lineConfigurations);
        }
        else if (configKey == 'actions') {
            log.info("", "Building action configurations...");
            _appendConfig(actionConfigurations, configuration.actions);
            log.info("", "Action configurations built: %j", actionConfigurations);
        }
        else {
            log.error("", "Invalid Key: '%j' in the configuration; Valid keys are 'files', 'lines' and 'actions'", configKey);
            process.exit(1);
        }
    }
}

function _appendConfig(globalConfiguration, configInstance) {
    for (var fileKey in configInstance) {
        globalConfiguration[fileKey] = configInstance[fileKey];
    }
}

var _watchedFileDeletedCallback = function(filePath, watcher) {
    log.info("", "%s is deleted; Stopping watches.", filePath);
    processorMap[filePath] && delete processorMap[filePath];
    watcher.fileWatcher.unwatch(filePath);
};

var _watchedFileChangedCallback = function(filePath) {
    log.info("", "%j changed" + filePath);
    var processors = processorMap[filePath];
    if (processors !== undefined) {
        for (var index = 0, length = processors.length; index < length; index++) {
            processors[index].fileChanged();
        }
    }
};

var _newFileAddedCallback = function(watchedFile, watcher, fileConfiguration, logConfiguration, output) {

    log.info("", "Will watch %s", watchedFile);

    var fileName = watchedFile.replace(/^.*[\\\/]/, '');
    var fileNameProps;

    if (fileConfiguration.pattern) {
        fileNameProps = common.parseForPattern(fileName, fileConfiguration.pattern, fileConfiguration.props);
        if (!fileNameProps) {
            log.error("", "Watched file: %s does not match the pattern: %s; It will NOT BE PROCESSED!!", watchedFile, fileConfiguration.pattern);
            return;
        }
    }
    var processor = new splinterProcessor.Processor(watchedFile, logConfiguration.pattern, fileNameProps || {},
    logConfiguration.props, output);

    if (processorMap[watchedFile] === undefined) {
        processorMap[watchedFile] = [processor];
    }
    else {
        processorMap[watchedFile].push(processor);
    }
    
    if(program.beginning){
        processor.fileChanged();
    }
    
};

var _watchFilesInitCallback = function(watcher, fileConfiguration, logConfiguration, output) {
    var watchedFiles = watcher.currentSet();
    for (var watchedFileIndex = 0, watchedFileArraySize = watchedFiles.length; watchedFileIndex < watchedFileArraySize; watchedFileIndex++) {
        var watchedFile = watchedFiles[watchedFileIndex];
        _newFileAddedCallback(watchedFile, watcher, fileConfiguration, logConfiguration, output);
    }
};

var actionKeys = Object.keys(actionConfigurations);
for (var i = 0; i < actionKeys.length; i++) {
    var action = actionConfigurations[actionKeys[i]];

    var fileType = action.file;
    var lineType = action.line;

    var fileConfiguration = fileConfigurations[fileType];
    var lineConfiguration = lineConfigurations[lineType];

    var globwatcher = globWatcher.globwatcher;
    var watcher = globwatcher(fileConfiguration.path);

    watcher.ready.then(_watchFilesInitCallback.appendArg(fileConfiguration, lineConfiguration, action.output));
    watcher.on("changed", _watchedFileChangedCallback.appendArg(watcher));
    watcher.on("deleted", _watchedFileDeletedCallback.appendArg(watcher));
    watcher.on("added", _newFileAddedCallback.appendArg(watcher, fileConfiguration, lineConfiguration, action.output));
}
