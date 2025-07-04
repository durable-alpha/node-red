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

RED.utils = (function() {

    window._marked = window.marked;
    window.marked = function(txt) {
        console.warn("Use of 'marked()' is deprecated. Use RED.utils.renderMarkdown() instead");
        return renderMarkdown(txt);
    }

    const descriptionList = {
        name: 'descriptionList',
        level: 'block',                                     // Is this a block-level or inline-level tokenizer?
        start(src) {
            if (!src) { return null; }
            let m = src.match(/:[^:\n]/g);
            return m && m.index; // Hint to Marked.js to stop and check for a match
        },
        tokenizer(src, tokens) {
            if (!src) { return null; }
            const rule = /^(?::[^:\n]+:[^:\n]*(?:\n|$))+/;    // Regex for the complete token
            const match = rule.exec(src);
            if (match) {
                return {                                        // Token to generate
                    type: 'descriptionList',                      // Should match "name" above
                    raw: match[0],                                // Text to consume from the source
                    text: match[0].trim(),                        // Additional custom properties
                    tokens: this.lexer.inlineTokens(match[0].trim())    // inlineTokens to process **bold**, *italics*, etc.
                };
            }
        },
        renderer(token) {
            return `<dl class="message-properties">${this.parser.parseInline(token.tokens)}\n</dl>`; // parseInline to turn child tokens into HTML
        }
    };

    const description = {
        name: 'description',
        level: 'inline',           // Is this a block-level or inline-level tokenizer?
        start(src) {
            if (!src) { return null; }
            let m = src.match(/:/g);
            return m && m.index;   // Hint to Marked.js to stop and check for a match
        },
        tokenizer(src, tokens) {
            if (!src) { return null; }
            const rule = /^:([^:\n]+)\(([^:\n]+)\).*?:([^:\n]*)(?:\n|$)/;  // Regex for the complete token
            const match = rule.exec(src);
            if (match) {
                return {                                       // Token to generate
                    type: 'description',                       // Should match "name" above
                    raw: match[0],                             // Text to consume from the source
                    dt: this.lexer.inlineTokens(match[1].trim()),    // Additional custom properties
                    types: this.lexer.inlineTokens(match[2].trim()),
                    dd: this.lexer.inlineTokens(match[3].trim()),
                };
            }
        },
        renderer(token) {
            return `\n<dt>${this.parser.parseInline(token.dt)}<span class="property-type">${this.parser.parseInline(token.types)}</span></dt><dd>${this.parser.parseInline(token.dd)}</dd>`;
        },
        childTokens: ['dt', 'dd'],                 // Any child tokens to be visited by walkTokens
        walkTokens(token) {                        // Post-processing on the completed token tree
            if (token.type === 'strong') {
                token.text += ' walked';
            }
        }
    };


    const renderer = new window._marked.Renderer();

    //override list creation - add node-ports to order lists
    renderer.list = function (body, ordered, start) {
        let addClass = /dl.*?class.*?message-properties.*/.test(body);
        if (addClass && ordered) {
            return '<ol class="node-ports">' + body + '</ol>';
        } else if (ordered) {
            return '<ol>' + body + '</ol>';
        } else {
            return '<ul>' + body + '</ul>'
        }
    }

    var mermaidIsInitialized = false;
    var mermaidIsEnabled /* = undefined */;

    renderer.code = function (code, lang) {
        if(lang === "mermaid") {
            return `<pre class='mermaid'>${code}</pre>`;
        } else {
            return "<pre><code>" +code +"</code></pre>";
        }
    };

    window._marked.setOptions({
        renderer: renderer,
        gfm: true,
        tables: true,
        breaks: false,
        pedantic: false,
        smartLists: true,
        smartypants: false
    });

    window._marked.use({extensions: [descriptionList, description] } );

    function renderMarkdown(txt) {
        var rendered = _marked.parse(txt);
        const cleaned = DOMPurify.sanitize(rendered);
        return cleaned;
    }

    function formatString(str) {
        return str.replace(/\r?\n/g,"&crarr;").replace(/\t/g,"&rarr;");
    }
    function sanitize(m) {
        return m.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }

    function buildMessageSummaryValue(value) {
        var result;
        if (Array.isArray(value)) {
            result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-meta"></span>').text('array['+value.length+']');
        } else if (value === null) {
            result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-null">null</span>');
        } else if (typeof value === 'object') {
            if (value.hasOwnProperty('type') && value.type === 'undefined') {
                result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-null">undefined</span>');
            } else if (value.hasOwnProperty('type') && value.type === 'Buffer' && value.hasOwnProperty('data')) {
                result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-meta"></span>').text('buffer['+value.length+']');
            } else if (value.hasOwnProperty('type') && value.type === 'array' && value.hasOwnProperty('data')) {
                result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-meta"></span>').text('array['+value.length+']');
            } else if (value.hasOwnProperty('type') && value.type === 'set' && value.hasOwnProperty('data')) {
                result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-meta"></span>').text('set['+value.length+']');
            } else if (value.hasOwnProperty('type') && value.type === 'map' && value.hasOwnProperty('data')) {
                result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-meta"></span>').text('map');
            } else if (value.hasOwnProperty('type') && value.type === 'function') {
                result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-meta"></span>').text('function');
            } else if (value.hasOwnProperty('type') && (value.type === 'number' || value.type === 'bigint')) {
                result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-number"></span>').text(value.data);
            } else if (value.hasOwnProperty('type') && value.type === 'regexp') {
                result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-string"></span>').text(value.data);
            } else {
                result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-meta">object</span>');
            }
        } else if (typeof value === 'string') {
            var subvalue;
            if (value.length > 30) {
                subvalue = sanitize(value.substring(0,30))+"&hellip;";
            } else {
                subvalue = sanitize(value);
            }
            result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-string"></span>').html('"'+formatString(subvalue)+'"');
        } else if (typeof value === 'number') {
            result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-number"></span>').text(""+value);
        } else {
            result = $('<span class="red-ui-debug-msg-object-value red-ui-debug-msg-type-other"></span>').text(""+value);
        }
        return result;
    }
    function makeExpandable(el,onbuild,ontoggle,expand) {
        el.addClass("red-ui-debug-msg-expandable");
        el.prop('toggle',function() {
            return function(state) {
                var parent = el.parent();
                if (parent.hasClass('collapsed')) {
                    if (state) {
                        if (onbuild && !parent.hasClass('built')) {
                            onbuild();
                            parent.addClass('built');
                        }
                        parent.removeClass('collapsed');
                        return true;
                    }
                } else {
                    if (!state) {
                        parent.addClass('collapsed');
                        return true;
                    }
                }
                return false;
            }
        });
        el.on("click", function(e) {
            var parent = $(this).parent();
            var currentState = !parent.hasClass('collapsed');
            if ($(this).prop('toggle')(!currentState)) {
                if (ontoggle) {
                    ontoggle(!currentState);
                }
            }
            // if (parent.hasClass('collapsed')) {
            //     if (onbuild && !parent.hasClass('built')) {
            //         onbuild();
            //         parent.addClass('built');
            //     }
            //     if (ontoggle) {
            //         ontoggle(true);
            //     }
            //     parent.removeClass('collapsed');
            // } else {
            //     parent.addClass('collapsed');
            //     if (ontoggle) {
            //         ontoggle(false);
            //     }
            // }
            e.preventDefault();
        });
        if (expand) {
            el.trigger("click");
        }

    }

    var pinnedPaths = {};
    var formattedPaths = {};

    function addMessageControls(obj,sourceId,key,msg,rootPath,strippedKey,extraTools,enablePinning) {
        if (!pinnedPaths.hasOwnProperty(sourceId)) {
            pinnedPaths[sourceId] = {}
        }
        var tools = $('<span class="red-ui-debug-msg-tools"></span>').appendTo(obj);
        var copyTools = $('<span class="red-ui-debug-msg-tools-copy button-group"></span>').appendTo(tools);
        if (!!key) {
            var copyPath = $('<button class="red-ui-button red-ui-button-small"><i class="fa fa-terminal"></i></button>').appendTo(copyTools).on("click", function(e) {
                e.preventDefault();
                e.stopPropagation();
                RED.clipboard.copyText(key,copyPath,"clipboard.copyMessagePath");
            })
            RED.popover.tooltip(copyPath,RED._("node-red:debug.sidebar.copyPath"));
        }
        var copyPayload = $('<button class="red-ui-button red-ui-button-small"><i class="fa fa-clipboard"></i></button>').appendTo(copyTools).on("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            RED.clipboard.copyText(msg,copyPayload,"clipboard.copyMessageValue");
        })
        RED.popover.tooltip(copyPayload,RED._("node-red:debug.sidebar.copyPayload"));
        if (enablePinning && strippedKey !== undefined && strippedKey !== '') {
            var isPinned = pinnedPaths[sourceId].hasOwnProperty(strippedKey);

            var pinPath = $('<button class="red-ui-button red-ui-button-small red-ui-debug-msg-tools-pin"><i class="fa fa-map-pin"></i></button>').appendTo(tools).on("click", function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (pinnedPaths[sourceId].hasOwnProperty(strippedKey)) {
                    delete pinnedPaths[sourceId][strippedKey];
                    $(this).removeClass("selected");
                    obj.removeClass("red-ui-debug-msg-row-pinned");
                } else {
                    var rootedPath = "$"+(strippedKey[0] === '['?"":".")+strippedKey;
                    pinnedPaths[sourceId][strippedKey] = normalisePropertyExpression(rootedPath);
                    $(this).addClass("selected");
                    obj.addClass("red-ui-debug-msg-row-pinned");
                }
            }).toggleClass("selected",isPinned);
            obj.toggleClass("red-ui-debug-msg-row-pinned",isPinned);
            RED.popover.tooltip(pinPath,RED._("node-red:debug.sidebar.pinPath"));
        }
        if (extraTools) {
            var t = extraTools;
            if (typeof t === 'function') {
                t = t(key,msg);
            }
            if (t) {
                t.addClass("red-ui-debug-msg-tools-other");
                t.appendTo(tools);
            }
        }
    }
    function checkExpanded(strippedKey, expandPaths, { minRange, maxRange, expandLeafNodes }) {
        if (expandPaths && expandPaths.length > 0) {
            if (strippedKey === '' && minRange === undefined) {
                return true;
            }
            for (var i=0;i<expandPaths.length;i++) {
                var p = expandPaths[i];
                if (expandLeafNodes && p === strippedKey) {
                    return true
                }
                if (p.indexOf(strippedKey) === 0 && (p[strippedKey.length] === "." ||  p[strippedKey.length] === "[") ) {

                    if (minRange !== undefined && p[strippedKey.length] === "[") {
                        var subkey = p.substring(strippedKey.length);
                        var m = (/\[(\d+)\]/.exec(subkey));
                        if (m) {
                            var index = parseInt(m[1]);
                            return minRange<=index && index<=maxRange;
                        }
                    } else {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function formatNumber(element,obj,sourceId,path,cycle,initialFormat) {
        var format = (formattedPaths[sourceId] && formattedPaths[sourceId][path] && formattedPaths[sourceId][path]['number']) || initialFormat || "dec";
        if (cycle) {
            if (format === 'dec') {
                if ((obj.toString().length===13) && (obj<=2147483647000)) {
                    format = 'dateMS';
                } else if ((obj.toString().length===10) && (obj<=2147483647)) {
                    format = 'dateS';
                } else {
                    format = 'hex'
                }
            } else if (format === 'dateMS' || format == 'dateS') {
                if ((obj.toString().length===13) && (obj<=2147483647000)) {
                    format = 'dateML';
                } else if ((obj.toString().length===10) && (obj<=2147483647)) {
                    format = 'dateL';
                } else {
                    format = 'hex'
                }
            } else if (format === 'dateML' || format == 'dateL') {
                format = 'hex';
            } else {
                format = 'dec';
            }
            formattedPaths[sourceId] = formattedPaths[sourceId]||{};
            formattedPaths[sourceId][path] = formattedPaths[sourceId][path]||{};
            formattedPaths[sourceId][path]['number'] = format;
        } else if (initialFormat !== undefined){
            formattedPaths[sourceId] = formattedPaths[sourceId]||{};
            formattedPaths[sourceId][path] = formattedPaths[sourceId][path]||{};
            formattedPaths[sourceId][path]['number'] = format;
        }
        if (format === 'dec') {
            element.text(""+obj);
        } else if (format === 'dateMS') {
            element.text((new Date(obj)).toISOString());
        } else if (format === 'dateS') {
            element.text((new Date(obj*1000)).toISOString());
        } else if (format === 'dateML') {
            var dd = new Date(obj);
            element.text(dd.toLocaleString() + "  [UTC" + ( dd.getTimezoneOffset()/-60 <=0?"":"+" ) + dd.getTimezoneOffset()/-60 +"]");
        } else if (format === 'dateL') {
            var ddl = new Date(obj*1000);
            element.text(ddl.toLocaleString() + "  [UTC" + ( ddl.getTimezoneOffset()/-60 <=0?"":"+" ) + ddl.getTimezoneOffset()/-60 +"]");
        } else if (format === 'hex') {
            element.text("0x"+(obj).toString(16));
        }
    }

    function formatBuffer(element,button,sourceId,path,cycle) {
        var format = (formattedPaths[sourceId] && formattedPaths[sourceId][path] && formattedPaths[sourceId][path]['buffer']) || "raw";
        if (cycle) {
            if (format === 'raw') {
                format = 'string';
            } else {
                format = 'raw';
            }
            formattedPaths[sourceId] = formattedPaths[sourceId]||{};
            formattedPaths[sourceId][path] = formattedPaths[sourceId][path]||{};
            formattedPaths[sourceId][path]['buffer'] = format;
        }
        if (format === 'raw') {
            button.text('raw');
            element.removeClass('red-ui-debug-msg-buffer-string').addClass('red-ui-debug-msg-buffer-raw');
        } else if (format === 'string') {
            button.text('string');
            element.addClass('red-ui-debug-msg-buffer-string').removeClass('red-ui-debug-msg-buffer-raw');
        }
    }

    /**
     * Create a DOM element representation of obj - as used by Debug sidebar etc
     *
     * @params obj - the data to display
     * @params options - a bag of options
     *
     * - If you want the Copy Value button, then set `sourceId`
     * - If you want the Copy Path button, also set `path` to the value to be copied
     */
    function createObjectElement(obj,options) {
        options = options || {};
        var key = options.key;
        var typeHint = options.typeHint;
        var hideKey = options.hideKey;
        var path = options.path;
        var sourceId = options.sourceId;
        var rootPath = options.rootPath;
        var expandPaths = options.expandPaths;
        const enablePinning = options.enablePinning
        const expandLeafNodes = options.expandLeafNodes;
        var ontoggle = options.ontoggle;
        var exposeApi = options.exposeApi;
        var tools = options.tools;

        var subElements = {};
        var i;
        var e;
        var entryObj;
        var expandableHeader;
        var header;
        var headerHead;
        var value;
        var strippedKey;
        if (path !== undefined && rootPath !== undefined) {
             strippedKey = path.substring(rootPath.length+(path[rootPath.length]==="."?1:0));
        }
        var element = $('<span class="red-ui-debug-msg-element"></span>');
        element.collapse = function() {
            element.find(".red-ui-debug-msg-expandable").parent().addClass("collapsed");
        }
        header = $('<span class="red-ui-debug-msg-row"></span>').appendTo(element);
        if (sourceId) {
            addMessageControls(header,sourceId,path,obj,rootPath,strippedKey,tools, enablePinning);
        }
        if (!key) {
            element.addClass("red-ui-debug-msg-top-level");
            if (sourceId && !expandPaths) {
                var pinned = pinnedPaths[sourceId];
                expandPaths = [];
                if (pinned) {
                    for (var pinnedPath in pinned) {
                        if (pinned.hasOwnProperty(pinnedPath)) {
                            try {
                                var res = getMessageProperty({$:obj},pinned[pinnedPath]);
                                if (res !== undefined) {
                                    expandPaths.push(pinnedPath);
                                }
                            } catch(err) {
                            }
                        }
                    }
                    expandPaths.sort();
                }
                element.clearPinned = function() {
                    element.find(".red-ui-debug-msg-row-pinned").removeClass("red-ui-debug-msg-row-pinned");
                    pinnedPaths[sourceId] = {};
                }
            }
        } else {
            if (!hideKey) {
                $('<span class="red-ui-debug-msg-object-key"></span>').text(key).appendTo(header);
                $('<span>: </span>').appendTo(header);
            }
        }
        entryObj = $('<span class="red-ui-debug-msg-object-value"></span>').appendTo(header);

        var isArray = Array.isArray(obj);
        var isArrayObject = false;
        if (obj && typeof obj === 'object' && obj.hasOwnProperty('type') && obj.hasOwnProperty('data') && ((obj.__enc__ && obj.type === 'set') || (obj.__enc__ && obj.type === 'array') || obj.type === 'Buffer')) {
            isArray = true;
            isArrayObject = true;
        }
        if (obj === null || obj === undefined) {
            $('<span class="red-ui-debug-msg-type-null">'+obj+'</span>').appendTo(entryObj);
        } else if (obj.__enc__ && obj.type === 'undefined') {
            $('<span class="red-ui-debug-msg-type-null">undefined</span>').appendTo(entryObj);
        } else if (obj.__enc__ && (obj.type === 'number' || obj.type === 'bigint')) {
            e = $('<span class="red-ui-debug-msg-type-number red-ui-debug-msg-object-header"></span>').text(obj.data).appendTo(entryObj);
        } else if (typeHint === "regexp" || (obj.__enc__ && obj.type === 'regexp')) {
            e = $('<span class="red-ui-debug-msg-type-string red-ui-debug-msg-object-header"></span>').text((typeof obj === "string")?obj:obj.data).appendTo(entryObj);
        } else if (typeHint === "function" || (obj.__enc__ && obj.type === 'function')) {
            e = $('<span class="red-ui-debug-msg-type-meta red-ui-debug-msg-object-header"></span>').text("function").appendTo(entryObj);
        } else if (typeHint === "internal" || (obj.__enc__ && obj.type === 'internal')) {
            e = $('<span class="red-ui-debug-msg-type-meta red-ui-debug-msg-object-header"></span>').text("[internal]").appendTo(entryObj);
        } else if (typeof obj === 'string') {
            if (/[\t\n\r]/.test(obj)) {
                element.addClass('collapsed');
                $('<i class="fa fa-caret-right red-ui-debug-msg-object-handle"></i> ').prependTo(header);
                makeExpandable(header, function() {
                    $('<span class="red-ui-debug-msg-type-meta red-ui-debug-msg-object-type-header"></span>').text(typeHint||'string').appendTo(header);
                    var row = $('<div class="red-ui-debug-msg-object-entry collapsed"></div>').appendTo(element);
                    $('<pre class="red-ui-debug-msg-type-string"></pre>').text(obj).appendTo(row);
                },function(state) {if (ontoggle) { ontoggle(path,state);}}, checkExpanded(strippedKey, expandPaths, { expandLeafNodes }));
            }
            e = $('<span class="red-ui-debug-msg-type-string red-ui-debug-msg-object-header"></span>').html('"'+formatString(sanitize(obj))+'"').appendTo(entryObj);
            if (/^#[0-9a-f]{6}$/i.test(obj)) {
                $('<span class="red-ui-debug-msg-type-string-swatch"></span>').css('backgroundColor',obj).appendTo(e);
            }

            let n = RED.nodes.node(obj) ?? RED.nodes.workspace(obj);
            if (n) {
                if (options.nodeSelector && "function" == typeof options.nodeSelector) {
                    e.css('cursor', 'pointer').on("click", function(evt) {
                        evt.preventDefault();
                        options.nodeSelector(n.id);
                    })
                }
            }

        } else if (typeof obj === 'number') {
            e = $('<span class="red-ui-debug-msg-type-number"></span>').appendTo(entryObj);

            if (Number.isInteger(obj) && (obj >= 0)) { // if it's a +ve integer
                e.addClass("red-ui-debug-msg-type-number-toggle");
                e.on("click", function(evt) {
                    evt.preventDefault();
                    formatNumber($(this), obj, sourceId, path, true);
                });
            }
            formatNumber(e,obj,sourceId,path,false,typeHint==='hex'?'hex':undefined);

        } else if (isArray) {
            element.addClass('collapsed');

            var originalLength = obj.length;
            if (typeHint) {
                var m = /\[(\d+)\]/.exec(typeHint);
                if (m) {
                    originalLength = parseInt(m[1]);
                }
            }
            var data = obj;
            var type = 'array';
            if (isArrayObject) {
                data = obj.data;
                if (originalLength === undefined) {
                    originalLength = data.length;
                }
                if (data.__enc__) {
                    data = data.data;
                }
                type = obj.type.toLowerCase();
            } else if (/buffer/.test(typeHint)) {
                type = 'buffer';
            }
            var fullLength = data.length;

            if (originalLength > 0) {
                $('<i class="fa fa-caret-right red-ui-debug-msg-object-handle"></i> ').prependTo(header);
                var arrayRows = $('<div class="red-ui-debug-msg-array-rows"></div>').appendTo(element);
                element.addClass('red-ui-debug-msg-buffer-raw');
            }
            if (key) {
                headerHead = $('<span class="red-ui-debug-msg-type-meta"></span>').text(typeHint||(type+'['+originalLength+']')).appendTo(entryObj);
            } else {
                headerHead = $('<span class="red-ui-debug-msg-object-header"></span>').appendTo(entryObj);
                $('<span>[ </span>').appendTo(headerHead);
                var arrayLength = Math.min(originalLength,10);
                for (i=0;i<arrayLength;i++) {
                    buildMessageSummaryValue(data[i]).appendTo(headerHead);
                    if (i < arrayLength-1) {
                        $('<span>, </span>').appendTo(headerHead);
                    }
                }
                if (originalLength > arrayLength) {
                    $('<span> &hellip;</span>').appendTo(headerHead);
                }
                if (arrayLength === 0) {
                    $('<span class="red-ui-debug-msg-type-meta">empty</span>').appendTo(headerHead);
                }
                $('<span> ]</span>').appendTo(headerHead);
            }
            if (originalLength > 0) {

                makeExpandable(header,function() {
                    if (!key) {
                        headerHead = $('<span class="red-ui-debug-msg-type-meta red-ui-debug-msg-object-type-header"></span>').text(typeHint||(type+'['+originalLength+']')).appendTo(header);
                    }
                    if (type === 'buffer') {
                        var stringRow = $('<div class="red-ui-debug-msg-string-rows"></div>').appendTo(element);
                        var sr = $('<div class="red-ui-debug-msg-object-entry collapsed"></div>').appendTo(stringRow);
                        var stringEncoding = "";
                        try {
                            stringEncoding = String.fromCharCode.apply(null, new Uint16Array(data))
                        } catch(err) {
                            console.log(err);
                        }
                        $('<pre class="red-ui-debug-msg-type-string"></pre>').text(stringEncoding).appendTo(sr);
                        var bufferOpts = $('<span class="red-ui-debug-msg-buffer-opts"></span>').appendTo(headerHead);
                        var switchFormat = $('<a class="red-ui-button red-ui-button-small" href="#"></a>').text('raw').appendTo(bufferOpts).on("click", function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            formatBuffer(element,$(this),sourceId,path,true);
                        });
                        formatBuffer(element,switchFormat,sourceId,path,false);

                    }
                    var row;
                    if (fullLength <= 10) {
                        for (i=0;i<fullLength;i++) {
                            row = $('<div class="red-ui-debug-msg-object-entry collapsed"></div>').appendTo(arrayRows);
                            subElements[path+"["+i+"]"] = createObjectElement(
                                data[i],
                                {
                                    key: ""+i,
                                    typeHint: type==='buffer'?'hex':false,
                                    hideKey: false,
                                    path: path+"["+i+"]",
                                    sourceId,
                                    rootPath,
                                    expandPaths,
                                    expandLeafNodes,
                                    ontoggle,
                                    exposeApi,
                                    // tools: tools // Do not pass tools down as we
                                                    // keep them attached to the top-level header
                                    nodeSelector: options.nodeSelector,
                                    enablePinning
                                }
                            ).appendTo(row);
                        }
                    } else {
                        for (i=0;i<fullLength;i+=10) {
                            var minRange = i;
                            row = $('<div class="red-ui-debug-msg-object-entry collapsed"></div>').appendTo(arrayRows);
                            header = $('<span></span>').appendTo(row);
                            $('<i class="fa fa-caret-right red-ui-debug-msg-object-handle"></i> ').appendTo(header);
                            makeExpandable(header, (function() {
                                var min = minRange;
                                var max = Math.min(fullLength-1,(minRange+9));
                                var parent = row;
                                return function() {
                                    for (var i=min;i<=max;i++) {
                                        var row = $('<div class="red-ui-debug-msg-object-entry collapsed"></div>').appendTo(parent);
                                        subElements[path+"["+i+"]"] = createObjectElement(
                                            data[i],
                                            {
                                                key: ""+i,
                                                typeHint: type==='buffer'?'hex':false,
                                                hideKey: false,
                                                path: path+"["+i+"]",
                                                sourceId,
                                                rootPath,
                                                expandPaths,
                                                expandLeafNodes,
                                                ontoggle,
                                                exposeApi,
                                                // tools: tools // Do not pass tools down as we
                                                                // keep them attached to the top-level header
                                                nodeSelector: options.nodeSelector,
                                                enablePinning
                                            }
                                        ).appendTo(row);
                                    }
                                }
                            })(),
                            (function() { var path = path+"["+i+"]"; return function(state) {if (ontoggle) { ontoggle(path,state);}}})(),
                            checkExpanded(strippedKey,expandPaths,{ minRange, maxRange: Math.min(fullLength-1,(minRange+9)), expandLeafNodes}));
                            $('<span class="red-ui-debug-msg-object-key"></span>').html("["+minRange+" &hellip; "+Math.min(fullLength-1,(minRange+9))+"]").appendTo(header);
                        }
                        if (fullLength < originalLength) {
                             $('<div class="red-ui-debug-msg-object-entry collapsed"><span class="red-ui-debug-msg-object-key">['+fullLength+' &hellip; '+originalLength+']</span></div>').appendTo(arrayRows);
                        }
                    }
                },
                function(state) {if (ontoggle) { ontoggle(path,state);}},
                checkExpanded(strippedKey, expandPaths, { expandLeafNodes }));
            }
        } else if (typeof obj === 'object') {
            element.addClass('collapsed');
            var data = obj;
            var type = "object";
            if (data.__enc__) {
                data = data.data;
                type = obj.type.toLowerCase();
            }
            var keys = Object.keys(data);
            if (key || keys.length > 0) {
                $('<i class="fa fa-caret-right red-ui-debug-msg-object-handle"></i> ').prependTo(header);
                makeExpandable(header, function() {
                    if (!key) {
                        $('<span class="red-ui-debug-msg-type-meta red-ui-debug-msg-object-type-header"></span>').text(type).appendTo(header);
                    }
                    for (i=0;i<keys.length;i++) {
                        var row = $('<div class="red-ui-debug-msg-object-entry collapsed"></div>').appendTo(element);
                        var newPath = path;
                        if (newPath !== undefined) {
                            if (/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(keys[i])) {
                                newPath += (newPath.length > 0?".":"")+keys[i];
                            } else {
                                newPath += "[\""+keys[i].replace(/"/,"\\\"")+"\"]"
                            }
                        }
                        subElements[newPath] = createObjectElement(
                            data[keys[i]],
                            {
                                key: keys[i],
                                typeHint: false,
                                hideKey: false,
                                path: newPath,
                                sourceId,
                                rootPath,
                                expandPaths,
                                expandLeafNodes,
                                ontoggle,
                                exposeApi,
                                // tools: tools // Do not pass tools down as we
                                                // keep them attached to the top-level header
                                nodeSelector: options.nodeSelector,
                                enablePinning
                            }
                        ).appendTo(row);
                    }
                    if (keys.length === 0) {
                        $('<div class="red-ui-debug-msg-object-entry red-ui-debug-msg-type-meta collapsed"></div>').text("empty").appendTo(element);
                    }
                },
                function(state) {if (ontoggle) { ontoggle(path,state);}},
                checkExpanded(strippedKey, expandPaths, { expandLeafNodes }));
            }
            if (key) {
                $('<span class="red-ui-debug-msg-type-meta"></span>').text(type).appendTo(entryObj);
            } else {
                headerHead = $('<span class="red-ui-debug-msg-object-header"></span>').appendTo(entryObj);
                $('<span>{ </span>').appendTo(headerHead);
                var keysLength = Math.min(keys.length,5);
                for (i=0;i<keysLength;i++) {
                    $('<span class="red-ui-debug-msg-object-key"></span>').text(keys[i]).appendTo(headerHead);
                    $('<span>: </span>').appendTo(headerHead);
                    buildMessageSummaryValue(data[keys[i]]).appendTo(headerHead);
                    if (i < keysLength-1) {
                        $('<span>, </span>').appendTo(headerHead);
                    }
                }
                if (keys.length > keysLength) {
                    $('<span> &hellip;</span>').appendTo(headerHead);
                }
                if (keysLength === 0) {
                    $('<span class="red-ui-debug-msg-type-meta">empty</span>').appendTo(headerHead);
                }
                $('<span> }</span>').appendTo(headerHead);
            }
        } else {
            $('<span class="red-ui-debug-msg-type-other"></span>').text(""+obj).appendTo(entryObj);
        }
        if (exposeApi) {
            element.prop('expand', function() { return function(targetPath, state) {
                if (path === targetPath) {
                    if (header.prop('toggle')) {
                        header.prop('toggle')(state);
                    }
                } else if (subElements[targetPath] && subElements[targetPath].prop('expand') ) {
                    subElements[targetPath].prop('expand')(targetPath,state);
                } else {
                    for (var p in subElements) {
                        if (subElements.hasOwnProperty(p)) {
                            if (targetPath.indexOf(p) === 0) {
                                if (subElements[p].prop('expand') ) {
                                    subElements[p].prop('expand')(targetPath,state);
                                }
                                break;
                            }
                        }
                    }
                }
            }});
        }
        return element;
    }

    function createError(code, message) {
        var e = new Error(message);
        e.code = code;
        return e;
    }

    function normalisePropertyExpression(str,msg) {
        // This must be kept in sync with validatePropertyExpression
        // in editor/js/ui/utils.js

        var length = str.length;
        if (length === 0) {
            throw createError("INVALID_EXPR","Invalid property expression: zero-length");
        }
        var parts = [];
        var start = 0;
        var inString = false;
        var inBox = false;
        var boxExpression = false;
        var quoteChar;
        var v;
        for (var i=0;i<length;i++) {
            var c = str[i];
            if (!inString) {
                if (c === "'" || c === '"') {
                    if (i != start) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+c+" at position "+i);
                    }
                    inString = true;
                    quoteChar = c;
                    start = i+1;
                } else if (c === '.') {
                    if (i===0) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected . at position 0");
                    }
                    if (start != i) {
                        v = str.substring(start,i);
                        if (/^\d+$/.test(v)) {
                            parts.push(parseInt(v));
                        } else {
                            parts.push(v);
                        }
                    }
                    if (i===length-1) {
                        throw createError("INVALID_EXPR","Invalid property expression: unterminated expression");
                    }
                    // Next char is first char of an identifier: a-z 0-9 $ _
                    if (!/[a-z0-9\$\_]/i.test(str[i+1])) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+str[i+1]+" at position "+(i+1));
                    }
                    start = i+1;
                } else if (c === '[') {
                    if (i === 0) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+c+" at position "+i);
                    }
                    if (start != i) {
                        parts.push(str.substring(start,i));
                    }
                    if (i===length-1) {
                        throw createError("INVALID_EXPR","Invalid property expression: unterminated expression");
                    }
                    // Start of a new expression. If it starts with msg it is a nested expression
                    // Need to scan ahead to find the closing bracket
                    if (/^msg[.\[]/.test(str.substring(i+1))) {
                        var depth = 1;
                        var inLocalString = false;
                        var localStringQuote;
                        for (var j=i+1;j<length;j++) {
                            if (/["']/.test(str[j])) {
                                if (inLocalString) {
                                    if (str[j] === localStringQuote) {
                                        inLocalString = false
                                    }
                                } else {
                                    inLocalString = true;
                                    localStringQuote = str[j]
                                }
                            }
                            if (str[j] === '[') {
                                depth++;
                            } else if (str[j] === ']') {
                                depth--;
                            }
                            if (depth === 0) {
                                try {
                                    if (msg) {
                                        parts.push(getMessageProperty(msg, str.substring(i+1,j)))
                                    } else {
                                        parts.push(normalisePropertyExpression(str.substring(i+1,j), msg));
                                    }
                                    inBox = false;
                                    i = j;
                                    start = j+1;
                                    break;
                                } catch(err) {
                                    throw createError("INVALID_EXPR","Invalid expression started at position "+(i+1))
                                }
                            }
                        }
                        if (depth > 0) {
                            throw createError("INVALID_EXPR","Invalid property expression: unmatched '[' at position "+i);
                        }
                        continue;
                    } else if (!/["'\d]/.test(str[i+1])) {
                        // Next char is either a quote or a number
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+str[i+1]+" at position "+(i+1));
                    }
                    start = i+1;
                    inBox = true;
                } else if (c === ']') {
                    if (!inBox) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+c+" at position "+i);
                    }
                    if (start != i) {
                        v = str.substring(start,i);
                        if (/^\d+$/.test(v)) {
                            parts.push(parseInt(v));
                        } else {
                            throw createError("INVALID_EXPR","Invalid property expression: unexpected array expression at position "+start);
                        }
                    }
                    start = i+1;
                    inBox = false;
                } else if (c === ' ') {
                    throw createError("INVALID_EXPR","Invalid property expression: unexpected ' ' at position "+i);
                }
            } else {
                if (c === quoteChar) {
                    if (i-start === 0) {
                        throw createError("INVALID_EXPR","Invalid property expression: zero-length string at position "+start);
                    }
                    parts.push(str.substring(start,i));
                    // If inBox, next char must be a ]. Otherwise it may be [ or .
                    if (inBox && !/\]/.test(str[i+1])) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected array expression at position "+start);
                    } else if (!inBox && i+1!==length && !/[\[\.]/.test(str[i+1])) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+str[i+1]+" expression at position "+(i+1));
                    }
                    start = i+1;
                    inString = false;
                }
            }

        }
        if (inBox || inString) {
            throw new createError("INVALID_EXPR","Invalid property expression: unterminated expression");
        }
        if (start < length) {
            parts.push(str.substring(start));
        }
        return parts;
    }

    /**
     * Validate a property expression
     * @param {*} str - the property value
     * @returns {boolean|string} whether the node proprty is valid. `true`: valid `false|String`: invalid
     */
    function validatePropertyExpression(str, opt) {
        try {
            const parts = normalisePropertyExpression(str);
            return true;
        } catch(err) {
            // If the validator has opt, it is a 3.x validator that
            // can return a String to mean 'invalid' and provide a reason
            if (opt) {
                if (opt.label) {
                    return opt.label + ': ' + err.message;
                }
                return err.message;
            }
            // Otherwise, a 2.x returns a false value
            return false;
        }
    }

    /**
     * Checks a typed property is valid according to the type.
     * Returns true if valid.
     * Return String error message if invalid
     * @param {*} propertyType 
     * @param {*} propertyValue 
     * @returns true if valid, String if invalid
     */
    function validateTypedProperty(propertyValue, propertyType, opt) {
        if (propertyValue && /^\${[^}]+}$/.test(propertyValue)) {
            // Allow ${ENV_VAR} value
            return true
        }
        let error;
        if (propertyType === 'json') {
            try {
                JSON.parse(propertyValue);
            } catch(err) {
                error = RED._("validator.errors.invalid-json", {
                    error: err.message
                });
            }
        } else if (propertyType === 'msg' || propertyType === 'flow' || propertyType === 'global' ) {
            // To avoid double label
            const valid = RED.utils.validatePropertyExpression(propertyValue, opt ? {} : null);
            if (valid !== true) {
                error = opt ? valid : RED._("validator.errors.invalid-prop");
            }
        } else if (propertyType === 'num') {
            if (!/^NaN$|^[+-]?[0-9]*\.?[0-9]*([eE][-+]?[0-9]+)?$|^[+-]?(0b|0B)[01]+$|^[+-]?(0o|0O)[0-7]+$|^[+-]?(0x|0X)[0-9a-fA-F]+$/.test(propertyValue)) {
                error = RED._("validator.errors.invalid-num");
            }
        } else if (propertyType === 'jsonata') {
            try { 
                jsonata(propertyValue)
            } catch(err) {
                error = RED._("validator.errors.invalid-expr", {
                    error: err.message
                });
            }
        }
        if (error) {
            if (opt && opt.label) {
                return opt.label + ': ' + error;
            }
            return error;
        }
        return true;
    }

    function getMessageProperty(msg,expr) {
        var result = null;
        var msgPropParts;

        if (typeof expr === 'string') {
            if (expr.indexOf('msg.')===0) {
                expr = expr.substring(4);
            }
            msgPropParts = normalisePropertyExpression(expr);
        } else {
            msgPropParts = expr;
        }
        var m;
        msgPropParts.reduce(function(obj, key) {
            result = (typeof obj[key] !== "undefined" ? obj[key] : undefined);
            if (result === undefined && obj.hasOwnProperty('type') && obj.hasOwnProperty('data')&& obj.hasOwnProperty('length')) {
                result = (typeof obj.data[key] !== "undefined" ? obj.data[key] : undefined);
            }
            return result;
        }, msg);
        return result;
    }

    function setMessageProperty(msg,prop,value,createMissing) {
        if (typeof createMissing === 'undefined') {
            createMissing = (typeof value !== 'undefined');
        }
        if (prop.indexOf('msg.')===0) {
            prop = prop.substring(4);
        }
        var msgPropParts = normalisePropertyExpression(prop);
        var depth = 0;
        var length = msgPropParts.length;
        var obj = msg;
        var key;
        for (var i=0;i<length-1;i++) {
            key = msgPropParts[i];
            if (typeof key === 'string' || (typeof key === 'number' && !Array.isArray(obj))) {
                if (obj.hasOwnProperty(key)) {
                    obj = obj[key];
                } else if (createMissing) {
                    if (typeof msgPropParts[i+1] === 'string') {
                        obj[key] = {};
                    } else {
                        obj[key] = [];
                    }
                    obj = obj[key];
                } else {
                    return null;
                }
            } else if (typeof key === 'number') {
                // obj is an array
                if (obj[key] === undefined) {
                    if (createMissing) {
                        if (typeof msgPropParts[i+1] === 'string') {
                            obj[key] = {};
                        } else {
                            obj[key] = [];
                        }
                        obj = obj[key];
                    } else {
                        return null;
                    }
                } else {
                    obj = obj[key];
                }
            }
        }
        key = msgPropParts[length-1];
        if (typeof value === "undefined") {
            if (typeof key === 'number' && Array.isArray(obj)) {
                obj.splice(key,1);
            } else {
                delete obj[key]
            }
        } else {
            obj[key] = value;
        }
    }

    function separateIconPath(icon) {
        var result = {module: "", file: ""};
        if (icon) {
            var index = icon.indexOf(RED.settings.apiRootUrl+'icons/');
            if (index === 0) {
                icon = icon.substring((RED.settings.apiRootUrl+'icons/').length);
            }
            var match = /^((?:@[^/]+\/)?[^/]+)\/(.*)$/.exec(icon);
            if (match) {
                result.module = match[1];
                result.file = match[2];
            } else {
                result.file = icon;
            }
        }
        return result;
    }

    function getDefaultNodeIcon(def,node) {
        def = def || {};
        var icon_url;
        if (node && node.type === "subflow") {
            icon_url = "node-red/subflow.svg";
        } else if (typeof def.icon === "function") {
            try {
                icon_url = def.icon.call(node);
            } catch(err) {
                console.log("Definition error: "+def.type+".icon",err);
                icon_url = "arrow-in.svg";
            }
        } else {
            icon_url = def.icon;
        }

        var iconPath = separateIconPath(icon_url);
        if (!iconPath.module) {
            if (def.set) {
                iconPath.module = def.set.module;
            } else {
                // Handle subflow instance nodes that don't have def.set
                iconPath.module = "node-red";
            }
        }
        return iconPath;
    }

    function isIconExists(iconPath) {
        var iconSets = RED.nodes.getIconSets();
        var iconFileList = iconSets[iconPath.module];
        if (iconFileList && iconFileList.indexOf(iconPath.file) !== -1) {
            return true;
        } else {
            return false;
        }
    }

    function getNodeIcon(def,node) {
        def = def || {};
        if (node && node.type === '_selection_') {
            return "font-awesome/fa-object-ungroup";
        } else if (node && node.type === 'group') {
            return "font-awesome/fa-object-group"
        } else if ((node && node.type === 'junction') || (def.type === "junction") ) {
            return "font-awesome/fa-circle-o"
        } else if (def.category === 'config') {
            return RED.settings.apiRootUrl+"icons/node-red/cog.svg"
        } else if ((node && /^_action_:/.test(node.type)) || /^_action_:/.test(def.type)) {
            return "font-awesome/fa-cogs"
        } else if (node && node.type === 'tab') {
            return "red-ui-icons/red-ui-icons-flow"
            // return RED.settings.apiRootUrl+"images/subflow_tab.svg"
        } else if (node && node.type === 'unknown') {
            return RED.settings.apiRootUrl+"icons/node-red/alert.svg"
        } else if (node && node.icon) {
            var iconPath = separateIconPath(node.icon);
            if (isIconExists(iconPath)) {
                if (iconPath.module === "font-awesome") {
                    return node.icon;
                } else {
                    return RED.settings.apiRootUrl+"icons/" + node.icon;
                }
            } else if (iconPath.module !== "font-awesome" && /.png$/i.test(iconPath.file)) {
                iconPath.file = iconPath.file.replace(/.png$/,".svg");
                if (isIconExists(iconPath)) {
                    return RED.settings.apiRootUrl+"icons/" + node.icon.replace(/.png$/,".svg");
                }
            }
        }

        var iconPath = getDefaultNodeIcon(def, node);
        if (isIconExists(iconPath)) {
            if (iconPath.module === "font-awesome") {
                return iconPath.module+"/"+iconPath.file;
            } else {
                return RED.settings.apiRootUrl+"icons/"+iconPath.module+"/"+iconPath.file;
            }
        }

        if (/.png$/i.test(iconPath.file)) {
            var originalFile = iconPath.file;
            iconPath.file = iconPath.file.replace(/.png$/,".svg");
            if (isIconExists(iconPath)) {
                return RED.settings.apiRootUrl+"icons/"+iconPath.module+"/"+iconPath.file;
            }
            iconPath.file = originalFile;
        }

        // This could be a non-core node trying to use a core icon.
        iconPath.module = 'node-red';
        if (isIconExists(iconPath)) {
            return RED.settings.apiRootUrl+"icons/"+iconPath.module+"/"+iconPath.file;
        }
        if (/.png$/i.test(iconPath.file)) {
            iconPath.file = iconPath.file.replace(/.png$/,".svg");
            if (isIconExists(iconPath)) {
                return RED.settings.apiRootUrl+"icons/"+iconPath.module+"/"+iconPath.file;
            }
        }
        if (def.category === 'subflows') {
            return RED.settings.apiRootUrl+"icons/node-red/subflow.svg";
        }
        return RED.settings.apiRootUrl+"icons/node-red/arrow-in.svg";
    }

    function getNodeLabel(node,defaultLabel) {
        defaultLabel = defaultLabel||"";
        var l;
        if (node.type === 'tab') {
            l = node.label || defaultLabel
        } else if (node.type === 'group') {
            l = node.name || defaultLabel
        } else if (node.type === 'junction') {
            l = 'junction'
        } else {
            l = node._def.label;
            try {
                l = (typeof l === "function" ? l.call(node) : l)||defaultLabel;
            } catch(err) {
                console.log("Definition error: "+node.type+".label",err);
                l = defaultLabel;
            }
        }
        return RED.text.bidi.enforceTextDirectionWithUCC(l);
    }

    function getPaletteLabel(nodeType, def) {
        var label = nodeType;
        if (typeof def.paletteLabel !== "undefined") {
            try {
                label = (typeof def.paletteLabel === "function" ? def.paletteLabel.call(def) : def.paletteLabel)||"";
            } catch(err) {
                console.log("Definition error: "+nodeType+".paletteLabel",err);
            }
        }
        return label
    }

    var nodeColorCache = {};
    function clearNodeColorCache() {
        nodeColorCache = {};
    }

    function getNodeColor(type, def) {
        def = def || {};
        var result = def.color;
        var paletteTheme = RED.settings.theme('palette.theme') || [];
        if (paletteTheme.length > 0) {
            if (!nodeColorCache.hasOwnProperty(type)) {
                nodeColorCache[type] = def.color;
                var l = paletteTheme.length;
                for (var i = 0; i < l; i++ ){
                    var themeRule = paletteTheme[i];
                    if (themeRule.hasOwnProperty('category')) {
                        if (!themeRule.hasOwnProperty('_category')) {
                            themeRule._category = new RegExp(themeRule.category);
                        }
                        if (!themeRule._category.test(def.category)) {
                            continue;
                        }
                    }
                    if (themeRule.hasOwnProperty('type')) {
                        if (!themeRule.hasOwnProperty('_type')) {
                            themeRule._type = new RegExp(themeRule.type);
                        }
                        if (!themeRule._type.test(type)) {
                            continue;
                        }
                    }
                    nodeColorCache[type] = themeRule.color || def.color;
                    break;
                }
            }
            result = nodeColorCache[type];
        }
        if (result) {
            return result;
        } else {
            return "#ddd";
        }
    }

    function addSpinnerOverlay(container,contain) {
        var spinner = $('<div class="red-ui-component-spinner "><img src="red/images/spin.svg"/></div>').appendTo(container);
        if (contain) {
            spinner.addClass('red-ui-component-spinner-contain');
        }
        return spinner;
    }

    function decodeObject(payload,format) {
        if ((format === 'number') && (payload === "NaN")) {
            payload = Number.NaN;
        } else if ((format === 'number') && (payload === "Infinity")) {
            payload = Infinity;
        } else if ((format === 'number') && (payload === "-Infinity")) {
            payload = -Infinity;
        } else if (format === 'Object' || /^(array|set|map)/.test(format) || format === 'boolean' || format === 'number' ) {
            payload = JSON.parse(payload);
        } else if (/error/i.test(format)) {
            payload = JSON.parse(payload);
        } else if (format === 'null') {
            payload = null;
        } else if (format === 'undefined') {
            payload = undefined;
        } else if (/^buffer/.test(format)) {
            var buffer = payload;
            payload = [];
            for (var c = 0; c < buffer.length; c += 2) {
                payload.push(parseInt(buffer.substr(c, 2), 16));
            }
        }
        return payload;
    }

    function parseContextKey(key, defaultStore) {
        var parts = {};
        var m = /^#:\((\S+?)\)::(.*)$/.exec(key);
        if (m) {
            parts.store = m[1];
            parts.key = m[2];
        } else {
            parts.key = key;
            if (defaultStore) {
                parts.store = defaultStore;
            } else if (RED.settings.context) {
                parts.store = RED.settings.context.default;
            }
        }
        return parts;
    }

     /**
      * Create or update an icon element and append it to iconContainer.
      * @param iconUrl - Url of icon.
      * @param iconContainer - Icon container element with red-ui-palette-icon-container class.
      * @param isLarge - Whether the icon size is large.
      */
    function createIconElement(iconUrl, iconContainer, isLarge) {
        // Removes the previous icon when icon was changed.
        var iconElement = iconContainer.find(".red-ui-palette-icon");
        if (iconElement.length !== 0) {
            iconElement.remove();
        }
        var faIconElement = iconContainer.find("i");
        if (faIconElement.length !== 0) {
            faIconElement.remove();
        }

        // Show either icon image or font-awesome icon
        var iconPath = separateIconPath(iconUrl);
        if (iconPath.module === "font-awesome") {
            var fontAwesomeUnicode = RED.nodes.fontAwesome.getIconUnicode(iconPath.file);
            if (fontAwesomeUnicode) {
                var faIconElement = $('<i/>').appendTo(iconContainer);
                var faLarge = isLarge ? "fa-lg " : "";
                faIconElement.addClass("red-ui-palette-icon-fa fa fa-fw " + faLarge + iconPath.file);
                return;
            }
            // If the specified name is not defined in font-awesome, show arrow-in icon.
            iconUrl = RED.settings.apiRootUrl+"icons/node-red/arrow-in.svg"
        } else if (iconPath.module === "red-ui-icons") {
            var redIconElement = $('<i/>').appendTo(iconContainer);
            redIconElement.addClass("red-ui-palette-icon red-ui-icons " + iconPath.file);
            return;
        }
        var imageIconElement = $('<div/>',{class:"red-ui-palette-icon"}).appendTo(iconContainer);
        imageIconElement.css("backgroundImage", "url("+iconUrl+")");
    }

    function createNodeIcon(node, includeLabel) {
        var container = $('<span class="red-ui-node-icon-container">');

        var def = node._def;
        var nodeDiv = $('<div>',{class:"red-ui-node-icon"})
        if (node.type === "_selection_") {
            nodeDiv.addClass("red-ui-palette-icon-selection");
        } else if (node.type === "group") {
            nodeDiv.addClass("red-ui-palette-icon-group");
        } else if (node.type === "junction") {
            nodeDiv.addClass("red-ui-palette-icon-junction");
        } else if (node.type === 'tab') {
            nodeDiv.addClass("red-ui-palette-icon-flow");
        } else {
            var colour = RED.utils.getNodeColor(node.type,def);
            // if (node.type === 'tab') {
            //     colour = "#C0DEED";
            // }
            nodeDiv.css('backgroundColor',colour);
            var borderColor = getDarkerColor(colour);
            if (borderColor !== colour) {
                nodeDiv.css('border-color',borderColor)
            }
        }

        var icon_url = RED.utils.getNodeIcon(def,node);
        RED.utils.createIconElement(icon_url, nodeDiv, true);

        nodeDiv.appendTo(container);

        if (includeLabel) {
            var labelText = RED.utils.getNodeLabel(node,node.name || (node.type+": "+node.id));
            var label = $('<div>',{class:"red-ui-node-label"}).appendTo(container);
            if (labelText) {
                label.text(labelText)
            } else {
                label.html("&nbsp;")
            }
        }
        return container;
    }

    function getDarkerColor(c) {
        var r,g,b;
        if (/^#[a-f0-9]{6}$/i.test(c)) {
            r = parseInt(c.substring(1, 3), 16);
            g = parseInt(c.substring(3, 5), 16);
            b = parseInt(c.substring(5, 7), 16);
        } else if (/^#[a-f0-9]{3}$/i.test(c)) {
            r = parseInt(c.substring(1, 2)+c.substring(1, 2), 16);
            g = parseInt(c.substring(2, 3)+c.substring(2, 3), 16);
            b = parseInt(c.substring(3, 4)+c.substring(3, 4), 16);
        } else {
            return c;
        }
        var l = 0.3 * r/255 + 0.59 * g/255 + 0.11 * b/255 ;
        r = Math.max(0,r-50);
        g = Math.max(0,g-50);
        b = Math.max(0,b-50);
        var s = ((r<<16) + (g<<8) + b).toString(16);
        return '#'+'000000'.slice(0, 6-s.length)+s;
    }

    function parseModuleList(list) {
        list = list || ["*"];
        return list.map(function(rule) {
            var m = /^(.+?)(?:@(.*))?$/.exec(rule);
            var wildcardPos = m[1].indexOf("*");
            wildcardPos = wildcardPos===-1?Infinity:wildcardPos;

            return {
                module: new RegExp("^"+m[1].replace(/\*/g,".*")+"$"),
                version: m[2],
                wildcardPos: wildcardPos
            }
        })
    }

    function checkAgainstList(module,version,list) {
        for (var i=0;i<list.length;i++) {
            var rule = list[i];
            if (rule.module.test(module)) {
                // Without a full semver library in the editor,
                // we skip the version check.
                // Not ideal - but will get caught in the runtime
                // if the user tries to install.
                return rule;
            }
        }
    }

    function checkModuleAllowed(module,version,allowList,denyList) {
        if (!allowList && !denyList) {
            // Default to allow
            return true;
        }
        if (allowList.length === 0 && denyList.length === 0) {
            return true;
        }

        var allowedRule = checkAgainstList(module,version,allowList);
        var deniedRule = checkAgainstList(module,version,denyList);
        // console.log("A",allowedRule)
        // console.log("D",deniedRule)

        if (allowedRule && !deniedRule) {
            return true;
        }
        if (!allowedRule && deniedRule) {
            return false;
        }
        if (!allowedRule && !deniedRule) {
            return true;
        }
        if (allowedRule.wildcardPos !== deniedRule.wildcardPos) {
            return allowedRule.wildcardPos > deniedRule.wildcardPos
        } else {
            // First wildcard in same position.
            // Go with the longer matching rule. This isn't going to be 100%
            // right, but we are deep into edge cases at this point.
            return allowedRule.module.toString().length > deniedRule.module.toString().length
        }
        return false;
    }

    function getBrowserInfo() {
        var r = {}
        try {
            var ua = navigator.userAgent;
            r.ua = ua;
            r.browser = /Edge\/\d+/.test(ua) ? 'ed' : /MSIE 9/.test(ua) ? 'ie9' : /MSIE 10/.test(ua) ? 'ie10' : /MSIE 11/.test(ua) ? 'ie11' : /MSIE\s\d/.test(ua) ? 'ie?' : /rv\:11/.test(ua) ? 'ie11' : /Firefox\W\d/.test(ua) ? 'ff' : /Chrom(e|ium)\W\d|CriOS\W\d/.test(ua) ? 'gc' : /\bSafari\W\d/.test(ua) ? 'sa' : /\bOpera\W\d/.test(ua) ? 'op' : /\bOPR\W\d/i.test(ua) ? 'op' : typeof MSPointerEvent !== 'undefined' ? 'ie?' : '';
            r.os = /Windows NT 10/.test(ua) ? "win10" : /Windows NT 6\.0/.test(ua) ? "winvista" : /Windows NT 6\.1/.test(ua) ? "win7" : /Windows NT 6\.\d/.test(ua) ? "win8" : /Windows NT 5\.1/.test(ua) ? "winxp" : /Windows NT [1-5]\./.test(ua) ? "winnt" : /Mac/.test(ua) ? "mac" : /Linux/.test(ua) ? "linux" : /X11/.test(ua) ? "nix" : "";
            r.touch = 'ontouchstart' in document.documentElement;
            r.mobile = /IEMobile|Windows Phone|Lumia/i.test(ua) ? 'w' : /iPhone|iP[oa]d/.test(ua) ? 'i' : /Android/.test(ua) ? 'a' : /BlackBerry|PlayBook|BB10/.test(ua) ? 'b' : /Mobile Safari/.test(ua) ? 's' : /webOS|Mobile|Tablet|Opera Mini|\bCrMo\/|Opera Mobi/i.test(ua) ? 1 : 0;
            r.tablet = /Tablet|iPad/i.test(ua);
            r.ie = /MSIE \d|Trident.*rv:/.test(navigator.userAgent);
            r.android = /android/i.test(navigator.userAgent);
        } catch (error) { }
        return r;
    }

    return {
        createObjectElement: createObjectElement,
        getMessageProperty: getMessageProperty,
        setMessageProperty: setMessageProperty,
        normalisePropertyExpression: normalisePropertyExpression,
        validatePropertyExpression: validatePropertyExpression,
        separateIconPath: separateIconPath,
        getDefaultNodeIcon: getDefaultNodeIcon,
        getNodeIcon: getNodeIcon,
        getNodeLabel: getNodeLabel,
        getNodeColor: getNodeColor,
        getPaletteLabel: getPaletteLabel,
        clearNodeColorCache: clearNodeColorCache,
        addSpinnerOverlay: addSpinnerOverlay,
        decodeObject: decodeObject,
        parseContextKey: parseContextKey,
        createIconElement: createIconElement,
        sanitize: sanitize,
        renderMarkdown: renderMarkdown,
        createNodeIcon: createNodeIcon,
        getDarkerColor: getDarkerColor,
        parseModuleList: parseModuleList,
        checkModuleAllowed: checkModuleAllowed,
        getBrowserInfo: getBrowserInfo,
        validateTypedProperty: validateTypedProperty
    }
})();
