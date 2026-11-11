#requires -Version 5.1
[CmdletBinding()]
param([switch]$Download)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$projectRoot = Split-Path -Parent $PSScriptRoot
$installer = Join-Path $projectRoot 'install.ps1'
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw 'install.ps1 不存在。' }
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$folderName = 'wps-tabbox_' + $package.version
$runtimeFiles = @('index.html', 'main.js', 'manifest.xml', 'functions.json', 'ribbon.xml', 'js/functions.js')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('wps-json-windows-test-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($testRoot)
$originalPath = $env:PATH
$originalTarget = $env:WPS_TABBOX_ADDONS_DIR
$passed = 0

function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -cne $Expected) { throw "$Message；预期：$Expected，实际：$Actual" }
}

function New-TestTarget([string]$Name) {
    $target = Join-Path $testRoot ($Name + '/中文 [安装] 目录/jsaddons')
    [void][IO.Directory]::CreateDirectory($target)
    $env:WPS_TABBOX_ADDONS_DIR = $target
    return $target
}

function Read-TestXml([string]$File) {
    $xml = New-Object System.Xml.XmlDocument
    $xml.Load($File)
    return ,$xml
}

function Assert-Runtime([string]$Target, [switch]$NormalizeLineEndings) {
    foreach ($file in $runtimeFiles) {
        $actual = [IO.File]::ReadAllBytes((Join-Path (Join-Path $Target $folderName) $file))
        $expected = [IO.File]::ReadAllBytes((Join-Path $projectRoot $file))
        if ($NormalizeLineEndings) {
            # Windows Git 检出可能转为 CRLF，GitHub ZIP 保留仓库的 LF。
            $actual = [Text.Encoding]::UTF8.GetBytes([Text.Encoding]::UTF8.GetString($actual).Replace("`r`n", "`n"))
            $expected = [Text.Encoding]::UTF8.GetBytes([Text.Encoding]::UTF8.GetString($expected).Replace("`r`n", "`n"))
        }
        if ([Convert]::ToBase64String($actual) -cne [Convert]::ToBase64String($expected)) {
            throw "运行文件不一致：$file"
        }
    }
}

