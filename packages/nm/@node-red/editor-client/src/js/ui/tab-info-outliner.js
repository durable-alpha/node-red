RED.sidebar.info.outliner = (function() {

    var treeList;
    var searchInput;
    var activeSearch;
    var projectInfo;
    var projectInfoLabel;
    var flowList;
    var subflowList;
    var globalConfigNodes;

    var objects = {};
    var missingParents = {};
    var configNodeTypes;


    function getFlowData() {
        var flowData = [
            {
                label: RED._("menu.label.flows"),
                expanded: true,
                children: []
            },
            {
                id: "__subflow__",
                label: RED._("menu.label.subflows"),
                children: [
                    getEmptyItem("__subflow__")
                ]
            },
            {
                id: "__global__",
                flow: "__global__",
                label: RED._("sidebar.info.globalConfig"),
                types: {},
                children: [
                    getEmptyItem("__global__")
                ]
            }
        ]

        flowList = flowData[0];
        subflowList = flowData[1];
        globalConfigNodes = flowData[2];
        configNodeTypes = { __global__: globalConfigNodes};

        return flowData;
    }

    function getProjectLabel(p) {
        var div = $('<div>',{class:"red-ui-info-outline-item red-ui-info-outline-item-flow"});
        div.css("width", "calc(100% - 40px)");
        var contentDiv = $('<div>',{class:"red-ui-search-result-description red-ui-info-outline-item-label"}).appendTo(div);
        contentDiv.text(p.name);
        var controls = $('<div>',{class:"red-ui-info-outline-item-controls"}).appendTo(div);
        var editProjectButton = $('<button class="red-ui-button red-ui-button-small" style="position:absolute;right:5px;top: 3px;"><i class="fa fa-ellipsis-h"></i></button>')
            .appendTo(controls)
            .on("click", function(evt) {
                evt.preventDefault();
                RED.projects.editProject();
            });
        RED.popover.tooltip(editProjectButton,RED._('sidebar.project.showProjectSettings'));
        return div;
    }

    var empties = {};
    function getEmptyItem(id) {
        var item = {
            empty: true,
            element: $('<div class="red-ui-info-outline-item red-ui-info-outline-item-empty">').text(RED._("sidebar.info.empty")),
        }
        empties[id] = item;
        return item;
    }

    function getNodeLabel(n) {
        var div = $('<div>',{class:"red-ui-node-list-item red-ui-info-outline-item"});
        RED.utils.createNodeIcon(n, true).appendTo(div);
        div.find(".red-ui-node-label").addClass("red-ui-info-outline-item-label")
        addControls(n, div);
        return div;
    }

    function getFlowLabel(n) {
        var div = $('<div>',{class:"red-ui-info-outline-item red-ui-info-outline-item-flow"});
        var contentDiv = $('<div>',{class:"red-ui-search-result-description red-ui-info-outline-item-label"}).appendTo(div);
        var label = (typeof n === "string")? n : n.label;
        var newlineIndex = label.indexOf("\\n");
        if (newlineIndex > -1) {
            label = label.substring(0,newlineIndex)+"...";
        }
        contentDiv.text(label);
        addControls(n, div);
        return div;
    }

    function addControls(n,div) {
        var controls = $('<div>',{class:"red-ui-info-outline-item-controls red-ui-info-outline-item-hover-controls"}).appendTo(div);

        if (n.type === "subflow") {
            var subflowInstanceBadge = $('<button type="button" class="red-ui-info-outline-item-control-users red-ui-button red-ui-button-small"><i class="fa fa-toggle-right"></i></button>').text(n.instances.length).appendTo(controls).on("click",function(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                RED.search.show("type:subflow:"+n.id);
            })
            RED.popover.tooltip(subflowInstanceBadge,function() { return RED._('subflow.subflowInstances',{count:n.instances.length})});
        }
        if (n._def.category === "config" && n.type !== "group") {
            var userCountBadge = $('<button type="button" class="red-ui-info-outline-item-control-users red-ui-button red-ui-button-small"><i class="fa fa-toggle-right"></i></button>').text(n.users.length).appendTo(controls).on("click",function(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                RED.search.show("uses:"+n.id);
            })
            RED.popover.tooltip(userCountBadge,function() { return RED._('editor.nodesUse',{count:n.users.length})});
        }

        if (n._def.button) {
            var triggerButton = $('<button type="button" class="red-ui-info-outline-item-control-action red-ui-button red-ui-button-small"><i class="fa fa-toggle-right"></i></button>').appendTo(controls).on("click",function(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                RED.view.clickNodeButton(n);
            })
            RED.popover.tooltip(triggerButton,RED._("sidebar.info.triggerAction"));
        }

        if (n.type === "tab") {
            var toggleVisibleButton = $('<button type="button" class="red-ui-info-outline-item-control-hide red-ui-button red-ui-button-small"><i class="fa fa-eye"></i><i class="fa fa-eye-slash"></i></button>').appendTo(controls).on("click",function(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                var isHidden = !div.hasClass("red-ui-info-outline-item-hidden");
                div.toggleClass("red-ui-info-outline-item-hidden",isHidden);
                if (isHidden) {
                    RED.workspaces.hide(n.id);
                } else {
                    RED.workspaces.show(n.id, null, true);
                }
            });
            RED.popover.tooltip(toggleVisibleButton, function () {
                var isHidden = !div.hasClass("red-ui-info-outline-item-hidden");
                return RED._("sidebar.info." + (isHidden ? "hideFlow" : "showFlow"));
            });
        }
        if (n.type !== 'subflow') {
            var toggleButton = $('<button type="button" class="red-ui-info-outline-item-control-disable red-ui-button red-ui-button-small"><i class="fa fa-circle-thin"></i><i class="fa fa-ban"></i></button>').appendTo(controls).on("click",function(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                if (n.type === 'tab') {
                    if (n.disabled) {
                        RED.workspaces.enable(n.id)
                    } else {
                        RED.workspaces.disable(n.id)
                    }
                } else if (n.type === 'group') {
                    var groupNodes = RED.group.getNodes(n,true);
                    var groupHistoryEvent = {
                        t:'multi',
                        events:[],
                        dirty: RED.nodes.dirty()
                    }
                    var targetState;
                    groupNodes.forEach(function(n) {
                        if (n.type !== 'group') {
                            if (targetState === undefined) {
                                targetState = !n.d;
                            }
                            var state = !!n.d;
                            if (state !== targetState) {
                                var historyEvent = {
                                    t: "edit",
                                    node: n,
                                    changed: n.changed,
                                    changes: {
                                        d: n.d
                                    }
                                }
                                if (n.d) {
                                    delete n.d;
                                } else {
                                    n.d = true;
                                }
                                n.dirty = true;
                                n.dirtyStatus = true;
                                n.changed = true;
                                RED.events.emit("nodes:change",n);
                                groupHistoryEvent.events.push(historyEvent);
                            }
                        }
                        if (groupHistoryEvent.events.length > 0) {
                            RED.history.push(groupHistoryEvent);
                            RED.nodes.dirty(true)
                            RED.view.redraw();
                        }
                    })
                } else {
                    // TODO: this ought to be a utility function in RED.nodes
                    var historyEvent = {
                        t: "edit",
                        node: n,
                        changed: n.changed,
                        changes: {
                            d: n.d
                        },
                        dirty:RED.nodes.dirty()
                    }
                    if (n.d) {
                        delete n.d;
                    } else {
                        n.d = true;
                    }
                    n.dirty = true;
                    n.dirtyStatus = true;
                    n.changed = true;
                    RED.events.emit("nodes:change",n);
                    RED.history.push(historyEvent);
                    RED.nodes.dirty(true)
                    RED.view.redraw();
                }
            });
            RED.popover.tooltip(toggleButton,function() {
                if (n.type === "group") {
                    return RED._("common.label.enable")+" / "+RED._("common.label.disable")
                }
                return RED._("common.label."+(((n.type==='tab' && n.disabled) || (n.type!=='tab' && n.d))?"enable":"disable"));
            });
        } else {
            $('<div class="red-ui-info-outline-item-control-spacer">').appendTo(controls)
        }
        if (n.type === 'tab') {
            var lockToggleButton = $('<button type="button" class="red-ui-info-outline-item-control-lock red-ui-button red-ui-button-small"><i class="fa fa-unlock-alt"></i><i class="fa fa-lock"></i></button>').appendTo(controls).on("click",function(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                if (n.locked) {
                    RED.workspaces.unlock(n.id)
                } else {
                    RED.workspaces.lock(n.id)
                }
            })
            RED.popover.tooltip(lockToggleButton,function() {
                return RED._("common.label."+(n.locked?"unlock":"lock"));
            });
        } else {
            $('<div class="red-ui-info-outline-item-control-spacer">').appendTo(controls)
        }
        controls.find("button").on("dblclick", function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
        })
    }

    function onProjectLoad(activeProject) {
        objects = {};
        var newFlowData = getFlowData();
        projectInfoLabel.empty();
        getProjectLabel(activeProject).appendTo(projectInfoLabel);
        projectInfo.show();
        treeList.treeList('data',newFlowData);
    }

    function build() {
        var container = $("<div>", {class:"red-ui-info-outline"}).css({'height': '100%'});
        var toolbar = $("<div>", {class:"red-ui-sidebar-header red-ui-info-toolbar"}).appendTo(container);

        searchInput = $('<input type="text" data-i18n="[placeholder]menu.label.search">').appendTo(toolbar).searchBox({
            style: "compact",
            delay: 500,
            change: function() {
                var val = $(this).val();
                var searchResults = RED.search.search(val);
                if (val) {
                    activeSearch = val;
                    var resultMap = {};
                    for (var i=0,l=searchResults.length;i<l;i++) {
                        resultMap[searchResults[i].node.id] = true;
                    }
                    var c = treeList.treeList('filter',function(item) {
                        if (item.depth === 0) {
                            return true;
                        }
                        return item.id &&  objects[item.id] && resultMap[item.id]
                    },true)
                } else {
                    activeSearch = null;
                    treeList.treeList('filter',null);
                    var selected = treeList.treeList('selected');
                    if (selected.id) {
                        treeList.treeList('show',selected.id);
                    }

                }
            },
            options: RED.search.getSearchOptions()
        });

        projectInfo = $('<div class="red-ui-treeList-label red-ui-info-outline-project"><span class="red-ui-treeList-icon"><i class="fa fa-archive"></i></span></div>').hide().appendTo(container)
        projectInfoLabel = $('<span>').appendTo(projectInfo);

        // <div class="red-ui-info-outline-item red-ui-info-outline-item-flow" style=";"><div class="red-ui-search-result-description red-ui-info-outline-item-label">Space Monkey</div><div class="red-ui-info-outline-item-controls"><button class="red-ui-button red-ui-button-small" style="position:absolute;right:5px;"><i class="fa fa-ellipsis-h"></i></button></div></div></div>').appendTo(container)

        treeList = $("<div>").css({width: "100%"}).appendTo(container).treeList({
            data:getFlowData()
        })
        treeList.on('treelistselect', function(e,item) {
            var node = RED.nodes.node(item.id) || RED.nodes.group(item.id) || RED.nodes.workspace(item.id) || RED.nodes.subflow(item.id);
            if (node) {
                RED.sidebar.info.refresh(node);
                // if (node.type === 'group' || node._def.category !== "config") {
                //     // RED.view.select({nodes:[node]})
                // } else if (node._def.category === "config") {
                //     RED.sidebar.info.refresh(node);
                // } else {
                //     // RED.view.select({nodes:[]})
                // }
            } else {
                RED.sidebar.info.refresh(null);
            }
        })
        treeList.on('treelistconfirm', function(e,item) {
            var node = RED.nodes.node(item.id);
            if (node) {
                if (node._def.category === "config") {
                    RED.editor.editConfig("", node.type, node.id);
                } else {
                    RED.editor.edit(node);
                }
            }
        })

        RED.events.on("projects:load", onProjectLoad)

        RED.events.on("flows:add", onFlowAdd)
        RED.events.on("flows:remove", onObjectRemove)
        RED.events.on("flows:change", onFlowChange)
        RED.events.on("flows:reorder", onFlowsReorder)

        RED.events.on("subflows:add", onSubflowAdd)
        RED.events.on("subflows:remove", onObjectRemove)
        RED.events.on("subflows:change", onSubflowChange)

        RED.events.on("nodes:add",onNodeAdd);
        RED.events.on("nodes:remove",onObjectRemove);
        RED.events.on("nodes:change",onNodeChange);
        // RED.events.on("nodes:reorder",onNodesReorder);

        RED.events.on("groups:add",onNodeAdd);
        RED.events.on("groups:remove",onObjectRemove);
        RED.events.on("groups:change",onNodeChange);

        RED.events.on("workspace:show", onWorkspaceShow);
        RED.events.on("workspace:hide", onWorkspaceHide);
        RED.events.on("workspace:clear", onWorkspaceClear);

        return container;
    }
    function onWorkspaceClear() {
        treeList.treeList('data',getFlowData());
    }
    function onWorkspaceShow(event) {
        var existingObject = objects[event.workspace];
        if (existingObject) {
            existingObject.element.removeClass("red-ui-info-outline-item-hidden")
        }
    }
    function onWorkspaceHide(event) {
        var existingObject = objects[event.workspace];
        if (existingObject) {
            existingObject.element.addClass("red-ui-info-outline-item-hidden")
        }
    }
    function onFlowAdd(ws) {
        objects[ws.id] = {
            id: ws.id,
            element: getFlowLabel(ws),
            children:[],
            deferBuild: true,
            icon: "red-ui-icons red-ui-icons-flow",
            gutter: getGutter(ws)
        }
        if (missingParents[ws.id]) {
            objects[ws.id].children = missingParents[ws.id];
            delete missingParents[ws.id]
        } else {
            objects[ws.id].children.push(getEmptyItem(ws.id));
        }
        flowList.treeList.addChild(objects[ws.id])
        objects[ws.id].element.toggleClass("red-ui-info-outline-item-disabled", !!ws.disabled)
        objects[ws.id].treeList.container.toggleClass("red-ui-info-outline-item-disabled", !!ws.disabled)
        objects[ws.id].element.toggleClass("red-ui-info-outline-item-locked", !!ws.locked)
        objects[ws.id].treeList.container.toggleClass("red-ui-info-outline-item-locked", !!ws.locked)
        updateSearch();

    }
    function onFlowChange(n) {
        var existingObject = objects[n.id];

        var label = n.label || n.id;
        var newlineIndex = label.indexOf("\\n");
        if (newlineIndex > -1) {
            label = label.substring(0,newlineIndex)+"...";
        }
        existingObject.element.find(".red-ui-info-outline-item-label").text(label);
        existingObject.element.toggleClass("red-ui-info-outline-item-disabled", !!n.disabled)
        existingObject.treeList.container.toggleClass("red-ui-info-outline-item-disabled", !!n.disabled)
        existingObject.element.toggleClass("red-ui-info-outline-item-locked", !!n.locked)
        existingObject.treeList.container.toggleClass("red-ui-info-outline-item-locked", !!n.locked)
        updateSearch();
    }
    function onFlowsReorder(order) {
        var indexMap = {};
        order.forEach(function(id,index) {
            indexMap[id] = index;
        })

        flowList.treeList.sortChildren(function(A,B) {
            if (A.id === "__global__") { return -1 }
            if (B.id === "__global__") { return 1 }
            return indexMap[A.id] - indexMap[B.id]
        })
    }
    // function onNodesReorder(event) {
    //     //
    //     var nodes = RED.nodes.getNodeOrder(event.z);
    //     var indexMap = {};
    //     nodes.forEach(function(id,index) {
    //         indexMap[id] = index;
    //     })
    //     var existingObject = objects[event.z];
    //     existingObject.treeList.sortChildren(function(A,B) {
    //         if (A.children && !B.children) { return -1 }
    //         if (!A.children && B.children) { return 1 }
    //         if (A.children && B.children) { return -1 }
    //         return indexMap[A.id] - indexMap[B.id]
    //     })
    // }
    function onSubflowAdd(sf) {
        objects[sf.id] = {
            id: sf.id,
            element: getNodeLabel(sf),
            children:[],
            deferBuild: true,
            gutter: getGutter(sf)
        }
        if (missingParents[sf.id]) {
            objects[sf.id].children = missingParents[sf.id];
            delete missingParents[sf.id]
        } else {
            objects[sf.id].children.push(getEmptyItem(sf.id));
        }
        if (empties["__subflow__"]) {
            empties["__subflow__"].treeList.remove();
            delete empties["__subflow__"];
        }
        subflowList.treeList.addChild(objects[sf.id])
        updateSearch();
    }
    function onSubflowChange(sf) {
        var existingObject = objects[sf.id];
        existingObject.treeList.replaceElement(getNodeLabel(sf));
        // existingObject.element.find(".red-ui-info-outline-item-label").text(n.name || n.id);
        RED.nodes.eachNode(function(n) {
            if (n.type == "subflow:"+sf.id) {
                var sfInstance = objects[n.id];
                sfInstance.treeList.replaceElement(getNodeLabel(n));
            }
        });
        updateSearch();
    }

    function onNodeChange(n) {
        var existingObject = objects[n.id];
        var parent = n.g||n.z||"__global__";

        var nodeLabelText = RED.utils.getNodeLabel(n,n.name || (n.type+": "+n.id));
        if (nodeLabelText) {
            existingObject.element.find(".red-ui-info-outline-item-label").text(nodeLabelText);
        } else {
            existingObject.element.find(".red-ui-info-outline-item-label").html("&nbsp;");
        }
        var existingParent = existingObject.parent.id;
        if (!existingParent) {
            existingParent = existingObject.parent.parent.flow
        }
        if (parent !== existingParent) {
            var parentItem = existingObject.parent;
            existingObject.treeList.remove(true);
            if (parentItem.children.length === 0) {
                if (parentItem.config) {
                    // this is a config
                    parentItem.treeList.remove();
                    // console.log("Removing",n.type,"from",parentItem.parent.id||parentItem.parent.parent.id)

                    delete configNodeTypes[parentItem.parent.id||parentItem.parent.parent.id].types[n.type];


                    if (parentItem.parent.children.length === 0) {
                        if (parentItem.parent.id === "__global__") {
                            parentItem.parent.treeList.addChild(getEmptyItem(parentItem.parent.id));
                        } else {
                            delete configNodeTypes[parentItem.parent.parent.id];
                            parentItem.parent.treeList.remove();
                            if (parentItem.parent.parent.children.length === 0) {
                                parentItem.parent.parent.treeList.addChild(getEmptyItem(parentItem.parent.parent.id));
                            }

                        }
                    }
                } else {
                    parentItem.treeList.addChild(getEmptyItem(parentItem.id));
                }
            }
            if (n._def.category === 'config' && n.type !== 'group') {
                // This must be a config node that has been rescoped
                createFlowConfigNode(parent,n.type);
                configNodeTypes[parent].types[n.type].treeList.addChild(objects[n.id]);
            } else {
                // This is a node that has moved groups
                if (empties[parent]) {
                    empties[parent].treeList.remove();
                    delete empties[parent];
                }
                objects[parent].treeList.addChild(existingObject)
            }

            // if (parent === "__global__") {
            //     // Global always exists here
            //     if (!configNodeTypes[parent][n.type]) {
            //         configNodeTypes[parent][n.type] = {
            //             config: true,
            //             label: n.type,
            //             children: []
            //         }
            //         globalConfigNodes.treeList.addChild(configNodeTypes[parent][n.type])
            //     }
            //     configNodeTypes[parent][n.type].treeList.addChild(existingObject);
            // } else {
            //     if (empties[parent]) {
            //         empties[parent].treeList.remove();
            //         delete empties[parent];
            //     }
            //     objects[parent].treeList.addChild(existingObject)
            // }
        }
        existingObject.element.toggleClass("red-ui-info-outline-item-disabled", !!n.d)

        if (n._def.category === "config" && n.type !== 'group') {
            existingObject.element.find(".red-ui-info-outline-item-control-users").text(n.users.length);
        }

        updateSearch();
    }
    function onObjectRemove(n) {
        var existingObject = objects[n.id];
        existingObject.treeList.remove();
        delete objects[n.id]

        if (/^subflow:/.test(n.type)) {
            var sfType = n.type.substring(8);
            if (objects[sfType]) {
                objects[sfType].element.find(".red-ui-info-outline-item-control-users").text(RED.nodes.subflow(sfType).instances.length);
            }
        }

        // If this is a group being removed, it may have an empty item
        if (empties[n.id]) {
            delete empties[n.id];
        }
        var parent = existingObject.parent;
        if (parent.children.length === 0) {
            if (parent.config) {
                // this is a config
                parent.treeList.remove();
                delete configNodeTypes[parent.parent.id||n.z].types[n.type];
                if (parent.parent.children.length === 0) {
                    if (parent.parent.id === "__global__") {
                        parent.parent.treeList.addChild(getEmptyItem(parent.parent.id));
                    } else {
                        delete configNodeTypes[n.z];
                        parent.parent.treeList.remove();
                        if (parent.parent.parent.children.length === 0) {
                            parent.parent.parent.treeList.addChild(getEmptyItem(parent.parent.parent.id));
                        }
                    }
                }
            } else {
                parent.treeList.addChild(getEmptyItem(parent.id));
            }
        }
    }
    function getGutter(n) {
        var span = $("<span>",{class:"red-ui-info-outline-gutter red-ui-treeList-gutter-float"});
        var revealButton = $('<button type="button" class="red-ui-info-outline-item-control-reveal red-ui-button red-ui-button-small"><i class="fa fa-search"></i></button>').appendTo(span).on("click",function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            RED.view.reveal(n.id);
        })
        RED.popover.tooltip(revealButton,RED._("sidebar.info.find"));
        return span;
    }

    function createFlowConfigNode(parent,type) {
        // console.log("createFlowConfig",parent,type,configNodeTypes[parent]);
        if (empties[parent]) {
            empties[parent].treeList.remove();
            delete empties[parent];
        }
        if (!configNodeTypes[parent]) {
            // There is no 'config nodes' item in the parent flow
            configNodeTypes[parent] = {
                config: true,
                flow: parent,
                types: {},
                label: RED._("menu.label.displayConfig"),
                children: []
            }
            objects[parent].treeList.insertChildAt(configNodeTypes[parent],0);
            // console.log("CREATED", parent)
        }
        if (!configNodeTypes[parent].types[type]) {
            configNodeTypes[parent].types[type] = {
                config: true,
                label: type,
                children: []
            }
            configNodeTypes[parent].treeList.addChild(configNodeTypes[parent].types[type]);
            // console.log("CREATED", parent,type)
        }
    }
    function onNodeAdd(n) {
        objects[n.id] = {
            id: n.id,
            element: getNodeLabel(n),
            gutter: getGutter(n)
        }
        if (n.type === "group") {
            objects[n.id].children = [];
            objects[n.id].deferBuild = true;
            if (missingParents[n.id]) {
                objects[n.id].children = missingParents[n.id];
                delete missingParents[n.id]
            }
            if (objects[n.id].children.length === 0) {
                objects[n.id].children.push(getEmptyItem(n.id));
            }
        }
        var parent = n.g||n.z||"__global__";

        if (n._def.category !== "config" || n.type === 'group') {
            if (objects[parent]) {
                if (empties[parent]) {
                    empties[parent].treeList.remove();
                    delete empties[parent];
                }
                if (objects[parent].treeList) {
                    objects[parent].treeList.addChild(objects[n.id]);
                } else {
                    objects[parent].children.push(objects[n.id])
                }
            } else {
                missingParents[parent] = missingParents[parent]||[];
                missingParents[parent].push(objects[n.id])
            }
        } else {
            createFlowConfigNode(parent,n.type);
            configNodeTypes[parent].types[n.type].treeList.addChild(objects[n.id]);
        }
        objects[n.id].element.toggleClass("red-ui-info-outline-item-disabled", !!n.d)
        if (/^subflow:/.test(n.type)) {
            var sfType = n.type.substring(8);
            if (objects[sfType]) {
                objects[sfType].element.find(".red-ui-info-outline-item-control-users").text(RED.nodes.subflow(sfType).instances.length);
            }
        }
        updateSearch();
    }

    var updateSearchTimer;
    function updateSearch() {
        if (updateSearchTimer) {
            clearTimeout(updateSearchTimer)
        }
        if (activeSearch) {
            updateSearchTimer = setTimeout(function() {
                searchInput.searchBox("change");
            },100);
        }
    }
    function onSelectionChanged(selection) {
        // treeList.treeList('clearSelection');
    }

    return {
        build: build,
        search: function(val) {
            searchInput.searchBox('value',val)
        },
        select: function(node) {
            if (node) {
                if (Array.isArray(node)) {
                    treeList.treeList('select', node.map(function(n) { return objects[n.id] }), false)
                } else {
                    treeList.treeList('select', objects[node.id], false)

                }
            } else {
                treeList.treeList('clearSelection')
            }
        },
        reveal: function(node) {
            treeList.treeList('show', objects[node.id])
        }
    }
})();
