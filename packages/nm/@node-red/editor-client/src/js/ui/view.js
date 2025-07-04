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


 /* <div>#red-ui-workspace-chart
  *   \-  <svg> "outer"
  *       \- <g>
  *           \- <g>.red-ui-workspace-chart-event-layer "eventLayer"
  *                |- <rect>.red-ui-workspace-chart-background
  *                |- <g>.red-ui-workspace-chart-grid "gridLayer"
  *                |- <g> "groupLayer"
  *                |- <g> "groupSelectLayer"
  *                |- <g> "linkLayer"
  *                |- <g> "junctionLayer"
  *                |- <g> "dragGroupLayer"
  *                |- <g> "nodeLayer"
  */

RED.view = (function() {
    var space_width = 8000,
        space_height = 8000,
        lineCurveScale = 0.75,
        scaleFactor = 1,
        node_width = 100,
        node_height = 30,
        dblClickInterval = 650;

    var touchLongPressTimeout = 1000,
        startTouchDistance = 0,
        startTouchCenter = [],
        moveTouchCenter = [],
        touchStartTime = 0;

    var workspaceScrollPositions = {};

    var gridSize = 20;
    var snapGrid = false;

    var activeSpliceLink;
    var spliceActive = false;
    var spliceTimer;
    var groupHoverTimer;

    var activeFlowLocked = false;
    var activeSubflow = null;
    var activeNodes = [];
    var activeLinks = [];
    var activeJunctions = [];
    var activeFlowLinks = [];
    var activeLinkNodes = {};
    var activeHoverGroup = null;
    var groupAddActive = false;
    var groupAddParentGroup = null;
    var activeGroups = [];
    var dirtyGroups = {};

    var mousedown_link = null;
    var mousedown_node = null;
    var mousedown_group = null;
    var mousedown_port_type = null;
    var mousedown_port_index = 0;
    var mouseup_node = null;
    var mouse_offset = [0,0];
    var mouse_position = null;
    var mouse_mode = 0;
    var mousedown_group_handle = null;
    var lasso = null;
    var slicePath = null;
    var slicePathLast = null;
    var ghostNode = null;
    var showStatus = false;
    var lastClickNode = null;
    var dblClickPrimed = null;
    var clickTime = 0;
    var clickElapsed = 0;
    var scroll_position = [];
    var quickAddActive = false;
    var quickAddLink = null;
    var showAllLinkPorts = -1;
    var groupNodeSelectPrimed = false;
    var lastClickPosition = [];
    var selectNodesOptions;

    let flashingNodeId;

    var clipboard = "";
    let clipboardSource

    // Note: these are the permitted status colour aliases. The actual RGB values
    //       are set in the CSS - flow.scss/colors.scss
    const status_colours = {
        "red":    "#c00",
        "green":  "#5a8",
        "yellow": "#F9DF31",
        "blue":   "#53A3F3",
        "grey":   "#d3d3d3",
        "gray":   "#d3d3d3"
    }

    const PORT_TYPE_INPUT = 1;
    const PORT_TYPE_OUTPUT = 0;

    /**
     * The jQuery object for the workspace chart `#red-ui-workspace-chart` div element
     * @type {JQuery<HTMLElement>} #red-ui-workspace-chart HTML Element 
     */ 
    let chart;
    /**
     * The d3 object `#red-ui-workspace-chart` svg element
     * @type {d3.Selection<HTMLElement, Any, Any, Any>}
     */ 
    let outer;
    /** 
     * The d3 object `#red-ui-workspace-chart` svg element (specifically for events)
     * @type {d3.Selection<d3.BaseType, any, any, any>}
     */
    var eventLayer;

    /** @type {SVGGElement} */ let gridLayer;
    /** @type {SVGGElement} */ let linkLayer;
    /** @type {SVGGElement} */ let junctionLayer;
    /** @type {SVGGElement} */ let dragGroupLayer;
    /** @type {SVGGElement} */ let groupSelectLayer;
    /** @type {SVGGElement} */ let nodeLayer;
    /** @type {SVGGElement} */ let groupLayer;
    var drag_lines;

    const movingSet = (function() {
        var setIds = new Set();
        var set = [];
        const api = {
            add: function(node) {
                if (Array.isArray(node)) {
                    for (var i=0;i<node.length;i++) {
                        api.add(node[i]);
                    }
                } else {
                    if (!setIds.has(node.id)) {
                        set.push({n:node});
                        setIds.add(node.id);
                        var links = RED.nodes.getNodeLinks(node.id,PORT_TYPE_INPUT).concat(RED.nodes.getNodeLinks(node.id,PORT_TYPE_OUTPUT))
                        for (var i=0,l=links.length;i<l;i++) {
                            var link = links[i]
                            if (link.source === node && setIds.has(link.target.id) ||
                                link.target === node && setIds.has(link.source.id)) {
                                selectedLinks.add(link)
                            }
                        }
                    }
                }
            },
            remove: function(node, index) {
                if (setIds.has(node.id)) {
                    setIds.delete(node.id);
                    if (index !== undefined && set[index].n === node) {
                        set.splice(index,1);
                    } else {
                        for (var i=0;i<set.length;i++) {
                            if (set[i].n === node) {
                                set.splice(i,1)
                                break;
                            }
                        }
                    }
                    var links = RED.nodes.getNodeLinks(node.id,PORT_TYPE_INPUT).concat(RED.nodes.getNodeLinks(node.id,PORT_TYPE_OUTPUT))
                    for (var i=0,l=links.length;i<l;i++) {
                        selectedLinks.remove(links[i]);
                    }
                }
            },
            clear: function() {
                setIds.clear();
                set = [];
            },
            length: function() { return set.length},
            get: function(i) { return set[i] },
            forEach: function(func) { set.forEach(func) },
            nodes: function() { return set.map(function(n) { return n.n })},
            has: function(node) { return setIds.has(node.id) },
            /**
             * Make the specified node the first node of the moving set, if
             * it is already in the set.
             * @param {Node} node 
             */
            makePrimary: function (node) {
                const index = set.findIndex(n => n.n === node)
                if (index > -1) {
                    const removed = set.splice(index, 1)
                    set.unshift(...removed)
                }
            },
            find: function(func) { return set.find(func) },
            dump: function () {
                console.log('MovingSet Contents')
                api.forEach((n, i) => {
                    console.log(`${i+1}\t${n.n.id}\t${n.n.type}`)
                })
            }
        }
        return api;
    })();

    const selectedLinks = (function() {
        var links = new Set();
        const api = {
            add: function(link) {
                links.add(link);
                link.selected = true;
            },
            remove: function(link) {
                links.delete(link);
                link.selected = false;
            },
            clear: function() {
                links.forEach(function(link) { link.selected = false })
                links.clear();
            },
            length: function() {
                return links.size;
            },
            forEach: function(func) { links.forEach(func) },
            has: function(link) { return links.has(link) },
            toArray: function() { return Array.from(links) },
            clearUnselected: function () {
                api.forEach(l => {
                    if (!l.source.selected || !l.target.selected) {
                        api.remove(l)
                    }
                })
            }
        }
        return api
    })();

    const selectedGroups = (function() {
        let groups = new Set()
        const api = {
            add: function(g, includeNodes, addToMovingSet) {
                groups.add(g)
                if (!g.selected) {
                    g.selected = true;
                    g.dirty = true;
                }
                if (addToMovingSet !== false) {
                    movingSet.add(g);
                }
                if (includeNodes) {
                    var currentSet = new Set(movingSet.nodes());
                    var allNodes = RED.group.getNodes(g,true);
                    allNodes.forEach(function(n) {
                        if (!currentSet.has(n)) {
                            movingSet.add(n)
                        }
                        n.dirty = true;
                    })
                }
                selectedLinks.clearUnselected()
            },
            remove: function(g) {
                groups.delete(g)
                if (g.selected) {
                    g.selected = false;
                    g.dirty = true;
                }
                const allNodes = RED.group.getNodes(g,true);
                const nodeSet = new Set(allNodes);
                nodeSet.add(g);
                for (let i = movingSet.length()-1; i >= 0; i -= 1) {
                    const msn = movingSet.get(i);
                    if (nodeSet.has(msn.n) || msn.n === g) {
                        msn.n.selected = false;
                        msn.n.dirty = true;
                        movingSet.remove(msn.n,i)
                    }
                }
                selectedLinks.clearUnselected()
            },
            length: () => groups.size,
            forEach: (func) => { groups.forEach(func) },
            toArray: () => [...groups],
            clear: function () {
                groups.forEach(g => {
                    g.selected = false
                    g.dirty = true
                })
                groups.clear()
            }
        }
        return api
    })()

    const isMac = RED.utils.getBrowserInfo().os === 'mac'
    // 'Control' is the main modifier key for mouse actions. On Windows,
    // that is the standard Ctrl key. On Mac that is the Cmd key.
    function isControlPressed (event) {
        return (isMac && event.metaKey) || (!isMac && event.ctrlKey)
    }

    function init() {

        chart = $("#red-ui-workspace-chart");
        chart.on('contextmenu', function(evt) {
            if (RED.view.DEBUG) {
                console.warn("contextmenu", { mouse_mode, event: d3.event });
            }
            mouse_mode = RED.state.DEFAULT
            evt.preventDefault()
            evt.stopPropagation()
            RED.contextMenu.show({
                type: 'workspace',
                x: evt.clientX,
                y: evt.clientY
            })
            return false
        })
        outer = d3.select("#red-ui-workspace-chart")
            .append("svg:svg")
            .attr("width", space_width)
            .attr("height", space_height)
            .attr("pointer-events", "all")
            .style("cursor","crosshair")
            .style("touch-action","none")
            .on("mousedown", function() {
                focusView();
            })
            .on("contextmenu", function(){
                d3.event.preventDefault();
            });

        eventLayer = outer
            .append("svg:g")
            .on("dblclick.zoom", null)
            .append("svg:g")
            .attr('class','red-ui-workspace-chart-event-layer')
            .on("mousemove", canvasMouseMove)
            .on("mousedown", canvasMouseDown)
            .on("mouseup", canvasMouseUp)
            .on("mouseenter", function() {
                d3.select(document).on('mouseup.red-ui-workspace-tracker', null)
                if (lasso) {
                    if (d3.event.buttons !== 1) {
                        outer.classed('red-ui-workspace-lasso-active', false)
                        lasso.remove();
                        lasso = null;
                    }
                } else if (mouse_mode === RED.state.PANNING && d3.event.buttons !== 4) {
                    resetMouseVars();
                } else if (slicePath) {
                    if (d3.event.buttons !== 2) {
                        slicePath.remove();
                        slicePath = null;
                        resetMouseVars()
                    }
                }
            })
            .on("mouseleave", canvasMouseLeave)
            .on("touchend", function() {
                d3.event.preventDefault();
                clearTimeout(touchStartTime);
                touchStartTime = null;
                if  (RED.touch.radialMenu.active()) {
                    return;
                }
                canvasMouseUp.call(this);
            })
            .on("touchcancel", function() {
                if (RED.view.DEBUG) { console.warn("eventLayer.touchcancel", mouse_mode); }
                d3.event.preventDefault();
                canvasMouseUp.call(this);
            })
            .on("touchstart", function() {
                if (RED.view.DEBUG) { console.warn("eventLayer.touchstart", mouse_mode); }
                var touch0;
                if (d3.event.touches.length>1) {
                    clearTimeout(touchStartTime);
                    touchStartTime = null;
                    d3.event.preventDefault();
                    touch0 = d3.event.touches.item(0);
                    var touch1 = d3.event.touches.item(1);
                    var a = touch0["pageY"]-touch1["pageY"];
                    var b = touch0["pageX"]-touch1["pageX"];

                    var offset = chart.offset();
                    var scrollPos = [chart.scrollLeft(),chart.scrollTop()];
                    startTouchCenter = [
                        (touch1["pageX"]+(b/2)-offset.left+scrollPos[0])/scaleFactor,
                        (touch1["pageY"]+(a/2)-offset.top+scrollPos[1])/scaleFactor
                    ];
                    moveTouchCenter = [
                        touch1["pageX"]+(b/2),
                        touch1["pageY"]+(a/2)
                    ]
                    startTouchDistance = Math.sqrt((a*a)+(b*b));
                } else {
                    var obj = d3.select(document.body);
                    touch0 = d3.event.touches.item(0);
                    var pos = [touch0.pageX,touch0.pageY];
                    startTouchCenter = [touch0.pageX,touch0.pageY];
                    startTouchDistance = 0;
                    var point = d3.touches(this)[0];
                    touchStartTime = setTimeout(function() {
                        touchStartTime = null;
                        showTouchMenu(obj,pos);
                    },touchLongPressTimeout);
                }
                d3.event.preventDefault();
            })
            .on("touchmove", function(){
                    if  (RED.touch.radialMenu.active()) {
                        d3.event.preventDefault();
                        return;
                    }
                    if (RED.view.DEBUG) { console.warn("eventLayer.touchmove", mouse_mode, mousedown_node); }
                    var touch0;
                    if (d3.event.touches.length<2) {
                        if (touchStartTime) {
                            touch0 = d3.event.touches.item(0);
                            var dx = (touch0.pageX-startTouchCenter[0]);
                            var dy = (touch0.pageY-startTouchCenter[1]);
                            var d = Math.abs(dx*dx+dy*dy);
                            if (d > 64) {
                                clearTimeout(touchStartTime);
                                touchStartTime = null;
                                if (!mousedown_node && !mousedown_group) {
                                    mouse_mode = RED.state.PANNING;
                                    mouse_position = [touch0.pageX,touch0.pageY]
                                    scroll_position = [chart.scrollLeft(),chart.scrollTop()];
                                }

                            }
                        } else if (lasso) {
                            d3.event.preventDefault();
                        }
                        canvasMouseMove.call(this);
                    } else {
                        touch0 = d3.event.touches.item(0);
                        var touch1 = d3.event.touches.item(1);
                        var a = touch0["pageY"]-touch1["pageY"];
                        var b = touch0["pageX"]-touch1["pageX"];
                        var offset = chart.offset();
                        var scrollPos = [chart.scrollLeft(),chart.scrollTop()];
                        var moveTouchDistance = Math.sqrt((a*a)+(b*b));
                        var touchCenter = [
                            touch1["pageX"]+(b/2),
                            touch1["pageY"]+(a/2)
                        ];

                        if (!isNaN(moveTouchDistance)) {
                            oldScaleFactor = scaleFactor;
                            scaleFactor = Math.min(2,Math.max(0.3, scaleFactor + (Math.floor(((moveTouchDistance*100)-(startTouchDistance*100)))/10000)));

                            var deltaTouchCenter = [                             // Try to pan whilst zooming - not 100%
                                startTouchCenter[0]*(scaleFactor-oldScaleFactor),//-(touchCenter[0]-moveTouchCenter[0]),
                                startTouchCenter[1]*(scaleFactor-oldScaleFactor) //-(touchCenter[1]-moveTouchCenter[1])
                            ];

                            startTouchDistance = moveTouchDistance;
                            moveTouchCenter = touchCenter;

                            chart.scrollLeft(scrollPos[0]+deltaTouchCenter[0]);
                            chart.scrollTop(scrollPos[1]+deltaTouchCenter[1]);
                            redraw();
                        }
                    }
                    d3.event.preventDefault();
            });
            

        const handleAltToggle = (event) => {
            if (mouse_mode === RED.state.MOVING_ACTIVE && event.key === 'Alt' && groupAddParentGroup) {
                RED.nodes.group(groupAddParentGroup).dirty = true
                for (let n = 0; n<movingSet.length(); n++) {
                    const node = movingSet.get(n);
                    node.n._detachFromGroup = event.altKey
                }
                if (!event.altKey) {
                    if (groupHoverTimer) {
                        clearTimeout(groupHoverTimer)
                        groupHoverTimer = null
                    }
                    if (activeHoverGroup) {
                        activeHoverGroup.hovered = false
                        activeHoverGroup.dirty = true
                        activeHoverGroup = null
                    }
                }
                RED.view.redraw()
            }
        }
        document.addEventListener("keyup", handleAltToggle)
        document.addEventListener("keydown", handleAltToggle)

        // Workspace Background
        eventLayer.append("svg:rect")
            .attr("class","red-ui-workspace-chart-background")
            .attr("width", space_width)
            .attr("height", space_height);

        gridLayer = eventLayer.append("g").attr("class","red-ui-workspace-chart-grid");
        updateGrid();

        groupLayer = eventLayer.append("g");
        groupSelectLayer = eventLayer.append("g");
        linkLayer = eventLayer.append("g");
        dragGroupLayer = eventLayer.append("g");
        junctionLayer = eventLayer.append("g");
        nodeLayer = eventLayer.append("g");

        drag_lines = [];

        RED.events.on("workspace:change",function(event) {
            // Just in case the mouse left the workspace whilst doing an action,
            // put us back into default mode so the refresh works
            mouse_mode = 0
            if (event.old !== 0) {
                workspaceScrollPositions[event.old] = {
                    left:chart.scrollLeft(),
                    top:chart.scrollTop()
                };
            }
            var scrollStartLeft = chart.scrollLeft();
            var scrollStartTop = chart.scrollTop();

            activeSubflow = RED.nodes.subflow(event.workspace);

            if (activeSubflow) {
                activeFlowLocked = activeSubflow.locked
            } else {
                var activeWorkspace = RED.nodes.workspace(event.workspace)
                if (activeWorkspace) {
                    activeFlowLocked = activeWorkspace.locked
                } else {
                    activeFlowLocked = true
                }
            }

            RED.menu.setDisabled("menu-item-workspace-edit", activeFlowLocked || activeSubflow || event.workspace === 0);
            RED.menu.setDisabled("menu-item-workspace-delete",activeFlowLocked || event.workspace === 0 || RED.workspaces.count() == 1 || activeSubflow);

            if (workspaceScrollPositions[event.workspace]) {
                chart.scrollLeft(workspaceScrollPositions[event.workspace].left);
                chart.scrollTop(workspaceScrollPositions[event.workspace].top);
            } else {
                chart.scrollLeft(0);
                chart.scrollTop(0);
            }
            var scrollDeltaLeft = chart.scrollLeft() - scrollStartLeft;
            var scrollDeltaTop = chart.scrollTop() - scrollStartTop;
            if (mouse_position != null) {
                mouse_position[0] += scrollDeltaLeft;
                mouse_position[1] += scrollDeltaTop;
            }
            if (RED.workspaces.selection().length === 0) {
                clearSelection();
            }
            RED.nodes.eachNode(function(n) {
                n.dirty = true;
                n.dirtyStatus = true;
            });
            updateSelection();
            updateActiveNodes();
            redraw();
        });

        RED.events.on("flows:change", function(workspace) {
            if (workspace.id === RED.workspaces.active()) {
                activeFlowLocked = !!workspace.locked
                $("#red-ui-workspace").toggleClass("red-ui-workspace-disabled",!!workspace.disabled);
                $("#red-ui-workspace").toggleClass("red-ui-workspace-locked",!!workspace.locked);

            }
        })

        RED.statusBar.add({
            id: "view-zoom-controls",
            align: "right",
            element: $('<span class="button-group">'+
            '<button class="red-ui-footer-button" id="red-ui-view-zoom-out"><i class="fa fa-minus"></i></button>'+
            '<button class="red-ui-footer-button" id="red-ui-view-zoom-zero"><i class="fa fa-circle-o"></i></button>'+
            '<button class="red-ui-footer-button" id="red-ui-view-zoom-in"><i class="fa fa-plus"></i></button>'+
            '</span>')
        })

        $("#red-ui-view-zoom-out").on("click", zoomOut);
        RED.popover.tooltip($("#red-ui-view-zoom-out"),RED._('actions.zoom-out'),'core:zoom-out');
        $("#red-ui-view-zoom-zero").on("click", zoomZero);
        RED.popover.tooltip($("#red-ui-view-zoom-zero"),RED._('actions.zoom-reset'),'core:zoom-reset');
        $("#red-ui-view-zoom-in").on("click", zoomIn);
        RED.popover.tooltip($("#red-ui-view-zoom-in"),RED._('actions.zoom-in'),'core:zoom-in');
        chart.on("DOMMouseScroll mousewheel", function (evt) {
            if ( evt.altKey ) {
                evt.preventDefault();
                evt.stopPropagation();
                var move = -(evt.originalEvent.detail) || evt.originalEvent.wheelDelta;
                if (move <= 0) { zoomOut(); }
                else { zoomIn(); }
            }
        });

        //add search to status-toolbar
        RED.statusBar.add({
            id: "view-search-tools",
            align: "left",
            hidden: false,
            element: $('<span class="button-group">'+
                    '<button class="red-ui-footer-button" id="red-ui-view-searchtools-search"><i class="fa fa-search"></i></button>' +
                    '</span>' +
                    '<span class="button-group search-counter">' +
                    '<span class="red-ui-footer-button" id="red-ui-view-searchtools-counter">? of ?</span>' +
                    '</span>' +
                    '<span class="button-group">' +
                    '<button class="red-ui-footer-button" id="red-ui-view-searchtools-prev"><i class="fa fa-chevron-left"></i></button>' +
                    '<button class="red-ui-footer-button" id="red-ui-view-searchtools-next"><i class="fa fa-chevron-right"></i></button>' +
                    '</span>' +
                    '<span class="button-group">' +
                    '<button class="red-ui-footer-button" id="red-ui-view-searchtools-close"><i class="fa fa-close"></i></button>' +
                    '</span>')
        })
        $("#red-ui-view-searchtools-search").on("click", searchFlows);
        RED.popover.tooltip($("#red-ui-view-searchtools-search"),RED._('actions.search-flows'),'core:search');
        $("#red-ui-view-searchtools-prev").on("click", searchPrev);
        RED.popover.tooltip($("#red-ui-view-searchtools-prev"),RED._('actions.search-prev'),'core:search-previous');
        $("#red-ui-view-searchtools-next").on("click", searchNext);
        RED.popover.tooltip($("#red-ui-view-searchtools-next"),RED._('actions.search-next'),'core:search-next');
        RED.popover.tooltip($("#red-ui-view-searchtools-close"),RED._('common.label.close'));

        // Handle nodes dragged from the palette
        chart.droppable({
            accept:".red-ui-palette-node",
            drop: function( event, ui ) {
                if (activeFlowLocked) {
                    return
                }
                d3.event = event;
                var selected_tool = $(ui.draggable[0]).attr("data-palette-type");
                try {
                    var result = createNode(selected_tool);
                    if (!result) {
                        return;
                    }
                    var historyEvent = result.historyEvent;
                    var nn = RED.nodes.add(result.node);

                    var showLabel = RED.utils.getMessageProperty(RED.settings.get('editor'),"view.view-node-show-label");
                    if (showLabel !== undefined &&  (nn._def.hasOwnProperty("showLabel")?nn._def.showLabel:true) && !nn._def.defaults.hasOwnProperty("l")) {
                        nn.l = showLabel;
                    }

                    var helperOffset = d3.touches(ui.helper.get(0))[0]||d3.mouse(ui.helper.get(0));
                    var helperWidth = ui.helper.width();
                    var helperHeight = ui.helper.height();
                    var mousePos = d3.touches(this)[0]||d3.mouse(this);

                    try {
                        var isLink = (nn.type === "link in" || nn.type === "link out")
                        var hideLabel = nn.hasOwnProperty('l')?!nn.l : isLink;

                        var label = RED.utils.getNodeLabel(nn, nn.type);
                        var labelParts = getLabelParts(label, "red-ui-flow-node-label");
                        if (hideLabel) {
                            nn.w = node_height;
                            nn.h = Math.max(node_height,(nn.outputs || 0) * 15);
                        } else {
                            nn.w = Math.max(node_width,20*(Math.ceil((labelParts.width+50+(nn._def.inputs>0?7:0))/20)) );
                            nn.h = Math.max(6+24*labelParts.lines.length,(nn.outputs || 0) * 15, 30);
                        }
                    } catch(err) {
                    }

                    mousePos[1] += this.scrollTop + ((helperHeight/2)-helperOffset[1]);
                    mousePos[0] += this.scrollLeft + ((helperWidth/2)-helperOffset[0]);
                    mousePos[1] /= scaleFactor;
                    mousePos[0] /= scaleFactor;

                    nn.x = mousePos[0];
                    nn.y = mousePos[1];

                    var minX = nn.w/2 -5;
                    if (nn.x < minX) {
                        nn.x = minX;
                    }
                    var minY = nn.h/2 -5;
                    if (nn.y < minY) {
                        nn.y = minY;
                    }
                    var maxX = space_width -nn.w/2 +5;
                    if (nn.x > maxX) {
                        nn.x = maxX;
                    }
                    var maxY = space_height -nn.h +5;
                    if (nn.y > maxY) {
                        nn.y = maxY;
                    }

                    if (snapGrid) {
                        var gridOffset = RED.view.tools.calculateGridSnapOffsets(nn);
                        nn.x -= gridOffset.x;
                        nn.y -= gridOffset.y;
                    }

                    var linkToSplice = $(ui.helper).data("splice");
                    if (linkToSplice) {
                        spliceLink(linkToSplice, nn, historyEvent)
                    }

                    var group = $(ui.helper).data("group");
                    if (group) {
                        var oldX = group.x; 
                        var oldY = group.y; 
                        RED.group.addToGroup(group, nn);
                        var moveEvent = null;
                        if ((group.x !== oldX) ||
                            (group.y !== oldY)) {
                            moveEvent = {
                                t: "move",
                                nodes: [{n: group,
                                        ox: oldX, oy: oldY,
                                        dx: group.x -oldX,
                                        dy: group.y -oldY}],
                                dirty: true
                            };
                        }
                        historyEvent = {
                            t: 'multi',
                            events: [historyEvent],

                        };
                        if (moveEvent) {
                            historyEvent.events.push(moveEvent)
                        }
                        historyEvent.events.push({
                            t: "addToGroup",
                            group: group,
                            nodes: nn
                        })
                    }

                    RED.history.push(historyEvent);
                    RED.editor.validateNode(nn);
                    RED.nodes.dirty(true);
                    // auto select dropped node - so info shows (if visible)
                    clearSelection();
                    nn.selected = true;
                    movingSet.add(nn);
                    updateActiveNodes();
                    updateSelection();
                    redraw();

                    if (nn._def.autoedit) {
                        RED.editor.edit(nn);
                    }
                } catch (error) {
                    if (error.code != "NODE_RED") {
                        RED.notify(RED._("notification.error",{message:error.toString()}),"error");
                    } else {
                        RED.notify(RED._("notification.error",{message:error.message}),"error");
                    }
                }
            }
        });
        chart.on("focus", function() {
            $("#red-ui-workspace-tabs").addClass("red-ui-workspace-focussed");
        });
        chart.on("blur", function() {
            $("#red-ui-workspace-tabs").removeClass("red-ui-workspace-focussed");
        });

        RED.actions.add("core:copy-selection-to-internal-clipboard",copySelection);
        RED.actions.add("core:cut-selection-to-internal-clipboard",function(){copySelection(true);deleteSelection();});
        RED.actions.add("core:paste-from-internal-clipboard",function(){
            if (RED.workspaces.isLocked()) {
                return
            }
            importNodes(clipboard,{generateIds: clipboardSource === 'copy', generateDefaultNames: clipboardSource === 'copy'});
        });

        RED.actions.add("core:detach-selected-nodes", function() { detachSelectedNodes() })

        RED.events.on("view:selection-changed", function(selection) {
            var hasSelection = (selection.nodes && selection.nodes.length > 0);
            var hasMultipleSelection = hasSelection && selection.nodes.length > 1;
            var hasLinkSelected = selection.links && selection.links.length > 0;
            var canEdit = !activeFlowLocked && hasSelection
            var canEditMultiple = !activeFlowLocked && hasMultipleSelection
            RED.menu.setDisabled("menu-item-edit-cut", !canEdit);
            RED.menu.setDisabled("menu-item-edit-copy", !hasSelection);
            RED.menu.setDisabled("menu-item-edit-select-connected", !hasSelection);
            RED.menu.setDisabled("menu-item-view-tools-move-to-back", !canEdit);
            RED.menu.setDisabled("menu-item-view-tools-move-to-front", !canEdit);
            RED.menu.setDisabled("menu-item-view-tools-move-backwards", !canEdit);
            RED.menu.setDisabled("menu-item-view-tools-move-forwards", !canEdit);

            RED.menu.setDisabled("menu-item-view-tools-align-left", !canEditMultiple);
            RED.menu.setDisabled("menu-item-view-tools-align-center", !canEditMultiple);
            RED.menu.setDisabled("menu-item-view-tools-align-right", !canEditMultiple);
            RED.menu.setDisabled("menu-item-view-tools-align-top", !canEditMultiple);
            RED.menu.setDisabled("menu-item-view-tools-align-middle", !canEditMultiple);
            RED.menu.setDisabled("menu-item-view-tools-align-bottom", !canEditMultiple);
            RED.menu.setDisabled("menu-item-view-tools-distribute-horizontally", !canEditMultiple);
            RED.menu.setDisabled("menu-item-view-tools-distribute-veritcally", !canEditMultiple);

            RED.menu.setDisabled("menu-item-edit-split-wire-with-links", activeFlowLocked || !hasLinkSelected);
        })

        RED.actions.add("core:delete-selection",deleteSelection);
        RED.actions.add("core:delete-selection-and-reconnect",function() { deleteSelection(true) });
        RED.actions.add("core:edit-selected-node",editSelection);
        RED.actions.add("core:go-to-selection",function() {
            if (movingSet.length() > 0) {
                var node = movingSet.get(0).n;
                if (/^subflow:/.test(node.type)) {
                    RED.workspaces.show(node.type.substring(8))
                } else if (node.type === 'group') {
                    // enterActiveGroup(node);
                    redraw();
                }
            }
        });
        RED.actions.add("core:undo",RED.history.pop);
        RED.actions.add("core:redo",RED.history.redo);
        RED.actions.add("core:select-all-nodes",selectAll);
        RED.actions.add("core:select-none", selectNone);
        RED.actions.add("core:zoom-in",zoomIn);
        RED.actions.add("core:zoom-out",zoomOut);
        RED.actions.add("core:zoom-reset",zoomZero);
        RED.actions.add("core:enable-selected-nodes", function() { setSelectedNodeState(false)});
        RED.actions.add("core:disable-selected-nodes", function() { setSelectedNodeState(true)});

        RED.actions.add("core:toggle-show-grid",function(state) {
            if (state === undefined) {
                RED.userSettings.toggle("view-show-grid");
            } else {
                toggleShowGrid(state);
            }
        });
        RED.actions.add("core:toggle-snap-grid",function(state) {
            if (state === undefined) {
                RED.userSettings.toggle("view-snap-grid");
            } else {
                toggleSnapGrid(state);
            }
        });
        RED.actions.add("core:toggle-status",function(state) {
            if (state === undefined) {
                RED.userSettings.toggle("view-node-status");
            } else {
                toggleStatus(state);
            }
        });

        RED.view.annotations.init();
        RED.view.navigator.init();
        RED.view.tools.init();


        RED.view.annotations.register("red-ui-flow-node-changed",{
            type: "badge",
            class: "red-ui-flow-node-changed",
            element: function() {
                var changeBadge = document.createElementNS("http://www.w3.org/2000/svg","circle");
                changeBadge.setAttribute("cx",5);
                changeBadge.setAttribute("cy",5);
                changeBadge.setAttribute("r",5);
                return changeBadge;
            },
            show: function(n) { return n.changed||n.moved }
        })

        RED.view.annotations.register("red-ui-flow-node-error",{
            type: "badge",
            class: "red-ui-flow-node-error",
            element: function(d) {
                var errorBadge = document.createElementNS("http://www.w3.org/2000/svg","path");
                errorBadge.setAttribute("d","M 0,9 l 10,0 -5,-8 z");
                return errorBadge
            },
            tooltip: function(d) {
                if (d.validationErrors && d.validationErrors.length > 0) {
                    return RED._("editor.errors.invalidProperties")+"\n  - "+d.validationErrors.join("\n  - ")
                }
            },
            show: function(n) { return !n.valid }
        })

        if (RED.settings.get("editor.view.view-store-zoom")) {
            var  userZoomLevel = parseFloat(RED.settings.getLocal('zoom-level'))
            if (!isNaN(userZoomLevel)) {
                scaleFactor = userZoomLevel
            }
        }

        var onScrollTimer = null;
        function storeScrollPosition() {
            workspaceScrollPositions[RED.workspaces.active()] = {
                left:chart.scrollLeft(),
                top:chart.scrollTop()
            };
            RED.settings.setLocal('scroll-positions', JSON.stringify(workspaceScrollPositions) )
        }
        chart.on("scroll", function() {
            if (RED.settings.get("editor.view.view-store-position")) {
                if (onScrollTimer) {
                    clearTimeout(onScrollTimer)
                }
                onScrollTimer = setTimeout(storeScrollPosition, 200);
            }
        })

        if (RED.settings.get("editor.view.view-store-position")) {
            var scrollPositions = RED.settings.getLocal('scroll-positions')
            if (scrollPositions) {
                try {
                    workspaceScrollPositions = JSON.parse(scrollPositions)
                } catch(err) {
                }
            }
        }
    }



    function updateGrid() {
        var gridTicks = [];
        for (var i=0;i<space_width;i+=+gridSize) {
            gridTicks.push(i);
        }
        gridLayer.selectAll("line.red-ui-workspace-chart-grid-h").remove();
        gridLayer.selectAll("line.red-ui-workspace-chart-grid-h").data(gridTicks).enter()
            .append("line")
            .attr(
                {
                    "class":"red-ui-workspace-chart-grid-h",
                    "x1" : 0,
                    "x2" : space_width,
                    "y1" : function(d){ return d;},
                    "y2" : function(d){ return d;}
                });
        gridLayer.selectAll("line.red-ui-workspace-chart-grid-v").remove();
        gridLayer.selectAll("line.red-ui-workspace-chart-grid-v").data(gridTicks).enter()
            .append("line")
            .attr(
                {
                    "class":"red-ui-workspace-chart-grid-v",
                    "y1" : 0,
                    "y2" : space_width,
                    "x1" : function(d){ return d;},
                    "x2" : function(d){ return d;}
                });
    }

    function showDragLines(nodes) {
        showAllLinkPorts = -1;
        for (var i=0;i<nodes.length;i++) {
            var node = nodes[i];
            node.el = dragGroupLayer.append("svg:path").attr("class", "red-ui-flow-drag-line");
            if ((node.node.type === "link out" && node.portType === PORT_TYPE_OUTPUT) ||
                (node.node.type === "link in" && node.portType === PORT_TYPE_INPUT)) {
                node.el.attr("class","red-ui-flow-link-link red-ui-flow-drag-line");
                node.virtualLink = true;
                showAllLinkPorts = (node.portType === PORT_TYPE_OUTPUT)?PORT_TYPE_INPUT:PORT_TYPE_OUTPUT;
            }
            drag_lines.push(node);
        }
        if (showAllLinkPorts !== -1) {
            activeNodes.forEach(function(n) {
                if (n.type === "link in" || n.type === "link out") {
                    n.dirty = true;
                }
            })
        }
    }
    function hideDragLines() {
        if (showAllLinkPorts !== -1) {
            activeNodes.forEach(function(n) {
                if (n.type === "link in" || n.type === "link out") {
                    n.dirty = true;
                }
            })
        }
        showAllLinkPorts = -1;
        while(drag_lines.length) {
            var line = drag_lines.pop();
            if (line.el) {
                line.el.remove();
            }
        }
    }

    function updateActiveNodes() {
        var activeWorkspace = RED.workspaces.active();
        if (activeWorkspace !== 0) {
            activeNodes = RED.nodes.filterNodes({z:activeWorkspace});
            activeNodes.forEach(function(n,i) {
                n._index = i;
            })
            activeLinks = RED.nodes.filterLinks({
                source:{z:activeWorkspace},
                target:{z:activeWorkspace}
            });
            activeJunctions = RED.nodes.junctions(activeWorkspace) || [];
            activeGroups = RED.nodes.groups(activeWorkspace)||[];
            if (activeGroups.length) {
                const groupTree = {}
                const rootGroups = []
                activeGroups.forEach(function(g, i) {
                    groupTree[g.id] = g
                    g._index = i;
                    g._childGroups = []
                    if (!g.g) {
                        rootGroups.push(g)
                    }
                });
                activeGroups.forEach(function(g) {
                    if (g.g) {
                        groupTree[g.g]._childGroups.push(g)
                        g._parentGroup = groupTree[g.g]
                    }
                })
                let ii = 0
                // Depth-first walk of the groups
                const processGroup = g => {
                    g._order = ii++
                    g._childGroups.forEach(processGroup)
                }
                rootGroups.forEach(processGroup)
            }
        } else {
            activeNodes = [];
            activeLinks = [];
            activeJunctions = [];
            activeGroups = [];
        }

        activeGroups.sort(function(a,b) {
            return a._order - b._order
        });

        var group = groupLayer.selectAll(".red-ui-flow-group").data(activeGroups,function(d) { return d.id });
        group.sort(function(a,b) {
            return a._order - b._order
        })
    }

    function generateLinkPath(origX,origY, destX, destY, sc, hasStatus = false) {
        var dy = destY-origY;
        var dx = destX-origX;
        var delta = Math.sqrt(dy*dy+dx*dx);
        var scale = lineCurveScale;
        var scaleY = 0;
        if (dx*sc > 0) {
            if (delta < node_width) {
                scale = 0.75-0.75*((node_width-delta)/node_width);
                // scale += 2*(Math.min(5*node_width,Math.abs(dx))/(5*node_width));
                // if (Math.abs(dy) < 3*node_height) {
                //     scaleY = ((dy>0)?0.5:-0.5)*(((3*node_height)-Math.abs(dy))/(3*node_height))*(Math.min(node_width,Math.abs(dx))/(node_width)) ;
                // }
            }
        } else {
            scale = 0.4-0.2*(Math.max(0,(node_width-Math.min(Math.abs(dx),Math.abs(dy)))/node_width));
        }
        function genCP(cp) {
            return ` M ${cp[0]-5} ${cp[1]} h 10 M ${cp[0]} ${cp[1]-5} v 10 `
        }
        if (dx*sc > 0) {
            let cp = [
                [(origX+sc*(node_width*scale)), (origY+scaleY*node_height)],
                [(destX-sc*(scale)*node_width), (destY-scaleY*node_height)]
            ]
            return `M ${origX} ${origY} C ${cp[0][0]} ${cp[0][1]} ${cp[1][0]} ${cp[1][1]} ${destX} ${destY}`
                //    + ` ${genCP(cp[0])} ${genCP(cp[1])}`
        } else {
            let topX, topY, bottomX, bottomY
            let cp
            let midX = Math.floor(destX-dx/2);
            let midY = Math.floor(destY-dy/2);          
            if (Math.abs(dy) < 10) {
                bottomY = Math.max(origY, destY) + (hasStatus?35:25)
                let startCurveHeight = bottomY - origY
                let endCurveHeight = bottomY - destY
                cp = [
                    [ origX + sc*15 , origY ],
                    [ origX + sc*25 , origY + 5 ],
                    [ origX + sc*25 , origY + startCurveHeight/2 ],

                    [ origX + sc*25 , origY + startCurveHeight - 5 ],
                    [ origX + sc*15 , origY + startCurveHeight ],
                    [ origX , origY + startCurveHeight ],

                    [ destX - sc*15, origY + startCurveHeight ],
                    [ destX - sc*25, origY + startCurveHeight - 5 ],
                    [ destX - sc*25, destY + endCurveHeight/2 ],

                    [ destX - sc*25, destY + 5 ],
                    [ destX - sc*15, destY ],
                    [ destX, destY ],
                ]

                return "M "+origX+" "+origY+
                    " C "+
                    cp[0][0]+" "+cp[0][1]+" "+
                    cp[1][0]+" "+cp[1][1]+" "+
                    cp[2][0]+" "+cp[2][1]+" "+
                    " C " +
                    cp[3][0]+" "+cp[3][1]+" "+
                    cp[4][0]+" "+cp[4][1]+" "+
                    cp[5][0]+" "+cp[5][1]+" "+
                    " h "+dx+
                    " C "+
                    cp[6][0]+" "+cp[6][1]+" "+
                    cp[7][0]+" "+cp[7][1]+" "+
                    cp[8][0]+" "+cp[8][1]+" "+
                    " C " +
                    cp[9][0]+" "+cp[9][1]+" "+
                    cp[10][0]+" "+cp[10][1]+" "+
                    cp[11][0]+" "+cp[11][1]+" "
                    // +genCP(cp[0])+genCP(cp[1])+genCP(cp[2])+genCP(cp[3])+genCP(cp[4])
                    // +genCP(cp[5])+genCP(cp[6])+genCP(cp[7])+genCP(cp[8])+genCP(cp[9])+genCP(cp[10])
            } else {
                var cp_height = node_height/2;
                var y1 = (destY + midY)/2
                topX = origX + sc*node_width*scale;
                topY = dy>0?Math.min(y1 - dy/2 , origY+cp_height):Math.max(y1 - dy/2 , origY-cp_height);
                bottomX = destX - sc*node_width*scale;
                bottomY = dy>0?Math.max(y1, destY-cp_height):Math.min(y1, destY+cp_height);
                var x1 = (origX+topX)/2;
                var scy = dy>0?1:-1;
                cp = [
                    // Orig -> Top
                    [x1,origY],
                    [topX,dy>0?Math.max(origY, topY-cp_height):Math.min(origY, topY+cp_height)],
                    // Top -> Mid
                    // [Mirror previous cp]
                    [x1,dy>0?Math.min(midY, topY+cp_height):Math.max(midY, topY-cp_height)],
                    // Mid -> Bottom
                    // [Mirror previous cp]
                    [bottomX,dy>0?Math.max(midY, bottomY-cp_height):Math.min(midY, bottomY+cp_height)],
                    // Bottom -> Dest
                    // [Mirror previous cp]
                    [(destX+bottomX)/2,destY]
                ];
                if (cp[2][1] === topY+scy*cp_height) {
                    if (Math.abs(dy) < cp_height*10) {
                        cp[1][1] = topY-scy*cp_height/2;
                        cp[3][1] = bottomY-scy*cp_height/2;
                    }
                    cp[2][0] = topX;
                }
                return "M "+origX+" "+origY+
                    " C "+
                    cp[0][0]+" "+cp[0][1]+" "+
                    cp[1][0]+" "+cp[1][1]+" "+
                    topX+" "+topY+
                    " S "+
                    cp[2][0]+" "+cp[2][1]+" "+
                    midX+" "+midY+
                " S "+
                    cp[3][0]+" "+cp[3][1]+" "+
                    bottomX+" "+bottomY+
                    " S "+
                        cp[4][0]+" "+cp[4][1]+" "+
                        destX+" "+destY

                // +genCP(cp[0])+genCP(cp[1])+genCP(cp[2])+genCP(cp[3])+genCP(cp[4])
            }
        }
    }

    function canvasMouseDown() {
        if (RED.view.DEBUG) {
            console.warn("canvasMouseDown", { mouse_mode, point: d3.mouse(this), event: d3.event });
        }
        RED.contextMenu.hide();
        if (mouse_mode === RED.state.SELECTING_NODE) {
            d3.event.stopPropagation();
            return;
        }

        if (d3.event.button === 1) {
            // Middle Click pan
            d3.event.preventDefault();
            mouse_mode = RED.state.PANNING;
            mouse_position = [d3.event.pageX,d3.event.pageY]
            scroll_position = [chart.scrollLeft(),chart.scrollTop()];
            return;
        }
        if (d3.event.button === 2) {
            return
        }
        if (!mousedown_node && !mousedown_link && !mousedown_group && !d3.event.shiftKey) {
            selectedLinks.clear();
            updateSelection();
        }
        if (mouse_mode === 0 && lasso) {
            outer.classed('red-ui-workspace-lasso-active', false)
            lasso.remove();
            lasso = null;
        }
        if (d3.event.touches || d3.event.button === 0) {
            if (
                (mouse_mode === 0 && isControlPressed(d3.event) && !(d3.event.altKey || d3.event.shiftKey)) ||
                mouse_mode === RED.state.QUICK_JOINING
            ) {
                // Trigger quick add dialog
                d3.event.stopPropagation();
                clearSelection();
                const point = d3.mouse(this);
                var clickedGroup = getGroupAt(point[0], point[1]);
                if (drag_lines.length > 0) {
                    clickedGroup = clickedGroup || RED.nodes.group(drag_lines[0].node.g)
                }
                showQuickAddDialog({ position: point, group: clickedGroup });
            } else if (mouse_mode === 0 && !isControlPressed(d3.event)) {
                // CTRL not being held
                if (!d3.event.altKey) {
                    // ALT not held (shift is allowed) Trigger lasso
                    if (!touchStartTime) {
                        const point = d3.mouse(this);
                        lasso = eventLayer.append("rect")
                            .attr("ox", point[0])
                            .attr("oy", point[1])
                            .attr("rx", 1)
                            .attr("ry", 1)
                            .attr("x", point[0])
                            .attr("y", point[1])
                            .attr("width", 0)
                            .attr("height", 0)
                            .attr("class", "nr-ui-view-lasso");
                        d3.event.preventDefault();
                        outer.classed('red-ui-workspace-lasso-active', true)
                    }
                } else if (d3.event.altKey && !activeFlowLocked) {
                    //Alt [+shift] held - Begin slicing
                    clearSelection();
                    mouse_mode = (d3.event.shiftKey) ? RED.state.SLICING_JUNCTION : RED.state.SLICING;
                    const point = d3.mouse(this);
                    slicePath = eventLayer.append("path").attr("class", "nr-ui-view-slice").attr("d", `M${point[0]} ${point[1]}`)
                    slicePathLast = point;
                    RED.view.redraw();
                }
            }
        }
    }

    function showQuickAddDialog(options) {
        if (activeFlowLocked) {
            return
        }
        options = options || {};
        var point = options.position || lastClickPosition;
        var linkToSplice = options.splice;
        var spliceMultipleLinks = options.spliceMultiple
        var targetGroup = options.group;
        var touchTrigger = options.touchTrigger;

        // `point` is the place in the workspace the mouse has clicked.
        //  This takes into account scrolling and scaling of the workspace.
        var ox = point[0];
        var oy = point[1];

        // Need to map that to browser location to position the pop-up
        const offset = $("#red-ui-workspace-chart").offset()
        var clientX = (ox * scaleFactor) + offset.left - $("#red-ui-workspace-chart").scrollLeft()
        var clientY = (oy * scaleFactor) + offset.top - $("#red-ui-workspace-chart").scrollTop()

        if (RED.settings.get("editor").view['view-snap-grid']) {
            // eventLayer.append("circle").attr("cx",point[0]).attr("cy",point[1]).attr("r","2").attr('fill','red')
            point[0] = Math.round(point[0] / gridSize) * gridSize;
            point[1] = Math.round(point[1] / gridSize) * gridSize;
            // eventLayer.append("circle").attr("cx",point[0]).attr("cy",point[1]).attr("r","2").attr('fill','blue')
        }

        var mainPos = $("#red-ui-main-container").position();
        if (mouse_mode !== RED.state.QUICK_JOINING) {
            mouse_mode = RED.state.QUICK_JOINING;
            $(window).on('keyup',disableQuickJoinEventHandler);
        }
        quickAddActive = true;

        if (ghostNode) {
            ghostNode.remove();
        }
        ghostNode = eventLayer.append("g").attr('transform','translate('+(point[0] - node_width/2)+','+(point[1] - node_height/2)+')');
        ghostNode.append("rect")
            .attr("class","red-ui-flow-node-placeholder")
            .attr("rx", 5)
            .attr("ry", 5)
            .attr("width",node_width)
            .attr("height",node_height)
            .attr("fill","none")
        // var ghostLink = ghostNode.append("svg:path")
        //     .attr("class","red-ui-flow-link-link")
        //     .attr("d","M 0 "+(node_height/2)+" H "+(gridSize * -2))
        //     .attr("opacity",0);

        var filter;
        if (drag_lines.length > 0) {
            if (drag_lines[0].virtualLink) {
                filter = {type:drag_lines[0].node.type === 'link in'?'link out':'link in'}
            } else if (drag_lines[0].portType === PORT_TYPE_OUTPUT) {
                filter = {input:true}
            } else {
                filter = {output:true}
            }

            quickAddLink = {
                node: drag_lines[0].node,
                port: drag_lines[0].port,
                portType: drag_lines[0].portType,
            }
            if (drag_lines[0].virtualLink) {
                quickAddLink.virtualLink = true;
            }
            hideDragLines();
        }
        if (linkToSplice || spliceMultipleLinks) {
            filter = {
                input:true,
                output:true,
                spliceMultiple: spliceMultipleLinks
            }
        }

        var rebuildQuickAddLink = function() {
            if (!quickAddLink) {
                return;
            }
            if (!quickAddLink.el) {
                quickAddLink.el = dragGroupLayer.append("svg:path").attr("class", "red-ui-flow-drag-line");
            }
            var numOutputs = (quickAddLink.portType === PORT_TYPE_OUTPUT)?(quickAddLink.node.outputs || 1):1;
            var sourcePort = quickAddLink.port;
            var portY = -((numOutputs-1)/2)*13 +13*sourcePort;
            var sc = (quickAddLink.portType === PORT_TYPE_OUTPUT)?1:-1;
            quickAddLink.el.attr("d",generateLinkPath(quickAddLink.node.x+sc*quickAddLink.node.w/2,quickAddLink.node.y+portY,point[0]-sc*node_width/2,point[1],sc));
        }
        if (quickAddLink) {
            rebuildQuickAddLink();
        }


        var lastAddedX;
        var lastAddedWidth;

        RED.typeSearch.show({
            x:clientX-mainPos.left-node_width/2 - (ox-point[0]),
            y:clientY-mainPos.top+ node_height/2 + 5 - (oy-point[1]),
            disableFocus: touchTrigger,
            filter: filter,
            move: function(dx,dy) {
                if (ghostNode) {
                    var pos = d3.transform(ghostNode.attr("transform")).translate;
                    ghostNode.attr("transform","translate("+(pos[0]+dx)+","+(pos[1]+dy)+")")
                    point[0] += dx;
                    point[1] += dy;
                    rebuildQuickAddLink();
                }
            },
            cancel: function() {
                if (quickAddLink) {
                    if (quickAddLink.el) {
                        quickAddLink.el.remove();
                    }
                    quickAddLink = null;
                }
                quickAddActive = false;
                if (ghostNode) {
                    ghostNode.remove();
                }
                resetMouseVars();
                updateSelection();
                hideDragLines();
                redraw();
            },
            add: function(type, keepAdding) {
                if (touchTrigger) {
                    keepAdding = false;
                    resetMouseVars();
                }

                var nn;
                var historyEvent;
                if (/^_action_:/.test(type)) {
                    const actionName = type.substring(9)
                    quickAddActive = false;
                    ghostNode.remove();
                    RED.actions.invoke(actionName)
                    return
                } else if (type === 'junction') {
                    nn = {
                        _def: {defaults:{}},
                        type: 'junction',
                        z: RED.workspaces.active(),
                        id: RED.nodes.id(),
                        x: 0,
                        y: 0,
                        w: 0, h: 0,
                        outputs: 1,
                        inputs: 1,
                        dirty: true,
                        moved: true
                    }
                    historyEvent = {
                        t:'add',
                        dirty: RED.nodes.dirty(),
                        junctions:[nn]
                    }
                } else {
                    var result = createNode(type);
                    if (!result) {
                        return;
                    }
                    nn = result.node;
                    historyEvent = result.historyEvent;
                }
                if (keepAdding) {
                    mouse_mode = RED.state.QUICK_JOINING;
                }

                nn.x = point[0];
                nn.y = point[1];
                var showLabel = RED.utils.getMessageProperty(RED.settings.get('editor'),"view.view-node-show-label");
                if (showLabel !== undefined && (nn._def.hasOwnProperty("showLabel")?nn._def.showLabel:true) && !nn._def.defaults.hasOwnProperty("l")) {
                    nn.l = showLabel;
                }
                if (nn.type === 'junction') {
                    nn = RED.nodes.addJunction(nn);
                } else {
                    nn = RED.nodes.add(nn);
                }
                if (quickAddLink) {
                    var drag_line = quickAddLink;
                    var src = null,dst,src_port;
                    if (drag_line.portType === PORT_TYPE_OUTPUT && (nn.inputs > 0 || drag_line.virtualLink) ) {
                        src = drag_line.node;
                        src_port = drag_line.port;
                        dst = nn;
                    } else if (drag_line.portType === PORT_TYPE_INPUT && (nn.outputs > 0 || drag_line.virtualLink)) {
                        src = nn;
                        dst = drag_line.node;
                        src_port = 0;
                    }

                    if (src !== null) {
                        // Joining link nodes via virual wires. Need to update
                        // the src and dst links property
                        if (drag_line.virtualLink) {
                            historyEvent = {
                                t:'multi',
                                events: [historyEvent]
                            }
                            var oldSrcLinks = $.extend(true,{},{v:src.links}).v
                            var oldDstLinks = $.extend(true,{},{v:dst.links}).v
                            src.links.push(dst.id);
                            dst.links.push(src.id);
                            src.dirty = true;
                            dst.dirty = true;

                            historyEvent.events.push({
                                t:'edit',
                                node: src,
                                dirty: RED.nodes.dirty(),
                                changed: src.changed,
                                changes: {
                                    links:oldSrcLinks
                                }
                            });
                            historyEvent.events.push({
                                t:'edit',
                                node: dst,
                                dirty: RED.nodes.dirty(),
                                changed: dst.changed,
                                changes: {
                                    links:oldDstLinks
                                }
                            });
                            src.changed = true;
                            dst.changed = true;
                        } else {
                            var link = {source: src, sourcePort:src_port, target: dst};
                            RED.nodes.addLink(link);
                            historyEvent.links = [link];
                        }
                        if (!keepAdding) {
                            quickAddLink.el.remove();
                            quickAddLink = null;
                            if (mouse_mode === RED.state.QUICK_JOINING) {
                                if (drag_line.portType === PORT_TYPE_OUTPUT && nn.outputs > 0) {
                                    showDragLines([{node:nn,port:0,portType:PORT_TYPE_OUTPUT}]);
                                } else if (!quickAddLink && drag_line.portType === PORT_TYPE_INPUT && nn.inputs > 0) {
                                    showDragLines([{node:nn,port:0,portType:PORT_TYPE_INPUT}]);
                                } else {
                                    resetMouseVars();
                                }
                            }
                        } else {
                            quickAddLink.node = nn;
                            quickAddLink.port = 0;
                        }
                    } else {
                        hideDragLines();
                        resetMouseVars();
                    }
                } else {
                    if (!keepAdding) {
                        if (mouse_mode === RED.state.QUICK_JOINING) {
                            if (nn.outputs > 0) {
                                showDragLines([{node:nn,port:0,portType:PORT_TYPE_OUTPUT}]);
                            } else if (nn.inputs > 0) {
                                showDragLines([{node:nn,port:0,portType:PORT_TYPE_INPUT}]);
                            } else {
                                resetMouseVars();
                            }
                        }
                    } else {
                        if (nn.outputs > 0) {
                            quickAddLink = {
                                node: nn,
                                port: 0,
                                portType: PORT_TYPE_OUTPUT
                            }
                        } else if (nn.inputs > 0) {
                            quickAddLink = {
                                node: nn,
                                port: 0,
                                portType: PORT_TYPE_INPUT
                            }
                        } else {
                            resetMouseVars();
                        }
                    }
                }

                RED.editor.validateNode(nn);

                if (targetGroup) {
                    var oldX = targetGroup.x; 
                    var oldY = targetGroup.y; 
                    RED.group.addToGroup(targetGroup, nn);
                    var moveEvent = null;
                    if ((targetGroup.x !== oldX) ||
                        (targetGroup.y !== oldY)) {
                        moveEvent = {
                            t: "move",
                            nodes: [{n: targetGroup,
                                     ox: oldX, oy: oldY,
                                     dx: targetGroup.x -oldX,
                                     dy: targetGroup.y -oldY}],
                            dirty: true
                        };
                    }
                    if (historyEvent.t !== "multi") {
                        historyEvent = {
                            t:'multi',
                            events: [historyEvent]
                        };
                    }
                    historyEvent.events.push({
                        t: "addToGroup",
                        group: targetGroup,
                        nodes: nn
                    });
                    if (moveEvent) {
                        historyEvent.events.push(moveEvent);
                    }
                }

                if (linkToSplice) {
                    resetMouseVars();
                    spliceLink(linkToSplice, nn, historyEvent)
                }
                RED.history.push(historyEvent);
                RED.nodes.dirty(true);
                // auto select dropped node - so info shows (if visible)
                clearSelection();
                nn.selected = true;
                movingSet.add(nn);
                updateActiveNodes();
                updateSelection();
                redraw();
                // At this point the newly added node will have a real width,
                // so check if the position needs nudging
                if (lastAddedX !== undefined) {
                    var lastNodeRHEdge = lastAddedX + lastAddedWidth/2;
                    var thisNodeLHEdge = nn.x - nn.w/2;
                    var gap = thisNodeLHEdge - lastNodeRHEdge;
                    if (gap != gridSize *2) {
                        nn.x = nn.x + gridSize * 2 - gap;
                        nn.dirty = true;
                        nn.x = Math.ceil(nn.x / gridSize) * gridSize;
                        redraw();
                    }
                }
                if (keepAdding) {
                    if (lastAddedX === undefined) {
                        // ghostLink.attr("opacity",1);
                        setTimeout(function() {
                            RED.typeSearch.refresh({filter:{input:true}});
                        },100);
                    }

                    lastAddedX = nn.x;
                    lastAddedWidth = nn.w;

                    point[0] = nn.x + nn.w/2 + node_width/2 + gridSize * 2;
                    ghostNode.attr('transform','translate('+(point[0] - node_width/2)+','+(point[1] - node_height/2)+')');
                    rebuildQuickAddLink();
                } else {
                    quickAddActive = false;
                    ghostNode.remove();
                }
            }
        });

        updateActiveNodes();
        updateSelection();
        redraw();
    }

    function canvasMouseMove() {
        var i;
        var node;
        // Prevent touch scrolling...
        //if (d3.touches(this)[0]) {
        //    d3.event.preventDefault();
        //}

        // TODO: auto scroll the container
        //var point = d3.mouse(this);
        //if (point[0]-container.scrollLeft < 30 && container.scrollLeft > 0) { container.scrollLeft -= 15; }
        //console.log(d3.mouse(this),container.offsetWidth,container.offsetHeight,container.scrollLeft,container.scrollTop);

        if (mouse_mode === RED.state.PANNING) {
            var pos = [d3.event.pageX,d3.event.pageY];
            if (d3.event.touches) {
                var touch0 = d3.event.touches.item(0);
                pos = [touch0.pageX, touch0.pageY];
            }
            var deltaPos = [
                mouse_position[0]-pos[0],
                mouse_position[1]-pos[1]
            ];

            chart.scrollLeft(scroll_position[0]+deltaPos[0])
            chart.scrollTop(scroll_position[1]+deltaPos[1])
            return
        }

        mouse_position = d3.touches(this)[0]||d3.mouse(this);

        if (lasso) {
            var ox = parseInt(lasso.attr("ox"));
            var oy = parseInt(lasso.attr("oy"));
            var x = parseInt(lasso.attr("x"));
            var y = parseInt(lasso.attr("y"));
            var w;
            var h;
            if (mouse_position[0] < ox) {
                x = mouse_position[0];
                w = ox-x;
            } else {
                w = mouse_position[0]-x;
            }
            if (mouse_position[1] < oy) {
                y = mouse_position[1];
                h = oy-y;
            } else {
                h = mouse_position[1]-y;
            }
            lasso
                .attr("x",x)
                .attr("y",y)
                .attr("width",w)
                .attr("height",h)
            ;
            return;
        } else if (mouse_mode === RED.state.SLICING || mouse_mode === RED.state.SLICING_JUNCTION) {
            if (slicePath) {
                var delta = Math.max(1,Math.abs(slicePathLast[0]-mouse_position[0]))*Math.max(1,Math.abs(slicePathLast[1]-mouse_position[1]))
                if (delta > 20) {
                    var currentPath = slicePath.attr("d")
                    currentPath += " L"+mouse_position[0]+" "+mouse_position[1]
                    slicePath.attr("d",currentPath);
                    slicePathLast = mouse_position
                }
            }
            return
        }

        if (mouse_mode === RED.state.SELECTING_NODE) {
            d3.event.stopPropagation();
            return;
        }

        if (mouse_mode != RED.state.QUICK_JOINING && mouse_mode != RED.state.IMPORT_DRAGGING && mouse_mode != RED.state.DETACHED_DRAGGING && !mousedown_node && !mousedown_group && selectedLinks.length() === 0) {
            return;
        }

        var mousePos;
        // if (mouse_mode === RED.state.GROUP_RESIZE) {
        //     mousePos = mouse_position;
        //     var nx = mousePos[0] + mousedown_group.dx;
        //     var ny = mousePos[1] + mousedown_group.dy;
        //     switch(mousedown_group.activeHandle) {
        //         case 0: mousedown_group.pos.x0 = nx; mousedown_group.pos.y0 = ny; break;
        //         case 1: mousedown_group.pos.x1 = nx; mousedown_group.pos.y0 = ny; break;
        //         case 2: mousedown_group.pos.x1 = nx; mousedown_group.pos.y1 = ny; break;
        //         case 3: mousedown_group.pos.x0 = nx; mousedown_group.pos.y1 = ny; break;
        //     }
        //     mousedown_group.dirty = true;
        // }
        if (mouse_mode == RED.state.JOINING || mouse_mode === RED.state.QUICK_JOINING) {
            // update drag line
            if (drag_lines.length === 0 && mousedown_port_type !== null) {
                if (d3.event.shiftKey) {
                    // Get all the wires we need to detach.
                    var links = [];
                    var existingLinks = [];
                    if (selectedLinks.length() > 0) {
                        selectedLinks.forEach(function(link) {
                            if (((mousedown_port_type === PORT_TYPE_OUTPUT &&
                                link.source === mousedown_node &&
                                link.sourcePort === mousedown_port_index
                            ) ||
                            (mousedown_port_type === PORT_TYPE_INPUT &&
                                link.target === mousedown_node
                            ))) {
                                existingLinks.push(link);
                            }
                        })
                    } else {
                        var filter;
                        if (mousedown_port_type === PORT_TYPE_OUTPUT) {
                            filter = {
                                source:mousedown_node,
                                sourcePort: mousedown_port_index
                            }
                        } else {
                            filter = {
                                target: mousedown_node
                            }
                        }
                        existingLinks = RED.nodes.filterLinks(filter);
                    }
                    for (i=0;i<existingLinks.length;i++) {
                        var link = existingLinks[i];
                        RED.nodes.removeLink(link);
                        links.push({
                            link:link,
                            node: (mousedown_port_type===PORT_TYPE_OUTPUT)?link.target:link.source,
                            port: (mousedown_port_type===PORT_TYPE_OUTPUT)?0:link.sourcePort,
                            portType: (mousedown_port_type===PORT_TYPE_OUTPUT)?PORT_TYPE_INPUT:PORT_TYPE_OUTPUT
                        })
                    }
                    if (links.length === 0) {
                        resetMouseVars();
                        redraw();
                    } else {
                        showDragLines(links);
                        mouse_mode = 0;
                        updateActiveNodes();
                        redraw();
                        mouse_mode = RED.state.JOINING;
                    }
                } else if (mousedown_node && !quickAddLink) {
                    showDragLines([{node:mousedown_node,port:mousedown_port_index,portType:mousedown_port_type}]);
                }
                selectedLinks.clear();
            }
            mousePos = mouse_position;
            for (i=0;i<drag_lines.length;i++) {
                var drag_line = drag_lines[i];
                var numOutputs = (drag_line.portType === PORT_TYPE_OUTPUT)?(drag_line.node.outputs || 1):1;
                var sourcePort = drag_line.port;
                var portY = -((numOutputs-1)/2)*13 +13*sourcePort;

                var sc = (drag_line.portType === PORT_TYPE_OUTPUT)?1:-1;
                drag_line.el.attr("d",generateLinkPath(drag_line.node.x+sc*drag_line.node.w/2,drag_line.node.y+portY,mousePos[0],mousePos[1],sc, !!drag_line.node.status));
            }
            d3.event.preventDefault();
        } else if (mouse_mode == RED.state.MOVING) {
            mousePos = d3.mouse(document.body);
            if (isNaN(mousePos[0])) {
                mousePos = d3.touches(document.body)[0];
            }
            var d = (mouse_offset[0]-mousePos[0])*(mouse_offset[0]-mousePos[0]) + (mouse_offset[1]-mousePos[1])*(mouse_offset[1]-mousePos[1]);
            if ((d > 3 && !dblClickPrimed) || (dblClickPrimed && d > 10)) {
                clickElapsed = 0;
                if (!activeFlowLocked) {
                    if (mousedown_node) {
                        movingSet.makePrimary(mousedown_node)
                    }
                    mouse_mode = RED.state.MOVING_ACTIVE;
                    startSelectionMove()
                }
            }
        } else if (mouse_mode == RED.state.MOVING_ACTIVE || mouse_mode == RED.state.IMPORT_DRAGGING || mouse_mode == RED.state.DETACHED_DRAGGING) {
            mousePos = mouse_position;
            var minX = 0;
            var minY = 0;
            var maxX = space_width;
            var maxY = space_height;
            for (var n = 0; n<movingSet.length(); n++) {
                node = movingSet.get(n);
                if (d3.event.shiftKey) {
                    node.n.ox = node.n.x;
                    node.n.oy = node.n.y;
                }
                node.n._detachFromGroup = d3.event.altKey
                node.n.x = mousePos[0]+node.dx;
                node.n.y = mousePos[1]+node.dy;
                node.n.dirty = true;
                if (node.n.type === "group") {
                    if (node.n.groupMoved !== false) {
                        node.n.groupMoved = true;
                    }
                    RED.group.markDirty(node.n);
                    minX = Math.min(node.n.x-5,minX);
                    minY = Math.min(node.n.y-5,minY);
                    maxX = Math.max(node.n.x+node.n.w+5,maxX);
                    maxY = Math.max(node.n.y+node.n.h+5,maxY);
                } else {
                    minX = Math.min(node.n.x-node.n.w/2-5,minX);
                    minY = Math.min(node.n.y-node.n.h/2-5,minY);
                    maxX = Math.max(node.n.x+node.n.w/2+5,maxX);
                    maxY = Math.max(node.n.y+node.n.h/2+5,maxY);
                }
            }
            if (minX !== 0 || minY !== 0) {
                for (i = 0; i<movingSet.length(); i++) {
                    node = movingSet.get(i);
                    node.n.x -= minX;
                    node.n.y -= minY;
                }
            }
            if (maxX !== space_width || maxY !== space_height) {
                for (i = 0; i<movingSet.length(); i++) {
                    node = movingSet.get(i);
                    node.n.x -= (maxX - space_width);
                    node.n.y -= (maxY - space_height);
                }
            }
            // if (mousedown_group) {
            //     mousedown_group.x = mousePos[0] + mousedown_group.dx;
            //     mousedown_group.y = mousePos[1] + mousedown_group.dy;
            //     mousedown_group.dirty = true;
            // }
            var gridOffset = [0,0];
            if (snapGrid != d3.event.shiftKey && movingSet.length() > 0) {
                var i = 0;

                // Prefer to snap nodes to the grid if there is one in the selection
                do {
                    node = movingSet.get(i++);
                } while(i<movingSet.length() && node.n.type === "group")

                if (node.n.type === "group") {
                    // TODO: Group snap to grid
                    gridOffset[0] = node.n.x-(gridSize*Math.floor(node.n.x/gridSize))-gridSize/2;
                    gridOffset[1] = node.n.y-(gridSize*Math.floor(node.n.y/gridSize))-gridSize/2;
                } else {
                    const snapOffsets = RED.view.tools.calculateGridSnapOffsets(node.n);
                    gridOffset[0] = snapOffsets.x;
                    gridOffset[1] = snapOffsets.y;
                }
                if (gridOffset[0] !== 0 || gridOffset[1] !== 0) {
                    for (i = 0; i<movingSet.length(); i++) {
                        node = movingSet.get(i);
                        node.n.x -= gridOffset[0];
                        node.n.y -= gridOffset[1];
                        if (node.n.x == node.n.ox && node.n.y == node.n.oy) {
                            node.dirty = false;
                        }
                    }
                }
            }

            // Check link splice
            if (movingSet.length() === 1 && movingSet.get(0).n.type !== "group") {
                node = movingSet.get(0);
                if (spliceActive) {
                    if (!spliceTimer) {
                        spliceTimer = setTimeout(function() {
                            var nodes = [];
                            var bestDistance = Infinity;
                            var bestLink = null;
                            var mouseX = node.n.x;
                            var mouseY = node.n.y;
                            if (outer[0][0].getIntersectionList) {
                                var svgRect = outer[0][0].createSVGRect();
                                svgRect.x = mouseX*scaleFactor;
                                svgRect.y = mouseY*scaleFactor;
                                svgRect.width = 1;
                                svgRect.height = 1;
                                nodes = outer[0][0].getIntersectionList(svgRect, outer[0][0]);
                            } else {
                                // Firefox doesn"t do getIntersectionList and that
                                // makes us sad
                                nodes = RED.view.getLinksAtPoint(mouseX, mouseY);
                            }
                            for (var i=0;i<nodes.length;i++) {
                                if (d3.select(nodes[i]).classed("red-ui-flow-link-background")) {
                                    var length = nodes[i].getTotalLength();
                                    for (var j=0;j<length;j+=10) {
                                        var p = nodes[i].getPointAtLength(j);
                                        var d2 = ((p.x-mouseX)*(p.x-mouseX))+((p.y-mouseY)*(p.y-mouseY));
                                        if (d2 < 200 && d2 < bestDistance) {
                                            bestDistance = d2;
                                            bestLink = nodes[i];
                                        }
                                    }
                                }
                            }
                            if (activeSpliceLink && activeSpliceLink !== bestLink) {
                                d3.select(activeSpliceLink.parentNode).classed("red-ui-flow-link-splice",false);
                            }
                            if (bestLink) {
                                d3.select(bestLink.parentNode).classed("red-ui-flow-link-splice",true)
                            } else {
                                d3.select(".red-ui-flow-link-splice").classed("red-ui-flow-link-splice",false);
                            }
                            activeSpliceLink = bestLink;
                            spliceTimer = null;
                        },100);
                    }
                }
            }
            // Check merge into group
            if (groupAddActive) {
                if (!groupHoverTimer) {
                    const isDetachFromGroup = d3.event.altKey
                    groupHoverTimer = setTimeout(function() {
                        node = movingSet.get(0);
                        const hoveredGroup = getGroupAt(mousePos[0],mousePos[1], true);
                        if (hoveredGroup !== activeHoverGroup) {
                            if (activeHoverGroup) {
                                activeHoverGroup.hovered = false
                                activeHoverGroup.dirty = true
                            }
                            activeHoverGroup = hoveredGroup
                        }
                        if (activeHoverGroup && groupAddParentGroup && !isDetachFromGroup) {
                            if (groupAddParentGroup === activeHoverGroup.id) {
                                activeHoverGroup = null
                            } else {
                                const nodeGroup = RED.nodes.group(groupAddParentGroup)
                                // This node is already in a group. It should only be draggable
                                // into a group that is a child of the group its in
                                if (!RED.group.contains(nodeGroup, activeHoverGroup)) {
                                    activeHoverGroup = null
                                }
                            }
                        }
                        if (activeHoverGroup) {
                            activeHoverGroup.hovered = true
                            activeHoverGroup.dirty = true
                        }
                        groupHoverTimer = null;
                    }, 50);
                }
            }


        }
        if (mouse_mode !== 0) {
            redraw();
        }
    }
    function canvasMouseLeave() {
        if (mouse_mode !== 0 && d3.event.buttons !== 0) {
            d3.select(document).on('mouseup.red-ui-workspace-tracker', function() {
                d3.select(document).on('mouseup.red-ui-workspace-tracker', null)
                canvasMouseUp.call(this)
            })
        }
    }
    function canvasMouseUp() {
        lastClickPosition = [d3.event.offsetX/scaleFactor,d3.event.offsetY/scaleFactor];
        if (RED.view.DEBUG) {
            console.warn("canvasMouseUp", { mouse_mode, point: d3.mouse(this), event: d3.event });
        }
        var i;
        var historyEvent;
        if (d3.event.button === 2) {
            return
        }
        if (mouse_mode === RED.state.PANNING) {
            resetMouseVars();
            return
        }
        if (mouse_mode === RED.state.SELECTING_NODE) {
            d3.event.stopPropagation();
            return;
        }
        if (mouse_mode === RED.state.QUICK_JOINING) {
            return;
        }
        if (mousedown_node && mouse_mode == RED.state.JOINING) {
            var removedLinks = [];
            for (i=0;i<drag_lines.length;i++) {
                if (drag_lines[i].link) {
                    removedLinks.push(drag_lines[i].link)
                }
            }
            if (removedLinks.length > 0) {
                historyEvent = {
                    t:"delete",
                    links: removedLinks,
                    dirty:RED.nodes.dirty()
                };
                RED.history.push(historyEvent);
                RED.nodes.dirty(true);
            } else {
                // Trigger quick add dialog
                d3.event.stopPropagation();
                clearSelection();
                const point = d3.mouse(this);
                var clickedGroup = getGroupAt(point[0], point[1]);
                if (drag_lines.length > 0) {
                    clickedGroup = clickedGroup || RED.nodes.group(drag_lines[0].node.g)
                }
                showQuickAddDialog({ position: point, group: clickedGroup });
            }
            hideDragLines();
        }
        if (lasso) {
            var x = parseInt(lasso.attr("x"));
            var y = parseInt(lasso.attr("y"));
            var x2 = x+parseInt(lasso.attr("width"));
            var y2 = y+parseInt(lasso.attr("height"));
            if (!d3.event.shiftKey) {
                clearSelection();
            }

            activeGroups.forEach(function(n) {
                if (!movingSet.has(n) && !n.selected) {
                    // group entirely within lasso
                    if (n.x > x && n.y > y && n.x + n.w < x2 && n.y + n.h < y2) {
                        selectedGroups.add(n, true)
                    }
                }
            })
            activeNodes.forEach(function(n) {
                if (!movingSet.has(n) && !n.selected) {
                    if (n.x > x && n.x < x2 && n.y > y && n.y < y2) {
                        n.selected = true;
                        n.dirty = true;
                        movingSet.add(n);
                    }
                }
            });
            activeJunctions.forEach(function(n) {
                if (!movingSet.has(n) && !n.selected) {
                    if (n.x > x && n.x < x2 && n.y > y && n.y < y2) {
                        n.selected = true;
                        n.dirty = true;
                        movingSet.add(n);
                    }
                }
            })
            activeLinks.forEach(function(link) {
                if (!link.selected) {
                    var sourceY = link.source.y
                    var targetY = link.target.y
                    var sourceX = link.source.x+(link.source.w/2) + 10
                    var targetX = link.target.x-(link.target.w/2) - 10
                    if (
                        sourceX > x && sourceX < x2 && sourceY > y && sourceY < y2 &&
                        targetX > x && targetX < x2 && targetY > y && targetY < y2
                    ) {
                        selectedLinks.add(link);
                    }
                }
            })

            if (activeSubflow) {
                activeSubflow.in.forEach(function(n) {
                    n.selected = (n.x > x && n.x < x2 && n.y > y && n.y < y2);
                    if (n.selected) {
                        n.dirty = true;
                        movingSet.add(n);
                    }
                });
                activeSubflow.out.forEach(function(n) {
                    n.selected = (n.x > x && n.x < x2 && n.y > y && n.y < y2);
                    if (n.selected) {
                        n.dirty = true;
                        movingSet.add(n);
                    }
                });
                if (activeSubflow.status) {
                    activeSubflow.status.selected = (activeSubflow.status.x > x && activeSubflow.status.x < x2 && activeSubflow.status.y > y && activeSubflow.status.y < y2);
                    if (activeSubflow.status.selected) {
                        activeSubflow.status.dirty = true;
                        movingSet.add(activeSubflow.status);
                    }
                }
            }
            updateSelection();
            outer.classed('red-ui-workspace-lasso-active', false)
            lasso.remove();
            lasso = null;
        } else if (mouse_mode == RED.state.DEFAULT && mousedown_link == null && !d3.event.ctrlKey && !d3.event.metaKey ) {
            clearSelection();
            updateSelection();
        } else if (mouse_mode == RED.state.SLICING) {
            deleteSelection();
            slicePath.remove();
            slicePath = null;
            RED.view.redraw(true);
        } else if (mouse_mode == RED.state.SLICING_JUNCTION) {
            RED.actions.invoke("core:split-wires-with-junctions")
            slicePath.remove();
            slicePath = null;
        }
        if (mouse_mode == RED.state.MOVING_ACTIVE) {
            if (movingSet.length() > 0) {
                historyEvent = { t: 'multi', events: [] }

                // Check to see if we're dropping into a group
                const {
                    addedToGroup,
                    removedFromGroup,
                    groupMoveEvent,
                    rehomedNodes
                } = addMovingSetToGroup()

                if (groupMoveEvent) {
                    historyEvent.events.push(groupMoveEvent)
                }

                // Create two lists of nodes:
                //  - nodes that have moved without changing group
                //  - nodes that have moved AND changed group
                const moveEvent = {
                    t: 'move',
                    nodes: [],
                    dirty: RED.nodes.dirty()
                }
                const moveAndChangedGroupEvent = {
                    t: 'move',
                    nodes: [],
                    dirty: RED.nodes.dirty(),
                    addToGroup: addedToGroup,
                    removeFromGroup: removedFromGroup
                }
                for (let j = 0; j < movingSet.length(); j++) {
                    const n = movingSet.get(j);
                    delete n.n._detachFromGroup
                    if (n.ox !== n.n.x || n.oy !== n.n.y || addedToGroup) {
                        // This node has moved or added to a group
                        if (rehomedNodes.has(n)) {
                            moveAndChangedGroupEvent.nodes.push({...n})
                        } else {
                            moveEvent.nodes.push({...n})
                        }
                        n.n.dirty = true;
                        n.n.moved = true;
                    }
                }
                // If a node has moved and ends up being spliced into a link, keep
                // track of which historyEvent to add the splice info to
                let targetSpliceEvent = null
                if (moveEvent.nodes.length > 0) {
                    historyEvent.events.push(moveEvent)
                    targetSpliceEvent = moveEvent
                }
                if (moveAndChangedGroupEvent.nodes.length > 0) {
                    historyEvent.events.push(moveAndChangedGroupEvent)
                    targetSpliceEvent = moveAndChangedGroupEvent
                }
                // activeSpliceLink will only be set if the movingSet has a single
                // node that is able to splice.
                if (targetSpliceEvent && activeSpliceLink) {
                    var linkToSplice = d3.select(activeSpliceLink).data()[0];
                    spliceLink(linkToSplice, movingSet.get(0).n, targetSpliceEvent)
                }

                // Only continue if something has moved
                if (historyEvent.events.length > 0) {
                    RED.nodes.dirty(true);
                    if (historyEvent.events.length === 1) {
                        // Keep history tidy - no need for multi-event
                        RED.history.push(historyEvent.events[0]);
                    } else {
                        // Multiple events - push the whole lot as one
                        RED.history.push(historyEvent);
                    }
                    updateActiveNodes();
                }
            }
        }
        if (mouse_mode == RED.state.MOVING || mouse_mode == RED.state.MOVING_ACTIVE || mouse_mode == RED.state.DETACHED_DRAGGING) {
            if (mouse_mode === RED.state.DETACHED_DRAGGING) {
                var ns = [];
                for (var j=0;j<movingSet.length();j++) {
                    var n = movingSet.get(j);
                    if (n.ox !== n.n.x || n.oy !== n.n.y) {
                        ns.push({n:n.n,ox:n.ox,oy:n.oy,moved:n.n.moved});
                        n.n.dirty = true;
                        n.n.moved = true;
                    }
                }
                var detachEvent = RED.history.peek();
                // The last event in the stack *should* be a multi-event from
                // where the links were added/removed
                var historyEvent = {t:"move",nodes:ns,dirty:RED.nodes.dirty()}
                if (detachEvent.t === "multi") {
                    detachEvent.events.push(historyEvent)
                } else {
                    RED.history.push(historyEvent)
                }
            }
            for (i=0;i<movingSet.length();i++) {
                var node = movingSet.get(i);
                delete node.ox;
                delete node.oy;
            }
        }
        if (mouse_mode == RED.state.IMPORT_DRAGGING) {
            if (clipboardSource === 'cut') {
                clipboardSource = 'copy'
            }
            updateActiveNodes();
            RED.nodes.dirty(true);
        }
        resetMouseVars();
        redraw();
    }


    function spliceLink(link, node, historyEvent) {
        RED.nodes.removeLink(link);
        const link1 = {
            source: link.source,
            sourcePort: link.sourcePort,
            target: node
        };
        const link2 = {
            source: node,
            sourcePort: 0,
            target: link.target
        };
        RED.nodes.addLink(link1);
        RED.nodes.addLink(link2);

        historyEvent.links = (historyEvent.links || []).concat([link1,link2]);
        historyEvent.removedLinks = [link];
    }

    function addMovingSetToGroup() {

        const isDetachFromGroup = groupAddParentGroup && d3.event.altKey

        let addedToGroup = null;
        let removedFromGroup = null;
        let groupMoveEvent = null;
        let rehomedNodes = new Set()

        if (activeHoverGroup) {
            // Nodes are being dropped into a group. We have to assume at
            // this point that everything in the movingSet is valid for adding
            // to this group. But it could be a mix of nodes and existing groups.
            // In which case, we don't want to rehome all of the nodes inside
            // existing groups - we just want to rehome the top level objects.
            var oldX = activeHoverGroup.x; 
            var oldY = activeHoverGroup.y; 
            if (groupAddParentGroup) {
                removedFromGroup = RED.nodes.group(groupAddParentGroup)
            }
            // Second pass - now we know what to move, we can move it
            for (let j=0;j<movingSet.length();j++) {
                const n = movingSet.get(j)
                if (!n.n.g || (removedFromGroup && n.n.g === removedFromGroup.id)) {
                    rehomedNodes.add(n)  
                    RED.group.addToGroup(activeHoverGroup, n.n);
                }
            }
            if ((activeHoverGroup.x !== oldX) ||
                (activeHoverGroup.y !== oldY)) {
                groupMoveEvent = {
                    t: "move",
                    nodes: [{n: activeHoverGroup,
                             ox: oldX, oy: oldY,
                             dx: activeHoverGroup.x -oldX,
                             dy: activeHoverGroup.y -oldY}],
                    dirty: true
                };
            }
            addedToGroup = activeHoverGroup;
            activeHoverGroup.hovered = false;
            activeHoverGroup = null;
        } else if (isDetachFromGroup) {
            // The nodes are being removed from their group
            removedFromGroup = RED.nodes.group(groupAddParentGroup)
            for (let j=0;j<movingSet.length();j++) {
                const n = movingSet.get(j)
                if (n.n.g && n.n.g === removedFromGroup.id) {
                    rehomedNodes.add(n)  
                    RED.group.removeFromGroup(removedFromGroup, n.n);
                }
            }
        }
        activeGroups.forEach(g => {
            if (g.hovered) {
                g.hovered = false
                g.dirty = true
            }
        })

        return {
            addedToGroup,
            removedFromGroup,
            groupMoveEvent,
            rehomedNodes
        }

    }

    function zoomIn() {
        if (scaleFactor < 2) {
            zoomView(scaleFactor+0.1);
        }
    }
    function zoomOut() {
        if (scaleFactor > 0.3) {
            zoomView(scaleFactor-0.1);
        }
    }
    function zoomZero() { zoomView(1); }
    function searchFlows() { RED.actions.invoke("core:search", $(this).data("term")); }
    function searchPrev() { RED.actions.invoke("core:search-previous"); }
    function searchNext() { RED.actions.invoke("core:search-next"); }


    function zoomView(factor) {
        var screenSize = [chart.width(),chart.height()];
        var scrollPos = [chart.scrollLeft(),chart.scrollTop()];
        var center = [(scrollPos[0] + screenSize[0]/2)/scaleFactor,(scrollPos[1] + screenSize[1]/2)/scaleFactor];
        scaleFactor = factor;
        var newCenter = [(scrollPos[0] + screenSize[0]/2)/scaleFactor,(scrollPos[1] + screenSize[1]/2)/scaleFactor];
        var delta = [(newCenter[0]-center[0])*scaleFactor,(newCenter[1]-center[1])*scaleFactor]
        chart.scrollLeft(scrollPos[0]-delta[0]);
        chart.scrollTop(scrollPos[1]-delta[1]);

        RED.view.navigator.resize();
        redraw();
        if (RED.settings.get("editor.view.view-store-zoom")) {
            RED.settings.setLocal('zoom-level', factor.toFixed(1))
        }
    }

    function selectNone() {
        if (mouse_mode === RED.state.MOVING || mouse_mode === RED.state.MOVING_ACTIVE) {
            return;
        }
        if (mouse_mode === RED.state.DETACHED_DRAGGING) {
            for (var j=0;j<movingSet.length();j++) {
                var n = movingSet.get(j);
                n.n.x = n.ox;
                n.n.y = n.oy;
            }
            clearSelection();
            RED.history.pop();
            mouse_mode = 0;
        } else if (mouse_mode === RED.state.IMPORT_DRAGGING) {
            clearSelection();
            RED.history.pop();
            mouse_mode = 0;
        } else if (mouse_mode === RED.state.SLICING || mouse_mode === RED.state.SLICING_JUNCTION) {
            if (slicePath) {
                slicePath.remove();
                slicePath = null;
                resetMouseVars()
            }
            clearSelection();
        } else if (lasso) {
            outer.classed('red-ui-workspace-lasso-active', false)
            lasso.remove();
            lasso = null;
        } else {
            clearSelection();
        }
        redraw();
    }
    function selectAll() {
        if (mouse_mode === RED.state.SELECTING_NODE && selectNodesOptions.single) {
            return;
        }
        selectedLinks.clear();
        clearSelection();
        activeGroups.forEach(function(g) {
            if (!g.g) {
                selectedGroups.add(g, true);
                if (!g.selected) {
                    g.selected = true;
                    g.dirty = true;
                }
            } else {
                g.selected = false;
                g.dirty = true;
            }
        })

        activeNodes.forEach(function(n) {
            if (mouse_mode === RED.state.SELECTING_NODE) {
                if (selectNodesOptions.filter && !selectNodesOptions.filter(n)) {
                    return;
                }
            }
            if (!n.g && !n.selected) {
                n.selected = true;
                n.dirty = true;
                movingSet.add(n);
            }
        });

        activeJunctions.forEach(function(n) {
            if (!n.selected) {
                n.selected = true;
                n.dirty = true;
                movingSet.add(n);
            }
        })

        if (mouse_mode !== RED.state.SELECTING_NODE && activeSubflow) {
            activeSubflow.in.forEach(function(n) {
                if (!n.selected) {
                    n.selected = true;
                    n.dirty = true;
                    movingSet.add(n);
                }
            });
            activeSubflow.out.forEach(function(n) {
                if (!n.selected) {
                    n.selected = true;
                    n.dirty = true;
                    movingSet.add(n);
                }
            });
            if (activeSubflow.status) {
                if (!activeSubflow.status.selected) {
                    activeSubflow.status.selected = true;
                    activeSubflow.status.dirty = true;
                    movingSet.add(activeSubflow.status);
                }
            }
        }
        if (mouse_mode !== RED.state.SELECTING_NODE) {
            updateSelection();
        }
        redraw();
    }

    function clearSelection() {
        if (RED.view.DEBUG) { console.warn("clearSelection", mouse_mode,"movingSet.length():",movingSet.length()); }
        for (var i=0;i<movingSet.length();i++) {
            var n = movingSet.get(i);
            n.n.dirty = true;
            n.n.selected = false;
        }
        movingSet.clear();
        selectedLinks.clear();
        selectedGroups.clear();
    }

    var lastSelection = null;
    function updateSelection() {
        var selection = {};
        var activeWorkspace = RED.workspaces.active();
        var workspaceSelection = RED.workspaces.selection();
        if (activeWorkspace !== 0) {
            if (workspaceSelection.length === 0) {
                selection = getSelection();
                activeLinks = RED.nodes.filterLinks({
                    source:{z:activeWorkspace},
                    target:{z:activeWorkspace}
                });
                var tabOrder = RED.nodes.getWorkspaceOrder();
                var currentLinks = activeLinks;
                var addedLinkLinks = {};
                activeFlowLinks = [];
                var activeLinkNodeIds = Object.keys(activeLinkNodes);
                activeLinkNodeIds.forEach(function(n) {
                    activeLinkNodes[n].dirty = true;
                })
                activeLinkNodes = {};
                for (var i=0;i<movingSet.length();i++) {
                    var msn = movingSet.get(i);
                    if (((msn.n.type === "link out" && msn.n.mode !== 'return') || msn.n.type === "link in") &&
                        (msn.n.z === activeWorkspace)) {
                        var linkNode = msn.n;
                        activeLinkNodes[linkNode.id] = linkNode;
                        var offFlowLinks = {};
                        linkNode.links.forEach(function(id) {
                            var target = RED.nodes.node(id);
                            if (target) {
                                if (linkNode.type === "link out") {
                                    if (target.z === linkNode.z) {
                                        if (!addedLinkLinks[linkNode.id+":"+target.id]) {
                                            activeLinks.push({
                                                source:linkNode,
                                                sourcePort:0,
                                                target: target,
                                                link: true
                                            });
                                            addedLinkLinks[linkNode.id+":"+target.id] = true;
                                            activeLinkNodes[target.id] = target;
                                            target.dirty = true;

                                        }
                                    } else {
                                        offFlowLinks[target.z] = offFlowLinks[target.z]||[];
                                        offFlowLinks[target.z].push(target);
                                    }
                                } else {
                                    if (target.z === linkNode.z) {
                                        if (!addedLinkLinks[target.id+":"+linkNode.id]) {
                                            activeLinks.push({
                                                source:target,
                                                sourcePort:0,
                                                target: linkNode,
                                                link: true
                                            });
                                            addedLinkLinks[target.id+":"+linkNode.id] = true;
                                            activeLinkNodes[target.id] = target;
                                            target.dirty = true;
                                        }
                                    } else {
                                        offFlowLinks[target.z] = offFlowLinks[target.z]||[];
                                        offFlowLinks[target.z].push(target);
                                    }
                                }
                            }
                        });
                        var offFlows = Object.keys(offFlowLinks);
                        // offFlows.sort(function(A,B) {
                        //     return tabOrder.indexOf(A) - tabOrder.indexOf(B);
                        // });
                        if (offFlows.length > 0) {
                            activeFlowLinks.push({
                                refresh: Math.floor(Math.random()*10000),
                                node: linkNode,
                                links: offFlowLinks//offFlows.map(function(i) { return {id:i,links:offFlowLinks[i]};})
                            });
                        }
                    }
                }
                if (activeFlowLinks.length === 0 && selectedLinks.length() > 0) {
                    selectedLinks.forEach(function(link) {
                        if (link.link) {
                            activeLinks.push(link);
                            activeLinkNodes[link.source.id] = link.source;
                            link.source.dirty = true;
                            activeLinkNodes[link.target.id] = link.target;
                            link.target.dirty = true;
                        }
                    })
                }
            } else {
                selection.flows = workspaceSelection;
            }
        }
        var selectionJSON = activeWorkspace+":"+JSON.stringify(selection,function(key,value) {
            if (key === 'nodes' || key === 'flows') {
                return value.map(function(n) { return n.id })
            } else if (key === 'link') {
                return value.source.id+":"+value.sourcePort+":"+value.target.id;
            } else if (key === 'links') {
                return value.map(function(link) {
                    return link.source.id+":"+link.sourcePort+":"+link.target.id;
                });
            }
            return value;
        });
        if (selectionJSON !== lastSelection) {
            lastSelection = selectionJSON;
            RED.events.emit("view:selection-changed",selection);
        }
    }

    function editSelection() {
        if (RED.workspaces.isLocked()) { return }
        if (movingSet.length() > 0) {
            var node = movingSet.get(0).n;
            if (node.type === "subflow") {
                RED.editor.editSubflow(activeSubflow);
            } else if (node.type === "group") {
                RED.editor.editGroup(node);
            } else {
                RED.editor.edit(node);
            }
        }
    }
    function deleteSelection(reconnectWires) {
        if (mouse_mode === RED.state.SELECTING_NODE) {
            return;
        }
        if (activeFlowLocked) {
            return
        }
        if (portLabelHover) {
            portLabelHover.remove();
            portLabelHover = null;
        }
        var workspaceSelection = RED.workspaces.selection();
        if (workspaceSelection.length > 0) {
            var workspaceCount = 0;
            workspaceSelection.forEach(function(ws) { if (ws.type === 'tab') { workspaceCount++ } });
            if (workspaceCount === RED.workspaces.count()) {
                // Cannot delete all workspaces
                return;
            }
            var historyEvent = {
                t: 'delete',
                dirty: RED.nodes.dirty(),
                nodes: [],
                links: [],
                groups: [],
                junctions: [],
                workspaces: [],
                subflows: []
            }
            var workspaceOrder = RED.nodes.getWorkspaceOrder().slice(0);

            for (var i=0;i<workspaceSelection.length;i++) {
                var ws = workspaceSelection[i];
                ws._index = workspaceOrder.indexOf(ws.id);
                RED.workspaces.remove(ws);
                var subEvent;
                if (ws.type === 'tab') {
                    historyEvent.workspaces.push(ws);
                    subEvent = RED.nodes.removeWorkspace(ws.id);
                } else {
                    subEvent = RED.subflow.removeSubflow(ws.id);
                    historyEvent.subflows = historyEvent.subflows.concat(subEvent.subflows);
                }
                historyEvent.nodes = historyEvent.nodes.concat(subEvent.nodes);
                historyEvent.links = historyEvent.links.concat(subEvent.links);
                historyEvent.groups = historyEvent.groups.concat(subEvent.groups);
                historyEvent.junctions = historyEvent.junctions.concat(subEvent.junctions);
            }
            RED.history.push(historyEvent);
            RED.nodes.dirty(true);
            updateActiveNodes();
            updateSelection();
            redraw();
        } else if (movingSet.length() > 0 || selectedLinks.length() > 0) {
            var result;
            var node;
            var removedNodes = [];
            var removedLinks = [];
            var removedGroups = [];
            var removedJunctions = [];
            var removedSubflowOutputs = [];
            var removedSubflowInputs = [];
            var removedSubflowStatus;
            var subflowInstances = [];
            var historyEvents = [];
            var addToRemovedLinks = function(links) {
                if(!links) { return; }
                var _links = Array.isArray(links) ? links : [links];
                _links.forEach(function(l) {
                    removedLinks.push(l);
                    selectedLinks.remove(l);
                })
            }
            if (reconnectWires) {
                var reconnectResult = RED.nodes.detachNodes(movingSet.nodes())
                var addedLinks = reconnectResult.newLinks;
                if (addedLinks.length > 0) {
                    historyEvents.push({ t:'add', links: addedLinks })
                }
                addToRemovedLinks(reconnectResult.removedLinks)
            }

            const startDirty = RED.nodes.dirty();
            let movingSelectedGroups = [];
            if (movingSet.length() > 0) {

                for (var i=0;i<movingSet.length();i++) {
                    node = movingSet.get(i).n;
                    if (node.type === "group") {
                        movingSelectedGroups.push(node);
                    }
                }
                // Make sure we have identified all groups about to be deleted
                for (i=0;i<movingSelectedGroups.length;i++) {
                    movingSelectedGroups[i].nodes.forEach(function(n) {
                        if (n.type === "group" && movingSelectedGroups.indexOf(n) === -1) {
                            movingSelectedGroups.push(n);
                        }
                    })
                }
                for (var i=0;i<movingSet.length();i++) {
                    node = movingSet.get(i).n;
                    node.selected = false;
                    if (node.type !== "group" && node.type !== "subflow" && node.type !== 'junction') {
                        if (node.x < 0) {
                            node.x = 25
                        }
                        var removedEntities = RED.nodes.remove(node.id);
                        removedNodes.push(node);
                        removedNodes = removedNodes.concat(removedEntities.nodes);
                        addToRemovedLinks(removedEntities.links);
                        if (node.g) {
                            var group = RED.nodes.group(node.g);
                            if (movingSelectedGroups.indexOf(group) === -1) {
                                // Don't use RED.group.removeFromGroup as that emits
                                // a change event on the node - but we're deleting it
                                var index = group.nodes.indexOf(node);
                                group.nodes.splice(index,1);
                                RED.group.markDirty(group);
                            }
                        }
                    } else if (node.type === 'junction') {
                        var result = RED.nodes.removeJunction(node)
                        removedJunctions.push(node);
                        removedLinks = removedLinks.concat(result.links);
                        if (node.g) {
                            var group = RED.nodes.group(node.g);
                            if (movingSelectedGroups.indexOf(group) === -1) {
                                // Don't use RED.group.removeFromGroup as that emits
                                // a change event on the node - but we're deleting it
                                var index = group.nodes.indexOf(node);
                                group.nodes.splice(index,1);
                                RED.group.markDirty(group);
                            }
                        }
                    } else {
                        if (node.direction === "out") {
                            removedSubflowOutputs.push(node);
                        } else if (node.direction === "in") {
                            removedSubflowInputs.push(node);
                        } else if (node.direction === "status") {
                            removedSubflowStatus = node;
                        }
                        node.dirty = true;
                    }
                }

                // Groups must be removed in the right order - from inner-most
                // to outermost.
                for (i = movingSelectedGroups.length-1; i>=0; i--) {
                    var g = movingSelectedGroups[i];
                    removedGroups.push(g);
                    RED.nodes.removeGroup(g);
                }
                if (removedSubflowOutputs.length > 0) {
                    result = RED.subflow.removeOutput(removedSubflowOutputs);
                    if (result) {
                        addToRemovedLinks(result.links);
                    }
                }
                // Assume 0/1 inputs
                if (removedSubflowInputs.length == 1) {
                    result = RED.subflow.removeInput();
                    if (result) {
                        addToRemovedLinks(result.links);
                    }
                }
                if (removedSubflowStatus) {
                    result = RED.subflow.removeStatus();
                    if (result) {
                        addToRemovedLinks(result.links);
                    }
                }

                var instances = RED.subflow.refresh(true);
                if (instances) {
                    subflowInstances = instances.instances;
                }
                movingSet.clear();
                if (removedNodes.length > 0 || removedSubflowOutputs.length > 0 || removedSubflowInputs.length > 0 || removedSubflowStatus || removedGroups.length > 0 || removedJunctions.length > 0) {
                    RED.nodes.dirty(true);
                }
            }

            if (selectedLinks.length() > 0) {
                selectedLinks.forEach(function(link) {
                    if (link.link) {
                        var sourceId = link.source.id;
                        var targetId = link.target.id;
                        var sourceIdIndex = link.target.links.indexOf(sourceId);
                        var targetIdIndex = link.source.links.indexOf(targetId);
                        historyEvents.push({
                            t: "edit",
                            node: link.source,
                            changed: link.source.changed,
                            changes: {
                                links: $.extend(true,{},{v:link.source.links}).v
                            }
                        })
                        historyEvents.push({
                            t: "edit",
                            node: link.target,
                            changed: link.target.changed,
                            changes: {
                                links: $.extend(true,{},{v:link.target.links}).v
                            }
                        })
                        link.source.changed = true;
                        link.target.changed = true;
                        link.target.links.splice(sourceIdIndex,1);
                        link.source.links.splice(targetIdIndex,1);
                        link.source.dirty = true;
                        link.target.dirty = true;

                    } else {
                        RED.nodes.removeLink(link);
                        removedLinks.push(link);
                    }
                })
            }
            RED.nodes.dirty(true);
            var historyEvent = {
                t:"delete",
                nodes:removedNodes,
                links:removedLinks,
                groups: removedGroups,
                junctions: removedJunctions,
                subflowOutputs:removedSubflowOutputs,
                subflowInputs:removedSubflowInputs,
                subflow: {
                    id: activeSubflow?activeSubflow.id:undefined,
                    instances: subflowInstances
                },
                dirty:startDirty
            };
            if (removedSubflowStatus) {
                historyEvent.subflow.status = removedSubflowStatus;
            }
            if (historyEvents.length > 0) {
                historyEvents.unshift(historyEvent);
                RED.history.push({
                    t:"multi",
                    events: historyEvents
                })
            } else {
                RED.history.push(historyEvent);
            }

            selectedLinks.clear();
            updateActiveNodes();
            updateSelection();
            redraw();
        }
    }

    function copySelection(isCut) {
        if (mouse_mode === RED.state.SELECTING_NODE) {
            return;
        }
        var nodes = [];
        var selection = RED.workspaces.selection();
        if (selection.length > 0) {
            nodes = [];
            selection.forEach(function(n) {
                if (n.type === 'tab') {
                    nodes.push(n);
                    nodes = nodes.concat(RED.nodes.groups(n.id));
                    nodes = nodes.concat(RED.nodes.filterNodes({z:n.id}));
                }
            });
        } else {
            selection = RED.view.selection();
            if (selection.nodes) {
                selection.nodes.forEach(function(n) {
                    nodes.push(n);
                    if (n.type === 'group') {
                        nodes = nodes.concat(RED.group.getNodes(n,true));
                    }
                })
            }
        }

        if (nodes.length > 0) {
            var nns = [];
            var nodeCount = 0;
            var groupCount = 0;
            var junctionCount = 0;
            var handled = {};
            for (var n=0;n<nodes.length;n++) {
                var node = nodes[n];
                if (handled[node.id]) {
                    continue;
                }
                handled[node.id] = true;
                // The only time a node.type == subflow can be selected is the
                // input/output "proxy" nodes. They cannot be copied.
                if (node.type != "subflow") {
                    if (node.type === "group") {
                        groupCount++;
                    } else if (node.type === 'junction') {
                        junctionCount++;
                    } else {
                        nodeCount++;
                    }
                    for (var d in node._def.defaults) {
                        if (node._def.defaults.hasOwnProperty(d)) {
                            if (node._def.defaults[d].type) {
                                var configNode = RED.nodes.node(node[d]);
                                if (configNode && configNode._def.exclusive) {
                                    nns.push(RED.nodes.convertNode(configNode));
                                }
                            }
                        }
                    }
                    nns.push(RED.nodes.convertNode(node));
                    //TODO: if the node has an exclusive config node, it should also be copied, to ensure it remains exclusive...
                }
            }
            clipboard = JSON.stringify(nns);
            clipboardSource = isCut ? 'cut' : 'copy'
            RED.menu.setDisabled("menu-item-edit-paste", false);
            if (nodeCount > 0) {
                RED.notify(RED._("clipboard.nodeCopied",{count:nodeCount}),{id:"clipboard"});
            } else if (groupCount > 0) {
                RED.notify(RED._("clipboard.groupCopied",{count:groupCount}),{id:"clipboard"});
            }
        }
    }


    function detachSelectedNodes() {
        if (RED.workspaces.isLocked()) { return }
        var selection = RED.view.selection();
        if (selection.nodes) {
            const {newLinks, removedLinks} = RED.nodes.detachNodes(selection.nodes);
            if (removedLinks.length || newLinks.length) {
                RED.history.push({
                    t: "multi",
                    events: [
                        { t:'delete', links: removedLinks },
                        { t:'add', links: newLinks }
                    ],
                    dirty: RED.nodes.dirty()
                })
                RED.nodes.dirty(true)
            }
            prepareDrag([selection.nodes[0].x,selection.nodes[0].y]);
            mouse_mode = RED.state.DETACHED_DRAGGING;
            RED.view.redraw(true);
        }
    }

    function calculateTextWidth(str, className) {
        var result = convertLineBreakCharacter(str);
        var width = 0;
        for (var i=0;i<result.length;i++) {
            var calculateTextW=calculateTextDimensions(result[i],className)[0];
            if (width<calculateTextW) {
                width=calculateTextW;
            }
        }
        return width;
    }
    function getLabelParts(str, className) {
        var lines = convertLineBreakCharacter(str);
        var width = 0;
        for (var i=0;i<lines.length;i++) {
            var calculateTextW = calculateTextDimensions(lines[i],className)[0];
            if (width<calculateTextW) {
                width=calculateTextW;
            }
        }
        return {
            lines:lines,
            width: width
        }
    }

    var textDimensionPlaceholder = {};
    var textDimensionCache = {};
    function calculateTextDimensions(str,className) {
        var cacheKey = "!"+str;
        if (!textDimensionPlaceholder[className]) {
            textDimensionPlaceholder[className] = document.createElement("span");
            textDimensionPlaceholder[className].className = className;
            textDimensionPlaceholder[className].style.position = "absolute";
            textDimensionPlaceholder[className].style.top = "-1000px";
            document.getElementById("red-ui-editor").appendChild(textDimensionPlaceholder[className]);
            textDimensionCache[className] = {};
        } else {
            if (textDimensionCache[className][cacheKey]) {
                return textDimensionCache[className][cacheKey]
            }
        }
        textDimensionPlaceholder[className].textContent = (str||"");
        var w = textDimensionPlaceholder[className].offsetWidth;
        var h = textDimensionPlaceholder[className].offsetHeight;
        textDimensionCache[className][cacheKey] = [w,h];
        return textDimensionCache[className][cacheKey];
    }

    function convertLineBreakCharacter(str) {
        var result = [];
        var lines = str.split(/\\n /);
        if (lines.length > 1) {
            var i=0;
            for (i=0;i<lines.length - 1;i++) {
                if (/\\$/.test(lines[i])) {
                    result.push(lines[i]+"\\n "+lines[i+1])
                    i++;
                } else {
                    result.push(lines[i])
                }
            }
            if ( i === lines.length - 1) {
                result.push(lines[lines.length-1]);
            }
        } else {
            result = lines;
        }
        result = result.map(function(l) { return l.replace(/\\\\n /g,"\\n ").trim() })
        return result;
    }

    function resetMouseVars() {
        mousedown_node = null;
        mousedown_group = null;
        mousedown_group_handle = null;
        mouseup_node = null;
        mousedown_link = null;
        mouse_mode = 0;
        mousedown_port_type = null;
        activeSpliceLink = null;
        spliceActive = false;
        groupAddActive = false;
        if (activeHoverGroup) {
            activeHoverGroup.hovered = false;
            activeHoverGroup = null;
        }
        d3.selectAll(".red-ui-flow-link-splice").classed("red-ui-flow-link-splice",false);
        if (spliceTimer) {
            clearTimeout(spliceTimer);
            spliceTimer = null;
        }
        if (groupHoverTimer) {
            clearTimeout(groupHoverTimer);
            groupHoverTimer = null;
        }
    }

    function disableQuickJoinEventHandler(evt) {
        // Check for ctrl (all browsers), "Meta" (Chrome/FF), keyCode 91 (Safari), or Escape
        if (evt.keyCode === 17 || evt.key === "Meta" || evt.keyCode === 91 || evt.keyCode === 27) {
            resetMouseVars();
            hideDragLines();
            redraw();
            $(window).off('keyup',disableQuickJoinEventHandler);
        }
    }

    function portMouseDown(d,portType,portIndex, evt) {
        if (RED.view.DEBUG) { console.warn("portMouseDown", mouse_mode,d,portType,portIndex); }
        RED.contextMenu.hide();
        evt = evt || d3.event;
        if (evt === 1) {
            return;
        }
        if (mouse_mode === RED.state.SELECTING_NODE) {
            evt.stopPropagation();
            return;
        }
        mousedown_node = d;
        mousedown_port_type = portType;
        mousedown_port_index = portIndex || 0;
        if (mouse_mode !== RED.state.QUICK_JOINING && !activeFlowLocked) {
            mouse_mode = RED.state.JOINING;
            document.body.style.cursor = "crosshair";
            if (evt.ctrlKey || evt.metaKey) {
                mouse_mode = RED.state.QUICK_JOINING;
                showDragLines([{node:mousedown_node,port:mousedown_port_index,portType:mousedown_port_type}]);
                $(window).on('keyup',disableQuickJoinEventHandler);
            }
        }
        evt.stopPropagation();
        evt.preventDefault();
    }


    function portMouseUp(d,portType,portIndex,evt) {
        if (RED.view.DEBUG) { console.warn("portMouseUp", mouse_mode,d,portType,portIndex); }
        evt = evt || d3.event;
        if (mouse_mode === RED.state.SELECTING_NODE) {
            evt.stopPropagation();
            return;
        }
        var i;
        if (mouse_mode === RED.state.QUICK_JOINING && drag_lines.length > 0) {
            if (drag_lines[0].node === d) {
                // Cannot quick-join to self
                return
            }
            if (drag_lines[0].virtualLink &&
                (
                    (drag_lines[0].node.type === 'link in' && d.type !== 'link out') ||
                    (drag_lines[0].node.type === 'link out' && d.type !== 'link in')
                )
            ) {
                return
            }
        }
        document.body.style.cursor = "";

        if (mouse_mode == RED.state.JOINING || mouse_mode == RED.state.QUICK_JOINING) {
            if (typeof TouchEvent != "undefined" && evt instanceof TouchEvent) {
                if (RED.view.DEBUG) { console.warn("portMouseUp: TouchEvent", mouse_mode,d,portType,portIndex); }
                const direction = drag_lines[0].portType === PORT_TYPE_INPUT ? PORT_TYPE_OUTPUT : PORT_TYPE_INPUT
                let found = false;
                for (let nodeIdx = 0; nodeIdx < activeNodes.length; nodeIdx++) {
                    const n = activeNodes[nodeIdx];
                    if (RED.view.tools.isPointInNode(n, mouse_position)) {
                        found = true;
                        mouseup_node = n;
                        // portType = mouseup_node.inputs > 0 ? PORT_TYPE_INPUT : PORT_TYPE_OUTPUT;
                        portType = direction;
                        portIndex = 0;
                        break
                    }
                }

                if (!found && drag_lines.length > 0 && !drag_lines[0].virtualLink) {
                    for (let juncIdx = 0; juncIdx < activeJunctions.length; juncIdx++) {
                        // NOTE: a junction is 10px x 10px but the target area is expanded to 30wx20h by adding padding to the bounding box
                        const jNode = activeJunctions[juncIdx];
                        if (RED.view.tools.isPointInNode(jNode, mouse_position, 20, 10)) {
                            found = true;
                            mouseup_node = jNode;
                            portType = direction;
                            portIndex = 0;
                            break
                        }
                    }
                }

                if (!found && activeSubflow) {
                    var subflowPorts = [];
                    if (activeSubflow.status) {
                        subflowPorts.push(activeSubflow.status)
                    }
                    if (activeSubflow.in) {
                        subflowPorts = subflowPorts.concat(activeSubflow.in)
                    }
                    if (activeSubflow.out) {
                        subflowPorts = subflowPorts.concat(activeSubflow.out)
                    }
                    for (var i = 0; i < subflowPorts.length; i++) {
                        const sf = subflowPorts[i];
                        if (RED.view.tools.isPointInNode(sf, mouse_position)) {
                            found = true;
                            mouseup_node = sf;
                            portType = mouseup_node.direction === "in" ? PORT_TYPE_OUTPUT : PORT_TYPE_INPUT;
                            portIndex = 0;
                            break;
                        }
                    }
                }
            } else {
                mouseup_node = d;
            }
            var addedLinks = [];
            var removedLinks = [];
            var modifiedNodes = []; // joining link nodes

            var select_link = null;

            for (i=0;i<drag_lines.length;i++) {
                if (drag_lines[i].link) {
                    removedLinks.push(drag_lines[i].link)
                }
            }
            var linkEditEvents = [];

            for (i=0;i<drag_lines.length;i++) {
                if (portType != drag_lines[i].portType && mouseup_node !== drag_lines[i].node) {
                    let drag_line = drag_lines[i];
                    let src,dst,src_port;
                    let oldDst;
                    let oldSrc;
                    if (drag_line.portType === PORT_TYPE_OUTPUT) {
                        src = drag_line.node;
                        src_port = drag_line.port;
                        dst = mouseup_node;
                        oldSrc = src;
                        if (drag_line.link) {
                            oldDst = drag_line.link.target;
                        }
                    } else if (drag_line.portType === PORT_TYPE_INPUT) {
                        src = mouseup_node;
                        dst = drag_line.node;
                        src_port = portIndex || 0;
                        oldSrc = dst;
                        if (drag_line.link) {
                            oldDst = drag_line.link.source
                        }
                    }
                    var link = {source: src, sourcePort:src_port, target: dst};
                    if (drag_line.virtualLink) {
                        if (/^link (in|out)$/.test(src.type) && /^link (in|out)$/.test(dst.type) && src.type !== dst.type) {
                            if (src.links.indexOf(dst.id) === -1 && dst.links.indexOf(src.id) === -1) {
                                var oldSrcLinks = [...src.links]
                                var oldDstLinks = [...dst.links]

                                src.links.push(dst.id);
                                dst.links.push(src.id);

                                if (oldDst) {
                                    src.links = src.links.filter(id => id !== oldDst.id)
                                    dst.links = dst.links.filter(id => id !== oldDst.id)
                                    var oldOldDstLinks = [...oldDst.links]
                                    oldDst.links = oldDst.links.filter(id => id !== oldSrc.id)
                                    oldDst.dirty = true;
                                    modifiedNodes.push(oldDst);
                                    linkEditEvents.push({
                                        t:'edit',
                                        node: oldDst,
                                        dirty: RED.nodes.dirty(),
                                        changed: oldDst.changed,
                                        changes: {
                                            links:oldOldDstLinks
                                        }
                                    });
                                    oldDst.changed = true;
                                }

                                src.dirty = true;
                                dst.dirty = true;

                                modifiedNodes.push(src);
                                modifiedNodes.push(dst);

                                link.link = true;
                                activeLinks.push(link);
                                activeLinkNodes[src.id] = src;
                                activeLinkNodes[dst.id] = dst;
                                select_link = link;

                                linkEditEvents.push({
                                    t:'edit',
                                    node: src,
                                    dirty: RED.nodes.dirty(),
                                    changed: src.changed,
                                    changes: {
                                        links:oldSrcLinks
                                    }
                                });
                                linkEditEvents.push({
                                    t:'edit',
                                    node: dst,
                                    dirty: RED.nodes.dirty(),
                                    changed: dst.changed,
                                    changes: {
                                        links:oldDstLinks
                                    }
                                });
                               
                                src.changed = true;
                                dst.changed = true;
                            }
                        }
                    } else {
                        // This is not a virtualLink - which means it started
                        // on a regular node port. Need to ensure the this isn't
                        // connecting to a link node virual port.
                        //
                        // PORT_TYPE_OUTPUT=0
                        // PORT_TYPE_INPUT=1
                        if (!(
                            (d.type === "link out" && portType === PORT_TYPE_OUTPUT) ||
                            (d.type === "link in" && portType === PORT_TYPE_INPUT) ||
                            (portType === PORT_TYPE_OUTPUT && mouseup_node.type !== "subflow" && mouseup_node.outputs === 0) ||
                            (portType === PORT_TYPE_INPUT && mouseup_node.type !== "subflow" && mouseup_node.inputs === 0) ||
                            (drag_line.portType === PORT_TYPE_INPUT && mouseup_node.type === "subflow" && (mouseup_node.direction === "status" || mouseup_node.direction === "out")) ||
                            (drag_line.portType === PORT_TYPE_OUTPUT && mouseup_node.type === "subflow" && mouseup_node.direction === "in")
                        )) {
                            let hasJunctionLoop = false
                            if (link.source.type === 'junction' && link.target.type === 'junction') {
                                // This is joining two junctions together. We want to avoid creating a loop
                                // of pure junction nodes as there is no way to break out of it.

                                const visited = new Set()
                                let toVisit = [link.target]
                                while (toVisit.length > 0) {
                                    const next = toVisit.shift()
                                    if (next === link.source) {
                                        hasJunctionLoop = true
                                        break
                                    }
                                    visited.add(next)
                                    toVisit = toVisit.concat(RED.nodes.getDownstreamNodes(next).filter(n => n.type === 'junction' && !visited.has(n)))
                                }
                            }
                            var existingLink = RED.nodes.filterLinks({source:src,target:dst,sourcePort: src_port}).length !== 0;
                            if (!hasJunctionLoop && !existingLink) {
                                RED.nodes.addLink(link);
                                addedLinks.push(link);
                            }
                        }
                    }
                }
            }
            if (addedLinks.length > 0 || removedLinks.length > 0 || modifiedNodes.length > 0) {
                // console.log(addedLinks);
                // console.log(removedLinks);
                // console.log(modifiedNodes);
                var historyEvent;
                if (modifiedNodes.length > 0) {
                    historyEvent = {
                        t:"multi",
                        events: linkEditEvents,
                        dirty:RED.nodes.dirty()
                    };
                } else {
                    historyEvent = {
                        t:"add",
                        links:addedLinks,
                        removedLinks: removedLinks,
                        dirty:RED.nodes.dirty()
                    };
                }
                if (activeSubflow) {
                    var subflowRefresh = RED.subflow.refresh(true);
                    if (subflowRefresh) {
                        historyEvent.subflow = {
                            id:activeSubflow.id,
                            changed: activeSubflow.changed,
                            instances: subflowRefresh.instances
                        }
                    }
                }
                RED.history.push(historyEvent);
                updateActiveNodes();
                RED.nodes.dirty(true);
            }
            if (mouse_mode === RED.state.QUICK_JOINING) {
                if (addedLinks.length > 0 || modifiedNodes.length > 0) {
                    hideDragLines();
                    if (portType === PORT_TYPE_INPUT && d.outputs > 0) {
                        showDragLines([{node:d,port:0,portType:PORT_TYPE_OUTPUT}]);
                    } else if (portType === PORT_TYPE_OUTPUT && d.inputs > 0) {
                        showDragLines([{node:d,port:0,portType:PORT_TYPE_INPUT}]);
                    } else {
                        resetMouseVars();
                    }
                    mousedown_link = select_link;
                    if (select_link) {
                        selectedLinks.clear();
                        selectedLinks.add(select_link);
                        updateSelection();
                    } else {
                        selectedLinks.clear();
                    }
                }
                redraw();
                return;
            }

            resetMouseVars();
            hideDragLines();
            if (select_link) {
                selectedLinks.clear();
                selectedLinks.add(select_link);
            }
            mousedown_link = select_link;
            if (select_link) {
                updateSelection();
            }
            redraw();
        }
    }

    var portLabelHoverTimeout = null;
    var portLabelHover = null;


    function getElementPosition(node) {
        var d3Node = d3.select(node);
        if (d3Node.attr('class') === 'red-ui-workspace-chart-event-layer') {
            return [0,0];
        }
        var result = [];
        var localPos = [0,0];
        if (node.nodeName.toLowerCase() === 'g') {
            var transform = d3Node.attr("transform");
            if (transform) {
                localPos = d3.transform(transform).translate;
            }
        } else {
            localPos = [d3Node.attr("x")||0,d3Node.attr("y")||0];
        }
        var parentPos = getElementPosition(node.parentNode);
        return [localPos[0]+parentPos[0],localPos[1]+parentPos[1]]

    }

    function getPortLabel(node,portType,portIndex) {
        var result;
        var nodePortLabels = (portType === PORT_TYPE_INPUT)?node.inputLabels:node.outputLabels;
        if (nodePortLabels && nodePortLabels[portIndex]) {
            return nodePortLabels[portIndex];
        }
        var portLabels = (portType === PORT_TYPE_INPUT)?node._def.inputLabels:node._def.outputLabels;
        if (typeof portLabels === 'string') {
            result = portLabels;
        } else if (typeof portLabels === 'function') {
            try {
                result = portLabels.call(node,portIndex);
            } catch(err) {
                console.log("Definition error: "+node.type+"."+((portType === PORT_TYPE_INPUT)?"inputLabels":"outputLabels"),err);
                result = null;
            }
        } else if (Array.isArray(portLabels)) {
            result = portLabels[portIndex];
        }
        return result;
    }
    function showTooltip(x,y,content,direction) {
        var tooltip = eventLayer.append("g")
            .attr("transform","translate("+x+","+y+")")
            .attr("class","red-ui-flow-port-tooltip");

        // First check for a user-provided newline - "\\n "
        var newlineIndex = content.indexOf("\\n ");
        if (newlineIndex > -1 && content[newlineIndex-1] !== '\\') {
            content = content.substring(0,newlineIndex)+"...";
        }

        var lines = content.split("\n");
        var labelWidth = 6;
        var labelHeight = 12;
        var labelHeights = [];
        var lineHeight = 0;
        lines.forEach(function(l,i) {
            var labelDimensions = calculateTextDimensions(l||"&nbsp;", "red-ui-flow-port-tooltip-label");
            labelWidth = Math.max(labelWidth,labelDimensions[0] + 14);
            labelHeights.push(labelDimensions[1]);
            if (i === 0) {
                lineHeight = labelDimensions[1];
            }
            labelHeight += labelDimensions[1];
        });
        var labelWidth1 = (labelWidth/2)-5-2;
        var labelWidth2 = labelWidth - 4;

        var labelHeight1 = (labelHeight/2)-5-2;
        var labelHeight2 = labelHeight - 4;
        var path;
        var lx;
        var ly = -labelHeight/2;
        var anchor;
        if (direction === "left") {
            path = "M0 0 l -5 -5 v -"+(labelHeight1)+" q 0 -2 -2 -2 h -"+labelWidth+" q -2 0 -2 2 v "+(labelHeight2)+" q 0 2 2 2 h "+labelWidth+" q 2 0 2 -2 v -"+(labelHeight1)+" l 5 -5";
            lx = -14;
            anchor = "end";
        } else if (direction === "right") {
            path = "M0 0 l 5 -5 v -"+(labelHeight1)+" q 0 -2 2 -2 h "+labelWidth+" q 2 0 2 2 v "+(labelHeight2)+" q 0 2 -2 2 h -"+labelWidth+" q -2 0 -2 -2 v -"+(labelHeight1)+" l -5 -5"
            lx = 14;
            anchor = "start";
        } else if (direction === "top") {
            path = "M0 0 l 5 -5 h "+(labelWidth1)+" q 2 0 2 -2 v -"+labelHeight+" q 0 -2 -2 -2 h -"+(labelWidth2)+" q -2 0 -2 2 v "+labelHeight+" q 0 2 2 2 h "+(labelWidth1)+" l 5 5"
            lx = -labelWidth/2 + 6;
            ly = -labelHeight-lineHeight+12;
            anchor = "start";
        }
        tooltip.append("path").attr("d",path);
        lines.forEach(function(l,i) {
            ly += labelHeights[i];
            // tooltip.append("path").attr("d","M "+(lx-10)+" "+ly+" l 20 0 m -10 -5 l 0 10 ").attr('r',2).attr("stroke","#f00").attr("stroke-width","1").attr("fill","none")
            tooltip.append("svg:text").attr("class","red-ui-flow-port-tooltip-label")
                .attr("x", lx)
                .attr("y", ly)
                .attr("text-anchor",anchor)
                .text(l||" ")
        });
        return tooltip;
    }

    function portMouseOver(port,d,portType,portIndex) {
        if (mouse_mode === RED.state.SELECTING_NODE) {
            d3.event.stopPropagation();
            return;
        }
        clearTimeout(portLabelHoverTimeout);
        var active = (mouse_mode!=RED.state.JOINING && mouse_mode != RED.state.QUICK_JOINING) || // Not currently joining - all ports active
                     (
                         drag_lines.length > 0 && // Currently joining
                         drag_lines[0].portType !== portType && // INPUT->OUTPUT OUTPUT->INPUT
                         (
                             !drag_lines[0].virtualLink || // Not a link wire
                             (drag_lines[0].node.type === 'link in' && d.type === 'link out') ||
                             (drag_lines[0].node.type === 'link out' && d.type === 'link in')
                         )
                     )

        if (active && ((portType === PORT_TYPE_INPUT && ((d._def && d._def.inputLabels)||d.inputLabels)) || (portType === PORT_TYPE_OUTPUT && ((d._def && d._def.outputLabels)||d.outputLabels)))) {
            portLabelHoverTimeout = setTimeout(function() {
                const n = port && port.node()
                const nId = n && n.__data__ && n.__data__.id
                //check see if node has been deleted since timeout started
                if(!n || !n.parentNode || !RED.nodes.node(n.__data__.id)) {
                    return; //node is gone!
                }
                var tooltip = getPortLabel(d,portType,portIndex);
                if (!tooltip) {
                    return;
                }
                var pos = getElementPosition(n);
                portLabelHoverTimeout = null;
                portLabelHover = showTooltip(
                    (pos[0]+(portType===PORT_TYPE_INPUT?-2:12)),
                    (pos[1]+5),
                    tooltip,
                    portType===PORT_TYPE_INPUT?"left":"right"
                );
            },500);
        }
        port.classed("red-ui-flow-port-hovered",active);
    }
    function portMouseOut(port,d,portType,portIndex) {
        if (mouse_mode === RED.state.SELECTING_NODE) {
            d3.event.stopPropagation();
            return;
        }
        clearTimeout(portLabelHoverTimeout);
        if (portLabelHover) {
            portLabelHover.remove();
            portLabelHover = null;
        }
        port.classed("red-ui-flow-port-hovered",false);
    }

    function junctionMouseOver(junction, d, portType) {
        var active = (portType === undefined) ||
                     (mouse_mode !== RED.state.JOINING && mouse_mode !== RED.state.QUICK_JOINING) ||
                     (drag_lines.length > 0 && drag_lines[0].portType !== portType && !drag_lines[0].virtualLink)
        junction.classed("red-ui-flow-junction-hovered", active);
    }
    function junctionMouseOut(junction, d) {
        junction.classed("red-ui-flow-junction-hovered",false);
    }

    function prepareDrag(mouse) {
        mouse_mode = RED.state.MOVING;
        // Called when movingSet should be prepared to be dragged
        for (i=0;i<movingSet.length();i++) {
            var msn = movingSet.get(i);
            msn.ox = msn.n.x;
            msn.oy = msn.n.y;
            msn.dx = msn.n.x-mouse[0];
            msn.dy = msn.n.y-mouse[1];
        }
        try {
            mouse_offset = d3.mouse(document.body);
            if (isNaN(mouse_offset[0])) {
                mouse_offset = d3.touches(document.body)[0];
            }
        } catch(err) {
            mouse_offset = [0,0]
        }
    }

    function nodeMouseUp(d) {
        if (RED.view.DEBUG) { console.warn("nodeMouseUp", mouse_mode,d); }
        if (mouse_mode === RED.state.SELECTING_NODE) {
            d3.event.stopPropagation();
            return;
        }
        if (dblClickPrimed && mousedown_node == d && clickElapsed > 0 && clickElapsed < dblClickInterval) {
            mouse_mode = RED.state.DEFAULT;
            if (RED.workspaces.isLocked()) {
                clickElapsed = 0;
                d3.event.stopPropagation();
                return
            }
            // Avoid dbl click causing text selection.
            d3.event.preventDefault()
            document.getSelection().removeAllRanges()
            if (d.type != "subflow") {
                if (/^subflow:/.test(d.type) && isControlPressed(d3.event)) {
                    RED.workspaces.show(d.type.substring(8));
                } else {
                    RED.editor.edit(d);
                }
            } else {
                RED.editor.editSubflow(activeSubflow);
            }
            clickElapsed = 0;
            d3.event.stopPropagation();
            return;
        }
        if (mouse_mode === RED.state.MOVING) {
            // Moving primed, but not active.
            if (!groupNodeSelectPrimed && !d.selected && d.g && RED.nodes.group(d.g).selected) {
                clearSelection();

                selectedGroups.add(RED.nodes.group(d.g), false);

                mousedown_node.selected = true;
                movingSet.add(mousedown_node);
                var mouse = d3.touches(this)[0]||d3.mouse(this);
                mouse[0] += d.x-d.w/2;
                mouse[1] += d.y-d.h/2;
                prepareDrag(mouse);
                updateSelection();
                return;
            }
        }

        groupNodeSelectPrimed = false;

        var direction = d._def? (d.inputs > 0 ? 1: 0) : (d.direction == "in" ? 0: 1)
        var wasJoining = false;
        if (mouse_mode === RED.state.JOINING || mouse_mode === RED.state.QUICK_JOINING) {
            wasJoining = true;
            if (drag_lines.length > 0) {
                if (drag_lines[0].virtualLink) {
                    if (d.type === 'link in') {
                        direction = 1;
                    } else if (d.type === 'link out') {
                        direction = 0;
                    }
                } else {
                    if (drag_lines[0].portType === 1) {
                        direction = PORT_TYPE_OUTPUT;
                    } else {
                        direction = PORT_TYPE_INPUT;
                    }
                }
            }
        }

        portMouseUp(d, direction, 0);
        if (wasJoining) {
            d3.selectAll(".red-ui-flow-port-hovered").classed("red-ui-flow-port-hovered",false);
        }
    }
    function nodeMouseDown(d) {
        if (RED.view.DEBUG) { console.warn("nodeMouseDown", mouse_mode,d); }
        focusView();
        RED.contextMenu.hide();
        if (d3.event.button === 1) {
            return;
        }
        //var touch0 = d3.event;
        //var pos = [touch0.pageX,touch0.pageY];
        //RED.touch.radialMenu.show(d3.select(this),pos);
        if (mouse_mode == RED.state.IMPORT_DRAGGING || mouse_mode == RED.state.DETACHED_DRAGGING) {
            var historyEvent = RED.history.peek();
             // Check to see if we're dropping into a group
             const {
                addedToGroup,
                removedFromGroup,
                groupMoveEvent,
                rehomedNodes
            } = addMovingSetToGroup()

            if (activeSpliceLink) {
                var linkToSplice = d3.select(activeSpliceLink).data()[0];
                spliceLink(linkToSplice, movingSet.get(0).n, historyEvent)
                updateActiveNodes();
            }
            if (mouse_mode == RED.state.DETACHED_DRAGGING) {
                // Create two lists of nodes:
                //  - nodes that have moved without changing group
                //  - nodes that have moved AND changed group
                const ns = [];
                const rehomedNodeList = [];
                for (var j=0;j<movingSet.length();j++) {
                    var n = movingSet.get(j);
                    if (n.ox !== n.n.x || n.oy !== n.n.y) {
                        ns.push({n:n.n,ox:n.ox,oy:n.oy,moved:n.n.moved});
                        n.n.dirty = true;
                        n.n.moved = true;
                    }
                }
                var event = {
                    t: "multi",
                    events: [
                        historyEvent,
                        { t: "move", nodes: ns }
                    ],
                    dirty: historyEvent.dirty
                };
                if (groupMoveEvent) {
                    event.events.push(groupMoveEvent);
                }
                RED.history.replace(event)
            } else if (groupMoveEvent) {
                var event = { t:"multi", events: [historyEvent, groupMoveEvent], dirty: true};
                RED.history.replace(event);
            }

            updateSelection();
            RED.nodes.dirty(true);
            redraw();
            if (clipboardSource === 'cut') {
                clipboardSource = 'copy'
            }
            resetMouseVars();
            d3.event.stopPropagation();
            return;
        } else if (mouse_mode == RED.state.QUICK_JOINING) {
            d3.event.stopPropagation();
            return;
        } else if (mouse_mode === RED.state.SELECTING_NODE) {
            d3.event.stopPropagation();
            if (d.type === 'junction') {
                return
            }
            if (selectNodesOptions.single) {
                selectNodesOptions.done(d);
                return;
            }
            if (d.selected) {
                d.selected = false;
                movingSet.remove(d);
            } else {
                if (!selectNodesOptions.filter || selectNodesOptions.filter(d)) {
                    d.selected = true;
                    movingSet.add(d);
                }
            }
            d.dirty = true;
            redraw();
            // if (selectNodesOptions && selectNodesOptions.onselect) {
            //     selectNodesOptions.onselect(moving_set.map(function(n) { return n.n;}))
            // }
            return;
        }

        mousedown_node = d;

        var now = Date.now();
        clickElapsed = now-clickTime;
        clickTime = now;
        dblClickPrimed = lastClickNode == mousedown_node &&
            (d3.event.touches || d3.event.button === 0) &&
            !d3.event.shiftKey && !d3.event.altKey &&
            clickElapsed < dblClickInterval &&
            d.type !== 'junction'
        lastClickNode = mousedown_node;
     
        if (d.selected && isControlPressed(d3.event)) {
            mousedown_node.selected = false;
            movingSet.remove(mousedown_node);
        } else {
            if (d3.event.shiftKey) {
                if (!isControlPressed(d3.event)) {
                    clearSelection();
                }
                var clickPosition = (d3.event.offsetX/scaleFactor - mousedown_node.x)
                var edgeDelta = ((mousedown_node.w||10)/2) - Math.abs(clickPosition);
                var cnodes;
                var targetEdgeDelta = mousedown_node.w > 30 ? 25 : (mousedown_node.w > 0 ? 8 : 3);
                if (edgeDelta < targetEdgeDelta) {
                    if (clickPosition < 0) {
                        cnodes = [mousedown_node].concat(RED.nodes.getAllUpstreamNodes(mousedown_node));
                    } else {
                        cnodes = [mousedown_node].concat(RED.nodes.getAllDownstreamNodes(mousedown_node));
                    }
                } else {
                    cnodes = RED.nodes.getAllFlowNodes(mousedown_node);
                }
                for (var n=0;n<cnodes.length;n++) {
                    cnodes[n].selected = true;
                    cnodes[n].dirty = true;
                    movingSet.add(cnodes[n]);
                }
            } else if (!d.selected) {
                if (!d3.event.ctrlKey && !d3.event.metaKey) {
                    clearSelection();
                }
                mousedown_node.selected = true;
                movingSet.add(mousedown_node);
            }
            // selectedLinks.clear();
            if (d3.event.button != 2) {
                var mouse = d3.touches(this)[0]||d3.mouse(this);
                mouse[0] += d.x-d.w/2;
                mouse[1] += d.y-d.h/2;
                prepareDrag(mouse);
            }
        }
        d.dirty = true;
        updateSelection();
        redraw();
        d3.event.stopPropagation();
    }
    function nodeTouchStart(d) {
        if (RED.view.DEBUG) { console.warn("nodeTouchStart", mouse_mode,d); }
        var obj = d3.select(this);
        var touch0 = d3.event.touches.item(0);
        var pos = [touch0.pageX,touch0.pageY];
        startTouchCenter = [touch0.pageX,touch0.pageY];
        startTouchDistance = 0;
        touchStartTime = setTimeout(function() {
            showTouchMenu(obj,pos);
        },touchLongPressTimeout);
        nodeMouseDown.call(this,d)
        d3.event.preventDefault();
    }
    function nodeTouchEnd(d) {
        if (RED.view.DEBUG) { console.warn("nodeTouchEnd", mouse_mode,d); }
        d3.event.preventDefault();
        clearTimeout(touchStartTime);
        touchStartTime = null;
        if  (RED.touch.radialMenu.active()) {
            d3.event.stopPropagation();
            return;
        }
        nodeMouseUp.call(this,d);
    }

    function nodeMouseOver(d) {
        if (RED.view.DEBUG) { console.warn("nodeMouseOver", mouse_mode,d); }
        if (mouse_mode === 0 || mouse_mode === RED.state.SELECTING_NODE) {
            if (mouse_mode === RED.state.SELECTING_NODE && selectNodesOptions && selectNodesOptions.filter) {
                if (selectNodesOptions.filter(d)) {
                    this.parentNode.classList.add("red-ui-flow-node-hovered");
                }
            } else {
                this.parentNode.classList.add("red-ui-flow-node-hovered");
            }
            clearTimeout(portLabelHoverTimeout);
            if (d.hasOwnProperty('l')?!d.l : (d.type === "link in" || d.type === "link out")) {
                var parentNode = this.parentNode;
                portLabelHoverTimeout = setTimeout(function() {
                    //check see if node has been deleted since timeout started
                    if(!parentNode || !parentNode.parentNode || !RED.nodes.node(parentNode.id)) {
                        return; //node is gone!
                    }
                    var tooltip;
                    if (d._def.label) {
                        tooltip = d._def.label;
                        try {
                            tooltip = (typeof tooltip === "function" ? tooltip.call(d) : tooltip)||"";
                        } catch(err) {
                            console.log("Definition error: "+d.type+".label",err);
                            tooltip = d.type;
                        }
                    }
                    if (tooltip !== "") {
                        var pos = getElementPosition(parentNode);
                        portLabelHoverTimeout = null;
                        portLabelHover = showTooltip(
                            (pos[0] + d.w/2),
                            (pos[1]-1),
                            tooltip,
                            "top"
                        );
                    }
                },500);
            }
        } else if (mouse_mode === RED.state.JOINING || mouse_mode === RED.state.QUICK_JOINING) {
            if (drag_lines.length > 0) {
                var selectClass;
                var portType;
                if ((drag_lines[0].virtualLink && drag_lines[0].portType === PORT_TYPE_INPUT) || drag_lines[0].portType === PORT_TYPE_OUTPUT) {
                    selectClass = ".red-ui-flow-port-input .red-ui-flow-port";
                    portType = PORT_TYPE_INPUT;
                } else {
                    selectClass = ".red-ui-flow-port-output .red-ui-flow-port";
                    portType = PORT_TYPE_OUTPUT;
                }
                portMouseOver(d3.select(this.parentNode).selectAll(selectClass),d,portType,0);
            }
        }
    }
    function nodeMouseOut(d) {
        if (RED.view.DEBUG) { console.warn("nodeMouseOut", mouse_mode,d); }
        this.parentNode.classList.remove("red-ui-flow-node-hovered");
        clearTimeout(portLabelHoverTimeout);
        if (portLabelHover) {
            portLabelHover.remove();
            portLabelHover = null;
        }
        if (mouse_mode === RED.state.JOINING || mouse_mode === RED.state.QUICK_JOINING) {
            if (drag_lines.length > 0) {
                var selectClass;
                var portType;
                if ((drag_lines[0].virtualLink && drag_lines[0].portType === PORT_TYPE_INPUT) || drag_lines[0].portType === PORT_TYPE_OUTPUT) {
                    selectClass = ".red-ui-flow-port-input .red-ui-flow-port";
                    portType = PORT_TYPE_INPUT;
                } else {
                    selectClass = ".red-ui-flow-port-output .red-ui-flow-port";
                    portType = PORT_TYPE_OUTPUT;
                }
                portMouseOut(d3.select(this.parentNode).selectAll(selectClass),d,portType,0);
            }
        }
    }

    function portMouseDownProxy(e) {  portMouseDown(this.__data__,this.__portType__,this.__portIndex__, e); }
    function portTouchStartProxy(e) { portMouseDown(this.__data__,this.__portType__,this.__portIndex__, e); e.preventDefault() }
    function portMouseUpProxy(e) { portMouseUp(this.__data__,this.__portType__,this.__portIndex__, e); }
    function portTouchEndProxy(e) { portMouseUp(this.__data__,this.__portType__,this.__portIndex__, e); e.preventDefault() }
    function portMouseOverProxy(e) { portMouseOver(d3.select(this), this.__data__,this.__portType__,this.__portIndex__, e); }
    function portMouseOutProxy(e) { portMouseOut(d3.select(this), this.__data__,this.__portType__,this.__portIndex__, e); }

    function junctionMouseOverProxy(e) { junctionMouseOver(d3.select(this), this.__data__, this.__portType__) }
    function junctionMouseOutProxy(e) { junctionMouseOut(d3.select(this), this.__data__) }

    function linkMouseDown(d) {
        if (RED.view.DEBUG) {
            console.warn("linkMouseDown", { mouse_mode, point: d3.mouse(this), event: d3.event });
        }
        RED.contextMenu.hide();
        if (mouse_mode === RED.state.SELECTING_NODE) {
            d3.event.stopPropagation();
            return;
        }
        if (d3.event.button === 2) {
            return
        }
        mousedown_link = d;

        if (!isControlPressed(d3.event)) {
            clearSelection();
        }
        if (isControlPressed(d3.event)) {
            if (!selectedLinks.has(mousedown_link)) {
                selectedLinks.add(mousedown_link);
            } else {
                if (selectedLinks.length() !== 1) {
                    selectedLinks.remove(mousedown_link);
                }
            }
        } else {
            selectedLinks.add(mousedown_link);
        }
        updateSelection();
        redraw();
        focusView();
        d3.event.stopPropagation();
        if (!mousedown_link.link && movingSet.length() === 0 && (d3.event.touches || d3.event.button === 0) && selectedLinks.length() === 1 && selectedLinks.has(mousedown_link) && isControlPressed(d3.event)) {
            d3.select(this).classed("red-ui-flow-link-splice",true);
            var point = d3.mouse(this);
            var clickedGroup = getGroupAt(point[0],point[1]);
            showQuickAddDialog({position:point, splice:mousedown_link, group:clickedGroup});
        }
    }
    function linkTouchStart(d) {
        if (mouse_mode === RED.state.SELECTING_NODE) {
            d3.event.stopPropagation();
            return;
        }
        mousedown_link = d;
        clearSelection();
        selectedLinks.clear();
        selectedLinks.add(mousedown_link);
        updateSelection();
        redraw();
        focusView();
        d3.event.stopPropagation();

        var obj = d3.select(document.body);
        var touch0 = d3.event.touches.item(0);
        var pos = [touch0.pageX,touch0.pageY];
        touchStartTime = setTimeout(function() {
            touchStartTime = null;
            showTouchMenu(obj,pos);
        },touchLongPressTimeout);
        d3.event.preventDefault();
    }

    function groupMouseUp(g) {
        if (RED.view.DEBUG) {
            console.warn("groupMouseUp", { mouse_mode, event: d3.event });
        }
        if (RED.workspaces.isLocked()) { return }
        if (dblClickPrimed && mousedown_group == g && clickElapsed > 0 && clickElapsed < dblClickInterval) {
            mouse_mode = RED.state.DEFAULT;
            RED.editor.editGroup(g);
            d3.event.stopPropagation();
            return;
        }

    }

    function groupMouseDown(g) {
        var mouse = d3.touches(this.parentNode)[0]||d3.mouse(this.parentNode);
        // if (! (mouse[0] < g.x+10 || mouse[0] > g.x+g.w-10 || mouse[1] < g.y+10 || mouse[1] > g.y+g.h-10) ) {
        //     return
        // }

        if (RED.view.DEBUG) {
            console.warn("groupMouseDown", { mouse_mode, point: mouse, event: d3.event });
        }
        RED.contextMenu.hide();
        focusView();
        if (d3.event.button === 1) {
            return;
        }

        if (mouse_mode == RED.state.QUICK_JOINING) {
            return;
        } else if (mouse_mode === RED.state.SELECTING_NODE) {
            d3.event.stopPropagation();
            return;
        }

        mousedown_group = g;

        var now = Date.now();
        clickElapsed = now-clickTime;
        clickTime = now;

        dblClickPrimed = (
            lastClickNode == g &&
            (d3.event.touches || d3.event.button === 0) &&
            !d3.event.shiftKey && !d3.event.metaKey && !d3.event.altKey && !d3.event.ctrlKey &&
            clickElapsed < dblClickInterval
        );
        lastClickNode = g;

        if (g.selected && isControlPressed(d3.event)) {
            selectedGroups.remove(g);
            d3.event.stopPropagation();
        } else {
            if (!g.selected) {
                if (!d3.event.ctrlKey && !d3.event.metaKey) {
                    clearSelection();
                }
                selectedGroups.add(g,true);//!wasSelected);
            }

            if (d3.event.button != 2) {
                var d = g.nodes[0];
                prepareDrag(mouse);
                mousedown_group.dx = mousedown_group.x - mouse[0];
                mousedown_group.dy = mousedown_group.y - mouse[1];
            }
        }

        updateSelection();
        redraw();
        d3.event.stopPropagation();
    }

    function getGroupAt(x, y, ignoreSelected) {
        // x,y expected to be in node-co-ordinate space
        var candidateGroups = {};
        for (var i=0;i<activeGroups.length;i++) {
            var g = activeGroups[i];
            if (ignoreSelected && movingSet.has(g)) {
                // When ignoreSelected is set, do not match any group in the
                // current movingSet. This is used when dragging a selection
                // to find a candidate group for adding the selection to
                continue
            }
            if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) {
                candidateGroups[g.id] = g;
            }
        }
        var ids = Object.keys(candidateGroups);
        if (ids.length > 1) {
            ids.forEach(function(id) {
                if (candidateGroups[id] && candidateGroups[id].g) {
                    delete candidateGroups[candidateGroups[id].g]
                }
            })
            ids = Object.keys(candidateGroups);
        }
        if (ids.length === 0) {
            return null;
        } else {
            return candidateGroups[ids[ids.length-1]]
        }
    }

    function isButtonEnabled(d) {
        var buttonEnabled = true;
        var ws = RED.nodes.workspace(RED.workspaces.active());
        if (ws && !ws.disabled && !d.d && !ws.locked) {
            if (d._def.button.hasOwnProperty('enabled')) {
                if (typeof d._def.button.enabled === "function") {
                    buttonEnabled = d._def.button.enabled.call(d);
                } else {
                    buttonEnabled = d._def.button.enabled;
                }
            }
        } else {
            buttonEnabled = false;
        }
        return buttonEnabled;
    }

    function nodeButtonClicked(d) {
        if (mouse_mode === RED.state.SELECTING_NODE) {
            if (d3.event) {
                d3.event.stopPropagation();
            }
            return;
        }
        var activeWorkspace = RED.workspaces.active();
        var ws = RED.nodes.workspace(activeWorkspace);
        if (ws && !ws.disabled && !d.d && !ws.locked) {
            if (d._def.button.toggle) {
                d[d._def.button.toggle] = !d[d._def.button.toggle];
                d.dirty = true;
            }
            if (d._def.button.onclick) {
                try {
                    d._def.button.onclick.call(d);
                } catch(err) {
                    console.log("Definition error: "+d.type+".onclick",err);
                }
            }
            if (d.dirty) {
                redraw();
            }
        } else if (!ws || !ws.locked){
            if (activeSubflow) {
                RED.notify(RED._("notification.warning", {message:RED._("notification.warnings.nodeActionDisabledSubflow")}),"warning");
            } else {
                RED.notify(RED._("notification.warning", {message:RED._("notification.warnings.nodeActionDisabled")}),"warning");
            }
        }
        if (d3.event) {
            d3.event.preventDefault();
        }
    }

    function showTouchMenu(obj,pos) {
        var mdn = mousedown_node;
        var options = [];
        const isActiveLocked = RED.workspaces.isLocked()
        options.push({name:"delete",disabled:(isActiveLocked || movingSet.length()===0 && selectedLinks.length() === 0),onselect:function() {deleteSelection();}});
        options.push({name:"cut",disabled:(isActiveLocked || movingSet.length()===0),onselect:function() {copySelection(true);deleteSelection();}});
        options.push({name:"copy",disabled:(isActiveLocked || movingSet.length()===0),onselect:function() {copySelection();}});
        options.push({name:"paste",disabled:(isActiveLocked || clipboard.length===0),onselect:function() {importNodes(clipboard, {generateIds: true, touchImport: true});}});
        options.push({name:"edit",disabled:(isActiveLocked || movingSet.length() != 1),onselect:function() { RED.editor.edit(mdn);}});
        options.push({name:"select",onselect:function() {selectAll();}});
        options.push({name:"undo",disabled:(RED.history.depth() === 0),onselect:function() {RED.history.pop();}});
        options.push({name:"add",disabled:isActiveLocked, onselect:function() {
            chartPos = chart.offset();
            showQuickAddDialog({
                position:[pos[0]-chartPos.left+chart.scrollLeft(),pos[1]-chartPos.top+chart.scrollTop()],
                touchTrigger:true
            })
        }});

        RED.touch.radialMenu.show(obj,pos,options);
        resetMouseVars();
    }

    function createIconAttributes(iconUrl, icon_group, d) {
        var fontAwesomeUnicode = null;
        if (iconUrl.indexOf("font-awesome/") === 0) {
            var iconName = iconUrl.substr(13);
            var fontAwesomeUnicode = RED.nodes.fontAwesome.getIconUnicode(iconName);
            if (!fontAwesomeUnicode) {
                var iconPath = RED.utils.getDefaultNodeIcon(d._def, d);
                iconUrl = RED.settings.apiRootUrl+"icons/"+iconPath.module+"/"+iconPath.file;
            }
        }
        if (fontAwesomeUnicode) {
            // Since Node-RED workspace uses SVG, i tag cannot be used for font-awesome icon.
            // On SVG, use text tag as an alternative.
            icon_group.append("text")
                .attr("xlink:href",iconUrl)
                .attr("class","fa-lg")
                .attr("x",15)
                .text(fontAwesomeUnicode);
        } else {
            var icon = icon_group.append("image")
                .style("display","none")
                .attr("xlink:href",iconUrl)
                .attr("class","red-ui-flow-node-icon")
                .attr("x",0)
                .attr("width","30")
                .attr("height","30");

            var img = new Image();
            img.src = iconUrl;
            img.onload = function() {
                if (!iconUrl.match(/\.svg$/)) {
                    var largestEdge = Math.max(img.width,img.height);
                    var scaleFactor = 1;
                    if (largestEdge > 30) {
                        scaleFactor = 30/largestEdge;
                    }
                    var width = img.width * scaleFactor;
                    if (width > 20) {
                        scaleFactor *= 20/width;
                        width = 20;
                    }
                    var height = img.height * scaleFactor;
                    icon.attr("width",width);
                    icon.attr("height",height);
                    icon.attr("x",15-width/2);
                    icon.attr("y",(30-height)/2);
                }
                icon.attr("xlink:href",iconUrl);
                icon.style("display",null);
                //if ("right" == d._def.align) {
                //    icon.attr("x",function(d){return d.w-img.width-1-(d.outputs>0?5:0);});
                //    icon_shade.attr("x",function(d){return d.w-30});
                //    icon_shade_border.attr("d",function(d){return "M "+(d.w-30)+" 1 l 0 "+(d.h-2);});
                //}
            }
        }
    }

    function redrawStatus(d,nodeEl) {
        if (d.z !== RED.workspaces.active()) {
            return;
        }
        if (!nodeEl) {
            nodeEl = document.getElementById(d.id);
        }
        if (nodeEl) {
            // Do not show node status if:
            // - global flag set
            // - node has no status
            // - node is disabled
            if (!showStatus || !d.status || d.d === true) {
                nodeEl.__statusGroup__.style.display = "none";
            } else {
                nodeEl.__statusGroup__.style.display = "inline";
                let backgroundWidth = 15
                var fill = status_colours[d.status.fill]; // Only allow our colours for now
                if (d.status.shape == null && fill == null) {
                    backgroundWidth = 0
                    nodeEl.__statusShape__.style.display = "none";
                    nodeEl.__statusBackground__.setAttribute("x", 17)
                    nodeEl.__statusGroup__.setAttribute("transform","translate(-14,"+(d.h+3)+")");
                } else {
                    nodeEl.__statusGroup__.setAttribute("transform","translate(3,"+(d.h+3)+")");
                    var statusClass = "red-ui-flow-node-status-"+(d.status.shape||"dot")+"-"+d.status.fill;
                    nodeEl.__statusShape__.style.display = "inline";
                    nodeEl.__statusShape__.setAttribute("class","red-ui-flow-node-status "+statusClass);
                    nodeEl.__statusBackground__.setAttribute("x", 3)
                }
                if (d.status.hasOwnProperty('text')) {
                    nodeEl.__statusLabel__.textContent = d.status.text;
                } else {
                    nodeEl.__statusLabel__.textContent = "";
                }
                const textSize = nodeEl.__statusLabel__.getBBox()
                backgroundWidth += textSize.width
                if (backgroundWidth > 0 && textSize.width > 0) {
                    backgroundWidth += 6
                }
                nodeEl.__statusBackground__.setAttribute('width', backgroundWidth)
            }
            delete d.dirtyStatus;
        }
    }

    var pendingRedraw;

    function redraw() {
        if (RED.view.DEBUG_SYNC_REDRAW) {
            _redraw();
        } else {
            if (pendingRedraw) {
                cancelAnimationFrame(pendingRedraw);
            }
            pendingRedraw = requestAnimationFrame(_redraw);
        }
    }

    function _redraw() {
        eventLayer.attr("transform","scale("+scaleFactor+")");
        outer.attr("width", space_width*scaleFactor).attr("height", space_height*scaleFactor);

        // Don't bother redrawing nodes if we're drawing links
        if (showAllLinkPorts !== -1 || mouse_mode != RED.state.JOINING) {

            var dirtyNodes = {};

            if (activeSubflow) {
                var subflowOutputs = nodeLayer.selectAll(".red-ui-flow-subflow-port-output").data(activeSubflow.out,function(d,i){ return d.id;});
                subflowOutputs.exit().remove();
                var outGroup = subflowOutputs.enter().insert("svg:g").attr("class","red-ui-flow-node red-ui-flow-subflow-port-output")
                outGroup.each(function(d,i) {
                    var node = d3.select(this);
                    var nodeContents = document.createDocumentFragment();

                    d.h = 40;
                    d.resize = true;
                    d.dirty = true;

                    var mainRect = document.createElementNS("http://www.w3.org/2000/svg","rect");
                    mainRect.__data__ = d;
                    mainRect.setAttribute("class", "red-ui-flow-subflow-port");
                    mainRect.setAttribute("rx", 8);
                    mainRect.setAttribute("ry", 8);
                    mainRect.setAttribute("width", 40);
                    mainRect.setAttribute("height", 40);
                    node[0][0].__mainRect__ = mainRect;
                    d3.select(mainRect)
                        .on("mouseup",nodeMouseUp)
                        .on("mousedown",nodeMouseDown)
                        .on("touchstart",nodeTouchStart)
                        .on("touchend",nodeTouchEnd)
                    nodeContents.appendChild(mainRect);

                    var output_groupEl = document.createElementNS("http://www.w3.org/2000/svg","g");
                    output_groupEl.setAttribute("x",0);
                    output_groupEl.setAttribute("y",0);
                    node[0][0].__outputLabelGroup__ = output_groupEl;

                    var output_output = document.createElementNS("http://www.w3.org/2000/svg","text");
                    output_output.setAttribute("class","red-ui-flow-port-label");
                    output_output.style["font-size"] = "10px";
                    output_output.textContent = "output";
                    output_groupEl.appendChild(output_output);
                    node[0][0].__outputOutput__ = output_output;

                    var output_number = document.createElementNS("http://www.w3.org/2000/svg","text");
                    output_number.setAttribute("class","red-ui-flow-port-label red-ui-flow-port-index");
                    output_number.setAttribute("x",0);
                    output_number.setAttribute("y",0);
                    output_number.textContent = d.i+1;
                    output_groupEl.appendChild(output_number);
                    node[0][0].__outputNumber__ = output_number;

                    var output_border = document.createElementNS("http://www.w3.org/2000/svg","path");
                    output_border.setAttribute("d","M 40 1 l 0 38")
                    output_border.setAttribute("class", "red-ui-flow-node-icon-shade-border")
                    output_groupEl.appendChild(output_border);
                    node[0][0].__outputBorder__ = output_border;

                    nodeContents.appendChild(output_groupEl);

                    var text = document.createElementNS("http://www.w3.org/2000/svg","g");
                    text.setAttribute("class","red-ui-flow-port-label");
                    text.setAttribute("transform","translate(38,0)");
                    text.setAttribute('style', 'fill : #888');  // hard coded here!
                    node[0][0].__textGroup__ = text;
                    nodeContents.append(text);

                    var portEl = document.createElementNS("http://www.w3.org/2000/svg","g");
                    portEl.setAttribute('transform','translate(-5,15)')

                    var port = document.createElementNS("http://www.w3.org/2000/svg","rect");
                    port.setAttribute("class","red-ui-flow-port");
                    port.setAttribute("rx",3);
                    port.setAttribute("ry",3);
                    port.setAttribute("width",10);
                    port.setAttribute("height",10);
                    portEl.appendChild(port);
                    port.__data__ = d;

                    d3.select(port)
                        .on("mousedown", function(d,i){portMouseDown(d,PORT_TYPE_INPUT,0);} )
                        .on("touchstart", function(d,i){portMouseDown(d,PORT_TYPE_INPUT,0);d3.event.preventDefault();} )
                        .on("mouseup", function(d,i){portMouseUp(d,PORT_TYPE_INPUT,0);})
                        .on("touchend",function(d,i){portMouseUp(d,PORT_TYPE_INPUT,0);d3.event.preventDefault();} )
                        .on("mouseover",function(d){portMouseOver(d3.select(this),d,PORT_TYPE_INPUT,0);})
                        .on("mouseout",function(d){portMouseOut(d3.select(this),d,PORT_TYPE_INPUT,0);});

                    node[0][0].__port__ = portEl
                    nodeContents.appendChild(portEl);
                    node[0][0].appendChild(nodeContents);
                });

                var subflowInputs = nodeLayer.selectAll(".red-ui-flow-subflow-port-input").data(activeSubflow.in,function(d,i){ return d.id;});
                subflowInputs.exit().remove();
                var inGroup = subflowInputs.enter().insert("svg:g").attr("class","red-ui-flow-node red-ui-flow-subflow-port-input").attr("transform",function(d) { return "translate("+(d.x-20)+","+(d.y-20)+")"});
                inGroup.each(function(d,i) {
                    d.w=40;
                    d.h=40;
                });
                inGroup.append("rect").attr("class","red-ui-flow-subflow-port").attr("rx",8).attr("ry",8).attr("width",40).attr("height",40)
                    // TODO: This is exactly the same set of handlers used for regular nodes - DRY
                    .on("mouseup",nodeMouseUp)
                    .on("mousedown",nodeMouseDown)
                    .on("touchstart",nodeTouchStart)
                    .on("touchend", nodeTouchEnd);

                inGroup.append("g").attr('transform','translate(35,15)').append("rect").attr("class","red-ui-flow-port").attr("rx",3).attr("ry",3).attr("width",10).attr("height",10)
                    .on("mousedown", function(d,i){portMouseDown(d,PORT_TYPE_OUTPUT,i);} )
                    .on("touchstart", function(d,i){portMouseDown(d,PORT_TYPE_OUTPUT,i);d3.event.preventDefault();} )
                    .on("mouseup", function(d,i){portMouseUp(d,PORT_TYPE_OUTPUT,i);})
                    .on("touchend",function(d,i){portMouseUp(d,PORT_TYPE_OUTPUT,i);d3.event.preventDefault();} )
                    .on("mouseover",function(d){portMouseOver(d3.select(this),d,PORT_TYPE_OUTPUT,0);})
                    .on("mouseout",function(d) {portMouseOut(d3.select(this),d,PORT_TYPE_OUTPUT,0);});

                inGroup.append("svg:text").attr("class","red-ui-flow-port-label").attr("x",18).attr("y",20).style("font-size","10px").text("input");

                var subflowStatus = nodeLayer.selectAll(".red-ui-flow-subflow-port-status").data(activeSubflow.status?[activeSubflow.status]:[],function(d,i){ return d.id;});
                subflowStatus.exit().remove();

                var statusGroup = subflowStatus.enter().insert("svg:g").attr("class","red-ui-flow-node red-ui-flow-subflow-port-status").attr("transform",function(d) { return "translate("+(d.x-20)+","+(d.y-20)+")"});
                statusGroup.each(function(d,i) {
                    d.w=40;
                    d.h=40;
                });
                statusGroup.append("rect").attr("class","red-ui-flow-subflow-port").attr("rx",8).attr("ry",8).attr("width",40).attr("height",40)
                    // TODO: This is exactly the same set of handlers used for regular nodes - DRY
                    .on("mouseup",nodeMouseUp)
                    .on("mousedown",nodeMouseDown)
                    .on("touchstart",nodeTouchStart)
                    .on("touchend", nodeTouchEnd);

                statusGroup.append("g").attr('transform','translate(-5,15)').append("rect").attr("class","red-ui-flow-port").attr("rx",3).attr("ry",3).attr("width",10).attr("height",10)
                    .on("mousedown", function(d,i){portMouseDown(d,PORT_TYPE_INPUT,0);} )
                    .on("touchstart", function(d,i){portMouseDown(d,PORT_TYPE_INPUT,0);d3.event.preventDefault();} )
                    .on("mouseup", function(d,i){portMouseUp(d,PORT_TYPE_INPUT,0);})
                    .on("touchend",function(d,i){portMouseUp(d,PORT_TYPE_INPUT,0);d3.event.preventDefault();} )
                    .on("mouseover",function(d){portMouseOver(d3.select(this),d,PORT_TYPE_INPUT,0);})
                    .on("mouseout",function(d){portMouseOut(d3.select(this),d,PORT_TYPE_INPUT,0);});

                statusGroup.append("svg:text").attr("class","red-ui-flow-port-label").attr("x",22).attr("y",20).style("font-size","10px").text("status");

                subflowOutputs.each(function(d,i) {
                    if (d.dirty) {

                        var port_height = 40;

                        var self = this;
                        var thisNode = d3.select(this);

                        dirtyNodes[d.id] = d;

                        var label = getPortLabel(activeSubflow, PORT_TYPE_OUTPUT, d.i) || "";
                        var hideLabel = (label.length < 1)

                        var labelParts;
                        if (d.resize || this.__hideLabel__ !== hideLabel || this.__label__ !== label) {
                            labelParts = getLabelParts(label, "red-ui-flow-node-label");
                            if (labelParts.lines.length !== this.__labelLineCount__ || this.__label__ !== label) {
                                d.resize = true;
                            }
                            this.__label__ = label;
                            this.__labelLineCount__ = labelParts.lines.length;

                            if (hideLabel) {
                                d.h = Math.max(port_height,(d.outputs || 0) * 15);
                            } else {
                                d.h = Math.max(6+24*labelParts.lines.length,(d.outputs || 0) * 15, port_height);
                            }
                            this.__hideLabel__ = hideLabel;
                        }

                        if (d.resize) {
                            var ow = d.w;
                            if (hideLabel) {
                                d.w = port_height;
                            } else {
                                d.w = Math.max(port_height,20*(Math.ceil((labelParts.width+50+7)/20)) );
                            }
                            if (ow !== undefined) {
                                d.x += (d.w-ow)/2;
                            }
                            d.resize = false;
                        }

                        this.setAttribute("transform", "translate(" + (d.x-d.w/2) + "," + (d.y-d.h/2) + ")");
                        // This might be the first redraw after a node has been click-dragged to start a move.
                        // So its selected state might have changed since the last redraw.
                        this.classList.toggle("red-ui-flow-node-selected", !!d.selected )
                        if (mouse_mode != RED.state.MOVING_ACTIVE) {
                            this.classList.toggle("red-ui-flow-node-disabled", d.d === true);
                            this.__mainRect__.setAttribute("width", d.w)
                            this.__mainRect__.setAttribute("height", d.h)
                            this.__mainRect__.classList.toggle("red-ui-flow-node-highlighted",!!d.highlighted );

                            if (labelParts) {
                                // The label has changed
                                var sa = labelParts.lines;
                                var sn = labelParts.lines.length;
                                var textLines = this.__textGroup__.childNodes;
                                while(textLines.length > sn) {
                                    textLines[textLines.length-1].remove();
                                }
                                for (var i=0; i<sn; i++) {
                                    if (i===textLines.length) {
                                        var line = document.createElementNS("http://www.w3.org/2000/svg","text");
                                        line.setAttribute("class","red-ui-flow-node-label-text");
                                        line.setAttribute("x",0);
                                        line.setAttribute("y",i*24);
                                        this.__textGroup__.appendChild(line);
                                    }
                                    textLines[i].textContent = sa[i];
                                }
                            }

                            var textClass = "red-ui-flow-node-label"+(hideLabel?" hide":"");
                            this.__textGroup__.setAttribute("class", textClass);
                            var yp = d.h / 2 - (this.__labelLineCount__ / 2) * 24 + 13;

                            // this.__textGroup__.classList.remove("red-ui-flow-node-label-right");
                            this.__textGroup__.setAttribute("transform", "translate(48,"+yp+")");

                            this.__outputBorder__.setAttribute("d","M 40 1 l 0 "+(hideLabel?0:(d.h - 2)));
                            this.__port__.setAttribute("transform","translate(-5,"+((d.h/2)-5)+")");
                            this.__outputOutput__.setAttribute("transform","translate(20,"+((d.h/2)-8)+")");
                            this.__outputNumber__.setAttribute("transform","translate(20,"+((d.h/2)+7)+")");
                            this.__outputNumber__.textContent = d.i+1;
                        }
                        d.dirty = false;
                    }
                });
                subflowInputs.each(function(d,i) {
                    if (d.dirty) {
                        var input = d3.select(this);
                        input.classed("red-ui-flow-node-selected",function(d) { return d.selected; })
                        input.attr("transform", function(d) { return "translate(" + (d.x-d.w/2) + "," + (d.y-d.h/2) + ")"; });
                        dirtyNodes[d.id] = d;
                        d.dirty = false;
                    }
                });
                subflowStatus.each(function(d,i) {
                    if (d.dirty) {
                        var output = d3.select(this);
                        output.classed("red-ui-flow-node-selected",function(d) { return d.selected; })
                        output.selectAll(".red-ui-flow-port-index").text(function(d){ return d.i+1});
                        output.attr("transform", function(d) { return "translate(" + (d.x-d.w/2) + "," + (d.y-d.h/2) + ")"; });
                        dirtyNodes[d.id] = d;
                        d.dirty = false;
                    }
                });


            } else {
                nodeLayer.selectAll(".red-ui-flow-subflow-port-output").remove();
                nodeLayer.selectAll(".red-ui-flow-subflow-port-input").remove();
                nodeLayer.selectAll(".red-ui-flow-subflow-port-status").remove();
            }

            var node = nodeLayer.selectAll(".red-ui-flow-node-group").data(activeNodes,function(d){return d.id});
            node.exit().each(function(d,i) {
                RED.hooks.trigger("viewRemoveNode",{node:d,el:this})
            }).remove();

            var nodeEnter = node.enter().insert("svg:g")
                .attr("class", "red-ui-flow-node red-ui-flow-node-group")
                .classed("red-ui-flow-subflow", activeSubflow != null);

            nodeEnter.each(function(d,i) {
                this.__outputs__ = [];
                this.__inputs__ = [];
                var node = d3.select(this);
                var nodeContents = document.createDocumentFragment();
                var isLink = (d.type === "link in" || d.type === "link out")
                var hideLabel = d.hasOwnProperty('l')?!d.l : isLink;
                node.attr("id",d.id);
                d.h = node_height;
                d.resize = true;

                if (d._def.button) {
                    var buttonGroup = document.createElementNS("http://www.w3.org/2000/svg","g");
                    buttonGroup.__data__ = d;
                    buttonGroup.setAttribute("transform", "translate("+((d._def.align == "right") ? 94 : -25)+",2)");
                    buttonGroup.setAttribute("class","red-ui-flow-node-button");
                    node[0][0].__buttonGroup__ = buttonGroup;

                    var bgBackground = document.createElementNS("http://www.w3.org/2000/svg","rect");
                    bgBackground.__data__ = d;
                    bgBackground.setAttribute("class","red-ui-flow-node-button-background");
                    bgBackground.setAttribute("rx",5);
                    bgBackground.setAttribute("ry",5);
                    bgBackground.setAttribute("width",32);
                    bgBackground.setAttribute("height",node_height-4);
                    buttonGroup.appendChild(bgBackground);
                    node[0][0].__buttonGroupBackground__ = bgBackground;

                    var bgButton = document.createElementNS("http://www.w3.org/2000/svg","rect");
                    bgButton.__data__ = d;
                    bgButton.setAttribute("class","red-ui-flow-node-button-button");
                    bgButton.setAttribute("x", d._def.align == "right"? 11:5);
                    bgButton.setAttribute("y",4);
                    bgButton.setAttribute("rx",4);
                    bgButton.setAttribute("ry",4);
                    bgButton.setAttribute("width",16);
                    bgButton.setAttribute("height",node_height-12);
                    bgButton.setAttribute("fill", RED.utils.getNodeColor(d.type,d._def));
                    d3.select(bgButton)
                        .on("mousedown",function(d) {if (!lasso && isButtonEnabled(d)) {focusView();d3.select(this).attr("fill-opacity",0.2);d3.event.preventDefault(); d3.event.stopPropagation();}})
                        .on("mouseup",function(d) {if (!lasso && isButtonEnabled(d)) { d3.select(this).attr("fill-opacity",0.4);d3.event.preventDefault();d3.event.stopPropagation();}})
                        .on("mouseover",function(d) {if (!lasso && isButtonEnabled(d)) { d3.select(this).attr("fill-opacity",0.4);}})
                        .on("mouseout",function(d) {if (!lasso && isButtonEnabled(d)) {
                            var op = 1;
                            if (d._def.button.toggle) {
                                op = d[d._def.button.toggle]?1:0.2;
                            }
                            d3.select(this).attr("fill-opacity",op);
                        }})
                        .on("click",nodeButtonClicked)
                        .on("touchstart",function(d) { nodeButtonClicked.call(this,d); d3.event.preventDefault();})
                    buttonGroup.appendChild(bgButton);
                    node[0][0].__buttonGroupButton__ = bgButton;

                    nodeContents.appendChild(buttonGroup);

                }

                var mainRect = document.createElementNS("http://www.w3.org/2000/svg","rect");
                mainRect.__data__ = d;
                mainRect.setAttribute("class", "red-ui-flow-node "+(d.type == "unknown"?"red-ui-flow-node-unknown":""));
                mainRect.setAttribute("rx", 5);
                mainRect.setAttribute("ry", 5);
                mainRect.setAttribute("fill", RED.utils.getNodeColor(d.type,d._def));
                node[0][0].__mainRect__ = mainRect;
                d3.select(mainRect)
                    .on("mouseup",nodeMouseUp)
                    .on("mousedown",nodeMouseDown)
                    .on("touchstart",nodeTouchStart)
                    .on("touchend",nodeTouchEnd)
                    .on("mouseover",nodeMouseOver)
                    .on("mouseout",nodeMouseOut);
                nodeContents.appendChild(mainRect);
                //node.append("rect").attr("class", "node-gradient-top").attr("rx", 6).attr("ry", 6).attr("height",30).attr("stroke","none").attr("fill","url(#gradient-top)").style("pointer-events","none");
                //node.append("rect").attr("class", "node-gradient-bottom").attr("rx", 6).attr("ry", 6).attr("height",30).attr("stroke","none").attr("fill","url(#gradient-bottom)").style("pointer-events","none");

                if (d._def.icon) {
                    var icon_url = RED.utils.getNodeIcon(d._def,d);
                    var icon_groupEl = document.createElementNS("http://www.w3.org/2000/svg","g");
                    icon_groupEl.__data__ = d;
                    icon_groupEl.setAttribute("class","red-ui-flow-node-icon-group"+("right" == d._def.align?" red-ui-flow-node-icon-group-right":""));
                    icon_groupEl.setAttribute("x",0);
                    icon_groupEl.setAttribute("y",0);
                    icon_groupEl.style["pointer-events"] = "none";
                    node[0][0].__iconGroup__ = icon_groupEl;
                    var icon_shade = document.createElementNS("http://www.w3.org/2000/svg","path");
                    icon_shade.setAttribute("x",0);
                    icon_shade.setAttribute("y",0);
                    icon_shade.setAttribute("class","red-ui-flow-node-icon-shade")
                    icon_groupEl.appendChild(icon_shade);
                    node[0][0].__iconShade__ = icon_shade;

                    var icon_group = d3.select(icon_groupEl)
                    createIconAttributes(icon_url, icon_group, d);

                    var icon_shade_border = document.createElementNS("http://www.w3.org/2000/svg","path");
                    icon_shade_border.setAttribute("d","right" != d._def.align ? "M 30 1 l 0 "+(d.h-2) : "M 0 1 l 0 "+(d.h-2)  )
                    icon_shade_border.setAttribute("class", "red-ui-flow-node-icon-shade-border")
                    icon_groupEl.appendChild(icon_shade_border);
                    node[0][0].__iconShadeBorder__ = icon_shade_border;

                    nodeContents.appendChild(icon_groupEl);
                }
                var text = document.createElementNS("http://www.w3.org/2000/svg","g");
                text.setAttribute("class","red-ui-flow-node-label"+(hideLabel?" hide":"")+(d._def.align?" red-ui-flow-node-label-"+d._def.align:""));
                text.setAttribute("transform","translate(38,0)");
                // text.setAttribute("dy", ".3px");
                // text.setAttribute("text-anchor",d._def.align !== "right" ? "start":"end");
                nodeContents.appendChild(text);
                node[0][0].__textGroup__ = text;

                var statusEl = document.createElementNS("http://www.w3.org/2000/svg","g");
                // statusEl.__data__ = d;
                statusEl.setAttribute("class","red-ui-flow-node-status-group");
                statusEl.style.display = "none";
                node[0][0].__statusGroup__ = statusEl;

                var statusBackground = document.createElementNS("http://www.w3.org/2000/svg","rect");
                statusBackground.setAttribute("class","red-ui-flow-node-status-background");
                statusBackground.setAttribute("x",3);
                statusBackground.setAttribute("y",-1);
                statusBackground.setAttribute("width",200);
                statusBackground.setAttribute("height",13);
                statusBackground.setAttribute("rx",2);
                statusBackground.setAttribute("ry",2);
                
                statusEl.appendChild(statusBackground);
                node[0][0].__statusBackground__ = statusBackground;


                var statusIcon = document.createElementNS("http://www.w3.org/2000/svg","rect");
                statusIcon.setAttribute("class","red-ui-flow-node-status");
                statusIcon.setAttribute("x",6);
                statusIcon.setAttribute("y",1);
                statusIcon.setAttribute("width",9);
                statusIcon.setAttribute("height",9);
                statusIcon.setAttribute("rx",2);
                statusIcon.setAttribute("ry",2);
                statusIcon.setAttribute("stroke-width","3");
                statusEl.appendChild(statusIcon);
                node[0][0].__statusShape__ = statusIcon;

                var statusLabel = document.createElementNS("http://www.w3.org/2000/svg","text");
                statusLabel.setAttribute("class","red-ui-flow-node-status-label");
                statusLabel.setAttribute("x",20);
                statusLabel.setAttribute("y",10);
                statusEl.appendChild(statusLabel);
                node[0][0].__statusLabel__ = statusLabel;

                nodeContents.appendChild(statusEl);

                node[0][0].appendChild(nodeContents);

                RED.hooks.trigger("viewAddNode",{node:d,el:this})
            });

            var nodesReordered = false;
            node.each(function(d,i) {
                if (d._reordered) {
                    nodesReordered = true;
                    delete d._reordered;
                }

                if (d.dirty) {
                    var self = this;
                    var thisNode = d3.select(this);

                    var isLink = (d.type === "link in" || d.type === "link out")
                    var hideLabel = d.hasOwnProperty('l')?!d.l : isLink;
                    dirtyNodes[d.id] = d;
                    //if (d.x < -50) deleteSelection();  // Delete nodes if dragged back to palette

                    var label = RED.utils.getNodeLabel(d, d.type);
                    var labelParts;
                    if (d.resize || this.__hideLabel__ !== hideLabel || this.__label__ !== label || this.__outputs__.length !== d.outputs) {
                        labelParts = getLabelParts(label, "red-ui-flow-node-label");
                        if (labelParts.lines.length !== this.__labelLineCount__ || this.__label__ !== label) {
                            d.resize = true;
                        }
                        this.__label__ = label;
                        this.__labelLineCount__ = labelParts.lines.length;

                        if (hideLabel) {
                            d.h = Math.max(node_height,(d.outputs || 0) * 15);
                        } else {
                            d.h = Math.max(6+24*labelParts.lines.length,(d.outputs || 0) * 15, 30);
                        }
                        this.__hideLabel__ = hideLabel;
                    }

                    if (d.resize) {
                        var ow = d.w;
                        if (hideLabel) {
                            d.w = node_height;
                        } else {
                            d.w = Math.max(node_width,20*(Math.ceil((labelParts.width+50+(d._def.inputs>0?7:0))/20)) );
                        }
                        if (ow !== undefined) {
                            d.x += (d.w-ow)/2;
                        }
                        d.resize = false;
                    }
                    if (d._colorChanged) {
                        var newColor = RED.utils.getNodeColor(d.type,d._def);
                        this.__mainRect__.setAttribute("fill",newColor);
                        if (this.__buttonGroupButton__) {
                            this.__buttonGroupButton__.settAttribute("fill",newColor);
                        }
                        delete d._colorChanged;
                    }
                    //thisNode.selectAll(".centerDot").attr({"cx":function(d) { return d.w/2;},"cy":function(d){return d.h/2}});
                    this.setAttribute("transform", "translate(" + (d.x-d.w/2) + "," + (d.y-d.h/2) + ")");
                    // This might be the first redraw after a node has been click-dragged to start a move.
                    // So its selected state might have changed since the last redraw.
                    this.classList.toggle("red-ui-flow-node-selected", !!d.selected )
                    if (mouse_mode != RED.state.MOVING_ACTIVE) {
                        this.classList.toggle("red-ui-flow-node-disabled", d.d === true);
                        this.__mainRect__.setAttribute("width", d.w)
                        this.__mainRect__.setAttribute("height", d.h)
                        this.__mainRect__.classList.toggle("red-ui-flow-node-highlighted",!!d.highlighted );

                        if (labelParts) {
                            // The label has changed
                            var sa = labelParts.lines;
                            var sn = labelParts.lines.length;
                            var textLines = this.__textGroup__.childNodes;
                            while(textLines.length > sn) {
                                textLines[textLines.length-1].remove();
                            }
                            for (var i=0; i<sn; i++) {
                                if (i===textLines.length) {
                                    var line = document.createElementNS("http://www.w3.org/2000/svg","text");
                                    line.setAttribute("class","red-ui-flow-node-label-text");
                                    line.setAttribute("x",0);
                                    line.setAttribute("y",i*24);
                                    this.__textGroup__.appendChild(line);
                                }
                                textLines[i].textContent = sa[i];
                            }
                        }

                        var textClass = "";
                        if (d._def.labelStyle) {
                            textClass = d._def.labelStyle;
                            try {
                                textClass = (typeof textClass === "function" ? textClass.call(d) : textClass)||"";
                            } catch(err) {
                                console.log("Definition error: "+d.type+".labelStyle",err);
                                textClass = "";
                            }
                            textClass = " "+textClass;
                        }
                        textClass = "red-ui-flow-node-label"+(d._def.align?" red-ui-flow-node-label-"+d._def.align:"")+textClass+(hideLabel?" hide":"");
                        this.__textGroup__.setAttribute("class", textClass);

                        var yp = d.h / 2 - (this.__labelLineCount__ / 2) * 24 + 13;

                        if ((!d._def.align && d.inputs !== 0 && d.outputs === 0) || "right" === d._def.align) {
                            if (this.__iconGroup__) {
                                this.__iconGroup__.classList.add("red-ui-flow-node-icon-group-right");
                                this.__iconGroup__.setAttribute("transform", "translate("+(d.w-30)+",0)");
                            }
                            this.__textGroup__.classList.add("red-ui-flow-node-label-right");
                            this.__textGroup__.setAttribute("transform", "translate("+(d.w-38)+","+yp+")");
                        } else {
                            if (this.__iconGroup__) {// is null for uknown nodes
                                this.__iconGroup__.classList.remove("red-ui-flow-node-icon-group-right");
                                this.__iconGroup__.setAttribute("transform", "");
                            }
                            this.__textGroup__.classList.remove("red-ui-flow-node-label-right");
                            this.__textGroup__.setAttribute("transform", "translate(38,"+yp+")");
                        }

                        var inputPorts = thisNode.selectAll(".red-ui-flow-port-input");
                        if ((!isLink || (showAllLinkPorts === -1 && !activeLinkNodes[d.id])) && d.inputs === 0 && !inputPorts.empty()) {
                            inputPorts.each(function(d,i) {
                                RED.hooks.trigger("viewRemovePort",{
                                    node:d,
                                    el:self,
                                    port:d3.select(this)[0][0],
                                    portType: "input",
                                    portIndex: 0
                                })
                            }).remove();
                        } else if (((isLink && (showAllLinkPorts===PORT_TYPE_INPUT||activeLinkNodes[d.id]))|| d.inputs === 1) && inputPorts.empty()) {
                            var inputGroup = thisNode.append("g").attr("class","red-ui-flow-port-input");
                            var inputGroupPorts;

                            if (d.type === "link in") {
                                inputGroupPorts = inputGroup.append("circle")
                                    .attr("cx",-1).attr("cy",5)
                                    .attr("r",5)
                                    .attr("class","red-ui-flow-port red-ui-flow-link-port")
                            } else {
                                inputGroupPorts = inputGroup.append("rect").attr("class","red-ui-flow-port").attr("rx",3).attr("ry",3).attr("width",10).attr("height",10)
                            }
                            inputGroup[0][0].__port__ = inputGroupPorts[0][0];
                            inputGroupPorts[0][0].__data__ = this.__data__;
                            inputGroupPorts[0][0].__portType__ = PORT_TYPE_INPUT;
                            inputGroupPorts[0][0].__portIndex__ = 0;
                            inputGroupPorts.on("mousedown",function(d){portMouseDown(d,PORT_TYPE_INPUT,0);})
                                .on("touchstart",function(d){portMouseDown(d,PORT_TYPE_INPUT,0);d3.event.preventDefault();})
                                .on("mouseup",function(d){portMouseUp(d,PORT_TYPE_INPUT,0);} )
                                .on("touchend",function(d){portMouseUp(d,PORT_TYPE_INPUT,0);d3.event.preventDefault();} )
                                .on("mouseover",function(d){portMouseOver(d3.select(this),d,PORT_TYPE_INPUT,0);})
                                .on("mouseout",function(d) {portMouseOut(d3.select(this),d,PORT_TYPE_INPUT,0);});
                            RED.hooks.trigger("viewAddPort",{node:d,el: this, port: inputGroup[0][0], portType: "input", portIndex: 0})
                        }
                        var numOutputs = d.outputs;
                        if (isLink && d.type === "link out") {
                            if (d.mode !== "return" && (showAllLinkPorts===PORT_TYPE_OUTPUT || activeLinkNodes[d.id])) {
                                numOutputs = 1;
                            } else {
                                numOutputs = 0;
                            }
                        }
                        var y = (d.h/2)-((numOutputs-1)/2)*13;

                        // Remove extra ports
                        while (this.__outputs__.length > numOutputs) {
                            var port = this.__outputs__.pop();
                            RED.hooks.trigger("viewRemovePort",{
                                node:d,
                                el:this,
                                port:port,
                                portType: "output",
                                portIndex: this.__outputs__.length
                            })
                            port.remove();
                        }
                        for(var portIndex = 0; portIndex < numOutputs; portIndex++ ) {
                            var portGroup;
                            if (portIndex === this.__outputs__.length) {
                                portGroup = document.createElementNS("http://www.w3.org/2000/svg","g");
                                portGroup.setAttribute("class","red-ui-flow-port-output");
                                var portPort;
                                if (d.type === "link out") {
                                    portPort = document.createElementNS("http://www.w3.org/2000/svg","circle");
                                    portPort.setAttribute("cx",11);
                                    portPort.setAttribute("cy",5);
                                    portPort.setAttribute("r",5);
                                    portPort.setAttribute("class","red-ui-flow-port red-ui-flow-link-port");
                                } else {
                                    portPort = document.createElementNS("http://www.w3.org/2000/svg","rect");
                                    portPort.setAttribute("rx",3);
                                    portPort.setAttribute("ry",3);
                                    portPort.setAttribute("width",10);
                                    portPort.setAttribute("height",10);
                                    portPort.setAttribute("class","red-ui-flow-port");
                                }
                                portGroup.appendChild(portPort);
                                portGroup.__port__ = portPort;
                                portPort.__data__ = this.__data__;
                                portPort.__portType__ = PORT_TYPE_OUTPUT;
                                portPort.__portIndex__ = portIndex;
                                portPort.addEventListener("mousedown", portMouseDownProxy);
                                portPort.addEventListener("touchstart", portTouchStartProxy);
                                portPort.addEventListener("mouseup", portMouseUpProxy);
                                portPort.addEventListener("touchend", portTouchEndProxy);
                                portPort.addEventListener("mouseover", portMouseOverProxy);
                                portPort.addEventListener("mouseout", portMouseOutProxy);

                                this.appendChild(portGroup);
                                this.__outputs__.push(portGroup);
                                RED.hooks.trigger("viewAddPort",{node:d,el: this, port: portGroup, portType: "output", portIndex: portIndex})
                            } else {
                                portGroup = this.__outputs__[portIndex];
                            }
                            var x = d.w - 5;
                            var y = (d.h/2)-((numOutputs-1)/2)*13;
                            portGroup.setAttribute("transform","translate("+x+","+((y+13*portIndex)-5)+")")
                        }
                        if (d._def.icon) {
                            var icon = thisNode.select(".red-ui-flow-node-icon");
                            var faIcon = thisNode.select(".fa-lg");
                            var current_url;
                            if (!icon.empty()) {
                                current_url = icon.attr("xlink:href");
                            } else {
                                current_url = faIcon.attr("xlink:href");
                            }
                            var new_url = RED.utils.getNodeIcon(d._def,d);
                            if (new_url !== current_url) {
                                if (!icon.empty()) {
                                    icon.remove();
                                } else {
                                    faIcon.remove();
                                }
                                var iconGroup = thisNode.select(".red-ui-flow-node-icon-group");
                                createIconAttributes(new_url, iconGroup, d);
                                icon = thisNode.select(".red-ui-flow-node-icon");
                                faIcon = thisNode.select(".fa-lg");
                            }

                            icon.attr("y",function(){return (d.h-d3.select(this).attr("height"))/2;});


                            const iconShadeHeight = d.h
                            const iconShadeWidth = 30
                            this.__iconShade__.setAttribute("d", hideLabel ?
                                `M5 0 h${iconShadeWidth-10} a 5 5 0 0 1 5 5 v${iconShadeHeight-10} a 5 5 0 0 1 -5 5 h-${iconShadeWidth-10} a 5 5 0 0 1 -5 -5  v-${iconShadeHeight-10} a 5 5 0 0 1 5 -5` : (
                                    "right" === d._def.align ?
                                    `M 0 0 h${iconShadeWidth-5} a 5 5 0 0 1 5 5 v${iconShadeHeight-10} a 5 5 0 0 1 -5 5 h-${iconShadeWidth-5} v-${iconShadeHeight}` :
                                    `M5 0 h${iconShadeWidth-5} v${iconShadeHeight} h-${iconShadeWidth-5} a 5 5 0 0 1 -5 -5  v-${iconShadeHeight-10} a 5 5 0 0 1 5 -5`
                                    )
                            )
                            this.__iconShadeBorder__.style.display = hideLabel?'none':''
                            this.__iconShadeBorder__.setAttribute("d",
                                                                  "M " + (((!d._def.align && d.inputs !== 0 && d.outputs === 0) || "right" === d._def.align) ? 0.5 : 29.5) + " "+(d.selected?1:0.5)+" l 0 " + (d.h - (d.selected?2:1))
                                                                 );
                            faIcon.attr("y",(d.h+13)/2);
                        }
                        // this.__changeBadge__.setAttribute("transform", "translate("+(d.w-10)+", -2)");
                        // this.__changeBadge__.classList.toggle("hide", !(d.changed||d.moved));
                        // this.__errorBadge__.setAttribute("transform", "translate("+(d.w-10-((d.changed||d.moved)?14:0))+", -2)");
                        // this.__errorBadge__.classList.toggle("hide", d.valid);

                        thisNode.selectAll(".red-ui-flow-port-input").each(function(d,i) {
                            var port = d3.select(this);
                            port.attr("transform",function(d){return "translate(-5,"+((d.h/2)-5)+")";})
                        });

                        if (d._def.button) {
                            var buttonEnabled = isButtonEnabled(d);
                            this.__buttonGroup__.classList.toggle("red-ui-flow-node-button-disabled", !buttonEnabled);
                            if (RED.runtime && RED.runtime.started !== undefined) {
                                this.__buttonGroup__.classList.toggle("red-ui-flow-node-button-stopped", !RED.runtime.started);
                            }

                            var x = d._def.align == "right"?d.w-6:-25;
                            if (d._def.button.toggle && !d[d._def.button.toggle]) {
                                x = x - (d._def.align == "right"?8:-8);
                            }
                            this.__buttonGroup__.setAttribute("transform", "translate("+x+",2)");

                            if (d._def.button.toggle) {
                                this.__buttonGroupButton__.setAttribute("fill-opacity",d[d._def.button.toggle]?1:0.2)
                                this.__buttonGroupBackground__.setAttribute("fill-opacity",d[d._def.button.toggle]?1:0.2)
                            }

                            if (typeof d._def.button.visible === "function") { // is defined and a function...
                                if (d._def.button.visible.call(d) === false) {
                                    this.__buttonGroup__.style.display = "none";
                                }
                                else {
                                    this.__buttonGroup__.style.display = "inherit";
                                }
                            }
                        }
                        // thisNode.selectAll(".node_badge_group").attr("transform",function(d){return "translate("+(d.w-40)+","+(d.h+3)+")";});
                        // thisNode.selectAll("text.node_badge_label").text(function(d,i) {
                        //     if (d._def.badge) {
                        //         if (typeof d._def.badge == "function") {
                        //             try {
                        //                 return d._def.badge.call(d);
                        //             } catch(err) {
                        //                 console.log("Definition error: "+d.type+".badge",err);
                        //                 return "";
                        //             }
                        //         } else {
                        //             return d._def.badge;
                        //         }
                        //     }
                        //     return "";
                        // });
                    }

                    if (d.dirtyStatus) {
                        redrawStatus(d,this);
                    }
                    d.dirty = false;
                    if (d.g) {
                        if (!dirtyGroups[d.g]) {
                            var gg = d.g;
                            while (gg && !dirtyGroups[gg]) {
                                dirtyGroups[gg] = RED.nodes.group(gg);
                                gg = dirtyGroups[gg].g;
                            }
                        }
                    }
                }

                RED.hooks.trigger("viewRedrawNode",{node:d,el:this})
            });

            if (nodesReordered) {
                node.sort(function(a,b) {
                    return a._index - b._index;
                })
            }

            var junction = junctionLayer.selectAll(".red-ui-flow-junction").data(
                activeJunctions,
                d => d.id
            )
            var junctionEnter = junction.enter().insert("svg:g").attr("class","red-ui-flow-junction")
            junctionEnter.each(function(d,i) {
                var junction = d3.select(this);
                var contents = document.createDocumentFragment();
                // d.added = true;
                var junctionBack = document.createElementNS("http://www.w3.org/2000/svg","rect");
                junctionBack.setAttribute("class","red-ui-flow-junction-background");
                junctionBack.setAttribute("x",-5);
                junctionBack.setAttribute("y",-5);
                junctionBack.setAttribute("width",10);
                junctionBack.setAttribute("height",10);
                junctionBack.setAttribute("rx",3);
                junctionBack.setAttribute("ry",3);
                junctionBack.__data__ = d;
                this.__junctionBack__ = junctionBack;
                contents.appendChild(junctionBack);

                var junctionInput = document.createElementNS("http://www.w3.org/2000/svg","rect");
                junctionInput.setAttribute("class","red-ui-flow-junction-port red-ui-flow-junction-port-input");
                junctionInput.setAttribute("x",-5);
                junctionInput.setAttribute("y",-5);
                junctionInput.setAttribute("width",10);
                junctionInput.setAttribute("height",10);
                junctionInput.setAttribute("rx",3);
                junctionInput.setAttribute("ry",3);
                junctionInput.__data__ = d;
                junctionInput.__portType__ = PORT_TYPE_INPUT;
                junctionInput.__portIndex__ = 0;
                this.__junctionInput__ = junctionOutput;
                contents.appendChild(junctionInput);
                junctionInput.addEventListener("mouseup", portMouseUpProxy);
                junctionInput.addEventListener("mousedown", portMouseDownProxy);


                this.__junctionInput__ = junctionInput;
                contents.appendChild(junctionInput);
                var junctionOutput = document.createElementNS("http://www.w3.org/2000/svg","rect");
                junctionOutput.setAttribute("class","red-ui-flow-junction-port red-ui-flow-junction-port-output");
                junctionOutput.setAttribute("x",-5);
                junctionOutput.setAttribute("y",-5);
                junctionOutput.setAttribute("width",10);
                junctionOutput.setAttribute("height",10);
                junctionOutput.setAttribute("rx",3);
                junctionOutput.setAttribute("ry",3);
                junctionOutput.__data__ = d;
                junctionOutput.__portType__ = PORT_TYPE_OUTPUT;
                junctionOutput.__portIndex__ = 0;
                this.__junctionOutput__ = junctionOutput;
                contents.appendChild(junctionOutput);
                junctionOutput.addEventListener("mouseup", portMouseUpProxy);
                junctionOutput.addEventListener("mousedown", portMouseDownProxy);
                junctionOutput.addEventListener("mouseover", junctionMouseOverProxy);
                junctionOutput.addEventListener("mouseout", junctionMouseOutProxy);
                junctionOutput.addEventListener("touchmove", junctionMouseOverProxy);
                junctionOutput.addEventListener("touchend", portMouseUpProxy);
                junctionOutput.addEventListener("touchstart", portMouseDownProxy);

                junctionInput.addEventListener("mouseover", junctionMouseOverProxy);
                junctionInput.addEventListener("mouseout", junctionMouseOutProxy);
                junctionInput.addEventListener("touchmove", junctionMouseOverProxy);
                junctionInput.addEventListener("touchend", portMouseUpProxy);
                junctionInput.addEventListener("touchstart", portMouseDownProxy);

                junctionBack.addEventListener("mouseover", junctionMouseOverProxy);
                junctionBack.addEventListener("mouseout", junctionMouseOutProxy);
                junctionBack.addEventListener("touchmove", junctionMouseOverProxy);

                // These handlers expect to be registered as d3 events
                d3.select(junctionBack).on("mousedown", nodeMouseDown).on("mouseup", nodeMouseUp);
                d3.select(junctionBack).on("touchstart", nodeMouseDown).on("touchend", nodeMouseUp);

                junction[0][0].appendChild(contents);
            })
            junction.exit().remove();
            junction.each(function(d) {
                var junction = d3.select(this);
                this.setAttribute("transform", "translate(" + (d.x) + "," + (d.y) + ")");
                if (d.dirty) {
                    junction.classed("red-ui-flow-junction-dragging", mouse_mode === RED.state.MOVING_ACTIVE && movingSet.has(d))
                    junction.classed("selected", !!d.selected)
                    dirtyNodes[d.id] = d;

                    if (d.g) {
                        if (!dirtyGroups[d.g]) {
                            var gg = d.g;
                            while (gg && !dirtyGroups[gg]) {
                                dirtyGroups[gg] = RED.nodes.group(gg);
                                gg = dirtyGroups[gg].g;
                            }
                        }
                    }

                }

            })

            var link = linkLayer.selectAll(".red-ui-flow-link").data(
                activeLinks,
                function(d) {
                    return d.source.id+":"+d.sourcePort+":"+d.target.id+":"+d.target.i;
                }
            );
            var linkEnter = link.enter().insert("g",".red-ui-flow-node").attr("class","red-ui-flow-link");

            linkEnter.each(function(d,i) {
                var l = d3.select(this);
                var pathContents = document.createDocumentFragment();

                d.added = true;
                var pathBack = document.createElementNS("http://www.w3.org/2000/svg","path");
                pathBack.__data__ = d;
                pathBack.setAttribute("class","red-ui-flow-link-background red-ui-flow-link-path"+(d.link?" red-ui-flow-link-link":""));
                this.__pathBack__ = pathBack;
                pathContents.appendChild(pathBack);
                d3.select(pathBack)
                    .on("mousedown",linkMouseDown)
                    .on("touchstart",linkTouchStart)
                    .on("mousemove", function(d) {
                        if (mouse_mode === RED.state.SLICING) {

                            selectedLinks.add(d)
                            l.classed("red-ui-flow-link-splice",true)
                            redraw()
                        } else if (mouse_mode === RED.state.SLICING_JUNCTION && !d.link) {
                            if (!l.classed("red-ui-flow-link-splice")) {
                                // Find intersection point
                                var lineLength = pathLine.getTotalLength();
                                var pos;
                                var delta = Infinity;
                                for (var i = 0; i < lineLength; i++) {
                                    var linePos = pathLine.getPointAtLength(i);
                                    var posDeltaX = Math.abs(linePos.x-(d3.event.offsetX / scaleFactor))
                                    var posDeltaY = Math.abs(linePos.y-(d3.event.offsetY / scaleFactor))
                                    var posDelta = posDeltaX*posDeltaX + posDeltaY*posDeltaY
                                    if (posDelta < delta) {
                                        pos = linePos
                                        delta = posDelta
                                    }
                                }
                                d._sliceLocation = pos
                                selectedLinks.add(d)
                                l.classed("red-ui-flow-link-splice",true)
                                redraw()
                            }
                        }
                    })

                var pathOutline = document.createElementNS("http://www.w3.org/2000/svg","path");
                pathOutline.__data__ = d;
                pathOutline.setAttribute("class","red-ui-flow-link-outline red-ui-flow-link-path");
                this.__pathOutline__ = pathOutline;
                pathContents.appendChild(pathOutline);

                var pathLine = document.createElementNS("http://www.w3.org/2000/svg","path");
                pathLine.__data__ = d;
                pathLine.setAttribute("class","red-ui-flow-link-line red-ui-flow-link-path"+
                    (d.link?" red-ui-flow-link-link":(activeSubflow?" red-ui-flow-subflow-link":"")));
                this.__pathLine__ = pathLine;
                pathContents.appendChild(pathLine);

                l[0][0].appendChild(pathContents);
            });

            link.exit().remove();
            link.each(function(d) {
                var link = d3.select(this);
                if (d.added || d.selected || dirtyNodes[d.source.id] || dirtyNodes[d.target.id]) {
                    var numOutputs = d.source.outputs || 1;
                    var sourcePort = d.sourcePort || 0;
                    var y = -((numOutputs-1)/2)*13 +13*sourcePort;
                    d.x1 = d.source.x+(d.source.w/2||0);
                    d.y1 = d.source.y+y;
                    d.x2 = d.target.x-(d.target.w/2||0);
                    d.y2 = d.target.y;

                    // return "M "+d.x1+" "+d.y1+
                    //     " C "+(d.x1+scale*node_width)+" "+(d.y1+scaleY*node_height)+" "+
                    //     (d.x2-scale*node_width)+" "+(d.y2-scaleY*node_height)+" "+
                    //     d.x2+" "+d.y2;
                    var path = generateLinkPath(d.x1,d.y1,d.x2,d.y2,1, !!(d.source.status || d.target.status));
                    if (/NaN/.test(path)) {
                        path = ""
                    }
                    this.__pathBack__.setAttribute("d",path);
                    this.__pathOutline__.setAttribute("d",path);
                    this.__pathLine__.setAttribute("d",path);
                    this.__pathLine__.classList.toggle("red-ui-flow-node-disabled",!!(d.source.d || d.target.d));
                    this.__pathLine__.classList.toggle("red-ui-flow-subflow-link", !d.link && activeSubflow);
                }

                this.classList.toggle("red-ui-flow-link-selected", !!d.selected);

                var connectedToUnknown = !!(d.target.type == "unknown" || d.source.type == "unknown");
                this.classList.toggle("red-ui-flow-link-unknown",!!(d.target.type == "unknown" || d.source.type == "unknown"))
                delete d.added;
            })
            var offLinks = linkLayer.selectAll(".red-ui-flow-link-off-flow").data(
                activeFlowLinks,
                function(d) {
                    return d.node.id+":"+d.refresh
                }
            );

            var offLinksEnter = offLinks.enter().insert("g",".red-ui-flow-node").attr("class","red-ui-flow-link-off-flow");
            offLinksEnter.each(function(d,i) {
                var g = d3.select(this);
                var s = 1;
                var labelAnchor = "start";
                if (d.node.type === "link in") {
                    s = -1;
                    labelAnchor = "end";
                }
                var stemLength = s*30;
                var branchLength = s*20;
                var l = g.append("svg:path").attr("class","red-ui-flow-link-link").attr("d","M 0 0 h "+stemLength);
                var links = d.links;
                var flows = Object.keys(links);
                var tabOrder = RED.nodes.getWorkspaceOrder();
                flows.sort(function(A,B) {
                    return tabOrder.indexOf(A) - tabOrder.indexOf(B);
                });
                var linkWidth = 10;
                var h = node_height;
                var y = -(flows.length-1)*h/2;
                var linkGroups = g.selectAll(".red-ui-flow-link-group").data(flows);
                var enterLinkGroups = linkGroups.enter().append("g").attr("class","red-ui-flow-link-group")
                    .on('mouseover', function() { if (mouse_mode !== 0) { return } d3.select(this).classed('red-ui-flow-link-group-active',true)})
                    .on('mouseout', function() {if (mouse_mode !== 0) { return } d3.select(this).classed('red-ui-flow-link-group-active',false)})
                    .on('mousedown', function() { d3.event.preventDefault(); d3.event.stopPropagation(); })
                    .on('mouseup', function(f) {
                        if (mouse_mode !== 0) {
                            return
                        }
                        d3.event.stopPropagation();
                        var targets = d.links[f];
                        RED.workspaces.show(f);
                        targets.forEach(function(n) {
                            n.selected = true;
                            n.dirty = true;
                            movingSet.add(n);
                            if (targets.length === 1) {
                                RED.view.reveal(n.id);
                            }
                        });
                        updateSelection();
                        redraw();
                    });
                enterLinkGroups.each(function(f) {
                    var linkG = d3.select(this);
                    linkG.append("svg:path")
                        .attr("class","red-ui-flow-link-link")
                        .attr("d",
                            "M "+stemLength+" 0 "+
                            "C "+(stemLength+(1.7*branchLength))+" "+0+
                            " "+(stemLength+(0.1*branchLength))+" "+y+" "+
                            (stemLength+branchLength*1.5)+" "+y+" "
                        );
                    linkG.append("svg:path")
                        .attr("class","red-ui-flow-link-port")
                        .attr("d",
                            "M "+(stemLength+branchLength*1.5+s*(linkWidth+7))+" "+(y-12)+" "+
                            "h "+(-s*linkWidth)+" "+
                            "a 3 3 45 0 "+(s===1?"0":"1")+" "+(s*-3)+" 3 "+
                            "v 18 "+
                            "a 3 3 45 0 "+(s===1?"0":"1")+" "+(s*3)+" 3 "+
                            "h "+(s*linkWidth)
                        );
                    linkG.append("svg:path")
                        .attr("class","red-ui-flow-link-port")
                        .attr("d",
                            "M "+(stemLength+branchLength*1.5+s*(linkWidth+10))+" "+(y-12)+" "+
                            "h "+(s*(linkWidth*3))+" "+
                            "M "+(stemLength+branchLength*1.5+s*(linkWidth+10))+" "+(y+12)+" "+
                            "h "+(s*(linkWidth*3))
                        ).style("stroke-dasharray","12 3 8 4 3");
                    linkG.append("rect").attr("class","red-ui-flow-port red-ui-flow-link-port")
                        .attr("x",stemLength+branchLength*1.5-4+(s*4))
                        .attr("y",y-4)
                        .attr("rx",2)
                        .attr("ry",2)
                        .attr("width",8)
                        .attr("height",8);
                    linkG.append("rect")
                        .attr("x",stemLength+branchLength*1.5-(s===-1?node_width:0))
                        .attr("y",y-12)
                        .attr("width",node_width)
                        .attr("height",24)
                        .style("stroke","none")
                        .style("fill","transparent")
                    var tab = RED.nodes.workspace(f);
                    var label;
                    if (tab) {
                        label = tab.label || tab.id;
                    }
                    linkG.append("svg:text")
                        .attr("class","red-ui-flow-port-label")
                        .attr("x",stemLength+branchLength*1.5+(s*15))
                        .attr("y",y+1)
                        .style("font-size","10px")
                        .style("text-anchor",labelAnchor)
                        .text(label);

                    y += h;
                });
                linkGroups.exit().remove();
            });
            offLinks.exit().remove();
            offLinks = linkLayer.selectAll(".red-ui-flow-link-off-flow");
            offLinks.each(function(d) {
                var s = 1;
                if (d.node.type === "link in") {
                    s = -1;
                }
                var link = d3.select(this);
                link.attr("transform", function(d) { return "translate(" + (d.node.x+(s*d.node.w/2)) + "," + (d.node.y) + ")"; });

            })

            var group = groupLayer.selectAll(".red-ui-flow-group").data(activeGroups,function(d) { return d.id });
            group.exit().each(function(d,i) {
                document.getElementById("group_select_"+d.id).remove()
            }).remove();
            var groupEnter = group.enter().insert("svg:g").attr("class", "red-ui-flow-group")
            var addedGroups = false;
            groupEnter.each(function(d,i) {
                addedGroups = true;
                var g = d3.select(this);
                g.attr("id",d.id);

                var groupBorderRadius = 4;
                var groupOutlineBorderRadius = 6
                var selectGroup = groupSelectLayer.append('g').attr("class", "red-ui-flow-group").attr("id","group_select_"+d.id);
                const groupBackground = selectGroup.append('rect')
                    .classed("red-ui-flow-group-outline-select",true)
                    .classed("red-ui-flow-group-outline-select-background",true)
                    .attr('rx',groupOutlineBorderRadius).attr('ry',groupOutlineBorderRadius)
                    .attr("x",-3)
                    .attr("y",-3);
                selectGroup.append('rect')
                    .classed("red-ui-flow-group-outline-select",true)
                    .classed("red-ui-flow-group-outline-select-outline",true)
                    .attr('rx',groupOutlineBorderRadius).attr('ry',groupOutlineBorderRadius)
                    .attr("x",-3)
                    .attr("y",-3)
                selectGroup.append('rect')
                    .classed("red-ui-flow-group-outline-select",true)
                    .classed("red-ui-flow-group-outline-select-line",true)
                    .attr('rx',groupOutlineBorderRadius).attr('ry',groupOutlineBorderRadius)
                    .attr("x",-3)
                    .attr("y",-3)
                groupBackground.on("mousedown", function() {groupMouseDown.call(g[0][0],d)});
                groupBackground.on("mouseup", function() {groupMouseUp.call(g[0][0],d)});
                groupBackground.on("touchstart", function() {groupMouseDown.call(g[0][0],d); d3.event.preventDefault();});
                groupBackground.on("touchend", function() {groupMouseUp.call(g[0][0],d); d3.event.preventDefault();});

                g.append('rect').classed("red-ui-flow-group-outline",true).attr('rx',0.5).attr('ry',0.5);

                g.append('rect').classed("red-ui-flow-group-body",true)
                    .attr('rx',groupBorderRadius).attr('ry',groupBorderRadius).style({
                        "fill":d.fill||"none",
                        "stroke": d.stroke||"none",
                    })
                g.on("mousedown",groupMouseDown).on("mouseup",groupMouseUp)
                g.on("touchstart", function() {groupMouseDown.call(g[0][0],d); d3.event.preventDefault();});
                g.on("touchend", function() {groupMouseUp.call(g[0][0],d); d3.event.preventDefault();});

                g.append('svg:text').attr("class","red-ui-flow-group-label");
                d.dirty = true;
            });
            if (addedGroups) {
                group.sort(function(a,b) {
                    return a._order - b._order
                })
            }
            group[0].reverse();
            var groupOpCount=0;
            group.each(function(d,i) {
                groupOpCount++
                if (d.resize) {
                    d.minWidth = 0;
                    delete d.resize;
                }
                if (d.dirty || dirtyGroups[d.id]) {
                    var g = d3.select(this);
                    var recalculateLabelOffsets = false;
                    if (d.nodes.length > 0) {
                        // If the group was just moved, all of its contents was
                        // also moved - so no need to recalculate its bounding box
                        if (!d.groupMoved) {
                            var minX = Number.POSITIVE_INFINITY;
                            var minY = Number.POSITIVE_INFINITY;
                            var maxX = 0;
                            var maxY = 0;
                            var margin = 26;
                            d.nodes.forEach(function(n) {
                                groupOpCount++
                                if (n._detachFromGroup) {
                                    // Do not include this node when recalulating
                                    // the group dimensions
                                    return
                                }
                                if (n.type !== "group") {
                                    minX = Math.min(minX,n.x-n.w/2-margin-((n._def.button && n._def.align!=="right")?20:0));
                                    minY = Math.min(minY,n.y-n.h/2-margin);
                                    maxX = Math.max(maxX,n.x+n.w/2+margin+((n._def.button && n._def.align=="right")?20:0));
                                    maxY = Math.max(maxY,n.y+n.h/2+margin);
                                } else {
                                    minX = Math.min(minX,n.x-margin)
                                    minY = Math.min(minY,n.y-margin)
                                    maxX = Math.max(maxX,n.x+n.w+margin)
                                    maxY = Math.max(maxY,n.y+n.h+margin)
                                }
                            });
                            if (minX !== Number.POSITIVE_INFINITY && minY !== Number.POSITIVE_INFINITY) {
                                d.x = minX;
                                d.y = minY;
                                d.w = maxX - minX;
                                d.h = maxY - minY;
                            }
                            recalculateLabelOffsets = true;
                            // if set explicitly to false, this group has just been
                            // imported so needed this initial resize calculation.
                            // Now that's done, delete the flag so the normal
                            // logic kicks in.
                            if (d.groupMoved === false) {
                                delete d.groupMoved;
                            }
                        } else {
                            delete d.groupMoved;
                        }
                    } else {
                        d.w = 40;
                        d.h = 40;
                        recalculateLabelOffsets = true;
                    }
                    if (recalculateLabelOffsets) {
                        if (!d.minWidth) {
                            if (d.style.label && d.name) {
                                var labelParts = getLabelParts(d.name||"","red-ui-flow-group-label");
                                d.minWidth = labelParts.width + 8;
                                d.labels = labelParts.lines;
                            } else {
                                d.minWidth = 40;
                                d.labels = [];
                            }
                        }
                        d.w = Math.max(d.minWidth,d.w);
                        if (d.style.label && d.labels.length > 0) {
                            var labelPos = d.style["label-position"] || "nw";
                            var h = (d.labels.length-1) * 16;
                            if (labelPos[0] === "s") {
                                h += 8;
                            }
                            d.h += h;
                            if (labelPos[0] === "n") {
                                if (d.nodes.length > 0) {
                                    d.y -= h;
                                }
                            }
                        }
                    }

                    g.attr("transform","translate("+d.x+","+d.y+")")
                    g.selectAll(".red-ui-flow-group-outline")
                        .attr("width",d.w)
                        .attr("height",d.h)


                    var selectGroup = document.getElementById("group_select_"+d.id);
                    selectGroup.setAttribute("transform","translate("+d.x+","+d.y+")");
                    if (d.hovered) {
                        selectGroup.classList.add("red-ui-flow-group-hovered")
                    } else {
                        selectGroup.classList.remove("red-ui-flow-group-hovered")
                    }
                    if (d.selected) {
                        selectGroup.classList.add("red-ui-flow-group-selected")
                    } else {
                        selectGroup.classList.remove("red-ui-flow-group-selected")
                    }
                    var selectGroupRect = selectGroup.children[0];
                    // Background
                    selectGroupRect.setAttribute("width",d.w+6)
                    selectGroupRect.setAttribute("height",d.h+6)
                    // Outline
                    selectGroupRect = selectGroup.children[1];
                    selectGroupRect.setAttribute("width",d.w+6)
                    selectGroupRect.setAttribute("height",d.h+6)
                    selectGroupRect.style.strokeOpacity = (d.selected || d.highlighted)?0.8:0;
                    // Line
                    selectGroupRect = selectGroup.children[2];
                    selectGroupRect.setAttribute("width",d.w+6)
                    selectGroupRect.setAttribute("height",d.h+6)
                    selectGroupRect.style.strokeOpacity = (d.selected || d.highlighted)?0.8:0;

                    if (d.highlighted) {
                        selectGroup.classList.add("red-ui-flow-node-highlighted");
                    } else {
                        selectGroup.classList.remove("red-ui-flow-node-highlighted");
                    }


                    g.selectAll(".red-ui-flow-group-body")
                        .attr("width",d.w)
                        .attr("height",d.h)
                        .style("stroke", d.style.stroke || "")
                        .style("stroke-opacity", d.style.hasOwnProperty('stroke-opacity') ? d.style['stroke-opacity'] : "")
                        .style("fill", d.style.fill || "")
                        .style("fill-opacity", d.style.hasOwnProperty('fill-opacity') ? d.style['fill-opacity'] : "")

                    var label = g.selectAll(".red-ui-flow-group-label");
                    label.classed("hide",!!!d.style.label)
                    if (d.style.label) {
                        var labelPos = d.style["label-position"] || "nw";
                        var labelX = 0;
                        var labelY = 0;

                        if (labelPos[0] === 'n') {
                            labelY = 0+15; // Allow for font-height
                        } else {
                            labelY = d.h - 5 -(d.labels.length -1) * 16;
                        }
                        if (labelPos[1] === 'w') {
                            labelX = 5;
                            labelAnchor = "start"
                        } else if (labelPos[1] === 'e') {
                            labelX = d.w-5;
                            labelAnchor = "end"
                        } else {
                            labelX = d.w/2;
                            labelAnchor = "middle"
                        }
                        if (d.style.hasOwnProperty('color')) {
                            label.style("fill",d.style.color)
                        } else {
                            label.style("fill",null)
                        }
                        label.attr("transform","translate("+labelX+","+labelY+")")
                             .attr("text-anchor",labelAnchor);
                        if (d.labels) {
                            var ypos = 0;
                            g.selectAll(".red-ui-flow-group-label-text").remove();
                            d.labels.forEach(function (name) {
                                label.append("tspan")
                                    .classed("red-ui-flow-group-label-text", true)
                                    .text(name)
                                    .attr("x", 0)
                                    .attr("y", ypos);
                                ypos += 16;
                            });
                        } else {
                            g.selectAll(".red-ui-flow-group-label-text").remove();
                        }
                    }

                    delete dirtyGroups[d.id];
                    delete d.dirty;
                }
            })
        } else {
            // JOINING - unselect any selected links
            linkLayer.selectAll(".red-ui-flow-link-selected").data(
                activeLinks,
                function(d) {
                    return d.source.id+":"+d.sourcePort+":"+d.target.id+":"+d.target.i;
                }
            ).classed("red-ui-flow-link-selected", false);
        }
        RED.view.navigator.refresh();
        if (d3.event) {
            d3.event.preventDefault();
        }
    }

    function focusView() {
        try {
            // Workaround for browser unexpectedly scrolling iframe into full
            // view - record the parent scroll position and restore it after
            // setting the focus
            var scrollX = window.parent.window.scrollX;
            var scrollY = window.parent.window.scrollY;
            chart.trigger("focus");
            window.parent.window.scrollTo(scrollX,scrollY);
        } catch(err) {
            // In case we're iframed into a page of a different origin, just focus
            // the view following the inevitable DOMException
            chart.trigger("focus");
        }
    }


    /**
     * Imports a new collection of nodes from a JSON String.
     *
     *  - all get new IDs assigned
     *  - all "selected"
     *  - attached to mouse for placing - "IMPORT_DRAGGING"
     * @param  {String/Array} newNodesObj nodes to import
     * @param  {Object} options options object
     *
     * Options:
     *  - addFlow - whether to import nodes to a new tab
     *  - touchImport - whether this is a touch import. If not, imported nodes are
     *                  attachedto mouse for placing - "IMPORT_DRAGGING" state
     *  - generateIds - whether to automatically generate new ids for all imported nodes
     *  - generateDefaultNames - whether to automatically update any nodes with clashing
     *                           default names
     */
    function importNodes(newNodesObj,options) {
        options = options || {
            addFlow: false,
            touchImport: false,
            generateIds: false,
            generateDefaultNames: false
        }
        var addNewFlow = options.addFlow
        var touchImport = options.touchImport;

        if (mouse_mode === RED.state.SELECTING_NODE) {
            return;
        }
        const wasDirty = RED.nodes.dirty()
        var nodesToImport;
        if (typeof newNodesObj === "string") {
            if (newNodesObj === "") {
                return;
            }
            try {
                nodesToImport = JSON.parse(newNodesObj);
            } catch(err) {
                var e = new Error(RED._("clipboard.invalidFlow",{message:err.message}));
                e.code = "NODE_RED";
                throw e;
            }
        } else {
            nodesToImport = newNodesObj;
        }

        if (!Array.isArray(nodesToImport)) {
            nodesToImport = [nodesToImport];
        }
        if (options.generateDefaultNames) {
            RED.actions.invoke("core:generate-node-names", nodesToImport, {
                renameBlank: false,
                renameClash: true,
                generateHistory: false
            })
        }

        try {
            var activeSubflowChanged;
            if (activeSubflow) {
                activeSubflowChanged = activeSubflow.changed;
            }
            var filteredNodesToImport = nodesToImport;
            var globalConfig = null;
            var gconf = null;

            RED.nodes.eachConfig(function (conf) {
                if (conf.type === "global-config") {
                    gconf = conf;
                }
            });
            if (gconf) {
                filteredNodesToImport = nodesToImport.filter(function (n) {
                    return (n.type !== "global-config");
                });
                globalConfig = nodesToImport.find(function (n) {
                    return (n.type === "global-config");
                });
            }
            var result = RED.nodes.import(filteredNodesToImport,{
                generateIds: options.generateIds,
                addFlow: addNewFlow,
                importMap: options.importMap,
                markChanged: true
            });
            if (result) {
                var new_nodes = result.nodes;
                var new_links = result.links;
                var new_groups = result.groups;
                var new_junctions = result.junctions;
                var new_workspaces = result.workspaces;
                var new_subflows = result.subflows;
                var removedNodes = result.removedNodes;
                var new_default_workspace = result.missingWorkspace;
                if (addNewFlow && new_default_workspace) {
                    RED.workspaces.show(new_default_workspace.id);
                }
                var new_ms = new_nodes.filter(function(n) { return n.hasOwnProperty("x") && n.hasOwnProperty("y") && n.z == RED.workspaces.active() });
                new_ms = new_ms.concat(new_groups.filter(function(g) { return g.z === RED.workspaces.active()}))
                new_ms = new_ms.concat(new_junctions.filter(function(j) { return j.z === RED.workspaces.active()}))
                var new_node_ids = new_nodes.map(function(n){ return n.id; });

                clearSelection();
                movingSet.clear();
                movingSet.add(new_ms);


                // TODO: pick a more sensible root node
                if (movingSet.length() > 0) {
                    if (mouse_position == null) {
                        mouse_position = [0,0];
                    }

                    var dx = mouse_position[0];
                    var dy = mouse_position[1];
                    if (movingSet.length() > 0) {
                        var root_node = movingSet.get(0).n;
                        dx = root_node.x;
                        dy = root_node.y;
                    }

                    var minX = 0;
                    var minY = 0;
                    var i;
                    var node,group;
                    var l =movingSet.length();
                    for (i=0;i<l;i++) {
                        node = movingSet.get(i);
                        node.n.selected = true;
                        node.n.changed = true;
                        node.n.moved = true;
                        node.n.x -= dx - mouse_position[0];
                        node.n.y -= dy - mouse_position[1];
                        if (node.n.type !== 'junction') {
                            node.n.w = node_width;
                            node.n.h = node_height;
                            node.n.resize = true;
                        }
                        node.dx = node.n.x - mouse_position[0];
                        node.dy = node.n.y - mouse_position[1];
                        if (node.n.type === "group") {
                            node.n.groupMoved = false;
                            minX = Math.min(node.n.x-5,minX);
                            minY = Math.min(node.n.y-5,minY);
                        } else {
                            minX = Math.min(node.n.x-node_width/2-5,minX);
                            minY = Math.min(node.n.y-node_height/2-5,minY);
                        }
                    }
                    for (i=0;i<l;i++) {
                        node = movingSet.get(i);
                        node.n.x -= minX;
                        node.n.y -= minY;
                        node.dx -= minX;
                        node.dy -= minY;
                        if (node.n._def.onadd) {
                            try {
                                node.n._def.onadd.call(node.n);
                            } catch(err) {
                                console.log("Definition error: "+node.n.type+".onadd:",err);
                            }
                        }

                    }
                    if (!touchImport) {
                        mouse_mode = RED.state.IMPORT_DRAGGING;
                        startSelectionMove()  
                    }
                }

                var historyEvent = {
                    t: "add",
                    nodes: new_node_ids,
                    links: new_links,
                    groups: new_groups,
                    junctions: new_junctions,
                    workspaces: new_workspaces,
                    subflows: new_subflows,
                    dirty: wasDirty
                };
                if (movingSet.length() === 0) {
                    RED.nodes.dirty(true);
                }
                if (activeSubflow) {
                    var subflowRefresh = RED.subflow.refresh(true);
                    if (subflowRefresh) {
                        historyEvent.subflow = {
                            id: activeSubflow.id,
                            changed: activeSubflowChanged,
                            instances: subflowRefresh.instances
                        }
                    }
                }
                if (removedNodes) {
                    var replaceEvent = {
                        t: "replace",
                        config: removedNodes
                    }
                    historyEvent = {
                        t:"multi",
                        events: [
                            replaceEvent,
                            historyEvent
                        ]
                    }
                }

                if (globalConfig) {
                    // merge global env to existing global-config
                    var env0 = gconf.env;
                    var env1 = globalConfig.env;
                    var newEnv = Array.from(env0);
                    var changed = false;

                    env1.forEach(function (item1) {
                        var index = newEnv.findIndex(function (item0) {
                            return (item0.name === item1.name);
                        });
                        if (index >= 0) {
                            var item0 = newEnv[index];
                            if ((item0.type !== item1.type) ||
                                (item0.value !== item1.value)) {
                                newEnv[index] = item1;
                                changed = true;
                            }
                        }
                        else {
                            newEnv.push(item1);
                            changed = true;
                        }
                    });
                    if(changed) {
                        gconf.env = newEnv;
                        var replaceEvent = {
                            t: "edit",
                            node: gconf,
                            changed: true,
                            changes: {
                                env: env0
                            }
                        };
                        historyEvent = {
                            t:"multi",
                            events: [
                                replaceEvent,
                                historyEvent,
                            ]
                        };
                    }
                }

                RED.history.push(historyEvent);

                updateActiveNodes();
                redraw();

                var counts = [];
                var newNodeCount = 0;
                var newConfigNodeCount = 0;
                new_nodes.forEach(function(n) {
                    if (n.hasOwnProperty("x") && n.hasOwnProperty("y")) {
                        newNodeCount++;
                    } else {
                        newConfigNodeCount++;
                    }
                })
                var newGroupCount = new_groups.length;
                var newJunctionCount = new_junctions.length;
                if (new_workspaces.length > 0) {
                    counts.push(RED._("clipboard.flow",{count:new_workspaces.length}));
                }
                if (newNodeCount > 0) {
                    counts.push(RED._("clipboard.node",{count:newNodeCount}));
                }
                if (newGroupCount > 0) {
                    counts.push(RED._("clipboard.group",{count:newGroupCount}));
                }
                if (newConfigNodeCount > 0) {
                    counts.push(RED._("clipboard.configNode",{count:newConfigNodeCount}));
                }
                if (new_subflows.length > 0) {
                    counts.push(RED._("clipboard.subflow",{count:new_subflows.length}));
                }
                if (removedNodes && removedNodes.length > 0) {
                    counts.push(RED._("clipboard.replacedNodes",{count:removedNodes.length}));
                }
                if (counts.length > 0) {
                    var countList = "<ul><li>"+counts.join("</li><li>")+"</li></ul>";
                    RED.notify("<p>"+RED._("clipboard.nodesImported")+"</p>"+countList,{id:"clipboard"});
                }

            }
        } catch(error) {
            if (error.code === "import_conflict") {
                // Pass this up for the called to resolve
                throw error;
            } else if (error.code != "NODE_RED") {
                console.log(error.stack);
                RED.notify(RED._("notification.error",{message:error.toString()}),"error");
            } else {
                RED.notify(RED._("notification.error",{message:error.message}),"error");
            }
        }
    }

    function startSelectionMove() {
        spliceActive = false;
        if (movingSet.length() === 1) {
            const node = movingSet.get(0);
            spliceActive = node.n.hasOwnProperty("_def") &&
                           ((node.n.hasOwnProperty("inputs") && node.n.inputs > 0) || (!node.n.hasOwnProperty("inputs") && node.n._def.inputs > 0)) &&
                           ((node.n.hasOwnProperty("outputs") && node.n.outputs > 0) || (!node.n.hasOwnProperty("outputs") && node.n._def.outputs > 0)) &&
                           RED.nodes.filterLinks({ source: node.n }).length === 0 &&
                           RED.nodes.filterLinks({ target: node.n }).length === 0;
        }
        groupAddActive = false
        groupAddParentGroup = null
        if (movingSet.length() > 0 && activeGroups) {
            // movingSet includes the selection AND any nodes inside selected groups
            // So we cannot simply check the `g` of all nodes match.
            // Instead, we have to:
            // - note all groups in movingSet
            // - note all .g values referenced in movingSet
            // - then check for g values for groups not in movingSet
            let isValidSelection = true
            let hasNullGroup = false
            const selectedGroups = []
            const referencedGroups = new Set()
            movingSet.forEach(n => {
                if (n.n.type === 'subflow') {
                    isValidSelection = false
                }
                if (n.n.type === 'group') {
                    selectedGroups.push(n.n.id)
                }
                if (n.n.g) {
                    referencedGroups.add(n.n.g)
                } else {
                    hasNullGroup = true
                }
            })
            if (isValidSelection) {
                selectedGroups.forEach(g => referencedGroups.delete(g))
                // console.log('selectedGroups', selectedGroups)
                // console.log('referencedGroups',referencedGroups)
                // console.log('hasNullGroup', hasNullGroup)
                if (referencedGroups.size === 0) {
                    groupAddActive = true
                } else if (!hasNullGroup && referencedGroups.size === 1) {
                    groupAddParentGroup = referencedGroups.values().next().value
                    groupAddActive = true
                }
            }
            // console.log('groupAddActive', groupAddActive)
            // console.log('groupAddParentGroup', groupAddParentGroup)
        }
    }

    function toggleShowGrid(state) {
        if (state) {
            gridLayer.style("visibility","visible");
        } else {
            gridLayer.style("visibility","hidden");
        }
    }
    function toggleSnapGrid(state) {
        snapGrid = state;
        redraw();
    }
    function toggleStatus(s) {
        showStatus = s;
        RED.nodes.eachNode(function(n) { n.dirtyStatus = true; n.dirty = true;});
        //TODO: subscribe/unsubscribe here
        redraw();
    }
    function setSelectedNodeState(isDisabled) {
        if (mouse_mode === RED.state.SELECTING_NODE) {
            return;
        }
        if (activeFlowLocked) {
            return
        }
        var workspaceSelection = RED.workspaces.selection();
        var changed = false;
        if (workspaceSelection.length > 0) {
            // TODO: toggle workspace state
        } else if (movingSet.length() > 0) {
            var historyEvents = [];
            for (var i=0;i<movingSet.length();i++) {
                var node = movingSet.get(i).n;
                if (node.type !== "group" && node.type !== "subflow") {
                    if (isDisabled != node.d) {
                        historyEvents.push({
                            t: "edit",
                            node: node,
                            changed: node.changed,
                            changes: {
                                d: node.d
                            }
                        });
                        if (isDisabled) {
                            node.d = true;
                        } else {
                            delete node.d;
                        }
                        node.dirty = true;
                        node.dirtyStatus = true;
                        node.changed = true;
                        if (node.type === "junction") {
                            RED.events.emit("junctions:change",node);
                        }
                        else {
                            RED.events.emit("nodes:change",node);
                        }
                    }
                }
            }
            if (historyEvents.length > 0) {
                RED.history.push({
                    t:"multi",
                    events: historyEvents,
                    dirty:RED.nodes.dirty()
                })
                RED.nodes.dirty(true)
            }
        }
        RED.view.redraw();

    }
    function getSelection() {
        var selection = {};

        var allNodes = new Set();

        if (movingSet.length() > 0) {
            movingSet.forEach(function(n) {
                if (n.n.type !== 'group') {
                    allNodes.add(n.n);
                }
            });
        }
        selectedGroups.forEach(function(g) {
            var groupNodes = RED.group.getNodes(g,true);
            groupNodes.forEach(function(n) {
                allNodes.delete(n);
            });
            allNodes.add(g);
        });
        if (allNodes.size > 0) {
            selection.nodes = Array.from(allNodes);
        }
        if (selectedLinks.length() > 0) {
            selection.links = selectedLinks.toArray();
            selection.link = selection.links[0];
        }
        return selection;
    }

    /**
     * Create a node from a type string.
     * **NOTE:** Can throw on error - use `try` `catch` block when calling
     * @param {string} type The node type to create
     * @param {number} [x] (optional) The horizontal position on the workspace
     * @param {number} [y] (optional)The vertical on the workspace
     * @param {string} [z] (optional) The flow tab this node will belong to. Defaults to active workspace.
     * @returns An object containing the `node` and a `historyEvent`
     * @private
     */
     function createNode(type, x, y, z) {
        const wasDirty = RED.nodes.dirty()
        var m = /^subflow:(.+)$/.exec(type);
        var activeSubflow = (z || RED.workspaces.active()) ? RED.nodes.subflow(z || RED.workspaces.active()) : null;

        if (activeSubflow && m) {
            var subflowId = m[1];
            let err
            if (subflowId === activeSubflow.id) {
                err = new Error(RED._("notification.errors.cannotAddSubflowToItself"))
            } else if (RED.nodes.subflowContains(m[1], activeSubflow.id)) {
                err = new Error(RED._("notification.errors.cannotAddCircularReference"))
            }
            if (err) {
                err.code = 'NODE_RED'
                throw err
            }
        }

        var nn = { id: RED.nodes.id(), z: z || RED.workspaces.active() };

        nn.type = type;
        nn._def = RED.nodes.getType(nn.type);

        if (!m) {
            nn.inputs = nn._def.inputs || 0;
            nn.outputs = nn._def.outputs;

            for (var d in nn._def.defaults) {
                if (nn._def.defaults.hasOwnProperty(d)) {
                    if (nn._def.defaults[d].value !== undefined) {
                        nn[d] = JSON.parse(JSON.stringify(nn._def.defaults[d].value));
                    }
                }
            }

            if (nn._def.onadd) {
                try {
                    nn._def.onadd.call(nn);
                } catch (err) {
                    console.log("Definition error: " + nn.type + ".onadd:", err);
                }
            }
        } else {
            var subflow = RED.nodes.subflow(m[1]);
            nn.name = "";
            nn.inputs = subflow.in.length;
            nn.outputs = subflow.out.length;
        }

        nn.changed = true;
        nn.moved = true;

        nn.w = RED.view.node_width;
        nn.h = Math.max(RED.view.node_height, (nn.outputs || 0) * 15);
        nn.resize = true;
        if (x != null && typeof x == "number" && x >= 0) {
            nn.x = x;
        }
        if (y != null && typeof y == "number" && y >= 0) {
            nn.y = y;
        }
        var historyEvent = {
            t: "add",
            nodes: [nn.id],
            dirty: wasDirty
        }
        if (activeSubflow) {
            var subflowRefresh = RED.subflow.refresh(true);
            if (subflowRefresh) {
                historyEvent.subflow = {
                    id: activeSubflow.id,
                    changed: activeSubflow.changed,
                    instances: subflowRefresh.instances
                }
            }
        }
        return {
            node: nn,
            historyEvent: historyEvent
        }
    }

    function calculateNodeDimensions(node) {
        var result = [node_width,node_height];
        try {
        var isLink = (node.type === "link in" || node.type === "link out")
        var hideLabel = node.hasOwnProperty('l')?!node.l : isLink;
        var label = RED.utils.getNodeLabel(node, node.type);
        var labelParts = getLabelParts(label, "red-ui-flow-node-label");
        if (hideLabel) {
            result[1] = Math.max(node_height,(node.outputs || 0) * 15);
        } else {
            result[1] = Math.max(6+24*labelParts.lines.length,(node.outputs || 0) * 15, 30);
        }
        if (hideLabel) {
            result[0] = node_height;
        } else {
            result[0] = Math.max(node_width,20*(Math.ceil((labelParts.width+50+(node._def.inputs>0?7:0))/20)) );
        }
    }catch(err) {
        console.log("Error",node);
    }
        return result;
    }


    function flashNode(n) {
        let node = n;
        if(typeof node === "string") { node = RED.nodes.node(n); }
        if(!node) { return; }

        const flashingNode = flashingNodeId && RED.nodes.node(flashingNodeId);
        if(flashingNode) {
            //cancel current flashing node before flashing new node
            clearInterval(flashingNode.__flashTimer);
            delete flashingNode.__flashTimer;
            flashingNode.dirty = true;
            flashingNode.highlighted = false;
        }
        node.__flashTimer = setInterval(function(flashEndTime, n) {
            n.dirty = true;
            if (flashEndTime >= Date.now()) {
                n.highlighted = !n.highlighted;
            } else {
                clearInterval(n.__flashTimer);
                delete n.__flashTimer;
                flashingNodeId = null;
                n.highlighted = false;
            }
            RED.view.redraw();
        }, 100, Date.now() + 2200, node)
        flashingNodeId = node.id;
        node.highlighted = true;
        RED.view.redraw();
    }
    return {
        init: init,
        state:function(state) {
            if (state == null) {
                return mouse_mode
            } else {
                mouse_mode = state;
            }
        },

        updateActive: updateActiveNodes,
        redraw: function(updateActive, syncRedraw) {
            if (updateActive) {
                updateActiveNodes();
                updateSelection();
            }
            if (syncRedraw) {
                _redraw();
            } else {
                redraw();
            }
        },
        focus: focusView,
        importNodes: importNodes,
        calculateTextWidth: calculateTextWidth,
        select: function(selection) {
            if (typeof selection !== "undefined") {
                clearSelection();
                if (typeof selection == "string") {
                    var selectedNode = RED.nodes.node(selection);
                    if (selectedNode) {
                        selectedNode.selected = true;
                        selectedNode.dirty = true;
                        movingSet.clear();
                        movingSet.add(selectedNode);
                    } else {
                        selectedNode = RED.nodes.group(selection);
                        if (selectedNode) {
                            movingSet.clear();
                            selectedGroups.clear()
                            selectedGroups.add(selectedNode)
                        }
                    }
                } else if (selection) {
                    if (selection.nodes) {
                        updateActiveNodes();
                        movingSet.clear();
                        // TODO: this selection group span groups
                        //  - if all in one group -> activate the group
                        //  - if in multiple groups (or group/no-group)
                        //      -> select the first 'set' of things in the same group/no-group
                        selection.nodes.forEach(function(n) {
                            if (n.type !== "group") {
                                n.selected = true;
                                n.dirty = true;
                                movingSet.add(n);
                            } else {
                                selectedGroups.add(n,true);
                            }
                        })
                    }
                    if (selection.links) {
                        selectedLinks.clear();
                        selection.links.forEach(selectedLinks.add);
                    }
                }
            }
            updateSelection();
            redraw(true);
        },
        selection: getSelection,
        clearSelection: clearSelection,
        createNode: createNode,
        /** default node width */
        get node_width() {
            return node_width;
        },
        /** default node height */
        get node_height() {
            return node_height;
        },
        /** snap to grid option state */
        get snapGrid() {
            return snapGrid;
        },
        /** gets the current scale factor */
        scale: function() {
            return scaleFactor;
        },
        getLinksAtPoint: function(x,y) {
            // x,y must be in SVG co-ordinate space
            // if they come from a node.x/y, they will need to be scaled using
            // scaleFactor first.
            var result = [];
            var links = outer.selectAll(".red-ui-flow-link-background")[0];
            for (var i=0;i<links.length;i++) {
                var bb = links[i].getBBox();
                if (bb.height === 0) {
                    // For horizontal links, add some real height to make them easier
                    // to hit.
                    bb.y -= Math.max(5, 5 / scaleFactor);
                    bb.height = Math.max(10, 10 / scaleFactor);
                }
                if (x >= bb.x && y >= bb.y && x <= bb.x+bb.width && y <= bb.y+bb.height) {
                    result.push(links[i])
                }
            }
            return result;
        },
        getGroupAtPoint: getGroupAt,
        getActiveGroup: function() { return null },
        reveal: function(id,triggerHighlight) {
            if (RED.nodes.workspace(id) || RED.nodes.subflow(id)) {
                RED.workspaces.show(id, null, null, true);
            } else {
                var node = RED.nodes.node(id) || RED.nodes.group(id);
                if (node) {
                    if (node.z && (node.type === "group" || node._def.category !== 'config')) {
                        node.dirty = true;
                        RED.workspaces.show(node.z);
                        if (node.type === "group" && !node.w && !node.h) {
                            _redraw();
                        }
                        var screenSize = [chart[0].clientWidth/scaleFactor,chart[0].clientHeight/scaleFactor];
                        var scrollPos = [chart.scrollLeft()/scaleFactor,chart.scrollTop()/scaleFactor];
                        var cx = node.x;
                        var cy = node.y;
                        if (node.type === "group") {
                            cx += node.w/2;
                            cy += node.h/2;
                        }
                        if (cx < scrollPos[0] || cy < scrollPos[1] || cx > screenSize[0]+scrollPos[0] || cy > screenSize[1]+scrollPos[1]) {
                            var deltaX = '-='+(((scrollPos[0] - cx) + screenSize[0]/2)*scaleFactor);
                            var deltaY = '-='+(((scrollPos[1] - cy) + screenSize[1]/2)*scaleFactor);
                            chart.animate({
                                scrollLeft: deltaX,
                                scrollTop: deltaY
                            },200);
                        }
                        if (triggerHighlight !== false) {
                            flashNode(node);
                        }
                    } else if (node._def.category === 'config') {
                        RED.sidebar.config.show(id);
                    }
                }
            }
        },
        gridSize: function(v) {
            if (v === undefined) {
                return gridSize;
            } else {
                gridSize = Math.max(5,v);
                updateGrid();
            }
        },
        getActiveNodes: function() {
            return activeNodes;
        },
        getSubflowPorts: function() {
            var result = [];
            if (activeSubflow) {
                var subflowOutputs = nodeLayer.selectAll(".red-ui-flow-subflow-port-output").data(activeSubflow.out,function(d,i){ return d.id;});
                subflowOutputs.each(function(d,i) { result.push(d) })
                var subflowInputs = nodeLayer.selectAll(".red-ui-flow-subflow-port-input").data(activeSubflow.in,function(d,i){ return d.id;});
                subflowInputs.each(function(d,i) { result.push(d) })
                var subflowStatus = nodeLayer.selectAll(".red-ui-flow-subflow-port-status").data(activeSubflow.status?[activeSubflow.status]:[],function(d,i){ return d.id;});
                subflowStatus.each(function(d,i) { result.push(d) })
            }
            return result;
        },
        selectNodes: function(options) {
            $("#red-ui-workspace-tabs-shade").show();
            $("#red-ui-palette-shade").show();
            $("#red-ui-sidebar-shade").show();
            $("#red-ui-header-shade").show();
            $("#red-ui-workspace").addClass("red-ui-workspace-select-mode");

            mouse_mode = RED.state.SELECTING_NODE;
            clearSelection();
            if (options.selected) {
                options.selected.forEach(function(id) {
                    var n = RED.nodes.node(id);
                    if (n) {
                        n.selected = true;
                        n.dirty = true;
                        movingSet.add(n);
                    }
                })
            }
            redraw();
            selectNodesOptions = options||{};
            var closeNotification = function() {
                clearSelection();
                $("#red-ui-workspace-tabs-shade").hide();
                $("#red-ui-palette-shade").hide();
                $("#red-ui-sidebar-shade").hide();
                $("#red-ui-header-shade").hide();
                $("#red-ui-workspace").removeClass("red-ui-workspace-select-mode");
                resetMouseVars();
                notification.close();
            }
            selectNodesOptions.done = function(selection) {
                closeNotification();
                if (selectNodesOptions.onselect) {
                    selectNodesOptions.onselect(selection);
                }
            }
            var buttons = [{
                text: RED._("common.label.cancel"),
                click: function(e) {
                    closeNotification();
                    if (selectNodesOptions.oncancel) {
                        selectNodesOptions.oncancel();
                    }
                }
            }];
            if (!selectNodesOptions.single) {
                buttons.push({
                    text: RED._("common.label.done"),
                    class: "primary",
                    click: function(e) {
                        var selection = movingSet.nodes()
                        selectNodesOptions.done(selection);
                    }
                });
            }
            var notification = RED.notify(selectNodesOptions.prompt || RED._("workspace.selectNodes"),{
                modal: false,
                fixed: true,
                type: "compact",
                buttons: buttons
            })
        },
        scroll: function(x,y) {
            if (x !== undefined && y !== undefined) {
                chart.scrollLeft(chart.scrollLeft()+x);
                chart.scrollTop(chart.scrollTop()+y)
            } else {
                return [chart.scrollLeft(), chart.scrollTop()]
            }
        },
        clickNodeButton: function(n) {
            if (n._def.button) {
                nodeButtonClicked(n);
            }
        },
        clipboard: function() {
            return clipboard
        },
        redrawStatus: redrawStatus,
        showQuickAddDialog:showQuickAddDialog,
        calculateNodeDimensions: calculateNodeDimensions,
        getElementPosition:getElementPosition,
        showTooltip:showTooltip,
        dimensions: function() {
            return {
                width: space_width,
                height: space_height
            };
        }
    };
})();