try {
    # 验证只使用 PowerShell/.NET 内置能力，不依赖 PATH 中的 Git 或其他程序。
    $env:PATH = ''
    $target = New-TestTarget 'fresh'
    & $installer
    Assert-Runtime $target
    $config = Join-Path $target 'publish.xml'
    $xml = Read-TestXml $config
    $record = $xml.SelectSingleNode('/jsplugins/jsplugin[@name="wps-tabbox"]')
    Assert-Equal $record.GetAttribute('url') $folderName '登记目录错误'
    Assert-Equal $record.GetAttribute('type') 'et' '组件类型错误'
    $passed++
    Write-Host 'PASS：首次安装不依赖 Git 或编译环境'

    $target = New-TestTarget 'offline-command'
    & {
        function Invoke-WebRequest { throw '完整项目离线安装不应请求网络。' }
        Push-Location -LiteralPath $projectRoot
        try {
            & ([scriptblock]::Create((Get-Content -LiteralPath $installer -Raw -Encoding UTF8)))
        } finally {
            Pop-Location
        }
    }
    Assert-Runtime $target
    $passed++
    Write-Host 'PASS：完整项目可用命令离线安装，无需修改执行策略'

    $target = New-TestTarget 'repeat'
    $config = Join-Path $target 'publish.xml'
    $original = '<?xml version="1.0"?><jsplugins><!--保留说明--><jspluginonline name="other" url="https://example.com/a?x=1&amp;y=2" enable="disabled" custom="值"/><jspluginonline name="wps-tabbox" url="http://127.0.0.1:3893/"/><jsplugin name="wps-tabbox" url="old"/></jsplugins>'
    [IO.File]::WriteAllText($config, $original, (New-Object Text.UTF8Encoding $false))
    $oldFolder = Join-Path $target $folderName
    [void][IO.Directory]::CreateDirectory($oldFolder)
    [IO.File]::WriteAllText((Join-Path $oldFolder 'old-marker'), '原安装文件')
    & $installer
    $xml = Read-TestXml $config
    Assert-Equal $xml.SelectNodes('/jsplugins/*[@name="wps-tabbox"]').Count 1 '出现重复记录'
    $other = $xml.SelectSingleNode('/jsplugins/jspluginonline[@name="other"]')
    Assert-Equal $other.GetAttribute('url') 'https://example.com/a?x=1&y=2' '其他加载项 URL 改变'
    Assert-Equal $other.GetAttribute('enable') 'disabled' '其他加载项状态改变'
    Assert-Equal $other.GetAttribute('custom') '值' '其他加载项自定义属性改变'
    if (-not [IO.File]::ReadAllText($config).Contains('保留说明')) { throw '其他注释丢失。' }
    $backups = @(Get-ChildItem -LiteralPath (Join-Path $target '.wps-tabbox-backups') -Directory)
    Assert-Equal $backups.Count 1 '未保存唯一的安装备份'
    Assert-Equal ([IO.File]::ReadAllText((Join-Path $backups[0].FullName 'publish.xml'))) $original '原配置备份不一致'
    Assert-Equal ([IO.File]::ReadAllText((Join-Path (Join-Path $backups[0].FullName $folderName) 'old-marker'))) '原安装文件' '旧文件没有备份'
    & $installer
    $xml = Read-TestXml $config
    Assert-Equal $xml.SelectNodes('/jsplugins/*[@name="wps-tabbox"]').Count 1 '重复安装生成重复记录'
    $passed++
    Write-Host 'PASS：重复安装保留其他加载项并保存可恢复备份'

    $target = New-TestTarget 'invalid'
    $config = Join-Path $target 'publish.xml'
    $oldFolder = Join-Path $target $folderName
    [void][IO.Directory]::CreateDirectory($oldFolder)
    [IO.File]::WriteAllText((Join-Path $oldFolder 'marker'), '保持原样')
    foreach ($original in @('<jsplugins><broken>', '<unexpected/>')) {
        [IO.File]::WriteAllText($config, $original)
        $failed = $false
        try { & $installer } catch { $failed = $true }
        Assert-Equal $failed $true '损坏配置没有被拒绝'
        Assert-Equal ([IO.File]::ReadAllText($config)) $original '损坏的原配置被改动'
        Assert-Equal ([IO.File]::ReadAllText((Join-Path $oldFolder 'marker'))) '保持原样' '旧文件被改动'
    }
    $passed++
    Write-Host 'PASS：损坏配置和错误根节点不会覆盖原安装'

    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        $target = New-TestTarget 'readonly'
        $config = Join-Path $target 'publish.xml'
        $original = '<jsplugins><jsplugin name="other" url="keep"/></jsplugins>'
        [IO.File]::WriteAllText($config, $original)
        $oldFolder = Join-Path $target $folderName
        [void][IO.Directory]::CreateDirectory($oldFolder)
        [IO.File]::WriteAllText((Join-Path $oldFolder 'marker'), '恢复旧文件')
        [IO.File]::SetAttributes($config, [IO.FileAttributes]::ReadOnly)
        $failed = $false
        try { & $installer } catch { $failed = $true }
        Assert-Equal $failed $true '只读配置应拒绝最终替换'
        Assert-Equal ([IO.File]::ReadAllText($config)) $original '只读配置被改动'
        Assert-Equal ([IO.File]::ReadAllText((Join-Path $oldFolder 'marker'))) '恢复旧文件' '最终替换失败后未恢复旧文件'
        if (Test-Path -LiteralPath (Join-Path $oldFolder 'index.html')) { throw '失败安装的新文件未清理。' }
        [IO.File]::SetAttributes($config, [IO.FileAttributes]::Normal)
        $passed++
        Write-Host 'PASS：最终配置替换失败后恢复旧文件'
    } else {
        Write-Host 'SKIP：只读配置回退需在 Windows 文件系统验证'
    }

    if ($Download) {
        $target = New-TestTarget 'download'
        $standalone = Join-Path $testRoot 'standalone.ps1'
        [IO.File]::Copy($installer, $standalone)
        & $standalone
        Assert-Runtime $target -NormalizeLineEndings
        $passed++
        Write-Host 'PASS：单独脚本从 GitHub 下载并安装，无需编译'

        $target = New-TestTarget 'online-command'
        Push-Location -LiteralPath $testRoot
        try {
            & ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/jinsuojinsuo/wps-tabbox/main/install.ps1').Content.TrimStart([char]0xFEFF)))
        } finally {
            Pop-Location
        }
        Assert-Runtime $target -NormalizeLineEndings
        $passed++
        Write-Host 'PASS：README 在线命令可处理下载脚本的编码标记'
    }
    Write-Host "通过 $passed 项安装验证；全部在临时目录执行。"
} finally {
    $env:PATH = $originalPath
    $env:WPS_TABBOX_ADDONS_DIR = $originalTarget
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
