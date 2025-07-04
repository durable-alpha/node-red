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
(function() {
    /**
     * Converts dropped image file to date URL
     */
    function file2base64Image(file, cb) {
        var reader = new FileReader();
        reader.onload = (function (fd) {
            return function (e) {
                cb(e.target.result);
            };
        })(file);
        reader.readAsDataURL(file);
    }

    function file2Text(file,cb) {
        file.arrayBuffer().then(d => {
            cb( new TextDecoder().decode(d) )
        }).catch(ex => { cb(`error: ${ex}`) })
    }

    var initialized = false;
    var currentEditor = null;
    /**
     * Initialize handler for image file drag events
     */
    function initImageDrag(elem, editor) {
        $(elem).on("dragenter", function (ev) {
            ev.preventDefault();
            $("#red-ui-drop-target-markdown-editor").css({
                display:'table',
                top: $(elem).offset().top,
                left: $(elem).offset().left,
                width: $(elem).width(),
                height: $(elem).height()
            }).focus();
            currentEditor = editor;
        });

        if (!initialized) {
            initialized = true;
            $("#red-ui-drop-target-markdown-editor").on("dragover", function (ev) {
                ev.preventDefault();
            }).on("dragleave", function (ev) {
                $("#red-ui-drop-target-markdown-editor").hide();
            }).on("drop", function (ev) {
                ev.preventDefault();
                if ($.inArray("Files",ev.originalEvent.dataTransfer.types) != -1) {
                    var files = ev.originalEvent.dataTransfer.files;
                    if (files.length === 1) {
                        var file = files[0];
                        var name = file.name.toLowerCase();
                        var fileType = file.type.toLowerCase();
                        
                        if (name.match(/\.(apng|avif|gif|jpeg|png|svg|webp)$/)) {
                            file2base64Image(file, function (image) {
                                var session = currentEditor.getSession();
                                var img = `<img src="${image}"/>\n`;
                                var pos = session.getCursorPosition();
                                session.insert(pos, img);
                                $("#red-ui-drop-target-markdown-editor").hide();
                            });
                            return;
                        }

                        if ( fileType.startsWith("text/") ) {
                            file2Text(file, function (txt) {
                                var session = currentEditor.getSession();
                                var pos = session.getCursorPosition();
                                session.insert(pos, txt);
                                $("#red-ui-drop-target-markdown-editor").hide();
                            });
                            return;
                        }                       
                    }
                } else if ($.inArray("text/plain", ev.originalEvent.dataTransfer.types) != -1) {
                    let item = Object.values(ev.originalEvent.dataTransfer.items).filter(d => d.type == "text/plain")[0]

                    if (item) {
                         item.getAsString(txt => {
                            var session = currentEditor.getSession();
                            var pos = session.getCursorPosition();
                            session.insert(pos, txt);
                            $("#red-ui-drop-target-markdown-editor").hide();
                         })
                         return
                    }                    
                }
                $("#red-ui-drop-target-markdown-editor").hide();
            });
        }
    }

    var toolbarTemplate = '<div style="margin-bottom: 5px">'+
        '<span class="button-group">'+
        '<button type="button" class="red-ui-button" data-style="h1" style="font-size:1.1em; font-weight: bold">h1</button>'+
        '<button type="button" class="red-ui-button" data-style="h2" style="font-size:1.0em; font-weight: bold">h2</button>'+
        '<button type="button" class="red-ui-button" data-style="h3" style="font-size:0.9em; font-weight: bold">h3</button>'+
        '</span>'+
        '<span class="button-group">'+
            '<button type="button" class="red-ui-button" data-style="b"><i class="fa fa-bold"></i></button>'+
            '<button type="button" class="red-ui-button" data-style="i"><i class="fa fa-italic"></i></button>'+
            '<button type="button" class="red-ui-button" data-style="code"><i class="fa fa-code"></i></button>'+
        '</span>'+
        '<span class="button-group">'+
            '<button type="button" class="red-ui-button" data-style="ol"><i class="fa fa-list-ol"></i></button>'+
            '<button type="button" class="red-ui-button" data-style="ul"><i class="fa fa-list-ul"></i></button>'+
            '<button type="button" class="red-ui-button" data-style="bq"><i class="fa fa-quote-left"></i></button>'+
            '<button type="button" class="red-ui-button" data-style="hr"><i class="fa fa-minus"></i></button>'+
            '<button type="button" class="red-ui-button" data-style="link"><i class="fa fa-link"></i></button>'+
        '</span>'+
    '</div>';

    var template = '<script type="text/x-red" data-template-name="_markdown">'+
        '<div id="red-ui-editor-type-markdown-panels">'+
        '<div id="red-ui-editor-type-markdown-panel-editor" class="red-ui-panel">'+
            '<div style="height: 100%; margin: auto;">'+
                '<div id="red-ui-editor-type-markdown-toolbar"></div>'+
                '<div class="node-text-editor" style="height: 100%" id="red-ui-editor-type-markdown"></div>'+
            '</div>'+
        '</div>'+
        '<div class="red-ui-panel">'+
            '<div class="red-ui-editor-type-markdown-panel-preview red-ui-help"></div>'+
        '</div>'+
        '</script>';


    var panels;

    var definition = {
        show: function(options) {
            var value = options.value;
            var onCancel = options.cancel;
            var onComplete = options.complete;
            var type = "_markdown"
            if ($("script[data-template-name='"+type+"']").length === 0) {
                $(template).appendTo("#red-ui-editor-node-configs");
            }

            RED.view.state(RED.state.EDITING);
            var expressionEditor;

            var trayOptions = {
                title: options.title,
                focusElement: options.focusElement,
                width: options.width||Infinity,
                buttons: [
                    {
                        id: "node-dialog-cancel",
                        text: RED._("common.label.cancel"),
                        click: function() {
                            if (onCancel) { onCancel(); }
                            RED.tray.close();
                        }
                    },
                    {
                        id: "node-dialog-ok",
                        text: RED._("common.label.done"),
                        class: "primary",
                        click: function() {
                            expressionEditor.saveView();
                            if (onComplete) { onComplete(expressionEditor.getValue(),expressionEditor.getCursorPosition(), expressionEditor); }
                            RED.tray.close();
                        }
                    }
                ],
                resize: function(dimensions) {
                    var width = $("#dialog-form").width();
                    if (panels) {
                        panels.resize(width);
                    }

                },
                open: function(tray) {
                    var trayBody = tray.find('.red-ui-tray-body');
                    trayBody.addClass("red-ui-editor-type-markdown-editor")
                    var dialogForm = RED.editor.buildEditForm(tray.find('.red-ui-tray-body'),'dialog-form',type,'editor');
                    expressionEditor = RED.editor.createEditor({
                        id: 'red-ui-editor-type-markdown',
                        value: value,
                        stateId: options.stateId,
                        focus: true,
                        mode:"ace/mode/markdown",
                        expandable: false
                    });
                    var changeTimer;
                    expressionEditor.getSession().on("change", function() {
                        clearTimeout(changeTimer);
                        changeTimer = setTimeout(function() {
                            var currentScrollTop = $(".red-ui-editor-type-markdown-panel-preview").scrollTop();
                            $(".red-ui-editor-type-markdown-panel-preview").html(RED.utils.renderMarkdown(expressionEditor.getValue()));
                            $(".red-ui-editor-type-markdown-panel-preview").scrollTop(currentScrollTop);
                            RED.editor.mermaid.render()
                        },200);
                    })
                    if (options.header) {
                        options.header.appendTo(tray.find('#red-ui-editor-type-markdown-title'));
                    }

                    if (value) {
                        $(".red-ui-editor-type-markdown-panel-preview").html(RED.utils.renderMarkdown(expressionEditor.getValue()));
                        RED.editor.mermaid.render()
                    }
                    panels = RED.panels.create({
                        id:"red-ui-editor-type-markdown-panels",
                        dir: "horizontal",
                        resize: function(p1Width,p2Width) {
                            expressionEditor.resize();
                        }
                    });
                    panels.ratio(1);

                    $('<span class="button-group" style="float:right">'+
                        '<button type="button" id="node-btn-markdown-preview" class="red-ui-button toggle single"><i class="fa fa-eye"></i></button>'+
                    '</span>').appendTo(expressionEditor.toolbar);

                    $("#node-btn-markdown-preview").on("click", function(e) {
                        e.preventDefault();
                        if ($(this).hasClass("selected")) {
                            $(this).removeClass("selected");
                            panels.ratio(1);
                        } else {
                            $(this).addClass("selected");
                            panels.ratio(0.5);
                        }
                    });
                    RED.popover.tooltip($("#node-btn-markdown-preview"), RED._("markdownEditor.toggle-preview"));

                    if(!expressionEditor._initState) {
                        if (options.cursor) {
                            expressionEditor.gotoLine(options.cursor.row+1,options.cursor.column,false);
                        }
                        else {
                            expressionEditor.gotoLine(0, 0, false);
                        }
                    }                        
                    dialogForm.i18n();
                },
                close: function() {
                    if (options.onclose) {
                        options.onclose();
                    }
                    expressionEditor.destroy();
                },
                show: function() {}
            }
            RED.tray.show(trayOptions);
        },

        buildToolbar: function(container, editor) {
            var styleActions = {
                'h1': { newline: true, before:"# ", tooltip:RED._("markdownEditor.heading1")},
                'h2': { newline: true, before:"## ", tooltip:RED._("markdownEditor.heading2")},
                'h3': { newline: true, before:"### ", tooltip:RED._("markdownEditor.heading3")},
                'b': { before:"**", after: "**", tooltip: RED._("markdownEditor.bold")},
                'i': { before:"_", after: "_", tooltip: RED._("markdownEditor.italic")},
                'code': { before:"`", after: "`", tooltip: RED._("markdownEditor.code")},
                'ol': { before:" 1. ", newline: true, tooltip: RED._("markdownEditor.ordered-list")},
                'ul': { before:" - ", newline: true, tooltip: RED._("markdownEditor.unordered-list")},
                'bq': { before:"> ", newline: true, tooltip: RED._("markdownEditor.quote")},
                'link': { before:"[", after: "]()", tooltip: RED._("markdownEditor.link")},
                'hr': { before:"\n---\n\n", tooltip: RED._("markdownEditor.horizontal-rule")}
            }
            var toolbar = $(toolbarTemplate).appendTo(container);
            toolbar.find('button[data-style]').each(function(el) {
                var style = styleActions[$(this).data('style')];
                $(this).on("click", function(e) {
                    e.preventDefault();
                    var current = editor.getSelectedText();
                    var range = editor.selection.getRange();
                    if (style.newline) {
                        var offset = 0;
                        var beforeOffset = ((style.before||"").match(/\n/g)||[]).length;
                        var afterOffset = ((style.after||"").match(/\n/g)||[]).length;
                        for (var i = range.start.row; i<= range.end.row+offset; i++) {
                            if (style.before) {
                                editor.session.insert({row:i, column:0},style.before);
                                offset += beforeOffset;
                                i += beforeOffset;
                            }
                            if (style.after) {
                                editor.session.insert({row:i, column:Infinity},style.after);
                                offset += afterOffset;
                                i += afterOffset;
                            }
                        }
                    } else {
                        editor.session.replace(editor.selection.getRange(), (style.before||"")+current+(style.after||""));
                        if (current === "") {
                            editor.gotoLine(range.start.row+1,range.start.column+(style.before||"").length,false);
                        }
                    }
                    editor.focus();
                });
                if (style.tooltip) {
                    RED.popover.tooltip($(this),style.tooltip);
                }
            })
            return toolbar;
        },
        postInit: function (editor, options) {
            var elem = $("#"+options.id);
            initImageDrag(elem, editor);
         }
    }
    RED.editor.registerTypeEditor("_markdown", definition);
})();
