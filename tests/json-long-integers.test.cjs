"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const json = require("../js/functions.js");

test("长整数在解析舍入前保留原文，且不阻断同一 JSON 的其他字段", () => {
    const text = '{"id":9223372036854775807,"negative":-9223372036854775808,"count":3}';
    assert.equal(json.formula(text, "id"), "9223372036854775807");
    assert.equal(json.get(text, "negative"), "-9223372036854775808");
    assert.equal(json.get(text, "count"), 3);
    assert.equal(json.get('[9007199254740993]', "[0]"), "9007199254740993");
    assert.equal(json.get('9007199254740992', ""), "9007199254740992");
    assert.equal(json.get('9007199254740991', ""), "9007199254740991");
    assert.equal(json.get('-9007199254740991', ""), "-9007199254740991");
    assert.equal(json.get('123456789012345', ""), 123456789012345);
});

test("数字保护不改写字符串内容，也不能把非法 JSON 修复成合法输入", () => {
    const text = String.raw`{"id":9223372036854775807,"text":"\"id\":9223372036854775807\\end","9223372036854775807":false}`;
    assert.equal(json.get(text, "text"), '"id":9223372036854775807\\end');
    assert.equal(json.get(text, "9223372036854775807"), false);
    for (const invalid of [
        '{9223372036854775807:1}', '{"id":09223372036854775807}',
        '{"id":9223372036854775807.}', '{"id":9223372036854775807e}',
        '{"id":NaN}', '{"id":Infinity}'
    ]) {
        assert.match(json.formula(invalid, "id"), /^#JSON! /);
    }
});

test("容器输出中的长数字可再次完整提取，普通小数和指数仍参与数值计算", () => {
    const text = '{"items":[9223372036854775807,-9007199254740993],"fraction":1.25,"count":1e3,"huge":1e400}';
    const items = json.get(text, "items");
    assert.equal(items, '["9223372036854775807","-9007199254740993"]');
    assert.equal(json.get(items, "[0]"), "9223372036854775807");
    assert.equal(json.get(text, "fraction"), 1.25);
    assert.equal(json.get(text, "count"), 1000);
    assert.equal(json.get(text, "huge"), "1e400");
    assert.equal(json.get('9.223372036854775807e18', ""), "9.223372036854775807e18");
});
