# dsh-notify

一个给 DSH Web UI 的提醒插件：会话执行完毕、工具请求许可、Agent 向你提问——这些「该你上场了」的时刻，人在 DSH 页面里就弹页内 toast，人不在页面就发 Windows 系统通知。通知由主机进程直接发出，浏览器关不关都收得到。

## 它提醒什么

| 情况 | 什么时候触发 | 默认 |
| --- | --- | --- |
| 任务执行完毕 | 会话这一轮跑完，Agent 回到空闲 | 开 |
| 需要权限许可 | 工具发起审批，比如越权执行 | 开 |
| 需要你回答 | Agent 用 `ask_user_question` 提问，或提交计划等你审阅 | 开 |
| 开始执行 | 新一轮开始（通常是你自己发起的） | 关 |

通道是自动选择的：

| 你在哪 | 提醒走哪里 |
| --- | --- |
| DSH 页面可见且聚焦 | 只弹右下角页内 toast，Windows 通知静默 |
| 页面隐藏 / 切到别的应用 / 浏览器关闭 | Windows 原生通知接管 |

两个细节：页内 toast 不会在正盯着当前会话跑完时打扰你（页面上已经能看到结果），切到别的应用、页面隐藏后结束就会弹；Windows 通知在页面活跃时静默，页面一离开就自动恢复。ntfy 不受页面状态影响，按配置单独发送。提问和审批这类会卡住会话的页内弹窗会停留 5 分钟等你处理。

## 怎么工作的

- **Windows 原生通知**：host 进程监听会话事件，用系统自带的 WinRT 通知接口直发，完全不经过浏览器权限——浏览器整个关掉也照样收得到。页面会每隔几秒报告一次「在场」状态，页面可见且聚焦时 Windows 通知自动静默，页面离开后立即恢复。通知以「DSH Notify」这个独立应用身份出现，默认配 DeepSeek 鲸鱼标图标，点击打开 `desktopToast.openUrl` 配置的 DSH 页面；
- **页内 toast**：页面可见且聚焦的时候，右下角同步弹一条，点一下跳到对应会话，右上角 × 可直接关掉。

首次启动会自动在开始菜单注册「DSH Notify」身份（名称、图标、点击行为都在这上面）。之后改了应用名、图标或 `openUrl`，重启 dsh web 就会自动重建。该通道仅 Windows 主机启用：非 Windows 或 PowerShell 不可用时自动跳过（日志会有 `dsh-notify:` 提示），ntfy 与页内 toast 不受影响。

## 安装

```sh
dsh plugin --profile web add github:aburaMSMS/dsh-notify
```

装完**重启 dsh web**。验证：`dsh --profile web --dump-config` 里能看到 `dsh-notify`，设置面板里多出「通知」一项。仓库自带构建产物，不需要本地编译。

- 升级：`dsh plugin --profile web up dsh-notify`，同样重启生效；
- 卸载：`dsh plugin --profile web remove dsh-notify`。顺手删掉开始菜单的 `DSH Notify.lnk` 和 `~/.dsh/settings.yaml` 里的 `dsh-notify:` 段就干净了；
- 不想卸又不想收提醒：设置里把「启用通知」关掉即可，立即生效。

## 配置

常用配置都在设置面板的「通知」页里，改完即时生效，存进 `~/.dsh/settings.yaml`；即使关掉总开关，「通知」页也会保留，方便随时重新打开。`desktopToast.timeoutMs` 和 `desktopToast.appId` 属于高级项，不放在面板里，可在 profile 的配置层写（`cordis.patch.yml`，仓库里带了一份模板）：

| 配置项 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `language` | `zh` | 文案语言：`zh` / `en` |
| `customTitle` | 空 | 自定义通知标题，留空用「任务执行完毕」这类内置标题 |
| `onStart` / `onCompletion` / `onApproval` / `onQuestion` | 关/开/开/开 | 四种场景的开关 |
| `desktopToast.enabled` | `true` | 原生通知总开关（非 Windows 主机自动跳过） |
| `desktopToast.shell` | `powershell` | 用 5.1（WinRT 直发需要）；pwsh 发不了 |
| `desktopToast.timeoutMs` | `10000` | 通知进程超时（毫秒） |
| `desktopToast.appId` | `Dsh.Notify` | 通知身份 ID，一般不用动 |
| `desktopToast.appName` | `DSH Notify` | 通知头部显示的名字 |
| `desktopToast.logoPath` | 空 | 换图标：本地 PNG/ICO 绝对路径，留空用内置鲸鱼标（PNG 替换 toast 内图；ICO 还会替换开始菜单身份图标） |
| `desktopToast.openUrl` | `http://127.0.0.1:3080` | 点通知打开的地址；修改后会自动重建通知身份 |
| `ntfy.enabled` | `false` | ntfy 推送总开关 |
| `ntfy.server` | `https://ntfy.sh` | ntfy 服务器地址（可自建） |
| `ntfy.topic` | 空 | 推送主题；启用时必填，订阅同一主题的设备会收到 |
| `ntfy.token` | 空 | 受保护主题的访问令牌（可选） |
| `ntfy.priority` | `default` | 通知优先级 |
| `ntfy.tags` | `robot` | emoji 标签（逗号分隔）；内置场景标签优先，此值作为无标签消息的兜底 |
| `ntfy.clickUrl` | 空 | 点击 ntfy 通知打开的 URL（可选） |

## 疑难排查

- **非 Windows 主机收不到原生通知是正常的**：该通道需要 Windows 的 WinRT/PowerShell 5.1，其他平台会自动跳过（ntfy 与页内 toast 照常工作）。
- **收不到通知**：先看设置页两个开关；再到 Windows 设置 → 系统 → 通知，确认「DSH Notify」开着、专注助手没拦；最后确认任务真的符合上面四种场景（正盯着的会话跑完是刻意不弹的）。
- **通知还是 PowerShell 的名字**：身份没注册上，删掉开始菜单里的 `DSH Notify.lnk`，重启 dsh web 让它重建。
- **设置页一直加载不出来**：多半是 host 没重启（设置桥接路由要重启才注册）。还不行就 `curl http://127.0.0.1:3080/api/dsh-notify/settings` 看看回什么。
- **日志**：host 侧看 dsh web 的进程输出（`dsh-notify:` 开头）；页面侧按 F12，`[dsh-notify]` 开头的就是本插件的日志。

## 开发

```sh
pnpm install
pnpm verify      # 提交前跑：类型检查 + 全部测试 + 构建
pnpm watch       # 改 client 代码后热重构建，刷新页面生效
```

目录：`src/index.ts` 是 host 半边（事件监听 + 原生通知 + 设置命名空间），`src/desktop.ts` 管 WinRT 直发和身份注册（`assets/dsh-set-aumid.exe` 是写 AUMID 的小工具，源码在 `assets-source/`），`src/client/` 是页面半边（会话监听、toast、设置页）。改完 client 记得把 `lib/` 一起提交——仓库自带产物，安装才不用编译。

要换默认图标，改 `scripts/generate-icon.mjs` 里的 `LOGO_URL` 跑一遍就行。

## 来源与版权

| 包 | 来源 | 版权 |
| --- | --- | --- |
| dsh-notify | 作者 aburaMSMS 个人开发 | BSD-3-Clause（aburaMSMS） |

通知默认图标使用 DeepSeek 官方 logo，商标归 DeepSeek 所有，仅用于本地通知标识，设置里可随时换成自己的图标。安全问题请走仓库 Security 页面的私下报告通道，不要发公开 issue。
