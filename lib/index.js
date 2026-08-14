import { Service } from "@deepseek-ai/cordis";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import z from "schemastery";
//#region src/config.ts
/** Schema defaults, spelled once (the schemastery schema mirrors these). */
const NOTIFY_DEFAULTS = {
	enabled: true,
	language: "zh",
	customTitle: "",
	onStart: false,
	onCompletion: true,
	onApproval: true,
	onQuestion: true,
	ntfy: {
		enabled: false,
		server: "https://ntfy.sh",
		topic: "",
		token: "",
		priority: "default",
		tags: "robot",
		clickUrl: ""
	},
	desktopToast: {
		enabled: false,
		shell: "powershell",
		timeoutMs: 1e4,
		appId: "Dsh.Notify",
		appName: "DSH Notify",
		logoPath: "",
		openUrl: "http://127.0.0.1:3080"
	}
};
/**
* Merge a (possibly partial, possibly undefined) loader-provided config over
* the defaults. Used by both halves instead of trusting the loader to have
* applied schema defaults.
* @param config - the row config the loader passed to apply().
* @returns a fully populated config.
*/
function withDefaults(config) {
	const base = config ?? {};
	const ntfy = base.ntfy ?? {};
	const desktop = base.desktopToast ?? {};
	return {
		enabled: base.enabled ?? NOTIFY_DEFAULTS.enabled,
		language: base.language ?? NOTIFY_DEFAULTS.language,
		customTitle: base.customTitle ?? NOTIFY_DEFAULTS.customTitle,
		onStart: base.onStart ?? NOTIFY_DEFAULTS.onStart,
		onCompletion: base.onCompletion ?? NOTIFY_DEFAULTS.onCompletion,
		onApproval: base.onApproval ?? NOTIFY_DEFAULTS.onApproval,
		onQuestion: base.onQuestion ?? NOTIFY_DEFAULTS.onQuestion,
		ntfy: {
			enabled: ntfy.enabled ?? NOTIFY_DEFAULTS.ntfy.enabled,
			server: ntfy.server ?? NOTIFY_DEFAULTS.ntfy.server,
			topic: ntfy.topic ?? NOTIFY_DEFAULTS.ntfy.topic,
			token: ntfy.token ?? NOTIFY_DEFAULTS.ntfy.token,
			priority: ntfy.priority ?? NOTIFY_DEFAULTS.ntfy.priority,
			tags: ntfy.tags ?? NOTIFY_DEFAULTS.ntfy.tags,
			clickUrl: ntfy.clickUrl ?? NOTIFY_DEFAULTS.ntfy.clickUrl
		},
		desktopToast: {
			enabled: desktop.enabled ?? NOTIFY_DEFAULTS.desktopToast.enabled,
			shell: desktop.shell ?? NOTIFY_DEFAULTS.desktopToast.shell,
			timeoutMs: desktop.timeoutMs ?? NOTIFY_DEFAULTS.desktopToast.timeoutMs,
			appId: desktop.appId ?? NOTIFY_DEFAULTS.desktopToast.appId,
			appName: desktop.appName ?? NOTIFY_DEFAULTS.desktopToast.appName,
			logoPath: desktop.logoPath ?? NOTIFY_DEFAULTS.desktopToast.logoPath,
			openUrl: desktop.openUrl ?? NOTIFY_DEFAULTS.desktopToast.openUrl
		}
	};
}
//#endregion
//#region src/desktop.ts
/**
* Windows native desktop toasts: the host process raises OS-level toasts
* directly through Windows PowerShell (5.1) + the WinRT toast APIs, using an
* explicit AppUserModelID registered via a Start-Menu shortcut — bypassing
* the browser notification permission entirely (no user gesture, no prompt,
* works even with the DSH page closed) and with a custom app name + icon.
*
* Why not BurntToast: its ToastNotificationManagerCompat discovers the toast
* identity by scanning Start-Menu shortcuts through shell APIs that fail on
* current Windows builds, so toasts always fall back to the PowerShell
* identity. `CreateToastNotifier(appId)` with an explicit AUMID sidesteps
* the discovery entirely and shows the shortcut's own name and icon.
*
* Design notes:
* - Scripts travel base64-encoded (`-EncodedCommand`, UTF-16LE) so text
*   never needs shell quoting.
* - Toast XML text is XML-escaped; the PowerShell literal is single-quoted
*   (and the escaped XML never contains a raw single quote).
* - The identity shortcut is created in TEMP, stamped with the AUMID by the
*   packaged helper exe (IShellLink → IPropertyStore; in-place writes fail
*   with STG_E_ACCESSDENIED because Explorer holds the Start-Menu file),
*   then moved into the Start Menu — and verified via Get-StartApps on
*   re-runs.
* - Spawning takes injectable process functions so tests can drive
*   success/failure without a real shell.
*
* @module dsh-notify/desktop
*/
/** Escape a string as a PowerShell single-quoted literal ('' doubles a quote). */
function psQuote(value) {
	return `'${value.replace(/'/gu, "''")}'`;
}
/** Escape text for inclusion in toast XML character data. */
function xmlEscape(value) {
	return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
}
/** Build a file:// URI from an absolute Windows path (spaces/unicode encoded). */
function fileUri(path) {
	return encodeURI(`file:///${path.replace(/\\/gu, "/")}`);
}
/**
* Build the WinRT toast XML for one notification.
* @param title - toast headline.
* @param body - toast body.
* @param logoPath - absolute path of the PNG shown inside the toast
*   (appLogoOverride; toast rendering does not support .ico).
* @returns adaptive toast XML.
*/
function winToastXml(title, body, logoPath) {
	return `<toast><visual><binding template="ToastGeneric"><image placement="appLogoOverride" src="${fileUri(logoPath)}"/><text>${xmlEscape(title)}</text><text>${xmlEscape(body)}</text></binding></visual></toast>`;
}
/**
* Build the script that raises one Windows toast through the WinRT APIs with
* the plugin's explicit AppUserModelID. Runs on Windows PowerShell 5.1 (the
* WinRT type projection is reliable there; pwsh 7 rejects the types in
* non-interactive sessions).
* @param config - desktop toast settings (appId).
* @param message - the notification.
* @param logoPath - absolute path of the PNG shown inside the toast.
* @returns PowerShell script text.
*/
function winToastScript(config, message, logoPath) {
	return [
		"$ErrorActionPreference = 'Stop'",
		"[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
		"[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
		`$xml = ${psQuote(winToastXml(message.title, message.body, logoPath))}`,
		"$doc = New-Object Windows.Data.Xml.Dom.XmlDocument",
		"$doc.LoadXml($xml)",
		"$toast = New-Object Windows.UI.Notifications.ToastNotification $doc",
		`[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(${psQuote(config.appId)}).Show($toast)`
	].join("\n");
}
/**
* Build the idempotent script that registers the plugin's toast identity: a
* Start-Menu shortcut carrying an explicit AppUserModelID (the identity
* Windows shows as the toast header name + icon). BurntToast's
* ToastNotificationManagerCompat discovers Start-Menu shortcut AUMIDs
* automatically, so a plain `New-BurntToastNotification` call shows this
* identity with no further wiring.
*
* The AUMID write happens on a TEMP copy through the packaged helper exe
* (IShellLink → IPropertyStore): Explorer holds the Start-Menu shortcut's
* property store open, so in-place writes fail with STG_E_ACCESSDENIED on
* current Windows. The finished temp copy then replaces the Start-Menu
* entry. The shortcut target is a browser-open command so clicking a toast
* opens the DSH GUI instead of a console window.
* @param config - desktop toast settings (appId/appName/openUrl).
* @param iconPath - absolute path of the .ico shown on the toast.
* @param helperPath - absolute path of the AUMID writer exe.
* @returns PowerShell script text (safe to re-run; verifies via Get-StartApps).
*/
function ensureAppIdScript(config, iconPath, helperPath) {
	const lines = [
		"$ErrorActionPreference = 'Stop'",
		"$lnk = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Microsoft\\Windows\\Start Menu\\Programs'",
		`$lnk = Join-Path $lnk ${psQuote(`${config.appName}.lnk`)}`,
		"$existingIcon = ''",
		"if (Test-Path -LiteralPath $lnk) {",
		"  $w0 = New-Object -ComObject WScript.Shell",
		"  $existingIcon = [string]$w0.CreateShortcut($lnk).IconLocation",
		"}",
		"$need = $true",
		`$apps = @(Get-StartApps -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq ${psQuote(config.appName)} })`,
		`if ($apps.Count -gt 0 -and $apps[0].AppID -eq ${psQuote(config.appId)} -and $existingIcon -eq ${psQuote(iconPath)}) { $need = $false }`,
		"if ($need) {",
		"  $tmp = Join-Path $env:TEMP ('dsh-notify-' + [guid]::NewGuid().ToString('N') + '.lnk')",
		"  $ws = New-Object -ComObject WScript.Shell",
		"  $sc = $ws.CreateShortcut($tmp)",
		"  $sc.TargetPath = (Get-Command cmd.exe).Source"
	];
	if (config.openUrl.trim() !== "") lines.push(`  $sc.Arguments = "/c start "" ""${config.openUrl}"""`);
	lines.push("  $sc.WorkingDirectory = $env:TEMP", `  $sc.IconLocation = ${psQuote(iconPath)}`, `  $sc.Description = ${psQuote(config.appName)}`, "  $sc.Save()", `  & ${psQuote(helperPath)} $tmp ${psQuote(config.appId)}`, "  if ($LASTEXITCODE -ne 0) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue; throw \"dsh-set-aumid failed with exit code $LASTEXITCODE\" }", "  if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force -ErrorAction SilentlyContinue }", "  Move-Item -Force $tmp $lnk", "}");
	return lines.join("\n");
}
/** Absolute path of the packaged AUMID writer exe (lib/ → package root/assets). */
function desktopAumidHelperPath() {
	return fileURLToPath(new URL("../assets/dsh-set-aumid.exe", import.meta.url));
}
/** Encode a script for `powershell -EncodedCommand` (requires UTF-16LE base64). */
function encodedPowerShellCommand(script) {
	return Buffer.from(script, "utf16le").toString("base64");
}
/** Absolute path of the packaged shortcut icon (lib/ → package root/assets; .ico). */
function desktopIconPath() {
	return fileURLToPath(new URL("../assets/dsh-notify.ico", import.meta.url));
}
/** Absolute path of the packaged toast logo image (lib/ → package root/assets; PNG). */
function desktopLogoPath() {
	return fileURLToPath(new URL("../assets/dsh-notify.png", import.meta.url));
}
/** Run one PowerShell script through `-EncodedCommand`, resolving on exit 0. */
function runPowerShell(config, script, spawnImpl) {
	return new Promise((resolve, reject) => {
		const args = [
			"-NoProfile",
			"-NonInteractive",
			"-EncodedCommand",
			encodedPowerShellCommand(script)
		];
		let child;
		try {
			child = spawnImpl(config.shell, args, {
				stdio: "ignore",
				windowsHide: true
			});
		} catch (error) {
			reject(error instanceof Error ? error : new Error(String(error)));
			return;
		}
		const timer = setTimeout(() => {
			child.kill();
			reject(/* @__PURE__ */ new Error(`PowerShell command timed out after ${config.timeoutMs}ms`));
		}, config.timeoutMs);
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(/* @__PURE__ */ new Error(`${config.shell} exited with code ${String(code)}`));
		});
	});
}
/**
* Raise one Windows toast. Resolves when the toast process exits cleanly;
* rejects on spawn errors, non-zero exit, or timeout.
* @param config - desktop toast settings (shell + timeout).
* @param message - the notification.
* @param logoPath - absolute path of the PNG shown inside the toast.
* @param spawnImpl - process spawner (injected for tests).
*/
function sendDesktopToast(config, message, logoPath, spawnImpl = spawn) {
	return runPowerShell(config, winToastScript(config, message, logoPath), spawnImpl);
}
/**
* Register the plugin's toast identity (idempotent). Resolves when the
* shortcut exists; rejects on failure (toasts then fail loudly on send —
* the caller logs the warning and disables the channel).
* @param config - desktop toast settings.
* @param iconPath - absolute path of the .ico.
* @param helperPath - absolute path of the AUMID writer exe.
* @param spawnImpl - process spawner (injected for tests).
*/
function ensureDesktopAppId(config, iconPath, helperPath, spawnImpl = spawn) {
	return runPowerShell(config, ensureAppIdScript(config, iconPath, helperPath), spawnImpl);
}
//#endregion
//#region src/messages.ts
const COPY = {
	zh: {
		completion: {
			title: "任务执行完毕",
			body: "「{label}」已执行完毕，需要你查看",
			tags: "white_check_mark"
		},
		start: {
			title: "开始执行",
			body: "「{label}」开始执行任务",
			tags: "rocket"
		},
		approval: {
			title: "需要权限许可",
			body: "「{label}」中，工具 {tool} 请求许可{reason}",
			tags: "lock"
		},
		approvalGeneric: {
			title: "需要权限许可",
			body: "「{label}」中有工具请求许可{reason}",
			tags: "lock"
		},
		question: {
			title: "需要你回答",
			body: "「{label}」中，Agent 需要你回答问题",
			tags: "question"
		},
		planReview: {
			title: "需要你审阅计划",
			body: "「{label}」中，Agent 提交了计划等待审阅",
			tags: "clipboard"
		}
	},
	en: {
		completion: {
			title: "Task finished",
			body: "\"{label}\" has finished and needs your attention",
			tags: "white_check_mark"
		},
		start: {
			title: "Task started",
			body: "\"{label}\" started running",
			tags: "rocket"
		},
		approval: {
			title: "Permission required",
			body: "Tool {tool} in \"{label}\" requests permission{reason}",
			tags: "lock"
		},
		approvalGeneric: {
			title: "Permission required",
			body: "A tool in \"{label}\" requests permission{reason}",
			tags: "lock"
		},
		question: {
			title: "Question for you",
			body: "\"{label}\" needs your answer",
			tags: "question"
		},
		planReview: {
			title: "Plan review needed",
			body: "\"{label}\" submitted a plan for review",
			tags: "clipboard"
		}
	}
};
/** Keep very long approval reasons readable on a notification. */
const REASON_LIMIT = 140;
/** Replace `{key}` placeholders; unknown keys stay verbatim. */
function fill(template, values) {
	return template.replace(/\{(\w+)\}/gu, (match, key) => values[key] ?? match);
}
/**
* Build one notification message.
* @param language - copy language.
* @param kind - situation.
* @param values - placeholder values (`label`, `tool`, `reason`).
* @returns the ready-to-show message.
*/
function notifyMessage(language, kind, values = {}) {
	const entry = COPY[language][kind];
	return {
		title: entry.title,
		body: fill(entry.body, values),
		tags: entry.tags
	};
}
/** Clamp an approval reason to a notification-friendly length. */
function clampReason(reason) {
	if (reason.length <= REASON_LIMIT) return reason;
	return `${reason.slice(0, REASON_LIMIT)}…`;
}
/**
* Completion notification for one session.
* @param language - copy language.
* @param label - human-facing session label (title / project basename / id).
*/
function completionMessage(language, label) {
	return notifyMessage(language, "completion", { label });
}
/** Turn-start notification for one session. */
function startMessage(language, label) {
	return notifyMessage(language, "start", { label });
}
/**
* Approval notification. Uses the tool-specific copy when the tool name is
* known, the generic copy otherwise; the reason is appended when present.
* @param language - copy language.
* @param label - human-facing session label.
* @param toolName - tool requesting permission (optional).
* @param reason - the asker's explanation (optional).
*/
function approvalMessage(language, label, toolName, reason) {
	const reasonPart = reason !== void 0 && reason.trim() !== "" ? `${language === "zh" ? "：" : ": "}${clampReason(reason.trim())}` : "";
	return toolName !== void 0 && toolName !== "" ? notifyMessage(language, "approval", {
		label,
		tool: toolName,
		reason: reasonPart
	}) : notifyMessage(language, "approvalGeneric", {
		label,
		reason: reasonPart
	});
}
/** Question notification for one session. */
function questionMessage(language, label) {
	return notifyMessage(language, "question", { label });
}
/**
* Override a message's title with the user's custom title (when set).
* @param message - the built notification.
* @param customTitle - the user-configured title; empty keeps the built-in one.
* @returns the message with the custom title applied, or unchanged.
*/
function applyCustomTitle(message, customTitle) {
	return customTitle.trim() === "" ? message : {
		...message,
		title: customTitle.trim()
	};
}
//#endregion
//#region src/ntfy.ts
/** ntfy topic publish endpoint (trailing slashes stripped, topic encoded). */
function ntfyUrl(server, topic) {
	return `${server.replace(/\/+$/u, "")}/${encodeURIComponent(topic)}`;
}
/**
* Build the ntfy publish request for one message.
* @param ntfy - resolved ntfy settings.
* @param message - the notification to publish.
* @returns URL and fetch init (headers carry Title/Priority/Tags and the
*   optional Authorization and Click headers).
*/
function ntfyRequest(ntfy, message) {
	const headers = {
		Title: message.title,
		Priority: ntfy.priority,
		Tags: ntfy.tags
	};
	if (ntfy.token.trim() !== "") headers.Authorization = `Bearer ${ntfy.token}`;
	if (ntfy.clickUrl.trim() !== "") headers.Click = ntfy.clickUrl;
	return {
		url: ntfyUrl(ntfy.server, ntfy.topic),
		init: {
			method: "POST",
			headers,
			body: message.body
		}
	};
}
const PUBLISH_TIMEOUT_MS = 1e4;
/**
* Publish one message to the configured ntfy topic.
* @param ntfy - resolved ntfy settings (enabled + non-empty topic assumed).
* @param message - the notification to publish.
* @param fetchImpl - fetch implementation (injected for tests).
* @throws when the transport fails or the server answers non-2xx.
*/
async function publishNtfy(ntfy, message, fetchImpl = fetch) {
	const request = ntfyRequest(ntfy, message);
	const response = await fetchImpl(request.url, {
		...request.init,
		signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS)
	});
	if (!response.ok) throw new Error(`ntfy publish failed: HTTP ${response.status}`);
}
//#endregion
//#region src/schema.ts
/**
* schemastery config schema for the dsh-notify row. Host-only: the browser
* half consumes the same config object through `withDefaults` and never
* needs the schema (keeping schemastery out of the client bundle).
*
* Field descriptions and the secret role feed the settings surface: the
* generic settings UI renders labels/hints from descriptions and redacts
* `role('secret')` fields on the wire.
*
* @module dsh-notify/schema
*/
/** Loader-facing config schema; defaults mirror `NOTIFY_DEFAULTS`. */
const NotifyConfigSchema = z.object({
	enabled: z.boolean().default(true).description("总开关：关闭后停止所有通知"),
	language: z.union(["zh", "en"]).default("zh").description("通知文案语言"),
	customTitle: z.string().default("").description("自定义通知标题（留空使用内置标题，如「任务执行完毕」）"),
	onStart: z.boolean().default(false).description("任务开始执行时提醒"),
	onCompletion: z.boolean().default(true).description("任务执行完毕时提醒"),
	onApproval: z.boolean().default(true).description("工具请求权限许可时提醒"),
	onQuestion: z.boolean().default(true).description("Agent 需要你回答/审阅时提醒"),
	ntfy: z.object({
		enabled: z.boolean().default(false).description("启用 ntfy 推送（浏览器关闭/手机也能收到）"),
		server: z.string().default("https://ntfy.sh").description("ntfy 服务器地址（可自建）"),
		topic: z.string().default("").description("推送主题；订阅同一主题的设备会收到（启用时必填）"),
		token: z.string().role("secret").default("").description("受保护主题的访问令牌（可选）"),
		priority: z.union([
			"min",
			"low",
			"default",
			"high",
			"max"
		]).default("default").description("通知优先级"),
		tags: z.string().default("robot").description("通知上的 emoji 标签（逗号分隔）"),
		clickUrl: z.string().default("").description("点击 ntfy 通知打开的 URL（可选）")
	}).description("ntfy.sh 推送通道"),
	desktopToast: z.object({
		enabled: z.boolean().default(false).description("启用 Windows 原生通知（无需浏览器权限）"),
		shell: z.union(["pwsh", "powershell"]).default("powershell").description("PowerShell 可执行文件（默认 powershell，5.1 最稳）"),
		timeoutMs: z.number().default(1e4).description("通知进程超时（毫秒）"),
		appId: z.string().default("Dsh.Notify").description("Windows 通知身份 ID（一般无需修改）"),
		appName: z.string().default("DSH Notify").description("通知头部显示的应用名称"),
		logoPath: z.string().default("").description("自定义通知图标（本地 PNG/ICO 绝对路径；留空使用内置 DeepSeek 鲸鱼标）"),
		openUrl: z.string().default("http://127.0.0.1:3080").description("点击通知打开的页面")
	}).description("Windows 原生通知通道")
});
//#endregion
//#region src/settings-route.ts
/** Route path shared with the browser half. */
const SETTINGS_API_PATH = "/api/dsh-notify/settings";
/** Cap on JSON request bodies (single field edits are tiny). */
const MAX_BODY_BYTES = 16 * 1024;
/** One JSON response. */
function writeJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"referrer-policy": "no-referrer"
	});
	res.end(JSON.stringify(body));
}
/** Loopback fence plus browser same-origin markers (mirrors dsh-ssh routes). */
function isLoopbackRequest(req) {
	const address = req.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	if (req.headers["sec-fetch-site"] === "cross-site") return false;
	return true;
}
/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > MAX_BODY_BYTES) return void 0;
		chunks.push(buffer);
	}
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return typeof parsed === "object" && parsed !== null ? parsed : void 0;
	} catch {
		return;
	}
}
/** Safe dotted-field → path conversion for the mutate API. */
function fieldPath(field) {
	if (typeof field !== "string") return void 0;
	if (!/^[A-Za-z][A-Za-z0-9_.]*$/u.test(field)) return void 0;
	const path = field.split(".");
	return path.length > 0 && path.every((part) => part !== "") ? path : void 0;
}
/** Build the settings bridge route (one exact path, method-dispatched). */
function makeSettingsRoutes(deps) {
	return [{
		kind: "exact",
		path: SETTINGS_API_PATH,
		handler: async (req, res) => {
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, {
					ok: false,
					error: "forbidden: loopback-only"
				});
				return;
			}
			const method = req.method ?? "GET";
			if (method === "GET") {
				writeJson(res, 200, {
					ok: true,
					value: deps.getConfig()
				});
				return;
			}
			if (method === "POST") {
				const settings = deps.settings();
				if (settings === void 0) {
					writeJson(res, 503, {
						ok: false,
						error: "settings service is absent"
					});
					return;
				}
				const body = await readJsonBody(req);
				if (body === void 0) {
					writeJson(res, 400, {
						ok: false,
						error: "invalid JSON body"
					});
					return;
				}
				const path = fieldPath(body.field);
				if (path === void 0) {
					writeJson(res, 400, {
						ok: false,
						error: "field must be a dotted key path"
					});
					return;
				}
				try {
					await settings.mutate(deps.namespace, [{
						op: "set",
						path,
						value: body.value
					}]);
					writeJson(res, 200, { ok: true });
				} catch (error) {
					writeJson(res, 400, {
						ok: false,
						error: error instanceof Error ? error.message : String(error)
					});
				}
				return;
			}
			writeJson(res, 405, {
				ok: false,
				error: `method not allowed: ${method}`
			});
		}
	}];
}
//#endregion
//#region src/index.ts
/**
* dsh-notify — host half.
*
* Listens to the host event surface for the three "the human must act next"
* situations and pushes notifications to the configured channels:
*
* - `agent/status` idle      → the session's turn finished (任务执行完毕);
* - `approval/request`       → a tool requested permission (需要权限许可);
* - `session/event` tool/call `ask_user_question` → the agent needs an
*   answer (需要用户回答).
*
* Channels: ntfy.sh push and Windows native toasts (WinRT direct-send under
* a Start-Menu-shortcut identity). The plugin doubles as the `ctx.notify`
* service so other plugins can publish notifications through the same
* channels.
*
* Configuration is live: `installSettingsSection` registers the
* `dsh-notify` settings namespace, so the DSH settings page edits the
* effective config at runtime (composition config remains the base layer).
* Every event handler re-reads the current value, so toggles apply without
* a restart. All event listeners register through `ctx.on` in the
* constructor and are therefore bound to this plugin's fiber.
*/
/** Stable cordis plugin name (row id `dsh-notify`). */
const name = "dsh-notify";
/** Settings namespace surfacing this plugin in the DSH settings page. */
const NOTIFY_SETTINGS_NAMESPACE = settingsNamespace("dsh-notify");
/** Tool name whose invocation means "the user will be asked a question". */
const ASK_USER_TOOL = "ask_user_question";
/**
* Host notification service. Listens to the session/approval/question event
* surface and publishes to ntfy + Windows native toasts; `send()` is the
* public entry for other plugins. Configuration resolves live from the
* settings namespace (falling back to the composition entry).
*/
var NotifyService = class extends Service {
	/** Loader-facing config schema (defaults mirror `NOTIFY_DEFAULTS`). */
	static Config = NotifyConfigSchema;
	/** Live config reader: settings-resolved when the namespace is attached, composition entry otherwise. */
	current;
	/** Whether the toast identity shortcut is registered for the current config. */
	desktopAvailable = false;
	/** Last registered desktop identity signature (avoids re-registering on every settings change). */
	desktopSignature = "";
	constructor(ctx, config = {}) {
		super(ctx, "notify");
		this.current = () => withDefaults(config ?? {});
		this.ctx.on("agent/status", ({ agent, status }) => {
			this.onAgentStatus(agent, status);
		});
		this.ctx.on("approval/request", (req, next) => {
			if (this.cfg().onApproval) this.push(approvalMessage(this.cfg().language, this.labelOf(req.agent.session), req.toolName, req.reason));
			return next();
		});
		this.ctx.on("session/event", (session, event) => {
			this.onSessionEvent(session, event);
		});
		installSettingsSection(this.ctx, NOTIFY_SETTINGS_NAMESPACE, NotifyConfigSchema, withDefaults(config ?? {}), {
			setSource: (source) => {
				this.current = source;
				this.syncChannels().catch((error) => {
					this.ctx.logger.warn(`dsh-notify: settings source swap failed: ${String(error)}`);
				});
			},
			onChange: () => {
				this.syncChannels().catch((error) => {
					this.ctx.logger.warn(`dsh-notify: applying settings failed: ${String(error)}`);
				});
			}
		});
		this.ctx.inject(["webServer"], (sctx) => {
			const routes = makeSettingsRoutes({
				getConfig: () => this.cfg(),
				settings: () => this.ctx.get("settings"),
				namespace: NOTIFY_SETTINGS_NAMESPACE
			});
			sctx.effect(() => {
				const disposers = routes.map((route) => sctx.webServer.register(route));
				return () => {
					for (const dispose of disposers) dispose();
				};
			}, "dsh-notify: settings routes");
		});
	}
	/** Startup validation + initial channel build; fails loud on a bad ntfy config. */
	async [Service.init]() {
		const cfg = this.cfg();
		if (!cfg.enabled) {
			this.ctx.logger.info("dsh-notify: disabled by config");
			return;
		}
		if (cfg.ntfy.enabled && cfg.ntfy.topic.trim() === "") throw new Error("dsh-notify: ntfy.enabled is true but ntfy.topic is empty — set a topic (and subscribe to it) or disable ntfy");
		await this.syncChannels();
	}
	/**
	* Publish one notification through the host channels (ntfy + native toast
	* when enabled). Never throws: channel failures are logged and dropped.
	* @param input - title/body plus optional tag and priority overrides.
	*/
	send(input) {
		this.push({
			title: input.title,
			body: input.body,
			tags: input.tags ?? "bell"
		}, input.priority);
	}
	/** Current effective config (settings-resolved or composition fallback). */
	cfg() {
		try {
			return this.current();
		} catch {
			return NOTIFY_DEFAULTS;
		}
	}
	/** Rebuild host channels from the live config (desktop identity registration). */
	async syncChannels() {
		const cfg = this.cfg();
		if (!cfg.enabled || !cfg.desktopToast.enabled) {
			this.desktopAvailable = false;
			this.desktopSignature = "";
			return;
		}
		const desktop = cfg.desktopToast;
		const signature = `${desktop.appId}\u0000${desktop.appName}\u0000${this.shortcutIconPath(cfg)}`;
		if (this.desktopAvailable && this.desktopSignature === signature) return;
		await ensureDesktopAppId(desktop, this.shortcutIconPath(cfg), desktopAumidHelperPath());
		this.desktopAvailable = true;
		this.desktopSignature = signature;
		this.ctx.logger.info(`dsh-notify: windows native toasts active (app "${desktop.appName}")`);
	}
	/** Shortcut icon: the user's .ico when configured, the bundled icon otherwise. */
	shortcutIconPath(cfg) {
		const custom = cfg.desktopToast.logoPath.trim();
		return custom.toLowerCase().endsWith(".ico") ? custom : desktopIconPath();
	}
	/** Toast body logo: the user's image when configured (PNG preferred), the bundled PNG otherwise. */
	toastLogoPath(cfg) {
		const custom = cfg.desktopToast.logoPath.trim();
		return custom === "" ? desktopLogoPath() : custom;
	}
	onAgentStatus(agent, status) {
		const cfg = this.cfg();
		if (!cfg.enabled) return;
		if (status === "idle") {
			if (!cfg.onCompletion || !this.isRoot(agent)) return;
			this.push(applyCustomTitle(completionMessage(cfg.language, this.labelOf(agent.session)), cfg.customTitle));
		} else {
			if (!cfg.onStart || !this.isRoot(agent)) return;
			this.push(applyCustomTitle(startMessage(cfg.language, this.labelOf(agent.session)), cfg.customTitle));
		}
	}
	onSessionEvent(session, event) {
		const cfg = this.cfg();
		if (!cfg.enabled || !cfg.onQuestion) return;
		if (event.type !== "tool/call" || event.data.name !== ASK_USER_TOOL) return;
		if (!this.isRootById(session.id)) return;
		this.push(applyCustomTitle(questionMessage(cfg.language, this.labelOf(session)), cfg.customTitle));
	}
	/** Whether an agent is a root (not owned by another agent); absent registry → notify anyway. */
	isRoot(agent) {
		const registry = this.ctx.get("agents");
		if (registry === void 0) return true;
		try {
			return registry.roots().includes(agent);
		} catch (error) {
			this.ctx.logger.warn(`dsh-notify: agents registry check failed (${String(error)}); notifying anyway`);
			return true;
		}
	}
	/** Root check by session id (agent id === session id). */
	isRootById(sessionId) {
		const registry = this.ctx.get("agents");
		if (registry === void 0) return true;
		try {
			const agent = registry.get(sessionId);
			return agent === void 0 ? true : registry.roots().includes(agent);
		} catch (error) {
			this.ctx.logger.warn(`dsh-notify: agents registry check failed (${String(error)}); notifying anyway`);
			return true;
		}
	}
	/** Human-facing session label: durable title → workspace basename → session id. */
	labelOf(session) {
		const title = this.ctx.get("sessionTitle")?.get(session)?.title;
		if (title !== void 0 && title.trim() !== "") return title;
		if (session.header.cwd !== void 0) {
			const base = session.header.cwd.replace(/[/\\]+$/u, "").split(/[/\\]/u).pop();
			if (base !== void 0 && base !== "") return base;
		}
		return String(session.id);
	}
	push(message, priority) {
		try {
			this.ctx.logger.info(`dsh-notify: ${message.title} — ${message.body}`);
		} catch {}
		const cfg = this.cfg();
		const ntfy = cfg.ntfy;
		if (ntfy.enabled && ntfy.topic.trim() !== "") publishNtfy({
			...ntfy,
			priority: priority ?? ntfy.priority
		}, message).catch((error) => {
			this.ctx.logger.warn(`dsh-notify: ntfy publish failed: ${String(error)}`);
		});
		const desktop = cfg.desktopToast;
		if (desktop.enabled && this.desktopAvailable) sendDesktopToast(desktop, message, this.toastLogoPath(cfg)).catch((error) => {
			this.ctx.logger.warn(`dsh-notify: desktop toast failed: ${String(error)}`);
		});
	}
};
//#endregion
export { NOTIFY_SETTINGS_NAMESPACE, NotifyService, NotifyService as default, name };

//# sourceMappingURL=index.js.map