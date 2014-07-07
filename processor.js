
var log = require('npmlog'),
    fileSystem = require("fs"),
    common = require("./common.js"),
    lineChomper = require("line-chomper")
    
var  _startFromBeginning = false;
var _outputModuleMap = {};
var _debug = false;


function Processor(fileNameToFollow, linePatternMatch, fileNameProperties, groupingNames, output) {
    this.linePatternMatch = linePatternMatch;
    this.fileNameToFollow = fileNameToFollow;
    this.fileNameProperties = fileNameProperties;
    this.groupingNames = groupingNames;
    this.output = output;
    
    var stats = fileSystem.statSync(this.fileNameToFollow);
    this.fileSizeInBytes = _startFromBeginning ? 0 : stats["size"];
}

Processor.prototype.processLine = function(data) {
    log.info("", "Procesing line: %j" + data);
    var self = this;
    var lineProps = common.parseForPattern(data, self.linePatternMatch, self.groupingNames);
    
    if(lineProps) {
        var outputs = Object.keys(self.output);
        for (var i = 0, len = outputs.length; i < len; i++) {
            var outputType = outputs[i];
            var outputParams = self.output[outputType];
            
            var op;
            if(!(outputParams instanceof Array)){
                outputParams = [[outputParams]];
            }
            else if(!(outputParams[0] instanceof Array)){
                outputParams = [outputParams];
            }
            
            var outputParamsLength = outputParams.length;
            var modulePath = _outputModuleMap[outputType];

            var outputProcessor;
            if(!modulePath){
                try{
                    outputProcessor = require('./outputs/' + outputType);
                }
                catch(err){
                    log.error("The output processor %j is not found; ignoring the line and moving on", outputType);
                    continue;
                }
            }
            else{  
                outputProcessor = require(modulePath);
            }
            
            for(var index = 0; index < outputParamsLength; index++){
                var processedOutputParams = self.processOutputParams(outputParams[index], lineProps);
                log.info("", "Output Processor %j is used to process the output params %j", outputType, processedOutputParams);
                outputProcessor.execute.apply(this,processedOutputParams);
            }
        }
    }
  
}

Processor.prototype.fileChanged = function() {
    var self = this;
    
    if(self.waitingForChangeProcess){
        return;
    }

    var stats = fileSystem.statSync(self.fileNameToFollow);
    var currentFileSize = stats["size"];

    if (currentFileSize < self.fileSizeInBytes) {
        // file tructed; start over from the beginning.
        log.info("The file being processed %j seems to be truncated: Processing from the beginning...", fileNameToFollow);
        self.fileSizeInBytes = 0;
    }
    else if(currentFileSize == self.fileSizeInBytes) {
        return;
    }
    
    var readStream = fileSystem.createReadStream(self.fileNameToFollow, {
        start: self.fileSizeInBytes
    });

    var chomp = lineChomper.chomp;

    chomp(readStream, {
        returnDetails: true
    }, function(err, lines) {
        var offset = 0;
        for (var lineIndex = 0, totalLines = lines.length; lineIndex < totalLines; lineIndex++) {
            var line = lines[lineIndex].line;
            var lineSize = lines[lineIndex].sizeInBytes;

            if (Buffer.byteLength(line) < lineSize) {
                self.processLine(line);
                offset += lines[lineIndex].sizeInBytes;
            }
        }
        self.fileSizeInBytes += offset;
        self.waitingForChangeProcess = false;
    });

    self.waitingForChangeProcess = true;
}

Processor.prototype.processOutputParams = function(outputParams, lineProps) {
    var retVal = [];
    var self = this;
    
    
    var paramLength = outputParams.length;
    for(var paramIndex = 0; paramIndex < paramLength; paramIndex++){
        var val = outputParams[paramIndex]; 
        
        if(typeof val == 'string' || (val instanceof String)){
            
             var newVal = val.replace(/#(.+)#/g, function($0, $1) {
                var execString = ''+$1;
                 
                var execStringReplace = execString.replace(/\$([a-zA-Z]+)/g, function($0, $1) {
                    return lineProps[$1] || self.fileNameProperties[$1];
                });
                 
                execStringReplace = execStringReplace || execString;
                 
                return eval(execStringReplace);
            });

            newVal = newVal || val;
            
            var replaceStr = newVal.replace(/\$([a-zA-Z]+)/g, function($0, $1) {
                return lineProps[$1] || self.fileNameProperties[$1];
            });
           
            newVal = replaceStr ? replaceStr : newVal;
            retVal.push(newVal);
        }
        else if(typeof val == 'boolean' || typeof val == 'number'){
            retVal.push(val);
        }
        else {
            log.error("", "%s/%s is not a boolean or number.", ""+val, (typeof val));
            log.error("", "Output params can have only Strings, numbers or booleans. Incorrect configuration %j", outputParams);
            process.exit(1);
        }
    }
    return retVal;
    
};

exports.init = function(startFromBeginning, outputModuleMap){
    _startFromBeginning = startFromBeginning || _startFromBeginning;
    _outputModuleMap = outputModuleMap;
    return exports;
};

exports.Processor = Processor;
