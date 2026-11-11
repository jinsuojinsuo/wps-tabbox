#!/bin/bash
set -euo pipefail

# 只使用 macOS 自带工具；所有安装内容均为无需构建的静态文件。
work_dir=""
stage_dir=""
backup_dir=""
install_dir=""
plugin_folder=""
old_moved=0
new_installed=0
committed=0

fail() {
    printf '安装失败：%s\n' "$*" >&2
    exit 1
}

cleanup() {
    exit_status=$?
    set +e
    if [[ "$committed" -eq 0 ]]; then
        if [[ "$new_installed" -eq 1 ]]; then
            /bin/rm -rf "$install_dir"
        fi
        if [[ "$old_moved" -eq 1 ]]; then
            /bin/mv "$backup_dir/$plugin_folder" "$install_dir"
        fi
    fi
    [[ -z "$stage_dir" ]] || /bin/rm -rf "$stage_dir"
    [[ -z "$work_dir" ]] || /bin/rm -rf "$work_dir"
    exit "$exit_status"
}

main() {
    [[ "$(/usr/bin/uname -s)" == Darwin ]] || fail "此安装脚本仅适用于 macOS。"
    for tool in /usr/bin/curl /usr/bin/ditto /usr/bin/plutil /usr/bin/xmllint /usr/bin/xsltproc; do
        [[ -x "$tool" ]] || fail "缺少 macOS 系统工具：$tool"
    done

    default_addons_dir="$HOME/Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons"
    # 仅供隔离验证或明确指定安装目录；日常安装无需设置。
    addons_dir="${WPS_JSON_GET_ADDONS_DIR:-$default_addons_dir}"
    if [[ "$addons_dir" == "$default_addons_dir" ]] && /usr/bin/pgrep -x wpsoffice >/dev/null; then
        fail "请先保存文档并完全退出 WPS，再重新运行安装命令。"
    fi

    work_dir="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/wps-json-get.XXXXXX")"
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM

    source_dir=""
    script_path="${BASH_SOURCE[0]:-}"
    if [[ -n "$script_path" && -f "$script_path" ]]; then
        candidate="$(cd "$(/usr/bin/dirname "$script_path")" && pwd)"
        if [[ -f "$candidate/package.json" && -f "$candidate/index.html" ]]; then
            source_dir="$candidate"
        fi
    fi
    if [[ -z "$source_dir" ]]; then
        printf '正在从 GitHub 下载运行文件……\n'
        /usr/bin/curl --fail --show-error --silent --location --retry 2 \
            --connect-timeout 15 --max-time 120 \
            'https://codeload.github.com/jinsuojinsuo/wps-tabbox/zip/refs/heads/main' \
            --output "$work_dir/source.zip" || fail "下载失败，请检查网络后重试。"
        /usr/bin/ditto -x -k "$work_dir/source.zip" "$work_dir/source" || fail "下载的压缩包无法解压。"
        source_dir="$work_dir/source/wps-tabbox-main"
    fi

    runtime_files=(index.html main.js manifest.xml functions.json ribbon.xml js/functions.js)
    [[ -f "$source_dir/package.json" ]] || fail "下载内容缺少 package.json。"
    for runtime_file in "${runtime_files[@]}"; do
        [[ -f "$source_dir/$runtime_file" ]] || fail "缺少运行文件：$runtime_file"
    done
    project_name="$(/usr/bin/plutil -extract name raw -o - "$source_dir/package.json")"
    [[ "$project_name" == wps-json-get ]] || fail "下载内容不是 wps-json-get 项目。"
    plugin_version="$(/usr/bin/plutil -extract version raw -o - "$source_dir/package.json")"
    [[ "$plugin_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || fail "项目版本号格式无效。"
    /usr/bin/xmllint --nonet --noout "$source_dir/manifest.xml" "$source_dir/ribbon.xml" || fail "运行文件 XML 格式无效。"
    /usr/bin/plutil -convert xml1 -o "$work_dir/functions.plist" "$source_dir/functions.json" || fail "函数声明 JSON 格式无效。"

    plugin_folder="wps-json-get_$plugin_version"
    install_dir="$addons_dir/$plugin_folder"
    publish_file="$addons_dir/publish.xml"
    [[ ! -e "$install_dir" || -d "$install_dir" ]] || fail "安装位置已被同名文件占用：$install_dir"

    config_source="$publish_file"
    if [[ ! -e "$publish_file" ]]; then
        config_source="$work_dir/empty.xml"
        printf '<?xml version="1.0" encoding="UTF-8"?><jsplugins/>\n' > "$config_source"
    fi
    /usr/bin/xmllint --nonet --noout "$config_source" 2>/dev/null || fail "现有 publish.xml 无法解析，原配置未改动。"
    config_root="$(/usr/bin/xmllint --nonet --xpath 'name(/*)' "$config_source")"
    [[ "$config_root" == jsplugins ]] || fail "publish.xml 根节点不是 jsplugins，原配置未改动。"

    /bin/cat > "$work_dir/merge.xsl" <<'XSL'
<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" encoding="UTF-8"/>
  <xsl:param name="version"/>
  <xsl:param name="folder"/>
  <xsl:template match="@*|node()">
    <xsl:copy><xsl:apply-templates select="@*|node()"/></xsl:copy>
  </xsl:template>
  <xsl:template match="/jsplugins">
    <xsl:copy>
      <xsl:apply-templates select="@*|node()[not((self::jsplugin or self::jspluginonline) and @name='wps-json-get')]"/>
      <jsplugin name="wps-json-get" type="et" url="{$folder}" version="{$version}" enable="enable_dev" install="null" customDomain=""/>
    </xsl:copy>
  </xsl:template>
</xsl:stylesheet>
XSL
    /bin/mkdir -p "$addons_dir"
    stage_dir="$(/usr/bin/mktemp -d "$addons_dir/.wps-json-get-stage.XXXXXX")"
    /usr/bin/xsltproc --nonet --stringparam version "$plugin_version" --stringparam folder "$plugin_folder" \
        "$work_dir/merge.xsl" "$config_source" > "$stage_dir/publish.xml"
    /usr/bin/xmllint --nonet --noout "$stage_dir/publish.xml" || fail "生成的配置无效，原配置未改动。"
    for runtime_file in "${runtime_files[@]}"; do
        /bin/mkdir -p "$stage_dir/plugin/$(/usr/bin/dirname "$runtime_file")"
        /bin/cp "$source_dir/$runtime_file" "$stage_dir/plugin/$runtime_file"
    done

    if [[ -e "$publish_file" || -d "$install_dir" ]]; then
        /bin/mkdir -p "$addons_dir/.wps-json-get-backups"
        backup_dir="$(/usr/bin/mktemp -d "$addons_dir/.wps-json-get-backups/$(/bin/date +%Y%m%d-%H%M%S).XXXXXX")"
        if [[ -e "$publish_file" ]]; then
            /bin/cp -p "$publish_file" "$backup_dir/publish.xml"
        fi
        if [[ -d "$install_dir" ]]; then
            /bin/mv "$install_dir" "$backup_dir/$plugin_folder"
            old_moved=1
        fi
    fi
    /bin/mv "$stage_dir/plugin" "$install_dir"
    new_installed=1
    # 配置最后在同一文件系统中原子替换；此前失败则由 cleanup 回退文件。
    /bin/mv "$stage_dir/publish.xml" "$publish_file"
    committed=1

    printf '安装文件和配置已写入：%s\n' "$install_dir"
    [[ -z "$backup_dir" ]] || printf '原配置和同版本旧文件已备份到：%s\n' "$backup_dir"
    printf '无需 Git、Node.js、npm、Python 或编译环境，也无需常驻服务。\n'
    printf '请重新打开 WPS 表格，验证公式：=TABBOX.JSONGET("[10,20,30]","[0]")，预期返回 10。\n'
    printf '文件安装完成不代表当前 WPS 客户端已支持自定义函数，仍需以上实际验证。\n'
}

main "$@"
