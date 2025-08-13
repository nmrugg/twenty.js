#!/usr/bin/env node

"use strict";

var child_process = require("child_process");
var params = require("./getParams.js")(["install", "test", "colors", "no-colors", "debugging"]);
var p = require("path");
var isRunning = false;
var waitTimer;
var standbyDetectorTimer;
var secondNotifyTimer;
var activityChecker;
var waitTimeBetweenLooks;
var lookDuration;
var notifyVolumeLevel;
var config;
var binPath;
var programs = {
    audio: [
        "mpg123",
        "mplayer",
        "ffplay",
        "audacious",
        "vlc",
        "play",
    ],
    notify: [
        "notify-send",
        "zenity",
        "xmessage",
    ],
    volume: ["amixer"],
    keys: ["xset"],
    activity: ["xinput"],
};
var warnings = {
    audio: "Twenty.js is unable to play audio. Please install an audio player. Example: sudo apt-get install mpg123 -y",
    notify: "Twenty.js is unable to send notifications. Please install a notifier. Example: sudo apt-get install notification-daemon -y",
    keys: "Twenty.js is unable to detect key lock status. Please install xset. Example: sudo apt-get install x11-xserver-utils -y",
    volume: "Twenty.js is unable to detect audio levels. Please install amixer. Example: sudo apt-get install alsa-utils -y",
    activity: "Twenty.js is unable to listen for user activity. Please install xinput. Example: sudo apt-get install xinput -y",
};

function color(colorCode, str)
{
    if (!params["no-colors"] && (process.stdout.isTTY || params.colors)) {
        str = "\u001B[" + colorCode + "m" + str + "\u001B[0m";
    }
    
    return str;
}

function highlight(str)
{
    return color(33, str);
}

function note(str)
{
    return color(36, str);
}

function playAudio(audioFilePath)
{
    child_process.execFile(binPath + "mpg123", [audioFilePath], {stdio: "ignore"}, function (err)
    {
        if (err) {
            if (err) {
                child_process.execFile(binPath + "mplayer", [audioFilePath], {stdio: "ignore"}, function (err)
                {
                    if (err) {
                        child_process.execFile(binPath + "ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", audioFilePath], {stdio: "ignore"}, function (err)
                        {
                            if (err) {
                                if (err) {
                                    child_process.execFile(binPath + "audacious", ["-Hq", audioFilePath], {stdio: "ignore"}, function (err)
                                    {
                                        if (err) {
                                            if (err) {
                                                /// `vlc --intf dummy FILE vlc://quit` could work too.
                                                child_process.execFile(binPath + "vlc", ["--intf", "dummy", "--play-and-exit", audioFilePath], {stdio: "ignore"}, function (err)
                                                {
                                                    if (err) {
                                                        child_process.execFile(binPath + "play", [audioFilePath], {stdio: "ignore"}, function (err)
                                                        {
                                                            if (err) {
                                                                /// Cannot play audio.
                                                            }
                                                        }).unref();
                                                    }
                                                }).unref();
                                            }
                                        }
                                    }).unref();
                                }
                            }
                        }).unref();
                    }
                }).unref();
            }
        }
    }).unref();
}

function textNotify(title, text)
{
    var args = [];
    
    args.push(title || " ");
    
    if (text) {
        args.push(text)
    }
    
    /// Makes notify-osd less terrible by replacing the message instead of waiting.
    /// Better is to remove notify-osd: sudo apt-get remove notify-osd && pkill notify-osd && sudo apt-get install notification-daemon
    args.push("-h", "string:x-canonical-private-synchronous:anything");
    args.push("-i", "/dev/null");
    
    child_process.execFile(binPath + "notify-send", args, function (err)
    {
        if (err) {
            child_process.execFile(binPath + "zenity", ["--notification", "--text", text, "--timeout=5"], function (err)
            {
                if (err) {
                    child_process.execFile(binPath + "xmessage", ["-timeout", "5", text], function (err)
                    {
                        /// Cannot send notification
                    });
                }
            });
        }
    });
}

