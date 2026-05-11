# 快应用部署与联动测试指南

## 📋 前置准备

### 1. 确认环境信息
- **电视盒子 IP**: `192.168.10.122`
- **MacCMS 后台地址**: `http://localhost:8080/admin.php`
- **MacCMS API 地址**: `http://192.168.10.XXX:8080/api/` (需要使用您电脑的局域网 IP)
- **管理员账号**: `admin` / `admin123`

### 2. 获取您电脑的局域网 IP
在 PowerShell 中运行：
```powershell
ipconfig | Select-String "IPv4"
```
找到类似 `192.168.10.XXX` 的地址（与盒子在同一网段）

---

## 🚀 第一步：启动 MacCMS 后台

### 1. 确认 Docker 容器运行状态
```powershell
docker ps
```

应该看到两个容器正在运行：
- `quicktv-maccms` (端口 8080)
- `quicktv-mysql` (端口 3306)

### 2. 如果容器未运行，启动它们
```powershell
docker-compose up -d
```

### 3. 访问后台管理界面
在浏览器中打开：`http://localhost:8080/admin.php`

**登录信息**：
- 用户名：`admin`
- 密码：`admin123`

---

## 📱 第二步：连接电视盒子

### 方法一：通过 ADB 网络连接（推荐）

#### 1. 确保盒子开启 ADB 调试
在盒子设置中：
- 进入"开发者选项"或"系统设置"
- 开启"USB 调试"
- 开启"网络 ADB 调试"（如果有）

#### 2. 连接盒子
```powershell
adb connect 192.168.10.122:5555
```

如果端口不是 5555，可能是：
- `5555` (默认)
- `5037`
- `6666`

#### 3. 验证连接
```powershell
adb devices
```

应该显示：
```
List of devices attached
192.168.10.122:5555    device
```

### 方法二：通过 USB 连接

1. 用 USB 线连接盒子和电脑
2. 在盒子上允许 USB 调试授权
3. 运行 `adb devices` 验证连接

---

## 🔧 第三步：配置快应用 API 地址

### 1. 修改 API 配置文件

打开 `src/config/testSources.js`，找到 API 配置部分，将 `localhost` 改为您电脑的局域网 IP：

```javascript
const API_BASE_URL = 'http://192.168.10.XXX:8080';
```

**重要**：必须使用您电脑的局域网 IP，因为盒子无法访问 `localhost`

### 2. 或者在快应用中动态配置

快应用启动后，在"管理"页面可以手动输入 API 地址。

---

## 📦 第四步：构建并安装快应用

### 1. 构建快应用包
```powershell
npm run build
```

或使用 release 模式：
```powershell
npm run release
```

构建完成后，RPK 包位于：`dist/com.maccms.quicktv.rpk`

### 2. 安装到盒子
```powershell
adb install -r dist/com.maccms.quicktv.rpk
```

参数说明：
- `-r`: 覆盖安装（如果已安装旧版本）

### 3. 查看安装日志
如果安装失败，查看详细日志：
```powershell
adb logcat | Select-String "quicktv"
```

---

## 🧪 第五步：联动测试

### 测试 1：后台登录测试

#### 在浏览器中测试
1. 打开 `http://localhost:8080/admin.php`
2. 登录：`admin` / `admin123`
3. 查看后台首页，确认能看到：
   - 视频统计
   - 分类管理
   - 系统设置

#### 在快应用中测试
1. 在盒子上打开"MacCMS影视"应用
2. 进入"管理"页面
3. 输入 API 地址：`http://192.168.10.XXX:8080`
4. 输入账号：`admin` / `admin123`
5. 点击"登录"
6. 查看是否显示管理界面

### 测试 2：API 接口测试

#### 测试视频列表接口
在浏览器或 Postman 中访问：
```
http://localhost:8080/api/videos
```

应该返回 JSON 格式的视频列表。

#### 测试分类接口
```
http://localhost:8080/api/categories
```

#### 测试统计接口
```
http://localhost:8080/api/stats
```

### 测试 3：快应用功能测试

#### 3.1 首页测试
- 打开应用，查看首页是否正常显示
- 检查视频列表是否加载
- 测试视频分类切换

#### 3.2 视频播放测试
- 点击任意视频
- 查看视频详情页
- 测试播放功能
- 测试播放控制（暂停、快进、音量）

#### 3.3 直播功能测试
- 进入"直播"页面
- 查看直播频道列表
- 测试直播播放

