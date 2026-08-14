# dsh-notify

一个给 DSH Web UI 的提醒插件：会话执行完毕、工具请求许可、Agent 向你提问——这些「该你上场了」的时刻，用一条 Windows 系统通知把你叫回来。通知由主机进程直接发出，浏览器关不关、人在不在页面，都能收到。

## 它提醒什么

| 情况 | 什么时候触发 | 默认 |
| --- | --- | --- |
| 任务执行完毕 | 会话这一轮跑完，Agent 回到空闲 | 开 |
| 需要权限许可 | 工具发起审批，比如越权执行 | 开 |
| 需要你回答 | Agent 用 `ask_user_question` 提问，或提交计划等你审阅 | 开 |
| 开始执行 | 新一轮开始（通常是你自己发起的） | 关 |

两个细节：正盯着看的那条会话跑完时不会打扰你（页面上已经能看到了），但切到别的应用之后结束就一定会弹；提问和审批这类会卡住会话的提醒，弹窗会停留 5 分钟等你处理。

## 怎么工作的

- **Windows 原生通知**：host 进程监听会话事件，用系统自带的 WinRT 通知接口直发，完全不经过浏览器权限——浏览器整个关掉也照样收得到。通知以「DSH Notify」这个独立应用身份出现，默认配 DeepSeek 鲸鱼标图标，点击直接打开对应会话的页面；
- **页内 toast**：页面开着的时候，右下角同步弹一条，点一下跳到对应会话。

首次启动会自动在开始菜单注册「DSH Notify」身份（名称、图标、点击行为都在这上面）。之后改了应用名或图标，重启 dsh web 就会自动重建。

## 安装

```sh
dsh plugin --profile web add github:aburaMSMS/dsh-notify
```

装完**重启 dsh web**。验证：`dsh --profile web --dump-config` 里能看到 `dsh-notify`，设置面板里多出「通知」一项。仓库自带构建产物，不需要本地编译。

- 升级：`dsh plugin --profile web up dsh-notify`，同样重启生效；
- 卸载：`dsh plugin --profile web remove dsh-notify`。顺手删掉开始菜单的 `DSH Notify.lnk` 和 `~/.dsh/settings.yaml` 里的 `dsh-notify:` 段就干净了；
- 不想卸又不想收提醒：设置里把「启用通知」关掉即可，立即生效。

## 配置

全部配置都在设置面板的「通知」页里，改完即时生效，存进 `~/.dsh/settings.yaml`。也可以在 profile 的配置层写默认值（`cordis.patch.yml`，仓库里带了一份模板）：

| 配置项 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `language` | `zh` | 文案语言：`zh` / `en` |
| `customTitle` | 空 | 自定义通知标题，留空用「任务执行完毕」这类内置标题 |
| `onStart` / `onCompletion` / `onApproval` / `onQuestion` | 关/开/开/开 | 四种场景的开关 |
| `desktopToast.enabled` | `true` | 原生通知总开关 |
| `desktopToast.shell` | `powershell` | 用 5.1（WinRT 直发需要）；pwsh 发不了 |
| `desktopToast.timeoutMs` | `10000` | 通知进程超时（毫秒） |
| `desktopToast.appId` | `Dsh.Notify` | 通知身份 ID，一般不用动 |
| `desktopToast.appName` | `DSH Notify` | 通知头部显示的名字 |
| `desktopToast.logoPath` | 空 | 换图标：本地 PNG/ICO 绝对路径，留空用内置鲸鱼标 |
| `desktopToast.openUrl` | `http://127.0.0.1:3080` | 点通知打开的地址 |

## 疑难排查

- **收不到通知**：先看设置页两个开关；再到 Windows 设置 → 系统 → 通知，确认「DSH Notify」开着、专注助手没拦；最后确认任务真的符合上面四种场景（正盯着的会话跑完是刻意不弹的）。
- **通知还是 PowerShell 的名字**：身份没注册上，删掉开始菜单里的 `DSH Notify.lnk`，重启 dsh web 让它重建。
- **设置页一直加载不出来**：多半是 host 没重启（设置桥接路由要重启才注册）。还不行就 `curl http://127.0.0.1:3080/api/dsh-notify/settings` 看看回什么。
- **日志**：host 侧看 dsh web 的进程输出（`dsh-notify:` 开头）；页面侧按 F12，`[dsh-notify]` 开头的就是本插件的日志。

## 开发

```sh
pnpm install
pnpm verify      # 提交前跑：类型检查 + 58 个测试 + 构建
pnpm watch       # 改 client 代码后热重构建，刷新页面生效
```

目录：`src/index.ts` 是 host 半边（事件监听 + 原生通知 + 设置命名空间），`src/desktop.ts` 管 WinRT 直发和身份注册（`assets/dsh-set-aumid.exe` 是写 AUMID 的小工具，源码在 `assets-source/`），`src/client/` 是页面半边（会话监听、toast、设置页）。改完 client 记得把 `lib/` 一起提交——仓库自带产物，安装才不用编译。

要换默认图标，改 `scripts/generate-icon.mjs` 里的 `LOGO_URL` 跑一遍就行。

## 来源与版权

| 包 | 来源 | 版权 |
| --- | --- | --- |
| dsh-notify | 作者 aburaMSMS 个人开发 | BSD-3-Clause（aburaMSMS） |

通知默认图标使用 DeepSeek 官方 logo，商标归 DeepSeek 所有，仅用于本地通知标识，设置里可随时换成自己的图标。安全问题请走仓库 Security 页面的私下报告通道，不要发公开 issue。
