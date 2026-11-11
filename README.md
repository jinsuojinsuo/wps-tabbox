# TABBOX · WPS 表格工具箱

通过 `=TABBOX.JSONGET(A2,"user.name")` 提取单元格 JSON 字段。通过 `=TABBOX.TIME(A2)` 将时间戳转换为本机时区的日期时间数值。解析和转换均在本机运行，不调用外部接口。

安装后重新打开 WPS 表格。如果加载项显示禁用，请在“工具 → WPS 加载项”中启用 `wps-tabbox`。重启并打开表格后，如果提示加载项已修改，请确认加载。

## 当前状态

1. 本项目按 WPS 官方加载项接口制作，运行部分使用普通 JavaScript，无第三方运行依赖。
2. 已识别本机安装的是 Mac 版 WPS 12.1.28496。能否实际注册并计算公式，需要在本机 WPS 内启用后确认。
3. 制作代码和执行构建不会安装加载项。执行 `install.sh`（Mac）或 `install.ps1`（Windows）会复制运行文件并登记离线加载项；`npm run wps:debug` 则会登记调试加载项并尝试启动 WPS。
4. 下文提供 Windows / Mac 一键安装、debug 调试加载和手动离线安装。一键安装不依赖 Git、Node.js、npm、Python、编译器或开发工具；离线加载成功后无需常驻服务。真实 WPS 中的公式兼容性仍需验证。

## 已完成的验证

