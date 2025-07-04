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

 //var UglifyJS = require("uglify-js");
const path = require("path");
const fs = require("fs");

var library = require("./library");
const {events} = require("@node-red/util")
var subflows = require("./subflow");
var externalModules = require("./externalModules")
var settings;
var loader;

var nodeConfigCache = {};
var moduleConfigs = {};
var nodeList = [];
var nodeConstructors = {};
var nodeOptions = {};
var subflowModules = {};

var nodeTypeToId = {};
var moduleNodes = {};

function init(_settings,_loader) {
    settings = _settings;
    loader = _loader;
    clear();
}

function load() {
    if (settings.available()) {
        moduleConfigs = loadNodeConfigs();
    } else {
        moduleConfigs = {};
    }
}

function filterNodeInfo(n) {
    var r = {
        id: n.id||n.module+"/"+n.name,
        name: n.name,
        types: n.types,
        enabled: n.enabled,
        local: n.local||false,
        user: n.user || false
    };
    if (n.hasOwnProperty("module")) {
        r.module = n.module;
    }
    if (n.hasOwnProperty("err")) {
        r.err = n.err;
    }
    if (n.hasOwnProperty("plugins")) {
        r.plugins = n.plugins.map(p => {
            return {
                id: p.id,
                type: p.type,
                module: p.module
            }
        });
    }
    if (n.type === "plugin") {
        r.editor = !!n.template;
        r.runtime = !!n.file;
    }
    return r;
}



function getModuleFromSetId(id) {
    var parts = id.split("/");
    return parts.slice(0,parts.length-1).join("/");
}

function getNodeFromSetId(id) {
    var parts = id.split("/");
    return parts[parts.length-1];
}

function saveNodeList() {
    var moduleList = {};
    var hadPending = false;
    var hasPending = false;
    for (var module in moduleConfigs) {
        /* istanbul ignore else */
        if (moduleConfigs.hasOwnProperty(module)) {
            if (Object.keys(moduleConfigs[module].nodes).length > 0) {
                if (!moduleList[module]) {
                    moduleList[module] = {
                        name: module,
                        version: moduleConfigs[module].version,
                        local: moduleConfigs[module].local||false,
                        user: moduleConfigs[module].user||false,
                        nodes: {}
                    };
                    if (moduleConfigs[module].hasOwnProperty('pending_version')) {
                        hadPending = true;
                        if (moduleConfigs[module].pending_version !== moduleConfigs[module].version) {
                            moduleList[module].pending_version = moduleConfigs[module].pending_version;
                            hasPending = true;
                        } else {
                            delete moduleConfigs[module].pending_version;
                        }
                    }
                }
                var nodes = moduleConfigs[module].nodes;
                for(var node in nodes) {
                    /* istanbul ignore else */
                    if (nodes.hasOwnProperty(node)) {
                        var config = nodes[node];
                        var n = filterNodeInfo(config);
                        delete n.err;
                        delete n.file;
                        delete n.id;
                        n.file = config.file;
                        moduleList[module].nodes[node] = n;
                    }
                }
            }
        }
    }
    if (hadPending && !hasPending) {
        events.emit("runtime-event",{id:"restart-required",retain: true});
    }
    if (settings.available()) {
        return settings.set("nodes",moduleList);
    } else {
        return Promise.reject("Settings unavailable");
    }
}

function loadNodeConfigs() {
    var configs = settings.get("nodes");

    if (!configs) {
        return {};
    } else if (configs['node-red']) {
        return configs;
    } else {
        // Migrate from the 0.9.1 format of settings
        var newConfigs = {};
        for (var id in configs) {
            /* istanbul ignore else */
            if (configs.hasOwnProperty(id)) {
                var nodeConfig = configs[id];
                var moduleName;
                var nodeSetName;

                if (nodeConfig.module) {
                    moduleName = nodeConfig.module;
                    nodeSetName = nodeConfig.name.split(":")[1];
                } else {
                    moduleName = "node-red";
                    nodeSetName = nodeConfig.name.replace(/^\d+-/,"").replace(/\.js$/,"");
                }

                if (!newConfigs[moduleName]) {
                    newConfigs[moduleName] = {
                        name: moduleName,
                        nodes:{}
                    };
                }
                newConfigs[moduleName].nodes[nodeSetName] = {
                    name: nodeSetName,
                    types: nodeConfig.types,
                    enabled: nodeConfig.enabled,
                    module: moduleName
                };
            }
        }
        settings.set("nodes",newConfigs);
        return newConfigs;
    }
}

