"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const test = require("node:test");
const json = require("../js/functions.js");
const source = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
const dateFormat = "yyyy-mm-dd hh:mm:ss.000";

function cell(formula, format = "General", locked = false) {
    let numberFormat = format;
    let writes = 0;
    return {
        Formula: formula,
        Count: 1,
        get NumberFormat() { return numberFormat; },
        set NumberFormat(value) {
            if (locked) throw new Error("单元格受保护");
            numberFormat = value;
            writes++;
        },
        get writes() { return writes; }
    };
}

// 只模拟外部 WPS 区域接口，断言检查真实事件处理后的单元格格式。
function range(areas) {
    const count = areas.reduce((sum, area) => sum + area.length, 0);
    if (count === 1) return areas.flat()[0];
    return {
        Count: count,
        HasFormula: areas.flat().some(c => /^=/.test(c.Formula)) ? null : false,
        Areas: {
            Count: areas.length,
            Item(index) {
                const cells = areas[index - 1];
                return { Cells: { Count: cells.length, Item(i) { return cells[i - 1]; } } };
            }
        },
        SpecialCells(type) {
            assert.equal(type, -4123);
            const formulas = areas.map(area => area.filter(c => /^=/.test(c.Formula))).filter(a => a.length);
            if (!formulas.length) throw new Error("未找到公式单元格");
            return range(formulas);
        }
    };
}

function host(activeSheet, events = true) {
    const listeners = new Map();
    const registrations = [];
    const api = {
        AddCustomFunction() {},
        EtApplication() { return { ActiveSheet: activeSheet }; }
    };
    if (events) api.ApiEvent = {
        AddApiEventListener(name, handler) {
            registrations.push(name);
            listeners.set(name, handler);
        }
    };
    const context = { wps: api, WpsJson: json, alert() {} };
    vm.createContext(context);
    vm.runInContext(source, context);
    return { context, api, listeners, registrations };
}

test("输入 TIME 时格式化事件目标，保持其他公式和数值的显示方式", () => {
    const otherSheetCell = cell("=TABBOX.TIME(A1)", "0.00%");
    const h = host({ UsedRange: cell("=SUM(A1:A2)") });
    const target = cell('=tabbox.time(A1,"ms")');
    assert.equal(typeof h.listeners.get("SheetChange"), "function");
    h.listeners.get("SheetChange")({ UsedRange: otherSheetCell }, target);
    assert.equal(target.NumberFormat, dateFormat);
    assert.equal(otherSheetCell.NumberFormat, "0.00%");
    const unrelated = [
        cell('=IF(A1="TABBOX.TIME(",1,0)', "0.00%"),
        cell('=TABBOX.TIME(A1)-TABBOX.TIME(A2)', "0.000"),
        cell('=TABBOX.TIMEOTHER(A1)', "0.00"),
        cell("=TABBOX.JSONGET(A1,B1)", "0.00"),
        cell("123", "0.00")
    ];
    for (const item of unrelated) h.listeners.get("SheetChange")({}, item);
    assert.deepEqual(unrelated.map(c => c.writes), [0, 0, 0, 0, 0]);
});

test("批量粘贴和填充覆盖多个区域，重复加载不会重复注册或写入格式", () => {
    const first = cell('=TABBOX.TIME(1,"ms")');
    const last = cell("=TABBOX.TIME('Sheet (1)'!A1)");
    const unrelated = cell("=SUM(A1:A2)", "0.00%");
    const h = host({ UsedRange: cell("text") });
    assert.equal(typeof h.listeners.get("SheetChange"), "function");
    const changed = range([[first, unrelated], [last]]);
    h.listeners.get("SheetChange")({}, changed);
    h.context.OnAddinLoad();
    h.context.OnAddinLoad();
    h.listeners.get("SheetChange")({}, changed);
    assert.equal(first.NumberFormat, dateFormat);
    assert.equal(last.NumberFormat, dateFormat);
    assert.equal(unrelated.NumberFormat, "0.00%");
    assert.equal(first.writes, 1);
    assert.equal(last.writes, 1);
    assert.deepEqual(h.registrations, ["SheetChange", "SheetActivate"]);
});

test("加载及切换工作表会处理已有 TIME，保护单元格失败不影响其他日期", () => {
    const existing = cell("=TABBOX.TIME(A1)");
    const h = host({ UsedRange: existing });
    assert.equal(existing.NumberFormat, dateFormat);
    const locked = cell("=TABBOX.TIME(A1)", "General", true);
    const next = cell("=TABBOX.TIME(A2)");
    h.listeners.get("SheetActivate")({ UsedRange: range([[locked, next]]) });
    assert.equal(locked.NumberFormat, "General");
    assert.equal(next.NumberFormat, dateFormat);
    assert.match(h.context.TimeFormatStatus.message, /受保护/);
    assert.equal(typeof json.timeFormula(1704067200), "number");
});

test("事件接口延迟出现时可重试，格式化状态与函数注册状态分别报告", () => {
    const target = cell("=TABBOX.TIME(A1)");
    const h = host({ UsedRange: target }, false);
    assert.equal(h.context.JsonAddinStatus.ok, true);
    assert.ok(h.context.TimeFormatStatus);
    assert.equal(h.context.TimeFormatStatus.ok, false);
    h.api.ApiEvent = { AddApiEventListener(name, callback) { h.listeners.set(name, callback); } };
    h.context.OnAddinLoad();
    assert.equal(h.context.TimeFormatStatus.ok, true);
    assert.equal(target.NumberFormat, dateFormat);
});