1. 自行编写的 8 项 JSON 函数验证、6 项时间戳转换与注册验证、3 项 Mac 安装验证通过。安装验证使用临时目录和空的工具搜索路径，覆盖首次安装、重复安装备份及损坏配置保护。
2. Windows PowerShell 5.1 的 7 项安装验证通过，覆盖首次安装、本地离线命令、重复安装与备份、损坏配置保护、最终替换失败恢复、独立脚本下载和 README 在线命令。全部使用临时目录和空 PATH；[查看 Windows 验证结果](https://github.com/jinsuojinsuo/wps-tabbox/actions/runs/40257557783)。
3. dist 构建和临时 HTTP 加载、模拟宿主注册通过。
4. 官方 wpsjs 2.2.3 已在本目录安装，依赖锁定文件已生成；调试模块可加载。
5. 此前 JSON 函数与 Mac 安装器的独立只读审查未发现需要修复的确定缺陷。真实 Windows / Mac WPS 内的计算尚未验证。

## 安装方式选择

1. 一键安装：推荐日常使用，支持 Windows 10/11 和 Mac，需先安装 WPS；直接从 GitHub 下载运行文件，不需要 Git 或任何编译环境。
2. debug 方式：适合开发和调试，需要 Node.js 与官方 wpsjs 工具，使用时保持本机 HTTP 服务运行。
3. 手动离线安装：自行复制运行文件和编辑配置，适合需要手工控制安装过程的情况。
4. 按系统选择下面的一键安装步骤。debug 和手动安装示例以 Mac 为例；不要同时启用同名的 debug 和离线记录，切换方式见后文。

## Windows 安装

1. 支持 Windows 10/11 自带的 Windows PowerShell 5.1，不需要管理员权限。先保存文档并完全退出 WPS；如果正在 debug，也要停止调试服务。脚本不会强制关闭 WPS。
2. 从开始菜单打开“Windows PowerShell”，复制执行下面这一行：

   ```powershell
   & ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/jinsuojinsuo/wps-tabbox/main/install.ps1').Content.TrimStart([char]0xFEFF)))
   ```

   首次下载需要联网访问 GitHub。使用系统自带的 PowerShell、ZIP 解压和 XML 处理能力，直接安装现成运行文件；不需要 Git、Node.js、npm、Python 或编译环境，也不会修改执行策略。
3. 完全离线安装：预先下载[完整项目 ZIP](https://github.com/jinsuojinsuo/wps-tabbox/archive/refs/heads/main.zip)，解压并进入包含 `install.ps1`、`package.json` 和 `index.html` 的项目文件夹。在该文件夹打开 PowerShell，执行：

   ```powershell
   & ([scriptblock]::Create((Get-Content -LiteralPath .\install.ps1 -Raw -Encoding UTF8)))
   ```

   这条命令直接读取本地脚本和运行文件，不联网、不修改执行策略，也不需要安装开发工具。允许运行本地脚本的环境也可直接执行 `.\install.ps1`。仅下载单个脚本时，仍需联网获取其余运行文件。
4. 默认安装目录：

   ```text
   %APPDATA%\kingsoft\wps\jsaddons\wps-tabbox_1.0.0
   ```

   脚本自动读取项目版本，合并同目录的 `publish.xml`，替换本项目原有的在线调试或离线记录，保留其他加载项。原配置和同版本旧目录备份到 `jsaddons\.wps-tabbox-backups\` 下，脚本会打印本次备份位置。
5. 配置损坏时拒绝覆盖；最终配置替换失败时会尝试恢复同版本旧目录。需要手动恢复时，先退出 WPS，再按打印的备份路径恢复原配置和目录。如果之后安装了其他加载项，应只恢复本项目记录，避免覆盖后来的配置。
6. 重新打开 WPS 表格，输入：

   ```excel
   =TABBOX.JSONGET("[10,20,30]","[0]")
   ```

   预期返回 `10`。完全退出并重启 WPS 后再次计算成功，才能确认当前客户端离线加载有效。之后无需保留 PowerShell 窗口或启动任何服务；真实 Windows WPS 的公式兼容性仍需实际验证。

## Mac 安装

1. 先保存文档并完全退出 WPS；正在运行 debug 时也要停止调试服务。脚本不会强制关闭 WPS。
2. 在终端复制执行下面这一行：

   ```sh
   /bin/bash -o pipefail -c '/usr/bin/curl -fsSL --retry 2 https://raw.githubusercontent.com/jinsuojinsuo/wps-tabbox/main/install.sh | /bin/bash'
   ```

   首次下载需要联网访问 GitHub。脚本使用 macOS 自带工具下载 ZIP 并复制现成的 6 个运行文件，不调用 git、node、npm、Python 或编译器，也不会要求安装命令行开发工具。
3. 如果已经通过 ZIP 下载了完整项目，也可在解压后的项目目录运行：

   ```sh
   /bin/bash install.sh
   ```

   这种方式直接使用本地文件，不需要 Git、编译环境或联网；也不需要执行 `npm install` 或 `npm run build`。
4. 脚本自动读取项目版本，安装到 WPS 的 jsaddons 目录，并用离线记录替换本项目原有的在线调试或离线记录。其他加载项保留。已有配置和同版本旧文件会备份到插件目录的 `.wps-tabbox-backups/` 下，脚本会打印本次备份路径。
5. 如果 `publish.xml` 损坏或根节点不正确，脚本会拒绝覆盖；文件替换未完成时发生失败，会尝试恢复本次移动的旧文件。脚本不自动删除其他版本目录，也不修改 WPS 安全设置。
6. 安装结束后重新打开 WPS 表格，输入：

   ```excel
   =TABBOX.JSONGET("[10,20,30]","[0]")
   ```

   预期返回 `10`。完全退出并重启 WPS 后再次计算成功，才能确认本机离线加载有效。之后无需保留终端或本机服务。
7. 需要恢复时，先退出 WPS，再按脚本打印的备份路径恢复原 `publish.xml` 和同版本旧目录。安装后若又安装了其他加载项，不要直接覆盖当前配置，应只恢复本项目记录。

## 方式二：debug 调试加载

1. 安装 Node.js 18 或更高版本。已安装则跳过。
2. 在解压后的项目目录打开终端，执行：

   ```sh
   npm install --ignore-scripts
   npm run wps:debug
   ```

   `wpsjs` 固定为官方 2.2.3 版本，是开发调试工具；首次安装需要联网下载。JSON 内容不发送给该工具的服务器。
3. 等待工具启动 WPS，打开一个空白表格。首次出现加载项信任提示时，核对名称为 `wps-tabbox` 后按提示操作。
4. 如果 WPS 此前正在运行，先保存文档，再完全退出 WPS 后重新打开；调试终端保持运行。
5. 在功能区找到“TABBOX”，点击“检查函数状态”。“已提交注册”只表示接口调用完成，还需按下面的例子确认公式实际可用。
6. 如果提示未提供自定义函数接口，说明当前 Mac 客户端的这项能力未开放或未正确加载；仅凭版本号不能确认兼容。

## 方式三：手动离线安装（Mac）

1. 保存所有文档并完全退出 WPS。如果正在运行 debug，在对应终端按 Control+C 停止服务。
2. 在项目目录打开终端，生成加载项运行文件：

   ```sh
   npm run build
   ```

   本项目构建不需要先执行 `npm install`，只需已安装 Node.js 18 或更高版本。也可使用 `node scripts/build.cjs`。
3. 在访达按 Command+Shift+G，打开以下目录；目录不存在时先创建：

   ```text
   /Users/liujinsuo/Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons
   ```

   在该目录中创建 `wps-tabbox_1.0.0` 文件夹，把项目 `dist/` 里面的全部内容复制进去。不要再套一层 dist 目录。最终结构为：

   ```text
   jsaddons/
     publish.xml
     wps-tabbox_1.0.0/
       index.html
       main.js
       manifest.xml
       functions.json
       ribbon.xml
       js/
         functions.js
   ```

4. 如果插件目录已有 `publish.xml`，先复制一份备份。使用纯文本编辑器编辑它，不要保存成富文本格式。
5. 登记本地加载项目录。如果没有 `publish.xml`，创建它并写入以下完整内容：

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <jsplugins>
     <jsplugin
       name="wps-tabbox"
       type="et"
       url="wps-tabbox_1.0.0"
       version="1.0.0"
       enable="enable_dev"
       install="null"
       customDomain=""/>
   </jsplugins>
   ```

   如果已有 `publish.xml`，只把上面的 `<jsplugin .../>` 记录加入现有 `<jsplugins>` 节点内，保留其他加载项和配置。已经存在同名 `wps-tabbox` 的离线记录时更新该条记录；存在同名 `<jspluginonline>` 调试记录时移除它，避免重复加载。

   `url` 是相对于 jsaddons 的文件夹名，必须与复制的 `wps-tabbox_1.0.0` 完全一致。它不是 `http://127.0.0.1:3893/`，也不是 dist 所在的项目路径。后续更改版本号时，同步调整文件夹名与 `version`。
6. 保持 debug 服务关闭，重新打开 WPS 表格。若出现加载项信任提示，核对名称 `wps-tabbox` 后按提示操作；在“TABBOX”中点击“检查函数状态”。
7. 在空白单元格输入：

   ```excel
   =TABBOX.JSONGET("[10,20,30]","[0]")
   ```

   预期返回数值 `10`。完全退出并重新打开 WPS 后再次计算成功，才能确认本机离线加载有效；此后无需启动 `npm run wps:debug`。Mac 客户端仍可能存在加载项或自定义函数兼容性差异，本项目尚未完成真实 WPS 的这项验证。

## 两种方式切换

1. debug 切换到离线：保存文档并退出 WPS，停止 debug 服务，然后运行对应系统的一键安装命令；脚本会替换同名在线调试记录。也可按手动离线步骤操作。
2. 离线切换到 debug：保存文档并退出 WPS，备份 `publish.xml`，移除同名离线 `<jsplugin>` 记录，再运行 `npm run wps:debug`，由工具登记在线调试记录。保留其他加载项配置。
3. 离线安装后修改项目源码不会自动更新已安装文件；重新运行一键安装脚本，或重新构建并复制到离线目录，然后完全退出并重启 WPS。

## 使用示例

1. 把以下内容作为普通文本粘贴到 A2：

   ```json
   {"uid":123,"user":{"name":"张三"},"items":[{"id":8}],"active":false,"nothing":null,"id":"9223372036854775807"}
   ```

2. 在其他单元格输入公式：

   | 公式 | 预期结果 |
   | --- | --- |
   | `=TABBOX.JSONGET(A2,"uid")` | 数值 123 |
   | `=TABBOX.JSONGET(A2,"user.name")` | 文本 张三 |
   | `=TABBOX.JSONGET(A2,"items[0].id")` | 数值 8 |
   | `=TABBOX.JSONGET(A2,"active")` | 布尔 FALSE |
   | `=TABBOX.JSONGET(A2,"nothing")` | 空文本 |
   | `=TABBOX.JSONGET(A2,"user")` | 文本 `{"name":"张三"}` |
   | `=TABBOX.JSONGET(A2,"id")` | 保留完整长编号的文本 |

3. 向下填充公式即可解析后续行；源单元格变化时由 WPS 的公式计算机制重新求值。
4. 数组下标从 0 开始。根数组使用 `[0].id`；空路径 `""` 返回整个 JSON，根值为 null 时返回空文本。
5. 字段名含点号或方括号时，可以把路径 `["a.b"]["x[y]"]` 写在 B1，再使用 `=TABBOX.JSONGET(A2,B1)`。不支持通配符、筛选表达式或完整 JSONPath。

## 时间戳转时间

1. 秒级时间戳使用 `=TABBOX.TIME(A2)`，也可明确写成 `=TABBOX.TIME(A2,"s")`。例如 A2 为 `1704067200`，本机时区为 UTC+8 时，设置下述单元格格式后显示 `2024-01-01 08:00:00.000`。
2. 毫秒级时间戳使用 `=TABBOX.TIME(A2,"ms")`。例如 A2 为 `1704067200123`，本机时区为 UTC+8 时，设置单元格格式后显示 `2024-01-01 08:00:00.123`，数值中保留实际毫秒。函数不会自动猜测单位，省略或留空单位时按秒处理。
3. JSON 中的时间戳可以直接组合提取与转换：

   ```excel
   =TABBOX.TIME(TABBOX.JSONGET(A2,"create_time"))
   =TABBOX.TIME(TABBOX.JSONGET(A2,"create_time"),"ms")
   ```

4. 返回值是可参与日期加减、比较和计算的日期序列数值。选中结果单元格，按 Command+1（Windows 按 Ctrl+1），进入“数字 → 自定义”，将格式设为 `yyyy-mm-dd hh:mm:ss.000`。常规格式下会显示序列数值；设好日期格式后显示日期时间和三位毫秒。
5. 使用时间戳对应时刻的本机时区规则处理夏令时。日期序列采用默认 1900 日期系统，包含 1900 年的闰日兼容处理。如果工作簿使用 1904 日期系统，可写成 `=TABBOX.TIME(A2)-1462`（毫秒输入同理）。1900 年以前的日期显示受客户端支持范围限制。
6. 接受整数或整数字符串，包括零和负时间戳；空输入、布尔值、小数、无效文本、无效单位、超出安全整数或转换后超出 0001–9999 年范围的输入返回 `#TIME!` 开头的说明文本。它与 `#JSON!` 一样不是宿主原生错误值，`IFERROR` 不会捕获。
7. 已安装旧版加载项的用户需要重新运行对应系统的一键安装命令，或者重新构建并复制离线文件，然后完全退出并重启 WPS。点击“检查函数状态”后，仍需在实际单元格确认新公式能计算。

## 返回值和错误

1. 数字、文本、布尔值保留对应类型；对象、数组返回紧凑 JSON 文本；null 返回空文本。
2. JSON 无效、路径无效或字段缺失时，返回以 `#JSON!` 开头的说明文本。它不是 WPS 原生错误值，`IFERROR` 不会捕获它。
3. 超过 JavaScript 安全整数范围的数字会拒绝解析，避免先舍入再显示。请把长 ID 写成 JSON 字符串，例如 `{"id":"9223372036854775807"}`。
4. JavaScript 能精确表示的 16 位整数会作为文本返回，避免进入表格后被截成 15 位。小数遵循 JavaScript 与表格的浮点数精度限制。
5. WPS 单元格文本长度、公式计算和客户端接口仍受其自身限制。本项目不绕过这些限制。
6. 把含此公式的文件发给别人时，对方也需要安装兼容加载项才能重新计算；需要普通结果时可复制后选择性粘贴为值。

## 本地验证和构建

1. 不安装任何依赖也能运行本项目自行编写的验证和构建：

   ```sh
   node --test tests/json-get.test.cjs tests/json-time.test.cjs tests/install-macos.test.cjs
   /bin/bash -n install.sh
   node scripts/build.cjs
   ```

2. 构建产物位于 `dist/`，只包含 6 个加载项运行文件。构建本身不安装、不注册、不启动 WPS。
3. 验证涵盖嵌套路径、错误反馈、原型字段隔离、大整数保护、函数声明、注册回调和安装配置合并；模拟宿主和临时目录安装通过不代表真实 Mac WPS 公式已验证。
4. 安装器验证使用 `WPS_TABBOX_ADDONS_DIR` 指定临时目录，避免改动实际 WPS 配置；日常用户不需要设置此变量。Mac 验证需要开发用 Node.js，安装端不需要。
5. Windows 安装器验证使用 PowerShell，不需要 Node.js。在项目目录执行：

   ```powershell
   .\tests\install-windows.Tests.ps1
   ```

   增加 `-Download` 会实际从 GitHub 下载 ZIP。验证覆盖空 PATH 安装、本地离线命令、重复安装与备份、损坏配置保护；Windows 上额外验证只读配置导致最终替换失败时的恢复。GitHub Actions 使用 Windows PowerShell 5.1 运行这组验证，不启动真实 WPS。

## 排查和移除

1. `#NAME?`：先确认 WPS 表格已加载“TABBOX”，再检查函数状态。debug 方式需要调试服务正在运行；离线方式检查本地目录、publish.xml 的同名记录和文件结构。配置变化后需要完全退出并重启 WPS。
2. 端口 3893 被占用：停止占用该端口的旧调试进程，或手动执行 `npx wpsjs debug --port 3894`。
3. 停止本次调试：在调试终端按 Control+C；这不等于删除已注册的加载项配置。
4. 需要移除时，在 WPS 的加载项管理入口找到 `wps-tabbox` 并禁用或删除。入口因版本而异，勿清空其他加载项或整个配置目录。

## 官方参考

1. [WPS 加载项自定义函数](https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/wps-integration-mode/wps-addin-development/wps-addin-custome-function)
2. [WPS 加载项开发说明](https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/wps-integration-mode/wps-addin-development/wps-addin-development-instructions)
3. [官方 wpsjs 工具](https://www.npmjs.com/package/wpsjs)

4. [Mac 离线加载方式的 WPS 技术支持答复](https://bbs.wps.cn/topic/54791)