function addModule(module) {
    moduleNodes[module.name] = [];
    moduleConfigs[module.name] = module;
    for (const setName in module.nodes) {
        if (module.nodes.hasOwnProperty(setName)) {
            const set = module.nodes[setName];
            if (!set.types) {
                const err = new Error("Set has no types")
                err.code = "set_has_no_types"
                err.details = {
                    ...set
                }
                set.err = err
            }
            moduleNodes[module.name].push(set.name);
            nodeList.push(set.id);
            if (!set.err) {
                set.types.forEach(function(t) {
                    if (nodeTypeToId.hasOwnProperty(t)) {
                        set.err = new Error("Type already registered");
                        set.err.code = "type_already_registered";
                        set.err.details = {
                            type: t,
                            moduleA: getNodeInfo(t).module,
                            moduleB: set.module
                        }

                    }
                });
                if (!set.err) {
                    set.types.forEach(function(t) {
                        nodeTypeToId[t] = set.id;
                    });
                }
            }
        }
    }
    if (module.icons) {
        icon_paths[module.name] = icon_paths[module.name] || [];
        module.icons.forEach(icon=>icon_paths[module.name].push(path.resolve(icon.path)) )
    }
    if (module.examples) {
        library.addExamplesDir(module.name,module.examples.path);
    }
    nodeConfigCache = {};
}


function removeNode(id) {
    var config = moduleConfigs[getModuleFromSetId(id)].nodes[getNodeFromSetId(id)];
    if (!config) {
        throw new Error("Unrecognised id: "+id);
    }
    delete moduleConfigs[getModuleFromSetId(id)].nodes[getNodeFromSetId(id)];
    var i = nodeList.indexOf(id);
    if (i > -1) {
        nodeList.splice(i,1);
    }
    config.types.forEach(function(t) {
        var typeId = nodeTypeToId[t];
        if (typeId === id) {
            delete subflowModules[t];
            delete nodeConstructors[t];
            delete nodeOptions[t];
            delete nodeTypeToId[t];
        }
    });
    config.enabled = false;
    config.loaded = false;
    nodeConfigCache = {};
    return filterNodeInfo(config);
}

function removeModule(name,skipSave) {
    if (!settings.available()) {
        throw new Error("Settings unavailable");
    }
    var infoList = [];
    var module = moduleConfigs[name];
    var nodes = moduleNodes[name];
    if (!nodes) {
        throw new Error("Unrecognised module: "+name);
    }
    if (module.usedBy && module.usedBy > 0) {
        // We are removing a module that is used by other modules... so whilst
        // this module should be removed from the editor palette, it needs to
        // stay in the runtime... for now.
        module.user = false;
        for (var i=0;i<nodes.length;i++) {
            infoList.push(filterNodeInfo(nodes[i]));
        }
    } else {
        if (module.dependencies) {
            module.dependencies.forEach(function(dep) {
                // Check each dependency of this module to see if it is a non-user-installed
                // module that we can expect to disappear once npm uninstall is run
                if (!moduleConfigs[dep].user) {
                    moduleConfigs[dep].usedBy = moduleConfigs[dep].usedBy.filter(m => m !== name);
                    if (moduleConfigs[dep].usedBy.length === 0) {
                        // Remove the dependency
                        removeModule(dep,true);
                    }
                }
            });
        }
        for (var i=0;i<nodes.length;i++) {
            infoList.push(removeNode(name+"/"+nodes[i]));
        }
        delete moduleNodes[name];
        delete moduleConfigs[name];
    }
    if (!skipSave) {
        saveNodeList();
    }
    return infoList;
}

function getNodeInfo(typeOrId) {
    var id = typeOrId;
    if (nodeTypeToId.hasOwnProperty(typeOrId)) {
        id = nodeTypeToId[typeOrId];
    }
    /* istanbul ignore else */
    if (id) {
        var module = moduleConfigs[getModuleFromSetId(id)];
        if (module) {
            var config = module.nodes[getNodeFromSetId(id)];
            if (config) {
                var info = filterNodeInfo(config);
                if (config.hasOwnProperty("loaded")) {
                    info.loaded = config.loaded;
                }
                if (module.pending_version) {
                    info.pending_version = module.pending_version;
                }

                info.version = module.version;
                return info;
            }
        }
    }
    return null;
}

