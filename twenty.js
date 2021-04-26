#!/usr/bin/env node

"use strict";

var child_process = require("child_process");
var p;
var isRunning = false;
var waitTimer;
var standbyDetectorTimer;
var debugging = true;
var activityChecker = require("./activeRecently.js")({
    checkTime: 1000 * 60 * 3,
    inactivityTime: 1000 * 60,
    startActive: true,
    checkForNewDevices: false,
    onActive: onActive,
    onInactive: onInactive,
    debugging: debugging,
});
var waitTimeBetweenLooks = 1000 * 60 * 20;
var lookDuration = 1000 * 20;

function textNotify(title, text, timeout, type, log)
{
    var args = [];
    var logger = console.log;
    
    if (!timeout) {
        timeout = 5000;
    }
    
    args.push("-t", String(timeout));
    
    if (type) {
        if (type === "error" || type === "fail") {
            args.push("-i", "/opt/trinity/share/icons/crystalsvg/16x16/actions/button_cancel.png");
            logger = console.error;
        } else if (type === "ok" || type === "good") {
            args.push("-i", "/opt/trinity/share/icons/crystalsvg/16x16/actions/button_ok.png");
        } else {
            args.push("-i", type);
        }
    }
    
    args.push(title || " ");
    
    if (text) {
        args.push(text)
    }
    
    /// Makes notify-osd less terrible by replacing the message instead of waiting.
    /// Better is to remove notify-osd: sudo apt-get remove notify-osd && pkill notify-osd && sudo apt-get install notification-daemon
    args.push('-h');
    args.push('string:x-canonical-private-synchronous:anything');
    
    child_process.execFile("notify-send", args, function () {});
}

function audioNotify()
{
    p = p || require("path");
    /// notification.mp3 is a public domain sound file from https://freesound.org/people/cabled_mess/sounds/349503/
    child_process.execFile("play", [p.join(__dirname, "notification.mp3")], {stdio: "ignore"}, function (){}).unref();
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
    
    if (debugging) {
        console.log("Starting timeout detection", (new Date()).toString());
    }
    standbyDetectorTimer = setInterval(function detect()
    {
        var time = Date.now();
        if (debugging) {
            console.log(time, "-", "(" + lastTime + "+" + waitTime + ")", time - (lastTime + waitTime), (new Date()).toString());
        }
        /// If there has been a big delay, the computer was probably in standby. So, stop and restart the timer.
        if (isRunning && time - (lastTime + waitTime) > 2000) {
            if (debugging) {
                console.log("Timeout detected", (new Date()).toString());
            }
            stop();
            start();
        }
        
        lastTime = time;
    }, waitTime);
}

function beep(message)
{
    //process.stdout.write("\u0007");
    audioNotify();
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
        "# start node at multi user system level (= sysVinit runlevel 3) \n" +
        "WantedBy=multi-user.target";
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
        if (debugging) {
            console.log("waiting...", (new Date()).toString());
        }
        isRunning = true;
        standbyDetector();
        wait(function ()
        {
            if (debugging) {
                console.log("Alerting to look", (new Date()).toString());
            }
            beep("Stop and focus on something twenty feet away for 20sec.\n(Turn your volume up if you want to hear when time's up.)");
            wait(function ()
            {
                if (debugging) {
                    console.log("done", (new Date()).toString());
                }
                beep("Continue on. :)");
                isRunning = false;
                start();
            }, lookDuration);
        }, waitTimeBetweenLooks);
    }
}

function stop()
{
    if (isRunning) {
        isRunning = false;
        clearTimeout(waitTimer);
        clearInterval(standbyDetectorTimer);
        if (debugging) {
            console.log("Clearing timeout detection", (new Date()).toString());
        }
        if (debugging) {
            console.log("stopped");
        }
    }
}

if (process.argv[2] === "install") {
    return systemdInstall();
}

start();
