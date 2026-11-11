"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const project = path.resolve(__dirname, "..");
const installer = path.join(project, "install.sh");
const version = JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8")).version;
const folderName = "wps-tabbox_" + version;
const runtimeFiles = ["index.html", "main.js", "manifest.xml", "functions.json", "ribbon.xml", "js/functions.js"];

function fixture(t) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "wps-json-install-test-"));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const addons = path.join(temp, "中文 带空格", "jsaddons");
    fs.mkdirSync(addons, { recursive: true });
    return addons;
}

function install(addons) {
    return spawnSync("/bin/bash", [installer], {
        cwd: project,
        encoding: "utf8",
        env: { ...process.env, PATH: "/nonexistent", WPS_TABBOX_ADDONS_DIR: addons }
    });
}

function xpath(file, expression) {
    const result = spawnSync("/usr/bin/xmllint", ["--nonet", "--xpath", expression, file], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

test("无 Git 或编译环境时首次安装仍得到完整运行文件和正确登记", t => {
    const addons = fixture(t);
    const result = install(addons);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const folder = folderName;
    for (const file of runtimeFiles) {
        assert.deepEqual(fs.readFileSync(path.join(addons, folder, file)), fs.readFileSync(path.join(project, file)));
    }
    const config = path.join(addons, "publish.xml");
    assert.equal(xpath(config, "string(/jsplugins/jsplugin[@name='wps-tabbox']/@url)"), folder);
    assert.equal(xpath(config, "string(/jsplugins/jsplugin[@name='wps-tabbox']/@type)"), "et");
    assert.match(result.stdout, /无需.*Git.*Node/);
});

test("重复安装只替换同名记录，其他加载项保留且旧配置与旧文件可恢复", t => {
    const addons = fixture(t);
    const config = path.join(addons, "publish.xml");
    const original = '<?xml version="1.0"?><jsplugins><!--保留说明--><jspluginonline name="other" url="https://example.com/a?x=1&amp;y=2" enable="disabled" custom="值"/><jspluginonline name="wps-tabbox" url="http://127.0.0.1:3893/"/><jsplugin name="wps-tabbox" url="old"/></jsplugins>';
    fs.writeFileSync(config, original);
    const oldFolder = path.join(addons, folderName);
    fs.mkdirSync(oldFolder);
    fs.writeFileSync(path.join(oldFolder, "old-marker"), "原安装文件");
    const result = install(addons);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(xpath(config, "count(/jsplugins/*[@name='wps-tabbox'])"), "1");
    assert.equal(xpath(config, "string(/jsplugins/jspluginonline[@name='other']/@url)"), "https://example.com/a?x=1&y=2");
    assert.equal(xpath(config, "string(/jsplugins/jspluginonline[@name='other']/@enable)"), "disabled");
    assert.equal(xpath(config, "string(/jsplugins/jspluginonline[@name='other']/@custom)"), "值");
    assert.match(fs.readFileSync(config, "utf8"), /保留说明/);
    const backupRoot = path.join(addons, ".wps-tabbox-backups");
    const backups = fs.readdirSync(backupRoot);
    assert.equal(backups.length, 1);
    const backup = path.join(backupRoot, backups[0]);
    assert.equal(fs.readFileSync(path.join(backup, "publish.xml"), "utf8"), original);
    assert.equal(fs.readFileSync(path.join(backup, folderName, "old-marker"), "utf8"), "原安装文件");
    const repeated = install(addons);
    assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
    assert.equal(xpath(config, "count(/jsplugins/*[@name='wps-tabbox'])"), "1");
});

test("配置损坏或根节点错误时不覆盖用户配置和原安装文件", t => {
    const addons = fixture(t);
    const config = path.join(addons, "publish.xml");
    const oldFolder = path.join(addons, folderName);
    fs.mkdirSync(oldFolder);
    fs.writeFileSync(path.join(oldFolder, "marker"), "保持原样");
    for (const original of ["<jsplugins><broken>", "<unexpected/>"]) {
        fs.writeFileSync(config, original);
        const result = install(addons);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /publish\.xml|配置/);
        assert.equal(fs.readFileSync(config, "utf8"), original);
        assert.equal(fs.readFileSync(path.join(oldFolder, "marker"), "utf8"), "保持原样");
        assert.equal(fs.existsSync(path.join(oldFolder, "index.html")), false);
    }
});
