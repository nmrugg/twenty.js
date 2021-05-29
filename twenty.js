#!/usr/bin/env node

"use strict";

var child_process = require("child_process");
var p;
var isRunning = false;
var waitTimer;
var standbyDetectorTimer;
var activityChecker;
var waitTimeBetweenLooks;
var lookDuration;
var config;

function textNotify(title, text)
{
    var args = [];
    
    args.push(title || " ");
    
    if (text) {
        args.push(text)
    }
    
    /// Makes notify-osd less terrible by replacing the message instead of waiting.
    /// Better is to remove notify-osd: sudo apt-get remove notify-osd && pkill notify-osd && sudo apt-get install notification-daemon
    args.push('-h');
    args.push('string:x-canonical-private-synchronous:anything');
    
    try {
        child_process.execFile("notify-send", args, function () {});
    } catch (e) {
        console.log(e);
    }
}

function audioNotify(type)
{
    var audioFilePath;
    p = p || require("path");
    if (type === "start" && config.notifyStart) {
        audioFilePath = config.notifyStart;
    } else if (type !== "start" && config.notifyEnd) {
        audioFilePath = config.notifyEnd;
    } else {
        audioFilePath = p.join(__dirname, (type === "start" ? "notify-start.mp3" : "notify-end.mp3"));
    }
    /// notification.mp3 is a public domain sound file from https://freesound.org/people/cabled_mess/sounds/349503/
    child_process.execFile("play", [audioFilePath], {stdio: "ignore"}, function (){}).unref();
}

function getVolumeLevel()
{
    var output;
    var match;
    var volume;
    
    output = child_process.execFileSync("amixer", {encoding: "utf8"});
    match = output.match(/Master[\s\S]+?\[([\d.]+)%\]/);
    volume = Number(match[1]);
    if (volume >= 0) {
        return volume;
    }
}

function wait(cb, amt)
{
    waitTimer = setTimeout(cb, typeof amt === "number" ? amt : waitTimeBetweenLooks);
}

function standbyDetector()
{
    var lastTime = Date.now();
    var waitTime = 1000 * 30;
    
    if (config.debugging) {
        console.log("Starting standby detection", (new Date()).toString());
    }
    /// Clear the timer for good measure.
    clearInterval(standbyDetectorTimer);
    standbyDetectorTimer = setInterval(function detect()
    {
        var time = Date.now();
        //if (config.debugging) {
            //console.log(time, "-", "(" + lastTime + "+" + waitTime + ")", time - (lastTime + waitTime), (new Date()).toString());
        //}
        /// If there has been a big delay, the computer was probably in standby. So, stop and restart the timer.
        if (isRunning && time - (lastTime + waitTime) > 1000) {
            if (config.debugging) {
                console.log("Standby detected", (new Date()).toString());
            }
            stop();
            start();
        }
        
        lastTime = time;
    }, waitTime);
}


function getLocks()
{
    var data = "";
    var matches;
    var locks = {};
    try {
        data = child_process.execSync("xset q", {encoding: "utf8", stdio: "pipe"});
    } catch (e) {}
    matches = data.match(/(\S+)\s+Lock:\s+(on|off)/ig);
    if (matches) {
        matches.forEach(function (match)
        {
            var matches = match.match(/(\S+)\s+Lock:\s+(on|off)/i);
            locks[matches[1].toLowerCase()] = matches[2].toLowerCase() === "on";
        });
    }
    
    return locks;
}

function inSlienceMode()
{
    var locks;
    
    if (config.silenceOn) {
        locks = getLocks();
        if (locks.num && config.silenceOn === "num" || locks.caps && config.silenceOn === "caps" || locks.caps && config.silenceOn === "cap" || locks.scroll && config.silenceOn === "scroll" || locks.shift && config.silenceOn === "shift") {
            return true;
        }
    }
    return false;
}

function beep(message, type)
{
    audioNotify(type);
    /// If the volume is too low, you can't hear the beep, so display a message.
    if (getVolumeLevel() < 75) {
        textNotify("20-20-20", message);
    }
}

