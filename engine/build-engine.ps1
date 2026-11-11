param([Parameter(Mandatory=$true)][string]$NcnnRoot)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $NcnnRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $Root 'include\ncnn\net.h'))) { throw 'NcnnRoot must point to the x64 directory containing include\ncnn\net.h and lib\ncnn.lib.' }
$CMake = Get-Command cmake.exe -ErrorAction SilentlyContinue
if ($CMake) { $CMakePath = $CMake.Source }
else { $CMakePath = 'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' }
if (-not (Test-Path -LiteralPath $CMakePath)) { throw 'CMake was not found. Install CMake or Visual Studio with C++ build tools.' }
$Build = Join-Path $PSScriptRoot 'build'
& $CMakePath -S $PSScriptRoot -B $Build -G 'Visual Studio 17 2022' -A x64 "-DNCNN_ROOT=$Root"
if ($LASTEXITCODE -ne 0) { throw 'CMake configuration failed.' }
& $CMakePath --build $Build --config Release --parallel
if ($LASTEXITCODE -ne 0) { throw 'The original Pitchee inference core could not be compiled.' }
$Bin = Join-Path $PSScriptRoot 'bin'
New-Item -ItemType Directory -Force -Path $Bin | Out-Null
Copy-Item -LiteralPath (Join-Path $Build 'Release\pitchee_cli.exe') -Destination $Bin -Force
Get-ChildItem -LiteralPath (Join-Path $Root 'bin') -Filter '*.dll' | Copy-Item -Destination $Bin -Force
Write-Host 'Engine built. Restart Pitchee Web and run a real recording to verify inference.'
