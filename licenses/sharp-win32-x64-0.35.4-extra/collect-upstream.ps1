$ErrorActionPreference = 'Stop'
$bundleRoot = $PSScriptRoot
$items = @(
    @('terms/LGPL-3.0.txt', 'https://www.gnu.org/licenses/lgpl-3.0.txt'),
    @('terms/GPL-3.0.txt', 'https://www.gnu.org/licenses/gpl-3.0.txt'),
    @('terms/MPL-2.0.txt', 'https://www.mozilla.org/media/MPL/2.0/index.txt'),
    @('fribidi-1.0.16/COPYING', 'https://raw.githubusercontent.com/fribidi/fribidi/v1.0.16/COPYING'),
    @('fribidi-1.0.16/AUTHORS', 'https://raw.githubusercontent.com/fribidi/fribidi/v1.0.16/AUTHORS'),
    @('fribidi-1.0.16/README', 'https://raw.githubusercontent.com/fribidi/fribidi/v1.0.16/README'),
    @('libexif-0.6.26/COPYING', 'https://raw.githubusercontent.com/libexif/libexif/v0.6.26/COPYING'),
    @('libexif-0.6.26/AUTHORS', 'https://raw.githubusercontent.com/libexif/libexif/v0.6.26/AUTHORS'),
    @('libheif-1.23.2/COPYING', 'https://raw.githubusercontent.com/strukturag/libheif/v1.23.2/COPYING'),
    @('libheif-1.23.2/README.md', 'https://raw.githubusercontent.com/strukturag/libheif/v1.23.2/README.md'),
    @('libvips-8.18.6/COPYING', 'https://raw.githubusercontent.com/libvips/libvips/v8.18.6/COPYING'),
    @('libvips-8.18.6/AUTHORS', 'https://raw.githubusercontent.com/libvips/libvips/v8.18.6/AUTHORS'),
    @('libvips-8.18.6/README.md', 'https://raw.githubusercontent.com/libvips/libvips/v8.18.6/README.md'),
    @('proxy-libintl-0.5/COPYING', 'https://raw.githubusercontent.com/frida/proxy-libintl/0.5/COPYING'),
    @('proxy-libintl-0.5/README.md', 'https://raw.githubusercontent.com/frida/proxy-libintl/0.5/README.md'),
    @('glib-2.89.4/LGPL-2.1-or-later.txt', 'https://gitlab.gnome.org/GNOME/glib/-/raw/2.89.4/LICENSES/LGPL-2.1-or-later.txt'),
    @('glib-2.89.4/README.md', 'https://gitlab.gnome.org/GNOME/glib/-/raw/2.89.4/README.md'),
    @('pango-1.58.2/COPYING', 'https://gitlab.gnome.org/GNOME/pango/-/raw/1.58.2/COPYING'),
    @('pango-1.58.2/AUTHORS', 'https://gitlab.gnome.org/GNOME/pango/-/raw/1.58.2/AUTHORS'),
    @('librsvg-2.62.91/COPYING.LIB', 'https://gitlab.gnome.org/GNOME/librsvg/-/raw/2.62.91/COPYING.LIB'),
    @('librsvg-2.62.91/COPYING', 'https://gitlab.gnome.org/GNOME/librsvg/-/raw/2.62.91/COPYING'),
    @('librsvg-2.62.91/AUTHORS', 'https://gitlab.gnome.org/GNOME/librsvg/-/raw/2.62.91/AUTHORS'),
    @('build-win64-mxe-8.18.6/README.md', 'https://raw.githubusercontent.com/libvips/build-win64-mxe/v8.18.6/README.md')
)
$downloads = @()
foreach ($item in $items) {
    $destination = Join-Path $bundleRoot $item[0]
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    try {
        Invoke-WebRequest -Uri $item[1] -OutFile $destination -UseBasicParsing -TimeoutSec 15
        $downloads += [pscustomobject]@{ file = $item[0]; url = $item[1]; status = 'downloaded'; sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() }
        Write-Output ('OK ' + $item[0])
    } catch {
        $downloads += [pscustomobject]@{ file = $item[0]; url = $item[1]; status = 'failed'; error = $_.Exception.Message }
        Write-Output ('FAILED ' + $item[0] + ': ' + $_.Exception.Message)
    }
}
$downloads | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $bundleRoot 'download-manifest.json') -Encoding utf8
Copy-Item -LiteralPath 'E:\Guitar\node_modules\@img\sharp-win32-x64\versions.json' -Destination (Join-Path $bundleRoot 'installed-versions.json')
Copy-Item -LiteralPath 'E:\Guitar\node_modules\@img\sharp-win32-x64\README.md' -Destination (Join-Path $bundleRoot 'installed-package-README.md')
