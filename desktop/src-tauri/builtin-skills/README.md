# Built-in Skills

将技能目录放在这里，构建时它们会自动打包到应用中。

## 目录结构

```
builtin-skills/
  my-skill/
    SKILL.md       ← 技能定义文件（必需）
    helper.sh      ← 附加脚本（可选）
  another-skill/
    SKILL.md
```

## SKILL.md 格式

```markdown
---
name: my-skill
description: 技能描述
user-invocable: true
---

技能的具体指令和内容...
```

## 工作原理

应用启动时，`builtin-skills/` 下的技能会自动播种到数据目录的 `skills/` 文件夹中。
已存在的同名技能不会被覆盖（幂等）。
