/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/


RED.settings = (function () {

    var loadedSettings = {};
    var userSettings = {};
    var pendingSave;

    var hasLocalStorage = function () {
        try {
            return 'localStorage' in window && window['localStorage'] !== null;
        } catch (e) {
            return false;
        }
    };

    var set = function (key, value) {
        if (!hasLocalStorage()) {
            return;
        }
        if (key.startsWith("auth-tokens")) {
            localStorage.setItem(key+this.authTokensSuffix, JSON.stringify(value));
        } else {
            RED.utils.setMessageProperty(userSettings,key,value);
            saveUserSettings();
        }
    };

    /**
     * If the key is not set in the localStorage it returns <i>undefined</i>
     * Else return the JSON parsed value
     * @param key
     * @param defaultIfUndefined
     * @returns {*}
     */
    var get = function (key,defaultIfUndefined) {
        if (!hasLocalStorage()) {
            return undefined;
        }
        if (key.startsWith("auth-tokens")) {
            return JSON.parse(localStorage.getItem(key+this.authTokensSuffix));
        } else {
            var v;
            try { v = RED.utils.getMessageProperty(userSettings,key); } catch(err) {}
            if (v === undefined) {
                try { v = RED.utils.getMessageProperty(RED.settings,key); } catch(err) {}
            }
            if (v === undefined) {
                v = defaultIfUndefined;
            }
            return v;
        }
    };

    var remove = function (key) {
        if (!hasLocalStorage()) {
            return;
        }
        if (key.startsWith("auth-tokens")) {
            localStorage.removeItem(key+this.authTokensSuffix);
        } else {
            delete userSettings[key];
            saveUserSettings();
        }
    };

    var setProperties = function(data) {
        for (var prop in loadedSettings) {
            if (loadedSettings.hasOwnProperty(prop) && RED.settings.hasOwnProperty(prop)) {
                delete RED.settings[prop];
            }
        }
        for (prop in data) {
            if (data.hasOwnProperty(prop)) {
                RED.settings[prop] = data[prop];
            }
        }
        loadedSettings = data;
    };

    var setUserSettings = function(data) {
        userSettings = data;
    }

    var init = function (options, done) {
        var accessTokenMatch = /[?&]access_token=(.*?)(?:$|&)/.exec(window.location.search);
        var path=window.location.pathname.slice(0,-1);
        RED.settings.authTokensSuffix=path.replace(/\//g, '-');
        if (accessTokenMatch) {
            var accessToken = accessTokenMatch[1];
            RED.settings.set("auth-tokens",{access_token: accessToken});
            window.location.search = "";
        }
        RED.settings.apiRootUrl = options.apiRootUrl;

        $.ajaxSetup({
            beforeSend: function(jqXHR,settings) {
                // Only attach auth header for requests to relative paths
                if (!/^\s*(https?:|\/|\.)/.test(settings.url)) {
                    if (options.apiRootUrl) {
                        settings.url = options.apiRootUrl+settings.url;
                    }
                    var auth_tokens = RED.settings.get("auth-tokens");
                    if (auth_tokens) {
                        jqXHR.setRequestHeader("Authorization","Bearer "+auth_tokens.access_token);
                    }
                    jqXHR.setRequestHeader("Node-RED-API-Version","v2");
                }
            }
        });

        load(done);
    }

    var refreshSettings = function(done) {
        $.ajax({
            headers: {
                "Accept": "application/json"
            },
            dataType: "json",
            cache: false,
            url: 'settings',
            success: function (data) {
                setProperties(data);
                done(null, data);
            },
            error: function(jqXHR,textStatus,errorThrown) {
                if (jqXHR.status === 401) {
                    if (/[?&]access_token=(.*?)(?:$|&)/.test(window.location.search)) {
                        window.location.search = "";
                    }
                    RED.user.login(function() { refreshSettings(done); });
                } else {
                    console.log("Unexpected error loading settings:",jqXHR.status,textStatus);
                }
            }
        });
    }
    var load = function(done) {
        refreshSettings(function(err, data) {
            if (!err) {
                if (!RED.settings.user || RED.settings.user.anonymous) {
                    RED.settings.remove("auth-tokens");
                }
                console.log("Node-RED: " + data.version);
                console.groupCollapsed("Versions");
                console.log("jQuery",$().jquery)
                console.log("jQuery UI",$.ui.version);
                if(window.ace) { console.log("ACE",ace.version); }
                if(window.monaco) { console.log("MONACO",monaco.version || "unknown"); }
                console.log("D3",d3.version);
                console.groupEnd();
                loadUserSettings(done);
            }
        })
    };

    function loadUserSettings(done) {
        $.ajax({
            headers: {
                "Accept": "application/json"
            },
            dataType: "json",
            cache: false,
            url: 'settings/user',
            success: function (data) {
                setUserSettings(data);
                done();
            },
            error: function(jqXHR,textStatus,errorThrown) {
                console.log("Unexpected error loading user settings:",jqXHR.status,textStatus);
            }
        });
    }

    function saveUserSettings() {
        if (RED.user.hasPermission("settings.write")) {
            if (pendingSave) {
                clearTimeout(pendingSave);
            }
            pendingSave = setTimeout(function() {
                pendingSave = null;
                $.ajax({
                    method: 'POST',
                    contentType: 'application/json',
                    url: 'settings/user',
                    data: JSON.stringify(userSettings),
                    success: function (data) {
                    },
                    error: function(jqXHR,textStatus,errorThrown) {
                        console.log("Unexpected error saving user settings:",jqXHR.status,textStatus);
                    }
                });
            },300);
        }
    }

    function theme(property,defaultValue) {
        if (!RED.settings.editorTheme) {
            return defaultValue;
        }
        var parts = property.split(".");
        var v = RED.settings.editorTheme;
        try {
            for (var i=0;i<parts.length;i++) {
                v = v[parts[i]];
            }
            if (v === undefined) {
                return defaultValue;
            }
            return v;
        } catch(err) {
            return defaultValue;
        }
    }
    function getLocal(key) {
        return localStorage.getItem(key)
    }
    function setLocal(key, value) {
        localStorage.setItem(key, value);
    }
    function removeLocal(key) {
        localStorage.removeItem(key)
    }


    return {
        init: init,
        load: load,
        loadUserSettings: loadUserSettings,
        refreshSettings: refreshSettings,
        set: set,
        get: get,
        remove: remove,
        theme: theme,
        setLocal: setLocal,
        getLocal: getLocal,
        removeLocal: removeLocal
    }
})();
