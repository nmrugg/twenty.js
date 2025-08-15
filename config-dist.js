///
/// Copy this file and rename it to config.js, and then uncomment and change the options below.
///
module.exports = {
    ///waitTimeBetweenLooks || 1000 * 60 * 20, /// How long to wait before notifying (default 20 minutes)
    ///lookDuration || 1000 * 20, /// How long to look for (default 20 seconds)
    ///checkTime: 1000 * 60 * 5, /// How often to check for inactivity (default 2 minutes)
    ///inactivityTime:  || 1000 * 60 * 3, /// How long to wait before declaring inactivity and disabling the notifier (default 3 minutes)
    ///notifyStart: require("path").join(__dirname, "notify-start.mp3"), /// The sound to play when notifying to look
    ///notifyEnd: require("path").join(__dirname, "notify-end.mp3"), /// The sound to play when looking is over
    ///notifyStartQuiet: require("path").join(__dirname, "notify-start-quiet.mp3"), /// The quieter sound to play when notifying to look
    ///notifyEndQuiet: require("path").join(__dirname, "notify-end-quiet.mp3"), /// The quiet sound to play when looking is over
    ///silenceOn: "", /// Disable notifications when certain keys have been pressed; options are "caps lock", "num lock", "scroll lock", "shift lock" to silence notifications when those are on (leave blank to disable)
    ///debugging: false, /// Print debugging info
    ///notifyVolumeLevel: 75, /// The volume level at which to send text notifications
    ///useQuiteSoundsAt: -1, /// The volume level at which to reduce the volume level to play the quiter notifications (-1 to disable quiet sound)
    ///binPath: "/usr/bin/", /// The base path to binary files
};
