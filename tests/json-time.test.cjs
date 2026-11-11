"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const json = require("../js/functions.js");

// 本文件用 UTC 固定边界预期，其他本机时区在独立子进程验证。
process.env.TZ = "UTC";

function assertSerial(actual, expected, message) {
    assert.equal(typeof actual, "number", message);
    // 十亿分之一日约 0.086 毫秒，容许浮点误差但能发现毫秒丢失。
    assert.ok(Math.abs(actual - expected) < 1e-9, message || `${actual} != ${expected}`);
}

// 独立风险：返回文本、单位换算错误或丢失毫秒，导致日期计算失效。
test("返回可计算的日期序列数值，保留秒和毫秒", () => {
    assertSerial(json.time(1704067200), 45292);
    assertSerial(json.time("1704067200123", "ms"), 45292 + 123 / 86400000);
    assertSerial(json.timeFormula(json.get('{"created":1704067200}', "created")), 45292);
    assertSerial(json.time(0), 25569);
    assertSerial(json.time(-1, "ms"), 25569 - 1 / 86400000);
    assertSerial(json.time(9, "ms"), 25569 + 9 / 86400000);
    const difference = json.time(1704067201123, "ms") - json.time(1704067200123, "ms");
    assert.ok(Math.abs(difference * 86400000 - 1000) < 0.01);
});

// 独立风险：固定时差、遗漏半小时时区，或以当前偏移量套用历史时间。
test("日期数值使用时间戳对应时刻的本机时区", () => {
    const fixtures = [
        ["Asia/Shanghai", 1704067200, 45292 + 8 / 24],
        ["Asia/Kolkata", 1704067200, 45292 + 5.5 / 24],
        ["America/New_York", 1704067200, 45291 + 19 / 24],
        ["America/New_York", 1719792000, 45473 + 20 / 24]
    ];
    for (const [zone, timestamp, expected] of fixtures) {
        const actual = execFileSync(process.execPath, [
            "-e", 'process.stdout.write(JSON.stringify(require(process.argv[1]).time(Number(process.argv[2]))))',
            require.resolve("../js/functions.js"), String(timestamp)
        ], { env: { ...process.env, TZ: zone }, encoding: "utf8" });
        assertSerial(JSON.parse(actual), expected, zone);
    }
});

test("1900 年三月前后的序列值符合表格日期系统", () => {
    assert.equal(json.time(-2208988800), 1); // 1900-01-01
    assert.equal(json.time(-2203977600), 59); // 1900-02-28
    assert.equal(json.time(-2203891200), 61); // 1900-03-01，跳过表格兼容的虚构闰日。
    assert.equal(json.time(-2082844800), 1462); // 1904-01-01
});

// 独立风险：隐式类型转换把空值或无效输入显示成正常日期。
test("空值和无效时间戳不会显示为正常日期", () => {
    for (const value of [undefined, null, "", "  ", false, [], "2024-01-01", "1e3", 1.5, Infinity, NaN]) {
        assert.match(json.timeFormula(value), /^#TIME! /);
    }
    assert.match(json.timeFormula(1704067200, "minutes"), /^#TIME! /);
    assert.equal(json.timeFormula(" 0 ", ""), 25569);
});

// 独立风险：年份溢出或丢失精度后仍输出貌似有效的格式。
test("本机时区年份边界严格限制在四位公历年份", () => {
    assert.equal(json.time(-62135596800), -693594);
    assertSerial(json.time(253402300799), 2958465 + 86399 / 86400);
    for (const value of [-62135596801, 253402300800, 9007199254740992]) {
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
    assert.equal(registrations.get("TIME")(1704067200), 45292);
    assert.equal(registrations.get("JSONGET")('{"a":1}', "a"), 1);
});
