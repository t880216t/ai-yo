# Built-in Plugins

将插件放在这里，构建时它们会自动打包到应用中，首次启动时自动安装。

## 目录结构

```
builtin-plugins/
  known_marketplaces.json              ← 注册内置 marketplace
  marketplaces/
    builtin/
      .claude-plugin/
        marketplace.json               ← marketplace 清单
      my-plugin/                       ← 你的插件
        .claude-plugin/
          plugin.json                  ← 插件定义
        SKILL.md                       ← 技能文件
        ...
```

## 添加插件

1. 在 `marketplaces/builtin/` 下创建插件目录
2. 创建 `.claude-plugin/plugin.json`（参考 [schema](https://docs.claude.codes/plugins/reference)）
3. 在 `marketplace.json` 的 `plugins` 数组中添加条目：
   ```json
   { "name": "my-plugin", "source": "./my-plugin" }
   ```

## 工作原理

应用启动时 `CLAUDE_CODE_PLUGIN_SEED_DIR` 自动指向此目录，现有的种子 marketplace 注册流程会：
1. 读取 `known_marketplaces.json` 注册 marketplace
2. 从 marketplace 清单加载插件列表
3. 将插件安装到用户的配置目录

整个过程全自动，无需用户手动操作。
