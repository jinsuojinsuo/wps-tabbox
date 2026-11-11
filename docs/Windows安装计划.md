# Windows 一键安装计划

## 目标和范围

1. 新增 install.ps1，支持 Windows 10/11 自带 Windows PowerShell 5.1，不要求管理员权限。
2. 安装端不依赖 Git、Node.js、npm、Python、编译器或开发工具；直接复制 6 个已可运行的静态文件。
3. 本地完整项目可直接安装；单独脚本从 GitHub main 下载 ZIP，使用系统解压能力。
4. 默认使用 %APPDATA%\kingsoft\wps\jsaddons，只替换本项目的离线和在线记录，保留其他配置。
5. 对原配置和同版本旧目录做备份；配置解析失败时不写入，最终配置替换失败时恢复旧目录。
6. 不强制关闭 WPS，不调整执行策略、不禁用证书验证、不修改其他安全设置。

## 实施与验收

1. 先编写本次独立的 PowerShell 验证，确认缺失脚本会失败。
2. 实现安装器并验证首次安装、重复安装与备份、损坏配置保护；Windows 上额外验证只读配置导致失败时的恢复。
3. 验证始终使用 WPS_TABBOX_ADDONS_DIR 指向临时目录，清空 PATH，避免依赖 Git 或外部开发工具。
4. 在 Windows PowerShell 5.1 环境运行同一组验证，并验证独立脚本的 GitHub 下载路径。
5. 更新 README 的 Windows 安装命令、路径、备份和验证说明，保留原 Mac 安装方式。
6. 保留已有 .idea 编辑器改动，只提交本次安装器相关文件。真实 WPS 的注册及公式求值仍需用户验证。

## 验收结果

1. 已完成安装器、在线与离线安装说明，以及 Windows 自动验证流程。
2. Windows PowerShell 5.1 的 7 项验证全部通过；验证使用临时目录和空 PATH，没有改动真实 WPS 配置。
3. 已验证 GitHub 下载安装入口，包括 UTF-8 编码标记处理；其他加载项保留、原配置备份和最终替换失败恢复均通过。
4. Windows 验证记录：https://github.com/jinsuojinsuo/wps-tabbox/actions/runs/40257557783 。
5. 真实 WPS 客户端的加载和公式计算未验证，需安装后输入示例公式确认。
