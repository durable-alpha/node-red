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

RED.view.tools = (function() {
    'use strict';
    function selectConnected(type) {
        var selection = RED.view.selection();
        var visited = new Set();
        if (selection.nodes && selection.nodes.length > 0) {
            selection.nodes.forEach(function(n) {
                if (!visited.has(n)) {
                    var connected;
                    if (type === 'all') {
                        connected = RED.nodes.getAllFlowNodes(n);
                    } else if (type === 'up') {
                        connected = [n].concat(RED.nodes.getAllUpstreamNodes(n));
                    } else if (type === 'down') {
                        connected = [n].concat(RED.nodes.getAllDownstreamNodes(n));
                    }
                    connected.forEach(function(nn) { visited.add(nn) })
                }
            });
            RED.view.select({nodes:Array.from(visited)});
        }

    }

    function alignToGrid() {
        if (RED.workspaces.isLocked()) {
            return
        }
        var selection = RED.view.selection();
        if (selection.nodes) {
            var changedNodes = [];
            selection.nodes.forEach(function(n) {
                var x = n.w/2 + Math.round((n.x-n.w/2)/RED.view.gridSize())*RED.view.gridSize();
                var y = Math.round(n.y/RED.view.gridSize())*RED.view.gridSize();
                if (n.x !== x || n.y !== y) {
                    changedNodes.push({
                        n:n,
                        ox: n.x,
                        oy: n.y,
                        moved: n.moved
                    });
                    n.x = x;
                    n.y = y;
                    n.dirty = true;
                    n.moved = true;
                }
            });
            if (changedNodes.length > 0) {
                RED.history.push({t:"move",nodes:changedNodes,dirty:RED.nodes.dirty()});
                RED.nodes.dirty(true);
                RED.view.redraw(true);
            }
        }
    }

    var moving_set = null;
    var endMoveSet = false;
    function endKeyboardMove() {
        endMoveSet = false;
        if (moving_set.length > 0) {
            var ns = [];
            for (var i=0;i<moving_set.length;i++) {
                ns.push({n:moving_set[i].n,ox:moving_set[i].ox,oy:moving_set[i].oy,moved:moving_set[i].moved});
                moving_set[i].n.moved = true;
                moving_set[i].n.dirty = true;
                delete moving_set[i].ox;
                delete moving_set[i].oy;
            }
            RED.view.redraw();
            RED.history.push({t:"move",nodes:ns,dirty:RED.nodes.dirty()});
            RED.nodes.dirty(true);
            moving_set = null;
        }
    }

    function moveSelection(dx,dy) {
        if (RED.workspaces.isLocked()) {
            return
        }
        if (moving_set === null) {
            moving_set = [];
            var selection = RED.view.selection();
            if (selection.nodes) {
                while (selection.nodes.length > 0) {
                    var n = selection.nodes.shift();
                    moving_set.push({n:n});
                    if (n.type === "group") {
                        selection.nodes = selection.nodes.concat(n.nodes);
                    }
                }
            }
        }
        if (moving_set && moving_set.length > 0) {
            if (!endMoveSet) {
                $(document).one('keyup',endKeyboardMove);
                endMoveSet = true;
            }
            var dim = RED.view.dimensions();
            var space_width = dim.width;
            var space_height = dim.height;
            var minX = 0;
            var minY = 0;
            var node;

            for (var i=0;i<moving_set.length;i++) {
                node = moving_set[i];
                if (node.ox == null && node.oy == null) {
                    node.ox = node.n.x;
                    node.oy = node.n.y;
                    node.moved = node.n.moved;
                }
                node.n.moved = true;
                node.n.dirty = true;
                node.n.x += dx;
                node.n.y += dy;
                if ((node.n.x +node.n.w/2) >= space_width) {
                    node.n.x = space_width -node.n.w/2;
                }
                if ((node.n.y +node.n.h/2) >= space_height) {
                    node.n.y = space_height -node.n.h/2;
                }
                node.n.dirty = true;
                if (node.n.type === "group") {
                    RED.group.markDirty(node.n);
                    minX = Math.min(node.n.x - 5,minX);
                    minY = Math.min(node.n.y - 5,minY);
                } else {
                    minX = Math.min(node.n.x-node.n.w/2-5,minX);
                    minY = Math.min(node.n.y-node.n.h/2-5,minY);
                }
            }
            if (minX !== 0 || minY !== 0) {
                for (var n = 0; n<moving_set.length; n++) {
                    node = moving_set[n];
                    node.n.x -= minX;
                    node.n.y -= minY;
                }
            }
            RED.view.redraw();
        } else {
            RED.view.scroll(dx*10,dy*10);
        }
    }

    function setSelectedNodeLabelState(labelShown) {
        if (RED.workspaces.isLocked()) {
            return
        }
        var selection = RED.view.selection();
        var historyEvents = [];
        var nodes = [];
        if (selection.nodes) {
            selection.nodes.forEach(function(n) {
                if (n.type !== 'subflow' && n.type !== 'group') {
                    nodes.push(n);
                } else if (n.type === 'group') {
                    nodes = nodes.concat( RED.group.getNodes(n,true));
                }
            });
        }
        nodes.forEach(function(n) {
            var modified = false;
            var showLabel = n._def.hasOwnProperty("showLabel") ? n._def.showLabel : true;
            var oldValue = n.l === undefined ? showLabel : n.l;

            if (labelShown) {
                if (n.l === false || (!showLabel && !n.hasOwnProperty('l'))) {
                    n.l = true;
                    modified = true;
                }
            } else {
                if ((showLabel && (!n.hasOwnProperty('l') || n.l === true)) || (!showLabel && n.l === true) ) {
                    n.l = false;
                    modified = true;
                }
            }
            if (modified) {
                historyEvents.push({
                    t: "edit",
                    node: n,
                    changed: n.changed,
                    changes: {
                        l: oldValue
                    }
                })
                n.changed = true;
                n.dirty = true;
                n.resize = true;
            }
        })

        if (historyEvents.length > 0) {
            RED.history.push({
                t: "multi",
                events: historyEvents,
                dirty: RED.nodes.dirty()
            })
            RED.nodes.dirty(true);
        }

        RED.view.redraw();


    }

    function selectFirstNode() {
        var canidates;
        var origin = {x:0, y:0};

        var activeGroup = RED.view.getActiveGroup();

        if (!activeGroup) {
            candidates = RED.view.getActiveNodes();
        } else {
            candidates = RED.group.getNodes(activeGroup,false);
            origin = activeGroup;
        }

        var distances = [];
        candidates.forEach(function(node) {
            var deltaX = node.x - origin.x;
            var deltaY = node.y - origin.x;
            var delta = deltaY*deltaY + deltaX*deltaX;
            distances.push({node: node, delta: delta})
        });
        if (distances.length > 0) {
            distances.sort(function(A,B) {
                return A.delta - B.delta
            })
            var newNode = distances[0].node;
            if (newNode) {
                RED.view.select({nodes:[newNode]});
                RED.view.reveal(newNode.id,false);
            }
        }
    }

    function gotoNextNode() {
        var selection = RED.view.selection();
        if (selection.nodes && selection.nodes.length === 1) {
            var origin = selection.nodes[0];
            var links = RED.nodes.filterLinks({source:origin});
            if (links.length > 0) {
                links.sort(function(A,B) {
                    return Math.abs(A.target.y - origin.y) - Math.abs(B.target.y - origin.y)
                })
                var newNode = links[0].target;
                if (newNode) {
                    RED.view.select({nodes:[newNode]});
                    RED.view.reveal(newNode.id,false);
                }
            }
        } else if (RED.workspaces.selection().length === 0) {
            selectFirstNode();
        }
    }
    function gotoPreviousNode() {
        var selection = RED.view.selection();
        if (selection.nodes && selection.nodes.length === 1) {
            var origin = selection.nodes[0];
            var links = RED.nodes.filterLinks({target:origin});
            if (links.length > 0) {
                links.sort(function(A,B) {
                    return Math.abs(A.source.y - origin.y) - Math.abs(B.source.y - origin.y)
                })
                var newNode = links[0].source;
                if (newNode) {
                    RED.view.select({nodes:[newNode]});
                    RED.view.reveal(newNode.id,false);
                }
            }
        } else if (RED.workspaces.selection().length === 0) {
            selectFirstNode();
        }
    }

    function getChildren(node) {
        return RED.nodes.filterLinks({source:node}).map(function(l) { return l.target})
    }
    function getParents(node) {
        return RED.nodes.filterLinks({target:node}).map(function(l) { return l.source})
    }

    function getSiblings(node) {
        var siblings = new Set();
        var parents = getParents(node);
        parents.forEach(function(p) {
            getChildren(p).forEach(function(c) { siblings.add(c) })
        });
        var children = getChildren(node);
        children.forEach(function(p) {
            getParents(p).forEach(function(c) { siblings.add(c) })
        });
        siblings.delete(node);
        return Array.from(siblings);
    }
    function gotoNextSibling() {
        // 'next' defined as nearest on the y-axis below this node
        var selection = RED.view.selection();
        if (selection.nodes && selection.nodes.length === 1) {
            var origin = selection.nodes[0];
            var siblings = getSiblings(origin);
            if (siblings.length > 0) {
                siblings = siblings.filter(function(n) { return n.y > origin. y})
                siblings.sort(function(A,B) {
                    return Math.abs(A.y - origin.y) - Math.abs(B.y - origin.y)
                })
                var newNode = siblings[0];
                if (newNode) {
                    RED.view.select({nodes:[newNode]});
                    RED.view.reveal(newNode.id,false);
                }
            }
        } else if (RED.workspaces.selection().length === 0) {
            selectFirstNode();
        }
    }
    function gotoPreviousSibling() {
        // 'next' defined as nearest on the y-axis above this node
        var selection = RED.view.selection();
        if (selection.nodes && selection.nodes.length === 1) {
            var origin = selection.nodes[0];
            var siblings = getSiblings(origin);
            if (siblings.length > 0) {
                siblings = siblings.filter(function(n) { return n.y < origin. y})
                siblings.sort(function(A,B) {
                    return Math.abs(A.y - origin.y) - Math.abs(B.y - origin.y)
                })
                var newNode = siblings[0];
                if (newNode) {
                    RED.view.select({nodes:[newNode]});
                    RED.view.reveal(newNode.id,false);
                }
            }
        } else if (RED.workspaces.selection().length === 0) {
            selectFirstNode();
        }

    }

    // function addNode() {
    //     var selection = RED.view.selection();
    //     if (selection.nodes && selection.nodes.length === 1 && selection.nodes[0].outputs > 0) {
    //         var selectedNode = selection.nodes[0];
    //         RED.view.showQuickAddDialog([
    //             selectedNode.x + selectedNode.w + 50,selectedNode.y
    //         ])
    //     } else {
    //         RED.view.showQuickAddDialog();
    //     }
    // }


    function gotoNearestNode(direction) {
        var selection = RED.view.selection();
        if (selection.nodes && selection.nodes.length === 1) {
            var origin = selection.nodes[0];

            var candidates = RED.nodes.filterNodes({z:origin.z});
            candidates = candidates.concat(RED.view.getSubflowPorts());
            var distances = [];
            candidates.forEach(function(node) {
                if (node === origin) {
                    return;
                }
                var deltaX = node.x - origin.x;
                var deltaY = node.y - origin.y;
                var delta = deltaY*deltaY + deltaX*deltaX;
                var angle = (180/Math.PI)*Math.atan2(deltaY,deltaX);
                if (angle < 0) { angle += 360 }
                if (angle > 360) { angle -= 360 }

                var weight;

                // 0 - right
                // 270 - above
                // 90 - below
                // 180 - left
                switch(direction) {
                    case 'up': if (angle < 210 || angle > 330) { return }
                        weight = Math.max(Math.abs(270 - angle)/60, 0.2);
                        break;
                    case 'down': if (angle < 30 || angle > 150) { return }
                        weight = Math.max(Math.abs(90 - angle)/60, 0.2);
                        break;
                    case 'left': if (angle < 140 || angle > 220) { return }
                        weight = Math.max(Math.abs(180 - angle)/40, 0.1 );
                        break;
                    case 'right': if (angle > 40 && angle < 320) { return }
                        weight = Math.max(Math.abs(angle)/40, 0.1);
                        break;
                }
                weight = Math.max(weight,0.1);
                distances.push({
                    node: node,
                    d: delta,
                    w: weight,
                    delta: delta*weight
                })
            })
            if (distances.length > 0) {
                distances.sort(function(A,B) {
                    return A.delta - B.delta
                })
                var newNode = distances[0].node;
                if (newNode) {
                    RED.view.select({nodes:[newNode]});
                    RED.view.reveal(newNode.id,false);
                }
            }
        } else if (RED.workspaces.selection().length === 0) {
            var candidates = RED.view.getActiveNodes();

            var distances = [];
            candidates.forEach(function(node) {
                var deltaX = node.x;
                var deltaY = node.y;
                var delta = deltaY*deltaY + deltaX*deltaX;
                distances.push({node: node, delta: delta})
            });
            if (distances.length > 0) {
                distances.sort(function(A,B) {
                    return A.delta - B.delta
                })
                var newNode = distances[0].node;
                if (newNode) {
                    RED.view.select({nodes:[newNode]});
                    RED.view.reveal(newNode.id,false);
                }
            }
        }
    }

    function alignSelectionToEdge(direction) {
        if (RED.workspaces.isLocked()) {
            return;
        }
        var selection = RED.view.selection();

        if (selection.nodes && selection.nodes.length > 1) {
            var changedNodes = [];
            var bounds = {
                minX: Number.MAX_SAFE_INTEGER,
                minY: Number.MAX_SAFE_INTEGER,
                maxX: Number.MIN_SAFE_INTEGER,
                maxY: Number.MIN_SAFE_INTEGER
            }
            selection.nodes.forEach(function(n) {
                if (n.type === "group") {
                    bounds.minX = Math.min(bounds.minX, n.x);
                    bounds.minY = Math.min(bounds.minY, n.y);
                    bounds.maxX = Math.max(bounds.maxX, n.x + n.w);
                    bounds.maxY = Math.max(bounds.maxY, n.y + n.h);
                } else {
                    bounds.minX = Math.min(bounds.minX, n.x - n.w/2);
                    bounds.minY = Math.min(bounds.minY, n.y - n.h/2);
                    bounds.maxX = Math.max(bounds.maxX, n.x + n.w/2);
                    bounds.maxY = Math.max(bounds.maxY, n.y + n.h/2);
                }
            });

            bounds.midX = bounds.minX + (bounds.maxX - bounds.minX)/2;
            bounds.midY = bounds.minY + (bounds.maxY - bounds.minY)/2;

            selection.nodes.forEach(function(n) {
                var targetX;
                var targetY;
                var isGroup = n.type==="group";
                switch(direction) {
                    case 'top':
                        targetX = n.x;
                        targetY = bounds.minY + (isGroup?0:(n.h/2));
                        break;
                    case 'bottom':
                        targetX = n.x;
                        targetY = bounds.maxY - (isGroup?n.h:(n.h/2));
                        break;
                    case 'left':
                        targetX = bounds.minX + (isGroup?0:(n.w/2));
                        targetY = n.y;
                        break;
                    case 'right':
                        targetX = bounds.maxX - (isGroup?n.w:(n.w/2));
                        targetY = n.y;
                        break;
                    case 'middle':
                        targetX = n.x;
                        targetY = bounds.midY - (isGroup?n.h/2:0)
                        break;
                    case 'center':
                        targetX = bounds.midX - (isGroup?n.w/2:0)
                        targetY = n.y;
                        break;
                }

                if (n.x !== targetX || n.y !== targetY) {
                    if (!isGroup) {
                        changedNodes.push({
                            n:n,
                            ox: n.x,
                            oy: n.y,
                            moved: n.moved
                        });
                        n.x = targetX;
                        n.y = targetY;
                        n.dirty = true;
                        n.moved = true;
                    } else {
                        var groupNodes = RED.group.getNodes(n, true);
                        var deltaX = n.x - targetX;
                        var deltaY = n.y - targetY;
                        groupNodes.forEach(function(gn) {
                            if (gn.type !== "group" ) {
                                changedNodes.push({
                                    n:gn,
                                    ox: gn.x,
                                    oy: gn.y,
                                    moved: gn.moved
                                });
                                gn.x = gn.x - deltaX;
                                gn.y = gn.y - deltaY;
                                gn.dirty = true;
                                gn.moved = true;
                            }
                        })

                    }
                }
            });
            if (changedNodes.length > 0) {
                RED.history.push({t:"move",nodes:changedNodes,dirty:RED.nodes.dirty()});
                RED.nodes.dirty(true);
                RED.view.redraw(true);
            }
        }
    }

    function distributeSelection(direction) {
        if (RED.workspaces.isLocked()) {
            return
        }
        var selection = RED.view.selection();

        if (selection.nodes && selection.nodes.length > 2) {
            var changedNodes = [];
            var bounds = {
                minX: Number.MAX_SAFE_INTEGER,
                minY: Number.MAX_SAFE_INTEGER,
                maxX: Number.MIN_SAFE_INTEGER,
                maxY: Number.MIN_SAFE_INTEGER
            }
            var startAnchors = [];
            var endAnchors = [];

            selection.nodes.forEach(function(n) {
                var nx,ny;
                if (n.type === "group") {
                    nx = n.x + n.w/2;
                    ny = n.y + n.h/2;
                } else {
                    nx = n.x;
                    ny = n.y;
                }
                if (direction === "h") {
                    if (nx < bounds.minX) {
                        startAnchors = [];
                        bounds.minX = nx;
                    }
                    if (nx === bounds.minX) {
                        startAnchors.push(n);
                    }
                    if (nx > bounds.maxX) {
                        endAnchors = [];
                        bounds.maxX = nx;
                    }
                    if (nx === bounds.maxX) {
                        endAnchors.push(n);
                    }
                } else {
                    if (ny < bounds.minY) {
                        startAnchors = [];
                        bounds.minY = ny;
                    }
                    if (ny === bounds.minY) {
                        startAnchors.push(n);
                    }
                    if (ny > bounds.maxY) {
                        endAnchors = [];
                        bounds.maxY = ny;
                    }
                    if (ny === bounds.maxY) {
                        endAnchors.push(n);
                    }
                }
            });

            var startAnchor = startAnchors[0];
            var endAnchor = endAnchors[0];

            var nodeSpace = 0;
            var nodesToMove = selection.nodes.filter(function(n) {
                if (n.id !== startAnchor.id && n.id !== endAnchor.id) {
                    nodeSpace += direction === 'h'?n.w:n.h;
                    return true;
                }
                return false;
            }).sort(function(A,B) {
                if (direction === 'h') {
                    return A.x - B.x
                } else {
                    return A.y - B.y
                }
            })

            var saX = startAnchor.x + startAnchor.w/2;
            var saY = startAnchor.y + startAnchor.h/2;
            if (startAnchor.type === "group") {
                saX = startAnchor.x + startAnchor.w;
                saY = startAnchor.y + startAnchor.h;
            }
            var eaX = endAnchor.x;
            var eaY = endAnchor.y;
            if (endAnchor.type !== "group") {
                eaX -= endAnchor.w/2;
                eaY -= endAnchor.h/2;
            }
            var spaceToFill = direction === 'h'?(eaX - saX - nodeSpace): (eaY - saY - nodeSpace);
            var spaceBetweenNodes = spaceToFill / (nodesToMove.length + 1);

            var tx = saX;
            var ty = saY;
            while(nodesToMove.length > 0) {
                if (direction === 'h') {
                    tx += spaceBetweenNodes;
                } else {
                    ty += spaceBetweenNodes;
                }
                var nextNode = nodesToMove.shift();
                var isGroup = nextNode.type==="group";

                var nx = nextNode.x;
                var ny = nextNode.y;
                if (!isGroup) {
                    tx += nextNode.w/2;
                    ty += nextNode.h/2;
                }
                if ((direction === 'h' && nx !== tx) || (direction === 'v' && ny !== ty)) {
                    if (!isGroup) {
                        changedNodes.push({
                            n:nextNode,
                            ox: nextNode.x,
                            oy: nextNode.y,
                            moved: nextNode.moved
                        });
                        if (direction === 'h') {
                            nextNode.x = tx;
                        } else {
                            nextNode.y = ty;
                        }
                        nextNode.dirty = true;
                        nextNode.moved = true;
                    } else {
                        var groupNodes = RED.group.getNodes(nextNode, true);
                        var deltaX = direction === 'h'? nx - tx : 0;
                        var deltaY = direction === 'v'? ny - ty : 0;
                        groupNodes.forEach(function(gn) {
                            if (gn.type !== "group" ) {
                                changedNodes.push({
                                    n:gn,
                                    ox: gn.x,
                                    oy: gn.y,
                                    moved: gn.moved
                                });
                                gn.x = gn.x - deltaX;
                                gn.y = gn.y - deltaY;
                                gn.dirty = true;
                                gn.moved = true;
                            }
                        })
                    }
                }
                if (isGroup) {
                    tx += nextNode.w;
                    ty += nextNode.h;
                } else {
                    tx += nextNode.w/2;
                    ty += nextNode.h/2;
                }
            }

            if (changedNodes.length > 0) {
                RED.history.push({t:"move",nodes:changedNodes,dirty:RED.nodes.dirty()});
                RED.nodes.dirty(true);
                RED.view.redraw(true);
            }
        }
    }

    function reorderSelection(dir) {
        if (RED.workspaces.isLocked()) {
            return
        }
        var selection = RED.view.selection();
        if (selection.nodes) {
            var nodesToMove = [];
            selection.nodes.forEach(function(n) {
                if (n.type === "group") {
                    nodesToMove.push(n)
                    nodesToMove = nodesToMove.concat(RED.group.getNodes(n, true))
                } else if (n.type !== "subflow"){
                    nodesToMove.push(n);
                }
            })
            if (nodesToMove.length > 0) {
                var z = nodesToMove[0].z;
                var existingOrder = RED.nodes.getNodeOrder(z);
                var movedNodes;
                if (dir === "forwards") {
                    movedNodes = RED.nodes.moveNodesForwards(nodesToMove);
                } else if (dir === "backwards") {
                    movedNodes = RED.nodes.moveNodesBackwards(nodesToMove);
                } else if (dir === "front") {
                    movedNodes = RED.nodes.moveNodesToFront(nodesToMove);
                } else if (dir === "back") {
                    movedNodes = RED.nodes.moveNodesToBack(nodesToMove);
                }
                if (movedNodes.length > 0) {
                    var newOrder = RED.nodes.getNodeOrder(z);
                    RED.history.push({t:"reorder",nodes:{z:z,from:existingOrder,to:newOrder},dirty:RED.nodes.dirty()});
                    RED.nodes.dirty(true);
                    RED.view.redraw(true);
                }
            }
        }
    }

    function wireSeriesOfNodes() {
        if (RED.workspaces.isLocked()) {
            return
        }
        var selection = RED.view.selection();
        if (selection.nodes) {
            if (selection.nodes.length > 1) {
                var i = 0;
                var newLinks = [];
                while (i < selection.nodes.length - 1) {
                    var nodeA = selection.nodes[i];
                    var nodeB = selection.nodes[i+1];
                    if (nodeA.outputs > 0 && nodeB.inputs > 0) {
                        var existingLinks = RED.nodes.filterLinks({
                            source: nodeA,
                            target: nodeB,
                            sourcePort: 0
                        })
                        if (existingLinks.length === 0) {
                            var newLink = {
                                source: nodeA,
                                target: nodeB,
                                sourcePort: 0
                            }
                            RED.nodes.addLink(newLink);
                            newLinks.push(newLink);
                        }
                    }
                    i++;
                }
                if (newLinks.length > 0) {
                    RED.history.push({
                        t: 'add',
                        links: newLinks,
                        dirty: RED.nodes.dirty()
                    })
                    RED.nodes.dirty(true);
                    RED.view.redraw(true);
                }
            }
        }
    }

    function wireNodeToMultiple() {
        if (RED.workspaces.isLocked()) {
            return
        }
        var selection = RED.view.selection();
        if (selection.nodes) {
            if (selection.nodes.length > 1) {
                var sourceNode = selection.nodes[0];
                if (sourceNode.outputs === 0) {
                    return;
                }
                var i = 1;
                var newLinks = [];
                while (i < selection.nodes.length) {
                    var targetNode = selection.nodes[i];
                    if (targetNode.inputs > 0) {
                        var existingLinks = RED.nodes.filterLinks({
                            source: sourceNode,
                            target: targetNode,
                            sourcePort: Math.min(sourceNode.outputs-1,i-1)
                        })
                        if (existingLinks.length === 0) {
                            var newLink = {
                                source: sourceNode,
                                target: targetNode,
                                sourcePort: Math.min(sourceNode.outputs-1,i-1)
                            }
                            RED.nodes.addLink(newLink);
                            newLinks.push(newLink);
                        }
                    }
                    i++;
                }
                if (newLinks.length > 0) {
                    RED.history.push({
                        t: 'add',
                        links: newLinks,
                        dirty: RED.nodes.dirty()
                    })
                    RED.nodes.dirty(true);
                    RED.view.redraw(true);
                }
            }
        }
    }

    function wireMultipleToNode() {
        if (RED.workspaces.isLocked()) {
            return
        }
        var selection = RED.view.selection();
        if (selection.nodes) {
            if (selection.nodes.length > 1) {
                var targetNode = selection.nodes[selection.nodes.length - 1];
                if (targetNode.inputs === 0) {
                    return;
                }
                var i = 0;
                var newLinks = [];
                for (i = 0; i < selection.nodes.length - 1; i++) {
                    var sourceNode = selection.nodes[i];
                    if (sourceNode.outputs > 0) {
                        
                        // Wire the first output to the target that has no link to the target yet.
                        // This allows for connecting all combinations of inputs/outputs. 
                        // The user may then delete links quickly that aren't needed.
                        var sourceConnectedOutports = RED.nodes.filterLinks({
                            source: sourceNode,
                            target: targetNode
                        });

                        // Get outport indices that have no link yet
                        var sourceOutportIndices = Array.from({ length: sourceNode.outputs }, (_, i) => i);
                        var sourceConnectedOutportIndices = sourceConnectedOutports.map( x => x.sourcePort );
                        var sourceFreeOutportIndices = sourceOutportIndices.filter(x => !sourceConnectedOutportIndices.includes(x));

                        // Does an unconnected source port exist?
                        if (sourceFreeOutportIndices.length == 0) {
                            continue;
                        }
                        
                        // Connect the first free outport to the target
                        var newLink = {
                            source: sourceNode,
                            target: targetNode,
                            sourcePort: sourceFreeOutportIndices[0]
                        }
                        RED.nodes.addLink(newLink);
                        newLinks.push(newLink);
                    }
                }
                if (newLinks.length > 0) {
                    RED.history.push({
                        t: 'add',
                        links: newLinks,
                        dirty: RED.nodes.dirty()
                    })
                    RED.nodes.dirty(true);
                    RED.view.redraw(true);
                }
            }
        }
    }

    /**
     * Splits selected wires and re-joins them with link-out+link-in
     * @param {Object || Object[]} wires The wire(s) to split and replace with link-out, link-in nodes.
     */
    function splitWiresWithLinkNodes(wires) {
        if (RED.workspaces.isLocked()) {
            return
        }
        let wiresToSplit = wires || (RED.view.selection().links && RED.view.selection().links.filter(e => !e.link));
        if (!wiresToSplit) {
            return
        }
        if (!Array.isArray(wiresToSplit)) {
            wiresToSplit = [wiresToSplit];
        }
        if (wiresToSplit.length < 1) {
            return; //nothing selected
        }

        const history = {
            t: 'multi',
            events: [],
            dirty: RED.nodes.dirty()
        }
        const nodeSrcMap = {};
        const nodeTrgMap = {};
        const _gridSize = RED.view.gridSize();

        for (let wireIdx = 0; wireIdx < wiresToSplit.length; wireIdx++) {
            const wire = wiresToSplit[wireIdx];

            //get source and target nodes of this wire link
            const nSrc = wire.source;
            const nTrg = wire.target;

            var updateNewNodePosXY = function (origNode, newNode, alignLeft, snap, yOffset) {
                const nnSize = RED.view.calculateNodeDimensions(newNode);
                newNode.w = nnSize[0];
                newNode.h = nnSize[1];
                const coords = { x: origNode.x || 0, y: origNode.y || 0, w: origNode.w || RED.view.node_width, h: origNode.h || RED.view.node_height };
                const x = coords.x - (coords.w/2.0);
                if (alignLeft) {
                    coords.x = x - _gridSize - (newNode.w/2.0);
                } else {
                    coords.x = x + coords.w + _gridSize + (newNode.w/2.0);
                }
                newNode.x = coords.x;
                newNode.y = coords.y;
                if (snap !== false) {
                    const offsets = RED.view.tools.calculateGridSnapOffsets(newNode);
                    newNode.x -= offsets.x;
                    newNode.y -= offsets.y;
                }
                newNode.y += (yOffset || 0);
            }
            const srcPort = (wire.sourcePort || 0);
            let linkOutMapId = nSrc.id + ':' + srcPort;
            let nnLinkOut = nodeSrcMap[linkOutMapId];
            //Create a Link Out if one is not already present
            if(!nnLinkOut) {
                const nLinkOut = RED.view.createNode("link out"); //create link node
                nnLinkOut = nLinkOut.node;
                let yOffset = 0;
                if(nSrc.outputs > 1) {

                    const CENTER_PORT = (((nSrc.outputs-1) / 2) + 1);
                    const offsetCount = Math.abs(CENTER_PORT - (srcPort + 1));
                    yOffset = (_gridSize * 2 * offsetCount);
                    if((srcPort + 1) < CENTER_PORT) {
                        yOffset = -yOffset;
                    }
                    updateNewNodePosXY(nSrc, nnLinkOut, false, false, yOffset);
                } else {
                    updateNewNodePosXY(nSrc, nnLinkOut, false, RED.view.snapGrid, yOffset);
                }
                //add created node
                nnLinkOut = RED.nodes.add(nnLinkOut);
                nodeSrcMap[linkOutMapId] = nnLinkOut;
                RED.editor.validateNode(nnLinkOut);
                history.events.push(nLinkOut.historyEvent);
                //connect node to link node
                const link = {
                    source: nSrc,
                    sourcePort: wire.sourcePort || 0,
                    target: nnLinkOut
                };
                RED.nodes.addLink(link);
                history.events.push({
                    t: 'add',
                    links: [link],
                });
            }

            let nnLinkIn = nodeTrgMap[nTrg.id];
            //Create a Link In if one is not already present
            if(!nnLinkIn) {
                const nLinkIn = RED.view.createNode("link in"); //create link node
                nnLinkIn = nLinkIn.node;
                updateNewNodePosXY(nTrg, nnLinkIn, true, RED.view.snapGrid, 0);
                //add created node
                nnLinkIn = RED.nodes.add(nnLinkIn);
                nodeTrgMap[nTrg.id] = nnLinkIn;
                RED.editor.validateNode(nnLinkIn);
                history.events.push(nLinkIn.historyEvent);
                //connect node to link node
                const link = {
                    source: nnLinkIn,
                    sourcePort: 0,
                    target: nTrg
                };
                RED.nodes.addLink(link);
                history.events.push({
                    t: 'add',
                    links: [link],
                });
            }

            //connect the link out/link in virtual wires
            if(nnLinkIn.links.indexOf(nnLinkOut.id) == -1) {
                nnLinkIn.links.push(nnLinkOut.id);
            }
            if(nnLinkOut.links.indexOf(nnLinkIn.id) == -1) {
                nnLinkOut.links.push(nnLinkIn.id);
            }

            //delete the original wire
            RED.nodes.removeLink(wire);
            history.events.push({
                t: "delete",
                links: [wire]
            });
        }
        //add all history events to stack
        RED.history.push(history);

        //select all downstream of new link-in nodes so user can drag to new location
        RED.view.clearSelection();
        RED.view.select({nodes: Object.values(nodeTrgMap) });
        selectConnected("down");

        //update the view
        RED.nodes.dirty(true);
        RED.view.redraw(true);
    }

    /**
     * Calculate the required offsets to snap a node
     * @param {Object} node The node to calculate grid snap offsets for
     * @param {Object} [options] Options: `align` can be "nearest", "left" or "right"
     * @returns `{x:number, y:number}`  as the offsets to deduct from `x` and `y`
     */
    function calculateGridSnapOffsets(node, options) {
        options = options || { align: "nearest" };
        const gridOffset = { x: 0, y: 0 };
        const gridSize = RED.view.gridSize();
        const offsetLeft = node.x - (gridSize * Math.round((node.x - node.w / 2) / gridSize) + node.w / 2);
        const offsetRight = node.x - (gridSize * Math.round((node.x + node.w / 2) / gridSize) - node.w / 2);
        gridOffset.x = offsetRight;
        if (options.align === "right") {
            //skip - already set to right
        } else if (options.align === "left" || Math.abs(offsetLeft) < Math.abs(offsetRight)) {
            gridOffset.x = offsetLeft;
        }
        gridOffset.y = node.y - (gridSize * Math.round(node.y / gridSize));
        return gridOffset;
    }

    /**
     * Generate names for the select nodes.
     *  - it only sets the name if it is currently blank
     *  - it uses `<paletteLabel> <N>` - where N is the next available integer that
     *    doesn't clash with any existing nodes of that type
     * @param {Object} node The node to set the name of - if not provided, uses current selection
     * @param {{ renameBlank: boolean, renameClash: boolean, generateHistory: boolean }} options Possible options are `renameBlank`, `renameClash` and `generateHistory`
     */
    function generateNodeNames(node, options) {
        if (RED.workspaces.isLocked()) {
            return
        }
        options = Object.assign({
            renameBlank: true,
            renameClash: true,
            generateHistory: true
        }, options)
        let nodes = node;
        if (node) {
            if (!Array.isArray(node)) {
                nodes = [ node ]
            }
        } else {
            nodes = RED.view.selection().nodes;
        }
        if (nodes && nodes.length > 0) {
            // Generate history event if using the workspace selection,
            // or if the provided node already exists
            const generateHistory = options.generateHistory && (!node || !!RED.nodes.node(node.id))
            const historyEvents = []
            const typeIndex = {}
            let changed = false;
            nodes.forEach(n => {
                const nodeDef = n._def || RED.nodes.getType(n.type)
                if (nodeDef && nodeDef.defaults && nodeDef.defaults.name) {
                    const paletteLabel = RED.utils.getPaletteLabel(n.type, nodeDef)
                    const defaultNodeNameRE = new RegExp('^'+paletteLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')+' (\\d+)$')
                    if (!typeIndex.hasOwnProperty(n.type)) {
                        const existingNodes = RED.nodes.filterNodes({ type: n.type });
                        const existingIds = existingNodes.reduce((ids, node) => {
                            let match = defaultNodeNameRE.exec(node.name);
                            if (match) {
                                const nodeNumber = parseInt(match[1], 10);
                                if (!ids.includes(nodeNumber)) {
                                    ids.push(nodeNumber);
                                }
                            }
                            return ids;
                        }, []).sort((a, b) => a - b);

                        let availableNameNumber = 1;
                        for (let i = 0; i < existingIds.length; i++) {
                            if (existingIds[i] !== availableNameNumber) {
                                break;
                            }
                            availableNameNumber++;
                        }

                        typeIndex[n.type] = availableNameNumber;
                    }
                    if ((options.renameBlank && n.name === '') || (options.renameClash && defaultNodeNameRE.test(n.name))) {
                        if (generateHistory) {
                            historyEvents.push({
                                t:'edit',
                                node: n,
                                changes: { name: n.name },
                                dirty: RED.nodes.dirty(),
                                changed: n.changed
                            })
                        }
                        n.name = paletteLabel+" "+typeIndex[n.type]
                        n.dirty = true
                        typeIndex[n.type]++
                        changed = true
                    }
                }
            })
            if (changed) {
                if (historyEvents.length > 0) {
                    RED.history.push({
                        t: 'multi',
                        events: historyEvents
                    })
                }
                RED.nodes.dirty(true)
                RED.view.redraw()
            }
        }
    }

    function addJunctionsToWires(options = {}) {
        if (RED.workspaces.isLocked()) {
            return
        }
        let wiresToSplit = options.wires || (RED.view.selection().links && RED.view.selection().links.filter(e => !e.link));
        if (!wiresToSplit) {
            return
        }
        if (!Array.isArray(wiresToSplit)) {
            wiresToSplit = [wiresToSplit];
        }
        if (wiresToSplit.length === 0) {
            return;
        }

        var removedLinks = new Set()
        var addedLinks = []
        var addedJunctions = []

        var groupedLinks = {}
        wiresToSplit.forEach(function(l) {
            var sourceId = l.source.id+":"+l.sourcePort
            groupedLinks[sourceId] = groupedLinks[sourceId] || []
            groupedLinks[sourceId].push(l)

            groupedLinks[l.target.id] = groupedLinks[l.target.id] || []
            groupedLinks[l.target.id].push(l)
        });
        var linkGroups = Object.keys(groupedLinks)
        linkGroups.sort(function(A,B) {
            return groupedLinks[B].length - groupedLinks[A].length
        })
        const wasDirty = RED.nodes.dirty()
        linkGroups.forEach(function(gid) {
            var links = groupedLinks[gid]
            var junction = {
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
            links = links.filter(function(l) { return !removedLinks.has(l) })
            if (links.length === 0) {
                return
            }
            if (addedJunctions.length === 0 && Object.hasOwn(options, 'x') && Object.hasOwn(options, 'y')) {
                junction.x = options.x
                junction.y = options.y
            } else {
                let pointCount = 0
                links.forEach(function(l) {
                    if (l._sliceLocation) {
                        junction.x += l._sliceLocation.x
                        junction.y += l._sliceLocation.y
                        delete l._sliceLocation
                        pointCount++
                    } else {
                        junction.x += l.source.x + l.source.w/2 + l.target.x - l.target.w/2
                        junction.y += l.source.y + l.target.y
                        pointCount += 2
                    }
                })
                junction.x = Math.round(junction.x/pointCount)
                junction.y = Math.round(junction.y/pointCount)
            }
            if (RED.view.snapGrid) {
                let gridSize = RED.view.gridSize()
                junction.x = (gridSize*Math.round(junction.x/gridSize));
                junction.y = (gridSize*Math.round(junction.y/gridSize));
            }

            var nodeGroups = new Set()

            junction = RED.nodes.addJunction(junction)
            addedJunctions.push(junction)
            let newLink
            if (gid === links[0].source.id+":"+links[0].sourcePort) {
                newLink = {
                    source: links[0].source,
                    sourcePort: links[0].sourcePort,
                    target: junction
                }
            } else {
                newLink = {
                    source: junction,
                    sourcePort: 0,
                    target: links[0].target
                }
            }
            addedLinks.push(newLink)
            RED.nodes.addLink(newLink)
            links.forEach(function(l) {
                removedLinks.add(l)
                RED.nodes.removeLink(l)
                let newLink
                if (gid === l.target.id) {
                    newLink = {
                        source: l.source,
                        sourcePort: l.sourcePort,
                        target: junction
                    }
                } else {
                    newLink = {
                        source: junction,
                        sourcePort: 0,
                        target: l.target
                    }
                }
                addedLinks.push(newLink)
                RED.nodes.addLink(newLink)
                nodeGroups.add(l.source.g || "__NONE__")
                nodeGroups.add(l.target.g || "__NONE__")
            })
            if (nodeGroups.size === 1) {
                var group = nodeGroups.values().next().value
                if (group !== "__NONE__") {
                    RED.group.addToGroup(RED.nodes.group(group), junction)
                }
            }
        })
        if (addedJunctions.length > 0) {
            RED.history.push({
                dirty: wasDirty,
                t: 'add',
                links: addedLinks,
                junctions: addedJunctions,
                removedLinks: Array.from(removedLinks)
            })
            RED.nodes.dirty(true)
            RED.view.select({nodes: addedJunctions });
        }
        RED.view.redraw(true);
    }

    function copyItemUrl(node, isEdit) {
        if (!node) {
            const selection = RED.view.selection();
            if (selection.nodes && selection.nodes.length > 0) {
                node = selection.nodes[0]
            }
        }
        if (node) {
            let thingType = 'node'
            if (node.type === 'group') {
                thingType = 'group'
            } else if (node.type === 'tab' || node.type === 'subflow') {
                thingType = 'flow'
            }
            let url = `${window.location.origin}${window.location.pathname}#${thingType}/${node.id}`
            if (isEdit) {
                url += '/edit'
            }
            if (RED.clipboard.copyText(url)) {
                RED.notify(RED._("sidebar.info.copyURL2Clipboard"), { timeout: 2000 })
            }
        }
    }

    /**
     * Determine if a point is within a node
     * @param {*} node - A Node or Junction node
     * @param {[Number,Number]} mouse_position The x,y position of the mouse
     * @param {Number} [marginX=0] - A margin to add or deduct from the x position (to increase the hit area)
     * @param {Number} [marginY=0] - A margin to add or deduct from the y position (to increase the hit area)
     * @returns 
     */
    function isPointInNode (node, [x, y], marginX, marginY) {
        marginX = marginX || 0
        marginY = marginY || 0

        let w = node.w || 10 // junctions dont have any w or h value
        let h = node.h || 10
        let x1, x2, y1, y2
        
        if (node.type === "junction" || node.type === "group") {
            // x/y is the top left of the node
            x1 = node.x
            y1 = node.y
            x2 = node.x + w
            y2 = node.y + h
        } else {
            // x/y is the center of the node
            const [xMid, yMid] =  [w/2, h/2]
            x1 = node.x - xMid
            y1 = node.y - yMid
            x2 = node.x + xMid
            y2 = node.y + yMid
        }
        return (x >= (x1 - marginX) && x <= (x2 + marginX) && y >= (y1 - marginY) && y <= (y2 + marginY))
    }

    return {
        init: function() {
            RED.actions.add("core:show-selected-node-labels", function() { setSelectedNodeLabelState(true); })
            RED.actions.add("core:hide-selected-node-labels", function() { setSelectedNodeLabelState(false); })

            RED.actions.add("core:scroll-view-up", function() { RED.view.scroll(0,-RED.view.gridSize());});
            RED.actions.add("core:scroll-view-right", function() { RED.view.scroll(RED.view.gridSize(),0);});
            RED.actions.add("core:scroll-view-down", function() { RED.view.scroll(0,RED.view.gridSize());});
            RED.actions.add("core:scroll-view-left", function() { RED.view.scroll(-RED.view.gridSize(),0);});

            RED.actions.add("core:step-view-up", function() { RED.view.scroll(0,-5*RED.view.gridSize());});
            RED.actions.add("core:step-view-right", function() { RED.view.scroll(5*RED.view.gridSize(),0);});
            RED.actions.add("core:step-view-down", function() { RED.view.scroll(0,5*RED.view.gridSize());});
            RED.actions.add("core:step-view-left", function() { RED.view.scroll(-5*RED.view.gridSize(),0);});

            RED.actions.add("core:move-selection-up", function() { moveSelection(0,-1);});
            RED.actions.add("core:move-selection-right", function() { moveSelection(1,0);});
            RED.actions.add("core:move-selection-down", function() { moveSelection(0,1);});
            RED.actions.add("core:move-selection-left", function() { moveSelection(-1,0);});

            RED.actions.add("core:move-selection-forwards", function() { reorderSelection('forwards') })
            RED.actions.add("core:move-selection-backwards", function() { reorderSelection('backwards') })
            RED.actions.add("core:move-selection-to-front", function() { reorderSelection('front') })
            RED.actions.add("core:move-selection-to-back", function() { reorderSelection('back') })


            RED.actions.add("core:step-selection-up", function() { moveSelection(0,-RED.view.gridSize());});
            RED.actions.add("core:step-selection-right", function() { moveSelection(RED.view.gridSize(),0);});
            RED.actions.add("core:step-selection-down", function() { moveSelection(0,RED.view.gridSize());});
            RED.actions.add("core:step-selection-left", function() { moveSelection(-RED.view.gridSize(),0);});

            RED.actions.add("core:select-connected-nodes", function() { selectConnected("all") });
            RED.actions.add("core:select-downstream-nodes", function() { selectConnected("down") });
            RED.actions.add("core:select-upstream-nodes", function() { selectConnected("up") });


            RED.actions.add("core:go-to-next-node", function() { gotoNextNode() })
            RED.actions.add("core:go-to-previous-node", function() { gotoPreviousNode() })
            RED.actions.add("core:go-to-next-sibling", function() { gotoNextSibling() })
            RED.actions.add("core:go-to-previous-sibling", function() { gotoPreviousSibling() })


            RED.actions.add("core:go-to-nearest-node-on-left", function() { gotoNearestNode('left')})
            RED.actions.add("core:go-to-nearest-node-on-right", function() { gotoNearestNode('right')})
            RED.actions.add("core:go-to-nearest-node-above", function() { gotoNearestNode('up') })
            RED.actions.add("core:go-to-nearest-node-below", function() { gotoNearestNode('down') })

            RED.actions.add("core:align-selection-to-grid", alignToGrid);
            RED.actions.add("core:align-selection-to-left", function() { alignSelectionToEdge('left') })
            RED.actions.add("core:align-selection-to-right", function() { alignSelectionToEdge('right') })
            RED.actions.add("core:align-selection-to-top", function() { alignSelectionToEdge('top') })
            RED.actions.add("core:align-selection-to-bottom", function() { alignSelectionToEdge('bottom') })
            RED.actions.add("core:align-selection-to-middle", function() { alignSelectionToEdge('middle') })
            RED.actions.add("core:align-selection-to-center", function() { alignSelectionToEdge('center') })

            RED.actions.add("core:distribute-selection-horizontally", function() { distributeSelection('h') })
            RED.actions.add("core:distribute-selection-vertically", function() { distributeSelection('v') })

            RED.actions.add("core:wire-series-of-nodes", function() { wireSeriesOfNodes() })
            RED.actions.add("core:wire-node-to-multiple", function() { wireNodeToMultiple() })
            RED.actions.add("core:wire-multiple-to-node", function() { wireMultipleToNode() })

            RED.actions.add("core:split-wire-with-link-nodes", function () { splitWiresWithLinkNodes() });
            RED.actions.add("core:split-wires-with-junctions", function (options) { addJunctionsToWires(options) });

            RED.actions.add("core:generate-node-names", generateNodeNames )

            RED.actions.add("core:copy-item-url", function (node) { copyItemUrl(node) })
            RED.actions.add("core:copy-item-edit-url", function (node) { copyItemUrl(node, true) })

            // RED.actions.add("core:add-node", function() { addNode() })
        },
        /**
         * Aligns all selected nodes to the current grid
         */
        alignSelectionToGrid: alignToGrid,
        /**
         * Moves all of the selected nodes by the specified amount
         * @param  {Number} dx
         * @param  {Number} dy
         */
        moveSelection: moveSelection,
        calculateGridSnapOffsets: calculateGridSnapOffsets,
        isPointInNode: isPointInNode
    }

})();
