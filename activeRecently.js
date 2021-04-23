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
    
    function stopListening()
    {
        procs.forEach(function (proc)
        {
            proc.stdin.pause();
            proc.kill();
            //process.kill(proc.pid);
            
        });
        /*
        streams.forEach(function (stream)
        {
            //stream.close();
            stream.destroy();
        });
        */
        /*
        fds.forEach(function (fd)
        {
            console.log(fd)
            fs.closeSync(fd);
        });
        */
    }
    
    function check()
    {
        var dir = "/dev/input/by-path";
        var eventFiles = ["/dev/input/mice"];
        var p;
        var fs;
        //var streams;
        //var fds;
        
        
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
            //streams = [];
            //fds = [];
            procs = [];
            eventFiles.forEach(function (path)
            {
                //var proc = execFile("head", ["-c", "1", path], function ondone(err, stdout, stderr)
                var proc = spawn("cat", [path], {stdio: "pipe"});
                procs.push(proc);
                
                proc.stdout.on("data", function ()
                {
                    if (!alreadyHaveActivity) {
                        alreadyHaveActivity = true;
                        //console.log(path, "has data");
                        clearTimeout(inactivityTimer);
                        active = true;
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
                
                //proc.on("error", function (e){console.error(e)});
                proc.on("exit", function ()
                {
                    //console.log("closed", path);
                });
                /*
                var stream = fs.createReadStream(path);
                streams.push(stream);
                //console.log(path)
                //stream.resume();
                stream.on("data", function (data)
                {
                    if (!alreadyHaveActivity) {
                        alreadyHaveActivity = true;
                        console.log(path, "has data");
                        //console.log(JSON.stringify(data));
                        console.log("is active");
                        active = true;
                        clearTimeout(inactivityTimer);
                        stopListening();
                        delayCheck();
                    }
                });
                */
                /*
                var fd = fs.openSync(path);
                var buf = Buffer.alloc(200);
                fds.push(fd);
                fs.read(fd, buf, 0, 200, 0, function ()
                {
                    console.log(buf)
                    if (!alreadyHaveActivity) {
                        console.log(path, "has data");
                        console.log("is active");
                        active = true;
                        alreadyHaveActivity = true;
                        clearTimeout(inactivityTimer);
                        stopListening();
                        delayCheck();
                    }
                });
                */
                /// head -c 1 /dev/input/mice
            });
            
            function setInactive()
            {
                //console.log("inactive")
                active = false;
                if (onInactive) {
                    setImmediate(onInactive);
                }
                if (onChange) {
                    setImmediate(onChange, {active: false});
                }
            }
            
            inactivityTimer = setTimeout(setInactive, inactivityTime);
        }
    }
    
    function delayCheck(wait)
    {
        delayCheckTimer = setTimeout(check, wait || checkTime);
    }
    
    //function start(startActive, _checkTime, _specifiedEventPaths, _onlyUseSpecified)
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
