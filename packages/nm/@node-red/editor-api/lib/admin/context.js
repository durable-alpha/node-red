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

var apiUtils = require("../util");

var runtimeAPI;


module.exports = {
    init: function(_runtimeAPI) {
        runtimeAPI = _runtimeAPI;
    },

    get: function(req,res) {
        var opts = {
            user: req.user,
            scope: req.params.scope,
            id: req.params.id,
            key: req.params[0],
            store: req.query['store'],
            req: apiUtils.getRequestLogObject(req)
        }
        if (req.query['keysOnly'] !== undefined) {
            opts.keysOnly = true
        }
        runtimeAPI.context.getValue(opts).then(function(result) {
            res.json(result);
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    },

    delete: function(req,res) {
        var opts = {
            user: req.user,
            scope: req.params.scope,
            id: req.params.id,
            key: req.params[0],
            store: req.query['store'],
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.context.delete(opts).then(function(result) {
            res.status(204).end();
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    }
}
