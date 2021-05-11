"use strict";

function init(options)
{
    var active = true;
    var checkTime = 1000 * 15; /// Check every 15 seconds
    var inactivityTime = 1000 * 10; /// Mark as inactive if no activity found after 10 seconds
    var spawn = require("child_process").execFile;
    var specifiedEventPaths;
    var onlyUseSpecified;
    var inactivityTimer;
    var delayCheckTimer;
    var procs;
    var listening = false;
    var checkForNewDevices = true;
    var onChange;
    var onActive;
    var onInactive;
    var debugging;
    
    function stopListening()
    {
        if (procs) {
            procs.forEach(function (proc)
            {
                proc.stdin.pause();
                proc.kill();
                //process.kill(proc.pid);
            });
        }
    }
    
    function check()
    {
        var dir = "/dev/input/by-path";
        var eventFiles = ["/dev/input/mice"];
        var p;
        var fs;
        
        if (onlyUseSpecified && specifiedEventPaths) {
            eventFiles = specifiedEventPaths;
            listenToFiles();
        } else {
            fs = require("fs");
            p = require("path");
            
            if (specifiedEventPaths) {
                eventFiles = eventFiles.concat(specifiedEventPaths);
            }
            fs.readdir(dir, function (err, files)
            {
                /// Get keyboard files
                files.forEach(function (file)
                {
                    if (/-kbd$/.test(file)) {
                        eventFiles.push(p.join(dir, file));
                    }
                });
                
                if (!checkForNewDevices) {
                    /// Just use the ones we found now if we don't want to look for new devices just plugged in.
                    specifiedEventPaths = eventFiles;
                    onlyUseSpecified = true;
                }
                
                listenToFiles();
            });
        }
        
        function listenToFiles()
        {
            var alreadyHaveActivity;
            
            procs = [];
            eventFiles.forEach(function (path)
            {
                var proc = spawn("cat", [path], {stdio: "pipe"});
                procs.push(proc);
                
                proc.stdout.on("data", function ()
                {
                    if (!alreadyHaveActivity) {
                        alreadyHaveActivity = true;
                        //console.log(path, "has data");
                        clearTimeout(inactivityTimer);
                        active = true;
                        if (debugging) {
                            console.log("Active", (new Date()).toString());
                        }
                        stopListening();
                        delayCheck();
                        
                        if (onActive) {
                            setImmediate(onActive);
                        }
                        if (onChange) {
                            setImmediate(onChange, {active: true});
                        }
                    }
                });
                /*
                proc.on("exit", function ()
                {
                    console.log("closed", path);
                });
                */
                /// head -c 1 /dev/input/mice
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
        
        if (typeof options.checkForNewDevices === "boolean") {
            checkForNewDevices = options.checkForNewDevices;
        }
        
        if (Array.isArray(options.specifiedEventPaths)) {
            specifiedEventPaths = options.specifiedEventPaths;
        }
        
        onlyUseSpecified = Boolean(options.onlyUseSpecified);
        
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
