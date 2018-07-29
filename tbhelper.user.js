// ==UserScript==
// @name         Tensorboard Runs Selection Helper
// @version      0.1
// @description  Simplify runs selection
// @author       Texot
// @match        http://localhost:8889/*
// @require      https://code.jquery.com/jquery-latest.js
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

    function helper() {
        let $scalars_dashboard = $(".dashboard-container[data-dashboard='scalars']").eq(0);
        let $sidebar = $scalars_dashboard.find("#sidebar .sidebar-section").eq(0);
        let multi_check_box = $scalars_dashboard.find("#multiCheckbox")[0];
        if ($sidebar.length == 0 || multi_check_box === undefined) {
            console.error("[Tensorboard Runs Selection Helper] Tensorboard components is not found");
            return;
        }

        function setIRMode() {
            // computeNamesMatchingRegex is for selecting visible runs in the selector
            multi_check_box.computeNamesMatchingRegex = function(__, ___) {
                var regex = this.regex;
                return this.names.filter(function(n) {
                    return ((regex == null || regex.test(n)) && (n.match(/\//g) || []).length == PARENT_RUN_DEPTH-1);
                });
            };
            // computeOutSelected is for selecting visible curves in the graphs
            multi_check_box.computeOutSelected = function(__, ___) {
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
                _checkboxChange_ori.call(this, e);
                let target_name = e.target.name;
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
                _isolateRun_ori.call(this, e);
                let target_name = e.target.parentElement.name;

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

            let orinames = multi_check_box.names;
            multi_check_box.names = [];
            multi_check_box.names = orinames;
        }

        function setMRMode() {
            multi_check_box.computeNamesMatchingRegex = computeNamesMatchingRegex_ori;
            multi_check_box.computeOutSelected = computeOutSelected_ori;
            multi_check_box._checkboxChange = _checkboxChange_ori;
            multi_check_box._isolateRun = _isolateRun_ori;

            let orinames = multi_check_box.names;
            multi_check_box.names = [];
            multi_check_box.names = orinames;
        }

        let computeNamesMatchingRegex_ori = multi_check_box.computeNamesMatchingRegex;
        let computeOutSelected_ori = multi_check_box.computeOutSelected;
        let _checkboxChange_ori = multi_check_box._checkboxChange;
        let _isolateRun_ori = multi_check_box._isolateRun;

        // Add option
        let $ele = $("<div class='line-item'><paper-checkbox>Only show parent runs</paper-checkbox></div>").insertBefore($sidebar.children().eq(0));
        $ele[0].addEventListener('change', function(event) {
            if(event.target.checked) {
                setIRMode();
            } else {
                setMRMode();
            }
        });
    }

    document.addEventListener('WebComponentsReady', function(){ setTimeout(function(){helper();}, 1000); });
})();