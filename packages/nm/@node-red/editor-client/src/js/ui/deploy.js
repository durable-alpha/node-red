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

RED.deploy = (function() {

    var deploymentTypes = {
        "full":{img:"red/images/deploy-full-o.svg"},
        "nodes":{img:"red/images/deploy-nodes-o.svg"},
        "flows":{img:"red/images/deploy-flows-o.svg"}
    }

    var ignoreDeployWarnings = {
        unknown: false,
        unusedConfig: false,
        invalid: false
    }

    var deploymentType = "full";

    var deployInflight = false;

    var currentDiff = null;

    var activeBackgroundDeployNotification;

    function changeDeploymentType(type) {
        deploymentType = type;
        $("#red-ui-header-button-deploy-icon").attr("src",deploymentTypes[type].img);
    }

    /**
     * options:
     *   type: "default" - Button with drop-down options - no further customisation available
     *      label: the text to display - default: "Deploy"
     *   type: "simple"  - Button without dropdown. Customisations:
     *      label: the text to display - default: "Deploy"
     *      icon : the icon to use. Null removes the icon. default: "red/images/deploy-full-o.svg"
     */
    function init(options) {
        options = options || {};
        var type = options.type || "default";
        var label = options.label || RED._("deploy.deploy");

        if (type == "default") {
            $('<li><span class="red-ui-deploy-button-group button-group">'+
              '<a id="red-ui-header-button-deploy" class="red-ui-deploy-button disabled" href="#">'+
                '<span class="red-ui-deploy-button-content">'+
                 '<img id="red-ui-header-button-deploy-icon" src="red/images/deploy-full-o.svg"> '+
                 '<span>'+label+'</span>'+
                '</span>'+
                '<span class="red-ui-deploy-button-spinner hide">'+
                 '<img src="red/images/spin.svg"/>'+
                '</span>'+
              '</a>'+
              '<a id="red-ui-header-button-deploy-options" class="red-ui-deploy-button" href="#"><i class="fa fa-caret-down"></i><i class="fa fa-lock"></i></a>'+
              '</span></li>').prependTo(".red-ui-header-toolbar");
            const mainMenuItems = [
                    {id:"deploymenu-item-full",toggle:"deploy-type",icon:"red/images/deploy-full.svg",label:RED._("deploy.full"),sublabel:RED._("deploy.fullDesc"),selected: true, onselect:function(s) { if(s){changeDeploymentType("full")}}},
                    {id:"deploymenu-item-flow",toggle:"deploy-type",icon:"red/images/deploy-flows.svg",label:RED._("deploy.modifiedFlows"),sublabel:RED._("deploy.modifiedFlowsDesc"), onselect:function(s) {if(s){changeDeploymentType("flows")}}},
                    {id:"deploymenu-item-node",toggle:"deploy-type",icon:"red/images/deploy-nodes.svg",label:RED._("deploy.modifiedNodes"),sublabel:RED._("deploy.modifiedNodesDesc"),onselect:function(s) { if(s){changeDeploymentType("nodes")}}},
                    null
            ]
            if (RED.settings.runtimeState && RED.settings.runtimeState.ui === true) {
                mainMenuItems.push({id:"deploymenu-item-runtime-start", icon:"red/images/start.svg",label:RED._("deploy.startFlows"),sublabel:RED._("deploy.startFlowsDesc"),onselect:"core:start-flows", visible:false})
                mainMenuItems.push({id:"deploymenu-item-runtime-stop", icon:"red/images/stop.svg",label:RED._("deploy.stopFlows"),sublabel:RED._("deploy.stopFlowsDesc"),onselect:"core:stop-flows", visible:false})
            }
            mainMenuItems.push({id:"deploymenu-item-reload", icon:"red/images/deploy-reload.svg",label:RED._("deploy.restartFlows"),sublabel:RED._("deploy.restartFlowsDesc"),onselect:"core:restart-flows"})
            RED.menu.init({id:"red-ui-header-button-deploy-options", options: mainMenuItems });
        } else if (type == "simple") {
            var icon = 'red/images/deploy-full-o.svg';
            if (options.hasOwnProperty('icon')) {
                icon = options.icon;
            }

            $('<li><span class="red-ui-deploy-button-group button-group">'+
              '<a id="red-ui-header-button-deploy" class="red-ui-deploy-button disabled" href="#">'+
                '<span class="red-ui-deploy-button-content">'+
                  (icon?'<img id="red-ui-header-button-deploy-icon" src="'+icon+'"> ':'')+
                  '<span>'+label+'</span>'+
                '</span>'+
                '<span class="red-ui-deploy-button-spinner hide">'+
                 '<img src="red/images/spin.svg"/>'+
                '</span>'+
              '</a>'+
              '</span></li>').prependTo(".red-ui-header-toolbar");
        }

        $('#red-ui-header-button-deploy').on("click", function(event) {
            event.preventDefault();
            save();
        });

        RED.actions.add("core:deploy-flows",save);
        if (type === "default") {
            if (RED.settings.runtimeState && RED.settings.runtimeState.ui === true) {
                RED.actions.add("core:stop-flows",function() { stopStartFlows("stop") });
                RED.actions.add("core:start-flows",function() { stopStartFlows("start") });
            }
            RED.actions.add("core:restart-flows",restart);
            RED.actions.add("core:set-deploy-type-to-full",function() { RED.menu.setSelected("deploymenu-item-full",true);});
            RED.actions.add("core:set-deploy-type-to-modified-flows",function() { RED.menu.setSelected("deploymenu-item-flow",true); });
            RED.actions.add("core:set-deploy-type-to-modified-nodes",function() { RED.menu.setSelected("deploymenu-item-node",true); });
        }

        window.addEventListener('beforeunload', function (event) {
            if (RED.nodes.dirty()) {
                event.preventDefault();
                event.stopImmediatePropagation()
                event.returnValue = RED._("deploy.confirm.undeployedChanges");
                return
            }
        })

        RED.events.on('workspace:dirty',function(state) {
            if (RED.settings.user?.permissions === 'read') {
                return
            }
            if (state.dirty) {
                // window.onbeforeunload = function() {
                //     return 
                // }
                $("#red-ui-header-button-deploy").removeClass("disabled");
            } else {
                // window.onbeforeunload = null;
                $("#red-ui-header-button-deploy").addClass("disabled");
            }
        });

        RED.comms.subscribe("notification/runtime-deploy",function(topic,msg) {
            var currentRev = RED.nodes.version();
            if (currentRev === null || deployInflight || currentRev === msg.revision) {
                return;
            }
            if (activeBackgroundDeployNotification?.hidden && !activeBackgroundDeployNotification?.closed) {
                activeBackgroundDeployNotification.showNotification()
                return
            }
            const message = $('<p>').text(RED._('deploy.confirm.backgroundUpdate'));
            const options = {
                id: 'background-update',
                type: 'compact',
                modal: false,
                fixed: true,
                timeout: 10000,
                buttons: [
                    {
                        text: RED._('deploy.confirm.button.review'),
                        class: "primary",
                        click: function() {
                            activeBackgroundDeployNotification.hideNotification();
                            var nns = RED.nodes.createCompleteNodeSet();
                            resolveConflict(nns,false);
                        }
                    }
                ]
            }
            if (!activeBackgroundDeployNotification || activeBackgroundDeployNotification.closed) {
                activeBackgroundDeployNotification = RED.notify(message, options)
            } else {
                activeBackgroundDeployNotification.update(message, options)
            }
        });


        updateLockedState()
        RED.events.on('login', updateLockedState)
    }

    function updateLockedState() {
        if (RED.settings.user?.permissions === 'read') {
            $(".red-ui-deploy-button-group").addClass("readOnly");
            $("#red-ui-header-button-deploy").addClass("disabled");
        } else {
            $(".red-ui-deploy-button-group").removeClass("readOnly");
            if (RED.nodes.dirty()) {
                $("#red-ui-header-button-deploy").removeClass("disabled");
            }
        }
    }

    function getNodeInfo(node) {
        var tabLabel = "";
        if (node.z) {
            var tab = RED.nodes.workspace(node.z);
            if (!tab) {
                tab = RED.nodes.subflow(node.z);
                tabLabel = tab.name;
            } else {
                tabLabel = tab.label;
            }
        }
        var label = RED.utils.getNodeLabel(node,node.id);
        return {tab:tabLabel,type:node.type,label:label};
    }
    function sortNodeInfo(A,B) {
        if (A.tab < B.tab) { return -1;}
        if (A.tab > B.tab) { return 1;}
        if (A.type < B.type) { return -1;}
        if (A.type > B.type) { return 1;}
        if (A.name < B.name) { return -1;}
        if (A.name > B.name) { return 1;}
        return 0;
    }

    function resolveConflict(currentNodes, activeDeploy) {
        var message = $('<div>');
        $('<p data-i18n="deploy.confirm.conflict"></p>').appendTo(message);
        var conflictCheck = $('<div class="red-ui-deploy-dialog-confirm-conflict-row">'+
            '<img src="red/images/spin.svg"/><div data-i18n="deploy.confirm.conflictChecking"></div>'+
        '</div>').appendTo(message);
        var conflictAutoMerge = $('<div class="red-ui-deploy-dialog-confirm-conflict-row">'+
            '<i class="fa fa-check"></i><div data-i18n="deploy.confirm.conflictAutoMerge"></div>'+
            '</div>').hide().appendTo(message);
        var conflictManualMerge = $('<div class="red-ui-deploy-dialog-confirm-conflict-row">'+
            '<i class="fa fa-exclamation"></i><div data-i18n="deploy.confirm.conflictManualMerge"></div>'+
            '</div>').hide().appendTo(message);

        message.i18n();
        currentDiff = null;
        var buttons = [
            {
                text: RED._("common.label.cancel"),
                click: function() {
                    conflictNotification.close();
                }
            },
            {
                id: "red-ui-deploy-dialog-confirm-deploy-review",
                text: RED._("deploy.confirm.button.review"),
                class: "primary disabled",
                click: function() {
                    if (!$("#red-ui-deploy-dialog-confirm-deploy-review").hasClass('disabled')) {
                        RED.diff.showRemoteDiff(null, {
                            onmerge: function () {
                                activeBackgroundDeployNotification.close()
                            }
                        });
                        conflictNotification.close();
                    }
                }
            },
            {
                id: "red-ui-deploy-dialog-confirm-deploy-merge",
                text: RED._("deploy.confirm.button.merge"),
                class: "primary disabled",
                click: function() {
                    if (!$("#red-ui-deploy-dialog-confirm-deploy-merge").hasClass('disabled')) {
                        RED.diff.mergeDiff(currentDiff);
                        conflictNotification.close();
                        activeBackgroundDeployNotification.close()
                    }
                }
            }
        ];
        if (activeDeploy) {
            buttons.push({
                id: "red-ui-deploy-dialog-confirm-deploy-overwrite",
                text: RED._("deploy.confirm.button.overwrite"),
                class: "primary",
                click: function() {
                    save(true,activeDeploy);
                    conflictNotification.close();
                    activeBackgroundDeployNotification.close()
                }
            })
        }
        var conflictNotification = RED.notify(message,{
            modal: true,
            fixed: true,
            width: 600,
            buttons: buttons
        });

        RED.diff.getRemoteDiff(function(diff) {
            currentDiff = diff;
            conflictCheck.hide();
            var d = Object.keys(diff.conflicts);
            if (d.length === 0) {
                conflictAutoMerge.show();
                $("#red-ui-deploy-dialog-confirm-deploy-merge").removeClass('disabled')
            } else {
                conflictManualMerge.show();
            }
            $("#red-ui-deploy-dialog-confirm-deploy-review").removeClass('disabled')
        })
    }
    function cropList(list) {
        if (list.length > 5) {
            var remainder = list.length - 5;
            list = list.slice(0,5);
            list.push(RED._("deploy.confirm.plusNMore",{count:remainder}));
        }
        return list;
    }
    function sanitize(html) {
        return html.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    }

    function shadeShow() {
        $("#red-ui-header-shade").show();
        $("#red-ui-editor-shade").show();
        $("#red-ui-palette-shade").show();
        $("#red-ui-sidebar-shade").show();
    }
    function shadeHide() {
        $("#red-ui-header-shade").hide();
        $("#red-ui-editor-shade").hide();
        $("#red-ui-palette-shade").hide();
        $("#red-ui-sidebar-shade").hide();
    }
    function deployButtonSetBusy(){
        $(".red-ui-deploy-button-content").css('opacity',0);
        $(".red-ui-deploy-button-spinner").show();
        $("#red-ui-header-button-deploy").addClass("disabled");
    }
    function deployButtonClearBusy(){
        $(".red-ui-deploy-button-content").css('opacity',1);
        $(".red-ui-deploy-button-spinner").hide();
    }
    function stopStartFlows(state) {
        const startTime = Date.now()
        const deployWasEnabled = !$("#red-ui-header-button-deploy").hasClass("disabled")
        deployInflight = true
        deployButtonSetBusy()
        shadeShow()
        $.ajax({
            url:"flows/state",
            type: "POST",
            data: {state: state}
        }).done(function(data,textStatus,xhr) {
            if (deployWasEnabled) {
                $("#red-ui-header-button-deploy").removeClass("disabled")
            }
        }).fail(function(xhr,textStatus,err) {
            if (deployWasEnabled) {
                $("#red-ui-header-button-deploy").removeClass("disabled")
            }
            if (xhr.status === 401) {
                RED.notify(RED._("notification.error", { message: RED._("user.notAuthorized") }), "error")
            } else if (xhr.responseText) {
                const errorDetail = { message: err ? (err + "") : "" }
                try {
                    errorDetail.message = JSON.parse(xhr.responseText).message
                } finally {
                    errorDetail.message = errorDetail.message || xhr.responseText
                }
                RED.notify(RED._("notification.error", errorDetail), "error")
            } else {
                RED.notify(RED._("notification.error", { message: RED._("deploy.errors.noResponse") }), "error")
            }
        }).always(function() {
            const delta = Math.max(0, 300 - (Date.now() - startTime))
            setTimeout(function () {
                deployButtonClearBusy()
                shadeHide()
                deployInflight = false
            }, delta);
        });
    }
    function restart() {
        var startTime = Date.now();
        var deployWasEnabled = !$("#red-ui-header-button-deploy").hasClass("disabled");
        deployInflight = true;
        deployButtonSetBusy();
        $.ajax({
            url:"flows",
            type: "POST",
            headers: {
                "Node-RED-Deployment-Type":"reload"
            }
        }).done(function(data,textStatus,xhr) {
            if (deployWasEnabled) {
                $("#red-ui-header-button-deploy").removeClass("disabled");
            }
            RED.notify('<p>'+RED._("deploy.successfulRestart")+'</p>',"success");
        }).fail(function(xhr,textStatus,err) {
            if (deployWasEnabled) {
                $("#red-ui-header-button-deploy").removeClass("disabled");
            }
            if (xhr.status === 401) {
                RED.notify(RED._("deploy.deployFailed",{message:RED._("user.notAuthorized")}),"error");
            } else if (xhr.status === 409) {
                resolveConflict(nns, true);
            } else if (xhr.responseText) {
                RED.notify(RED._("deploy.deployFailed",{message:xhr.responseText}),"error");
            } else {
                RED.notify(RED._("deploy.deployFailed",{message:RED._("deploy.errors.noResponse")}),"error");
            }
        }).always(function() {
            var delta = Math.max(0,300-(Date.now()-startTime));
            setTimeout(function() {
                deployButtonClearBusy();
                deployInflight = false;
            },delta);
        });
    }
    function save(skipValidation, force) {
        if ($("#red-ui-header-button-deploy").hasClass("disabled")) {
            return; //deploy is disabled
        }
        if ($("#red-ui-header-shade").is(":visible")) {
            return; //deploy is shaded
        }
        if (!RED.user.hasPermission("flows.write")) {
            RED.notify(RED._("user.errors.deploy"), "error");
            return;
        }
        let hasUnusedConfig = false;
        if (!skipValidation) {
            let hasUnknown = false;
            let hasInvalid = false;
            const unknownNodes = [];
            const invalidNodes = [];

            const isDisabled = function (node) {
                return (node.d || RED.nodes.workspace(node.z)?.disabled);
            };

            RED.nodes.eachConfig(function (node) {
                if (node.valid === undefined) {
                    RED.editor.validateNode(node);
                }
                if (!node.valid && !isDisabled(node)) {
                    invalidNodes.push(getNodeInfo(node));
                }
                if (node.type === "unknown") {
                    if (unknownNodes.indexOf(node.name) == -1) {
                        unknownNodes.push(node.name);
                    }
                }
            });
            RED.nodes.eachNode(function (node) {
                if (!node.valid && !isDisabled(node)) {
                    invalidNodes.push(getNodeInfo(node));
                }
                if (node.type === "unknown") {
                    if (unknownNodes.indexOf(node.name) == -1) {
                        unknownNodes.push(node.name);
                    }
                }
            });
            hasUnknown = unknownNodes.length > 0;
            hasInvalid = invalidNodes.length > 0;

            const unusedConfigNodes = [];
            RED.nodes.eachConfig(function (node) {
                if ((node._def.hasUsers !== false) && (node.users.length === 0) && !isDisabled(node)) {
                    unusedConfigNodes.push(getNodeInfo(node));
                    hasUnusedConfig = true;
                }
            });

            let showWarning = false;
            let notificationMessage;
            let notificationButtons = [];
            let notification;
            if (hasUnknown && !ignoreDeployWarnings.unknown) {
                showWarning = true;
                notificationMessage = "<p>" + RED._('deploy.confirm.unknown') + "</p>" +
                    '<ul class="red-ui-deploy-dialog-confirm-list"><li>' + cropList(unknownNodes).map(function (n) { return sanitize(n) }).join("</li><li>") + "</li></ul><p>" +
                    RED._('deploy.confirm.confirm') +
                    "</p>";

                notificationButtons = [
                    {
                        text: RED._("deploy.unknownNodesButton"),
                        class: "pull-left",
                        click: function() {
                            notification.close();
                            RED.actions.invoke("core:search","type:unknown ");
                        }
                    },
                    {
                        id: "red-ui-deploy-dialog-confirm-deploy-deploy",
                        text: RED._("deploy.confirm.button.confirm"),
                        class: "primary",
                        click: function () {
                            save(true);
                            notification.close();
                        }
                    }
                ];
            } else if (hasInvalid && !ignoreDeployWarnings.invalid) {
                showWarning = true;
                invalidNodes.sort(sortNodeInfo);

                notificationMessage = "<p>" + RED._('deploy.confirm.improperlyConfigured') + "</p>" +
                    '<ul class="red-ui-deploy-dialog-confirm-list"><li>' + cropList(invalidNodes.map(function (A) { return sanitize((A.tab ? "[" + A.tab + "] " : "") + A.label + " (" + A.type + ")") })).join("</li><li>") + "</li></ul><p>" +
                    RED._('deploy.confirm.confirm') +
                    "</p>";
                notificationButtons = [
                    {
                        text: RED._("deploy.invalidNodesButton"),
                        class: "pull-left",
                        click: function() {
                            notification.close();
                            RED.actions.invoke("core:search","is:invalid ");
                        }
                    },
                    {
                        id: "red-ui-deploy-dialog-confirm-deploy-deploy",
                        text: RED._("deploy.confirm.button.confirm"),
                        class: "primary",
                        click: function () {
                            save(true);
                            notification.close();
                        }
                    }
                ];
            }
            if (showWarning) {
                notificationButtons.unshift(
                    {
                        text: RED._("common.label.cancel"),
                        click: function () {
                            notification.close();
                        }
                    }
                );
                notification = RED.notify(notificationMessage, {
                    modal: true,
                    fixed: true,
                    buttons: notificationButtons
                });
                return;
            }
        }

        const nns = RED.nodes.createCompleteNodeSet();
        const startTime = Date.now();

        deployButtonSetBusy();
        const data = { flows: nns };
        if (!force) {
            data.rev = RED.nodes.version();
        }

        deployInflight = true;
        shadeShow();
        $.ajax({
            url: "flows",
            type: "POST",
            data: JSON.stringify(data),
            contentType: "application/json; charset=utf-8",
            headers: {
                "Node-RED-Deployment-Type": deploymentType
            }
        }).done(function (data, textStatus, xhr) {
            RED.nodes.dirty(false);
            RED.nodes.version(data.rev);
            RED.nodes.originalFlow(nns);
            if (hasUnusedConfig) {
                let notification;
                const opts = {
                    type: "success",
                    fixed: false,
                    timeout: 6000,
                    buttons: [
                        {
                            text: RED._("deploy.unusedConfigNodesButton"),
                            class: "pull-left",
                            click: function() {
                                notification.close();
                                RED.actions.invoke("core:search","is:config is:unused ");
                            }
                        },
                        {
                            text: RED._("common.label.close"),
                            class: "primary",
                            click: function () {
                                save(true);
                                notification.close();
                            }
                        }
                    ]
                }
                notification = RED.notify(
                    '<p>' + RED._("deploy.successfulDeploy") + '</p>' +
                    '<p>' + RED._("deploy.unusedConfigNodes") + '</p>', opts);
            } else {
                RED.notify('<p>' + RED._("deploy.successfulDeploy") + '</p>', "success");
            }
            const flowsToLock = new Set()
            // Node's properties cannot be modified if its workspace is locked.
            function ensureUnlocked(id) {
                // TODO: `RED.nodes.subflow` is useless
                const flow = id && (RED.nodes.workspace(id) || RED.nodes.subflow(id) || null);
                const isLocked = flow ? flow.locked : false;
                if (flow && isLocked) {
                    flow.locked = false;
                    flowsToLock.add(flow)
                }
            }
            RED.nodes.eachNode(function (node) {
                ensureUnlocked(node.z)
                if (node.changed) {
                    node.dirty = true;
                    node.changed = false;
                }
                if (node.moved) {
                    node.dirty = true;
                    node.moved = false;
                }
                if (node.credentials) {
                    delete node.credentials;
                }
            });
            RED.nodes.eachGroup(function (node) {
                ensureUnlocked(node.z)
                if (node.changed) {
                    node.dirty = true;
                    node.changed = false;
                }
                if (node.moved) {
                    node.dirty = true;
                    node.moved = false;
                }
            })
            RED.nodes.eachJunction(function (node) {
                ensureUnlocked(node.z)
                if (node.changed) {
                    node.dirty = true;
                    node.changed = false;
                }
                if (node.moved) {
                    node.dirty = true;
                    node.moved = false;
                }
            })
            RED.nodes.eachConfig(function (confNode) {
                if (confNode.z) {
                    ensureUnlocked(confNode.z)
                }
                confNode.changed = false;
                if (confNode.credentials) {
                    delete confNode.credentials;
                }
            });
            // Subflow cannot be locked
            RED.nodes.eachSubflow(function (subflow) {
                if (subflow.changed) {
                    subflow.changed = false;
                    RED.events.emit("subflows:change", subflow);
                }
            });
            RED.nodes.eachWorkspace(function (ws) {
                if (ws.changed || ws.added) {
                    // Ensure the Workspace is unlocked to modify its properties.
                    ensureUnlocked(ws.id);
                    ws.changed = false;
                    delete ws.added
                    if (flowsToLock.has(ws)) {
                        ws.locked = true;
                        flowsToLock.delete(ws);
                    }
                    RED.events.emit("flows:change", ws)
                }
            });
            // Ensures all workspaces to be locked have been locked.
            flowsToLock.forEach(flow => {
                flow.locked = true
            })
            // Once deployed, cannot undo back to a clean state
            RED.history.markAllDirty();
            RED.view.redraw();
            RED.sidebar.config.refresh();
            RED.events.emit("deploy");
        }).fail(function (xhr, textStatus, err) {
            RED.nodes.dirty(true);
            $("#red-ui-header-button-deploy").removeClass("disabled");
            if (xhr.status === 401) {
                RED.notify(RED._("deploy.deployFailed", { message: RED._("user.notAuthorized") }), "error");
            } else if (xhr.status === 409) {
                resolveConflict(nns, true);
            } else if (xhr.responseText) {
                RED.notify(RED._("deploy.deployFailed", { message: xhr.responseText }), "error");
            } else {
                RED.notify(RED._("deploy.deployFailed", { message: RED._("deploy.errors.noResponse") }), "error");
            }
        }).always(function () {
            const delta = Math.max(0, 300 - (Date.now() - startTime));
            setTimeout(function () {
                deployInflight = false;
                deployButtonClearBusy()
                shadeHide()
            }, delta);
        });
    }
    return {
        init: init,
        setDeployInflight: function(state) {
            deployInflight = state;
        }

    }
})();
