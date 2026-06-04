# 子生成器详细参考

## 总则

子生成器不是彼此孤立的"出题器"，而是围绕同一个目标协作：
- 覆盖关键行为
- 保留关键测试资产
- 生成可验证的结果
- 避免把复杂需求过度简化

在调用任意生成器前，先检查两个问题：
1. 这个功能要验证什么行为？
2. 这个功能要靠什么证据证明它正确？

如果一个功能需要多种证据类型，请在生成时同步体现，不要只生成最表层的 UI 或 happy path 用例。

## 生成器的输出形态

生成器的输出**不是独立的 TC 节点**，而是中间结构 —— **`partition_group`**（分区组）。SKILL.md Step 2 / Step 3 根据聚合规则把这些 partition_group 折叠成最终的 `type: matrix` 或拆为 `type: single` YAML 用例。

`partition_group` 的中间结构：

```yaml
partition_group:
  generator: equivalence | boundary | decision_table | exception | state | scenario | security | performance | prompt
  field_or_rule: <字段名 / 规则集名>      # 聚合判定的关键键
  verification_method: <枚举>             # 聚合判定的关键键
  evidence_types: [...]                   # 聚合判定的关键键
  preconditions: [...]                    # 聚合判定的关键键
  group_name: <对应将来分组 step 的组名（action）>
  rows:
    - action: ...
      result: ...
      source: ...
      verbatim?: true
      status?: blocked | inferred
```

**适用规则**：
- 等价类 / 边界值 / 决策表 生成器**默认按 partition_group 输出**，由 Step 2 判定是否聚合为 matrix（≥3 条且通过强制触发条件）或在不足 3 条时拆为 single
- 异常场景 / 状态转换 / 场景流 / 安全 / 性能 / Prompt 回归 生成器输出**以 scenario_chain 或 single 为主**，不强制走 partition_group
- 任何 partition_group 中的 row 都必须保留 `source` —— 这是溯源的最小单位

## 证据维度检查

无论调用哪个生成器，都要检查该功能是否涉及以下证据维度：

| 证据维度 | 典型验证对象 |
|----------|-------------|
| UI / 内容 | 页面元素、提示、输出内容、展示状态 |
| API / 接口 | 请求、响应、状态码、字段约束 |
| 状态 / 数据 | 对象状态、副作用、一致性、持久化结果 |
| Event / Message | 事件触发、消息发送、消费、重试 |
| File | 导入导出、生成文件、格式、命名 |
| Log / Metrics | 日志、埋点、指标、审计轨迹 |
| External System | 外部系统反馈、回调、同步结果 |

如果需求中明确存在这些证据类型，但生成结果没有体现，说明覆盖不完整。

## 关键测试资产保护

以下内容一旦在需求中出现，就不能在生成或去重过程中被轻易概括掉：
- 需要逐项验证的内容
- 需要保留完整列表的规则或枚举
- 需要验证的状态、副作用或一致性
- 需要覆盖的外部交互反馈
- 需要多观测面共同确认的证据链

默认策略：
- **代表值** 适用于普通等价类
- **完整列表 / 矩阵** 适用于“列表本身就是需求”
- **组合用例** 适用于多条件联动、共享资源冲突、异常恢复
- **证据链用例** 适用于单一观测面无法证明正确的功能

## 1. 等价类生成器

**适用场景:** 输入验证、参数校验、分类处理

**方法:**
- 将输入域划分为有效等价类和无效等价类
- 每个等价类生成一条 row（条件 + 预期 + 溯源），**整体作为一个 partition_group 输出**
- 不在生成器内部预先分配 TC-id 或决定是否独立成 TC，这个由 SKILL.md Step 2 决定

**注意事项:**
- 当需求强调"完整名单""完整类别""完整映射"时，必须每个类目独立成 row（不能用代表值代替完整名单）
- 如果等价类背后还存在状态副作用或外部反馈，把副作用相关的 row 单列一个 partition_group（不同 verification_method/evidence_types 不应聚合到同一 group）

**输出结构（partition_group YAML 节点）:**

```yaml
partition_group:
  generator: equivalence
  field_or_rule: email_format
  verification_method: ui_text_assertion
  evidence_types: [UI]
  preconditions:
    - 进入注册表单
  group_name: 邮箱格式校验
  rows:
    - action: 输入 "user@example.com"
      result: 校验通过
      source: L12
    - action: 输入 "user+tag@example.com"
      result: 校验通过
      source: L12
    - action: 留空提交
      result: 逐字显示「请填写邮箱」
      source: L13
      verbatim: true
    - action: 输入 "user@" (无域名)
      result: 逐字显示「邮箱格式不正确」
      source: L14
      verbatim: true
    - action: 输入 "user@@example.com" (多个 @)
      result: 逐字显示「邮箱格式不正确」
      source: L14
      verbatim: true
```

