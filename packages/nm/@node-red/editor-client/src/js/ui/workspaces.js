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


RED.workspaces = (function() {

    const documentTitle = document.title;

    var activeWorkspace = 0;
    var workspaceIndex = 0;

    var viewStack = [];
    var hideStack = [];
    var viewStackPos = 0;

    let flashingTab;
    let flashingTabTimer;

    function addToViewStack(id) {
        if (viewStackPos !== viewStack.length) {
            viewStack.splice(viewStackPos);
        }
        viewStack.push(id);
        viewStackPos = viewStack.length;
    }

    function removeFromHideStack(id) {
        hideStack = hideStack.filter(function(v) {
            if (v === id) {
                return false;
            } else if (Array.isArray(v)) {
                var i = v.indexOf(id);
                if (i > -1) {
                    v.splice(i,1);
                }
                if (v.length === 0) {
                    return false;
                }
                return true
            }
            return true;
        })
    }

    function addWorkspace(ws,skipHistoryEntry,targetIndex) {
        if (ws) {
            if (!ws.closeable) {
                ws.hideable = true;
            }
            if (!ws.hasOwnProperty('locked')) {
                ws.locked = false
            }
            workspace_tabs.addTab(ws,targetIndex);

            var hiddenTabs = JSON.parse(RED.settings.getLocal("hiddenTabs")||"{}");
            if (hiddenTabs[ws.id]) {
                workspace_tabs.hideTab(ws.id);
            }
            workspace_tabs.resize();
        } else {
            var tabId = RED.nodes.id();
            do {
                workspaceIndex += 1;
            } while ($("#red-ui-workspace-tabs li[flowname='"+RED._('workspace.defaultName',{number:workspaceIndex})+"']").size() !== 0);

            ws = {
                type: "tab",
                id: tabId,
                disabled: false,
                locked: false,
                info: "",
                label: RED._('workspace.defaultName',{number:workspaceIndex}),
                env: [],
                hideable: true,
            };
            if (!skipHistoryEntry) {
                ws.added = true
            }
            RED.nodes.addWorkspace(ws,targetIndex);
            workspace_tabs.addTab(ws,targetIndex);

            workspace_tabs.activateTab(tabId);
            if (!skipHistoryEntry) {
                RED.history.push({t:'add',workspaces:[ws],dirty:RED.nodes.dirty()});
                RED.nodes.dirty(true);
            }
        }
        $("#red-ui-tab-"+(ws.id.replace(".","-"))).attr("flowname",ws.label).toggleClass('red-ui-workspace-changed',!!(ws.contentsChanged || ws.changed || ws.added));
        RED.view.focus();
        return ws;
    }

    function deleteWorkspace(ws) {
        if (workspaceTabCount === 1) {
            return;
        }
        if (ws.locked) {
            return
        }
        var workspaceOrder = RED.nodes.getWorkspaceOrder();
        ws._index = workspaceOrder.indexOf(ws.id);
        removeWorkspace(ws);
        var historyEvent = RED.nodes.removeWorkspace(ws.id);
        historyEvent.t = 'delete';
        historyEvent.dirty = RED.nodes.dirty();
        historyEvent.workspaces = [ws];
        RED.history.push(historyEvent);
        RED.nodes.dirty(true);
        RED.sidebar.config.refresh();
    }

    function showEditWorkspaceDialog(id) {
        var workspace = RED.nodes.workspace(id);
        if (!workspace) {
            var subflow = RED.nodes.subflow(id);
            if (subflow) {
                RED.editor.editSubflow(subflow);
            }
        } else {
            if (!workspace.locked) {
                RED.editor.editFlow(workspace);
            }
        }
    }


    var workspace_tabs;
    var workspaceTabCount = 0;

    function getMenuItems(isMenuButton, tab) {
        let hiddenFlows = new Set()
        for (let i = 0; i < hideStack.length; i++) {
            let ids = hideStack[i]
            if (!Array.isArray(ids)) {
                ids = [ids]
            }
            ids.forEach(id => {
                if (RED.nodes.workspace(id)) {
                    hiddenFlows.add(id)
                }
            })
        }
        const hiddenflowCount = hiddenFlows.size;
        let activeWorkspace = tab || RED.nodes.workspace(RED.workspaces.active()) || RED.nodes.subflow(RED.workspaces.active())
        let isFlowDisabled = activeWorkspace ? activeWorkspace.disabled : false
        const currentTabs = workspace_tabs.listTabs();
        let flowCount = 0;
        currentTabs.forEach(tab => {
            if (RED.nodes.workspace(tab)) {
                flowCount++;
            }
        });

        let isCurrentLocked = RED.workspaces.isLocked()
        if (tab) {
            isCurrentLocked = tab.locked
        }

        var menuItems = []
        if (isMenuButton) {
            menuItems.push({
                id:"red-ui-tabs-menu-option-search-flows",
                label: RED._("workspace.listFlows"),
                onselect: "core:list-flows"
            },
            {
                id:"red-ui-tabs-menu-option-search-subflows",
                label: RED._("workspace.listSubflows"),
                onselect: "core:list-subflows"
            },
            null)
        }
        if (RED.settings.theme("menu.menu-item-workspace-add", true)) {
            menuItems.push(
                {
                    id:"red-ui-tabs-menu-option-add-flow",
                    label: RED._("workspace.addFlow"),
                    onselect: "core:add-flow"
                }
            )
        }
        if (isMenuButton || !!tab) {
            if (RED.settings.theme("menu.menu-item-workspace-add", true)) {
                menuItems.push(
                    {
                        id:"red-ui-tabs-menu-option-add-flow-right",
                        label: RED._("workspace.addFlowToRight"),
                        shortcut: RED.keyboard.getShortcut("core:add-flow-to-right"),
                        onselect: function() {
                            RED.actions.invoke("core:add-flow-to-right", tab)
                        }
                    },
                    null
                )
            }
            if (activeWorkspace && activeWorkspace.type === 'tab') {
                menuItems.push(
                    isFlowDisabled ? {
                        label: RED._("workspace.enableFlow"),
                        shortcut: RED.keyboard.getShortcut("core:enable-flow"),
                        onselect: function() {
                            RED.actions.invoke("core:enable-flow", tab?tab.id:undefined)
                        },
                        disabled: isCurrentLocked
                    } : {
                        label: RED._("workspace.disableFlow"),
                        shortcut: RED.keyboard.getShortcut("core:disable-flow"),
                        onselect: function() {
                            RED.actions.invoke("core:disable-flow", tab?tab.id:undefined)
                        },
                        disabled: isCurrentLocked
                    },
                    isCurrentLocked? {
                        label: RED._("workspace.unlockFlow"),
                        shortcut: RED.keyboard.getShortcut("core:unlock-flow"),
                        onselect: function() {
                            RED.actions.invoke('core:unlock-flow', tab?tab.id:undefined)
                        }
                    } : {
                        label: RED._("workspace.lockFlow"),
                        shortcut: RED.keyboard.getShortcut("core:lock-flow"),
                        onselect: function() {
                            RED.actions.invoke('core:lock-flow', tab?tab.id:undefined)
                        }
                    },
                    null
                )
            }
            const activeIndex = currentTabs.findIndex(id => (activeWorkspace && (id === activeWorkspace.id)));
            menuItems.push(
                {
                    label: RED._("workspace.moveToStart"),
                    shortcut: RED.keyboard.getShortcut("core:move-flow-to-start"),
                    onselect: function() {
                        RED.actions.invoke("core:move-flow-to-start", tab?tab.id:undefined)
                    },
                    disabled: activeIndex === 0
                },
                {
                    label: RED._("workspace.moveToEnd"),
                    shortcut: RED.keyboard.getShortcut("core:move-flow-to-end"),
                    onselect: function() {
                        RED.actions.invoke("core:move-flow-to-end", tab?tab.id:undefined)
                    },
                    disabled: activeIndex === currentTabs.length - 1
                }
            )
        }
        if (menuItems.length > 0) {
            menuItems.push(null)
        }
        if (isMenuButton || !!tab) {
            menuItems.push(
                {
                    id:"red-ui-tabs-menu-option-add-hide-flows",
                    label: RED._("workspace.hideFlow"),
                    shortcut: RED.keyboard.getShortcut("core:hide-flow"),
                    onselect: function() {
                        RED.actions.invoke("core:hide-flow", tab)
                    }
                },
                {
                    id:"red-ui-tabs-menu-option-add-hide-other-flows",
                    label: RED._("workspace.hideOtherFlows"),
                    shortcut: RED.keyboard.getShortcut("core:hide-other-flows"),
                    onselect: function() {
                        RED.actions.invoke("core:hide-other-flows", tab)
                    }
                }
            )

        }
        
        menuItems.push(
            {
                id:"red-ui-tabs-menu-option-add-hide-all-flows",
                label: RED._("workspace.hideAllFlows"),
                onselect: "core:hide-all-flows",
                disabled: (hiddenflowCount === flowCount)
            },
            {
                id:"red-ui-tabs-menu-option-add-show-all-flows",
                disabled: hiddenflowCount === 0,
                label: RED._("workspace.showAllFlows", { count: hiddenflowCount }),
                onselect: "core:show-all-flows"
            },
            {
                id:"red-ui-tabs-menu-option-add-show-last-flow",
                disabled: hideStack.length === 0,
                label: RED._("workspace.showLastHiddenFlow"),
                onselect: "core:show-last-hidden-flow"
            }
        )
        if (tab) {
            menuItems.push(null)

            if (RED.settings.theme("menu.menu-item-workspace-delete", true)) {
                menuItems.push(
                    {
                        label: RED._("common.label.delete"),
                        onselect: function() {
                            if (tab.type === 'tab') {
                                RED.workspaces.delete(tab)
                            } else if (tab.type === 'subflow') {
                                RED.subflow.delete(tab.id)
                            }
                        },
                        disabled: isCurrentLocked || (workspaceTabCount === 1)
                    }
                )
            }
            menuItems.push(
                {
                    label: RED._("menu.label.export"),
                    shortcut: RED.keyboard.getShortcut("core:show-export-dialog"),
                    onselect: function() {
                        RED.workspaces.show(tab.id)
                        RED.actions.invoke('core:show-export-dialog', null, 'flow')
                    }
                }
            )
        }
        // if (isMenuButton && hiddenflowCount > 0) {
        //     menuItems.unshift({
        //         label: RED._("workspace.hiddenFlows",{count: hiddenflowCount}),
        //         onselect: "core:list-hidden-flows"
        //     })
        // }
        return menuItems;
    }
    function createWorkspaceTabs() {
        workspace_tabs = RED.tabs.create({
            id: "red-ui-workspace-tabs",
            onchange: function(tab) {
                var event = {
                    old: activeWorkspace
                }
                if (tab) {
                    $("#red-ui-workspace-chart").show();
                    activeWorkspace = tab.id;
                    window.location.hash = 'flow/'+tab.id;
                    if (tab.label) {
                        document.title = `${documentTitle} : ${tab.label}`
                    } else {
                        document.title = documentTitle
                    }
                    $("#red-ui-workspace").toggleClass("red-ui-workspace-disabled", !!tab.disabled);
                    $("#red-ui-workspace").toggleClass("red-ui-workspace-locked", !!tab.locked);
                } else {
                    $("#red-ui-workspace-chart").hide();
                    activeWorkspace = 0;
                    window.location.hash = '';
                    document.title = documentTitle
                }
                event.workspace = activeWorkspace;
                RED.events.emit("workspace:change",event);
                RED.sidebar.config.refresh();
                RED.view.focus();
            },
            onclick: function(tab, evt) {
                if(evt.which === 2) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    RED.actions.invoke("core:hide-flow", tab)
                } else {
                    if (tab.id !== activeWorkspace) {
                        addToViewStack(activeWorkspace);
                    }
                    RED.view.focus();
                }
            },
            ondblclick: function(tab) {
                if (tab.type != "subflow") {
                    showEditWorkspaceDialog(tab.id);
                } else {
                    RED.editor.editSubflow(RED.nodes.subflow(tab.id));
                }
            },
            onadd: function(tab) {
                if (tab.type === "tab") {
                    workspaceTabCount++;
                }
                $('<span class="red-ui-workspace-disabled-icon"><i class="fa fa-ban"></i> </span>').prependTo("#red-ui-tab-"+(tab.id.replace(".","-"))+" .red-ui-tab-label");
                if (tab.disabled) {
                    $("#red-ui-tab-"+(tab.id.replace(".","-"))).addClass('red-ui-workspace-disabled');
                }
                $('<span class="red-ui-workspace-locked-icon"><i class="fa fa-lock"></i> </span>').prependTo("#red-ui-tab-"+(tab.id.replace(".","-"))+" .red-ui-tab-label");
                if (tab.locked) {
                    $("#red-ui-tab-"+(tab.id.replace(".","-"))).addClass('red-ui-workspace-locked');
                }

                const changeBadgeContainer = $('<svg class="red-ui-flow-tab-changed red-ui-flow-node-changed" width="10" height="10" viewBox="-1 -1 12 12"></svg>').appendTo("#red-ui-tab-"+(tab.id.replace(".","-")))
                const changeBadge = document.createElementNS("http://www.w3.org/2000/svg","circle");
                changeBadge.setAttribute("cx",5);
                changeBadge.setAttribute("cy",5);
                changeBadge.setAttribute("r",5);
                changeBadgeContainer.append(changeBadge)

                RED.menu.setDisabled("menu-item-workspace-delete",activeWorkspace === 0 || workspaceTabCount <= 1);
                if (workspaceTabCount === 1) {
                    showWorkspace();
                }
            },
            onremove: function(tab) {
                if (tab.type === "tab") {
                    workspaceTabCount--;
                } else {
                    RED.events.emit("workspace:close",{workspace: tab.id})
                    hideStack.push(tab.id);
                }
                RED.menu.setDisabled("menu-item-workspace-delete",activeWorkspace === 0 || workspaceTabCount <= 1);
                if (workspaceTabCount === 0) {
                    hideWorkspace();
                }
            },
            onreorder: function(oldOrder, newOrder) {
                RED.history.push({
                    t:'reorder',
                    workspaces: {
                        from: oldOrder,
                        to: newOrder
                    },
                    dirty:RED.nodes.dirty()
                });
                // Only mark flows dirty if flow-order has changed (excluding subflows)
                const filteredOldOrder = oldOrder.filter(id => !!RED.nodes.workspace(id))
                const filteredNewOrder = newOrder.filter(id => !!RED.nodes.workspace(id))

                if (JSON.stringify(filteredOldOrder) !== JSON.stringify(filteredNewOrder)) {
                    RED.nodes.dirty(true);
                    setWorkspaceOrder(newOrder);
                }
            },
            onselect: function(selectedTabs) {
                RED.view.select(false)
                if (selectedTabs.length === 0) {
                    $("#red-ui-workspace-chart svg").css({"pointer-events":"auto",filter:"none"})
                    $("#red-ui-workspace-toolbar").css({"pointer-events":"auto",filter:"none"})
                    $("#red-ui-palette-container").css({"pointer-events":"auto",filter:"none"})
                    $(".red-ui-sidebar-shade").hide();
                } else {
                    RED.view.select(false)
                    $("#red-ui-workspace-chart svg").css({"pointer-events":"none",filter:"opacity(60%)"})
                    $("#red-ui-workspace-toolbar").css({"pointer-events":"none",filter:"opacity(60%)"})
                    $("#red-ui-palette-container").css({"pointer-events":"none",filter:"opacity(60%)"})
                    $(".red-ui-sidebar-shade").show();
                }
            },
            onhide: function(tab) {
                hideStack.push(tab.id);
                if (tab.type === "tab") {
                    var hiddenTabs = JSON.parse(RED.settings.getLocal("hiddenTabs")||"{}");
                    hiddenTabs[tab.id] = true;
                    RED.settings.setLocal("hiddenTabs",JSON.stringify(hiddenTabs));
                    RED.events.emit("workspace:hide",{workspace: tab.id})
                }
            },
            onshow: function(tab) {
                removeFromHideStack(tab.id);

                var hiddenTabs = JSON.parse(RED.settings.getLocal("hiddenTabs")||"{}");
                delete hiddenTabs[tab.id];
                RED.settings.setLocal("hiddenTabs",JSON.stringify(hiddenTabs));

                RED.events.emit("workspace:show",{workspace: tab.id})
            },
            minimumActiveTabWidth: 150,
            scrollable: true,
            addButton: RED.settings.theme("menu.menu-item-workspace-add", true) ? "core:add-flow" : undefined,
            addButtonCaption: RED._("workspace.addFlow"),
            menu: function() { return getMenuItems(true) },
            contextmenu: function(tab) { return getMenuItems(false, tab) }
        });
        workspaceTabCount = 0;
    }
    function showWorkspace() {
        $("#red-ui-workspace .red-ui-tabs").show()
        $("#red-ui-workspace-chart").show()
        $("#red-ui-workspace-footer").children().show()
    }
    function hideWorkspace() {
        $("#red-ui-workspace .red-ui-tabs").hide()
        $("#red-ui-workspace-chart").hide()
        $("#red-ui-workspace-footer").children().hide()
    }

    function init() {
        $('<ul id="red-ui-workspace-tabs"></ul>').appendTo("#red-ui-workspace");
        $('<div id="red-ui-workspace-tabs-shade" class="hide"></div>').appendTo("#red-ui-workspace");
        $('<div id="red-ui-workspace-chart" tabindex="1"></div>').appendTo("#red-ui-workspace");
        $('<div id="red-ui-workspace-toolbar"></div>').appendTo("#red-ui-workspace");
        $('<div id="red-ui-workspace-footer" class="red-ui-component-footer"></div>').appendTo("#red-ui-workspace");
        $('<div id="red-ui-editor-shade" class="hide"></div>').appendTo("#red-ui-workspace");


        createWorkspaceTabs();
        RED.events.on("sidebar:resize",workspace_tabs.resize);

        RED.events.on("workspace:clear", () => {
            // Reset the index used to generate new flow names
            workspaceIndex = 0
        })

        RED.actions.add("core:show-next-tab",function() {
            var oldActive = activeWorkspace;
            workspace_tabs.nextTab();
            if (oldActive !== activeWorkspace) {
                addToViewStack(oldActive)
            }
        });
        RED.actions.add("core:show-previous-tab",function() {
            var oldActive = activeWorkspace;
            workspace_tabs.previousTab();
            if (oldActive !== activeWorkspace) {
                addToViewStack(oldActive)
            }
        });

        RED.menu.setAction('menu-item-workspace-delete',function() {
            deleteWorkspace(RED.nodes.workspace(activeWorkspace));
        });

        $(window).on("resize", function() {
            workspace_tabs.resize();
        });
        if (RED.settings.theme("menu.menu-item-workspace-add", true)) {
            RED.actions.add("core:add-flow",function(opts) { addWorkspace(undefined,undefined,opts?opts.index:undefined)});
            RED.actions.add("core:add-flow-to-right",function(workspace) {
                let index
                if (workspace) {
                    index = workspace_tabs.getTabIndex(workspace.id)+1
                } else {
                    index = workspace_tabs.activeIndex()+1
                }
                addWorkspace(undefined,undefined,index)
            });
        }
        if (RED.settings.theme("menu.menu-item-workspace-edit", true)) {
            RED.actions.add("core:edit-flow",editWorkspace);
        }
        if (RED.settings.theme("menu.menu-item-workspace-delete", true)) {
            RED.actions.add("core:remove-flow",removeWorkspace);
        }
        RED.actions.add("core:enable-flow",enableWorkspace);
        RED.actions.add("core:disable-flow",disableWorkspace);
        RED.actions.add("core:lock-flow",lockWorkspace);
        RED.actions.add("core:unlock-flow",unlockWorkspace);
        RED.actions.add("core:move-flow-to-start", function(id) { moveWorkspace(id, 'start') });
        RED.actions.add("core:move-flow-to-end", function(id) { moveWorkspace(id, 'end') });

        RED.actions.add("core:hide-flow", function(workspace) {
            let selection
            if (workspace) {
                selection = [workspace]
            } else {
                selection = workspace_tabs.selection();
                if (selection.length === 0) {
                    selection = [{id:activeWorkspace}]
                }
            }
            var hiddenTabs = [];
            selection.forEach(function(ws) {
                RED.workspaces.hide(ws.id);
                hideStack.pop();
                hiddenTabs.push(ws.id);
            })
            if (hiddenTabs.length > 0) {
                hideStack.push(hiddenTabs);
            }
            workspace_tabs.clearSelection();
        })

        RED.actions.add("core:hide-other-flows", function(workspace) {
            let selection
            if (workspace) {
                selection = [workspace]
            } else {
                selection = workspace_tabs.selection();
                if (selection.length === 0) {
                    selection = [{id:activeWorkspace}]
                }
            }
            var selected = new Set(selection.map(function(ws) { return ws.id }))

            var currentTabs = workspace_tabs.listTabs();
            var hiddenTabs = [];
            currentTabs.forEach(function(id) {
                if (!selected.has(id)) {
                    RED.workspaces.hide(id);
                    hideStack.pop();
                    hiddenTabs.push(id);
                }
            })
            if (hiddenTabs.length > 0) {
                hideStack.push(hiddenTabs);
            }
        })

        RED.actions.add("core:hide-all-flows", function() {
            var currentTabs = workspace_tabs.listTabs();
            currentTabs.forEach(function(id) {
                RED.workspaces.hide(id);
                hideStack.pop();
            })
            if (currentTabs.length > 0) {
                hideStack.push(currentTabs);
            }
            workspace_tabs.clearSelection();
        })
        RED.actions.add("core:show-all-flows", function() {
            var currentTabs = workspace_tabs.listTabs();
            currentTabs.forEach(function(id) {
                RED.workspaces.show(id, null, true)
            })
        })
        // RED.actions.add("core:toggle-flows", function() {
        //     var currentTabs = workspace_tabs.listTabs();
        //     var visibleCount = workspace_tabs.count();
        //     currentTabs.forEach(function(id) {
        //         if (visibleCount === 0) {
        //             RED.workspaces.show(id)
        //         } else {
        //             RED.workspaces.hide(id)
        //         }
        //     })
        // })
        RED.actions.add("core:show-last-hidden-flow", function() {
            var id = hideStack.pop();
            if (id) {
                if (typeof id === 'string') {
                    RED.workspaces.show(id);
                } else {
                    var last = id.pop();
                    id.forEach(function(i) {
                        RED.workspaces.show(i, null, true);
                    })
                    setTimeout(function() {
                        RED.workspaces.show(last);
                    },150)

                }
            }
        })
        RED.actions.add("core:list-modified-nodes",function() {
            RED.actions.invoke("core:search","is:modified ");
        })
        RED.actions.add("core:list-hidden-flows",function() {
            RED.actions.invoke("core:search","is:hidden ");
        })
        RED.actions.add("core:list-flows",function() {
            RED.actions.invoke("core:search","type:tab ");
        })
        RED.actions.add("core:list-subflows",function() {
            RED.actions.invoke("core:search","type:subflow ");
        })
        RED.actions.add("core:go-to-previous-location", function() {
            if (viewStackPos > 0) {
                if (viewStackPos === viewStack.length) {
                    // We're at the end of the stack. Remember the activeWorkspace
                    // so we can come back to it.
                    viewStack.push(activeWorkspace);
                }
                RED.workspaces.show(viewStack[--viewStackPos],true);
            }
        })
        RED.actions.add("core:go-to-next-location", function() {
            if (viewStackPos < viewStack.length - 1) {
                RED.workspaces.show(viewStack[++viewStackPos],true);
            }
        })

        RED.events.on("flows:change", (ws) => {
            $("#red-ui-tab-"+(ws.id.replace(".","-"))).toggleClass('red-ui-workspace-changed',!!(ws.contentsChanged || ws.changed || ws.added));
        })
        RED.events.on("subflows:change", (ws) => {
            $("#red-ui-tab-"+(ws.id.replace(".","-"))).toggleClass('red-ui-workspace-changed',!!(ws.contentsChanged || ws.changed || ws.added));
        })

        hideWorkspace();
    }

    function editWorkspace(id) {
        showEditWorkspaceDialog(id||activeWorkspace);
    }

    function enableWorkspace(id) {
        setWorkspaceState(id,false);
    }
    function disableWorkspace(id) {
        setWorkspaceState(id,true);
    }
    function setWorkspaceState(id,disabled) {
        var workspace = RED.nodes.workspace(id||activeWorkspace);
        if (!workspace || workspace.locked) {
            return;
        }
        if (workspace.disabled !== disabled) {
            var changes = { disabled: workspace.disabled };
            workspace.disabled = disabled;
            $("#red-ui-tab-"+(workspace.id.replace(".","-"))).toggleClass('red-ui-workspace-disabled',!!workspace.disabled);
            if (!id || (id === activeWorkspace)) {
                $("#red-ui-workspace").toggleClass("red-ui-workspace-disabled",!!workspace.disabled);
            }
            var historyEvent = {
                t: "edit",
                changes:changes,
                node: workspace,
                dirty: RED.nodes.dirty()
            }
            workspace.changed = true;
            RED.history.push(historyEvent);
            RED.events.emit("flows:change",workspace);
            RED.nodes.dirty(true);
            RED.sidebar.config.refresh();
            var selection = RED.view.selection();
            if (!selection.nodes && !selection.links && workspace.id === activeWorkspace) {
                RED.sidebar.info.refresh(workspace);
            }
            if (changes.hasOwnProperty('disabled')) {
                RED.nodes.eachNode(function(n) {
                    if (n.z === workspace.id) {
                        n.dirty = true;
                    }
                });
                RED.view.redraw();
            }
        }
    }
    function lockWorkspace(id) {
        setWorkspaceLockState(id,true);
    }
    function unlockWorkspace(id) {
        setWorkspaceLockState(id,false);
    }
    function setWorkspaceLockState(id,locked) {
        var workspace = RED.nodes.workspace(id||activeWorkspace);
        if (!workspace) {
            return;
        }
        if (workspace.locked !== locked) {
            var changes = { locked: workspace.locked };
            workspace.locked = locked;
            $("#red-ui-tab-"+(workspace.id.replace(".","-"))).toggleClass('red-ui-workspace-locked',!!workspace.locked);
            if (!id || (id === activeWorkspace)) {
                $("#red-ui-workspace").toggleClass("red-ui-workspace-locked",!!workspace.locked);
            }
            var historyEvent = {
                t: "edit",
                changes:changes,
                node: workspace,
                dirty: RED.nodes.dirty()
            }
            workspace.changed = true;
            RED.history.push(historyEvent);
            RED.events.emit("flows:change",workspace);
            RED.nodes.dirty(true);
            RED.sidebar.config.refresh();
            RED.nodes.filterNodes({z:workspace.id}).forEach(n => n.dirty = true)
            RED.view.redraw(true);
        }
    }

    function removeWorkspace(ws) {
        if (!ws) {
            ws = RED.nodes.workspace(activeWorkspace)
            if (ws && !ws.locked) {
                deleteWorkspace(RED.nodes.workspace(activeWorkspace));
            }
        } else {
            if (ws.locked) { return }
            if (workspace_tabs.contains(ws.id)) {
                workspace_tabs.removeTab(ws.id);
            }
            if (ws.id === activeWorkspace) {
                activeWorkspace = 0;
            }
        }
    }

    function moveWorkspace(id, direction) {
        const workspace = RED.nodes.workspace(id||activeWorkspace) || RED.nodes.subflow(id||activeWorkspace);
        if (!workspace) {
            return;
        }
        const currentOrder = workspace_tabs.listTabs()
        const oldOrder = [...currentOrder]
        const currentIndex = currentOrder.findIndex(id => id === workspace.id)
        currentOrder.splice(currentIndex, 1)
        if (direction === 'start') {
            currentOrder.unshift(workspace.id)
        } else if (direction === 'end') {
            currentOrder.push(workspace.id)
        }
        const newOrder = setWorkspaceOrder(currentOrder)
        if (JSON.stringify(newOrder) !== JSON.stringify(oldOrder)) {
            RED.history.push({
                t:'reorder',
                workspaces: {
                    from:oldOrder,
                    to:newOrder
                },
                dirty:RED.nodes.dirty()
            });
            const filteredOldOrder = oldOrder.filter(id => !!RED.nodes.workspace(id))
            const filteredNewOrder = newOrder.filter(id => !!RED.nodes.workspace(id))
            if (JSON.stringify(filteredOldOrder) !== JSON.stringify(filteredNewOrder)) {
                RED.nodes.dirty(true);
            }
        }
    }
    function setWorkspaceOrder(order) {
        var newOrder = order.filter(id => !!RED.nodes.workspace(id))
        var currentOrder = RED.nodes.getWorkspaceOrder();
        if (JSON.stringify(newOrder) !== JSON.stringify(currentOrder)) {
            RED.nodes.setWorkspaceOrder(newOrder);
            RED.events.emit("flows:reorder",newOrder);
        }
        workspace_tabs.order(order);
        return newOrder
    }

    function flashTab(tabId) {
        if(flashingTab && flashingTab.length) {
            //cancel current flashing node before flashing new node
            clearInterval(flashingTabTimer);
            flashingTabTimer = null;
            flashingTab.removeClass('highlighted');
            flashingTab = null;
        }
        let tab = $("#red-ui-tab-" + tabId);
        if(!tab || !tab.length) { return; }

        flashingTabTimer = setInterval(function(flashEndTime) {
            if (flashEndTime >= Date.now()) {
                const highlighted = tab.hasClass("highlighted");
                tab.toggleClass('highlighted', !highlighted)
            } else {
                clearInterval(flashingTabTimer);
                flashingTabTimer = null;
                flashingTab = null;
                tab.removeClass('highlighted');
            }
        }, 100, Date.now() + 2200);
        flashingTab = tab;
        tab.addClass('highlighted');
    }
    return {
        init: init,
        add: addWorkspace,
        // remove: remove workspace without editor history etc
        remove: removeWorkspace,
        // delete: remove workspace and update editor history
        delete: deleteWorkspace,
        order: setWorkspaceOrder,
        edit: editWorkspace,
        contains: function(id) {
            return workspace_tabs.contains(id);
        },
        count: function() {
            return workspaceTabCount;
        },
        active: function() {
            return activeWorkspace
        },
        isLocked: function(id) {
            id = id || activeWorkspace
            var ws = RED.nodes.workspace(id) || RED.nodes.subflow(id)
            return ws && ws.locked
        },
        selection: function() {
            return workspace_tabs.selection();
        },
        hide: function(id) {
            if (!id) {
                id = activeWorkspace;
            }
            if (workspace_tabs.contains(id)) {
                workspace_tabs.hideTab(id);
            }
        },
        isHidden: function(id) {
            return hideStack.includes(id)
        },
        show: function(id,skipStack,unhideOnly,flash) {
            if (!workspace_tabs.contains(id)) {
                var sf = RED.nodes.subflow(id);
                if (sf) {
                    addWorkspace(
                        {type:"subflow",id:id,icon:"red/images/subflow_tab.svg",label:sf.name, closeable: true},
                        null,
                        workspace_tabs.activeIndex()+1
                    );
                    removeFromHideStack(id);
                } else {
                    return;
                }
            }
            if (unhideOnly) {
                workspace_tabs.showTab(id);
            } else {
                if (!skipStack && activeWorkspace !== id) {
                    addToViewStack(activeWorkspace)
                }
                workspace_tabs.activateTab(id);
            }
            if(flash) {
                flashTab(id.replace(".","-"))
            }
        },
        refresh: function() {
            var workspace = RED.nodes.workspace(RED.workspaces.active());
            if (workspace) {
                document.title = `${documentTitle} : ${workspace.label}`;
            } else {
                var subflow = RED.nodes.subflow(RED.workspaces.active());
                if (subflow) {
                    document.title = `${documentTitle} : ${subflow.name}`;
                } else {
                    document.title = documentTitle
                }
            }
            RED.nodes.eachWorkspace(function(ws) {
                workspace_tabs.renameTab(ws.id,ws.label);
                $("#red-ui-tab-"+(ws.id.replace(".","-"))).attr("flowname",ws.label)
            })
            RED.nodes.eachSubflow(function(sf) {
                if (workspace_tabs.contains(sf.id)) {
                    workspace_tabs.renameTab(sf.id,sf.name);
                }
            });
            RED.sidebar.config.refresh();
        },
        resize: function() {
            workspace_tabs.resize();
        },
        enable: enableWorkspace,
        disable: disableWorkspace,
        lock: lockWorkspace,
        unlock: unlockWorkspace
    }
})();