function audioNotify(type)
{
    var audioFilePath;
    var useQuieter = getVolumeLevel() >= config.useQuiteSoundsAt;
    
    if (type === "start") {
        if (useQuieter) {
            audioFilePath = config.notifyStartQuiet;
        } else {
            audioFilePath = config.notifyStart;
        }
    } else if (type === "end") {
        if (useQuieter) {
            audioFilePath = config.notifyEndQuiet;
        } else {
            audioFilePath = config.notifyEnd;
        }
    }
    
    if (audioFilePath) {
        playAudio(audioFilePath);
    }
}

function getVolumeLevel()
{
    var output;
    var match;
    var volume;
    
    try {
        output = child_process.execFileSync(binPath + "amixer", {encoding: "utf8"});
        match = output.match(/Master[\s\S]+?\[([\d.]+)%\]/);
        volume = Number(match[1]);
        if (volume >= 0) {
            return volume;
        }
    } catch (e) {
        return 0;
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
    
    if (params.debugging) {
        console.log("Starting standby detection", (new Date()).toString());
    }
    /// Clear the timer for good measure.
    clearInterval(standbyDetectorTimer);
    standbyDetectorTimer = setInterval(function detect()
    {
        var time = Date.now();
        /// If there has been a big delay, the computer was probably in standby. So, stop and restart the timer.
        if (isRunning && time - (lastTime + waitTime) > 1000) {
            if (params.debugging) {
                console.log("Standby detected", (new Date()).toString());
            }
            /// Stop and restart when coming out of standby.
            /// Stop the second ring too, if any.
            clearTimeout(secondNotifyTimer);
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
        data = child_process.execSync(binPath + "xset q", {encoding: "utf8", stdio: "pipe"});
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

function notify(type)
{
    var textMessage;
    var volume = getVolumeLevel();
    
    audioNotify(type);
    /// If the volume is too low, you can't hear the sound, so display a message.
    if (volume <= notifyVolumeLevel) {
        if (type === "end") {
            textMessage = "Carry on. :)";
        } else {
            textMessage = "Stop and focus on something twenty feet away for 20sec.";
            if (volume < 100) {
                textMessage += "\n(Turn your volume up if you want to hear when time's up.)";
            }
        }
        textNotify("20-20-20", textMessage);
    }
}

function installCron(cronjob, comment, logPath)
{
    var cronjobText = "";
    var added;
    
    /// Crontab fails if there are no jobs yet.
    try {
        cronjobText = child_process.execSync("crontab -l", {encoding: "utf8", env: process.env, cwd: __dirname});
    } catch (e) {}
    
    if (cronjobText.indexOf(cronjob) === -1) {
        added = true;
        
        cronjobText = cronjobText.trim();
        if (comment) {
            cronjobText += "\n# " + comment;
        }
        cronjobText += "\n" + cronjob;
        if (logPath) {
            cronjobText += " > '" + logPath + "' 2>&1";
            /// This will throw if the directory already exists.
            try {
                fs.mkdirSync(require("path").dirname(logPath));
            } catch (e) {}
        }
        cronjobText += "\n";
        
        child_process.execSync("crontab -", {input: cronjobText, stdio: "pipe", encoding: "utf8", env: process.env, cwd: __dirname});
    } else {
        console.log("Cronjob already installed");
    }
    
    return added;
}

function install()
{
    ///NOTE: xset needs DISPLAY set properly and notify-send needs XDG_RUNTIME_DIR.
    installCron("@reboot DISPLAY=" + (process.env.DISPLAY || ":0") + " XDG_RUNTIME_DIR=/run/user/" + process.getuid() + " '" + process.execPath + "' '" + __filename + "'", "Installed by twenty.js on " + (new Date()).toString(), require("path").join(__dirname, ".cronlog.txt"));
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
        if (params.debugging) {
            console.log("waiting...", (new Date()).toString());
        }
        isRunning = true;
        standbyDetector();
        
        (function loop()
        {
            wait(function ()
            {
                var time;
                
                if (params.debugging) {
                    console.log("Alerting to look", (new Date()).toString());
                }
                
                if (!inSlienceMode()) {
                    notify("start");
                    
                    time = Date.now();
                    /// We separate the notification and the loop so that it will always notify but not always loop (if it gets canceled)
                    secondNotifyTimer = setTimeout(function ()
                    {
                        if (params.debugging) {
                            console.log("done", (new Date()).toString());
                        }
                        
                        /// If there was a long pause, then the system may have been in stand by, so don't ring.
                        if (Date.now() - time > lookDuration * 1.5) {
                            if (params.debugging) {
                                console.log("Long delay detected before the second notification; canceling.", (new Date()).toString());
                            }
                            return;
                        }
                        
                        if (!inSlienceMode()) {
                            notify("end");
                        } else if (params.debugging) {
                            console.log("Silence Mode on, not notifying", (new Date()).toString());
                        }
                        
                    }, lookDuration).unref();
                } else if (params.debugging) {
                    console.log("Silence Mode on, not notifying", (new Date()).toString());
                }
                
                /// This will get canceled if stopping while waiting for the notification.
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
        if (params.debugging) {
            console.log("Clearing standby detection", (new Date()).toString());
            console.log("stopped");
        }
    }
}

function runInBackground()
{
    var child;
    console.log("Starting twenty.js in the background.");
    child = child_process.spawn(process.execPath, [__filename], {detached: true, stdio: "ignore"});
    console.log("To stop, run the following: kill " + child.pid + "");
    child.unref();
}

function checkPrograms()
{
    Object.keys(programs).forEach(function (type)
    {
        var programsArr = programs[type];
        var len = programsArr.length;
        var i;
        var found = false;
        for (i = 0; i < len; ++i) {
            try {
                child_process.execSync("command -v " + binPath + programsArr[i]);
                found = true;
                break;
            } catch (e) {}
        }
        if (!found) {
            console.error(highlight("\nWARNING: " + warnings[type] + "\n"));
            if (type === "audio" || type === "activity") {
                process.exit();
            }
        }
    });
}

if (params.install || params._.indexOf("install") > -1) {
    console.log("Installing twenty.js to start up automatically (in crontab)");
    install();
    runInBackground();
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
    
    if (params.test) {
        console.log(note("Entering Test Mode"));
        config.waitTimeBetweenLooks = 1000;
        config.lookDuration = 1000;
        params.debugging = true;
    }
    
    binPath = config.binPath || "/usr/bin/";
    if (binPath.slice(-1) !== "/") {
        binPath += "/";
    }
    
    waitTimeBetweenLooks = config.waitTimeBetweenLooks || 1000 * 60 * 20;
    lookDuration = config.lookDuration || 1000 * 20;
    
    if (typeof params.debugging !== "boolean") {
        params.debugging = Boolean(config.debugging);
    }
    
    if (config.notifyVolumeLevel && typeof config.notifyVolumeLevel === "number" && config.notifyVolumeLevel >= 0 && config.notifyVolumeLevel <= 100) {
        notifyVolumeLevel = config.notifyVolumeLevel;
    } else {
        notifyVolumeLevel = 75;
    }
    if (typeof config.useQuiteSoundsAt !== "number") {
        config.useQuiteSoundsAt = 75;
    }
    
    if (typeof config.notifyStart !== "string") {
        config.notifyStart = p.join(__dirname, "notify-start.mp3");
    }
    if (typeof config.notifyStartQuiet !== "string") {
        config.notifyStartQuiet = p.join(__dirname, "notify-start-quiet.mp3");
    }
    if (typeof config.notifyEnd !== "string") {
        config.notifyEnd = p.join(__dirname, "notify-end.mp3");
    }
    if (typeof config.notifyEndQuiet !== "string") {
        config.notifyEndQuiet = p.join(__dirname, "notify-end-quiet.mp3");
    }
    
    checkPrograms();
    
    activityChecker = require("./activeRecently.js")({
        checkTime: config.checkTime || 1000 * 60 * 5,
        inactivityTime: config.inactivityTime || 1000 * 60 * 3,
        startActive: true,
        checkForNewDevices: false,
        onActive: onActive,
        onInactive: onInactive,
        debugging: params.debugging,
    });
    
    start();
}

init();
