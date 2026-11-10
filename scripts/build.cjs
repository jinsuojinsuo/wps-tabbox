"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { metadata, timeMetadata } = require("../js/functions.js");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const declaration = JSON.parse(fs.readFileSync(path.join(root, "functions.json"), "utf8"));
assert.deepEqual(declaration.functions, [metadata, timeMetadata], "functions.json 与注册函数声明不一致");

const files = ["index.html", "main.js", "manifest.xml", "ribbon.xml", "functions.json", "js/functions.js"];
fs.mkdirSync(output, { recursive: true });
for (const file of files) {
    const target = path.join(output, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
}
console.log("构建完成：dist（6 个运行文件，无需下载运行依赖）");