function getFullNodeInfo(typeOrId) {
    // Used by index.enableNodeSet so that .file can be retrieved to pass
    // to loader.loadNodeSet
    var id = typeOrId;
    if (nodeTypeToId.hasOwnProperty(typeOrId)) {
        id = nodeTypeToId[typeOrId];
    }
    /* istanbul ignore else */
    if (id) {
        var module = moduleConfigs[getModuleFromSetId(id)];
        if (module) {
            return module.nodes[getNodeFromSetId(id)];
        }
    }
    return null;
}

function getNodeList(filter) {
    var list = [];
    for (var module in moduleConfigs) {
        /* istanbul ignore else */
        if (moduleConfigs.hasOwnProperty(module)) {
            if (!moduleConfigs[module].user && (moduleConfigs[module].usedBy && moduleConfigs[module].usedBy.length > 0)) {
                continue;
            }
            var nodes = moduleConfigs[module].nodes;
            for (var node in nodes) {
                /* istanbul ignore else */
                if (nodes.hasOwnProperty(node)) {
                    var nodeInfo = filterNodeInfo(nodes[node]);
                    nodeInfo.version = moduleConfigs[module].version;
                    if (moduleConfigs[module].pending_version) {
                        nodeInfo.pending_version = moduleConfigs[module].pending_version;
                    }
                    if (!filter || filter(nodes[node])) {
                        list.push(nodeInfo);
                    }
                }
            }
        }
    }
    return list;
}

function getModuleList() {
    return moduleConfigs;
}
function getModule(id) {
    return moduleConfigs[id];
}

function getModuleInfo(module) {
    if (moduleNodes[module]) {
        var nodes = moduleNodes[module];
        var m = {
            name: module,
            version: moduleConfigs[module].version,
            local: moduleConfigs[module].local,
            user: moduleConfigs[module].user,
            path: moduleConfigs[module].path,
            nodes: [],
            plugins: []
        };
        if (moduleConfigs[module].dependencies) {
            m.dependencies = moduleConfigs[module].dependencies;
        }
        if (moduleConfigs[module] && moduleConfigs[module].pending_version) {
            m.pending_version = moduleConfigs[module].pending_version;
        }
        for (var i = 0; i < nodes.length; ++i) {
            var nodeInfo = filterNodeInfo(moduleConfigs[module].nodes[nodes[i]]);
            nodeInfo.version = m.version;
            m.nodes.push(nodeInfo);
        }

        let plugins = Object.values(moduleConfigs[module].plugins ?? {});
        plugins.forEach((plugin) => {
            let nodeInfo = filterNodeInfo(plugin);
            nodeInfo.version = m.version;
            m.plugins.push(nodeInfo);
        });

        return m;
    } else {
        return null;
    }
}

function getCaller(){
    var orig = Error.prepareStackTrace;
    Error.prepareStackTrace = function(_, stack){ return stack; };
    var err = new Error();
    Error.captureStackTrace(err, arguments.callee);
    var stack = err.stack;
    Error.prepareStackTrace = orig;
    stack.shift();
    stack.shift();
    return stack[0].getFileName();
}

function registerNodeConstructor(nodeSet,type,constructor,options) {
    if (nodeConstructors.hasOwnProperty(type)) {
        throw new Error(type+" already registered");
    }
    //TODO: Ensure type is known - but doing so will break some tests
    //      that don't have a way to register a node template ahead
    //      of registering the constructor

    var nodeSetInfo = getFullNodeInfo(nodeSet);
    if (nodeSetInfo) {
        if (nodeSetInfo.types.indexOf(type) === -1) {
            // A type is being registered for a known set, but for some reason
            // we didn't spot it when parsing the HTML file.
            // Registered a type is the definitive action - not the presence
            // of an edit template. Ensure it is on the list of known types.
            nodeSetInfo.types.push(type);
        }
    }

    nodeConstructors[type] = constructor;
    nodeOptions[type] = options;
    if (options) {
        if (options.dynamicModuleList) {
            externalModules.register(type,options.dynamicModuleList);
        }
    }
    events.emit("type-registered",type);
}

