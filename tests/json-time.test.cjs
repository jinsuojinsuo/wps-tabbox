"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const json = require("../js/functions.js");

// 独立风险：单位或时区换算错误，及 TABBOX.JSONGET 结果不能组合使用。
test("秒和毫秒按北京时间返回统一文本，支持 JSON 字段结果", () => {
    assert.equal(json.time(1704067200), "2024-01-01 08:00:00");
    assert.equal(json.time("1704067200123", "ms"), "2024-01-01 08:00:00");
    assert.equal(json.timeFormula(json.get('{"created":1704067200}', "created")), "2024-01-01 08:00:00");
    assert.equal(json.time(0), "1970-01-01 08:00:00");
    assert.equal(json.time(-1, "s"), "1970-01-01 07:59:59");
});

// 独立风险：隐式类型转换把空值或无效输入显示成正常日期。
test("空值和无效时间戳不会显示为正常日期", () => {
    for (const value of [undefined, null, "", "  ", false, [], "2024-01-01", "1e3", 1.5, Infinity, NaN]) {
        assert.match(json.timeFormula(value), /^#TIME! /);
    }
    assert.match(json.timeFormula(1704067200, "minutes"), /^#TIME! /);
    assert.equal(json.timeFormula(" 0 ", ""), "1970-01-01 08:00:00");
});

// 独立风险：年份溢出或丢失精度后仍输出貌似有效的格式。
test("北京时间年份边界严格限制在四位公历年份", () => {
    assert.equal(json.time(-62135625600), "0001-01-01 00:00:00");
    assert.equal(json.time(253402271999), "9999-12-31 23:59:59");
    for (const value of [-62135625601, 253402272000, 9007199254740992]) {
        assert.match(json.timeFormula(value), /^#TIME! /);
    }
});

// 宿主 API 是外部边界：验证实际提交的函数能计算，声明可省略单位。
test("JSONGET 与 TIME 均可注册，部分失败时只重试失败函数", () => {
    const declaration = JSON.parse(fs.readFileSync(path.join(__dirname, "../functions.json"), "utf8"));
    assert.deepEqual(declaration.functions, [json.metadata, json.timeMetadata]);
    assert.equal(json.timeMetadata.parameters[1].type, "string?");
    const registrations = new Map();
    const calls = [];
    let rejectTime = true;
    const context = { WpsJson: json, alert() {}, wps: {
        AddCustomFunction(namespace, name, formula, metadata) {
            calls.push(name);
            assert.equal(namespace, "TABBOX");
            if (name === "TIME" && rejectTime) return false;
            registrations.set(name, formula);
            assert.equal(metadata.name, name);
        }
    } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../main.js"), "utf8"), context);
    assert.equal(context.JsonAddinStatus.ok, false);
    rejectTime = false;
    context.OnAddinLoad();
    context.OnAddinLoad();
    assert.equal(context.JsonAddinStatus.ok, true);
    assert.deepEqual(calls, ["JSONGET", "TIME", "TIME"]);
    assert.equal(registrations.get("TIME")(1704067200), "2024-01-01 08:00:00");
    assert.equal(registrations.get("JSONGET")('{"a":1}', "a"), 1);
});
