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

var nodes = require("./nodes");
var flows = require("./flows");
var flow = require("./flow");
var context = require("./context");
var auth = require("../auth");
var info = require("./settings");
var plugins = require("./plugins");
var diagnostics = require("./diagnostics");

const FLOWS_BASE_PATH = process.env.NR_FLOWS_BASE_PATH || "/flows";

var apiUtil = require("../util");

module.exports = {
    init: function(settings,runtimeAPI) {
        flows.init(runtimeAPI);
        flow.init(runtimeAPI);
        nodes.init(runtimeAPI);
        context.init(runtimeAPI);
        info.init(settings,runtimeAPI);
        plugins.init(runtimeAPI);
        diagnostics.init(settings, runtimeAPI);

        const needsPermission = auth.needsPermission;

        const adminApp = apiUtil.createExpressApp(settings)

        // Flows
        adminApp.get(FLOWS_BASE_PATH, needsPermission("flows.read"), flows.get, apiUtil.errorHandler);
        adminApp.post(FLOWS_BASE_PATH, needsPermission("flows.write"), flows.post, apiUtil.errorHandler);

        // Flows/state
        adminApp.get(`${FLOWS_BASE_PATH}/state`, needsPermission("flows.read"), flows.getState, apiUtil.errorHandler);
        if (settings.runtimeState && settings.runtimeState.enabled === true) {
            adminApp.post(`${FLOWS_BASE_PATH}/state`, needsPermission("flows.write"), flows.postState, apiUtil.errorHandler);
        }

        // Flow
        adminApp.get("/flow/:id",needsPermission("flows.read"),flow.get,apiUtil.errorHandler);
        adminApp.post("/flow",needsPermission("flows.write"),flow.post,apiUtil.errorHandler);
        adminApp.delete("/flow/:id",needsPermission("flows.write"),flow.delete,apiUtil.errorHandler);
        adminApp.put("/flow/:id",needsPermission("flows.write"),flow.put,apiUtil.errorHandler);

        // Nodes
        adminApp.get("/nodes",needsPermission("nodes.read"),nodes.getAll,apiUtil.errorHandler);

        if (!settings.externalModules || !settings.externalModules.palette || settings.externalModules.palette.allowInstall !== false) {
            if (!settings.externalModules || !settings.externalModules.palette || settings.externalModules.palette.allowUpload !== false) {
                const multer  = require('multer');
                const upload = multer({ storage: multer.memoryStorage() });
                adminApp.post("/nodes",needsPermission("nodes.write"),upload.single("tarball"),nodes.post,apiUtil.errorHandler);
            } else {
                adminApp.post("/nodes",needsPermission("nodes.write"),nodes.post,apiUtil.errorHandler);
            }
        }
        adminApp.get(/^\/nodes\/messages/,needsPermission("nodes.read"),nodes.getModuleCatalogs,apiUtil.errorHandler);
        adminApp.get(/^\/nodes\/((@[^\/]+\/)?[^\/]+\/[^\/]+)\/messages/,needsPermission("nodes.read"),nodes.getModuleCatalog,apiUtil.errorHandler);
        adminApp.get(/^\/nodes\/((@[^\/]+\/)?[^\/]+)$/,needsPermission("nodes.read"),nodes.getModule,apiUtil.errorHandler);
        adminApp.put(/^\/nodes\/((@[^\/]+\/)?[^\/]+)$/,needsPermission("nodes.write"),nodes.putModule,apiUtil.errorHandler);
        adminApp.delete(/^\/nodes\/((@[^\/]+\/)?[^\/]+)$/,needsPermission("nodes.write"),nodes.delete,apiUtil.errorHandler);
        adminApp.get(/^\/nodes\/((@[^\/]+\/)?[^\/]+)\/([^\/]+)$/,needsPermission("nodes.read"),nodes.getSet,apiUtil.errorHandler);
        adminApp.put(/^\/nodes\/((@[^\/]+\/)?[^\/]+)\/([^\/]+)$/,needsPermission("nodes.write"),nodes.putSet,apiUtil.errorHandler);

        // Context
        adminApp.get("/context/:scope(global)",needsPermission("context.read"),context.get,apiUtil.errorHandler);
        adminApp.get("/context/:scope(global)/*",needsPermission("context.read"),context.get,apiUtil.errorHandler);
        adminApp.get("/context/:scope(node|flow)/:id",needsPermission("context.read"),context.get,apiUtil.errorHandler);
        adminApp.get("/context/:scope(node|flow)/:id/*",needsPermission("context.read"),context.get,apiUtil.errorHandler);

        // adminApp.delete("/context/:scope(global)",needsPermission("context.write"),context.delete,apiUtil.errorHandler);
        adminApp.delete("/context/:scope(global)/*",needsPermission("context.write"),context.delete,apiUtil.errorHandler);
        // adminApp.delete("/context/:scope(node|flow)/:id",needsPermission("context.write"),context.delete,apiUtil.errorHandler);
        adminApp.delete("/context/:scope(node|flow)/:id/*",needsPermission("context.write"),context.delete,apiUtil.errorHandler);

        adminApp.get("/settings",needsPermission("settings.read"),info.runtimeSettings,apiUtil.errorHandler);

        // Plugins
        adminApp.get("/plugins", needsPermission("plugins.read"), plugins.getAll, apiUtil.errorHandler);
        adminApp.get("/plugins/messages", needsPermission("plugins.read"), plugins.getCatalogs, apiUtil.errorHandler);
        adminApp.get(/^\/plugins\/((@[^\/]+\/)?[^\/]+)\/([^\/]+)$/,needsPermission("plugins.read"),plugins.getConfig,apiUtil.errorHandler);

        adminApp.get("/diagnostics", needsPermission("diagnostics.read"), diagnostics.getReport, apiUtil.errorHandler);

        return adminApp;
    }
}