function registerSubflow(nodeSet, subflow) {
    var nodeSetInfo = getFullNodeInfo(nodeSet);

    const result = subflows.register(nodeSet,subflow);

    if (subflowModules.hasOwnProperty(result.type)) {
        throw new Error(result.type+" already registered");
    }

    if (nodeSetInfo) {
        if (nodeSetInfo.types.indexOf(result.type) === -1) {
            nodeSetInfo.types.push(result.type);
            nodeTypeToId[result.type] = nodeSetInfo.id;
        }
        nodeSetInfo.config = result.config;
    }
    subflowModules[result.type] = result;
    externalModules.registerSubflow(result.type,subflow);


    events.emit("type-registered",result.type);
    return result;
}

function getAllNodeConfigs(lang) {
    if (!nodeConfigCache[lang]) {
        var result = "";
        var script = "";
        for (var i=0;i<nodeList.length;i++) {
            var id = nodeList[i];
            var module = moduleConfigs[getModuleFromSetId(id)]
            if (!module.user && (module.usedBy && module.usedBy.length > 0)) {
                continue;
            }
            var config = module.nodes[getNodeFromSetId(id)];
            if (config.enabled && !config.err) {
                result += "\n<!-- --- [red-module:"+id+"] --- -->\n";
                result += config.config;
                result += loader.getNodeHelp(config,lang||"en-US")||"";
                //script += config.script;
            }
        }
        //if (script.length > 0) {
        //    result += '<script type="text/javascript">';
        //    result += UglifyJS.minify(script, {fromString: true}).code;
        //    result += '</script>';
        //}
        nodeConfigCache[lang] = result;
    }
    return nodeConfigCache[lang];
}

function getNodeConfig(id,lang) {
    var config = moduleConfigs[getModuleFromSetId(id)];
    if (!config) {
        return null;
    }
    config = config.nodes[getNodeFromSetId(id)];
    if (config) {
        var result = "<!-- --- [red-module:"+id+"] --- -->\n"+config.config;
        result += loader.getNodeHelp(config,lang||"en-US")

        //if (config.script) {
        //    result += '<script type="text/javascript">'+config.script+'</script>';
        //}
        return result;
    } else {
        return null;
    }
}

function getNodeConstructor(type) {
    var id = nodeTypeToId[type];

    var config;
    if (typeof id === "undefined") {
        config = undefined;
    } else {
        config = moduleConfigs[getModuleFromSetId(id)].nodes[getNodeFromSetId(id)];
    }

    if (!config || (config.enabled && !config.err)) {
        return nodeConstructors[type] || subflowModules[type];
    }
    return null;
}

function clear() {
    nodeConfigCache = {};
    moduleConfigs = {};
    nodeList = [];
    nodeConstructors = {};
    nodeOptions = {};
    subflowModules = {};
    nodeTypeToId = {};
}

function getTypeId(type) {
    if (nodeTypeToId.hasOwnProperty(type)) {
        return nodeTypeToId[type];
    } else {
        return null;
    }
}

function enableNodeSet(typeOrId) {
    if (!settings.available()) {
        throw new Error("Settings unavailable");
    }

    var id = typeOrId;
    if (nodeTypeToId.hasOwnProperty(typeOrId)) {
        id = nodeTypeToId[typeOrId];
    }
    var config;
    try {
        config = moduleConfigs[getModuleFromSetId(id)].nodes[getNodeFromSetId(id)];
        delete config.err;
        config.enabled = true;
        nodeConfigCache = {};
        settings.enableNodeSettings(config.types);
        return saveNodeList().then(function() {
            return filterNodeInfo(config);
        });
    } catch (err) {
        throw new Error("Unrecognised id: "+typeOrId);
    }
}

function disableNodeSet(typeOrId) {
    if (!settings.available()) {
        throw new Error("Settings unavailable");
    }
    var id = typeOrId;
    if (nodeTypeToId.hasOwnProperty(typeOrId)) {
        id = nodeTypeToId[typeOrId];
    }
    var config;
    try {
        config = moduleConfigs[getModuleFromSetId(id)].nodes[getNodeFromSetId(id)];
        // TODO: persist setting
        config.enabled = false;
        nodeConfigCache = {};
        settings.disableNodeSettings(config.types);
        return saveNodeList().then(function() {
            return filterNodeInfo(config);
        });
    } catch (err) {
        throw new Error("Unrecognised id: "+id);
    }
}

