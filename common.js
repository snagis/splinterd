var log = require('npmlog');

function parseForPattern(line, pattern, propsConfig) {
    var props;
    var regex = new RegExp(pattern);
    var matches = line.match(regex);
    if (matches) {
        props = {};
        
        for (var index = 0, len = matches.len; index < len; index++){
            props['$'+index] = matches[index];
        }
        
        if (propsConfig) {
            for (var key in propsConfig) {
                if (!isNaN(key)) {
                    var groupingInt = parseInt(key);
                    var newProperty = propsConfig[key];
                    var matchValue = matches[groupingInt];
                    props[newProperty] = matchValue;
                }
                else {
                    if (key.match(/^[a-zA-Z]+$/)) {
                        props[key] = propsConfig[key];
                    }
                    else {
                        log.error("Invalid Property: " + key + "; Only letters are allowed.");
                        process.exit(1);
                    }
                }
            };
        }
    }
    return props;
}


exports.parseForPattern  = parseForPattern;