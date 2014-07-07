var lynx=require('lynx');

function execute(){
    console.log(arguments);

    var hostName = arguments[0];
    var port = arguments[1];
    var statName = arguments[2];
    var statVal = arguments[3];
    var statType = arguments[4];
    
    statVal = statVal * 1;
    port = port * 1;
    
    var metrics = new lynx(hostName, port);

    if(statType == 'counter'){
        metrics.increment(statName)
    }
    else if(statType == 'decrementCounter'){
        metrics.decrement(statName)
    }
    else if(statType == 'gauge'){
        metrics.gauge(statName, statVal);
    }
    else if(statType == 'timer'){
        metrics.timing(statName, statVal);
    }
    else{
        console.error("Invalid stat type: " + arguments[4] + " Valid stat types are counter,decrementCounter, gauge or timer");
    }
}

exports.execute=execute;