# 账号与模型管理 / Account and model management

在 **设置 → 订阅 → 对应服务商 → 管理** 中配置账号。保存前的修改只属于本地草稿；取消不会写入配置。

## 配置含义

- **别名**：例如“个人”“工作”。独立模型条目显示别名，内部绑定使用稳定账号 key；改别名不会改变绑定。
- **加入自动 Pool**：允许这个账号参与普通对话模型入口的自动调度。默认开启。
- **Pool 模型列表**：限制该账号允许参与 Pool 的模型。“跟随全部模型”包含将来发现的新模型；显式全选只选择当前列表；全不选不允许任何模型参与。
- **独立模型入口**：为账号增加单独的模型选择条目。默认关闭，开启后直接绑定该账号，不随 Pool 切换。
- **代理**：该账号专用的代理地址，明文输入，例如 `socks5://user:pass@proxy.example:1080` 或 `http://proxy.example:8080`。留空表示跟随全局代理设置。填写后，该账号的全部请求（模型请求、令牌刷新、用量查询、模型目录发现、该账号的工具调用）都从它出去；全局的绕过列表对已单独指定代理的账号不生效。
- **测试拉取模型**：按该账号单独发一次模型目录请求，结果直接显示在这一张卡片上（成功时的模型数量与耗时，或失败原因）。它使用上面输入框里的当前内容——即使还没保存也能先测；留空则这次测试明确不走账号代理。测试不会改动任何已保存的模型列表，模型目录仍按原有刷新策略（启动时、每小时，或“刷新模型列表”）更新。

## 逐个账号验证代理

每个账号卡片上的「测试拉取模型」就是用来单独验证“这个账号走自己的代理能不能拉取模型”的：

- **用当前输入，不要求先保存**：填好代理直接点即可；代理地址格式不对会在发出请求前就报错。
- **每个账号独立**：只发这一个账号的请求，其他账号的代理是否可用互不影响。
- **不读缓存**：每次都是一次真实请求，因此缓存里的旧模型列表不会伪装成成功；已保存的模型目录也不会被这次测试改写。
- **结果可核对**：成功时显示模型数量、耗时和实际走的线路（账号代理 / DSH 网络设置）；失败时显示具体原因（例如 `connect ECONNREFUSED`）。
- 令牌过期会在测试时按正常流程刷新一次，所以“代理不通”和“登录失效”会给出不同的错误。

## 工作与个人账号示例

| 账号 | 别名 | 加入自动 Pool | 独立模型入口 |
|---|---|---|---|
| 个人账号 | 个人 | 开启 | 可选 |
| 工作账号 | 工作 | 关闭 | 开启 |

普通模型条目只使用允许参与 Pool 的账号。选择带“工作”别名的独立模型条目后，该模型调用只使用工作账号；账号被删除、独立入口被关闭、凭据失效或额度不足时，不会静默改用个人账号。

## 范围与限制

这些配置约束插件的 **LLM 对话模型路由**，不是整个会话的隐私隔离开关。图片生成、视频生成和 X 搜索等工具仍按各自选中的账号走（因此会跟随该账号的代理），但不会因为此处的设置而切换账号；指定其他模型的子代理也不因此自动绑定账号。需要严格的工作/个人数据隔离时，不能只依赖此设置。

服务商级“编辑模型列表”继续管理模型显示、上下文和工具偏好；账号管理不重置这些设置。默认账号星标与 Pool 参与开关是两个不同配置。

---

Open **Settings → Subscriptions → provider → Manage** to edit account aliases, automatic-pool participation, per-account pool model allowlists, independent model entries, and a per-account proxy.

Existing accounts default to participating in the pool, with independent entries disabled. An absent model allowlist follows all discovered models, including future additions; an empty allowlist permits none. Independent entries bind a stable account key, not its editable alias, and do not fall back to another account when unavailable.

The per-account **Proxy** field is a plain-text URL (`socks5://user:pass@host:port`, `socks5h://…`, `http://…`, `https://…`) shown and stored as typed, credentials included. Blank means the account follows the plugin-wide proxy. A configured proxy covers every request of that account — model calls, token refresh, usage lookups, model discovery and its tool calls — and is not subject to the plugin-wide bypass list. An unreachable proxy fails the request instead of silently going direct.

These controls govern LLM model routing only. Image/video generation, X search, and agents explicitly selecting other models keep their own account selection (and follow that account's proxy). This feature is not a session-wide privacy-isolation guarantee.

### Testing one account's proxy

Every account card also has a **Test model fetch** button: one live model-list request for that account alone, reported on that card (model count and latency on success, the reason on failure). It exists to answer one question per account — *can this account pull models through its own proxy?*

- **It tests what the field says, saving not required.** An unsaved proxy URL is used for the probe only, through a throwaway tunnel; live traffic keeps using the stored setting. A blank field means this probe deliberately takes no account proxy, so it exercises DSH's own network settings even when a proxy is saved.
- **One account per click.** No sibling account, pool, or session is touched, so a broken proxy on one account cannot be masked by another.
- **No cache, no fallback.** The probe is a real request: a cached or built-in catalog is never replayed as success, and the probe does not rewrite the saved model lists (those still refresh on the normal schedule, or via "Refresh model lists").
- **The answer is checkable.** Success reports the route actually used (account proxy vs DSH network settings) plus the model count and latency; a failure names the cause (`connect ECONNREFUSED`, an unsupported proxy scheme, a revoked login), so "the proxy is unreachable" is never confused with "the account is logged out".

A token that expired on its own is refreshed during the probe, exactly as a normal request would.
