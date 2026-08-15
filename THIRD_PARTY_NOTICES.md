# 第三方声明

本扩展没有运行时远程依赖。以下代码或实现思路均来自公开的 MIT 许可项目。

## BiliReveal

- 仓库：https://github.com/maxchang3/BiliReveal
- 调研版本：`771fdbfd2923ee8ccd6fbe39dcf7a6751cdbddbe`
- 用途：参考 Lit、Vue 与旧版评论组件的属地渲染策略。
- Copyright (c) 2023-present MaxChang3
- License: MIT

## BiliScope

- 仓库：https://github.com/gaogaotiantian/biliscope
- 调研版本：`698db29fc2e6bfd69b9a9481a1e3f7aebd1b5916`
- 用途：参考当前 Lit Shadow DOM 中 `reply_control.location` 的读取路径；`lib/md5.js` 经该仓库定位到上游 blueimp 实现。
- Copyright (c) 2023-2025 Tian Gao
- License: MIT

## BewlyBewly

- 仓库：https://github.com/BewlyBewly/BewlyBewly
- 调研版本：`d42143547bf4e9cc6864f227fcbcbd396bbff25b`
- 用途：参考由用户主动扫码取得并仅在本地保存 B 站 App `access_token` 的流程。
- Copyright (c) 2021 Hakadao
- License: MIT

## qrcode-generator

- 仓库：https://github.com/kazuhikoarase/qrcode-generator
- 调研版本：`83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8`
- 文件：`lib/qrcode.js`
- Copyright (c) 2009 Kazuhiko Arase
- License: MIT

## JavaScript-MD5（blueimp）

- 仓库：https://github.com/blueimp/JavaScript-MD5
- 文件：`lib/md5.js`（由 BiliScope vendored 副本追溯）
- Copyright © 2011 Sebastian Tschan, https://blueimp.net
- License: MIT

## MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
