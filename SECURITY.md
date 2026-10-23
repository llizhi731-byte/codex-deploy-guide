# 安全说明

## 这个项目如何处理密钥

- 页面**不会**把 API Key 写入 `localStorage`、Cookie、IndexedDB 或任何文件。
- Key 只存在于当前标签页的内存里，用于实时生成 `config.toml` 与一键脚本的文本。
- 生成的内容需要你手动复制到 Termux，页面自身不发起任何网络请求、不做任何上报。

## 已知风险：明文 Key

原教程里的 `config.toml` 直接把 Key 写在 `openai_api_key = "sk-..."`，属于明文存储：
任何能读到该文件（或看到你的终端回滚、截图、录屏）的人都能拿走它。

建议：

1. 到中转站后台**重新生成**该 Key；
2. 优先用 `env_key` 方式，把密钥放在环境变量里而不是配置文件里；
3. 不要把带 Key 的终端截图发到 issue / 群里。

## 报告安全问题

请通过 GitHub 的 **Security → Report a vulnerability**（私密报告）提交，不要直接开公开 issue。
