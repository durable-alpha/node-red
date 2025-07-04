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

var fs = require("fs-extra");
var path = require("path");
var semver = require("semver");

var localfilesystem = require("./localfilesystem");
var registry = require("./registry");
var registryUtil = require("./util")
var i18n = require("@node-red/util").i18n;
var log = require("@node-red/util").log;

var settings;

function init(_runtime) {
    settings = _runtime.settings;
    localfilesystem.init(settings);
    registryUtil.init(_runtime);
}

function load(disableNodePathScan) {
    // To skip node scan, the following line will use the stored node list.
    // We should expose that as an option at some point, although the
    // performance gains are minimal.
    //return loadModuleFiles(registry.getModuleList());
    log.info(log._("server.loading"));

    var modules = localfilesystem.getNodeFiles(disableNodePathScan);
    return loadModuleFiles(modules);
}

function splitPath(p) {
    return path.posix.normalize((p || '').replace(/\\/g, path.sep)).split(path.sep)
}

function loadModuleTypeFiles(module, type) {
    const things = module[type];
    let first = true;
    const promises = [];
    for (let thingName in things) {
        /* istanbul ignore else */
        if (things.hasOwnProperty(thingName)) {
            if (module.name != "node-red" && first) {
                // Check the module directory exists
                first = false;
                let moduleFn = module.path
                const fn = things[thingName].file
                const parts = splitPath(fn)
                const nmi = parts.indexOf('node_modules')
                if(nmi > -1) {
                    moduleFn = parts.slice(0,nmi+2).join(path.sep);
                }
                if (!moduleFn) {
                    // shortcut - skip calling statSync on empty string 
                    break; // Module not found, don't attempt to load its nodes
                }
                try {
                    const stat = fs.statSync(moduleFn);
                } catch(err) {
                    break; // Module not found, don't attempt to load its nodes
                }
            }

            try {
                let promise;
                if (type === "nodes") {
                    promise = loadNodeConfig(things[thingName]);
                } else if (type === "plugins") {
                    promise = loadPluginConfig(things[thingName]);
                }
                promises.push(
                    promise.then(
                        (function() {
                            const n = thingName;
                            return function(nodeSet) {
                                things[n] = nodeSet;
                                return nodeSet;
                            }
                        })()
                    ).catch(err => {console.log(err)})
                );
            } catch(err) {
                console.log(err)
            }
        }
    }
    return promises;
}

function loadModuleFiles(modules) {
    var pluginPromises = [];
    var nodePromises = [];
    for (var module in modules) {
        /* istanbul ignore else */
        if (modules.hasOwnProperty(module)) {
            if (modules[module].redVersion &&
                !semver.satisfies((settings.version||"0.0.0").replace(/(\-[1-9A-Za-z-][0-9A-Za-z-\.]*)?(\+[0-9A-Za-z-\.]+)?$/,""), modules[module].redVersion)) {
                //TODO: log it
                log.warn("["+module+"] "+log._("server.node-version-mismatch",{version:modules[module].redVersion}));
                modules[module].err = "version_mismatch";
                continue;
            }
            if (module == "node-red" || !registry.getModuleInfo(module)) {
                if (modules[module].nodes) {
                    nodePromises = nodePromises.concat(loadModuleTypeFiles(modules[module], "nodes"));
                }
                if (modules[module].plugins) {
                    pluginPromises = pluginPromises.concat(loadModuleTypeFiles(modules[module], "plugins"));
                }
            }
        }
    }
    var pluginList;
    var nodeList;
    return Promise.all(pluginPromises).then(function(results) {
        pluginList = results.filter(r => !!r);
        return Promise.all(nodePromises)
    }).then(function(results) {
        nodeList = results.filter(r => !!r);
        // Initial node load has happened. Ensure remaining modules are in the registry
        for (var module in modules) {
            if (modules.hasOwnProperty(module)) {
                if (!modules[module].err) {
                    registry.addModule(modules[module]);
                }
            }
        }
    }).then(function() {
        return loadNodeSetList(pluginList);
    }).then(function() {
        return loadNodeSetList(nodeList);
    }).then(function () {
        if (settings.available()) {
            return registry.saveNodeList();
        } else {
            return
        }
    })
}

async function loadPluginTemplate(plugin) {
    return fs.readFile(plugin.template,'utf8').then(content => {
        plugin.config = content;
        return plugin;
    }).catch(err => {
        if (err.code === 'ENOENT') {
            plugin.err = "Error: "+plugin.template+" does not exist";
        } else {
            plugin.err = err.toString();
        }
        return plugin;
    });
}

