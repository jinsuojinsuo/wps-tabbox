var JsonRegisteredFunctions = {};
var JsonAddinStatus = { ok: false, message: "尚未注册自定义函数" };

function registerJsonFunction() {
    if (JsonAddinStatus.ok) return;
    try {
        var api = typeof wps !== "undefined" ? wps
            : typeof Application !== "undefined" ? Application : null;
        if (!api || typeof api.AddCustomFunction !== "function") {
            throw new Error("当前环境未提供 WPS 自定义函数接口，请在 WPS 表格中检查兼容性");
        }
        var functions = [
            { formula: WpsJson.formula, metadata: WpsJson.metadata },
            { formula: WpsJson.timeFormula, metadata: WpsJson.timeMetadata }
        ];
        for (var i = 0; i < functions.length; i++) {
            var entry = functions[i];
            var name = entry.metadata.name;
            if (JsonRegisteredFunctions[name]) continue;
            var result = api.AddCustomFunction("JSON", name, entry.formula, entry.metadata);
            if (result === false) throw new Error("WPS 未接受 JSON." + name + " 注册");
            JsonRegisteredFunctions[name] = true;
        }
        JsonAddinStatus = { ok: true, message: "已提交 JSON.GET 和 JSON.TIME 注册，请在单元格中验证" };
    } catch (error) {
        JsonAddinStatus = { ok: false, message: error.message };
    }
}

function OnAddinLoad() {
    registerJsonFunction();
    return true;
}

function OnJsonStatus() {
    registerJsonFunction();
    alert(JsonAddinStatus.message + "\n提取字段：=JSON.GET(A2,\"user.name\")\n时间戳转换：=JSON.TIME(A2)");
}

registerJsonFunction();
