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
RED.sidebar.help = (function () {
  var content;
  var toolbar;
  var helpSection;
  var panels;
  var panelRatio;
  var treeList;
  var tocPanel;

  function resizeStack() {
    var h = $(content).parent().height() - toolbar.outerHeight();
    panels.resize(h);
  }

  function init() {
    content = document.createElement("div");
    content.className = "red-ui-sidebar-info";

    toolbar = $("<div>", { class: "red-ui-sidebar-header red-ui-info-toolbar" }).appendTo(content);
    $(
      '<span class="button-group"><a id="red-ui-sidebar-help-show-toc" class="red-ui-button red-ui-button-small selected" href="#"><i class="fa fa-list-ul"></i></a></span>'
    ).appendTo(toolbar);
    var showTOCButton = toolbar.find("#red-ui-sidebar-help-show-toc");
    RED.popover.tooltip(showTOCButton, function () {
      if ($(showTOCButton).hasClass("selected")) {
        return RED._("sidebar.help.hideTopics");
      } else {
        return RED._("sidebar.help.showTopics");
      }
    });
    showTOCButton.on("click", function (e) {
      e.preventDefault();
      if ($(this).hasClass("selected")) {
        hideTOC();
      } else {
        showTOC();
      }
    });

    var stackContainer = $("<div>", { class: "red-ui-sidebar-help-stack" }).appendTo(content);

    tocPanel = $("<div>", { class: "red-ui-sidebar-help-toc" }).appendTo(stackContainer);
    var helpPanel = $("<div>")
      .css({
        "overflow-y": "auto"
      })
      .appendTo(stackContainer);

    panels = RED.panels.create({
      container: stackContainer
    });
    panels.ratio(0.3);

    helpSearch = $('<input type="text" data-i18n="[placeholder]sidebar.help.search">')
      .appendTo(toolbar)
      .searchBox({
        style: "compact",
        delay: 100,
        change: function () {
          const searchFor = $(this).val().toLowerCase();
          if (searchFor) {
            showTOC();
            treeList.treeList(
              "filter",
              function (item) {
                if (item.depth === 0) {
                  return true;
                }
                let found = item.nodeType && item.nodeType.toLowerCase().indexOf(searchFor) > -1;
                found = found || (item.subflowLabel && item.subflowLabel.toLowerCase().indexOf(searchFor) > -1);
                found = found || (item.palleteLabel && item.palleteLabel.toLowerCase().indexOf(searchFor) > -1);
                return found;
              },
              true
            );
          } else {
            treeList.treeList("filter", null);
            var selected = treeList.treeList("selected");
            if (selected.id) {
              treeList.treeList("show", selected.id);
            }
          }
        }
      });

    helpSection = $("<div>", { class: "red-ui-help" })
      .css({
        padding: "6px"
      })
      .appendTo(helpPanel);

    $('<span class="red-ui-help-info-none">' + RED._("sidebar.help.noHelp") + "</span>").appendTo(helpSection);

    treeList = $("<div>").css({ width: "100%" }).appendTo(tocPanel).treeList({ data: [] });
    var pendingContentLoad;
    treeList.on("treelistselect", function (e, item) {
      pendingContentLoad = item;
      if (item.tour) {
        RED.tourGuide.run(item.tour);
      } else if (item.nodeType) {
        showNodeTypeHelp(item.nodeType);
      } else if (item.content) {
        helpSection.empty();
        if (typeof item.content === "string") {
          setInfoText(item.label, item.content);
        } else if (typeof item.content === "function") {
          if (item.content.length === 0) {
            setInfoText(item.label, item.content());
          } else {
            setInfoText(
              item.label,
              '<div class="red-ui-component-spinner red-ui-component-spinner-contain"><img src="red/images/spin.svg" /></div>',
              helpSection
            );
            item.content(function (content) {
              if (pendingContentLoad === item) {
                helpSection.empty();
                setInfoText(item.label, content);
              }
            });
          }
        }
      }
    });

    RED.sidebar.addTab({
      id: "help",
      label: RED._("sidebar.help.label"),
      name: RED._("sidebar.help.name"),
      iconClass: "fa fa-book",
      action: "core:show-help-tab",
      content: content,
      pinned: true,
      enableOnEdit: true,
      onchange: function () {
        resizeStack();
      }
    });

    $(window).on("resize", resizeStack);
    $(window).on("focus", resizeStack);

    RED.events.on("registry:node-type-added", queueRefresh);
    RED.events.on("registry:node-type-removed", queueRefresh);
    RED.events.on("subflows:change", refreshSubflow);

    RED.actions.add("core:show-help-tab", show);
    RED.actions.add("core:show-node-help", showNodeHelp);
  }

  var refreshTimer;
  function queueRefresh() {
    if (!refreshTimer) {
      refreshTimer = setTimeout(function () {
        refreshTimer = null;
        refreshHelpIndex();
      }, 500);
    }
  }

  function refreshSubflow(sf) {
    var item = treeList.treeList("get", "node-type:subflow:" + sf.id);
    if (item) {
      item.subflowLabel = sf._def.label().toLowerCase();
      item.treeList.replaceElement(getNodeLabel({ _def: sf._def, type: sf._def.label() }));
    }
  }

  function hideTOC() {
    var tocButton = $("#red-ui-sidebar-help-show-toc");
    if (tocButton.hasClass("selected")) {
      tocButton.removeClass("selected");
      panelRatio = panels.ratio();
      tocPanel.css({ transition: "height 0.2s" });
      panels.ratio(0);
      setTimeout(function () {
        tocPanel.css({ transition: "" });
      }, 250);
    }
  }
  function showTOC() {
    var tocButton = $("#red-ui-sidebar-help-show-toc");
    if (!tocButton.hasClass("selected")) {
      tocButton.addClass("selected");
      tocPanel.css({ transition: "height 0.2s" });
      panels.ratio(Math.max(0.3, Math.min(panelRatio, 0.7)));
      setTimeout(function () {
        tocPanel.css({ transition: "" });
        var selected = treeList.treeList("selected");
        if (selected.id) {
          treeList.treeList("show", selected);
        }
      }, 250);
    }
  }

  function refreshHelpIndex() {
    var modules = RED.nodes.registry.getModuleList();
    var moduleNames = Object.keys(modules);
    moduleNames.sort();

    var nodeHelp = {
      label: RED._("sidebar.help.nodeHelp"),
      children: [],
      expanded: true
    };
    var helpData = [
      {
        label: "Node-RED",
        children: [
          {
            id: "changelog",
            label: RED._("sidebar.help.changeLog"),
            content: getChangelog
          }
        ]
      },
      nodeHelp
    ];
    var subflows = RED.nodes.registry.getNodeTypes().filter(function (t) {
      return /subflow/.test(t);
    });
    if (subflows.length > 0) {
      nodeHelp.children.push({
        label: RED._("menu.label.subflows"),
        children: []
      });
      subflows.forEach(function (nodeType) {
        var sf = RED.nodes.getType(nodeType);
        nodeHelp.children[0].children.push({
          id: "node-type:" + nodeType,
          nodeType: nodeType,
          subflowLabel: sf.label().toLowerCase(),
          element: getNodeLabel({ _def: sf, type: sf.label() })
        });
      });
    }

    moduleNames.forEach(function (moduleName) {
      const module = modules[moduleName];
      const nodeTypes = [];
      const moduleSets = module.sets;
      const setNames = Object.keys(moduleSets);
      setNames.forEach(function (setName) {
        const moduleSet = moduleSets[setName];
        moduleSet.types.forEach(function (nodeType) {
          if ($("script[data-help-name='" + nodeType + "']").length) {
            const n = { _def: RED.nodes.getType(nodeType), type: nodeType };
            n.name = getNodePaletteLabel(n);
            nodeTypes.push({
              id: "node-type:" + nodeType,
              nodeType: nodeType,
              palleteLabel: n.name,
              element: getNodeLabel(n)
            });
          }
        });
      });
      if (nodeTypes.length > 0) {
        nodeTypes.sort(function (A, B) {
          return A.nodeType.localeCompare(B.nodeType);
        });
        nodeHelp.children.push({
          id: moduleName,
          icon: "fa fa-cube",
          label: moduleName,
          children: nodeTypes
        });
      }
    });
    treeList.treeList("data", helpData);
  }

  function getNodePaletteLabel(n) {
    let label = n.name;
    if (!label && n._def && n._def.paletteLabel) {
      try {
        label =
          (typeof n._def.paletteLabel === "function" ? n._def.paletteLabel.call(n._def) : n._def.paletteLabel) || "";
      } catch (err) {}
    }
    return label || n.type;
  }

  function getNodeLabel(n) {
    const div = $("<div>", { class: "red-ui-node-list-item" });
    const icon = RED.utils.createNodeIcon(n).appendTo(div);
    $("<div>", { class: "red-ui-node-label" }).text(getNodePaletteLabel(n)).appendTo(icon);
    return div;
  }

  function showNodeTypeHelp(nodeType) {
    helpSection.empty();
    var helpText;
    var title;
    var m = /^subflow(:(.+))?$/.exec(nodeType);
    if (m && m[2]) {
      var subflowNode = RED.nodes.subflow(m[2]);
      helpText =
        RED.utils.renderMarkdown(subflowNode.info || "") ||
        '<span class="red-ui-help-info-none">' + RED._("sidebar.info.none") + "</span>";
      title = subflowNode.name || nodeType;
    } else {
      helpText =
        RED.nodes.getNodeHelp(nodeType) ||
        '<span class="red-ui-help-info-none">' + RED._("sidebar.info.none") + "</span>";
      var _def = RED.nodes.registry.getNodeType(nodeType);
      title = _def && _def.paletteLabel ? _def.paletteLabel : nodeType;
      if (typeof title === "function") {
        try {
          title = _def.paletteLabel.call(_def);
        } catch (err) {
          title = nodeType;
        }
      }
    }
    setInfoText(title, helpText);

    var ratio = panels.ratio();
    if (ratio > 0.7) {
      panels.ratio(0.7);
    }
    treeList.treeList("show", "node-type:" + nodeType);
    treeList.treeList("select", "node-type:" + nodeType, false);
  }

  function show(type, bringToFront) {
    if (bringToFront !== false) {
      RED.sidebar.show("help");
    }
    if (type) {
      // hideTOC();
      showNodeTypeHelp(type);
    }
    resizeStack();
  }

  function showNodeHelp(node) {
    if (!node) {
      const selection = RED.view.selection();
      if (selection.nodes && selection.nodes.length > 0) {
        node = selection.nodes.find((n) => n.type !== "group" && n.type !== "junction");
      }
    }
    if (node) {
      show(node.type, true);
    }
  }

  // TODO: DRY - projects.js
  function addTargetToExternalLinks(el) {
    $(el)
      .find("a")
      .each(function (el) {
        var href = $(this).attr("href");
        if (/^https?:/.test(href)) {
          $(this).attr("target", "_blank");
        }
      });
    return el;
  }

  function setInfoText(title, infoText) {
    helpSection.empty();
    if (title) {
      $("<h1>", { class: "red-ui-help-title" }).text(title).appendTo(helpSection);
    }
    var info = addTargetToExternalLinks(
      $(
        '<div class="red-ui-help"><span class="red-ui-text-bidi-aware" dir=\"' +
          RED.text.bidi.resolveBaseTextDir(infoText) +
          '">' +
          infoText +
          "</span></div>"
      )
    ).appendTo(helpSection);
    info
      .find(".red-ui-text-bidi-aware")
      .contents()
      .filter(function () {
        return this.nodeType === 3 && this.textContent.trim() !== "";
      })
      .wrap("<span></span>");
    var foldingHeader = "H3";
    info
      .find(foldingHeader)
      .wrapInner('<a class="red-ui-help-info-header expanded" href="#"></a>')
      .find("a")
      .prepend('<i class="fa fa-angle-right">')
      .on("click", function (e) {
        e.preventDefault();
        var isExpanded = $(this).hasClass("expanded");
        var el = $(this).parent().next();
        while (el.length === 1 && el[0].nodeName !== foldingHeader) {
          el.toggle(!isExpanded);
          el = el.next();
        }
        $(this).toggleClass("expanded", !isExpanded);
      });
    helpSection.parent().scrollTop(0);
    RED.editor.mermaid.render();
  }

  function set(html, title) {
    $(helpSection).empty();
    setInfoText(title, html);
    hideTOC();
    show();
  }

  function refreshSelection(selection) {
    if (selection === undefined) {
      selection = RED.view.selection();
    }
    if (selection.nodes) {
      if (selection.nodes.length == 1) {
        var node = selection.nodes[0];
        if (node.type === "subflow" && node.direction) {
          // ignore subflow virtual ports
        } else if (node.type !== "group" && node.type !== "junction") {
          showNodeTypeHelp(node.type);
        }
      }
    }
  }
  RED.events.on("view:selection-changed", refreshSelection);

  function getChangelog(done) {
    $.get("red/about", function (data) {
      // data will be strictly markdown. Any HTML should be escaped.
      data = RED.utils.sanitize(data);
    });
  }
  function showAbout() {
    treeList.treeList("show", "changelog");
    treeList.treeList("select", "changelog");
    show();
  }

  RED.actions.add("core:show-about", showAbout);

  return {
    init: init,
    show: show,
    set: set
  };
})();
