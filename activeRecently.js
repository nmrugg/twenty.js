"use strict";

function init(options)
{
    var active = true;
    var checkTime = 1000 * 15; /// Check every 15 seconds
    var inactivityTime = 1000 * 10; /// Mark as inactive if no activity found after 10 seconds
    var spawn = require("child_process").execFile;
    var inactivityTimer;
    var delayCheckTimer;
    var listening = false;
    var onChange;
    var onActive;
    var onInactive;
    var debugging;
    var proc;
    
    function stopListening()
    {
        if (proc) {
            proc.kill();
        }
    }
    
    function check()
    {
        var hasActivity = false;
        
        /// Use xinput test-xi2 --root to test for activity.
        /// Listenting directly to /dev/input sometimes requires root.
        proc = spawn("xinput", ["test-xi2", "--root"], {stdio: "pipe", encoding: "utf8"});
        
        proc.stdout.on("data", function (data)
        {
            if (!hasActivity && /\bEVENT type \d \(.*\)/.test(data)) {
                /// This might be unnecessary.
                hasActivity = true;
                
                if (debugging) {
                    console.log("Active", (new Date()).toString());
                }
                
                stopListening()
                
                clearTimeout(inactivityTimer);
                
                active = true;
                
                if (onActive) {
                    setImmediate(onActive);
                }
                if (onChange) {
                    setImmediate(onChange, {active: true});
                }
                
                delayCheck();
            }
        });
        
        function setInactive()
        {
            active = false;
            
            if (debugging) {
                console.log("Inactive", (new Date()).toString());
            }
            if (onInactive) {
                setImmediate(onInactive);
            }
            if (onChange) {
                setImmediate(onChange, {active: false});
            }
        }
        
        inactivityTimer = setTimeout(setInactive, inactivityTime);
        
        if (debugging) {
            console.log("Listening", (new Date()).toString());
        }
    }
    
    function delayCheck(wait)
    {
        delayCheckTimer = setTimeout(check, wait || checkTime);
    }
    
    function start(options)
    {
        options = options || {};
        
        if (typeof options.checkTime === "number" && options.checkTime) {
            checkTime = options.checkTime;
        }
        if (typeof options.inactivityTime === "number" && options.inactivityTime) {
            inactivityTime = options.inactivityTime;
        }
        
        if (typeof options.startActive === "boolean") {
            active = options.startActive;
        }
        
        if (Array.isArray(options.specifiedEventPaths)) {
            specifiedEventPaths = options.specifiedEventPaths;
        }
        
        debugging = Boolean(options.debugging);
        
        if (typeof options.onActive === "function") {
            onActive = options.onActive;
        }
        
        if (typeof options.onInactive === "function") {
            onInactive = options.onInactive;
        }
        
        if (typeof options.onChange === "function") {
            onChange = options.onChange;
        }
        
        /// Start checking quickly on start up.
        delayCheck(100);
        
        listening = true;
        
        return {
            isActive: function ()
            {
                return active;
            },
            isListening: function ()
            {
                return listening;
            },
            stop: function ()
            {
                clearTimeout(delayCheckTimer);
                clearTimeout(inactivityTimer);
                stopListening();
                listening = false;
                active = undefined;
                return start;
            },
        }
    }
    
    //start(true, /*["/dev/input/event8","/dev/input/event9", "/dev/input/event10"]*/);
    //start(true, ["/dev/input/event8"]);
    //start(true, 1000);
    //start(true, 1000, ["/dev/input/event8","/dev/input/event9", "/dev/input/event10"]);
    
    return start(options);
}

module.exports = init;
