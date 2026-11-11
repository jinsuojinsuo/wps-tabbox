#requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version 2.0

function Read-WpsXml([string]$File) {
    $settings = New-Object System.Xml.XmlReaderSettings
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $reader = [System.Xml.XmlReader]::Create($File, $settings)
    try {
        $document = New-Object System.Xml.XmlDocument
        $document.PreserveWhitespace = $true
        $document.Load($reader)
        return ,$document
    } finally {
        $reader.Dispose()
    }
}

$workDirectory = $null
$stageDirectory = $null
$backupDirectory = $null
$installDirectory = $null
$oldMoved = $false
$newInstalled = $false
$committed = $false

try {
    $isWindowsPlatform = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
    $customDirectory = $env:WPS_TABBOX_ADDONS_DIR
    if (-not $isWindowsPlatform -and -not $customDirectory) {
        throw '此安装脚本适用于 Windows；macOS 请使用 install.sh。'
    }
    if ($customDirectory) {
        # 隔离验证使用独立目录；日常安装无需设置这个变量。
        $addonsDirectory = [IO.Path]::GetFullPath($customDirectory)
    } else {
        if (-not $env:APPDATA) { throw '无法取得当前用户的 APPDATA 目录。' }
        $addonsDirectory = Join-Path $env:APPDATA 'kingsoft/wps/jsaddons'
        if (Get-Process -Name et,wps,wpp,wpsoffice,wpspdf -ErrorAction SilentlyContinue) {
            throw '请先保存文档并完全退出 WPS，再重新运行安装命令。'
        }
    }

    $workDirectory = Join-Path ([IO.Path]::GetTempPath()) ('wps-tabbox-' + [guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($workDirectory)
    $sourceDirectory = $PSScriptRoot
    if (-not $sourceDirectory) { $sourceDirectory = (Get-Location).ProviderPath }
    if (-not $sourceDirectory -or
        -not (Test-Path -LiteralPath (Join-Path $sourceDirectory 'package.json') -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $sourceDirectory 'index.html') -PathType Leaf)) {
        Write-Host '正在从 GitHub 下载运行文件……'
        $archive = Join-Path $workDirectory 'source.zip'
        $previousTls = [Net.ServicePointManager]::SecurityProtocol
        try {
            [Net.ServicePointManager]::SecurityProtocol = $previousTls -bor [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -UseBasicParsing -Uri 'https://codeload.github.com/jinsuojinsuo/wps-tabbox/zip/refs/heads/main' -OutFile $archive -TimeoutSec 120
        } finally {
            [Net.ServicePointManager]::SecurityProtocol = $previousTls
        }
        $extracted = Join-Path $workDirectory 'source'
        Expand-Archive -LiteralPath $archive -DestinationPath $extracted
        $sourceDirectory = Join-Path $extracted 'wps-tabbox-main'
    }

    $runtimeFiles = @('index.html', 'main.js', 'manifest.xml', 'functions.json', 'ribbon.xml', 'js/functions.js')
    foreach ($file in @('package.json') + $runtimeFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $sourceDirectory $file) -PathType Leaf)) {
            throw "缺少运行文件：$file"
        }
    }
    $package = Get-Content -LiteralPath (Join-Path $sourceDirectory 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($package.name -cne 'wps-tabbox') { throw '下载内容不是 wps-tabbox 项目。' }
    $version = [string]$package.version
    if ($version -cnotmatch '^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$') { throw '项目版本号格式无效。' }
    [void](Read-WpsXml (Join-Path $sourceDirectory 'manifest.xml'))
    [void](Read-WpsXml (Join-Path $sourceDirectory 'ribbon.xml'))
    [void](Get-Content -LiteralPath (Join-Path $sourceDirectory 'functions.json') -Raw -Encoding UTF8 | ConvertFrom-Json)

    $pluginFolder = 'wps-tabbox_' + $version
    $installDirectory = Join-Path $addonsDirectory $pluginFolder
    $publishFile = Join-Path $addonsDirectory 'publish.xml'
    if ((Test-Path -LiteralPath $installDirectory) -and -not [IO.Directory]::Exists($installDirectory)) {
        throw "安装位置已被同名文件占用：$installDirectory"
    }
    if (Test-Path -LiteralPath $publishFile) {
        try { $document = Read-WpsXml $publishFile } catch { throw '现有 publish.xml 无法解析，原配置未改动。' }
    } else {
        $document = New-Object System.Xml.XmlDocument
        $document.PreserveWhitespace = $true
        [void]$document.AppendChild($document.CreateXmlDeclaration('1.0', 'UTF-8', $null))
        [void]$document.AppendChild($document.CreateElement('jsplugins'))
    }
    if ($document.DocumentElement.get_Name() -cne 'jsplugins' -or $document.DocumentElement.get_NamespaceURI() -cne '') {
        throw 'publish.xml 根节点不是无命名空间的 jsplugins，原配置未改动。'
    }
    foreach ($node in @($document.DocumentElement.ChildNodes)) {
        if ($node.get_NodeType() -eq [System.Xml.XmlNodeType]::Element -and
            ($node.get_Name() -ceq 'jsplugin' -or $node.get_Name() -ceq 'jspluginonline') -and
            $node.GetAttribute('name') -ceq 'wps-tabbox') {
            [void]$document.DocumentElement.RemoveChild($node)
        }
    }
    $record = $document.CreateElement('jsplugin')
    $attributes = @{ name='wps-tabbox'; type='et'; url=$pluginFolder; version=$version; enable='enable_dev'; install='null'; customDomain='' }
    foreach ($key in $attributes.Keys) { $record.SetAttribute($key, $attributes[$key]) }
    [void]$document.DocumentElement.AppendChild($record)

    [void][IO.Directory]::CreateDirectory($addonsDirectory)
    $stageDirectory = Join-Path $addonsDirectory ('.wps-tabbox-stage.' + [guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($stageDirectory)
    $stagedPublish = Join-Path $stageDirectory 'publish.xml'
    $writerSettings = New-Object System.Xml.XmlWriterSettings
    $writerSettings.Encoding = New-Object Text.UTF8Encoding $false
    $writer = [System.Xml.XmlWriter]::Create($stagedPublish, $writerSettings)
    try { $document.Save($writer) } finally { $writer.Dispose() }
    $stagedPlugin = Join-Path $stageDirectory 'plugin'
    foreach ($file in $runtimeFiles) {
        $destination = Join-Path $stagedPlugin $file
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))
        [IO.File]::Copy((Join-Path $sourceDirectory $file), $destination)
    }

    if ([IO.File]::Exists($publishFile) -or [IO.Directory]::Exists($installDirectory)) {
        $backupName = (Get-Date -Format 'yyyyMMdd-HHmmss') + '.' + [guid]::NewGuid().ToString('N')
        $backupDirectory = Join-Path (Join-Path $addonsDirectory '.wps-tabbox-backups') $backupName
        [void][IO.Directory]::CreateDirectory($backupDirectory)
        if ([IO.File]::Exists($publishFile)) {
            [IO.File]::Copy($publishFile, (Join-Path $backupDirectory 'publish.xml'))
        }
        if ([IO.Directory]::Exists($installDirectory)) {
            [IO.Directory]::Move($installDirectory, (Join-Path $backupDirectory $pluginFolder))
            $oldMoved = $true
        }
    }
    [IO.Directory]::Move($stagedPlugin, $installDirectory)
    $newInstalled = $true
    # 配置最后在同一文件系统替换；此前失败会恢复本次移动的旧目录。
    if ([IO.File]::Exists($publishFile)) {
        [IO.File]::Replace($stagedPublish, $publishFile, (Join-Path $stageDirectory 'previous-publish.xml'))
    } else {
        [IO.File]::Move($stagedPublish, $publishFile)
    }
    $committed = $true
    Write-Host "安装文件和配置已写入：$installDirectory"
    if ($backupDirectory) { Write-Host "原配置和同版本旧文件已备份到：$backupDirectory" }
    Write-Host '无需 Git、Node.js、npm、Python 或编译环境，也无需常驻服务。'
    Write-Host '请重新打开 WPS 表格，验证公式：=TABBOX.JSONGET("[10,20,30]","[0]")，预期返回 10。'
    Write-Host '文件安装完成不代表当前 WPS 客户端已支持自定义函数，仍需实际验证。'
} catch {
    if (-not $committed) {
        try {
            if ($newInstalled) { [IO.Directory]::Delete($installDirectory, $true) }
            if ($oldMoved) { [IO.Directory]::Move((Join-Path $backupDirectory $pluginFolder), $installDirectory) }
        } catch {
            Write-Warning "旧目录未能自动恢复，请保留并检查备份：$backupDirectory"
        }
    }
    throw
} finally {
    foreach ($directory in @($stageDirectory, $workDirectory)) {
        if ($directory -and (Test-Path -LiteralPath $directory)) {
            Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