function cleanModuleList() {
    var removed = false;
    for (var mod in moduleConfigs) {
        /* istanbul ignore else */
        if (moduleConfigs.hasOwnProperty(mod)) {
            var nodes = moduleConfigs[mod].nodes;
            var node;
            if (mod == "node-red") {
                // For core nodes, look for nodes that are enabled, !loaded and !errored
                for (node in nodes) {
                    /* istanbul ignore else */
                    if (nodes.hasOwnProperty(node)) {
                        var n = nodes[node];
                        if (n.enabled && !n.err && !n.loaded) {
                            removeNode(mod+"/"+node);
                            removed = true;
                        }
                    }
                }
            } else {
                if (moduleConfigs[mod] && !moduleNodes[mod]) {
                    // For node modules, look for missing ones
                    for (node in nodes) {
                        /* istanbul ignore else */
                        if (nodes.hasOwnProperty(node)) {
                            removeNode(mod+"/"+node);
                            removed = true;
                        }
                    }
                    delete moduleConfigs[mod];
                }
            }
        }
    }
    if (removed) {
        saveNodeList();
    }
}
function setModulePendingUpdated(module,version) {
    moduleConfigs[module].pending_version = version;
    return saveNodeList().then(function() {
        return getModuleInfo(module);
    });
}

function setUserInstalled(module,userInstalled) {
    moduleConfigs[module].user = userInstalled;
    return saveNodeList().then(function() {
        return getModuleInfo(module);
    });
}
function addModuleDependency(module,usedBy) {
    moduleConfigs[module].usedBy = moduleConfigs[module].usedBy || [];
    moduleConfigs[module].usedBy.push(usedBy);
}

var icon_paths = { };
var iconCache = {};

function getNodeIconPath(module,icon) {
    if (/\.\./.test(icon)) {
        throw new Error();
    }
    var iconName = module+"/"+icon;
    if (iconCache[iconName]) {
        return iconCache[iconName];
    } else {
        var paths = icon_paths[module];
        if (paths) {
            for (var p=0;p<paths.length;p++) {
                var iconPath = path.join(paths[p],icon);
                try {
                    fs.statSync(iconPath);
                    iconCache[iconName] = iconPath;
                    return iconPath;
                } catch(err) {
                    // iconPath doesn't exist
                }
            }
        }
        if (module !== "node-red") {
            return getNodeIconPath("node-red", icon);
        }
        return null;
    }
}

function getNodeIcons() {
    var iconList = {};
    for (var module in moduleConfigs) {
        if (moduleConfigs.hasOwnProperty(module)) {
            if (moduleConfigs[module].icons) {
                iconList[module] = [];
                moduleConfigs[module].icons.forEach(icon=>{ iconList[module] = iconList[module].concat(icon.icons)})
            }
        }
    }
    return iconList;
}

function getModuleResource(module, resourcePath) {
    let mod = moduleConfigs[module];
    if (mod && mod.resources) {
        let basePath = mod.resources.path;
        let fullPath = path.join(basePath,resourcePath);
        if (/^\.\./.test(path.relative(basePath,fullPath))) {
            return null;
        }
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
    }
    return null;
}

var registry = module.exports = {
    init: init,
    load: load,
    clear: clear,

    registerNodeConstructor: registerNodeConstructor,
    getNodeConstructor: getNodeConstructor,

    registerSubflow: registerSubflow,

    addModule: addModule,

    enableNodeSet: enableNodeSet,
    disableNodeSet: disableNodeSet,

    setModulePendingUpdated: setModulePendingUpdated,
    setUserInstalled: setUserInstalled,
    addModuleDependency:addModuleDependency,

    removeModule: removeModule,

    getNodeInfo: getNodeInfo,
    getFullNodeInfo: getFullNodeInfo,
    getNodeList: getNodeList,
    getModuleList: getModuleList,
    getModule: getModule,
    getModuleInfo: getModuleInfo,

    getNodeIconPath: getNodeIconPath,
    getNodeIcons: getNodeIcons,
    getModuleResource: getModuleResource,

    /**
     * Gets all of the node template configs
     * @return all of the node templates in a single string
     */
    getAllNodeConfigs: getAllNodeConfigs,
    getNodeConfig: getNodeConfig,

    getTypeId: getTypeId,

    saveNodeList: saveNodeList,

    cleanModuleList: cleanModuleList,
    getModuleFromSetId: getModuleFromSetId,
    getNodeFromSetId: getNodeFromSetId,
    filterNodeInfo: filterNodeInfo
};
