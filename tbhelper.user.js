// ==UserScript==
// @name         Tensorboard Runs Selection Helper
// @version      0.1
// @description  Simplify runs selection
// @author       Texot
// @match        http://localhost:8889/*
// @match        http://localhost:8890/*
// @match        http://localhost:8891/*
// @require      https://code.jquery.com/jquery-latest.js
// @require      https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @run-at       document-end
// @grant        none
// @description  Require tensorboard==1.9.0
// @description  Only support scalar dashboard currently
// ==/UserScript==

(function() {
    'use strict';

    // name depth of parent runs
    // e.g. with runs:
    //   - Jul28_16-23-43
    //   - Jul28_16-23-43/loss/train
    //   - Jul28_16-23-43/loss/val
    //   - Jul28_16-23-43/prec/train
    //   - Jul28_16-23-43/prec/val
    //   - Jul29_21-11-37
    //   - Jul29_21-11-37/loss/train
    //   - Jul29_21-11-37/loss/val
    //   - Jul29_21-11-37/prec/train
    //   - Jul29_21-11-37/prec/val
    //   we would like to select runs start by its date and time, for example, 'Jul28_16-23-43'.
    //   we can set 'PARENT_RUN_DEPTH' to 1, which means runs with name equals to the first
    //   'PARENT_RUN_DEPTH' component(s) of each individual run name is used as representative
    //   selector(or called parent runs).
    //   NOTE: the representative selector must exists, e.g. we cannot use 'Jul28_16-23-43/loss'
    //   as a parent run because it does not exist.
    //
    //   Suppose another run list:
    //   - exp1/Jul28_16-23-43
    //   - exp1/Jul28_16-23-43/loss/train
    //   - exp1/Jul28_16-23-43/loss/val
    //   - exp1/Jul28_16-23-43/prec/train
    //   - exp1/Jul28_16-23-43/prec/val
    //   - exp1/Jul28_17-48-27
    //   - exp1/Jul28_17-48-27/loss/train
    //   - exp1/Jul28_17-48-27/loss/val
    //   - exp1/Jul28_17-48-27/prec/train
    //   - exp1/Jul28_17-48-27/prec/val
    //   - exp2/Jul29_21-11-37
    //   - exp2/Jul29_21-11-37/loss/train
    //   - exp2/Jul29_21-11-37/loss/val
    //   - exp2/Jul29_21-11-37/prec/train
    //   - exp2/Jul29_21-11-37/prec/val
    //   In this case 'PARENT_RUN_DEPTH' should be set to '2'
    const PARENT_RUN_DEPTH = 2;
    if (PARENT_RUN_DEPTH < 1) {
        console.error("[Tensorboard Runs Selection Helper] PARENT_RUN_DEPTH(" + PARENT_RUN_DEPTH + ") < 1");
        return;
    }

    const STORAGE_MODE = "texot.tfrunhelper.mode";
    const STORAGE_OPTIONS_VIS = "texot.tfrunhelper.options_vis";
    const STORAGE_EXPANDED = "texot.tfrunhelper.expanded";
    const STORAGE_SIDEBAR_MAX_WIDTH = "texot.tfrunhelper.sbmaxwid";
    const STORAGE_SIDEBAR_MIN_WIDTH = "texot.tfrunhelper.sbminwid";
    const STORAGE_SIDEBAR_WIDTH = "texot.tfrunhelper.sbwid";

    const MODE_INDIVIDUAL_RUN = "ir";
    const MODE_MULTI_RUN = "mr";

    function TBSelHelper() {
        let _helper = this;
        let $scalars_dashboard = $(".dashboard-container[data-dashboard='scalars']").eq(0);
        let $sidebar = $scalars_dashboard.find("#sidebar .sidebar-section").eq(0);
        let multi_check_box = $scalars_dashboard.find("#multiCheckbox")[0];
        if ($sidebar.length == 0 || multi_check_box === undefined) {
            console.error("[Tensorboard Runs Selection Helper] Tensorboard components is not found");
            return;
        }

        function isParent(n) {
            return (n.match(/\//g) || []).length == PARENT_RUN_DEPTH-1;
        }

        function getParentName(n) {
            var m;
            return (m = n.match(/^(.+?\/.+?)(?:\/.+)?$/)) ? m.group(0) : null;
        }

        function refreshRuns() {
            let orinames = multi_check_box.names;
            multi_check_box.names = [];
            multi_check_box.names = orinames;
        }

        // Add option
        function setupRunsCollapser() {
            function setupHooks() {
                let computeNamesMatchingRegex_ori = multi_check_box.computeNamesMatchingRegex;
                let computeOutSelected_ori = multi_check_box.computeOutSelected;
                let _checkboxChange_ori = multi_check_box._checkboxChange;
                let _isolateRun_ori = multi_check_box._isolateRun;

                // computeNamesMatchingRegex is for selecting visible runs in the selector
                multi_check_box.computeNamesMatchingRegex = function(__, ___) {
                    if (_helper.mode == MODE_INDIVIDUAL_RUN) return computeNamesMatchingRegex_ori.call(this, __, ___);
                    var regex = this.regex;
                    return this.names.filter(function(n) {
                        return (regex == null || regex.test(n)) && (
                            (_helper.expanded && n.startsWith(_helper.expanded+"/")) ||
                            isParent(n)
                        );
                    });
                };
                // computeOutSelected is for selecting visible curves in the graphs
                multi_check_box.computeOutSelected = function(__, ___) {
                    if (_helper.mode == MODE_INDIVIDUAL_RUN) return computeOutSelected_ori.call(this, __, ___);
                    let namesMatchingRegex = this.namesMatchingRegex;
                    var runSelectionState = this.runSelectionState;
                    var num = this.maxRunsToEnableByDefault;
                    let childNames = this.names.filter(function(n) {
                        return namesMatchingRegex.some(function(pn) {
                            if(n.length < pn.length) return false;
                            else if(n.length == pn.length) return (n === pn);
                            else return n.startsWith(pn + "/");
                        });
                    });
                    var allEnabled = childNames.length <= num;
                    return childNames.filter(function(n, i) {
                        return runSelectionState[n] == null ? allEnabled : runSelectionState[n];
                    });
                };
                // Spread the selection to its child runs
                multi_check_box._checkboxChange = function(e) {
                    if (_helper.mode == MODE_INDIVIDUAL_RUN) return _checkboxChange_ori.call(this, e);
                    _checkboxChange_ori.call(this, e);
                    let target_name = e.target.name;
                    if (!isParent(target_name)) return;
                    let runSelectionState = this.runSelectionState;

                    var selectionState = {};
                    this.names.forEach(function(n) {
                        if (n === target_name || (n.length > target_name.length && n.startsWith(target_name + "/"))) {
                            selectionState[n] = e.target.checked;
                        } else {
                            selectionState[n] = runSelectionState[n];
                        }
                    });
                    this.runSelectionState = selectionState;
                };
                // Spread the selection to its child runs
                multi_check_box._isolateRun = function(e) {
                    if (_helper.mode == MODE_INDIVIDUAL_RUN) return _isolateRun_ori.call(this, e);
                    _isolateRun_ori.call(this, e);
                    let target_name = e.target.parentElement.name;
                    if (!isParent(target_name)) return;
                    var selectionState = {};
                    this.names.forEach(function(n) {
                        if (n === target_name || (n.length > target_name.length && n.startsWith(target_name + "/"))) {
                            selectionState[n] = true;
                        } else {
                            selectionState[n] = false;
                        }
                    });
                    this.runSelectionState = selectionState;
                };

                var last_names = [];
                multi_check_box._syncChildrenRuns = function (e) {
                    if (_helper.mode == MODE_INDIVIDUAL_RUN) return;
                    var newchildren = this.names.filter(x => last_names.length != 0 && !last_names.includes(x) && !isParent(x));
                    if (newchildren.length > 0) {
                        console.log("New name: ", newchildren);
                        last_names.clear();
                        last_names.set(this.names);
                        var runSelectionState = this.runSelectionState;
                        newchildren.forEach(n => {
                            runSelectionState[n] = runSelectionState[getParentName(n)];
                        });
                        this.runSelectionState = {};
                        this.runSelectionState = runSelectionState;
                    }
                }
                multi_check_box._addComplexObserverEffect("_syncChildrenRuns(names.*)");
            }
            function setMode(mode) {
                console.log("Switch to mode " + mode);
                _helper.mode = mode;
                tf_storage.setString(STORAGE_MODE, mode);
                refreshRuns();
            }
            let $ele = $("<div class='line-item'><paper-checkbox>Only show parent runs</paper-checkbox></div>").insertBefore($sidebar.children().eq(0));
            setupHooks();
            setMode(tf_storage.getString(STORAGE_MODE) || MODE_INDIVIDUAL_RUN);
            $ele[0].children[0].checked = (_helper.mode === MODE_MULTI_RUN);
            $ele[0].children[0].addEventListener('change', function(event) {
                if(event.target.checked) {
                    setMode(MODE_MULTI_RUN);
                } else {
                    setMode(MODE_INDIVIDUAL_RUN);
                }
            });
        }

        function setupRunsExpander() {
            function setExpanded(target) {
                _helper.expanded = target || "";
                tf_storage.setString(STORAGE_EXPANDED, _helper.expanded);
                refreshRuns();
            }
            setExpanded(tf_storage.getString(STORAGE_EXPANDED) || "");

            _helper.$runs = $(multi_check_box).find("#outer-container div.run-row .item-label-container");
            function updateRunsElement() {
                _helper.$runs.off(".updateclickevent")
                _helper.$runs.on("mousedown.updateclickevent", function(e) {this._drag = false;});
                _helper.$runs.on("mousemove.updateclickevent", function(e) {this._drag = true;});
                _helper.$runs.on("click.updateclickevent", function(e) {
                    if (this._drag) return;
                    let target_name = $(e.currentTarget).children().eq(0).text().trim();
                    console.log(target_name);
                    if (_helper.expanded == target_name || !isParent(target_name)) {
                        setExpanded(null);
                    } else {
                        setExpanded(target_name);
                    }
                });
                _helper.$runs
                    .css("margin-left", "").css("cursor", "pointer")
                    .filter(function(i,e) {
                    return !isParent($(e).children().eq(0).text());
                })
                    .css("margin-left", "14px");
            }

            $(multi_check_box).on("dom-change", function(e){
                _helper.$runs = $(multi_check_box).find("#outer-container div.run-row .item-label-container");
                updateRunsElement();
            });
        }

        function setupSiderbarController() {
            let $sections_container = $scalars_dashboard.find("#sidebar").eq(0);
            $sections_container.css("position", "relative");

            // Make siderbar resizable
            $('<link rel="stylesheet" type="text/css" href="http://code.jquery.com/ui/1.9.2/themes/base/jquery-ui.css"/>').appendTo(document.head);
            $sections_container
                .css("max-width", tf_storage.getString(STORAGE_SIDEBAR_MAX_WIDTH) || "")
                .css("min-width", tf_storage.getString(STORAGE_SIDEBAR_MIN_WIDTH) || "")
                .css("width", tf_storage.getString(STORAGE_SIDEBAR_WIDTH) || "")
                .resizable({
                handles: "w,e",
                stop: function (event, ui) {
                    if (ui.size.width > 20) {
                        ui.element.css("max-width", "unset");
                        ui.element.css("min-width", "unset");
                        tf_storage.setString(STORAGE_SIDEBAR_MAX_WIDTH, "unset");
                        tf_storage.setString(STORAGE_SIDEBAR_MIN_WIDTH, "unset");
                        tf_storage.setString(STORAGE_SIDEBAR_WIDTH, ui.size.width);
                    } else {
                        ui.element.css("max-width", "");
                        ui.element.css("min-width", "");
                        ui.element.css("width", "");
                        tf_storage.setString(STORAGE_SIDEBAR_MAX_WIDTH, "");
                        tf_storage.setString(STORAGE_SIDEBAR_MIN_WIDTH, "");
                        tf_storage.setString(STORAGE_SIDEBAR_WIDTH, "");
                    }
                }
            });

            // Add button to control options visiblity
            const STRING_SHOW_OPTIONS = "Show Options";
            const STRING_HIDE_OPTIONS = "Hide Options";
            function setOptionsVis(btn, vis) {
                if (vis) {
                    $scalars_dashboard.find("#sidebar .sidebar-section").slice(0, 3).show();
                    btn.innerText = STRING_HIDE_OPTIONS;
                    tf_storage.setBoolean(STORAGE_OPTIONS_VIS, true);
                } else {
                    $scalars_dashboard.find("#sidebar .sidebar-section").slice(0, 3).hide();
                    btn.innerText = STRING_SHOW_OPTIONS;
                    tf_storage.setBoolean(STORAGE_OPTIONS_VIS, false);
                }
            }

            let $btn_vis = $("<button style='display: block; float: right; position: absolute; bottom: 10px; right: 10px;'></button>").appendTo($sections_container)
                .on("click", function(e) {
                if (this.innerText == STRING_HIDE_OPTIONS) {
                    setOptionsVis(this, false);
                } else {
                    setOptionsVis(this, true);
                }
            });
            var vis = tf_storage.getBoolean(STORAGE_OPTIONS_VIS);
            if (typeof vis == "undefined") vis = true;
            setOptionsVis($btn_vis[0], vis);
        }

        setupRunsCollapser();
        setupRunsExpander();
        setupSiderbarController();

    }

    document.addEventListener('WebComponentsReady', function(){ setTimeout(function(){new TBSelHelper();}, 1000); });
})();
