"use strict";

module.exports = function getParams(booleans)
{
    var argv = process.argv;
    var i;
    var j;
    var params = {_: []};
    var last;
    var len = argv.length;
    var match;
    var arg;
    var argLen;
    
    booleans = booleans || [];
    
    for (i = 2; i < len; i += 1) {
        arg = argv[i];
        if (arg[0] === "-") {
            /// Handle --*
            if (arg[1] === "-") {
                /// Handle "--", which hands the rest of the args to another program.
                if (arg === "--") {
                    params["--"] = argv.slice(i + 1);
                    break;
                }
                last = arg.substr(2);
                match = last.match(/([^=]*)=(.*)/);
                if (match) {
                    last = match[1];
                    params[last] = match[2];
                    last = "";
                } else {
                    params[last] = true;
                }
            /// Handle -*
            } else {
                /// E.g., -hav should indicate h, a, and v as TRUE.
                argLen = arg.length;
                for (j = 1; j < argLen; ++j) {
                    last = arg[j];
                    if (last === "=") {
                        params[arg[j - 1]] = arg.substr(j + 1);
                        last = "";
                        break;
                    } else {
                        params[last] = true;
                    }
                }
            }
        } else if (last) {
            params[last] = arg;
            last = "";
        } else {
            params._.push(arg);
            last = "";
        }
        /// Handle booleans.
        if (last && booleans.indexOf(last) > -1) {
            last = "";
        }
    }
    
    return params;
};
