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
var RED = (function () {
  function loadPluginList() {
    loader.reportProgress(RED._("event.loadPlugins"), 10);
    $.ajax({
      headers: {
        Accept: "application/json"
      },
      cache: false,
      url: "plugins",
      success: function (data) {
        RED.plugins.setPluginList(data);
        loader.reportProgress(RED._("event.loadPlugins"), 13);
        RED.i18n.loadPluginCatalogs(function () {
          loadPlugins(function () {
            loadNodeList();
          });
        });
      }
    });
  }
  function loadPlugins(done) {
    loader.reportProgress(RED._("event.loadPlugins", { count: "" }), 17);
    var lang = localStorage.getItem("editor-language") || RED.i18n.detectLanguage();

    $.ajax({
      headers: {
        Accept: "text/html",
        "Accept-Language": lang
      },
      cache: false,
      url: "plugins",
      success: function (data) {
        var configs = data.trim().split(/(?=<!-- --- \[red-plugin:\S+\] --- -->)/);
        var totalCount = configs.length;
        var stepConfig = function () {
          // loader.reportProgress(RED._("event.loadNodes",{count:(totalCount-configs.length)+"/"+totalCount}), 30 + ((totalCount-configs.length)/totalCount)*40 )
          if (configs.length === 0) {
            done();
          } else {
            var config = configs.shift();
            appendPluginConfig(config, stepConfig);
          }
        };
        stepConfig();
      }
    });
  }

  function appendConfig(config, moduleIdMatch, targetContainer, done) {
    done = done || function () {};
    var moduleId;
    if (moduleIdMatch) {
      moduleId = moduleIdMatch[1];
      RED._loadingModule = moduleId;
    } else {
      moduleId = "unknown";
    }
    try {
      var hasDeferred = false;
      var nodeConfigEls = $("<div>" + config + "</div>");
      var scripts = nodeConfigEls.find("script");
      var scriptCount = scripts.length;
      scripts.each(function (i, el) {
        var srcUrl = $(el).attr("src");
        if (srcUrl && !/^\s*(https?:|\/|\.)/.test(srcUrl)) {
          $(el).remove();
          var newScript = document.createElement("script");
          newScript.onload = function () {
            scriptCount--;
            if (scriptCount === 0) {
              $(targetContainer).append(nodeConfigEls);
              delete RED._loadingModule;
              done();
            }
          };
          if ($(el).attr("type") === "module") {
            newScript.type = "module";
          }
          $(targetContainer).append(newScript);
          newScript.src = RED.settings.apiRootUrl + srcUrl;
          hasDeferred = true;
        } else {
          if (/\/ace.js$/.test(srcUrl) || /\/ext-language_tools.js$/.test(srcUrl)) {
            // Block any attempts to load ace.js from a CDN - this will
            // break the version of ace included in the editor.
            // At the time of commit, the contrib-python nodes did this.
            // This is a crude fix until the python nodes are fixed.
            console.warn("Blocked attempt to load", srcUrl, "by", moduleId);
            $(el).remove();
          }
          scriptCount--;
        }
      });
      if (!hasDeferred) {
        $(targetContainer).append(nodeConfigEls);
        delete RED._loadingModule;
        done();
      }
    } catch (err) {
      RED.notify(RED._("notification.errors.failedToAppendNode", { module: moduleId, error: err.toString() }), {
        type: "error",
        timeout: 10000
      });
      console.log("[" + moduleId + "] " + err.toString());
      delete RED._loadingModule;
      done();
    }
  }
  function appendPluginConfig(pluginConfig, done) {
    appendConfig(
      pluginConfig,
      /<!-- --- \[red-plugin:(\S+)\] --- -->/.exec(pluginConfig.trim()),
      "#red-ui-editor-plugin-configs",
      done
    );
  }

  function appendNodeConfig(nodeConfig, done) {
    appendConfig(
      nodeConfig,
      /<!-- --- \[red-module:(\S+)\] --- -->/.exec(nodeConfig.trim()),
      "#red-ui-editor-node-configs",
      done
    );
  }

  function loadNodeList() {
    loader.reportProgress(RED._("event.loadPalette"), 20);
    $.ajax({
      headers: {
        Accept: "application/json"
      },
      cache: false,
      url: "nodes",
      success: function (data) {
        RED.nodes.setNodeList(data);
        loader.reportProgress(RED._("event.loadNodeCatalogs"), 25);
        RED.i18n.loadNodeCatalogs(function () {
          loadIconList(loadNodes);
        });
      }
    });
  }

  function loadIconList(done) {
    $.ajax({
      headers: {
        Accept: "application/json"
      },
      cache: false,
      url: "icons",
      success: function (data) {
        RED.nodes.setIconSets(data);
        if (done) {
          done();
        }
      }
    });
  }

  function loadNodes() {
    loader.reportProgress(RED._("event.loadNodes", { count: "" }), 30);
    var lang = localStorage.getItem("editor-language") || RED.i18n.detectLanguage();

    $.ajax({
      headers: {
        Accept: "text/html",
        "Accept-Language": lang
      },
      cache: false,
      url: "nodes",
      success: function (data) {
        var configs = data.trim().split(/(?=<!-- --- \[red-module:\S+\] --- -->)/);
        var totalCount = configs.length;

        var stepConfig = function () {
          loader.reportProgress(
            RED._("event.loadNodes", { count: totalCount - configs.length + "/" + totalCount }),
            30 + ((totalCount - configs.length) / totalCount) * 40
          );

          if (configs.length === 0) {
            $("#red-ui-editor").i18n();
            $("#red-ui-palette > .red-ui-palette-spinner").hide();
            $(".red-ui-palette-scroll").removeClass("hide");
            $("#red-ui-palette-search").removeClass("hide");
            if (RED.settings.theme("projects.enabled", false)) {
              RED.projects.refresh(function (activeProject) {
                loadFlows(function () {
                  RED.sidebar.info.refresh();
                  var showProjectWelcome = false;
                  if (!activeProject) {
                    // Projects enabled but no active project
                    RED.menu.setDisabled("menu-item-projects-open", true);
                    RED.menu.setDisabled("menu-item-projects-settings", true);
                    if (activeProject === false) {
                      // User previously decline the migration to projects.
                    } else {
                      // null/undefined
                      showProjectWelcome = true;
                    }
                  }
                  completeLoad(showProjectWelcome);
                });
              });
            } else {
              loadFlows(function () {
                // Projects disabled by the user
                RED.sidebar.info.refresh();
                completeLoad();
              });
            }
          } else {
            var config = configs.shift();
            appendNodeConfig(config, stepConfig);
          }
        };
        stepConfig();
      }
    });
  }

  function loadFlows(done) {
    loader.reportProgress(RED._("event.loadFlows"), 80);
    $.ajax({
      headers: {
        Accept: "application/json"
      },
      cache: false,
      url: "flows",
      success: function (nodes) {
        if (nodes) {
          var currentHash = window.location.hash;
          RED.nodes.version(nodes.rev);
          loader.reportProgress(RED._("event.importFlows"), 90);
          try {
            RED.nodes.import(nodes.flows);
            RED.nodes.dirty(false);
            RED.view.redraw(true);
            if (/^#(flow|node|group)\/.+$/.test(currentHash)) {
              const hashParts = currentHash.split("/");
              const showEditDialog = hashParts.length > 2 && hashParts[2] === "edit";
              if (hashParts[0] === "#flow") {
                RED.workspaces.show(hashParts[1], true);
                if (showEditDialog) {
                  RED.workspaces.edit();
                }
              } else if (hashParts[0] === "#node") {
                const nodeToShow = RED.nodes.node(hashParts[1]);
                if (nodeToShow) {
                  setTimeout(() => {
                    RED.view.reveal(nodeToShow.id);
                    window.location.hash = currentHash;
                    RED.view.select(nodeToShow.id);
                    if (showEditDialog) {
                      RED.editor.edit(nodeToShow);
                    }
                  }, 50);
                }
              } else if (hashParts[0] === "#group") {
                const nodeToShow = RED.nodes.group(hashParts[1]);
                if (nodeToShow) {
                  RED.view.reveal(nodeToShow.id);
                  window.location.hash = currentHash;
                  RED.view.select(nodeToShow.id);
                  if (showEditDialog) {
                    RED.editor.editGroup(nodeToShow);
                  }
                }
              }
            }
            if (RED.workspaces.count() > 0) {
              const hiddenTabs = JSON.parse(RED.settings.getLocal("hiddenTabs") || "{}");
              const workspaces = RED.nodes.getWorkspaceOrder();
              if (RED.workspaces.active() === 0) {
                for (let index = 0; index < workspaces.length; index++) {
                  const ws = workspaces[index];
                  if (!hiddenTabs[ws]) {
                    RED.workspaces.show(ws);
                    break;
                  }
                }
              }
              if (RED.workspaces.active() === 0) {
                RED.workspaces.show(workspaces[0]);
              }
            }
            RED.events.emit("flows:loaded");
          } catch (err) {
            console.warn(err);
            RED.notify(RED._("event.importError", { message: err.message }), {
              fixed: true,
              type: "error"
            });
          }
        }
        done();
      }
    });
  }

  function completeLoad(showProjectWelcome) {
    var persistentNotifications = {};
    RED.comms.subscribe("notification/#", function (topic, msg) {
      var parts = topic.split("/");
      var notificationId = parts[1];
      if (notificationId === "runtime-deploy") {
        // handled in ui/deploy.js
        return;
      }
      if (notificationId === "node") {
        // handled below
        return;
      }
      if (notificationId === "flows-run-state") {
        // handled in editor-client/src/js/runtime.js
        return;
      }
      if (notificationId === "project-update") {
        loader.start(RED._("event.loadingProject"), 0);
        RED.nodes.clear();
        RED.history.clear();
        RED.view.redraw(true);
        RED.projects.refresh(function () {
          loadFlows(function () {
            var project = RED.projects.getActiveProject();
            var message = {
              "change-branch": RED._("notification.project.change-branch", { project: project.git.branches.local }),
              "merge-abort": RED._("notification.project.merge-abort"),
              loaded: RED._("notification.project.loaded", { project: msg.project }),
              updated: RED._("notification.project.updated", { project: msg.project }),
              pull: RED._("notification.project.pull", { project: msg.project }),
              revert: RED._("notification.project.revert", { project: msg.project }),
              "merge-complete": RED._("notification.project.merge-complete")
            }[msg.action];
            loader.end();
            RED.notify($("<p>").text(message));
            RED.sidebar.info.refresh();
            RED.menu.setDisabled("menu-item-projects-open", false);
            RED.menu.setDisabled("menu-item-projects-settings", false);
          });
        });
        return;
      }

      if (msg.text) {
        msg.default = msg.text;
        var text = RED._(msg.text, msg);
        var options = {
          type: msg.type,
          fixed: msg.timeout === undefined,
          timeout: msg.timeout,
          id: notificationId
        };
        if (notificationId === "runtime-state") {
          if (msg.error === "safe-mode") {
            options.buttons = [
              {
                text: RED._("common.label.close"),
                click: function () {
                  persistentNotifications[notificationId].hideNotification();
                }
              }
            ];
          } else if (msg.error === "missing-types") {
            text += "<ul><li>" + msg.types.map(RED.utils.sanitize).join("</li><li>") + "</li></ul>";
            if (!!RED.projects.getActiveProject()) {
              options.buttons = [
                {
                  text: RED._("notification.label.manage-project-dep"),
                  click: function () {
                    persistentNotifications[notificationId].hideNotification();
                    RED.projects.settings.show("deps");
                  }
                }
              ];
              // } else if (RED.settings.get('externalModules.palette.allowInstall', true) !== false) {
            } else {
              options.buttons = [
                {
                  text: RED._("notification.label.unknownNodesButton"),
                  class: "pull-left",
                  click: function () {
                    RED.actions.invoke("core:search", "type:unknown ");
                  }
                },
                {
                  class: "primary",
                  text: RED._("common.label.close"),
                  click: function () {
                    persistentNotifications[notificationId].hideNotification();
                  }
                }
              ];
            }
          } else if (msg.error === "missing-modules") {
            text +=
              "<ul><li>" +
              msg.modules
                .map(function (m) {
                  return (
                    RED.utils.sanitize(m.module) +
                    (m.error ? " - <small>" + RED.utils.sanitize("" + m.error) + "</small>" : "")
                  );
                })
                .join("</li><li>") +
              "</li></ul>";
            options.buttons = [
              {
                text: RED._("common.label.close"),
                click: function () {
                  persistentNotifications[notificationId].hideNotification();
                }
              }
            ];
          } else if (msg.error === "credentials_load_failed") {
            if (RED.settings.theme("projects.enabled", false)) {
              // projects enabled
              if (RED.user.hasPermission("projects.write")) {
                options.buttons = [
                  {
                    text: RED._("notification.project.setupCredentials"),
                    click: function () {
                      persistentNotifications[notificationId].hideNotification();
                      RED.projects.showCredentialsPrompt();
                    }
                  }
                ];
              }
            } else {
              options.buttons = [
                {
                  text: RED._("common.label.close"),
                  click: function () {
                    persistentNotifications[notificationId].hideNotification();
                  }
                }
              ];
            }
          } else if (msg.error === "missing_flow_file") {
            if (RED.user.hasPermission("projects.write")) {
              options.buttons = [
                {
                  text: RED._("notification.project.setupProjectFiles"),
                  click: function () {
                    persistentNotifications[notificationId].hideNotification();
                    RED.projects.showFilesPrompt();
                  }
                }
              ];
            }
          } else if (msg.error === "missing_package_file") {
            if (RED.user.hasPermission("projects.write")) {
              options.buttons = [
                {
                  text: RED._("notification.project.setupProjectFiles"),
                  click: function () {
                    persistentNotifications[notificationId].hideNotification();
                    RED.projects.showFilesPrompt();
                  }
                }
              ];
            }
          } else if (msg.error === "project_empty") {
            if (RED.user.hasPermission("projects.write")) {
              options.buttons = [
                {
                  text: RED._("notification.project.no"),
                  click: function () {
                    persistentNotifications[notificationId].hideNotification();
                  }
                },
                {
                  text: RED._("notification.project.createDefault"),
                  click: function () {
                    persistentNotifications[notificationId].hideNotification();
                    RED.projects.createDefaultFileSet();
                  }
                }
              ];
            }
          } else if (msg.error === "git_merge_conflict") {
            RED.nodes.clear();
            RED.sidebar.versionControl.refresh(true);
            if (RED.user.hasPermission("projects.write")) {
              options.buttons = [
                {
                  text: RED._("notification.project.mergeConflict"),
                  click: function () {
                    persistentNotifications[notificationId].hideNotification();
                    RED.sidebar.versionControl.showLocalChanges();
                  }
                }
              ];
            }
          }
        } else if (notificationId === "restart-required") {
          options.buttons = [
            {
              text: RED._("common.label.close"),
              click: function () {
                persistentNotifications[notificationId].hideNotification();
              }
            }
          ];
        }
        if (!persistentNotifications.hasOwnProperty(notificationId)) {
          persistentNotifications[notificationId] = RED.notify(text, options);
        } else {
          persistentNotifications[notificationId].update(text, options);
        }
      } else if (persistentNotifications.hasOwnProperty(notificationId)) {
        persistentNotifications[notificationId].close();
        delete persistentNotifications[notificationId];
      }
      if (notificationId === "runtime-state") {
        RED.events.emit("runtime-state", msg);
      }
    });
    RED.comms.subscribe("status/#", function (topic, msg) {
      var parts = topic.split("/");
      var node = RED.nodes.node(parts[1]);
      if (node) {
        if (msg.hasOwnProperty("text") && msg.text !== null && /^[@a-zA-Z]/.test(msg.text)) {
          msg.text = node._(msg.text.toString(), { defaultValue: msg.text.toString() });
        }
        node.status = msg;
        node.dirtyStatus = true;
        node.dirty = true;
        RED.view.redrawStatus(node);
      }
    });
    RED.comms.subscribe("notification/plugin/#", function (topic, msg) {
      if (topic == "notification/plugin/added") {
        RED.settings.refreshSettings(function (err, data) {
          let addedPlugins = [];
          msg.forEach(function (m) {
            let id = m.id;
            RED.plugins.addPlugin(m);

            m.plugins.forEach((p) => {
              addedPlugins.push(p.id);
            });

            RED.i18n.loadNodeCatalog(id, function () {
              var lang = localStorage.getItem("editor-language") || RED.i18n.detectLanguage();
              $.ajax({
                headers: {
                  Accept: "text/html",
                  "Accept-Language": lang
                },
                cache: false,
                url: "plugins/" + id,
                success: function (data) {
                  appendPluginConfig(data);
                }
              });
            });
          });
          if (addedPlugins.length) {
            let pluginList = "<ul><li>" + addedPlugins.map(RED.utils.sanitize).join("</li><li>") + "</li></ul>";
            // ToDo: Adapt notification (node -> plugin)
            RED.notify(RED._("palette.event.nodeAdded", { count: addedPlugins.length }) + pluginList, "success");
          }
        });
      }
    });

    let pendingNodeRemovedNotifications = [];
    let pendingNodeRemovedTimeout;

    RED.comms.subscribe("notification/node/#", function (topic, msg) {
      var i, m;
      var typeList;
      var info;
      if (topic == "notification/node/added") {
        RED.settings.refreshSettings(function (err, data) {
          var addedTypes = [];
          msg.forEach(function (m) {
            var id = m.id;
            RED.nodes.addNodeSet(m);
            addedTypes = addedTypes.concat(m.types);
            RED.i18n.loadNodeCatalog(id, function () {
              var lang = localStorage.getItem("editor-language") || RED.i18n.detectLanguage();
              $.ajax({
                headers: {
                  Accept: "text/html",
                  "Accept-Language": lang
                },
                cache: false,
                url: "nodes/" + id,
                success: function (data) {
                  appendNodeConfig(data);
                }
              });
            });
          });
          if (addedTypes.length) {
            typeList = "<ul><li>" + addedTypes.map(RED.utils.sanitize).join("</li><li>") + "</li></ul>";
            RED.notify(RED._("palette.event.nodeAdded", { count: addedTypes.length }) + typeList, "success");
          }
          loadIconList();
        });
      } else if (topic == "notification/node/removed") {
        for (i = 0; i < msg.length; i++) {
          m = msg[i];
          info = RED.nodes.removeNodeSet(m.id);
          if (info.added) {
            pendingNodeRemovedNotifications = pendingNodeRemovedNotifications.concat(m.types.map(RED.utils.sanitize));
            if (pendingNodeRemovedTimeout) {
              clearTimeout(pendingNodeRemovedTimeout);
            }
            pendingNodeRemovedTimeout = setTimeout(function () {
              typeList = "<ul><li>" + pendingNodeRemovedNotifications.join("</li><li>") + "</li></ul>";
              RED.notify(
                RED._("palette.event.nodeRemoved", { count: pendingNodeRemovedNotifications.length }) + typeList,
                "success"
              );
              pendingNodeRemovedNotifications = [];
            }, 200);
          }
        }
        loadIconList();
      } else if (topic == "notification/node/enabled") {
        if (msg.types) {
          RED.settings.refreshSettings(function (err, data) {
            info = RED.nodes.getNodeSet(msg.id);
            if (info.added) {
              RED.nodes.enableNodeSet(msg.id);
              typeList = "<ul><li>" + msg.types.map(RED.utils.sanitize).join("</li><li>") + "</li></ul>";
              RED.notify(RED._("palette.event.nodeEnabled", { count: msg.types.length }) + typeList, "success");
            } else {
              var lang = localStorage.getItem("editor-language") || RED.i18n.detectLanguage();
              $.ajax({
                headers: {
                  Accept: "text/html",
                  "Accept-Language": lang
                },
                cache: false,
                url: "nodes/" + msg.id,
                success: function (data) {
                  appendNodeConfig(data);
                  typeList = "<ul><li>" + msg.types.map(RED.utils.sanitize).join("</li><li>") + "</li></ul>";
                  RED.notify(RED._("palette.event.nodeAdded", { count: msg.types.length }) + typeList, "success");
                }
              });
            }
          });
        }
      } else if (topic == "notification/node/disabled") {
        if (msg.types) {
          RED.nodes.disableNodeSet(msg.id);
          typeList = "<ul><li>" + msg.types.map(RED.utils.sanitize).join("</li><li>") + "</li></ul>";
          RED.notify(RED._("palette.event.nodeDisabled", { count: msg.types.length }) + typeList, "success");
        }
      } else if (topic == "notification/node/upgraded") {
        RED.notify(RED._("palette.event.nodeUpgraded", { module: msg.module, version: msg.version }), "success");
        RED.nodes.registry.setModulePendingUpdated(msg.module, msg.version);
      }
    });
    RED.comms.subscribe("event-log/#", function (topic, payload) {
      var id = topic.substring(9);
      RED.eventLog.log(id, payload);
    });

    $(".red-ui-header-toolbar").show();

    RED.sidebar.show(":first", true);

    setTimeout(function () {
      loader.end();
      checkFirstRun(function () {
        if (showProjectWelcome) {
          RED.projects.showStartup();
        }
      });
    }, 100);
  }

  function checkFirstRun(done) {
    if (RED.settings.theme("tours") === false) {
      done();
      return;
    }
    if (!RED.settings.get("editor.view.view-show-welcome-tours", true)) {
      done();
      return;
    }
  }

  function buildMainMenu() {
    var menuOptions = [];
    if (RED.settings.theme("projects.enabled", false)) {
      menuOptions.push({
        id: "menu-item-projects-menu",
        label: RED._("menu.label.projects"),
        options: [
          {
            id: "menu-item-projects-new",
            label: RED._("menu.label.projects-new"),
            disabled: false,
            onselect: "core:new-project"
          },
          {
            id: "menu-item-projects-open",
            label: RED._("menu.label.projects-open"),
            disabled: false,
            onselect: "core:open-project"
          },
          {
            id: "menu-item-projects-settings",
            label: RED._("menu.label.projects-settings"),
            disabled: false,
            onselect: "core:show-project-settings"
          }
        ]
      });
    }
    menuOptions.push({
      id: "menu-item-edit-menu",
      label: RED._("menu.label.edit"),
      options: [
        { id: "menu-item-edit-undo", label: RED._("keyboard.undoChange"), disabled: true, onselect: "core:undo" },
        { id: "menu-item-edit-redo", label: RED._("keyboard.redoChange"), disabled: true, onselect: "core:redo" },
        null,
        {
          id: "menu-item-edit-cut",
          label: RED._("keyboard.cutNode"),
          onselect: "core:cut-selection-to-internal-clipboard"
        },
        {
          id: "menu-item-edit-copy",
          label: RED._("keyboard.copyNode"),
          onselect: "core:copy-selection-to-internal-clipboard"
        },
        {
          id: "menu-item-edit-paste",
          label: RED._("keyboard.pasteNode"),
          disabled: true,
          onselect: "core:paste-from-internal-clipboard"
        },
        null,
        {
          id: "menu-item-edit-copy-group-style",
          label: RED._("keyboard.copyGroupStyle"),
          onselect: "core:copy-group-style"
        },
        {
          id: "menu-item-edit-paste-group-style",
          label: RED._("keyboard.pasteGroupStyle"),
          disabled: true,
          onselect: "core:paste-group-style"
        },
        null,
        { id: "menu-item-edit-select-all", label: RED._("keyboard.selectAll"), onselect: "core:select-all-nodes" },
        {
          id: "menu-item-edit-select-connected",
          label: RED._("keyboard.selectAllConnected"),
          onselect: "core:select-connected-nodes"
        },
        { id: "menu-item-edit-select-none", label: RED._("keyboard.selectNone"), onselect: "core:select-none" },
        null,
        {
          id: "menu-item-edit-split-wire-with-links",
          label: RED._("keyboard.splitWireWithLinks"),
          onselect: "core:split-wire-with-link-nodes"
        }
      ]
    });

    menuOptions.push({
      id: "menu-item-view-menu",
      label: RED._("menu.label.view.view"),
      options: [
        {
          id: "menu-item-palette",
          label: RED._("menu.label.palette.show"),
          toggle: true,
          onselect: "core:toggle-palette",
          selected: true
        },
        {
          id: "menu-item-sidebar",
          label: RED._("menu.label.sidebar.show"),
          toggle: true,
          onselect: "core:toggle-sidebar",
          selected: true
        },
        { id: "menu-item-event-log", label: RED._("eventLog.title"), onselect: "core:show-event-log" },
        { id: "menu-item-action-list", label: RED._("keyboard.actionList"), onselect: "core:show-action-list" },
        null
      ]
    });

    menuOptions.push({
      id: "menu-item-arrange-menu",
      label: RED._("menu.label.arrange"),
      options: [
        {
          id: "menu-item-view-tools-align-left",
          label: RED._("menu.label.alignLeft"),
          disabled: true,
          onselect: "core:align-selection-to-left"
        },
        {
          id: "menu-item-view-tools-align-center",
          label: RED._("menu.label.alignCenter"),
          disabled: true,
          onselect: "core:align-selection-to-center"
        },
        {
          id: "menu-item-view-tools-align-right",
          label: RED._("menu.label.alignRight"),
          disabled: true,
          onselect: "core:align-selection-to-right"
        },
        null,
        {
          id: "menu-item-view-tools-align-top",
          label: RED._("menu.label.alignTop"),
          disabled: true,
          onselect: "core:align-selection-to-top"
        },
        {
          id: "menu-item-view-tools-align-middle",
          label: RED._("menu.label.alignMiddle"),
          disabled: true,
          onselect: "core:align-selection-to-middle"
        },
        {
          id: "menu-item-view-tools-align-bottom",
          label: RED._("menu.label.alignBottom"),
          disabled: true,
          onselect: "core:align-selection-to-bottom"
        },
        null,
        {
          id: "menu-item-view-tools-distribute-horizontally",
          label: RED._("menu.label.distributeHorizontally"),
          disabled: true,
          onselect: "core:distribute-selection-horizontally"
        },
        {
          id: "menu-item-view-tools-distribute-veritcally",
          label: RED._("menu.label.distributeVertically"),
          disabled: true,
          onselect: "core:distribute-selection-vertically"
        },
        null,
        {
          id: "menu-item-view-tools-move-to-back",
          label: RED._("menu.label.moveToBack"),
          disabled: true,
          onselect: "core:move-selection-to-back"
        },
        {
          id: "menu-item-view-tools-move-to-front",
          label: RED._("menu.label.moveToFront"),
          disabled: true,
          onselect: "core:move-selection-to-front"
        },
        {
          id: "menu-item-view-tools-move-backwards",
          label: RED._("menu.label.moveBackwards"),
          disabled: true,
          onselect: "core:move-selection-backwards"
        },
        {
          id: "menu-item-view-tools-move-forwards",
          label: RED._("menu.label.moveForwards"),
          disabled: true,
          onselect: "core:move-selection-forwards"
        }
      ]
    });

    menuOptions.push(null);
    if (RED.settings.theme("menu.menu-item-import-library", true)) {
      menuOptions.push({
        id: "menu-item-import",
        label: RED._("menu.label.import"),
        onselect: "core:show-import-dialog"
      });
    }
    if (RED.settings.theme("menu.menu-item-export-library", true)) {
      menuOptions.push({
        id: "menu-item-export",
        label: RED._("menu.label.export"),
        onselect: "core:show-export-dialog"
      });
    }
    menuOptions.push(null);
    menuOptions.push({ id: "menu-item-search", label: RED._("menu.label.search"), onselect: "core:search" });
    menuOptions.push(null);
    menuOptions.push({
      id: "menu-item-config-nodes",
      label: RED._("menu.label.displayConfig"),
      onselect: "core:show-config-tab"
    });
    menuOptions.push({
      id: "menu-item-workspace",
      label: RED._("menu.label.flows"),
      options: [
        { id: "menu-item-workspace-add", label: RED._("menu.label.add"), onselect: "core:add-flow" },
        { id: "menu-item-workspace-edit", label: RED._("menu.label.edit"), onselect: "core:edit-flow" },
        { id: "menu-item-workspace-delete", label: RED._("menu.label.delete"), onselect: "core:remove-flow" }
      ]
    });
    menuOptions.push({
      id: "menu-item-subflow",
      label: RED._("menu.label.subflows"),
      options: [
        { id: "menu-item-subflow-create", label: RED._("menu.label.createSubflow"), onselect: "core:create-subflow" },
        {
          id: "menu-item-subflow-convert",
          label: RED._("menu.label.selectionToSubflow"),
          disabled: true,
          onselect: "core:convert-to-subflow"
        }
      ]
    });
    menuOptions.push({
      id: "menu-item-group",
      label: RED._("menu.label.groups"),
      options: [
        {
          id: "menu-item-group-group",
          label: RED._("menu.label.groupSelection"),
          disabled: true,
          onselect: "core:group-selection"
        },
        {
          id: "menu-item-group-ungroup",
          label: RED._("menu.label.ungroupSelection"),
          disabled: true,
          onselect: "core:ungroup-selection"
        },
        null,
        {
          id: "menu-item-group-merge",
          label: RED._("menu.label.groupMergeSelection"),
          disabled: true,
          onselect: "core:merge-selection-to-group"
        },
        {
          id: "menu-item-group-remove",
          label: RED._("menu.label.groupRemoveSelection"),
          disabled: true,
          onselect: "core:remove-selection-from-group"
        }
      ]
    });

    menuOptions.push(null);
    if (RED.settings.get("externalModules.palette.allowInstall", true) !== false) {
      menuOptions.push({
        id: "menu-item-edit-palette",
        label: RED._("menu.label.editPalette"),
        onselect: "core:manage-palette"
      });
      menuOptions.push(null);
    }

    menuOptions.push({
      id: "menu-item-user-settings",
      label: RED._("menu.label.settings"),
      onselect: "core:show-user-settings"
    });
    menuOptions.push(null);

    if (RED.settings.theme("menu.menu-item-keyboard-shortcuts", true)) {
      menuOptions.push({
        id: "menu-item-keyboard-shortcuts",
        label: RED._("menu.label.keyboardShortcuts"),
        onselect: "core:show-help"
      });
    }
    menuOptions.push({
      id: "menu-item-help",
      label: RED.settings.theme("menu.menu-item-help.label", RED._("menu.label.help")),
      href: RED.settings.theme("menu.menu-item-help.url", "https://nodered.org/docs")
    });
    menuOptions.push({
      id: "menu-item-node-red-version",
      label: "v" + RED.settings.version,
      onselect: "core:show-about"
    });

    $('<li><a id="red-ui-header-button-sidemenu" class="button" href="#"><i class="fa fa-bars"></i></a></li>').appendTo(
      ".red-ui-header-toolbar"
    );
    RED.menu.init({ id: "red-ui-header-button-sidemenu", options: menuOptions });
  }

  function loadEditor() {
    RED.workspaces.init();
    RED.statusBar.init();
    RED.view.init();
    RED.userSettings.init();
    RED.user.init();
    RED.notifications.init();
    RED.library.init();
    RED.palette.init();
    RED.eventLog.init();

    if (RED.settings.get("externalModules.palette.allowInstall", true) !== false) {
      RED.palette.editor.init();
    } else {
      console.log("Palette editor disabled");
    }

    RED.sidebar.init();

    if (RED.settings.theme("projects.enabled", false)) {
      RED.projects.init();
    } else {
      console.log("Projects disabled");
    }

    RED.subflow.init();
    RED.group.init();
    RED.clipboard.init();
    RED.search.init();
    RED.actionList.init();
    RED.editor.init();
    RED.diagnostics.init();
    RED.diff.init();

    RED.deploy.init(RED.settings.theme("deployButton", null));

    RED.keyboard.init(buildMainMenu);
    RED.envVar.init();

    RED.nodes.init();
    RED.runtime.init();

    RED.comms.connect();

    $("#red-ui-main-container").show();

    loadPluginList();
  }

  function buildEditor(options) {
    var header = $('<div id="red-ui-header"></div>').appendTo(options.target);
    var logo = $('<span class="red-ui-header-logo"></span>').appendTo(header);
    $('<ul class="red-ui-header-toolbar hide"></ul>').appendTo(header);
    $('<div id="red-ui-header-shade" class="hide"></div>').appendTo(header);
    $(
      '<div id="red-ui-main-container" class="red-ui-sidebar-closed hide">' +
        '<div id="red-ui-workspace"></div>' +
        '<div id="red-ui-editor-stack" tabindex="-1"></div>' +
        '<div id="red-ui-palette"></div>' +
        '<div id="red-ui-sidebar"></div>' +
        '<div id="red-ui-sidebar-separator"></div>' +
        "</div>"
    ).appendTo(options.target);
    $('<div id="red-ui-editor-plugin-configs"></div>').appendTo(options.target);
    $('<div id="red-ui-editor-node-configs"></div>').appendTo(options.target);
    $('<div id="red-ui-full-shade" class="hide"></div>').appendTo(options.target);

    loader.init().appendTo("#red-ui-main-container");
    loader.start("...", 0);

    $.getJSON(options.apiRootUrl + "theme", function (theme) {
      if (theme.header) {
        if (theme.header.url) {
          logo = $("<a>", { href: theme.header.url }).appendTo(logo);
        }
        if (theme.header.image) {
          $("<img>", { src: theme.header.image }).appendTo(logo);
        }
        if (theme.header.title) {
          $("<span>").html(theme.header.title).appendTo(logo);
        }
      }
      if (theme.themes) {
        knownThemes = theme.themes;
      }
    });
  }
  var knownThemes = null;
  var initialised = false;

  function init(options) {
    if (initialised) {
      throw new Error("RED already initialised");
    }
    initialised = true;
    if (window.ace) {
      window.ace.require("ace/ext/language_tools");
    }
    options = options || {};
    options.apiRootUrl = options.apiRootUrl || "";
    if (options.apiRootUrl && !/\/$/.test(options.apiRootUrl)) {
      options.apiRootUrl = options.apiRootUrl + "/";
    }
    options.target = $("#red-ui-editor");
    options.target.addClass("red-ui-editor");

    buildEditor(options);

    RED.i18n.init(options, function () {
      RED.settings.init(options, function () {
        if (knownThemes) {
          RED.settings.editorTheme = RED.settings.editorTheme || {};
          RED.settings.editorTheme.themes = knownThemes;
        }
        loadEditor();
      });
    });
  }

  var loader = {
    init: function () {
      var wrapper = $('<div id="red-ui-loading-progress"></div>').hide();
      var container = $("<div>").appendTo(wrapper);
      var label = $("<div>", { class: "red-ui-loading-bar-label" }).appendTo(container);
      var bar = $("<div>", { class: "red-ui-loading-bar" }).appendTo(container);
      var fill = $("<span>").appendTo(bar);
      return wrapper;
    },
    start: function (text, prcnt) {
      if (text) {
        loader.reportProgress(text, prcnt);
      }
      $("#red-ui-loading-progress").show();
    },
    reportProgress: function (text, prcnt) {
      $(".red-ui-loading-bar-label").text(text);
      $(".red-ui-loading-bar span").width(prcnt + "%");
    },
    end: function () {
      $("#red-ui-loading-progress").hide();
      loader.reportProgress("", 0);
    }
  };

  return {
    init: init,
    loader: loader
  };
})();
