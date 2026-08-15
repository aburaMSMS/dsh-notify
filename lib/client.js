window.__ModuleLoader__.load({
	id: "dsh-notify",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom_client = require("react-dom/client");
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
		/** Plan-review notification for one session. */
		function planReviewMessage(language, label) {
			return notifyMessage(language, "planReview", { label });
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
		//#region src/settings-route.ts
		/** Route path shared with the browser half. */
		const SETTINGS_API_PATH = "/api/dsh-notify/settings";
		//#endregion
		//#region src/client/settings-client.ts
		/** Fetch-based settings client (one per page load). */
		var NotifySettingsClient = class {
			snapshot = {
				status: "loading",
				value: void 0
			};
			listeners = /* @__PURE__ */ new Set();
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			getSnapshot = () => this.snapshot;
			/** Pull the live resolved config from the host bridge. */
			async load() {
				try {
					const response = await fetch(SETTINGS_API_PATH, { cache: "no-store" });
					if (!response.ok) {
						this.accept({
							status: "unavailable",
							value: void 0
						});
						return;
					}
					const body = await response.json();
					if (body.ok !== true || typeof body.value !== "object" || body.value === null) {
						this.accept({
							status: "unavailable",
							value: void 0
						});
						return;
					}
					this.accept({
						status: "ready",
						value: body.value
					});
				} catch (error) {
					console.warn("[dsh-notify] settings load failed:", error);
					this.accept({
						status: "unavailable",
						value: void 0
					});
				}
			}
			/** Apply one field edit through the host bridge, then refresh. */
			async set(field, value) {
				try {
					const response = await fetch(SETTINGS_API_PATH, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							field,
							value
						})
					});
					if (!response.ok) {
						const body = await response.json().catch(() => ({}));
						throw new Error(body.error ?? `HTTP ${response.status}`);
					}
				} finally {
					await this.load();
				}
			}
			accept(snapshot) {
				this.snapshot = snapshot;
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region \0dsh-css:C:\Users\user\dsh-notify\src\client\settings-section.module.css.mjs
		const css$1 = ".dA1p_W_section{flex-direction:column;gap:20px;font-size:13px;line-height:1.5;display:flex}.dA1p_W_group{flex-direction:column;gap:10px;display:flex}.dA1p_W_groupTitle{margin:0;font-size:14px;font-weight:600}.dA1p_W_groupHint{opacity:.65;margin:-6px 0 0;font-size:12px}.dA1p_W_row{justify-content:space-between;align-items:center;gap:16px;display:flex}.dA1p_W_rowLabel{flex-direction:column;min-width:0;display:flex}.dA1p_W_rowHint{opacity:.55;font-size:11px}.dA1p_W_rowControl{flex-shrink:0}.dA1p_W_checkbox{accent-color:#4d6bfe;cursor:pointer;width:16px;height:16px}.dA1p_W_text{width:240px;color:inherit;background:#ffffff0f;border:1px solid #ffffff2e;border-radius:6px;padding:5px 8px;font-size:13px}.dA1p_W_text:focus-visible{outline-offset:1px;outline:2px solid #7aa2ff}.dA1p_W_select{min-width:140px;color:inherit;background:#ffffff0f;border:1px solid #ffffff2e;border-radius:6px;padding:5px 8px;font-size:13px}.dA1p_W_notice{opacity:.7;padding:12px 0}";
		const tagId$1 = "dsh-notify/settings-section.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-notify";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var settings_section_module_css_default = {
			"checkbox": "dA1p_W_checkbox",
			"group": "dA1p_W_group",
			"groupHint": "dA1p_W_groupHint",
			"groupTitle": "dA1p_W_groupTitle",
			"notice": "dA1p_W_notice",
			"row": "dA1p_W_row",
			"rowControl": "dA1p_W_rowControl",
			"rowHint": "dA1p_W_rowHint",
			"rowLabel": "dA1p_W_rowLabel",
			"section": "dA1p_W_section",
			"select": "dA1p_W_select",
			"text": "dA1p_W_text"
		};
		//#endregion
		//#region src/client/settings-section.tsx
		/** The settings page content registered under the settings slots. */
		function NotifySettingsSection({ settings }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NotifyForm, { settings });
		}
		function NotifyForm({ settings }) {
			const snapshot = (0, react.useSyncExternalStore)((listener) => settings.subscribe(listener), () => settings.getSnapshot());
			const value = snapshot.status === "ready" && snapshot.value !== void 0 ? snapshot.value : void 0;
			const apply = (field, next) => {
				settings.set(field, next).catch((error) => {
					console.warn("[dsh-notify] settings write failed:", error);
				});
			};
			if (value === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_section_module_css_default.notice,
				children: [
					"正在加载设置…（状态：",
					snapshot.status,
					"）"
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_section_module_css_default.section,
				"data-dsh-notify-settings": "",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
						title: "基础",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "启用通知",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Checkbox, {
									checked: value.enabled,
									onChange: (checked) => {
										apply("enabled", checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "文案语言",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
									value: value.language,
									options: [["zh", "中文"], ["en", "English"]],
									onChange: (v) => {
										apply("language", v);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "自定义标题",
								hint: "留空使用内置标题（如「任务执行完毕」）",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
									value: value.customTitle,
									placeholder: NOTIFY_DEFAULTS.customTitle,
									onChange: (v) => {
										apply("customTitle", v);
									}
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
						title: "提醒时机",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "任务开始执行",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Checkbox, {
									checked: value.onStart,
									onChange: (checked) => {
										apply("onStart", checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "任务执行完毕",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Checkbox, {
									checked: value.onCompletion,
									onChange: (checked) => {
										apply("onCompletion", checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "需要权限许可",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Checkbox, {
									checked: value.onApproval,
									onChange: (checked) => {
										apply("onApproval", checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "需要你回答 / 审阅",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Checkbox, {
									checked: value.onQuestion,
									onChange: (checked) => {
										apply("onQuestion", checked);
									}
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
						title: "Windows 原生通知",
						hint: "主机直发，不经过浏览器权限；修改后即时生效",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "启用原生通知",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Checkbox, {
									checked: value.desktopToast.enabled,
									onChange: (checked) => {
										apply("desktopToast.enabled", checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "应用名称",
								hint: "通知头部显示的名称",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
									value: value.desktopToast.appName,
									placeholder: NOTIFY_DEFAULTS.desktopToast.appName,
									onChange: (v) => {
										apply("desktopToast.appName", v);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "自定义图标",
								hint: "本地 PNG/ICO 绝对路径；留空使用内置 DeepSeek 鲸鱼标",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
									value: value.desktopToast.logoPath,
									placeholder: "留空 = 内置 DeepSeek 鲸鱼标",
									onChange: (v) => {
										apply("desktopToast.logoPath", v);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "点击通知打开",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
									value: value.desktopToast.openUrl,
									placeholder: NOTIFY_DEFAULTS.desktopToast.openUrl,
									onChange: (v) => {
										apply("desktopToast.openUrl", v);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "PowerShell",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
									value: value.desktopToast.shell,
									options: [["powershell", "powershell (5.1，推荐)"], ["pwsh", "pwsh"]],
									onChange: (v) => {
										apply("desktopToast.shell", v);
									}
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
						title: "ntfy.sh 推送",
						hint: "浏览器关闭 / 手机也能收到",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "启用 ntfy",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Checkbox, {
									checked: value.ntfy.enabled,
									onChange: (checked) => {
										apply("ntfy.enabled", checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "服务器",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
									value: value.ntfy.server,
									placeholder: NOTIFY_DEFAULTS.ntfy.server,
									onChange: (v) => {
										apply("ntfy.server", v);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "主题 topic",
								hint: "启用时必填；订阅同一主题的设备会收到",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
									value: value.ntfy.topic,
									placeholder: "my-topic",
									onChange: (v) => {
										apply("ntfy.topic", v);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "访问令牌",
								hint: "受保护主题的令牌（可选，加密存储）",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
									type: "password",
									value: value.ntfy.token,
									placeholder: "（未设置）",
									onChange: (v) => {
										apply("ntfy.token", v);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "优先级",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
									value: value.ntfy.priority,
									options: [
										["min", "min"],
										["low", "low"],
										["default", "default"],
										["high", "high"],
										["max", "max"]
									],
									onChange: (v) => {
										apply("ntfy.priority", v);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "标签 tags",
								hint: "emoji 标签，逗号分隔",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
									value: value.ntfy.tags,
									placeholder: NOTIFY_DEFAULTS.ntfy.tags,
									onChange: (v) => {
										apply("ntfy.tags", v);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
								label: "点击打开 URL",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextInput, {
									value: value.ntfy.clickUrl,
									placeholder: "（可选）",
									onChange: (v) => {
										apply("ntfy.clickUrl", v);
									}
								})
							})
						]
					})
				]
			});
		}
		function Group({ title, hint, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: settings_section_module_css_default.group,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: settings_section_module_css_default.groupTitle,
						children: title
					}),
					hint !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_section_module_css_default.groupHint,
						children: hint
					}),
					children
				]
			});
		}
		function Row({ label, hint, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: settings_section_module_css_default.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: settings_section_module_css_default.rowLabel,
					children: [label, hint !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_section_module_css_default.rowHint,
						children: hint
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: settings_section_module_css_default.rowControl,
					children
				})]
			});
		}
		function Checkbox({ checked, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				type: "checkbox",
				className: settings_section_module_css_default.checkbox,
				checked,
				onChange: (event) => {
					onChange(event.target.checked);
				}
			});
		}
		/** Text edits commit after a quiet pause (and on blur) instead of POSTing per keystroke. */
		const TEXT_COMMIT_MS = 400;
		function TextInput({ value, placeholder, type = "text", onChange }) {
			const [draft, setDraft] = (0, react.useState)(value);
			const [dirty, setDirty] = (0, react.useState)(false);
			const timer = (0, react.useRef)(void 0);
			const committed = (0, react.useRef)(value);
			(0, react.useEffect)(() => {
				if (!dirty) {
					setDraft(value);
					committed.current = value;
				}
			}, [value, dirty]);
			(0, react.useEffect)(() => () => {
				if (timer.current !== void 0) window.clearTimeout(timer.current);
			}, []);
			const flush = (next) => {
				if (timer.current !== void 0) {
					window.clearTimeout(timer.current);
					timer.current = void 0;
				}
				if (next === committed.current) {
					setDirty(false);
					return;
				}
				committed.current = next;
				setDirty(false);
				onChange(next);
			};
			const change = (next) => {
				setDraft(next);
				setDirty(true);
				if (timer.current !== void 0) window.clearTimeout(timer.current);
				timer.current = window.setTimeout(() => {
					timer.current = void 0;
					flush(next);
				}, TEXT_COMMIT_MS);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				type,
				className: settings_section_module_css_default.text,
				value: draft,
				placeholder,
				onChange: (event) => {
					change(event.target.value);
				},
				onBlur: () => {
					flush(draft);
				}
			});
		}
		function Select({ value, options, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
				className: settings_section_module_css_default.select,
				value,
				onChange: (event) => {
					onChange(event.target.value);
				},
				children: options.map(([optionValue, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
					value: optionValue,
					children: label
				}, optionValue))
			});
		}
		//#endregion
		//#region \0dsh-css:C:\Users\user\dsh-notify\src\client\toast.module.css.mjs
		const css = ".Fi-5da_host{z-index:2147482000;pointer-events:none;flex-direction:column;align-items:flex-end;gap:8px;width:340px;max-width:calc(100vw - 32px);display:flex;position:fixed;bottom:16px;right:16px}.Fi-5da_stack{flex-direction:column;gap:8px;width:100%;display:flex}.Fi-5da_toast{pointer-events:auto;color:#e8eaf0;cursor:pointer;background:#16181ff0;border:1px solid #ffffff1a;border-radius:10px;padding:10px 32px 10px 12px;font-size:13px;line-height:1.45;animation:.18s ease-out Fi-5da_dshNotifyIn;position:relative;box-shadow:0 8px 24px #00000059}.Fi-5da_close{width:20px;height:20px;color:inherit;opacity:.55;cursor:pointer;background:0 0;border:none;border-radius:4px;padding:0;font-size:16px;line-height:20px;position:absolute;top:6px;right:8px}.Fi-5da_close:hover{opacity:.9;background:#ffffff14}.Fi-5da_close:focus-visible{outline-offset:1px;outline:2px solid #7aa2ff}.Fi-5da_toast:hover{border-color:#ffffff38}.Fi-5da_toast:focus-visible{outline-offset:2px;outline:2px solid #7aa2ff}.Fi-5da_title{margin-bottom:2px;font-weight:600}.Fi-5da_body{opacity:.85;overflow-wrap:anywhere}@media (prefers-reduced-motion:reduce){.Fi-5da_toast{animation:none}}@keyframes Fi-5da_dshNotifyIn{0%{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}";
		const tagId = "dsh-notify/toast.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-notify";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var toast_module_css_default = {
			"body": "Fi-5da_body",
			"close": "Fi-5da_close",
			"dshNotifyIn": "Fi-5da_dshNotifyIn",
			"host": "Fi-5da_host",
			"stack": "Fi-5da_stack",
			"title": "Fi-5da_title",
			"toast": "Fi-5da_toast"
		};
		//#endregion
		//#region src/client/toast.tsx
		const AUTO_DISMISS_MS = 8e3;
		/** Tiny useSyncExternalStore-compatible toast store. */
		var ToastStore = class {
			items = [];
			listeners = /* @__PURE__ */ new Set();
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			getSnapshot = () => this.items;
			/** Append one toast (dropping the oldest beyond the cap) and notify. */
			push(item) {
				this.items = [...this.items, item].slice(-5);
				this.emit();
			}
			/** Remove one toast and notify. */
			dismiss(id) {
				this.items = this.items.filter((item) => item.id !== id);
				this.emit();
			}
			emit() {
				for (const listener of this.listeners) listener();
			}
		};
		/** The shared store (a plugin-owned singleton for the page lifetime). */
		const toastStore = new ToastStore();
		/**
		* Mount the toast stack on document.body.
		* @param onOpenSession - opens a session by id (toast click).
		* @returns disposer unmounting the React root and removing the container.
		*/
		function mountToasts(onOpenSession) {
			const container = document.createElement("div");
			container.dataset.dshNotifyToasts = "";
			document.body.appendChild(container);
			const root = (0, react_dom_client.createRoot)(container);
			root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: toast_module_css_default.host,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToastStack, {
					store: toastStore,
					onOpenSession
				})
			}));
			return () => {
				root.unmount();
				container.remove();
			};
		}
		function ToastStack({ store, onOpenSession }) {
			const items = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: toast_module_css_default.stack,
				role: "status",
				"aria-live": "polite",
				children: items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toast, {
					item,
					onDismiss: () => {
						store.dismiss(item.id);
					},
					onOpenSession
				}, item.id))
			});
		}
		function Toast({ item, onDismiss, onOpenSession }) {
			(0, react.useEffect)(() => {
				const timer = window.setTimeout(onDismiss, item.durationMs ?? AUTO_DISMISS_MS);
				return () => {
					window.clearTimeout(timer);
				};
			}, [
				onDismiss,
				item.id,
				item.durationMs
			]);
			const open = (0, react.useCallback)(() => {
				if (item.sessionId !== void 0) onOpenSession(item.sessionId);
				onDismiss();
			}, [
				item.sessionId,
				onOpenSession,
				onDismiss
			]);
			const close = (0, react.useCallback)((event) => {
				event.stopPropagation();
				onDismiss();
			}, [onDismiss]);
			const handleKeyDown = (0, react.useCallback)((event) => {
				if (event.target !== event.currentTarget) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					open();
				}
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: toast_module_css_default.toast,
				"data-dsh-notify-toast": "",
				role: "button",
				tabIndex: 0,
				onClick: open,
				onKeyDown: handleKeyDown,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: toast_module_css_default.close,
						"aria-label": "关闭通知",
						onClick: close,
						children: "×"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: toast_module_css_default.title,
						children: item.title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: toast_module_css_default.body,
						children: item.body
					})
				]
			});
		}
		//#endregion
		//#region src/client/watcher.ts
		/** Map one runtime pending status to a notification kind. */
		function pendingKind(pending) {
			return pending === "plan-review" ? "planReview" : pending;
		}
		/**
		* Project a session-list snapshot into normalized rows (only ids-listed
		* sessions; breadcrumb-only entries stay out of notifications).
		* @param snapshot - the current `SessionListState`.
		* @returns rows in list order.
		*/
		function rowsOf(snapshot) {
			const rows = [];
			for (const id of snapshot.ids) {
				const summary = snapshot.byId[id];
				if (summary === void 0) continue;
				rows.push({
					id: String(id),
					label: summary.displayTitle ?? String(id),
					running: summary.running,
					pending: summary.pendingInteraction,
					completed: summary.completed ?? false,
					current: snapshot.current !== void 0 && String(snapshot.current) === String(id)
				});
			}
			return rows;
		}
		/**
		* Diff the previous rows against the current ones.
		* @param prev - previous normalized rows keyed by session id.
		* @param rows - current normalized rows.
		* @param pageActive - whether the page is visible AND focused (suppresses the
		*   completion notification for the current session the user is watching).
		* @param onStart - whether start notifications are enabled.
		* @param includeNew - whether rows never seen before produce events. The
		*   initial baseline keeps this false (reloads stay silent); after the first
		*   snapshot, true makes sessions created later notify on arrival.
		* @returns events in list order.
		*/
		function diffSessions(prev, rows, pageActive, onStart, includeNew = false) {
			const events = [];
			for (const row of rows) {
				const before = prev.get(row.id);
				if (before === void 0) {
					if (!includeNew) continue;
					if (row.pending !== void 0) events.push({
						kind: pendingKind(row.pending),
						sessionId: row.id,
						label: row.label
					});
					else if (row.completed) events.push({
						kind: "completion",
						sessionId: row.id,
						label: row.label
					});
					else if (onStart && row.running) events.push({
						kind: "start",
						sessionId: row.id,
						label: row.label
					});
					continue;
				}
				const completedNow = row.completed && !before.completed;
				const finishedUnseen = before.running && !row.running && !pageActive && row.current;
				if (completedNow || finishedUnseen) events.push({
					kind: "completion",
					sessionId: row.id,
					label: row.label
				});
				if (onStart && !before.running && row.running) events.push({
					kind: "start",
					sessionId: row.id,
					label: row.label
				});
				if (row.pending !== void 0 && row.pending !== before.pending) events.push({
					kind: pendingKind(row.pending),
					sessionId: row.id,
					label: row.label
				});
			}
			return events;
		}
		/**
		* Subscribe to the sessions list and forward diffs as notification events.
		* @param sessions - the client sessions service (resolved by the caller; the
		*   Context-merged `sessions` property conflicts with the host `dsh-session`
		*   merge in a single-program build, so this module takes the service value
		*   directly instead of a Context).
		* @param getConfig - reader for the CURRENT plugin config (gates `onStart`;
		*   other gates apply at the dispatch site). Read per diff so live settings
		*   changes take effect without re-mounting.
		* @param onEvent - event consumer (synchronous; must not throw).
		* @returns disposer unsubscribing the store.
		*/
		function mountWatcher(sessions, getConfig, onEvent) {
			const list = sessions.list;
			let prev = new Map(rowsOf(list.getSnapshot()).map((row) => [row.id, row]));
			return list.subscribe(() => {
				const rows = rowsOf(list.getSnapshot());
				const pageActive = typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
				const events = diffSessions(prev, rows, pageActive, getConfig().onStart, true);
				prev = new Map(rows.map((row) => [row.id, row]));
				for (const event of events) onEvent(event);
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services: the sessions store and the slot registry must be up before the plugin mounts. */
		const inject = ["sessions", "slots"];
		/** Monotonic toast id source. */
		let toastId = 0;
		/** Blocking-interaction toasts stay visible this long (the user may be away). */
		const BLOCKING_TOAST_MS = 5 * 6e4;
		/**
		* Mount the notification watcher, toast stack, and settings section.
		* @param ctx - client root context (sessions service).
		* @param config - row config (defaults applied when absent).
		*/
		function apply(ctx, config = {}) {
			const cfg = withDefaults(config);
			if (!cfg.enabled) return;
			const sessions = ctx.sessions;
			if (sessions === void 0) return;
			const settingsClient = new NotifySettingsClient();
			settingsClient.load();
			/** Live config: settings-resolved value when ready, composition entry otherwise. */
			const getConfig = () => {
				const snapshot = settingsClient.getSnapshot();
				if (snapshot.status === "ready" && snapshot.value !== void 0) return snapshot.value;
				return cfg;
			};
			const disposers = [];
			const openSession = (sessionId) => {
				try {
					sessions.open(sessionId);
				} catch (error) {
					console.warn("[dsh-notify] open session failed:", error);
				}
			};
			try {
				disposers.push(mountWatcher(sessions, getConfig, (event) => {
					handleEvent(sessions, getConfig, event, openSession);
				}));
				disposers.push(mountToasts(openSession));
				disposers.push(ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id: "dsh-notify",
					order: 200,
					label: "通知"
				}, () => (0, react.createElement)(NotifySettingsSection, { settings: settingsClient }))));
			} catch (error) {
				console.warn("[dsh-notify] mount failed:", error);
			}
			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) dispose();
			}, "dsh-notify: mounts");
		}
		/** Dispatch one watcher event to the in-page toast stack. */
		function handleEvent(sessions, getConfig, event, openSession) {
			const cfg = getConfig();
			if (!cfg.enabled) return;
			if (event.kind === "completion" && !cfg.onCompletion) return;
			if (event.kind === "start" && !cfg.onStart) return;
			if (event.kind === "approval" && !cfg.onApproval) return;
			if ((event.kind === "question" || event.kind === "planReview") && !cfg.onQuestion) return;
			console.info(`[dsh-notify] event: ${event.kind} session=${event.sessionId}`);
			const message = applyCustomTitle(messageFor(sessions, cfg, event), cfg.customTitle);
			const durationMs = event.kind === "approval" || event.kind === "question" || event.kind === "planReview" ? BLOCKING_TOAST_MS : void 0;
			if (document.visibilityState === "visible") toastStore.push({
				id: ++toastId,
				title: message.title,
				body: message.body,
				sessionId: event.sessionId,
				durationMs
			});
		}
		/** Build the notification copy for one event (richer approval detail when available). */
		function messageFor(sessions, cfg, event) {
			if (event.kind === "completion") return completionMessage(cfg.language, event.label);
			if (event.kind === "start") return startMessage(cfg.language, event.label);
			if (event.kind === "question") return questionMessage(cfg.language, event.label);
			if (event.kind === "planReview") return planReviewMessage(cfg.language, event.label);
			return approvalMessage(cfg.language, event.label, ...approvalDetail(sessions, event.sessionId));
		}
		/** Read the pending approval's tool name and reason off the session snapshot. */
		function approvalDetail(sessions, sessionId) {
			try {
				const approval = (sessions.binding(sessionId)?.session.getSnapshot().pending ?? []).find((item) => item.kind === "approval");
				if (approval !== void 0 && approval.kind === "approval") return [approval.payload.toolName, approval.payload.reason];
			} catch (error) {
				console.warn("[dsh-notify] approval detail lookup failed:", error);
			}
			return [];
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map