Step 2 接收后：本 group 共 5 条 row 且满足强制触发条件 → 折叠为 `type: matrix` 用例的一个分组 step（`group: true` + `children`，每条 row 成为一个 children 叶子 step，自带 `action` / `result` / `level` / `source`）；若总 row 数 <3，则拆为 single 用例。

## 2. 边界值生成器

**适用场景:** 数值范围、字符串长度、集合大小

**方法:**
- 对每个边界生成 row：边界值、边界-1、边界+1
- 特殊值 row：0, 空, null, 最大值
- **整体作为一个 partition_group 输出**，按"边界维度"命名 group_name

**注意事项:**
- 边界值不只用于输入，也可用于配额、阈值、容量、数量、时间窗、重试次数等规则
- 如果边界命中后会触发状态变化、限流、回滚或额外提示，应补充对应证据断言（必要时拆出独立 group 或独立 single 用例，避免不同 evidence_types 混入同一 group）

**边界模式:**
| 类型 | 测试点 |
|------|--------|
| 数值范围 [min, max] | min-1, min, min+1, max-1, max, max+1 |
| 字符串长度 [0, maxLen] | 0, 1, maxLen-1, maxLen, maxLen+1 |
| 集合大小 [0, maxSize] | 0, 1, maxSize-1, maxSize, maxSize+1 |
| 字符类别（输入校验场景） | 各空白变体分别测试（空格、制表符、换行符、回车符）、ASCII控制字符区间（0x00-0x1F及0x7F）、不安全分隔符集（尖括号、花括号、管道符、反斜杠、脱字符、反引号等RFC定义的非安全字符）、非ASCII多字节Unicode字符 |

**注意**: 对于文本输入校验类需求，字符类别边界与字符串长度边界同等重要。如果需求定义了输入合法性规则（格式约束、字符白名单/黑名单、编码要求），必须对上表中每个字符类别生成独立 row，不能仅用空格代表所有空白类字符。

**输出结构（partition_group YAML 节点）:**

```yaml
partition_group:
  generator: boundary
  field_or_rule: phone_length_+86
  verification_method: ui_text_assertion
  evidence_types: [UI]
  preconditions:
    - 区号选择 +86
  group_name: 长度 × 区号
  rows:
    - action: 输入 "1380000123" (10 位)
      result: 逐字显示「请填写正确的手机号」
      source: L41
      verbatim: true
    - action: 输入 "13800001234" (11 位)
      result: 校验通过
      source: L41
    - action: 输入 "138000012345" (12 位)
      result: 逐字显示「请填写正确的手机号」
      source: L41
      verbatim: true
```

## 3. 异常场景生成器

**适用场景:** 错误处理、容错机制

**异常分类:**
| 类别 | 场景 |
|------|------|
| 网络异常 | 超时、断连、DNS 解析失败 |
| 系统异常 | 内存不足、磁盘满、进程崩溃 |
| 数据异常 | 格式错误、编码问题、数据损坏 |
| 权限异常 | 未授权、Token 过期、角色不匹配 |
| 并发异常 | 竞态条件、死锁、重复提交 |

**注意事项:**
- 不只测试“报错了”，还要测试异常后是否保持一致状态
- 异常用例优先补充：回滚、补偿、重试、降级、部分成功、错误可见性
- 如果异常结果需要通过日志、事件、状态或外部反馈验证，应明确写入预期结果

## 4. 状态转换生成器

**适用场景:** 有状态机特征的模块（对象生命周期、工作流）

**方法:**
1. 识别所有状态
2. 识别所有转换（触发事件 + 条件）
3. 生成正向转换用例（每个合法转换）
4. 生成反向转换用例（每个非法转换）

**注意事项:**
- 除了状态名称，还要记录谁触发、在什么条件下触发、触发后谁能观察到变化
- 如果状态变化会影响其他模块或共享资源，应和跨模块场景联合使用

**输出结构:**
```
状态: [S1, S2, S3, ...]
转换:
  S1 --event1--> S2 (条件: xxx)
  S2 --event2--> S3 (条件: xxx)

用例:
  TC-xxx: S1 -> S2 (正向，合法转换)
  TC-xxx: S1 -> S3 (反向，跳过中间状态)
```

## 5. 场景流生成器

**适用场景:** 端到端流程、用户操作路径、证据链路径

**场景类型:**
- **Happy Path**: 主成功流程
- **Alternative Path**: 合法的替代路径
- **Error Recovery**: 出错后的恢复路径

**方法:**
1. 绘制流程图
2. 识别所有路径
3. 为每条路径生成端到端用例

**补充场景类型:**
- **Evidence Chain**: 一个行为需要多个观测面共同验证
- **Shared Resource**: 多个步骤共享同一资源，需验证隔离/一致性

**注意事项:**
- 不要默认所有场景流都必须拆成最小颗粒
- 当需求本身是组合规则或多阶段验证时，应保留组合型场景流

