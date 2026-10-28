# 语墨 · 小学语文出题与批改台

给小学语文老师用的出题、批改、学情归档工具。三端共用一套逻辑：网页、安卓 APK、Windows 桌面程序。

AI 接口自己配（OpenAI 兼容协议），密钥只存本机。

## 能做什么

**按想法出题**
- 阅读理解：1–3 篇，文体按篇数联动（N 篇须恰好选 N 种），每篇 2/3/4 题
- 题型可选填空、简答、选择、判断，默认不出选择题
- 基础训练：字词句段 8 类题型配比，5/7/10 题
- 试卷题目区不带答案，答案统一排在卷末；导出时可选含答案或纯练习卷

**图文批改**
- 拍照、拖图、粘贴文字都可以
- 逐题给对错、错因、订正提示，附能力得分率
- 针对薄弱点自动生成配套加练，可单独导出

**学情归档**
- 每位学生一张卡片，含成绩走势与累计错题
- 高频薄弱点自动统计，可一键生成专项巩固卷
- 支持导出/导入 JSON 备份

## 界面

- **网页 / 手机**：竖屏布局，底部导航，适合单手操作
- **Windows 桌面**：左侧竖向导航、顶部工具栏、宽屏双栏内容区，不是手机界面放大
- **安卓**：原生 WebView 外壳，全屏无外框

## 目录结构

```
.
├── index.html              网页版入口
├── assets/
│   ├── styles.css          样式（含手机端适配）
│   ├── config.js           接口层：提示词模板、请求、JSON 解析
│   ├── app.js              首页、出题、试卷渲染与导出
│   ├── grade.js            上传与批改
│   ├── students.js         学生档案、设置、备份
│   ├── mobile.js           手机端适配
│   └── events.js           事件代理（兼容严格 CSP）
├── desktop/                Windows 桌面版
│   ├── main.js             主进程：窗口、菜单、文件对话框、打印
│   ├── preload.js          白名单原生能力
│   └── app/                桌面界面（独立布局）
│       ├── index.html
│       └── assets/desk.css 桌面样式
└── android/                安卓工程
    └── app/src/main/
        ├── java/com/yuwen/lab/MainActivity.java
        └── AndroidManifest.xml
```

## 运行

**网页版**：直接用浏览器打开 `index.html`。若接口报跨域，起个本地服务：

```bash
python -m http.server 8000
```

**桌面版**：

```bash
cd desktop
npm install
npm start
```

**安卓版**：用 Android Studio 打开 `android/` 构建，或按 `安卓版安装说明.md` 里的命令行流程打包。

## 接口

设置页填写，默认走 `{Base URL}/chat/completions`：

| 服务商 | Base URL | 建议模型 |
|---|---|---|
| 阿里云百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-vl-max` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| 月之暗面 | `https://api.moonshot.cn/v1` | `moonshot-v1-8k-vision-preview` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4v-plus` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |

图片批改必须选支持视觉输入的模型。

## 设计取舍

- 未配置接口时，出题与批改会被直接阻止并提示，不产出任何占位内容
- 模型没按题型要求出题（例如没勾选择题却返回了选择题）会被剔除并重排序号
- 接口失败统一转成可读文案：剥离网关 HTML 错误页，按状态码给排查方向，超时说明等待秒数
- 页面不使用内联事件，统一走事件代理，便于开启严格 CSP

## 数据

学生档案、错题、试卷、密钥都存在本机。桌面版存在 `%APPDATA%/语墨`，安卓存在应用私有目录，网页版存在 localStorage。卸载应用会清空数据，建议定期导出备份。

## 许可

MIT