function systemdInstall()
{
    var config =
        "[Unit]\n" +
        "Description=twenty\n" +
        "\n" +
        "[Service]\n" +
        "# set the working directory to have consistent relative paths\n" +
        "WorkingDirectory=" + __dirname + "\n" +
        "\n" +
        "# start the server file (file is relative to WorkingDirectory here)\n" +
        "ExecStart=" + __filename + "\n" +
        "\n" +
        "# if process crashes, always try to restart\n" +
        "Restart=always\n" +
        "\n" +
        "# let 500ms between the crash and the restart\n" +
        "RestartSec=500ms\n" +
        "\n" +
        "# send log tot syslog here (it doesn't compete with other log config in the app itself)\n" +
        "StandardOutput=syslog\n" +
        "StandardError=syslog\n" +
        "\n" +
        "# nodejs process name in syslog\n" +
        "SyslogIdentifier=twenty\n" +
        "\n" +
        "# user and group starting the app\n" +
        "User=" + process.env.USER + "\n" +
        "Group=" + process.env.USER + "\n" +
        "\n" +
        "# set the environement (dev, prod…)\n" +
        "#Environment=NODE_ENV=production\n" +
        "\n" +
        "\n" +
        "[Install]\n" +
        "WantedBy=default.target\n";
    var tempPath = "/tmp/twenty-install.temp";
    var child;
    
    require("fs").writeFileSync(tempPath, config);
    
    child = child_process.spawn("/usr/bin/sudo", ["mv", tempPath, "/etc/systemd/system/twenty.service"], {stdio: "inherit"});
    child.on("close", function ()
    {
        console.log();
        console.log("Installed.");
        console.log("To start, run: sudo service twenty start");
        console.log();
        console.log("To start and stop without a password, run \"sudo visudo\" and add the following:");
        console.log("ALL    ALL = (root) NOPASSWD: /usr/sbin/service twenty *");
        console.log();
    });
}

function onInactive()
{
    stop();
}


function onActive()
{
    start();
}

function start()
{
    if (!isRunning) {
        if (config.debugging) {
            console.log("waiting...", (new Date()).toString());
        }
        isRunning = true;
        standbyDetector();
        
        (function loop()
        {
            wait(function ()
            {
                if (config.debugging) {
                    console.log("Alerting to look", (new Date()).toString());
                }
                
                if (!inSlienceMode()) {
                    beep("Stop and focus on something twenty feet away for 20sec.\n(Turn your volume up if you want to hear when time's up.)", "start");
                    
                    /// We separate the beep and the loop so that it will always beep but not always loop (if it gets canceled)
                    setTimeout(function ()
                    {
                        if (config.debugging) {
                            console.log("done", (new Date()).toString());
                        }
                        
                        if (!inSlienceMode()) {
                            beep("Carry on. :)", "end");
                        } else if (config.debugging) {
                            console.log("Silence Mode on, not notifying", (new Date()).toString());
                        }
                        
                    }, lookDuration).unref();
                } else if (config.debugging) {
                    console.log("Silence Mode on, not notifying", (new Date()).toString());
                }
                
                /// This will get canceled if stopping while waiting for the beep.
                wait(loop, lookDuration);
            }, waitTimeBetweenLooks);
        }());
    }
}

function stop()
{
    if (isRunning) {
        isRunning = false;
        clearTimeout(waitTimer);
        clearInterval(standbyDetectorTimer);
        if (config.debugging) {
            console.log("Clearing standby detection", (new Date()).toString());
        }
        if (config.debugging) {
            console.log("stopped");
        }
    }
}

if (process.argv[2] === "install") {
    systemdInstall();
    return;
}

function init()
{
    try {
        config = require("./config.js");
    } catch(e) {
        /// Load the distributed config
        try {
            config = require("./config-dist.js");
        } catch(e) {}
    }
    
    config = config || {};
    
    /// Normalize silenceOn (e.g., convert "num lock" to "num"
    if (config.silenceOn) {
        config.silenceOn = config.silenceOn.toLowerCase().replace(/\s*lock$/, "");
    }
    
    waitTimeBetweenLooks = config.waitTimeBetweenLooks || 1000 * 60 * 20;
    lookDuration = config.lookDuration || 1000 * 20;
    config.debugging = Boolean(config.debugging);
    
    activityChecker = require("./activeRecently.js")({
        checkTime: config.checkTime || 1000 * 60 * 5,
        inactivityTime: config.inactivityTime || 1000 * 60 * 3,
        startActive: true,
        checkForNewDevices: false,
        onActive: onActive,
        onInactive: onInactive,
        debugging: config.debugging,
    });
    
    start();
}

init();