## 6. 决策表生成器

**适用场景:** 复杂业务规则、多条件组合

**方法:**
1. 列出所有条件
2. 列出所有动作
3. 生成条件组合矩阵
4. 每条规则（Rule）作为一条 row（最终成为分组 step 的一个 children 叶子 step）：`action` 列出该规则下所有条件取值（用 `|` block scalar + `1. 2. 3.`），`result` 列出对应动作
5. 优化：合并无差异的规则（在 group 末尾以注释或独立 row 说明合并依据）
6. **整体作为一个 partition_group 输出**

**注意事项:**
- 决策表优先用于"组合本身是风险"的场景，而不是事后把所有内容拆回代表值
- 如果矩阵规模过大，可压缩为高风险组合，但必须在 deduplication-report.md 中说明省略规则及保留依据
- 如果矩阵命中后会产生不同观测面结果（如部分规则触发 API 写入、部分仅展示 UI），把不同 evidence_types 的规则拆为多个 partition_group，避免 evidence_types 不一致

**输出结构（partition_group YAML 节点）:**

```yaml
partition_group:
  generator: decision_table
  field_or_rule: discount_rule_matrix
  verification_method: ui_text_assertion
  evidence_types: [UI]
  preconditions:
    - 进入结算页
  group_name: 折扣规则决策矩阵
  rows:
    - action: |
        1. C1: 用户是 VIP = true
        2. C2: 订单金额 ≥ 100 = true
      result: 折扣 = 20%；展示 "VIP 满减"
      source: L88
    - action: |
        1. C1: 用户是 VIP = true
        2. C2: 订单金额 ≥ 100 = false
      result: 折扣 = 10%；展示 "VIP 普通折扣"
      source: L89
    - action: |
        1. C1: 用户是 VIP = false
        2. C2: 订单金额 ≥ 100 = true
      result: 折扣 = 5%；展示 "满减促销"
      source: L90
    - action: |
        1. C1: 用户是 VIP = false
        2. C2: 订单金额 ≥ 100 = false
      result: 无折扣
      source: L91
```

## 7. 安全测试生成器

**适用场景:** 安全敏感模块

**OWASP 分类:**
| 类别 | 测试项 |
|------|--------|
| 注入 | SQL 注入、XSS、命令注入 |
| 认证 | 弱密码、暴力破解、Session 劫持 |
| 授权 | 越权访问、IDOR、权限提升 |
| 数据暴露 | 敏感信息泄露、错误信息过详 |
| CSRF | 跨站请求伪造 |
| SSRF | 服务端请求伪造 |

**注意事项:**
- 安全测试不仅关注攻击是否成功，也关注失败后是否留下错误状态或泄露额外证据
- 对权限、身份、会话、资源隔离类问题，优先检查共享资源和跨边界访问

## 8. 性能测试生成器

**适用场景:** 性能关键模块

**测试类型:**
| 类型 | 描述 | 指标 |
|------|------|------|
| 负载测试 | 正常负载下的性能 | 响应时间、吞吐量 |
| 压力测试 | 超出正常负载 | 错误率、恢复时间 |
| 持久性测试 | 长时间运行 | 内存泄漏、连接泄漏 |
| 峰值测试 | 突发流量 | 峰值响应时间 |

**用例结构:**
```
TC-xxx: [测试名称]
  类型: 负载测试
  并发用户: N
  持续时间: X 分钟
  预期:
    - 平均响应时间 < Y ms
    - P99 响应时间 < Z ms
    - 错误率 < W%
```

**注意事项:**
- 性能用例不只验证速度，也可验证稳定性、资源释放、恢复能力和指标可见性
- 如果性能退化会引发功能、状态或外部交互问题，应补充异常或场景流用例

## 生成器协同规则

常见协同方式：
- **等价类 + 边界值**: 输入与阈值同时存在时
- **场景流 + 异常场景**: 主流程需要覆盖失败恢复时
- **状态转换 + 场景流**: 状态变化贯穿完整流程时
- **决策表 + 场景流**: 复杂规则需要放进真实业务路径时
- **任意生成器 + 证据链要求**: 需要多观测面共同验证时

不要把“生成器协同”理解成“全部调用”。协同的目标是让测试既完整又不过度冗余。

## 何时保留组合用例

出现下面情况时，优先保留组合型用例，而不是全部拆成单点：
- 多条件组合本身就是风险来源
- 需要验证共享资源冲突
- 需要验证异常后的恢复或回滚
- 需要同时检查行为结果和状态/数据副作用
- 需要从多个观测面共同判断是否正确

## 何时代表值不够

代表值不足以覆盖需求的典型信号：
- 文档给出完整列表、完整矩阵、完整映射
- 每个条目都可能有不同风险或不同结果
- 规则命中后会触发不同状态、副作用或外部反馈
- 用户明确要求“逐项比对”“逐条覆盖”“完整校验”
