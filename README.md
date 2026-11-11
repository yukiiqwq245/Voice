# Pitchee Web（非官方网页版）

基于 Pitchee Android 1.2.1 的本机网页版练习工具。原始项目和模型为 GPL-3.0-only，源码和许可证随包保留。

## 在 Windows 启动

1. 在 Windows 10/11 x64 上确认已经安装 Python 3，并把它加入 PATH。
2. 双击 `start.bat`，浏览器会打开 `http://127.0.0.1:8765/`。如未自动打开，请手动访问该地址。
3. 使用实时音高、频谱或录音时，按浏览器提示允许麦克风访问。关闭命令窗口即可退出。

若本地分析提示缺少 `VCRUNTIME140.dll` 或 `MSVCP140.dll`，请安装 Microsoft 官方的 Visual C++ 2015–2022 x64 运行库。建议使用新版 Chrome 或 Edge。

浏览器的音高估计采用网页实现的 YIN 风格算法，不等同于 Android 中的 SwiftF0；频谱使用浏览器 Web Audio API。练习记录和用户选择保存的录音存放在当前浏览器的 IndexedDB 中，清理浏览器网站数据会删除记录。应用只监听本机，录音不会自动上传互联网；运行原版模型时会在本机临时目录建立 WAV 文件，并在分析结束时删除。

## 当前范围

- 已实现：麦克风实时音高与轨迹、实时频谱、录音与回放、导入音频、参考音键盘、本地记录、历史趋势和练习日历。
- 音频分析：随附针对 Windows x64 编译的 PitcheeCore 和原项目的 ncnn 模型，可计算 SwiftF0 平均音高、音色分、自然度和女性化或男性化方向的综合分。声音健康分可单独运行。运行时无需另外安装 ncnn 或下载模型。
- 模型流程已使用电脑生成的合成语音和静音样本进行功能验证；尚未进行真实麦克风录音测试或与 Android 版逐项对比。综合分和声音健康分是模型估计，不是诊断或身份判断。
- 当前未实现 Android 版全部细节，例如原版知识库的自动推荐和原 App 数据导入。网页中的小贴士为简短说明，不是原版文章集。

模型分数仅是参考，不能判断身份、发声方式或嗓音健康。浏览器估计的音高可能受背景噪声、倍频和录音条件影响。

## 重新编译原版推理核心（开发说明）

安装包已经包含编译后的 Windows 运行文件，一般无需执行以下步骤。重新编译需要 Windows 版 ncnn 和 Visual Studio C++ 环境。

1. 下载与原项目中 Android ncnn 头文件版本一致的 [ncnn 20260526 Windows VS2022 shared 官方发行包](https://github.com/Tencent/ncnn/releases/download/20260526/ncnn-20260526-windows-vs2022-shared.zip)。
2. 解压后找到含 `include/ncnn/net.h` 和 `lib/ncnn.lib` 的 `x64` 目录。
3. 安装 Visual Studio 2022 的 C++ 桌面开发组件与 CMake，在 PowerShell 中执行：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\engine\build-engine.ps1 -NcnnRoot "解压后x64目录的完整路径"
   ```

4. 重启网页程序，页面将使用编译好的核心分析；若分析失败，请保留错误信息以便排查。

## 致谢

- [Project-Pitchee/Pitchee-Android](https://github.com/Project-Pitchee/Pitchee-Android)
- [Project-Pitchee/Pitchee-core](https://github.com/Project-Pitchee/Pitchee-core)
- [Tencent/ncnn](https://github.com/Tencent/ncnn)

此项目并非 Pitchee 官方发布。详见 `LICENSE`、`THIRD_PARTY_NCNN_LICENSE.txt` 和 `core/models/SWIFT_F0_LICENSE`。
