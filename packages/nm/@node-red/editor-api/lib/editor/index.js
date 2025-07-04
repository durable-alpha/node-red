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

var path = require('path');

var comms = require("./comms");
var info = require("./settings");

var auth = require("../auth");
var nodes = require("../admin/nodes"); // TODO: move /icons into here
var needsPermission;
var runtimeAPI;
var log = require("@node-red/util").log;
var i18n = require("@node-red/util").i18n;

var apiUtil = require("../util");

var ensureRuntimeStarted = function(req,res,next) {
    runtimeAPI.isStarted().then( started => {
        if (!started) {
            log.error("Node-RED runtime not started");
            res.status(503).send("Not started");
        } else {
            next()
        }
    })
}

module.exports = {
    init: function(server, settings, _runtimeAPI) {
        runtimeAPI = _runtimeAPI;
        needsPermission = auth.needsPermission;
        if (!settings.disableEditor) {
            info.init(settings, runtimeAPI);
            comms.init(server,settings,runtimeAPI);

            var ui = require("./ui");

            ui.init(settings, runtimeAPI);

            const editorApp = apiUtil.createExpressApp(settings)

            if (settings.requireHttps === true) {
                editorApp.enable('trust proxy');
                editorApp.use(function (req, res, next) {
                    if (req.secure) {
                        next();
                    } else {
                        res.redirect('https://' + req.headers.host + req.originalUrl);
                    }
                });
            }
            var defaultServerSettings = {
                "x-powered-by": false
            }
            var serverSettings = Object.assign({},defaultServerSettings,settings.httpServerOptions||{});
            for (var eOption in serverSettings) {
                editorApp.set(eOption, serverSettings[eOption]);
            }
            editorApp.get("/",ensureRuntimeStarted,ui.ensureSlash,ui.editor);

            editorApp.get("/icons",needsPermission("nodes.read"),nodes.getIcons,apiUtil.errorHandler);
            editorApp.get("/icons/:module/:icon",ui.icon);
            editorApp.get("/icons/:scope/:module/:icon",ui.icon);

            editorApp.get(/^\/resources\/((?:@[^\/]+\/)?[^\/]+)\/(.+)$/,ui.moduleResource);

            var theme = require("./theme");
            theme.init(settings, runtimeAPI);
            editorApp.use("/theme",theme.app());
            editorApp.use("/",ui.editorResources);

            //Projects
            var projects = require("./projects");
            projects.init(settings, runtimeAPI);
            editorApp.use("/projects",projects.app());

            // Locales
            var locales = require("./locales");
            locales.init(runtimeAPI);
            editorApp.get(/^\/locales\/(.+)\/?$/,locales.get,apiUtil.errorHandler);

            // Library
            var library = require("./library");
            library.init(runtimeAPI);
            // editorApp.get("/library/:id",needsPermission("library.read"),library.getLibraryConfig);
            editorApp.get(/^\/library\/([^\/]+)\/([^\/]+)(?:$|\/(.*))/,needsPermission("library.read"),library.getEntry);
            editorApp.post(/^\/library\/([^\/]+)\/([^\/]+)\/(.*)/,needsPermission("library.write"),library.saveEntry);


            // Credentials
            var credentials = require("./credentials");
            credentials.init(runtimeAPI);
            editorApp.get('/credentials/:type/:id', needsPermission("credentials.read"),credentials.get,apiUtil.errorHandler);

            // Settings
            //  Main /settings route is an admin route - see lib/admin/settings.js
            // User Settings
            editorApp.get("/settings/user",needsPermission("settings.read"),info.userSettings,apiUtil.errorHandler);
            // User Settings
            editorApp.post("/settings/user",needsPermission("settings.write"),info.updateUserSettings,apiUtil.errorHandler);
            // SSH keys
            editorApp.use("/settings/user/keys",needsPermission("settings.write"),info.sshkeys());

            return editorApp;
        }
    },
    start: function() {
        var catalogPath = path.resolve(path.join(path.dirname(require.resolve("@node-red/editor-client")),"locales"));
        return i18n.registerMessageCatalogs([
            {namespace: "editor",   dir: catalogPath, file:"editor.json"},
            {namespace: "jsonata",  dir: catalogPath, file:"jsonata.json"},
            {namespace: "infotips", dir: catalogPath, file:"infotips.json"}
        ]).then(function(){
            comms.start();
        });
    },
    stop: comms.stop
}
