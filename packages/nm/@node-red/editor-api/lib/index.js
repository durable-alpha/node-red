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


 /**
  * This module provides an Express application to serve the Node-RED editor.
  *
  * It implements the Node-RED HTTP Admin API the Editor uses to interact
  * with the Node-RED runtime.
  *
  * @namespace @node-red/editor-api
  */

var bodyParser = require("body-parser");
var passport = require('passport');

var auth = require("./auth");
var apiUtil = require("./util");

var adminApp;
var server;
var editor;

/**
 * Initialise the module.
 * @param  {Object}     settings   The runtime settings
 * @param  {HTTPServer} _server     An instance of HTTP Server
 * @param  {Storage}    storage    An instance of Node-RED Storage
 * @param  {Runtime}    runtimeAPI An instance of Node-RED Runtime
 * @memberof @node-red/editor-api
 */
function init(settings,_server,storage,runtimeAPI) {
    server = _server;
    if (settings.httpAdminRoot !== false) {
        adminApp = apiUtil.createExpressApp(settings);

        var cors = require('cors');
        var corsHandler = cors({
           origin: "*",
           methods: "GET,PUT,POST,DELETE"
        });
        adminApp.use(corsHandler);

        if (settings.httpAdminMiddleware) {
            if (typeof settings.httpAdminMiddleware === "function" || Array.isArray(settings.httpAdminMiddleware)) {
                adminApp.use(settings.httpAdminMiddleware);
            }
        }

        auth.init(settings,storage);

        var maxApiRequestSize = settings.apiMaxLength || '5mb';
        adminApp.use(bodyParser.json({limit:maxApiRequestSize}));
        adminApp.use(bodyParser.urlencoded({limit:maxApiRequestSize,extended:true}));

        adminApp.get("/auth/login",auth.login,apiUtil.errorHandler);
        if (settings.adminAuth) {
            if (settings.adminAuth.type === "strategy") {
                auth.genericStrategy(adminApp,settings.adminAuth.strategy);
            } else if (settings.adminAuth.type === "credentials") {
                adminApp.use(passport.initialize());
                adminApp.post("/auth/token",
                    auth.ensureClientSecret,
                    auth.authenticateClient,
                    auth.getToken,
                    auth.errorHandler
                );
            } else if (settings.adminAuth.tokens) {
                adminApp.use(passport.initialize());
            }
            adminApp.post("/auth/revoke",auth.needsPermission(""),auth.revoke,apiUtil.errorHandler);
        }

        // Editor
        if (!settings.disableEditor) {
            editor = require("./editor");
            var editorApp = editor.init(server, settings, runtimeAPI);
            adminApp.use(editorApp);
        }

        if (settings.httpAdminCors) {
            var corsHandler = cors(settings.httpAdminCors);
            adminApp.use(corsHandler);
        }

        var adminApiApp = require("./admin").init(settings, runtimeAPI);
        adminApp.use(adminApiApp);
    } else {
        adminApp = null;
    }
}

/**
 * Start the module.
 * @return {Promise} resolves when the application is ready to handle requests
 * @memberof @node-red/editor-api
 */
async function start() {
    if (editor) {
        return editor.start();
    }
}

/**
 * Stop the module.
 * @return {Promise} resolves when the application is stopped
 * @memberof @node-red/editor-api
 */
async function stop() {
    if (editor) {
        editor.stop();
    }
}

module.exports = {
    init,
    start,
    stop,

    /**
    * @memberof @node-red/editor-api
    * @mixes @node-red/editor-api_auth
    */
    auth: {
        needsPermission: auth.needsPermission
    },
    /**
     * The Express app used to serve the Node-RED Editor
     * @type ExpressApplication
     * @memberof @node-red/editor-api
     */
    get httpAdmin() { return adminApp; }
};
