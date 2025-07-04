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
 * An API for undo / redo history buffer
 * @namespace RED.history
*/
RED.history = (function() {
    var undoHistory = [];
    var redoHistory = [];

    function nodeOrJunction(id) {
        var node = RED.nodes.node(id);
        if (node) {
            return node;
        }
        return RED.nodes.junction(id);
    }
    function ensureUnlocked(id, flowsToLock) {
        const flow = id && (RED.nodes.workspace(id) || RED.nodes.subflow(id) || null);
        const isLocked = flow ? flow.locked : false;
        if (flow && isLocked) {
            flow.locked = false;
            flowsToLock.add(flow)
        }
    }
    function undoEvent(ev) {
        var i;
        var len;
        var node;
        var group;
        var subflow;
        var modifiedTabs = {};
        var inverseEv;
        if (ev) {
            if (ev.t == 'multi') {
                inverseEv = {
                    t: 'multi',
                    events: []
                };
                len = ev.events.length;
                for (i=len-1;i>=0;i--) {
                    var r = undoEvent(ev.events[i]);
                    inverseEv.events.push(r);
                }
            } else if (ev.t == 'replace') {
                if (ev.complete) {
                    // This is a replace of everything. We can short-cut
                    // the logic by clearing everyting first, then importing
                    // the ev.config.
                    // Used by RED.diff.mergeDiff
                    inverseEv = {
                        t: 'replace',
                        config: RED.nodes.createCompleteNodeSet(),
                        changed: {},
                        moved: {},
                        complete: true,
                        rev: RED.nodes.version(),
                        dirty: RED.nodes.dirty()
                    };
                    var selectedTab = RED.workspaces.active();
                    inverseEv.config.forEach(n => {
                        const node = RED.nodes.node(n.id)
                        if (node) {
                            inverseEv.changed[n.id] = node.changed
                            inverseEv.moved[n.id] = node.moved
                        }
                    })
                    RED.nodes.clear();
                    var imported = RED.nodes.import(ev.config);
                    // Clear all change flags from the import
                    RED.nodes.dirty(false);

                    const flowsToLock = new Set()
                    
                    imported.nodes.forEach(function(n) {
                        if (ev.changed[n.id]) {
                            ensureUnlocked(n.z, flowsToLock)
                            n.changed = true;
                        }
                        if (ev.moved[n.id]) {
                            ensureUnlocked(n.z, flowsToLock)
                            n.moved = true;
                        }
                    })
                    flowsToLock.forEach(flow => {
                        flow.locked = true
                    })

                    RED.nodes.version(ev.rev);
                    RED.view.redraw(true);
                    RED.palette.refresh();
                    RED.workspaces.refresh();
                    RED.workspaces.show(selectedTab, true);
                    RED.sidebar.config.refresh();
                } else {
                    var importMap = {};
                    ev.config.forEach(function(n) {
                        importMap[n.id] = "replace";
                    })
                    var importedResult = RED.nodes.import(ev.config,{importMap: importMap})
                    inverseEv = {
                        t: 'replace',
                        config: importedResult.removedNodes,
                        dirty: RED.nodes.dirty()
                    }
                }
            } else if (ev.t == 'add') {
                inverseEv = {
                    t: "delete",
                    dirty: RED.nodes.dirty()
                };
                if (ev.nodes) {
                    inverseEv.nodes = [];
                    for (i=0;i<ev.nodes.length;i++) {
                        node = RED.nodes.node(ev.nodes[i]);
                        if (node.z) {
                            modifiedTabs[node.z] = true;
                        }
                        inverseEv.nodes.push(node);
                        RED.nodes.remove(ev.nodes[i]);
                        if (node.g) {
                            var group = RED.nodes.group(node.g);
                            var index = group.nodes.indexOf(node);
                            if (index !== -1) {
                                group.nodes.splice(index,1);
                                RED.group.markDirty(group);
                            }
                        }
                    }
                }
                if (ev.links) {
                    inverseEv.links = [];
                    for (i=0;i<ev.links.length;i++) {
                        inverseEv.links.push(ev.links[i]);
                        RED.nodes.removeLink(ev.links[i]);
                    }
                }
                if (ev.junctions) {
                    inverseEv.junctions = [];
                    for (i=0;i<ev.junctions.length;i++) {
                        inverseEv.junctions.push(ev.junctions[i]);
                        RED.nodes.removeJunction(ev.junctions[i]);
                        if (ev.junctions[i].g) {
                            var group = RED.nodes.group(ev.junctions[i].g);
                            var index = group.nodes.indexOf(ev.junctions[i]);
                            if (index !== -1) {
                                group.nodes.splice(index,1);
                                RED.group.markDirty(group);
                            }
                        }


                    }
                }
                if (ev.groups) {
                    inverseEv.groups = [];
                    for (i = ev.groups.length - 1;i>=0;i--) {
                        group = ev.groups[i];
                        modifiedTabs[group.z] = true;
                        // The order of groups is important
                        //  - to invert the action, the order is reversed
                        inverseEv.groups.unshift(group);
                        RED.nodes.removeGroup(group);
                    }
                }
                if (ev.workspaces) {
                    inverseEv.workspaces = [];
                    for (i=0;i<ev.workspaces.length;i++) {
                        var workspaceOrder = RED.nodes.getWorkspaceOrder();
                        ev.workspaces[i]._index = workspaceOrder.indexOf(ev.workspaces[i].id);
                        inverseEv.workspaces.push(ev.workspaces[i]);
                        RED.nodes.removeWorkspace(ev.workspaces[i].id);
                        RED.workspaces.remove(ev.workspaces[i]);
                    }
                }
                if (ev.subflows) {
                    inverseEv.subflows = [];
                    for (i=0;i<ev.subflows.length;i++) {
                        inverseEv.subflows.push(ev.subflows[i]);
                        RED.nodes.removeSubflow(ev.subflows[i]);
                        RED.workspaces.remove(ev.subflows[i]);
                    }
                }
                if (ev.subflow) {
                    inverseEv.subflow = {};
                    if (ev.subflow.instances) {
                        inverseEv.subflow.instances = [];
                        ev.subflow.instances.forEach(function(n) {
                            inverseEv.subflow.instances.push(n);
                            var node = RED.nodes.node(n.id);
                            if (node) {
                                node.changed = n.changed;
                                node.dirty = true;
                            }
                        });
                    }
                    if (ev.subflow.hasOwnProperty('changed')) {
                        subflow = RED.nodes.subflow(ev.subflow.id);
                        if (subflow) {
                            subflow.changed = ev.subflow.changed;
                        }
                    }
                }
                if (ev.removedLinks) {
                    inverseEv.createdLinks = [];
                    for (i=0;i<ev.removedLinks.length;i++) {
                        inverseEv.createdLinks.push(ev.removedLinks[i]);
                        RED.nodes.addLink(ev.removedLinks[i]);
                    }
                }

            } else if (ev.t == "delete") {
                inverseEv = {
                    t: "add",
                    dirty: RED.nodes.dirty()
                };
                if (ev.workspaces) {
                    inverseEv.workspaces = [];
                    for (i=0;i<ev.workspaces.length;i++) {
                        inverseEv.workspaces.push(ev.workspaces[i]);
                        RED.nodes.addWorkspace(ev.workspaces[i],ev.workspaces[i]._index);
                        RED.workspaces.add(ev.workspaces[i],undefined,ev.workspaces[i]._index);
                        delete ev.workspaces[i]._index;
                    }
                }
                if (ev.subflows) {
                    inverseEv.subflows = [];
                    for (i=0;i<ev.subflows.length;i++) {
                        inverseEv.subflows.push(ev.subflows[i]);
                        RED.nodes.addSubflow(ev.subflows[i]);
                    }
                }
                if (ev.subflowInputs && ev.subflowInputs.length > 0) {
                    subflow = RED.nodes.subflow(ev.subflowInputs[0].z);
                    subflow.in.push(ev.subflowInputs[0]);
                    subflow.in[0].dirty = true;
                }
                if (ev.subflowOutputs && ev.subflowOutputs.length > 0) {
                    subflow = RED.nodes.subflow(ev.subflowOutputs[0].z);
                    ev.subflowOutputs.sort(function(a,b) { return a.i-b.i});
                    for (i=0;i<ev.subflowOutputs.length;i++) {
                        var output = ev.subflowOutputs[i];
                        subflow.out.splice(output.i,0,output);
                        for (var j=output.i+1;j<subflow.out.length;j++) {
                            subflow.out[j].i++;
                            subflow.out[j].dirty = true;
                        }
                        RED.nodes.eachLink(function(l) {
                            if (l.source.type == "subflow:"+subflow.id) {
                                if (l.sourcePort >= output.i) {
                                    l.sourcePort++;
                                }
                            }
                        });
                    }
                }
                if (ev.subflow) {
                    inverseEv.subflow = {};
                    if (ev.subflow.hasOwnProperty('instances')) {
                        inverseEv.subflow.instances = [];
                        ev.subflow.instances.forEach(function(n) {
                            inverseEv.subflow.instances.push(n);
                            var node = RED.nodes.node(n.id);
                            if (node) {
                                node.changed = n.changed;
                                node.dirty = true;
                            }
                        });
                    }
                    if (ev.subflow.hasOwnProperty('status')) {
                        subflow = RED.nodes.subflow(ev.subflow.id);
                        subflow.status = ev.subflow.status;
                    }
                }
                if (subflow) {
                    RED.nodes.filterNodes({type:"subflow:"+subflow.id}).forEach(function(n) {
                        n.inputs = subflow.in.length;
                        n.outputs = subflow.out.length;
                        n.resize = true;
                        n.dirty = true;
                    });
                }
                if (ev.groups) {
                    inverseEv.groups = [];
                    var groupsToAdd = {};
                    ev.groups.forEach(function(g) { groupsToAdd[g.id] = g; });
                    for (i = ev.groups.length - 1;i>=0;i--) {
                        RED.nodes.addGroup(ev.groups[i])
                        modifiedTabs[ev.groups[i].z] = true;
                        // The order of groups is important
                        //  - to invert the action, the order is reversed
                        inverseEv.groups.unshift(ev.groups[i]);
                        if (ev.groups[i].g) {
                            if (!groupsToAdd[ev.groups[i].g]) {
                                group = RED.nodes.group(ev.groups[i].g);
                            } else {
                                group = groupsToAdd[ev.groups[i].g];
                            }
                            if (group.nodes.indexOf(ev.groups[i]) === -1) {
                                group.nodes.push(ev.groups[i]);
                            }
                            RED.group.markDirty(ev.groups[i])
                        }
                    }
                }
                if (ev.nodes) {
                    inverseEv.nodes = [];
                    for (i=0;i<ev.nodes.length;i++) {
                        RED.nodes.add(ev.nodes[i]);
                        modifiedTabs[ev.nodes[i].z] = true;
                        inverseEv.nodes.push(ev.nodes[i].id);
                        if (ev.nodes[i].g) {
                            group = RED.nodes.group(ev.nodes[i].g);
                            if (group.nodes.indexOf(ev.nodes[i]) === -1) {
                                group.nodes.push(ev.nodes[i]);
                            }
                            RED.group.markDirty(group)
                        }
                    }
                }
                if (ev.junctions) {
                    inverseEv.junctions = [];
                    for (i=0;i<ev.junctions.length;i++) {
                        inverseEv.junctions.push(ev.junctions[i]);
                        RED.nodes.addJunction(ev.junctions[i]);
                        if (ev.junctions[i].g) {
                            group = RED.nodes.group(ev.junctions[i].g);
                            if (group.nodes.indexOf(ev.junctions[i]) === -1) {
                                group.nodes.push(ev.junctions[i]);
                            }
                            RED.group.markDirty(group)
                        }

                    }
                }
                if (ev.links) {
                    inverseEv.links = [];
                    for (i=0;i<ev.links.length;i++) {
                        RED.nodes.addLink(ev.links[i]);
                        inverseEv.links.push(ev.links[i]);
                    }
                }
                if (ev.createdLinks) {
                    inverseEv.removedLinks = [];
                    for (i=0;i<ev.createdLinks.length;i++) {
                        inverseEv.removedLinks.push(ev.createdLinks[i]);
                        RED.nodes.removeLink(ev.createdLinks[i]);
                    }
                }
                if (ev.changes) {
                    for (i in ev.changes) {
                        if (ev.changes.hasOwnProperty(i)) {
                            node = RED.nodes.node(i);
                            if (node) {
                                for (var d in ev.changes[i]) {
                                    if (ev.changes[i].hasOwnProperty(d)) {
                                        node[d] = ev.changes[i][d];
                                    }
                                }
                                node.dirty = true;
                            }
                            RED.events.emit("nodes:change",node);
                        }
                    }
                }
                if (subflow) {
                    RED.events.emit("subflows:change", subflow);
                }
            } else if (ev.t == "move") {
                inverseEv = {
                    t: 'move',
                    nodes: [],
                    dirty: RED.nodes.dirty()
                };
                for (i=0;i<ev.nodes.length;i++) {
                    var n = ev.nodes[i];
                    var rn = {n: n.n, ox: n.n.x, oy: n.n.y, dirty: true, moved: n.n.moved};
                    inverseEv.nodes.push(rn);
                    n.n.x = n.ox;
                    n.n.y = n.oy;
                    n.n.dirty = true;
                    n.n.moved = n.moved;
                }
                // A move could have caused a link splice
                if (ev.links) {
                    inverseEv.removedLinks = [];
                    for (i=0;i<ev.links.length;i++) {
                        inverseEv.removedLinks.push(ev.links[i]);
                        RED.nodes.removeLink(ev.links[i]);
                    }
                }
                if (ev.removedLinks) {
                    inverseEv.links = [];
                    for (i=0;i<ev.removedLinks.length;i++) {
                        inverseEv.links.push(ev.removedLinks[i]);
                        RED.nodes.addLink(ev.removedLinks[i]);
                    }
                }
                if (ev.addToGroup) {
                    RED.group.removeFromGroup(ev.addToGroup,ev.nodes.map(function(n) { return n.n }),false);
                    inverseEv.removeFromGroup = ev.addToGroup;
                }
                if (ev.removeFromGroup) {
                    RED.group.addToGroup(ev.removeFromGroup,ev.nodes.map(function(n) { return n.n }));
                    inverseEv.addToGroup = ev.removeFromGroup;
                }
            } else if (ev.t == "edit") {
                inverseEv = {
                    t: "edit",
                    changes: {},
                    changed: ev.node.changed,
                    dirty: RED.nodes.dirty()
                };
                inverseEv.node = ev.node;
                for (i in ev.changes) {
                    if (ev.changes.hasOwnProperty(i)) {
                        inverseEv.changes[i] = ev.node[i];
                        if (ev.node._def.defaults && ev.node._def.defaults[i] && ev.node._def.defaults[i].type) {
                            // This property is a reference to another node or nodes.
                            var nodeList = ev.node[i];
                            if (!Array.isArray(nodeList)) {
                                nodeList = [nodeList];
                            }
                            nodeList.forEach(function(id) {
                                var currentConfigNode = RED.nodes.node(id);
                                if (currentConfigNode && currentConfigNode._def.category === "config") {
                                    currentConfigNode.users.splice(currentConfigNode.users.indexOf(ev.node),1);
                                    RED.events.emit("nodes:change",currentConfigNode);
                                }
                            });
                            nodeList = ev.changes[i];
                            if (!Array.isArray(nodeList)) {
                                nodeList = [nodeList];
                            }
                            nodeList.forEach(function(id) {
                                var newConfigNode = RED.nodes.node(id);
                                if (newConfigNode && newConfigNode._def.category === "config") {
                                    newConfigNode.users.push(ev.node);
                                    RED.events.emit("nodes:change",newConfigNode);
                                }
                            });
                        } else if (i === "env" && ev.node.type.indexOf("subflow:") === 0) {
                            // Subflow can have config node in node.env
                            let nodeList = ev.node.env || [];
                            nodeList = nodeList.reduce((list, prop) => {
                                if (prop.type === "conf-type" && prop.value) {
                                    list.push(prop.value);
                                }
                                return list;
                            }, []);

                            nodeList.forEach(function(id) {
                                const configNode = RED.nodes.node(id);
                                if (configNode) {
                                    if (configNode.users.indexOf(ev.node) !== -1) {
                                        configNode.users.splice(configNode.users.indexOf(ev.node), 1);
                                        RED.events.emit("nodes:change", configNode);
                                    }
                                }
                            });

                            nodeList = ev.changes.env || [];
                            nodeList = nodeList.reduce((list, prop) => {
                                if (prop.type === "conf-type" && prop.value) {
                                    list.push(prop.value);
                                }
                                return list;
                            }, []);

                            nodeList.forEach(function(id) {
                                const configNode = RED.nodes.node(id);
                                if (configNode) {
                                    if (configNode.users.indexOf(ev.node) === -1) {
                                        configNode.users.push(ev.node);
                                        RED.events.emit("nodes:change", configNode);
                                    }
                                }
                            });
                        } else if (i === "color" && ev.node.type === "subflow") {
                            // Handle the Subflow definition color change
                            RED.utils.clearNodeColorCache();
                            const subflowDef = RED.nodes.getType("subflow:" + ev.node.id);
                            if (subflowDef) {
                                subflowDef.color = ev.changes[i] || "#DDAA99";
                            }
                        }
                        if (i === "credentials" && ev.changes[i]) {
                            // Reset - Only want to keep the changes
                            inverseEv.changes[i] = {};
                            for (const [key, value] of Object.entries(ev.changes[i])) {
                                // Edge case: node.credentials is cleared after a deploy, so we can't
                                // capture values for the inverse event when undoing past a deploy
                                if (ev.node.credentials) {
                                    inverseEv.changes[i][key] = ev.node.credentials[key];
                                }
                                ev.node.credentials[key] = value;
                            }
                        } else {
                            ev.node[i] = ev.changes[i];
                        }
                    }
                }

                ev.node.dirty = true;
                ev.node.changed = ev.changed;

                var eventType;
                switch(ev.node.type) {
                    case 'tab': eventType = "flows"; break;
                    case 'group': eventType = "groups"; break;
                    case 'subflow': eventType = "subflows"; break;
                    default: eventType = "nodes"; break;
                }
                eventType += ":change";
                RED.events.emit(eventType,ev.node);


                if (ev.node.type === 'tab' && ev.changes.hasOwnProperty('disabled')) {
                    $("#red-ui-tab-"+(ev.node.id.replace(".","-"))).toggleClass('red-ui-workspace-disabled',!!ev.node.disabled);
                }
                if (ev.node.type === 'tab' && ev.changes.hasOwnProperty('locked')) {
                    $("#red-ui-tab-"+(ev.node.id.replace(".","-"))).toggleClass('red-ui-workspace-locked',!!ev.node.locked);
                }
                if (ev.subflow) {
                    inverseEv.subflow = {};
                    if (ev.subflow.hasOwnProperty('inputCount')) {
                        inverseEv.subflow.inputCount = ev.node.in.length;
                        if (ev.node.in.length > ev.subflow.inputCount) {
                            inverseEv.subflow.inputs = ev.node.in.slice(ev.subflow.inputCount);
                            ev.node.in.splice(ev.subflow.inputCount);
                        } else if (ev.subflow.inputs.length > 0) {
                            ev.node.in = ev.node.in.concat(ev.subflow.inputs);
                        }
                    }
                    if (ev.subflow.hasOwnProperty('outputCount')) {
                        inverseEv.subflow.outputCount = ev.node.out.length;
                        if (ev.node.out.length > ev.subflow.outputCount) {
                            inverseEv.subflow.outputs = ev.node.out.slice(ev.subflow.outputCount);
                            ev.node.out.splice(ev.subflow.outputCount);
                        } else if (ev.subflow.outputs.length > 0) {
                            ev.node.out = ev.node.out.concat(ev.subflow.outputs);
                        }
                    }
                    if (ev.subflow.hasOwnProperty('instances')) {
                        inverseEv.subflow.instances = [];
                        ev.subflow.instances.forEach(function(n) {
                            inverseEv.subflow.instances.push(n);
                            var node = RED.nodes.node(n.id);
                            if (node) {
                                node.changed = n.changed;
                                node.dirty = true;

                                if (ev.changes && ev.changes.hasOwnProperty('color')) {
                                    node._colorChanged = true;
                                }
                            }
                        });
                    }
                    if (ev.subflow.hasOwnProperty('status')) {
                        if (ev.subflow.status) {
                            delete ev.node.status;
                        }
                    }
                    RED.editor.validateNode(ev.node);
                    RED.nodes.filterNodes({type:"subflow:"+ev.node.id}).forEach(function(n) {
                        n.inputs = ev.node.in.length;
                        n.outputs = ev.node.out.length;
                        RED.editor.updateNodeProperties(n);
                        RED.editor.validateNode(n);
                    });
                } else {
                    var outputMap;
                    if (ev.outputMap) {
                        outputMap = {};
                        inverseEv.outputMap = {};
                        for (var port in ev.outputMap) {
                            if (ev.outputMap.hasOwnProperty(port) && ev.outputMap[port] !== "-1") {
                                outputMap[ev.outputMap[port]] = port;
                                inverseEv.outputMap[ev.outputMap[port]] = port;
                            }
                        }
                    }
                    ev.node.__outputs = inverseEv.changes.outputs;
                    RED.editor.updateNodeProperties(ev.node,outputMap);
                    RED.editor.validateNode(ev.node);
                }
                // If it's a Config Node, validate user nodes too.
                // NOTE: The Config Node must be validated before validating users.
                if (ev.node.users) {
                    const validatedNodes = new Set();
                    const userStack = ev.node.users.slice();

                    validatedNodes.add(ev.node.id);
                    while (userStack.length) {
                        const node = userStack.pop();
                        if (!validatedNodes.has(node.id)) {
                            validatedNodes.add(node.id);
                            if (node.users) {
                                userStack.push(...node.users);
                            }
                            RED.editor.validateNode(node);
                        }
                    }
                }
                if (ev.links) {
                    inverseEv.createdLinks = [];
                    for (i=0;i<ev.links.length;i++) {
                        RED.nodes.addLink(ev.links[i]);
                        inverseEv.createdLinks.push(ev.links[i]);
                    }
                }
                if (ev.createdLinks) {
                    inverseEv.links = [];
                    for (i=0;i<ev.createdLinks.length;i++) {
                        RED.nodes.removeLink(ev.createdLinks[i]);
                        inverseEv.links.push(ev.createdLinks[i]);
                    }
                }
            } else if (ev.t == "createSubflow") {
                inverseEv = {
                    t: "deleteSubflow",
                    activeWorkspace: ev.activeWorkspace,
                    dirty: RED.nodes.dirty()
                };
                if (ev.nodes) {
                    inverseEv.movedNodes = [];
                    var z = ev.activeWorkspace;
                    var fullNodeList = RED.nodes.filterNodes({z:ev.subflow.subflow.id});
                    fullNodeList = fullNodeList.concat(RED.nodes.groups(ev.subflow.subflow.id))
                    fullNodeList = fullNodeList.concat(RED.nodes.junctions(ev.subflow.subflow.id))
                    fullNodeList.forEach(function(n) {
                        n.x += ev.subflow.offsetX;
                        n.y += ev.subflow.offsetY;
                        n.dirty = true;
                        inverseEv.movedNodes.push(n.id);
                        RED.nodes.moveNodeToTab(n, z);
                    });
                    inverseEv.subflows = [];
                    for (i=0;i<ev.nodes.length;i++) {
                        inverseEv.subflows.push(nodeOrJunction(ev.nodes[i]));
                        RED.nodes.remove(ev.nodes[i]);
                    }
                }
                if (ev.links) {
                    inverseEv.links = [];
                    for (i=0;i<ev.links.length;i++) {
                        inverseEv.links.push(ev.links[i]);
                        RED.nodes.removeLink(ev.links[i]);
                    }
                }

                inverseEv.subflow = ev.subflow;
                RED.nodes.removeSubflow(ev.subflow.subflow);
                RED.workspaces.remove(ev.subflow.subflow);

                if (ev.removedLinks) {
                    inverseEv.createdLinks = [];
                    for (i=0;i<ev.removedLinks.length;i++) {
                        inverseEv.createdLinks.push(ev.removedLinks[i]);
                        RED.nodes.addLink(ev.removedLinks[i]);
                    }
                }
            } else if (ev.t == "deleteSubflow") {
                inverseEv = {
                    t: "createSubflow",
                    activeWorkspace: ev.activeWorkspace,
                    dirty: RED.nodes.dirty(),
                };
                if (ev.subflow) {
                    RED.nodes.addSubflow(ev.subflow.subflow);
                    inverseEv.subflow = ev.subflow;
                    if (ev.subflow.subflow.g) {
                        RED.group.addToGroup(RED.nodes.group(ev.subflow.subflow.g),ev.subflow.subflow);
                    }
                }
                if (ev.subflows) {
                    inverseEv.nodes = [];
                    for (i=0;i<ev.subflows.length;i++) {
                        RED.nodes.add(ev.subflows[i]);
                        inverseEv.nodes.push(ev.subflows[i].id);
                    }
                }
                if (ev.movedNodes) {
                    ev.movedNodes.forEach(function(nid) {
                        nn = RED.nodes.node(nid);
                        if (!nn) {
                            nn = RED.nodes.group(nid);
                        }
                        nn.x -= ev.subflow.offsetX;
                        nn.y -= ev.subflow.offsetY;
                        nn.dirty = true;
                        RED.nodes.moveNodeToTab(nn, ev.subflow.subflow.id);
                    });
                }
                if (ev.links) {
                    inverseEv.links = [];
                    for (i=0;i<ev.links.length;i++) {
                        inverseEv.links.push(ev.links[i]);
                        RED.nodes.addLink(ev.links[i]);
                    }
                }
                if (ev.createdLinks) {
                    inverseEv.removedLinks = [];
                    for (i=0;i<ev.createdLinks.length;i++) {
                        inverseEv.removedLinks.push(ev.createdLinks[i]);
                        RED.nodes.removeLink(ev.createdLinks[i]);
                    }
                }
            } else if (ev.t == "reorder") {
                inverseEv = {
                    t: 'reorder',
                    dirty: RED.nodes.dirty()
                };
                if (ev.workspaces) {
                    inverseEv.workspaces = {
                        from: ev.workspaces.to,
                        to: ev.workspaces.from
                    }
                    RED.workspaces.order(ev.workspaces.from);
                }
                if (ev.nodes) {
                    inverseEv.nodes = {
                        z: ev.nodes.z,
                        from: ev.nodes.to,
                        to: ev.nodes.from
                    }
                    RED.nodes.setNodeOrder(ev.nodes.z,ev.nodes.from);
                }
            } else if (ev.t == "createGroup") {
                inverseEv = {
                    t: "ungroup",
                    dirty: RED.nodes.dirty(),
                    groups: []
                }
                if (ev.groups) {
                    for (i=0;i<ev.groups.length;i++) {
                        inverseEv.groups.push(ev.groups[i]);
                        RED.group.ungroup(ev.groups[i]);
                    }
                }
            } else if (ev.t == "ungroup") {
                inverseEv = {
                    t: "createGroup",
                    dirty: RED.nodes.dirty(),
                    groups: []
                }
                if (ev.groups) {
                    for (i=0;i<ev.groups.length;i++) {
                        inverseEv.groups.push(ev.groups[i]);
                        var nodes = ev.groups[i].nodes.slice();
                        ev.groups[i].nodes = [];
                        RED.nodes.addGroup(ev.groups[i]);
                        RED.group.addToGroup(ev.groups[i],nodes);
                        if (ev.groups[i].g) {
                            const parentGroup = RED.nodes.group(ev.groups[i].g)
                            if (parentGroup) {
                                RED.group.addToGroup(parentGroup, ev.groups[i])
                            }
                        }
                    }
                }
            } else if (ev.t == "addToGroup") {
                inverseEv = {
                    t: "removeFromGroup",
                    dirty: RED.nodes.dirty(),
                    group: ev.group,
                    nodes: ev.nodes,
                    reparent: ev.reparent
                }
                if (ev.nodes) {
                    RED.group.removeFromGroup(ev.group,ev.nodes,(ev.hasOwnProperty('reparent')&&ev.hasOwnProperty('reparent')!==undefined)?ev.reparent:true);
                }
            } else if (ev.t == "removeFromGroup") {
                inverseEv = {
                    t: "addToGroup",
                    dirty: RED.nodes.dirty(),
                    group: ev.group,
                    nodes: ev.nodes,
                    reparent: ev.reparent
                }
                if (ev.nodes) {
                    RED.group.addToGroup(ev.group,ev.nodes);
                }
            }

            if(ev.callback && typeof ev.callback === 'function') {
                inverseEv.callback = ev.callback;
                ev.callback(ev);
            }

            Object.keys(modifiedTabs).forEach(function(id) {
                var subflow = RED.nodes.subflow(id);
                if (subflow) {
                    RED.editor.validateNode(subflow);
                }
            });

            RED.nodes.dirty(ev.dirty);
            RED.view.updateActive();
            RED.view.select(null);
            RED.workspaces.refresh();
            RED.sidebar.config.refresh();
            RED.subflow.refresh();

            return inverseEv;
        }

    }

    return {
        //TODO: this function is a placeholder until there is a 'save' event that can be listened to
        markAllDirty: function() {
            for (var i=0;i<undoHistory.length;i++) {
                undoHistory[i].dirty = true;
            }
        },
        list: function() {
            return undoHistory;
        },
        listRedo: function() {
            return redoHistory;
        },
        depth: function() {
            return undoHistory.length;
        },
        push: function(ev) {
            undoHistory.push(ev);
            redoHistory = [];
            RED.menu.setDisabled("menu-item-edit-undo", false);
            RED.menu.setDisabled("menu-item-edit-redo", true);
        },
        pop: function() {
            var ev = undoHistory.pop();
            var rev = undoEvent(ev);
            if (rev) {
                redoHistory.push(rev);
            }
            RED.menu.setDisabled("menu-item-edit-undo", undoHistory.length === 0);
            RED.menu.setDisabled("menu-item-edit-redo", redoHistory.length === 0);
        },
        peek: function() {
            return undoHistory[undoHistory.length-1];
        },
        replace: function(ev) {
            if (undoHistory.length === 0) {
                RED.history.push(ev);
            } else {
                undoHistory[undoHistory.length-1] = ev;
            }
        },
        clear: function() {
            undoHistory = [];
            redoHistory = [];
            RED.menu.setDisabled("menu-item-edit-undo", true);
            RED.menu.setDisabled("menu-item-edit-redo", true);
        },
        redo: function() {
            var ev = redoHistory.pop();
            if (ev) {
                var uev = undoEvent(ev);
                if (uev) {
                    undoHistory.push(uev);
                }
            }
            RED.menu.setDisabled("menu-item-edit-undo", undoHistory.length === 0);
            RED.menu.setDisabled("menu-item-edit-redo", redoHistory.length === 0);
        }
    }

})();
