$ErrorActionPreference = 'Stop'
$bundleRoot = $PSScriptRoot
$cachePath = Join-Path $bundleRoot 'acquisition-cache'
$archiveItems = @(
    @{ archive='glib-2.89.4.tar.xz'; url='https://download.gnome.org/sources/glib/2.89/glib-2.89.4.tar.xz'; files=@('glib-2.89.4/COPYING','glib-2.89.4/LICENSES','glib-2.89.4/.reuse/dep5','glib-2.89.4/README.md','glib-2.89.4/glib/glib.h','glib-2.89.4/glib/garray.c') },
    @{ archive='pango-1.58.2.tar.xz'; url='https://download.gnome.org/sources/pango/1.58/pango-1.58.2.tar.xz'; files=@('pango-1.58.2/COPYING','pango-1.58.2/README.md','pango-1.58.2/pango/pango-context.c') },
    @{ archive='librsvg-2.62.91.tar.xz'; url='https://download.gnome.org/sources/librsvg/2.62/librsvg-2.62.91.tar.xz'; files=@('librsvg-2.62.91/COPYING.LIB','librsvg-2.62.91/AUTHORS','librsvg-2.62.91/README.md','librsvg-2.62.91/include/librsvg/rsvg.h','librsvg-2.62.91/rsvg/Cargo.toml') },
    @{ archive='libvips-8.18.6.tar.gz'; url='https://codeload.github.com/libvips/libvips/tar.gz/refs/tags/v8.18.6'; files=@('libvips-8.18.6/LICENSE','libvips-8.18.6/README.md','libvips-8.18.6/libvips/iofuncs/vips.c','libvips-8.18.6/libvips/foreign/libnsgif/COPYING') },
    @{ archive='cairo-1.18.4.tar.xz'; url='https://cairographics.org/releases/cairo-1.18.4.tar.xz'; files=@('cairo-1.18.4/COPYING','cairo-1.18.4/COPYING-LGPL-2.1','cairo-1.18.4/COPYING-MPL-1.1','cairo-1.18.4/AUTHORS','cairo-1.18.4/src/cairo.c') },
    @{ archive='proxy-libintl-0.5.tar.gz'; url='https://codeload.github.com/frida/proxy-libintl/tar.gz/refs/tags/0.5'; files=@('proxy-libintl-0.5/libintl.c') },
    @{ archive='build-win64-mxe-8.18.6.tar.gz'; url='https://codeload.github.com/libvips/build-win64-mxe/tar.gz/refs/tags/v8.18.6'; files=@('build-win64-mxe-8.18.6/build/plugins/proxy-libintl/proxy-libintl.mk','build-win64-mxe-8.18.6/build/patches/cairo-1-fixes.patch') }
)
$extractions = @()
foreach ($item in $archiveItems) {
    $archivePath = Join-Path $cachePath $item.archive
    if (-not (Test-Path -LiteralPath $archivePath)) {
        New-Item -ItemType Directory -Path $cachePath -Force | Out-Null
        Invoke-WebRequest -Uri $item.url -OutFile $archivePath -UseBasicParsing -TimeoutSec 60
    }
    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    & tar -xf $archivePath -C $cachePath @($item.files)
    if ($LASTEXITCODE -ne 0) { throw ('Archive extraction failed: ' + $item.archive) }
    foreach ($file in $item.files) {
        $original = Join-Path $cachePath $file
        $destination = Join-Path $bundleRoot $file
        if ((Get-Item -LiteralPath $original).PSIsContainer) {
            New-Item -ItemType Directory -Path $destination -Force | Out-Null
            Get-ChildItem -LiteralPath $original | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force }
        } elseif ($file -match '\.(c|h)$') {
            $destination = Join-Path (Split-Path -Parent (Join-Path $bundleRoot ($file.Split('/')[0] + '/copyright-headers.txt'))) 'copyright-headers.txt'
            Add-Content -LiteralPath $destination -Value ('Source file: ' + $file + "`n") -Encoding utf8
            Get-Content -LiteralPath $original -TotalCount 55 | Add-Content -LiteralPath $destination -Encoding utf8
            Add-Content -LiteralPath $destination -Value "`n" -Encoding utf8
        } else {
            New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
            Copy-Item -LiteralPath $original -Destination $destination -Force
        }
        $extractions += [pscustomobject]@{source_archive=$item.url; archive_sha256=$archiveHash; archive_member=$file; destination=$destination.Substring($bundleRoot.Length + 1).Replace('\','/')}
    }
}
$licenseText = [System.IO.File]::ReadAllText((Join-Path $bundleRoot 'libheif-1.23.2/COPYING'))
$lgplStart = $licenseText.IndexOf('                   GNU LESSER GENERAL PUBLIC LICENSE')
$gplStart = $licenseText.IndexOf('                    GNU GENERAL PUBLIC LICENSE')
$mitStart = $licenseText.IndexOf('                             MIT License')
if ($lgplStart -lt 0 -or $gplStart -le $lgplStart -or $mitStart -le $gplStart) { throw 'License boundaries were not found in exact upstream libheif COPYING' }
$lgplText = ($licenseText.Substring($lgplStart, $gplStart - $lgplStart) -replace '(?s)\s*-{20,}\s*$', '') + "`n"
$gplText = ($licenseText.Substring($gplStart, $mitStart - $gplStart) -replace '(?s)\s*-{20,}\s*$', '') + "`n"
[System.IO.File]::WriteAllText((Join-Path $bundleRoot 'terms/LGPL-3.0.txt'), $lgplText, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $bundleRoot 'terms/GPL-3.0.txt'), $gplText, [System.Text.UTF8Encoding]::new($false))
$extractions | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $bundleRoot 'archive-manifest.json') -Encoding utf8
Write-Output 'Official exact-version licenses and copyright excerpts extracted.'
