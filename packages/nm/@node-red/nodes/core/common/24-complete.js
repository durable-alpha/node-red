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

module.exports = function(RED) {
    "use strict";

    function CompleteNode(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        this.scope = n.scope || [];

        // auto-filter out any directly connected nodes to avoid simple loopback
        const w = this.wires.flat();
        for (let i=0; i < this.scope.length; i++) {
            if (w.includes(this.scope[i])) {
                this.scope.splice(i, 1);
            }
        }

        this.on("input",function(msg, send, done) {
            send(msg);
            done();
        });
    }

    RED.nodes.registerType("complete",CompleteNode);
}