#### 3.4 管理功能测试
- 进入"管理"页面
- 测试登录功能
- 查看统计数据
- 测试视频管理功能

---

## 🐛 常见问题排查

### 问题 1：ADB 连接失败

**症状**：`adb connect` 提示连接失败

**解决方案**：
1. 确认盒子和电脑在同一局域网
2. 检查盒子是否开启 ADB 调试
3. 尝试不同的端口：5555、5037、6666
4. 重启 ADB 服务：
   ```powershell
   adb kill-server
   adb start-server
   ```

### 问题 2：快应用无法连接 API

**症状**：应用显示"网络错误"或"连接失败"

**解决方案**：
1. 确认使用的是电脑的局域网 IP，不是 `localhost`
2. 检查防火墙是否阻止了 8080 端口
3. 在盒子浏览器中测试 API 地址是否可访问
4. 查看 Docker 容器日志：
   ```powershell
   docker logs quicktv-maccms
   ```

### 问题 3：安装 RPK 失败

**症状**：`adb install` 报错

**解决方案**：
1. 检查盒子存储空间是否充足
2. 卸载旧版本后重新安装：
   ```powershell
   adb uninstall com.maccms.quicktv
   adb install dist/com.maccms.quicktv.rpk
   ```
3. 检查 RPK 包是否完整（重新构建）

### 问题 4：视频无法播放

**症状**：点击视频后无法播放

**解决方案**：
1. 检查视频源地址是否有效
2. 查看快应用日志：
   ```powershell
   adb logcat | Select-String "video"
   ```
3. 在后台检查视频数据是否正确

### 问题 5：后台无法访问

**症状**：浏览器打开 `http://localhost:8080/admin.php` 失败

**解决方案**：
1. 检查 Docker 容器状态：`docker ps`
2. 查看容器日志：`docker logs quicktv-maccms`
3. 重启容器：`docker-compose restart`
4. 检查端口占用：`netstat -ano | findstr :8080`

---

## 📊 测试检查清单

### 后台功能
- [ ] 能够访问后台登录页面
- [ ] 能够成功登录
- [ ] 能够查看视频列表
- [ ] 能够添加/编辑/删除视频
- [ ] 能够管理分类
- [ ] 能够查看统计数据

### API 接口
- [ ] `/api/videos` 返回视频列表
- [ ] `/api/videos/{id}` 返回视频详情
- [ ] `/api/categories` 返回分类列表
- [ ] `/api/stats` 返回统计数据
- [ ] `/api/admin/login` 登录接口正常

### 快应用功能
- [ ] 应用能够正常启动
- [ ] 首页显示视频列表
- [ ] 能够进入视频详情页
- [ ] 视频能够正常播放
- [ ] 直播功能正常
- [ ] 管理页面能够登录
- [ ] 能够查看和管理数据

---

## 🔍 调试技巧

### 查看快应用日志
```powershell
adb logcat | Select-String "quicktv"
```

### 查看 Docker 日志
```powershell
docker logs -f quicktv-maccms
docker logs -f quicktv-mysql
```

### 进入容器调试
```powershell
docker exec -it quicktv-maccms bash
```

### 测试 API 连通性
在盒子上使用浏览器访问：
```
http://192.168.10.XXX:8080/api/videos
```

### 查看数据库数据
```powershell
docker exec -it quicktv-mysql mysql -uroot -proot maccms10
```

然后执行 SQL：
```sql
SELECT * FROM mac_admin;
SELECT * FROM mac_vod LIMIT 10;
SELECT * FROM mac_type;
```

---

## 📝 下一步操作

完成上述测试后，您可以：

1. **添加视频内容**
   - 在后台添加视频分类
   - 导入或手动添加视频数据
   - 配置视频播放源

2. **配置直播源**
   - 在后台添加直播频道
   - 配置直播源地址
   - 测试直播播放

3. **优化应用**
   - 调整界面样式
   - 优化加载速度
   - 添加更多功能

4. **部署到生产环境**
   - 配置正式域名
   - 优化数据库性能
   - 配置 CDN 加速

---

## 💡 提示

- 确保电脑和盒子在同一局域网内
- 使用局域网 IP 而不是 localhost
- 保持 Docker 容器运行状态
- 定期查看日志排查问题
- 测试前先在浏览器验证 API 接口

如有问题，请查看日志文件或联系技术支持。
