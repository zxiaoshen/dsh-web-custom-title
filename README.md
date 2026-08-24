# dsh-web-custom-title

DSH Web 客户端插件：**自定义新页面（无会话 Hero 区）的大标题与圆形图标**。

- 把大标题 **“探索未至之境”**（英文环境 *Into the Unknown*）改成你输入的文字，**双击标题即可改名**，文字保持元素自身的**原始字体样式**（皮肤默认标题颜色，即“初版”观感）；
- 把标题上方的鲸鱼/鱼类品牌标记换成**圆形照片图标**（默认 `1.png`，48px），**双击图标弹出系统文件选择窗口**，选中的照片自动居中裁剪成圆形并持久保存。

适用于 DeepSeek Harness 的 `dsh web` 图形界面。纯浏览器端插件，不依赖 React / slot 服务，卸载不留残留。

---

## 功能

| 功能 | 说明 |
| --- | --- |
| ✏️ 双击标题改名 | 双击大标题进入编辑，Enter / 失焦保存，Esc 取消；结果存入浏览器 `localStorage`，刷新/重启后仍生效 |
| 🎨 保持原始字体样式 | 只替换标题文本，不附加颜色/渐变覆盖，文字始终以皮肤自己的默认标题样式渲染（“初版”观感） |
| 🖼️ 自定义圆形图标 | 默认 `1.png` 圆形裁剪（48px）；**双击图标弹出系统文件选择窗口**，选中的照片自动居中裁剪为圆形（192×192 PNG）并持久保存，刷新/重启后仍是你选的照片 |
| ⚙️ 声明式标题（可选） | 在 roster 行 `config.title` 配置固定标题，作为无 localStorage 覆盖时的默认值 |
| 🧹 卸载干净 | 所有 DOM/CSS 写入都在 `ctx.effect` 清理函数中恢复；图标逻辑与改名逻辑互相隔离，任一出错不影响另一个 |

## 下载 / 安装

### 方式 A：dsh 命令（推荐）

```bash
# 在你的 dsh 环境（如 web profile）下：
dsh plugin --profile web add https://github.com/zxiaoshen/dsh-web-custom-title
```

若该命令只安装了依赖、未自动加入 bundles 列表，请手动补上（见方式 B 第 1 步的 `dsh.profile.bundles`），然后执行 `pnpm install`。

### 方式 B：手动接入（与 `dsh-whale-widget`、maid-atelier 皮肤同款方式）

1. 在 web profile 的 `package.json`（例如 `C:\Users\qy197\.dsh\profiles\web\package.json`）中：

```jsonc
{
  "dependencies": {
    "dsh-web-custom-title": "github:zxiaoshen/dsh-web-custom-title"
  },
  "dsh": {
    "profile": {
      "bundles": [
        // ... 已有 bundles ...
        "dsh-web-custom-title"
      ]
    }
  }
}
```

2. 在该 profile 目录执行：

```bash
pnpm install
```

3. **重启 `dsh web` 服务**后生效（新增 roster 行只在服务启动时扫描）。

## 使用

1. 打开一个「新页面」（无会话状态，能看到“探索未至之境”大标题）。
2. **双击标题** → 输入你的文字 → Enter 保存；标题立即以原始字体样式显示。
3. **双击标题上方的圆形图标** → 弹出系统文件选择窗口 → 选择一张照片（建议 JPG / PNG / WebP 等浏览器可解码格式）→ 图标立即变为该照片的圆形裁剪并持久保存。

### 恢复默认

- 恢复默认标题：进入编辑后清空文字再保存。
- 恢复默认图标：在浏览器控制台执行 `localStorage.removeItem('dsh.web-custom-title.mark')` 后刷新页面。

## 配置（可选）

在 `cordis.patch.yml` 的 roster 行中取消注释：

```yaml
- insert:
    - id: web-custom-title
      name: 'dsh-web-custom-title'
      config:
        title: '我的深海航程'
```

## 数据存储

- 自定义标题：`localStorage['dsh.web-custom-title.custom']`
- 自定义图标：`localStorage['dsh.web-custom-title.mark']`（data URL）
- 旧版 `dsh-hero-title` 的数据会在首次加载时自动迁移到新键。

## 开发者构建

`lib/client.js` 是构建产物（内嵌默认图标的 base64），发布包已包含，可直接使用。修改源码后重建：

```bash
node build-client.mjs   # 读取 src/client.js + assets/hero-mark.png → 生成 lib/client.js
```

- 图标显示大小：`src/client.js` 中 `BRAND_MARK_SIZE`（默认 48px）
- 存储图标分辨率：`MARK_CANVAS_SIZE`（默认 192px）

## 兼容性

- 纯浏览器端（`dsh.client` `platform: web`），宿主侧 `lib/index.js` 为空实现。
- 通过 `MutationObserver` 跟踪 Hero 区挂载/重渲染（含中英文切换）；品牌图标为纯 DOM 注入（`span[class*='fishHitbox']` 容器内替换内容）。
- 图标放大到 48px 时，插件自有的样式表规则会把 Hero 标题行网格首列（官方固定 34px）同步加宽，布局保持整洁。
- 明暗主题、皮肤切换不影响；插件卸载后所有改动自动还原。

## License

MIT
