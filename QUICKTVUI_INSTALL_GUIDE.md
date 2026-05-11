# QuickTVUI 快应用安装指南

## 重要说明

QuickTVUI 使用的是 **QuickTVUI Runtime APK**，而不是传统的快应用调试器。

## 安装步骤

### 1. 准备文件

在 `dist` 目录下有两个文件：
- `quicktvui-runtime-debug-v2.9.1524.apk` - QuickTVUI Runtime 调试环境（必须先安装）
- `com.maccms.quicktv.debug.rpk` - 你的快应用包

### 2. 安装 QuickTVUI Runtime（调试版）

**方法一：通过 HTTP 服务器安装**

1. 确保 HTTP 服务器正在运行（端口 8888）
2. 在小米盒子浏览器中访问：
   ```
   http://192.168.10.133:8888/quicktvui-runtime-debug-v2.9.1524.apk
   ```
3. 下载并安装 Runtime APK

**方法二：通过 ADB 安装**

```bash
adb connect 192.168.10.122
adb install -r d:\GitCangku2\quicktv-app-project\dist\quicktvui-runtime-debug-v2.9.1524.apk
```

### 3. 配置 Runtime 调试地址

安装完 Runtime 后，需要配置调试服务器地址：

```bash
adb shell am broadcast -a com.extscreen.runtime.ACTION_CHANGE_DEBUG_SERVER --es ip 192.168.10.133
```

**注意：** 这里的 IP 地址是你的电脑 IP（192.168.10.133），不是盒子 IP。

### 4. 启动开发服务器

在项目目录下运行：

```bash
npm run dev
```

这会启动开发服务器，默认端口是 38989。

### 5. 在盒子上加载快应用

1. 打开小米盒子上的 QuickTVUI Runtime 应用
2. 使用遥控器点击"加载测试代码"按钮
3. Runtime 会自动从你的电脑（192.168.10.133:38989）加载快应用代码
4. 看到应用界面表示成功

### 6. 开发调试

- 修改代码后会自动热更新
- 如果没有自动刷新，检查 ADB 连接状态：
  ```bash
  adb devices
  ```
- 如果设备显示 offline，重新连接：
  ```bash
  adb disconnect
  adb connect 192.168.10.122
  ```

### 7. 查看日志

使用 Chrome 浏览器调试：

1. 打开 Chrome 浏览器
2. 访问 `chrome://inspect/`
3. 勾选 "Discover network targets"
4. 配置添加：`192.168.10.133:38989`
5. 点击 "inspect" 查看日志和调试

## 版本信息

- **QuickTVUI Runtime Debug**: v2.9.1524
- **下载来源**: https://github.com/quicktvui/quicktvui-runtime-apk
- **更新日期**: 2026-03-06

## 与传统快应用调试器的区别

| 特性 | 传统快应用调试器 | QuickTVUI Runtime |
|------|-----------------|-------------------|
| 用途 | 通用快应用调试 | 专为 QuickTVUI 框架设计 |
| 基础框架 | 华为快应用 | Hippy + QuickTVUI |
| 适用场景 | 手机端快应用 | 智能电视/盒子 |
| 遥控器支持 | 有限 | 完整优化 |
| 焦点管理 | 基础 | 深度优化 |

## 参考资源

- QuickTVUI 官网: http://v3.quicktvui.com/
- QuickTVUI GitHub: https://github.com/quicktvui
- HelloTV 示例项目: https://github.com/quicktvui/hellotv
- Runtime APK 仓库: https://github.com/quicktvui/quicktvui-runtime-apk

## 常见问题

### Q: 为什么不能用传统的快应用调试器？

A: QuickTVUI 是基于 Hippy 框架的 TV 快应用开发框架，与传统的华为快应用不同。它需要专门的 QuickTVUI Runtime 来运行。

### Q: Debug 版本和 Release 版本有什么区别？

A: 
- Debug 版本：用于开发调试，支持热更新、日志输出、Chrome 调试
- Release 版本：用于正式发布，性能更好但不支持调试功能

### Q: 如何打包成独立的 APK？

A: 运行以下命令：
```bash
npm run build-apk-debug    # 生成 debug APK
npm run build-apk-release  # 生成 release APK
```

APK 文件会生成在 `./android/app/build/outputs/apk/` 目录下。

## 网络配置

- 电脑 IP: 192.168.10.133
- 小米盒子 IP: 192.168.10.122
- MacCMS API: http://192.168.10.133:8080/api.php/provide/vod
- 开发服务器: http://192.168.10.133:38989
- HTTP 文件服务器: http://192.168.10.133:8888
