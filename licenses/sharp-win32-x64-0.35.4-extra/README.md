# sharp Windows x64 原生依赖许可补充材料

对象：本项目安装的 `@img/sharp-win32-x64` 0.35.4；本地 `versions.json` 中的 libvips 为 8.18.6。

本目录是从匹配版本官方源码收集的静态许可材料，供随便携包一起分发和进一步核对。它不是完整法律合规认证，也不是完整的 DLL 对应源码包。源码获取链接、构建项目和获取脚本已列出；构建补丁、静态合并的其他组件、Rust crates、实际二进制对应源码及可重新链接性仍需结合具体分发方式核对。

## 包清单与上游许可的区别

`installed-package-README.md` 是本机包原件，列出此二进制包选择使用的许可；`installed-versions.json` 是本机组件版本原件。`build-win64-mxe-8.18.6/README.md` 来自官方构建项目 v8.18.6 标签，其 web 依赖版本与本机清单一致。

包清单写 LGPLv3 的 8 个组件不应直接概括为应用整体采用 GPL。LGPLv3 全文纳入了 GPLv3 的条款，因此本目录同时附 `terms/LGPL-3.0.txt` 和 `terms/GPL-3.0.txt`。上游较早版本许可的“或任何后续版本”授权与包所选择的许可应分别保留；libheif 1.23.2 的源码本身已经声明 LGPLv3 或后续版本。

| 组件和匹配版本 | 包清单选择 | 此处保留的上游依据 | 官方匹配源码获取地址 |
|---|---|---|---|
| FriBidi 1.0.16 | LGPLv3 | `COPYING`、`AUTHORS`、`README`；`lib/fribidi.c` 头声明 LGPL2.1 或后续版本 | https://github.com/fribidi/fribidi/archive/refs/tags/v1.0.16.tar.gz |
| GLib 2.89.4 | LGPLv3 | `COPYING`、全部 `LICENSES/`、`.reuse/dep5`、`README.md`；`glib/glib.h` 含 SPDX `LGPL-2.1-or-later` | https://download.gnome.org/sources/glib/2.89/glib-2.89.4.tar.xz |
| libexif 0.6.26 | LGPLv3 | `COPYING`、`AUTHORS`；`libexif/exif-data.c` 含 SPDX `LGPL-2.0-or-later` | https://github.com/libexif/libexif/archive/refs/tags/v0.6.26.tar.gz |
| libheif 1.23.2 | LGPLv3 | 原始 `COPYING` 含 LGPL3、GPL3 和样例/包装器 MIT 文本；`heif.h` 声明 LGPL3 或后续版本 | https://github.com/strukturag/libheif/archive/refs/tags/v1.23.2.tar.gz |
| librsvg 2.62.91 | LGPLv3 | `COPYING.LIB`、`AUTHORS`、`README.md`、`Cargo.toml`；`include/librsvg/rsvg.h` 声明 LGPL2.1 或后续版本 | https://download.gnome.org/sources/librsvg/2.62/librsvg-2.62.91.tar.xz |
| libvips 8.18.6 | LGPLv3 | `LICENSE`、`README.md`、libnsgif `COPYING`、库源文件版权行索引；`vips.c` 声明 LGPL2 或后续版本 | https://github.com/libvips/libvips/archive/refs/tags/v8.18.6.tar.gz |
| Pango 1.58.2 | LGPLv3 | `COPYING`、`README.md`；`pango-context.c` 声明 GNU Library GPL2 或后续版本 | https://download.gnome.org/sources/pango/1.58/pango-1.58.2.tar.xz |
| proxy-libintl 0.5 | LGPLv3 | `COPYING`、`README.md`、构建配方；`libintl.c` 声明 GNU Library GPL2 或后续版本 | https://github.com/frida/proxy-libintl/archive/refs/tags/0.5.tar.gz |
| cairo 1.18.4 | MPL2.0 | 原始 `COPYING`、`COPYING-MPL-1.1`、`COPYING-LGPL-2.1`、`AUTHORS`；另附官方 MPL2.0 全文 | https://cairographics.org/releases/cairo-1.18.4.tar.xz |

表中的 SPDX 字符串仅在对应上游文件确实出现时注明；GNU Library GPL2 是较早的 LGPL 名称。所列头部是版权/授权的代表性摘录，不是每个组件全部版权持有人的穷尽清单；原始 AUTHORS、REUSE 资料和完整匹配源码可继续核对。

cairo 1.18.4 的原始 `COPYING` 明确写实现库可使用 LGPL2.1 或 MPL1.1；它未直接写 MPL2.0。包 README 和官方 Windows 构建版本表选择 MPL2.0。MPL1.1 第 6.2 节包含后续版本选项；此处同时保留原始双许可文本和 [Mozilla 官方 MPL2.0 全文](https://www.mozilla.org/media/MPL/2.0/index.txt)，避免将包选择与原始源码文字混为同一份声明。cairo 的 test/util/perf 目录另有许可，但原始 COPYING 说明这些辅助目录不构成 cairo 实现库。

## 来源和获取方式

`download-manifest.json` 记录逐文件官方 raw 下载地址、结果和成功文件 SHA256；`archive-manifest.json` 记录官方源码档案 URL、档案 SHA256 和所取成员；`file-sha256.json` 记录最终分发材料的 SHA256。`copyright-headers.txt` 是对应源文件开头摘录；libvips `copyright-lines.txt` 是匹配源码中库目录的版权和作者行索引，保留源文件名与行号。

GNU 官网的两个 `.txt` 下载在本环境遇到 TLS 失败。两个全文改从官方 libheif v1.23.2 原始 `COPYING` 中按标题分离（只移除章节之间的分隔线），原件与 SHA256 均保留。GNOME GitLab raw 在本环境返回 HTTP406，三个组件改从官方 `download.gnome.org` 匹配版本源码档案提取成功。这些获取失败不会留下缺失的 LGPL3/GPL3/MPL2 全文。

复核获取可以使用本目录的 `collect-upstream.ps1` 和 `extract-upstream.ps1`，或直接下载上表的官方源码档案并读取相应成员。脚本会将源码档案放入 `acquisition-cache`，该缓存不属于本次随包分发的静态材料；下载结果仍受上游网络可访问性影响。八个 LGPL 组件的原始 COPYING/LICENSE 及 cairo 原始 COPYING 已取得；其他 MIT/BSD 等 DLL 组件的全部额外 notice 不在本目录本次补充范围内，仍以原安装包通知和其他随包许可目录为基础继续核对。

与该预编译库的构建路径相关的官方项目：

- https://github.com/libvips/build-win64-mxe/tree/v8.18.6 （Windows libvips 与依赖构建；包含配方及补丁）
- https://github.com/lovell/sharp-libvips （sharp 使用的预编译 libvips 包装项目；Windows 输出取自 build-win64-mxe）
- https://github.com/lovell/sharp/tree/v0.35.4 （sharp 原生绑定与 JavaScript 包源码）

以上是源码位置与可获取的方法，不替代结合实际 DLL、补丁和构建参数准备完整 Corresponding Source 所需的验证。
