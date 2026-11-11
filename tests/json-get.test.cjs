"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const json = require("../js/functions.js");

// 按独立缺陷风险分组，不按分支或输入值数量堆叠用例。
test("嵌套对象、数组和含标点的字段都定位到实际 JSON 数据", () => {
    const text = '{"uid":123,"user":{"name":"张三"},"items":[{"id":8}],"a.b":{"x[y]":9}}';
    assert.equal(json.get(text, "uid"), 123);
    assert.equal(json.get(text, "user.name"), "张三");
    assert.equal(json.get(text, "items[0].id"), 8);
    assert.equal(json.get(text, '["a.b"]["x[y]"]'), 9);
    assert.equal(json.get('[{"id":8}]', "[0].id"), 8);
});

test("合法的零、false、空字符串和 null 不被当作字段缺失", () => {
    const text = '{"zero":0,"off":false,"empty":"","nil":null}';
    assert.equal(json.get(text, "zero"), 0);
    assert.equal(json.get(text, "off"), false);
    assert.equal(json.get(text, "empty"), "");
    assert.equal(json.get(text, "nil"), "");
});

test("对象和数组作为可保留结构的 JSON 文本返回", () => {
    assert.equal(json.get('{"a":{"b":[1,false]}}', "a"), '{"b":[1,false]}');
    assert.equal(json.get('{"a":[1,2]}', "a"), '[1,2]');
    assert.equal(json.get('{"a":1}', ""), '{"a":1}');
});

test("错误输入有明确反馈，不能把错误路径当作有效路径的前缀", () => {
    assert.throws(() => json.get('{"a":', "a"), /JSON/);
    assert.throws(() => json.get('{"a":1}', "b"), /字段不存在/);
    for (const member of [".a", "a.", "a..b", "a[01]", "a[-1]", "a[0]tail"]) {
        assert.throws(() => json.get('{"a":[1]}', member), /路径/);
    }
    assert.match(json.formula('{"a":', "a"), /^#JSON! /);
    assert.match(json.formula('{"a":1}', "b"), /^#JSON! /);
});

test("只读取 JSON 自身字段，不读取对象原型或数组内部属性", () => {
    assert.throws(() => json.get('{}', "constructor"), /字段不存在/);
    assert.throws(() => json.get('{"a":[]}', "a.length"), /字段不存在/);
    assert.throws(() => json.get('{"a":{"0":"x"}}', "a[0]"), /字段不存在/);
    assert.equal(json.get('{"__proto__":{"ok":1}}', "__proto__.ok"), 1);
});

test("长编号不静默舍入，合法长整数以文本交给表格", () => {
    assert.equal(json.get('{"id":"9223372036854775807"}', "id"), "9223372036854775807");
    assert.equal(json.get('{"id":1234567890123456}', "id"), "1234567890123456");
    assert.throws(() => json.get('{"id":9007199254740993}', "id"), /安全整数/);
});

test("WPS 声明与注册保持一致，宿主加载回调重复触发不会重复注册", () => {
    const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, "../functions.json"), "utf8"));
    assert.deepEqual(metadata.functions, [json.metadata, json.timeMetadata]);
    const calls = [];
    const context = {
        WpsJson: json,
        wps: { AddCustomFunction(...args) { calls.push(args); } },
        alert() {}
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../main.js"), "utf8"), context);
    context.OnAddinLoad();
    context.OnAddinLoad();
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], "TABBOX");
    assert.equal(calls[0][1], "JSONGET");
    assert.equal(calls[0][2]('{"uid":123}', "uid"), 123);
    assert.deepEqual(calls[0][3], json.metadata);
    const manifest = fs.readFileSync(path.join(__dirname, "../manifest.xml"), "utf8");
    assert.match(manifest, /<Namespace>TABBOX<\/Namespace>/);
});

test("缺少宿主 API 时报告不兼容，延迟出现的 API 允许重试注册", () => {
    const context = { WpsJson: json, alert() {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../main.js"), "utf8"), context);
    context.OnAddinLoad();
    assert.equal(context.JsonAddinStatus.ok, false);
    assert.match(context.JsonAddinStatus.message, /自定义函数/);
    let registered = false;
    context.wps = { AddCustomFunction() { registered = true; } };
    context.OnAddinLoad();
    assert.equal(registered, true);
    assert.equal(context.JsonAddinStatus.ok, true);
});
