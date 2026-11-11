(function (root) {
    "use strict";

    function parsePath(path) {
        if (typeof path !== "string") {
            throw new Error("字段路径必须是文本");
        }
        path = path.trim();
        if (!path) return [];
        if (path[0] === ".") throw new Error("字段路径格式错误");

        // 逐段匹配并检查连续性，不执行路径中的任何代码。
        var pattern = /(?:^|\.)([^.[\]\s]+)|\[(0|[1-9]\d*)\]|\[("(?:[^"\\]|\\.)*")\]/g;
        var tokens = [];
        var offset = 0;
        var match;
        while ((match = pattern.exec(path)) !== null) {
            if (match.index !== offset) throw new Error("字段路径格式错误");
            if (match[1] !== undefined) {
                tokens.push(match[1]);
            } else if (match[2] !== undefined) {
                var index = Number(match[2]);
                if (!Number.isSafeInteger(index)) throw new Error("数组下标超出路径允许范围");
                tokens.push(index);
            } else {
                try {
                    tokens.push(JSON.parse(match[3]));
                } catch (error) {
                    throw new Error("字段路径中的双引号字符串无效");
                }
            }
            offset = pattern.lastIndex;
        }
        if (offset !== path.length) throw new Error("字段路径格式错误");
        return tokens;
    }

    function get(text, path) {
        if (typeof text !== "string") throw new Error("JSON 输入必须是文本");
        var value;
        try {
            value = JSON.parse(text, function (key, item) {
                if (typeof item === "number" && !Number.isFinite(item)) {
                    throw new Error("数值超出范围，请使用字符串保存");
                }
                if (Number.isInteger(item) && !Number.isSafeInteger(item)) {
                    throw new Error("数值超出安全整数范围，请在 JSON 中使用字符串保存长编号");
                }
                return item;
            });
        } catch (error) {
            throw new Error("JSON 解析失败：" + error.message);
        }

        var tokens = parsePath(path);
        for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i];
            var isObject = value !== null && typeof value === "object";
            var correctContainer = isObject && (typeof token === "number"
                ? Array.isArray(value) : !Array.isArray(value));
            if (!correctContainer || !Object.prototype.hasOwnProperty.call(value, token)) {
                throw new Error("字段不存在：" + path);
            }
            value = value[token];
        }

        if (value === null) return "";
        if (typeof value === "object") return JSON.stringify(value);
        // 电子表格一般只保留 15 位有效数字，16 位安全整数按文本返回。
        if (Number.isInteger(value) && Math.abs(value) >= 1e15) return String(value);
        return value;
    }

    function formula(text, path) {
        try {
            return get(text, path);
        } catch (error) {
            // 宿主接口返回基础类型；这是说明文本，不冒充原生错误值。
            return "#JSON! " + error.message;
        }
    }

    function time(timestamp, unit) {
        if (typeof timestamp === "string") {
            timestamp = timestamp.trim();
            if (!/^[+-]?\d+$/.test(timestamp)) throw new Error("时间戳必须是整数或整数字符串");
            timestamp = Number(timestamp);
        }
        if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp)) {
            throw new Error("时间戳必须是安全整数或整数字符串");
        }
        if (unit === undefined || unit === null || unit === "") unit = "s";
        if (unit !== "s" && unit !== "ms") throw new Error('时间戳单位只支持 "s" 或 "ms"');

        // 固定 UTC+8，再用 UTC 格式化，避免电脑时区及历史夏令时影响结果。
        var milliseconds = unit === "ms" ? timestamp : timestamp * 1000;
        var date = new Date(milliseconds + 8 * 60 * 60 * 1000);
        var year = date.getUTCFullYear();
        if (!Number.isFinite(year) || year < 1 || year > 9999) {
            throw new Error("转换后的北京时间超出 0001–9999 年范围");
        }
        return date.toISOString().slice(0, 19).replace("T", " ");
    }

    function timeFormula(timestamp, unit) {
        try {
            return time(timestamp, unit);
        } catch (error) {
            return "#TIME! " + error.message;
        }
    }

    var metadata = {
        "name": "JSONGET",
        "description": "从 JSON 文本中提取字段，支持 user.name、items[0].id 和双引号括号字段名。",
        "parameters": [
            {
                "name": "text",
                "description": "包含 JSON 文本的单元格或字符串",
                "type": "string"
            },
            {
                "name": "path",
                "description": "字段路径；数组从 0 开始；空路径返回整个 JSON",
                "type": "string"
            }
        ],
        "result": {
            "type": "any"
        }
    };
    var timeMetadata = {
        "name": "TIME",
        "description": "将 Unix 时间戳转换为北京时间 yyyy-MM-dd HH:mm:ss 文本。",
        "parameters": [
            {
                "name": "timestamp",
                "description": "整数时间戳，支持数值或整数字符串",
                "type": "any"
            },
            {
                "name": "unit",
                "description": "可省略，默认 s（秒）；ms 表示毫秒",
                "type": "string?"
            }
        ],
        "result": {
            "type": "string"
        }
    };
    var api = {
        get: get, formula: formula, metadata: metadata,
        time: time, timeFormula: timeFormula, timeMetadata: timeMetadata
    };
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        root.WpsJson = api;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
