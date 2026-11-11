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
            var result = api.AddCustomFunction("TABBOX", name, entry.formula, entry.metadata);
            if (result === false) throw new Error("WPS 未接受 TABBOX." + name + " 注册");
            JsonRegisteredFunctions[name] = true;
        }
        JsonAddinStatus = { ok: true, message: "已提交 TABBOX.JSONGET 和 TABBOX.TIME 注册，请在单元格中验证" };
    } catch (error) {
        JsonAddinStatus = { ok: false, message: error.message };
    }
}

var TimeFormatStatus = { ok: false, message: "自动日期格式尚未启用" };
var TimeFormatEvents = {};
var TimeFormatBusy = false;
var TimeNumberFormat = "yyyy-mm-dd hh:mm:ss.000";

function isTimeFormula(formula) {
    if (typeof formula !== "string") return false;
    // 排除字符串、带引号的工作表名和结构化引用中的括号。
    var expression = formula.replace(/"(?:[^"]|"")*"|'(?:[^']|'')*'|\[[^\]]*\]/g, "").trim();
    if (!/^=\s*(?:_xlfn\.)?TABBOX\.TIME\s*\(/i.test(expression)) return false;
    var depth = 0;
    for (var i = expression.indexOf("("); i < expression.length; i++) {
        if (expression[i] === "(") depth++;
        if (expression[i] === ")") depth--;
        if (depth === 0) return i === expression.length - 1;
    }
    return false;
}

function timeFormatFailed(error) {
    TimeFormatStatus = { ok: false, message: "自动日期格式失败：" + (error.message || String(error)) };
}

function formatTimeCell(cell) {
    try {
        if (isTimeFormula(cell.Formula) && cell.NumberFormat !== TimeNumberFormat) {
            cell.NumberFormat = TimeNumberFormat;
        }
    } catch (error) {
        timeFormatFailed(error);
    }
}

function formatTimeRange(target) {
    if (!target || TimeFormatBusy) return;
    TimeFormatBusy = true;
    try {
        if (target.Count === 1) {
            formatTimeCell(target);
            return;
        }
        if (target.HasFormula === false) return;
        var formulas = target.SpecialCells(-4123); // xlCellTypeFormulas
        if (formulas.Count === 1) {
            formatTimeCell(formulas);
            return;
        }
        // SpecialCells 可能返回多个不连续区域，分别遍历，避免越出事件目标。
        for (var areaIndex = 1; areaIndex <= formulas.Areas.Count; areaIndex++) {
            var cells = formulas.Areas.Item(areaIndex).Cells;
            for (var cellIndex = 1; cellIndex <= cells.Count; cellIndex++) {
                formatTimeCell(cells.Item(cellIndex));
            }
        }
    } catch (error) {
        timeFormatFailed(error);
    } finally {
        TimeFormatBusy = false;
    }
}

function OnTimeSheetChange(sheet, target) {
    formatTimeRange(target);
}

function OnTimeSheetActivate(sheet) {
    try {
        if (sheet) formatTimeRange(sheet.UsedRange);
    } catch (error) {
        timeFormatFailed(error);
    }
}

function registerTimeFormatting() {
    try {
        var api = typeof wps !== "undefined" ? wps
            : typeof Application !== "undefined" ? Application : null;
        if (!api || !api.ApiEvent || typeof api.ApiEvent.AddApiEventListener !== "function") {
            throw new Error("当前环境未提供表格事件接口");
        }
        var events = { SheetChange: OnTimeSheetChange, SheetActivate: OnTimeSheetActivate };
        for (var name in events) {
            if (TimeFormatEvents[name]) continue;
            var result = api.ApiEvent.AddApiEventListener(name, events[name]);
            if (result === false) throw new Error("WPS 未接受 " + name + " 事件注册");
            TimeFormatEvents[name] = true;
        }
        TimeFormatStatus = { ok: true, message: "自动日期格式已启用" };
        var application = typeof api.EtApplication === "function" ? api.EtApplication() : api;
        OnTimeSheetActivate(application.ActiveSheet);
    } catch (error) {
        timeFormatFailed(error);
    }
}

function OnAddinLoad() {
    registerJsonFunction();
    registerTimeFormatting();
    return true;
}

function OnJsonStatus() {
    registerJsonFunction();
    registerTimeFormatting();
    alert(JsonAddinStatus.message + "\n" + TimeFormatStatus.message + "\n提取字段：=TABBOX.JSONGET(A2,\"user.name\")\n时间戳转换：=TABBOX.TIME(A2)");
}

registerJsonFunction();
registerTimeFormatting();