async function loadNodeTemplate(node) {
    return fs.readFile(node.template,'utf8').then(content => {
        var types = [];

        var regExp = /<script (?:[^>]*)data-template-name\s*=\s*['"]([^'"]*)['"]/gi;
        var match = null;

        while ((match = regExp.exec(content)) !== null) {
            types.push(match[1]);
        }
        node.types = types;

        var langRegExp = /^<script[^>]* data-lang\s*=\s*['"](.+?)['"]/i;
        regExp = /(<script[^>]* data-help-name=[\s\S]*?<\/script>)/gi;
        match = null;
        var mainContent = "";
        var helpContent = {};
        var index = 0;
        while ((match = regExp.exec(content)) !== null) {
            mainContent += content.substring(index,regExp.lastIndex-match[1].length);
            index = regExp.lastIndex;
            var help = content.substring(regExp.lastIndex-match[1].length,regExp.lastIndex);

            var lang = i18n.defaultLang;
            if ((match = langRegExp.exec(help)) !== null) {
                lang = match[1];
            }
            if (!helpContent.hasOwnProperty(lang)) {
                helpContent[lang] = "";
            }

            helpContent[lang] += help;
        }
        mainContent += content.substring(index);

        node.config = mainContent;
        node.help = helpContent;
        // TODO: parse out the javascript portion of the template
        //node.script = "";
        for (var i=0;i<node.types.length;i++) {
            if (registry.getTypeId(node.types[i])) {
                node.err = node.types[i]+" already registered";
                break;
            }
        }
        return node
    }).catch(err => {
        // ENOENT means no html file. We can live with that. But any other error
        // should be fatal
        // node.err = "Error: "+node.template+" does not exist";
        node.types = node.types || [];
        if (err.code !== 'ENOENT') {
            node.err = err.toString();
        }
        return node;
    });
}

async function loadNodeLocales(node) {
    if (node.module === 'node-red') {
        // do not look up locales directory for core nodes
        node.namespace = node.module;
        return node
    }
    const baseFile = node.file||node.template;
    return fs.stat(path.join(path.dirname(baseFile),"locales")).then(stat => {
        node.namespace = node.id;
        return i18n.registerMessageCatalog(node.id,
                path.join(path.dirname(baseFile),"locales"),
                path.basename(baseFile).replace(/\.[^.]+$/,".json"))
            .then(() => node);
    }).catch(err => {
        node.namespace = node.module;
        return node;
    });
}

async function loadNodeConfig(fileInfo) {
    var file = fileInfo.file;
    var module = fileInfo.module;
    var name = fileInfo.name;
    var version = fileInfo.version;

    var id = module + "/" + name;
    var info = registry.getNodeInfo(id);
    var isEnabled = true;
    if (info) {
        if (info.hasOwnProperty("loaded")) {
            throw new Error(file+" already loaded");
        }
        isEnabled = !(info.enabled === false);
    }

    var node = {
        type: "node",
        id: id,
        module: module,
        name: name,
        file: file,
        template: file.replace(/\.js$/,".html"),
        enabled: isEnabled,
        loaded:false,
        version: version,
        local: fileInfo.local,
        types: [],
        config: "",
        help: {}
    };
    if (fileInfo.hasOwnProperty("types")) {
        node.types = fileInfo.types;
    }
    await loadNodeLocales(node)
    if (!settings.disableEditor) {
        return loadNodeTemplate(node);
    }
    return node;
}

async function loadPluginConfig(fileInfo) {
    var file = fileInfo.file;
    var module = fileInfo.module;
    var name = fileInfo.name;
    var version = fileInfo.version;

    var id = module + "/" + name;
    var isEnabled = true;

    // TODO: registry.getPluginInfo

    // var info = registry.getPluginInfo(id);
    // if (info) {
    //     if (info.hasOwnProperty("loaded")) {
    //         throw new Error(file+" already loaded");
    //     }
    //     isEnabled = info.enabled;
    // }


    if (!fs.existsSync(jsFile)) {
    }

    var plugin = {
        type: "plugin",
        id: id,
        module: module,
        name: name,
        enabled: isEnabled,
        loaded:false,
        version: version,
        local: fileInfo.local,
        plugins: [],
        config: "",
        help: {}
    };
    var jsFile = file.replace(/\.[^.]+$/,".js");
    var htmlFile = file.replace(/\.[^.]+$/,".html");
    if (fs.existsSync(jsFile)) {
        plugin.file = jsFile;
    }
    if (fs.existsSync(htmlFile)) {
        plugin.template = htmlFile;
    }
    await loadNodeLocales(plugin)

    if (plugin.template && !settings.disableEditor) {
        return loadPluginTemplate(plugin);
    }
    return plugin
}

/**
 * Loads the specified node into the runtime
 * @param node a node info object - see loadNodeConfig
 * @return a promise that resolves to an update node info object. The object
 *         has the following properties added:
 *            err: any error encountered whilst loading the node
 *
 */
function loadNodeSet(node) {
    if (!node.enabled) {
        return Promise.resolve(node);
    } else {
    }
    try {
        var loadPromise = null;
        var r = require(node.file);
        r = r.__esModule ? r.default : r
        if (typeof r === "function") {

            var red = registryUtil.createNodeApi(node);
            var promise = r(red);
            if (promise != null && typeof promise.then === "function") {
                loadPromise = promise.then(function() {
                    node.enabled = true;
                    node.loaded = true;
                    return node;
                }).catch(function(err) {
                    node.err = err;
                    return node;
                });
            }
        }
        if (loadPromise == null) {
            node.enabled = true;
            node.loaded = true;
            loadPromise = Promise.resolve(node);
        }
        return loadPromise;
    } catch(err) {
        node.err = err;
        var stack = err.stack;
        var message;
        if (stack) {
            var filePath = node.file;
            try {
                filePath = fs.realpathSync(filePath);
            }
            catch (e) {
                // ignore canonicalization error
            }
            var i = stack.indexOf(filePath);
            if (i > -1) {
                var excerpt = stack.substring(i+filePath.length+1,i+filePath.length+20);
                var m = /^(\d+)/.exec(excerpt);
                if (m) {
                    node.err = err+" (line:"+m[1]+")";
                }
            }
        }
        return Promise.resolve(node);
    }
}

async function loadPlugin(plugin) {
    if (!plugin.file) {
        // No runtime component - nothing to load
        return plugin;
    }
    try {
        var r = require(plugin.file);
        r = r.__esModule ? r.default : r
        if (typeof r === "function") {

            var red = registryUtil.createNodeApi(plugin);
            var promise = r(red);
            if (promise != null && typeof promise.then === "function") {
                return promise.then(function() {
                    plugin.enabled = true;
                    plugin.loaded = true;
                    return plugin;
                }).catch(function(err) {
                    plugin.err = err;
                    return plugin;
                });
            }
        }
        plugin.enabled = true;
        plugin.loaded = true;
        return plugin;
    } catch(err) {
        console.log(err);
        plugin.err = err;
        var stack = err.stack;
        var message;
        if (stack) {
            var i = stack.indexOf(plugin.file);
            if (i > -1) {
                var excerpt = stack.substring(i+node.file.length+1,i+plugin.file.length+20);
                var m = /^(\d+):(\d+)/.exec(excerpt);
                if (m) {
                    plugin.err = err+" (line:"+m[1]+")";
                }
            }
        }
        return plugin;
    }
}
let invocation = 0
function loadNodeSetList(nodes) {
    var promises = [];
    nodes.forEach(function(node) {
        if (!node.err) {
            if (node.type === "plugin") {
                promises.push(loadPlugin(node).catch(err => {}));
            } else {
                promises.push(loadNodeSet(node).catch(err => {}));
            }
        } else {
            promises.push(node);
        }
    });

    return Promise.all(promises)
}

function addModule(module) {
    if (!settings.available()) {
        throw new Error("Settings unavailable");
    }
    var nodes = [];
    var existingInfo = registry.getModuleInfo(module);
    if (existingInfo) {
        // TODO: nls
        var e = new Error("module_already_loaded");
        e.code = "module_already_loaded";
        return Promise.reject(e);
    }
    try {
        var moduleFiles = {};
        var moduleStack = [module];
        while(moduleStack.length > 0) {
            var moduleToLoad = moduleStack.shift();
            var files = localfilesystem.getModuleFiles(moduleToLoad);
            if (files[moduleToLoad]) {
                moduleFiles[moduleToLoad] = files[moduleToLoad];
                if (moduleFiles[moduleToLoad].dependencies) {
                    log.debug(`Loading dependencies for ${module}`)
                    for (var i=0; i<moduleFiles[moduleToLoad].dependencies.length; i++) {
                        var dep = moduleFiles[moduleToLoad].dependencies[i]
                        if (!registry.getModuleInfo(dep)) {
                            log.debug(` - load ${dep}`)
                            moduleStack.push(dep);
                        } else {
                            log.debug(` - already loaded ${dep}`)
                            registry.addModuleDependency(dep,moduleToLoad)
                        }
                    }
                }
            }
        }
        return loadModuleFiles(moduleFiles).then(() => module)
    } catch(err) {
        return Promise.reject(err);
    }
}

function loadNodeHelp(node,lang) {
    var base = path.basename(node.template);
    var localePath;
    if (node.module === 'node-red') {
        var cat_dir = path.dirname(node.template);
        var cat = path.basename(cat_dir);
        var dir = path.dirname(cat_dir);
        localePath = path.join(dir, "..", "locales", lang, cat, base)
    }
    else {
        var dir = path.dirname(node.template);
        localePath = path.join(dir,"locales",lang,base);
    }
    try {
        // TODO: make this async
        var content = fs.readFileSync(localePath, "utf8")
        return content;
    } catch(err) {
        return null;
    }
}

function getNodeHelp(node,lang) {
    if (!node.help[lang]) {
        var help = loadNodeHelp(node,lang);
        if (help == null) {
            var langParts = lang.split("-");
            if (langParts.length == 2) {
                help = loadNodeHelp(node,langParts[0]);
            }
        }
        if (help) {
            node.help[lang] = help;
        } else if (lang === i18n.defaultLang) {
            return null;
        } else {
            node.help[lang] = getNodeHelp(node, i18n.defaultLang);
        }
    }
    return node.help[lang];
}

module.exports = {
    init: init,
    load: load,
    addModule: addModule,
    loadNodeSet: loadNodeSet,
    getNodeHelp: getNodeHelp
}
