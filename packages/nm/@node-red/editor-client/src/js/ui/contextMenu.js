RED.contextMenu = (function () {

    let menu;

    function disposeMenu() {
        $(document).off("mousedown.red-ui-workspace-context-menu");
        if (menu) {
            menu.remove();
        }
        menu = null;
    }
    function show(options) {
        if (menu) {
            menu.remove()
        }
        let menuItems = []
        if (options.options) {
            menuItems = options.options
        } else if (options.type === 'workspace') {
            const selection = RED.view.selection()
            const noSelection = !selection || Object.keys(selection).length === 0
            const hasSelection = (selection.nodes && selection.nodes.length > 0);
            const hasMultipleSelection = hasSelection && selection.nodes.length > 1;
            const virtulLinks = (selection.links && selection.links.filter(e => !!e.link)) || [];
            const wireLinks = (selection.links && selection.links.filter(e => !e.link)) || [];
            const hasLinks = wireLinks.length > 0;
            const isSingleLink = !hasSelection && hasLinks && wireLinks.length === 1
            const isMultipleLinks = !hasSelection && hasLinks && wireLinks.length > 1
            const canDelete = hasSelection || hasLinks
            const isGroup = hasSelection && selection.nodes.length === 1 && selection.nodes[0].type === 'group'
            const canEdit = !RED.workspaces.isLocked()
            const canRemoveFromGroup = hasSelection && !!selection.nodes[0].g
            let hasGroup, isAllGroups = true, hasDisabledNode, hasEnabledNode, hasLabeledNode, hasUnlabeledNode;
            if (hasSelection) {
                const nodes = selection.nodes.slice();
                while (nodes.length) {
                    const n = nodes.shift();
                    if (n.type === 'group') {
                        hasGroup = true;
                        nodes.push(...n.nodes);
                    } else {
                        isAllGroups = false;
                        if (n.d) {
                            hasDisabledNode = true;
                        } else {
                            hasEnabledNode = true;
                        }
                    }
                    if (n.l === undefined) {
                        // Check if the node sets showLabel in the defaults
                        // as that determines the default behaviour for the node
                        if (n._def.showLabel !== false) {
                            hasLabeledNode = true;
                        } else {
                            hasUnlabeledNode = true;
                        }
                    } else {
                        if (n.l) {
                            hasLabeledNode = true;
                        } else {
                            hasUnlabeledNode = true;
                        }
                    }
                }
            }

            const scale = RED.view.scale()
            const offset = $("#red-ui-workspace-chart").offset()
            let addX = (options.x - offset.left + $("#red-ui-workspace-chart").scrollLeft()) / scale
            let addY = (options.y - offset.top + $("#red-ui-workspace-chart").scrollTop()) / scale

            if (RED.view.snapGrid) {
                const gridSize = RED.view.gridSize()
                addX = gridSize * Math.round(addX / gridSize)
                addY = gridSize * Math.round(addY / gridSize)
            }

            if (RED.settings.theme("menu.menu-item-action-list", true)) {
                menuItems.push(
                    { onselect: 'core:show-action-list', label: RED._("contextMenu.showActionList"), onpostselect: function () { } }
                )
            }
            const insertOptions = []
            menuItems.push({ label: RED._("contextMenu.insert"), options: insertOptions })
            insertOptions.push(
                {
                    label: RED._("contextMenu.node"),
                    onselect: function () {
                        RED.view.showQuickAddDialog({
                            position: [addX, addY],
                            touchTrigger: 'ontouchstart' in window,
                            splice: isSingleLink ? selection.links[0] : undefined,
                            // spliceMultiple: isMultipleLinks
                        })
                    },
                    disabled: !canEdit
                },
                (hasLinks) ? { // has least 1 wire selected
                    label: RED._("contextMenu.junction"),
                    onselect: function () {
                        RED.actions.invoke('core:split-wires-with-junctions', { x: addX, y: addY })
                    },
                    disabled: !canEdit || !hasLinks
                } : {
                    label: RED._("contextMenu.junction"),
                    onselect: function () {
                        const nn = {
                            _def: { defaults: {} },
                            type: 'junction',
                            z: RED.workspaces.active(),
                            id: RED.nodes.id(),
                            x: addX,
                            y: addY,
                            w: 0, h: 0,
                            outputs: 1,
                            inputs: 1,
                            dirty: true,
                            moved: true
                        }
                        const junction = RED.nodes.addJunction(nn);
                        const historyEvent = {
                            dirty: RED.nodes.dirty(),
                            t: 'add',
                            junctions: [junction]
                        }
                        RED.history.push(historyEvent);
                        RED.nodes.dirty(true);
                        RED.view.select({nodes: [junction] });
                        RED.view.redraw(true)
                    },
                    disabled: !canEdit
                },
                {
                    label: RED._("contextMenu.linkNodes"),
                    onselect: 'core:split-wire-with-link-nodes',
                    disabled: !canEdit || !hasLinks
                },
                null
            )
            if (RED.settings.theme("menu.menu-item-import-library", true)) {
                insertOptions.push(
                    { onselect: 'core:show-import-dialog', label: RED._('common.label.import')},
                    { onselect: 'core:show-examples-import-dialog', label: RED._('menu.label.importExample') }
                )
            }


            if (hasSelection && canEdit) {
                const nodeOptions = []
                if (!hasMultipleSelection && !isGroup) {
                    nodeOptions.push(
                        { onselect: 'core:show-node-help', label: RED._('menu.label.showNodeHelp') },
                        null
                    )
                }
                nodeOptions.push(
                    { onselect: 'core:enable-selected-nodes', label: RED._('menu.label.enableSelectedNodes'), disabled: !hasDisabledNode },
                    { onselect: 'core:disable-selected-nodes', label: RED._('menu.label.disableSelectedNodes'), disabled: !hasEnabledNode },
                    null,
                    { onselect: 'core:show-selected-node-labels', label: RED._('menu.label.showSelectedNodeLabels'), disabled: !hasUnlabeledNode },
                    { onselect: 'core:hide-selected-node-labels', label: RED._('menu.label.hideSelectedNodeLabels'), disabled: !hasLabeledNode }
                )
                menuItems.push({
                    label: RED._('sidebar.info.node'),
                    options: nodeOptions
                })
                menuItems.push({
                    label: RED._('sidebar.info.group'),
                    options: [
                        { onselect: 'core:group-selection', label: RED._("menu.label.groupSelection") },
                        { onselect: 'core:ungroup-selection', label: RED._("menu.label.ungroupSelection"), disabled: !hasGroup },
                    ]
                })
                if (hasGroup) {
                    menuItems[menuItems.length - 1].options.push(
                        { onselect: 'core:merge-selection-to-group', label: RED._("menu.label.groupMergeSelection") }
                    )

                }
                if (canRemoveFromGroup) {
                    menuItems[menuItems.length - 1].options.push(
                        { onselect: 'core:remove-selection-from-group', label: RED._("menu.label.groupRemoveSelection") }
                    )
                }
                menuItems[menuItems.length - 1].options.push(
                    null,
                    { onselect: 'core:copy-group-style', label: RED._("keyboard.copyGroupStyle"), disabled: !hasGroup },
                    { onselect: 'core:paste-group-style', label: RED._("keyboard.pasteGroupStyle"), disabled: !hasGroup}
                )
            }
            if (canEdit && hasMultipleSelection) {
                menuItems.push({
                    label: RED._('menu.label.arrange'),
                    options: [
                        { label:RED._("menu.label.alignLeft"), onselect: "core:align-selection-to-left"},
                        { label:RED._("menu.label.alignCenter"), onselect: "core:align-selection-to-center"},
                        { label:RED._("menu.label.alignRight"), onselect: "core:align-selection-to-right"},
                        null,
                        { label:RED._("menu.label.alignTop"), onselect: "core:align-selection-to-top"},
                        { label:RED._("menu.label.alignMiddle"), onselect: "core:align-selection-to-middle"},
                        { label:RED._("menu.label.alignBottom"), onselect: "core:align-selection-to-bottom"},
                        null,
                        { label:RED._("menu.label.distributeHorizontally"), onselect: "core:distribute-selection-horizontally"},
                        { label:RED._("menu.label.distributeVertically"), onselect: "core:distribute-selection-vertically"}
                    ]
                })
            }


            menuItems.push(
                null,
                { onselect: 'core:undo', label: RED._("keyboard.undoChange"), disabled: RED.history.list().length === 0 },
                { onselect: 'core:redo', label: RED._("keyboard.redoChange"), disabled: RED.history.listRedo().length === 0 },
                null,
                { onselect: 'core:cut-selection-to-internal-clipboard', label: RED._("keyboard.cutNode"), disabled: !canEdit || !hasSelection },
                { onselect: 'core:copy-selection-to-internal-clipboard', label: RED._("keyboard.copyNode"), disabled: !hasSelection },
                { onselect: 'core:paste-from-internal-clipboard', label: RED._("keyboard.pasteNode"), disabled: !canEdit || !RED.view.clipboard() },
                { onselect: 'core:delete-selection', label: RED._('keyboard.deleteSelected'), disabled: !canEdit || !canDelete },
                { onselect: 'core:delete-selection-and-reconnect', label: RED._('keyboard.deleteReconnect'), disabled: !canEdit || !canDelete },
            )
            if (RED.settings.theme("menu.menu-item-export-library", true)) {
                menuItems.push(
                    { onselect: 'core:show-export-dialog', label: RED._("menu.label.export") }
                )
            }
            menuItems.push(
                { onselect: 'core:select-all-nodes', label: RED._("keyboard.selectAll") }
            )
        }

        var direction = "right";
        var MENU_WIDTH = 500; // can not use menu width here
        if ((options.x -$(document).scrollLeft()) >
            ($(window).width() -MENU_WIDTH)) {
            direction = "left";
        }

        menu = RED.menu.init({
            direction: direction,
            onpreselect: function() {
                disposeMenu()
            },
            onpostselect: function () {
                RED.view.focus()
            },
            options: menuItems
        });

        menu.attr("id", "red-ui-workspace-context-menu");
        menu.css({
            position: "absolute"
        })
        menu.appendTo("body");

        // TODO: prevent the menu from overflowing the window.

        var top = options.y
        var left = options.x

        if (top + menu.height() - $(document).scrollTop() > $(window).height()) {
            top -= (top + menu.height()) - $(window).height() + 22;
        }
        if (left + menu.width() - $(document).scrollLeft() > $(window).width()) {
            left -= (left + menu.width()) - $(window).width() + 18;
        }
        menu.css({
            top: top + "px",
            left: left + "px"
        })
        $(".red-ui-menu.red-ui-menu-dropdown").hide();
        $(document).on("mousedown.red-ui-workspace-context-menu", function (evt) {
            if (menu && menu[0].contains(evt.target)) {
                return
            }
            disposeMenu()
        });
        menu.show();
        // set focus to first item so that pressing escape key closes the menu
        $("#red-ui-workspace-context-menu :first(ul) > a").trigger("focus")

    }
    // Allow escape key hook and other editor events to close context menu
    RED.keyboard.add("red-ui-workspace-context-menu", "escape", function () { RED.contextMenu.hide() })
    RED.events.on("editor:open", function () { RED.contextMenu.hide() });
    RED.events.on("search:open", function () { RED.contextMenu.hide() });
    RED.events.on("type-search:open", function () { RED.contextMenu.hide() });
    RED.events.on("actionList:open", function () { RED.contextMenu.hide() });
    RED.events.on("view:selection-changed", function () { RED.contextMenu.hide() });
    return {
        show: show,
        hide: disposeMenu
    }
})()
