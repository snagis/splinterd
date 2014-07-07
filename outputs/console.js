function execute(){
    for (var i = 0, j = arguments.length; i < j; i++) {
        console.log(arguments[i]);
    }
}

exports.execute=execute;