# Supertester Skill 自动迭代优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Python 编排器，自动化 Supertester 插件的 skill 规则优化循环：生成→对比打分→分析差距→修改 skill→再生成，直到三阶段多维度评分收敛。

**Architecture:** Python 主编排器通过 `claude -p` 独立会话调用 Claude；参考用例为基准 A，通用测试方法论为基准 B，双基准评分。Phase 1/2/3 各自迭代修改对应 skill；通用性三层防护（prompt 硬约束 + 自动审查 + 抽象映射）防止过拟合。按模块迭代，文件持久化所有中间产物支持断点恢复。

**Tech Stack:** Python 3.11+ (stdlib + unidiff + jinja2), Claude Code CLI (`claude -p`), pytest。

**Spec:** `docs/superpowers/specs/2026-04-12-auto-iterate-design.md`

**Working directory:** 所有路径相对 `E:/workspace/aise/TestingAgent/scripts/auto-iterate/`

---

## Task 1: 项目脚手架

**Files:**
- Create: `scripts/auto-iterate/requirements.txt`
- Create: `scripts/auto-iterate/.gitignore`
- Create: `scripts/auto-iterate/__init__.py`
- Create: `scripts/auto-iterate/tests/__init__.py`
- Create: `scripts/auto-iterate/README.md`

- [ ] **Step 1: 创建目录结构**

```bash
cd E:/workspace/aise/TestingAgent
mkdir -p scripts/auto-iterate/prompts
mkdir -p scripts/auto-iterate/tests
mkdir -p scripts/auto-iterate/output
```

- [ ] **Step 2: 写入 requirements.txt**

```
unidiff>=0.7.5
jinja2>=3.1.0
pytest>=8.0.0
```

- [ ] **Step 3: 写入 .gitignore**

```
.venv/
output/
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 4: 写入 __init__.py (两个都是空文件)**

- [ ] **Step 5: 写入 README.md**

```markdown
# Supertester Auto-Iterate

自动迭代优化 Supertester 插件的 skill 规则。

## Setup

使用 [uv](https://docs.astral.sh/uv/) 管理虚拟环境和依赖。

```bash
cd scripts/auto-iterate
uv venv                              # 创建 .venv (首次)
source .venv/Scripts/activate        # Git Bash
uv pip install -r requirements.txt   # 安装依赖
```

## Run

```bash
python orchestrator.py              # 首次或恢复
python orchestrator.py --status     # 查看进度
python orchestrator.py --phase 3    # 只跑 Phase 3
python orchestrator.py --module "URL通用校验"  # 只跑特定模块
```

详见 `docs/superpowers/specs/2026-04-12-auto-iterate-design.md`。
```

- [ ] **Step 6: 创建 venv 并安装依赖 (使用 uv)**

```bash
cd scripts/auto-iterate
uv venv
source .venv/Scripts/activate
uv pip install -r requirements.txt
```

Expected: pytest/unidiff/jinja2 安装成功。

- [ ] **Step 7: Commit**

```bash
git add scripts/auto-iterate/requirements.txt scripts/auto-iterate/.gitignore scripts/auto-iterate/__init__.py scripts/auto-iterate/tests/__init__.py scripts/auto-iterate/README.md
git commit -m "chore: scaffold auto-iterate project"
```

---

## Task 2: 配置模块 `config.py`

**Files:**
- Create: `scripts/auto-iterate/config.py`
- Test: `scripts/auto-iterate/tests/test_config.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_config.py
from config import Config

def test_config_defaults():
    cfg = Config()
    assert cfg.prd_path.endswith("VisiGEO-PRD.md")
    assert cfg.reference_path.endswith(".json")
    assert cfg.model == "sonnet"
    assert cfg.convergence["phase3"]["min_total_score"] == 0.85
    assert "process_feedback" in " ".join(cfg.abstraction_map.values())

def test_config_convergence_structure():
    cfg = Config()
    for phase in ["phase1", "phase2", "phase3"]:
        assert "min_total_score" in cfg.convergence[phase]
        assert "min_dimension_score" in cfg.convergence[phase]
        assert "max_iterations" in cfg.convergence[phase]
```

- [ ] **Step 2: 运行测试，预期失败**

```bash
cd scripts/auto-iterate
source .venv/Scripts/activate
pytest tests/test_config.py -v
```

Expected: FAIL - `config` module not found

- [ ] **Step 3: 实现 config.py**

```python
# config.py
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent  # scripts/auto-iterate/
TESTING_AGENT_ROOT = PROJECT_ROOT.parent.parent  # TestingAgent/

@dataclass
class Config:
    # 输入路径
    prd_path: str = "E:/workspace/aise/geo-sass-re/requirements/VisiGEO-PRD.md"
    reference_path: str = "E:/workspace/aise/data/GEO_LV_2026.01_cases0326.json"
    skill_dir: str = str(TESTING_AGENT_ROOT / "skills")
    agent_dir: str = str(TESTING_AGENT_ROOT / "agents")
    output_dir: str = str(PROJECT_ROOT / "output")
    prompt_dir: str = str(PROJECT_ROOT / "prompts")

    # Claude CLI
    model: str = "sonnet"
    timeout: int = 300
    max_patch_revise_attempts: int = 2

    # 收敛标准
    convergence: dict = field(default_factory=lambda: {
        "phase1": {"min_total_score": 0.80, "min_dimension_score": 0.60, "max_iterations": 4},
        "phase2": {"min_total_score": 0.75, "min_dimension_score": 0.55, "max_iterations": 4},
        "phase3": {"min_total_score": 0.85, "min_dimension_score": 0.65, "max_iterations": 5},
    })

    # 抽象映射表
    abstraction_map: dict = field(default_factory=lambda: {
        "loading阶段文案未逐项验证": "process_feedback — 阶段性进度反馈需逐阶段验证",
        "运营模式未覆盖": "business_outside_prd — PRD外运营策略需主动澄清",
        "Logo/图片未测": "visual_asset — 视觉资产需标记为 manual/partial",
        "prompt模板未逐字段校验": "contract_content — 内容模板需作为合约逐项验证",
        "处理中刷新未测": "interruption_recovery — 处理中状态需测试中断恢复",
        "列表排序未测": "history_interaction — 列表需覆盖排序/分页/滚动/空状态",
    })
```

- [ ] **Step 4: 运行测试，预期通过**

```bash
pytest tests/test_config.py -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-iterate/config.py scripts/auto-iterate/tests/test_config.py
git commit -m "feat: add config module with convergence thresholds and abstraction map"
```

---

## Task 3: Claude CLI 调用封装 `claude_runner.py`

**Files:**
- Create: `scripts/auto-iterate/claude_runner.py`
- Test: `scripts/auto-iterate/tests/test_claude_runner.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_claude_runner.py
from unittest.mock import patch, MagicMock
from pathlib import Path
import tempfile, json
from claude_runner import claude_call, extract_json

def test_extract_json_plain():
    assert extract_json('{"a": 1}') == {"a": 1}

def test_extract_json_in_code_fence():
    text = 'some text\n```json\n{"a": 1}\n```\ntrailing'
    assert extract_json(text) == {"a": 1}

def test_extract_json_missing_returns_none():
    assert extract_json('no json here') is None

@patch('claude_runner.subprocess.run')
def test_claude_call_writes_output(mock_run, tmp_path):
    mock_run.return_value = MagicMock(stdout='hello world', returncode=0)
    out = tmp_path / "out.txt"
    result = claude_call("prompt", str(out))
    assert result == "hello world"
    assert out.read_text(encoding='utf-8') == "hello world"

@patch('claude_runner.subprocess.run')
def test_claude_call_parses_json(mock_run, tmp_path):
    mock_run.return_value = MagicMock(stdout='```json\n{"x": 42}\n```', returncode=0)
    out = tmp_path / "out.json"
    result = claude_call("p", str(out), parse_json=True)
    assert result == {"x": 42}
```

- [ ] **Step 2: 运行测试，预期失败**

```bash
pytest tests/test_claude_runner.py -v
```

Expected: FAIL - module not found

- [ ] **Step 3: 实现 claude_runner.py**

```python
# claude_runner.py
import subprocess
import json
import re
from pathlib import Path


def extract_json(text: str):
    """从文本中提取 JSON，支持裸 JSON 或 ```json ... ``` 包裹"""
    text = text.strip()
    # 尝试 ```json ... ``` fence
    m = re.search(r'```(?:json)?\s*\n(.*?)\n```', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # 尝试裸 JSON
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 尝试找第一个 { 到最后一个 }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end+1])
            except json.JSONDecodeError:
                return None
        return None


def claude_call(prompt: str, output: str, parse_json: bool = False,
                model: str = "sonnet", timeout: int = 300):
    """调用 claude -p，prompt 通过 stdin 传入，结果写入 output 文件。

    Args:
        prompt: 提示词内容
        output: 结果输出文件路径
        parse_json: 是否解析返回值为 JSON
        model: Claude 模型名
        timeout: 超时秒数

    Returns:
        response 字符串，或 (parse_json=True 时) 解析后的对象，失败返回 None
    """
    cmd = [
        "claude", "-p",
        "--model", model,
        "--output-format", "text",
        "--max-turns", "1",
    ]

    result = subprocess.run(
        cmd,
        input=prompt,
        capture_output=True,
        text=True,
        timeout=timeout,
        encoding='utf-8',
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"claude -p failed (code {result.returncode}): {result.stderr}"
        )

    response = result.stdout.strip()
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    Path(output).write_text(response, encoding='utf-8')

    if parse_json:
        return extract_json(response)
    return response
```

- [ ] **Step 4: 运行测试，预期通过**

```bash
pytest tests/test_claude_runner.py -v
```

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-iterate/claude_runner.py scripts/auto-iterate/tests/test_claude_runner.py
git commit -m "feat: add claude -p CLI runner with JSON extraction"
```

---

## Task 4: 输入拆分 `splitter.py`

**Files:**
- Create: `scripts/auto-iterate/splitter.py`
- Test: `scripts/auto-iterate/tests/test_splitter.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_splitter.py
from pathlib import Path
import json
from splitter import split_reference, split_prd, normalize_module_name

def test_normalize_module_name_strips_numbering():
    assert normalize_module_name("02 URL通用校验") == "URL通用校验"
    assert normalize_module_name("00 公共规则/02 URL通用校验") == "URL通用校验"

def test_split_reference_groups_by_module(tmp_path):
    ref = {
        "data": {
            "cases": [
                {"case_id": "1", "module_path": "A/B/URL通用校验", "case_name": "x", "steps": []},
                {"case_id": "2", "module_path": "A/B/URL通用校验", "case_name": "y", "steps": []},
                {"case_id": "3", "module_path": "A/C/系统异常", "case_name": "z", "steps": []},
            ]
        }
    }
    ref_file = tmp_path / "ref.json"
    ref_file.write_text(json.dumps(ref), encoding='utf-8')

    groups = split_reference(str(ref_file))
    assert "URL通用校验" in groups
    assert len(groups["URL通用校验"]) == 2
    assert "系统异常" in groups
    assert len(groups["系统异常"]) == 1

def test_split_prd_by_headings(tmp_path):
    content = """# 标题
## 模块 A
A 内容
### 子节
子节内容
## 模块 B
B 内容
"""
    prd = tmp_path / "prd.md"
    prd.write_text(content, encoding='utf-8')

    modules = split_prd(str(prd))
    names = [m["name"] for m in modules]
    assert "模块 A" in names
    assert "模块 B" in names
    # 子节应在模块 A 片段内
    mod_a = next(m for m in modules if m["name"] == "模块 A")
    assert "子节内容" in mod_a["content"]
```

- [ ] **Step 2: 运行测试，预期失败**

```bash
pytest tests/test_splitter.py -v
```

Expected: FAIL - module not found

- [ ] **Step 3: 实现 splitter.py**

```python
# splitter.py
import json
import re
from pathlib import Path
from collections import defaultdict


def normalize_module_name(module_path: str) -> str:
    """从 '00 公共规则/02 URL通用校验' 取最后一段，去掉前缀编号。

    例: '98 GEO SaaS/00 公共规则/02 URL通用校验' -> 'URL通用校验'
    """
    last = module_path.rstrip('/').split('/')[-1].strip()
    # 去掉前导编号 (如 "02 "、"01 ")
    return re.sub(r'^\d+\s+', '', last)


def split_reference(ref_path: str) -> dict[str, list]:
    """按 module_path 末尾模块名分组参考用例。

    Returns: {module_name: [case, ...]}
    """
    data = json.loads(Path(ref_path).read_text(encoding='utf-8'))
    cases = data["data"]["cases"]
    groups = defaultdict(list)
    for c in cases:
        name = normalize_module_name(c["module_path"])
        groups[name].append(c)
    return dict(groups)


def split_prd(prd_path: str) -> list[dict]:
    """按 Markdown `##` 二级标题拆分 PRD。

    Returns: [{"name": str, "content": str}, ...]
    """
    text = Path(prd_path).read_text(encoding='utf-8')
    lines = text.split('\n')

    modules = []
    current = None
    for line in lines:
        m = re.match(r'^##\s+(.+?)\s*$', line)
        if m and not line.startswith('###'):
            if current is not None:
                modules.append(current)
            current = {"name": m.group(1).strip(), "content": ""}
        elif current is not None:
            current["content"] += line + "\n"
    if current is not None:
        modules.append(current)
    return modules


def match_modules(prd_modules: list[dict], ref_groups: dict[str, list]) -> list[dict]:
    """将 PRD 模块与参考用例模块对齐。

    匹配策略: PRD 模块名在 ref 模块名中子串匹配 (双向)。
    未匹配的保留为单侧条目 (ref_cases 或 prd_content 为空)。

    Returns: [{"name": str, "prd_content": str|None, "ref_cases": list|None}]
    """
    matched = []
    used_ref = set()
    for pm in prd_modules:
        pname = pm["name"]
        match_ref = None
        for rname in ref_groups:
            if rname in pname or pname in rname:
                match_ref = rname
                break
        if match_ref:
            matched.append({
                "name": pname,
                "prd_content": pm["content"],
                "ref_cases": ref_groups[match_ref],
            })
            used_ref.add(match_ref)
        else:
            matched.append({
                "name": pname,
                "prd_content": pm["content"],
                "ref_cases": None,
            })
    # 未匹配的参考模块单独加入
    for rname, cases in ref_groups.items():
        if rname not in used_ref:
            matched.append({
                "name": rname,
                "prd_content": None,
                "ref_cases": cases,
            })
    return matched
```

- [ ] **Step 4: 运行测试，预期通过**

```bash
pytest tests/test_splitter.py -v
```

Expected: 3 passed

- [ ] **Step 5: 加 match_modules 测试**

```python
# 追加到 tests/test_splitter.py
from splitter import match_modules

def test_match_modules_bidirectional_substring():
    prd = [{"name": "URL通用校验", "content": "prd text"}]
    ref = {"URL通用校验": [{"case_id": "1"}]}
    result = match_modules(prd, ref)
    assert len(result) == 1
    assert result[0]["prd_content"] == "prd text"
    assert result[0]["ref_cases"] == [{"case_id": "1"}]

def test_match_modules_unmatched_both_sides():
    prd = [{"name": "仅PRD模块", "content": "p"}]
    ref = {"仅参考模块": [{"case_id": "1"}]}
    result = match_modules(prd, ref)
    names = [r["name"] for r in result]
    assert "仅PRD模块" in names
    assert "仅参考模块" in names
```

- [ ] **Step 6: 再跑测试**

```bash
pytest tests/test_splitter.py -v
```

Expected: 5 passed

- [ ] **Step 7: Commit**

```bash
git add scripts/auto-iterate/splitter.py scripts/auto-iterate/tests/test_splitter.py
git commit -m "feat: add splitter for PRD modules and reference cases"
```

---

## Task 5: 状态管理 `state.py`

**Files:**
- Create: `scripts/auto-iterate/state.py`
- Test: `scripts/auto-iterate/tests/test_state.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_state.py
from pathlib import Path
from state import State, load_or_init

def test_state_init_defaults(tmp_path):
    s = State(state_file=str(tmp_path / "s.json"))
    assert s.phase0_complete is False
    assert s.phase1_converged is False
    assert s.converged_modules == []
    assert s.history == {}

def test_state_save_load_roundtrip(tmp_path):
    path = str(tmp_path / "s.json")
    s = State(state_file=path)
    s.phase0_complete = True
    s.converged_modules.append("URL通用校验")
    s.add_history("phase1", {"iter": 1, "score": 0.65, "patches_applied": 1})
    s.save()

    s2 = load_or_init(path)
    assert s2.phase0_complete is True
    assert "URL通用校验" in s2.converged_modules
    assert s2.history["phase1"][0]["score"] == 0.65

def test_load_or_init_missing_creates_new(tmp_path):
    path = str(tmp_path / "nonexistent.json")
    s = load_or_init(path)
    assert s.phase0_complete is False
    assert s.state_file == path

def test_state_best_score(tmp_path):
    s = State(state_file=str(tmp_path / "s.json"))
    s.add_history("URL", {"iter": 1, "score": 0.60})
    s.add_history("URL", {"iter": 2, "score": 0.82})
    s.add_history("URL", {"iter": 3, "score": 0.75})
    assert s.best_score("URL") == 0.82
```

- [ ] **Step 2: 运行测试，预期失败**

```bash
pytest tests/test_state.py -v
```

Expected: FAIL - module not found

- [ ] **Step 3: 实现 state.py**

```python
# state.py
import json
from pathlib import Path
from dataclasses import dataclass, field, asdict
from datetime import datetime


@dataclass
class State:
    state_file: str = ""
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())

    phase0_complete: bool = False

    phase1_converged: bool = False
    phase1_iterations: int = 0
    phase1_final_score: dict = field(default_factory=dict)

    phase2_converged: bool = False
    phase2_iterations: int = 0
    phase2_final_score: dict = field(default_factory=dict)

    converged_modules: list = field(default_factory=list)
    unconverged_modules: list = field(default_factory=list)
    current_module: str = ""
    current_iteration: int = 0

    history: dict = field(default_factory=dict)

    def add_history(self, key: str, entry: dict):
        self.history.setdefault(key, []).append(entry)

    def best_score(self, key: str) -> float:
        entries = self.history.get(key, [])
        if not entries:
            return 0.0
        return max(e.get("score", 0.0) for e in entries)

    def save(self):
        Path(self.state_file).parent.mkdir(parents=True, exist_ok=True)
        d = asdict(self)
        Path(self.state_file).write_text(
            json.dumps(d, ensure_ascii=False, indent=2),
            encoding='utf-8'
        )


def load_or_init(state_file: str) -> State:
    if not Path(state_file).exists():
        return State(state_file=state_file)
    data = json.loads(Path(state_file).read_text(encoding='utf-8'))
    data["state_file"] = state_file  # override in case path moved
    return State(**data)
```

- [ ] **Step 4: 运行测试，预期通过**

```bash
pytest tests/test_state.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-iterate/state.py scripts/auto-iterate/tests/test_state.py
git commit -m "feat: add state management with checkpoint/resume"
```

---

## Task 6: Skill 快照与补丁 `patcher.py`

**Files:**
- Create: `scripts/auto-iterate/patcher.py`
- Test: `scripts/auto-iterate/tests/test_patcher.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_patcher.py
from pathlib import Path
from patcher import snapshot, rollback, apply_patch

def test_snapshot_copies_directory(tmp_path):
    src = tmp_path / "src"
    src.mkdir()
    (src / "a.md").write_text("hello", encoding='utf-8')
    (src / "sub").mkdir()
    (src / "sub" / "b.md").write_text("world", encoding='utf-8')

    snap = tmp_path / "snap"
    snapshot(str(src), str(snap))

    assert (snap / "a.md").read_text(encoding='utf-8') == "hello"
    assert (snap / "sub" / "b.md").read_text(encoding='utf-8') == "world"

def test_rollback_restores_content(tmp_path):
    src = tmp_path / "src"
    src.mkdir()
    (src / "a.md").write_text("original", encoding='utf-8')

    snap = tmp_path / "snap"
    snapshot(str(src), str(snap))

    (src / "a.md").write_text("modified", encoding='utf-8')
    assert (src / "a.md").read_text(encoding='utf-8') == "modified"

    rollback(str(src), str(snap))
    assert (src / "a.md").read_text(encoding='utf-8') == "original"

def test_apply_patch_unified_diff(tmp_path):
    target = tmp_path / "a.md"
    target.write_text("line 1\nline 2\nline 3\n", encoding='utf-8')

    diff = """--- a/a.md
+++ b/a.md
@@ -1,3 +1,3 @@
 line 1
-line 2
+line 2 modified
 line 3
"""
    apply_patch(str(target), diff)
    content = target.read_text(encoding='utf-8')
    assert "line 2 modified" in content
    assert "line 1" in content
    assert "line 3" in content
```

- [ ] **Step 2: 运行测试，预期失败**

```bash
pytest tests/test_patcher.py -v
```

Expected: FAIL - module not found

- [ ] **Step 3: 实现 patcher.py**

```python
# patcher.py
import shutil
from pathlib import Path
from unidiff import PatchSet


def snapshot(src_dir: str, dst_dir: str):
    """整目录快照，dst 若存在则覆盖"""
    dst = Path(dst_dir)
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src_dir, dst_dir)


def rollback(src_dir: str, snapshot_dir: str):
    """从快照恢复到 src_dir"""
    src = Path(src_dir)
    if src.exists():
        shutil.rmtree(src)
    shutil.copytree(snapshot_dir, src_dir)


def apply_patch(target_file: str, diff_text: str):
    """应用 unified diff 到单个文件。

    Args:
        target_file: 被补丁的文件绝对路径
        diff_text: unified diff 内容 (含 --- / +++ / @@ 头)
    """
    # 包装成 PatchSet 解析
    patch = PatchSet(diff_text)
    if len(patch) == 0:
        raise ValueError("Empty patch")

    patched_file = patch[0]
    original = Path(target_file).read_text(encoding='utf-8').splitlines(keepends=True)

    # 手动应用 hunks (unidiff 不提供 apply)
    result_lines = []
    src_line = 0  # 0-indexed position in original

    for hunk in patched_file:
        # hunk.source_start is 1-indexed
        hunk_start = hunk.source_start - 1
        # 先复制 hunk 前的未修改行
        while src_line < hunk_start:
            result_lines.append(original[src_line])
            src_line += 1
        # 处理 hunk 内每行
        for line in hunk:
            if line.is_context:
                result_lines.append(original[src_line])
                src_line += 1
            elif line.is_removed:
                src_line += 1  # 跳过原文件中这行
            elif line.is_added:
                # 确保换行
                value = line.value
                if not value.endswith('\n'):
                    value += '\n'
                result_lines.append(value)
    # 复制剩余行
    while src_line < len(original):
        result_lines.append(original[src_line])
        src_line += 1

    Path(target_file).write_text(''.join(result_lines), encoding='utf-8')


def apply_patches(patches: list, base_dir: str):
    """批量应用 patches。

    patches: [{"file": "relative/path.md", "diff": "..."}, ...]
    base_dir: patches 中 file 路径的根目录
    """
    errors = []
    for p in patches:
        try:
            target = str(Path(base_dir) / p["file"])
            apply_patch(target, p["diff"])
        except Exception as e:
            errors.append({"file": p["file"], "error": str(e)})
    return errors
```

- [ ] **Step 4: 运行测试，预期通过**

```bash
pytest tests/test_patcher.py -v
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-iterate/patcher.py scripts/auto-iterate/tests/test_patcher.py
git commit -m "feat: add skill snapshot/rollback and unified diff patcher"
```

---

## Task 7: Prompt 模板 — `extract-baseline.md`

**Files:**
- Create: `scripts/auto-iterate/prompts/extract-baseline.md`

- [ ] **Step 1: 写入 extract-baseline.md**

```markdown
# 任务: 从人工参考用例反向提取验证基准

你是测试分析专家。给你一组人工编写的测试用例 (JSON)，请反向提取三层验证基准，用于后续评估 AI 生成用例的质量。

## 输入

### 模块名
{{ module_name }}

### 参考用例 (JSON)
```json
{{ reference_cases_json }}
```

### 对应 PRD 片段
```markdown
{{ prd_slice }}
```

## 任务

### 1. Phase 1 基准: 需求解析应识别的资产

从每个测试步骤中提取:

- **content_assets**: 步骤中出现的具体文案、提示语、模板、错误信息、email/export 内容
- **enum_assets**: 步骤中出现的完整列表/矩阵/映射 (如黑名单、密码规则)
- **state_data_assets**: 涉及 DB 字段、额度变化、状态流转、缓存、日志的内容
- **contract_assets**: prompt 模板、schema、文件路径、输出格式规则
- **feature_tags**: 应标记的特性标签 (从以下选择):
  - `content_fidelity`: 内容保真 (文案、模板)
  - `process_feedback`: 过程态反馈 (loading、进度)
  - `interruption_recovery`: 中断恢复 (刷新、切换)
  - `visual_asset`: 视觉资产 (图片、Logo、样式)
  - `contract_content`: 合约内容 (prompt、schema)
  - `business_outside_prd`: PRD 外业务 (运营策略)

### 2. Phase 2 基准: 关联分析应发现的场景

识别:

- **cross_module_deps**: 步骤中隐含的跨模块依赖 (如 A 模块产生的记录出现在 B 模块列表)
- **interruption_scenarios**: 刷新/切换语言/跳转返回/重登录/网络中断等测试
- **history_list_interactions**: 排序/分页/滚动/空状态测试
- **implicit_requirements**: 参考用例覆盖但 PRD 未明确写出的需求
- **prd_external_items**: 运营策略、灰度、历史兼容等 PRD 外业务

### 3. Phase 3 基准: 用例级必须覆盖的验证点

按 step 粒度列出:

- **checkpoints**: 每个独立验证点，含:
  - `id`: 基准 ID (BP-{module}-{n})
  - `description`: 验证目标 (一句话)
  - `from_step`: 来自参考用例的 step_id
  - `fidelity_required`: 是否需要内容保真 (true/false)
  - `is_process_state`: 是否过程态验证 (true/false)
  - `is_visual_asset`: 是否视觉资产 (true/false)
  - `is_contract`: 是否合约验证 (true/false)
  - `is_interruption`: 是否中断恢复 (true/false)

## 输出

严格输出 JSON，结构:

```json
{
  "module_name": "...",
  "phase1": {
    "content_assets": ["..."],
    "enum_assets": [{"name": "...", "items": ["..."]}],
    "state_data_assets": ["..."],
    "contract_assets": ["..."],
    "feature_tags": ["content_fidelity", "..."]
  },
  "phase2": {
    "cross_module_deps": ["..."],
    "interruption_scenarios": ["..."],
    "history_list_interactions": ["..."],
    "implicit_requirements": ["..."],
    "prd_external_items": ["..."]
  },
  "phase3": {
    "checkpoints": [
      {
        "id": "BP-URL-1",
        "description": "...",
        "from_step": "step_id",
        "fidelity_required": false,
        "is_process_state": false,
        "is_visual_asset": false,
        "is_contract": false,
        "is_interruption": false
      }
    ]
  }
}
```

只输出 JSON，不要额外说明。
```

- [ ] **Step 2: Commit**

```bash
git add scripts/auto-iterate/prompts/extract-baseline.md
git commit -m "feat: add baseline extraction prompt template"
```

---

## Task 8: Phase 0 实现 `phase0.py`

**Files:**
- Create: `scripts/auto-iterate/phase0.py`
- Test: `scripts/auto-iterate/tests/test_phase0.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_phase0.py
from unittest.mock import patch, MagicMock
from pathlib import Path
import json
from phase0 import extract_baselines_for_module, merge_baselines

def test_merge_baselines_combines_module_results():
    m1 = {"module_name": "A", "phase1": {"content_assets": ["a1"]}, "phase2": {}, "phase3": {"checkpoints": [{"id": "BP-A-1"}]}}
    m2 = {"module_name": "B", "phase1": {"content_assets": ["b1"]}, "phase2": {}, "phase3": {"checkpoints": [{"id": "BP-B-1"}]}}
    merged = merge_baselines([m1, m2])

    assert "A" in merged["phase1"]
    assert "B" in merged["phase1"]
    assert merged["phase1"]["A"]["content_assets"] == ["a1"]
    assert len(merged["phase3"]["A"]["checkpoints"]) == 1

@patch('phase0.claude_call')
def test_extract_baselines_for_module_calls_claude(mock_call, tmp_path):
    mock_call.return_value = {
        "module_name": "URL通用校验",
        "phase1": {"content_assets": []},
        "phase2": {},
        "phase3": {"checkpoints": []}
    }
    module = {
        "name": "URL通用校验",
        "prd_content": "some prd",
        "ref_cases": [{"case_id": "1", "steps": []}]
    }
    result = extract_baselines_for_module(module, str(tmp_path / "out.json"), model="sonnet")
    assert result["module_name"] == "URL通用校验"
    mock_call.assert_called_once()
```

- [ ] **Step 2: 运行测试，预期失败**

```bash
pytest tests/test_phase0.py -v
```

Expected: FAIL - module not found

- [ ] **Step 3: 实现 phase0.py**

```python
# phase0.py
import json
from pathlib import Path
from jinja2 import Template
from claude_runner import claude_call


def extract_baselines_for_module(module: dict, output_path: str,
                                  prompt_dir: str = None,
                                  model: str = "sonnet",
                                  timeout: int = 300) -> dict:
    """对单个模块调用 Claude 提取三阶段基准"""
    if prompt_dir is None:
        prompt_dir = str(Path(__file__).parent / "prompts")

    template_text = Path(f"{prompt_dir}/extract-baseline.md").read_text(encoding='utf-8')
    tmpl = Template(template_text)

    prompt = tmpl.render(
        module_name=module["name"],
        reference_cases_json=json.dumps(module.get("ref_cases") or [], ensure_ascii=False, indent=2),
        prd_slice=module.get("prd_content") or "",
    )

    result = claude_call(prompt, output_path, parse_json=True, model=model, timeout=timeout)
    if result is None:
        raise RuntimeError(f"Failed to parse baseline JSON for module {module['name']}")
    return result


def merge_baselines(module_baselines: list[dict]) -> dict:
    """合并各模块基准为总基准，按 module_name 分组"""
    merged = {"phase1": {}, "phase2": {}, "phase3": {}}
    for b in module_baselines:
        name = b["module_name"]
        merged["phase1"][name] = b.get("phase1", {})
        merged["phase2"][name] = b.get("phase2", {})
        merged["phase3"][name] = b.get("phase3", {})
    return merged


def run_phase0(matched_modules: list[dict], output_dir: str,
               prompt_dir: str, model: str, timeout: int) -> dict:
    """Phase 0 主流程: 按模块提取基准 → 合并 → 写入 baselines/"""
    baselines_dir = Path(output_dir) / "baselines"
    baselines_dir.mkdir(parents=True, exist_ok=True)

    module_baselines = []
    for module in matched_modules:
        if not module.get("ref_cases"):
            continue  # 跳过没有参考用例的模块
        safe_name = module["name"].replace('/', '_').replace(' ', '_')
        out = baselines_dir / f"module-{safe_name}.json"
        try:
            b = extract_baselines_for_module(
                module, str(out),
                prompt_dir=prompt_dir, model=model, timeout=timeout
            )
            module_baselines.append(b)
        except Exception as e:
            print(f"[phase0] WARN: {module['name']} baseline extraction failed: {e}")

    merged = merge_baselines(module_baselines)

    # 写分阶段文件
    for phase in ["phase1", "phase2", "phase3"]:
        path = baselines_dir / f"{phase}-baseline.json"
        path.write_text(
            json.dumps(merged[phase], ensure_ascii=False, indent=2),
            encoding='utf-8'
        )

    return merged
```

- [ ] **Step 4: 运行测试，预期通过**

```bash
pytest tests/test_phase0.py -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-iterate/phase0.py scripts/auto-iterate/tests/test_phase0.py
git commit -m "feat: add phase 0 baseline extraction (per-module batched)"
```

---

## Task 9: Prompt 模板 — 生成类 (三阶段)

**Files:**
- Create: `scripts/auto-iterate/prompts/generate-phase1.md`
- Create: `scripts/auto-iterate/prompts/generate-phase2.md`
- Create: `scripts/auto-iterate/prompts/generate-phase3.md`

- [ ] **Step 1: 写入 generate-phase1.md**

```markdown
# 任务: Phase 1 — 需求解析

你是需求分析专家。严格按照下方 skill 规则，解析 PRD 并输出结构化的需求文档。

## 当前 skill 规则 (requirement-analysis)

```markdown
{{ skill_content }}
```

## PRD 全文

```markdown
{{ prd_content }}
```

## 输出

严格遵循 skill 规则中定义的输出格式，生成一份完整的 parsed-requirements.md 内容。

要求:
- 提取所有 F-xxx 功能点
- 完整标注 8 类测试资产 (内容/规则/集成/状态数据/约束/证据/多语言/Prompt)
- 为每个功能点标注证据类型
- 标注特性标签 (content_fidelity / process_feedback / interruption_recovery / visual_asset / contract_content / business_outside_prd)

直接输出 Markdown 内容，不要添加 ```md 包裹。
```

- [ ] **Step 2: 写入 generate-phase2.md**

```markdown
# 任务: Phase 2 — 需求关联分析

你是测试设计专家。严格按照下方 skill 规则，基于 Phase 1 产物分析模块关联。

## 当前 skill 规则 (requirement-association)

```markdown
{{ skill_content }}
```

## Phase 1 产物 (parsed-requirements.md)

```markdown
{{ parsed_requirements }}
```

## 输出

严格遵循 skill 规则输出三部分内容，用 `---SECTION---` 分隔:

SECTION 1 — module-dependencies.md
SECTION 2 — implicit-requirements.md
SECTION 3 — cross-module-scenarios.md

要求:
- 识别 6 类依赖 (功能/状态/证据/共享资源/中断恢复/历史列表)
- 挖掘 9 类隐含需求
- 生成 9 类跨模块场景

直接输出内容，section 间用 `---SECTION---` 分隔。
```

- [ ] **Step 3: 写入 generate-phase3.md**

```markdown
# 任务: Phase 3 — 模块测试用例生成

你是测试用例生成专家。严格按照下方 skill 规则，为指定模块生成功能测试用例。

## 当前 skill 规则 (test-case-generation)

```markdown
{{ skill_content }}
```

## Generator Reference

```markdown
{{ generator_reference }}
```

## 当前模块

模块名: {{ module_name }}

### PRD 片段
```markdown
{{ module_prd }}
```

### Phase 1 产物 (本模块相关部分)
```markdown
{{ parsed_requirements }}
```

### Phase 2 产物 (本模块相关部分)
```markdown
{{ associations }}
```

## 输出

严格按照 skill 规则输出 functional-cases.md 格式的测试用例，仅包含 "{{ module_name }}" 模块的用例。

每个用例包含:
- TC-xxx ID
- 模块、功能、生成器来源
- 前置条件、步骤、预期结果
- 证据类型
- 追溯 (F-xxx + line 引用)

直接输出 Markdown，不要加 ``` 包裹。
```

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-iterate/prompts/generate-phase1.md scripts/auto-iterate/prompts/generate-phase2.md scripts/auto-iterate/prompts/generate-phase3.md
git commit -m "feat: add generate prompts for phase 1/2/3"
```

---

## Task 10: Prompt 模板 — `score.md`

**Files:**
- Create: `scripts/auto-iterate/prompts/score.md`

- [ ] **Step 1: 写入 score.md**

```markdown
# 任务: 双基准对比打分

你是测试质量评估专家。按双基准模型给 AI 产物打分。

## 基准 A — 实践基准 (人工参考用例)
```json
{{ baseline_a }}
```

## 基准 B — 理论基准 (通用测试方法论)

对以下需求特性，检查是否运用了对应测试设计方法:

- 存在输入框/参数 → 等价类划分 + 边界值分析
- 存在业务流程 → 正向/替代/异常路径
- 存在状态变化 → 合法+非法状态转换
- 存在复杂业务规则 → 决策表/因果图
- 存在安全敏感操作 → 安全测试用例
- 存在 AI/LLM 调用 → prompt 回归测试
- 存在列表/分页 → 排序/分页/空状态/大数据量
- 存在异步操作 → 超时/重试/取消

## 评分维度

评分阶段: {{ phase }}
维度定义 (含权重):
```json
{{ dimensions }}
```

## 待评估产物

```markdown
{{ ai_output }}
```

## 任务

1. 对每个验证点 (基准 A 的 checkpoint 或基准 B 推导的测试方法要点):
   - 在 AI 产物中查找对应覆盖
   - 判定: `covered` / `partial` / `missing`
   - partial = 覆盖了功能但粒度不足 (如该逐字段校验却只写"内容正确")

2. 按维度聚合:
   - 对同时有 A 和 B 基准的维度: `dimension_score = max(A_score, B_score)`
   - 对仅有 A 或 B 的维度: 使用该基准的得分

3. 计算总分: `sum(dimension_score × weight)`

4. 判定是否收敛:
   - `total_score >= {{ min_total_score }}` 且
   - 任一维度 `>= {{ min_dimension_score }}`

## 规则

- `covered` 要求验证意图一致，不要求步骤文字相同
- AI 多出的部分不扣分 (只评是否覆盖了基准)
- 对基准 B: 若需求特性不涉及该测试方法，该方法不计入评分

## 输出

严格输出 JSON:

```json
{
  "phase": "{{ phase }}",
  "module": "{{ module_name }}",
  "iteration": {{ iteration }},
  "dimensions": {
    "dimension_key": {
      "score": 0.0,
      "weight": 0.0,
      "baseline": "A" | "B" | "A+B",
      "total_checkpoints": 0,
      "covered": 0,
      "partial": 0,
      "missing": 0,
      "details": [
        {
          "checkpoint": "...",
          "status": "covered|partial|missing",
          "ai_ref": "TC-xxx" 或 null,
          "note": "..."
        }
      ]
    }
  },
  "total_weighted_score": 0.0,
  "converged": true,
  "weak_dimensions": ["dimension_key"]
}
```

只输出 JSON，不要额外说明。
```

- [ ] **Step 2: Commit**

```bash
git add scripts/auto-iterate/prompts/score.md
git commit -m "feat: add dual-baseline scoring prompt"
```

---

## Task 11: 评分模块 `scorer.py`

**Files:**
- Create: `scripts/auto-iterate/scorer.py`
- Create: `scripts/auto-iterate/dimensions.py`
- Test: `scripts/auto-iterate/tests/test_scorer.py`

- [ ] **Step 1: 写 dimensions.py (纯数据)**

```python
# dimensions.py
"""各阶段评分维度定义"""

PHASE1_DIMENSIONS = {
    "module_feature_identification": {"weight": 0.20, "baseline": "A",
        "desc": "参考用例涉及的 module_path 在 parsed-requirements 中有对应 F-xxx"},
    "content_asset_extraction": {"weight": 0.15, "baseline": "A",
        "desc": "参考用例中出现的文案/提示语/模板在资产清单中被标记"},
    "enum_asset_completeness": {"weight": 0.15, "baseline": "A",
        "desc": "参考用例中的完整列表被完整保留而非截断"},
    "state_data_asset": {"weight": 0.10, "baseline": "A",
        "desc": "涉及 DB 断言/额度变化/状态流转被识别"},
    "evidence_type_tagging": {"weight": 0.10, "baseline": "A",
        "desc": "每个 F-xxx 标记了正确的证据类型"},
    "feature_tag_coverage": {"weight": 0.10, "baseline": "A",
        "desc": "6 类特性标签被正确标记"},
    "input_constraint_completeness": {"weight": 0.10, "baseline": "B",
        "desc": "每个输入字段识别了类型/范围/格式/必填约束"},
    "state_machine_identification": {"weight": 0.10, "baseline": "B",
        "desc": "涉及生命周期/流程的功能被标记为状态机类"},
}

PHASE2_DIMENSIONS = {
    "functional_dependency": {"weight": 0.15, "baseline": "A",
        "desc": "参考用例中隐含的跨模块依赖被识别"},
    "interruption_recovery": {"weight": 0.20, "baseline": "A+B",
        "desc": "刷新/切换/重试场景在关联分析中出现"},
    "history_list_interaction": {"weight": 0.15, "baseline": "A+B",
        "desc": "排序/分页/空状态被识别为关联场景"},
    "implicit_requirements": {"weight": 0.15, "baseline": "A",
        "desc": "PRD 未明确写出但参考用例覆盖的需求被发现"},
    "prd_external_business": {"weight": 0.10, "baseline": "A",
        "desc": "运营逻辑被标记为待澄清项"},
    "error_propagation": {"weight": 0.15, "baseline": "B",
        "desc": "模块 A 失败时对模块 B 的影响链被识别"},
    "concurrency_race": {"weight": 0.10, "baseline": "B",
        "desc": "共享资源的并发访问风险被识别"},
}

PHASE3_DIMENSIONS = {
    "step_coverage": {"weight": 0.20, "baseline": "A",
        "desc": "参考用例的每个 step 在 AI 用例中找到对应覆盖"},
    "content_fidelity": {"weight": 0.15, "baseline": "A",
        "desc": "需逐字段校验的地方写了具体内容"},
    "process_state": {"weight": 0.10, "baseline": "A+B",
        "desc": "loading/进度/中间状态被独立测试"},
    "interruption_recovery": {"weight": 0.10, "baseline": "A+B",
        "desc": "刷新/切换/退出等中断场景有对应用例"},
    "visual_asset_marking": {"weight": 0.05, "baseline": "A",
        "desc": "图片/Logo/样式类测试点标记为 manual/partial"},
    "contract_verification": {"weight": 0.10, "baseline": "A+B",
        "desc": "prompt/schema/模板作为合约逐项校验"},
    "equivalence_boundary": {"weight": 0.10, "baseline": "B",
        "desc": "输入类需求运用了等价类划分和边界值分析"},
    "exception_negative": {"weight": 0.10, "baseline": "B",
        "desc": "覆盖了错误处理/异常路径/权限越界"},
    "state_transition": {"weight": 0.05, "baseline": "B",
        "desc": "涉及状态机的模块覆盖了合法+非法转换"},
    "method_fit": {"weight": 0.05, "baseline": "B",
        "desc": "为需求特性选择了正确的生成器/设计方法"},
}

DIMENSIONS_BY_PHASE = {
    "phase1": PHASE1_DIMENSIONS,
    "phase2": PHASE2_DIMENSIONS,
    "phase3": PHASE3_DIMENSIONS,
}
```

- [ ] **Step 2: 写 scorer.py 失败测试**

```python
# tests/test_scorer.py
from unittest.mock import patch
from scorer import is_converged, score_artifact

def test_is_converged_true():
    score = {
        "total_weighted_score": 0.86,
        "dimensions": {
            "a": {"score": 0.70},
            "b": {"score": 0.80},
        },
    }
    cfg = {"min_total_score": 0.85, "min_dimension_score": 0.65}
    assert is_converged(score, cfg) is True

def test_is_converged_fails_dimension_floor():
    score = {
        "total_weighted_score": 0.86,
        "dimensions": {
            "a": {"score": 0.50},  # below floor
            "b": {"score": 0.80},
        },
    }
    cfg = {"min_total_score": 0.85, "min_dimension_score": 0.65}
    assert is_converged(score, cfg) is False

def test_is_converged_fails_total():
    score = {
        "total_weighted_score": 0.80,
        "dimensions": {
            "a": {"score": 0.70},
            "b": {"score": 0.80},
        },
    }
    cfg = {"min_total_score": 0.85, "min_dimension_score": 0.65}
    assert is_converged(score, cfg) is False

@patch('scorer.claude_call')
def test_score_artifact_calls_claude_with_rendered_prompt(mock_call, tmp_path):
    mock_call.return_value = {
        "total_weighted_score": 0.88,
        "dimensions": {},
        "converged": True,
    }
    result = score_artifact(
        phase="phase3", module_name="URL", iteration=1,
        ai_output="cases here", baseline_a={"checkpoints": []},
        output_path=str(tmp_path / "score.json"),
        convergence={"min_total_score": 0.85, "min_dimension_score": 0.65},
    )
    assert result["total_weighted_score"] == 0.88
    mock_call.assert_called_once()
```

- [ ] **Step 3: 运行测试，预期失败**

```bash
pytest tests/test_scorer.py -v
```

Expected: FAIL - module not found

- [ ] **Step 4: 实现 scorer.py**

```python
# scorer.py
import json
from pathlib import Path
from jinja2 import Template
from claude_runner import claude_call
from dimensions import DIMENSIONS_BY_PHASE


def is_converged(score: dict, convergence_cfg: dict) -> bool:
    """检查评分是否满足收敛条件"""
    total = score.get("total_weighted_score", 0.0)
    if total < convergence_cfg["min_total_score"]:
        return False
    floor = convergence_cfg["min_dimension_score"]
    for dim in score.get("dimensions", {}).values():
        if dim.get("score", 0.0) < floor:
            return False
    return True


def score_artifact(phase: str, module_name: str, iteration: int,
                   ai_output: str, baseline_a: dict,
                   output_path: str, convergence: dict,
                   prompt_dir: str = None, model: str = "sonnet",
                   timeout: int = 300) -> dict:
    """对 AI 产物评分"""
    if prompt_dir is None:
        prompt_dir = str(Path(__file__).parent / "prompts")

    template = Template(
        Path(f"{prompt_dir}/score.md").read_text(encoding='utf-8')
    )

    dimensions = DIMENSIONS_BY_PHASE[phase]

    prompt = template.render(
        phase=phase,
        module_name=module_name,
        iteration=iteration,
        ai_output=ai_output,
        baseline_a=json.dumps(baseline_a, ensure_ascii=False, indent=2),
        dimensions=json.dumps(dimensions, ensure_ascii=False, indent=2),
        min_total_score=convergence["min_total_score"],
        min_dimension_score=convergence["min_dimension_score"],
    )

    result = claude_call(prompt, output_path, parse_json=True,
                         model=model, timeout=timeout)
    if result is None:
        raise RuntimeError(f"Failed to parse score JSON for {phase}/{module_name}")
    return result
```

- [ ] **Step 5: 运行测试，预期通过**

```bash
pytest tests/test_scorer.py -v
```

Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add scripts/auto-iterate/scorer.py scripts/auto-iterate/dimensions.py scripts/auto-iterate/tests/test_scorer.py
git commit -m "feat: add scorer with dual-baseline convergence check"
```

---

## Task 12: Prompt 模板 — `analyze-and-patch.md`

**Files:**
- Create: `scripts/auto-iterate/prompts/analyze-and-patch.md`

- [ ] **Step 1: 写入 analyze-and-patch.md**

```markdown
# 任务: 差距分析 + Skill Patch 生成

你是测试方法论优化专家。根据评分结果分析 skill 规则不足，输出可直接 apply 的修改补丁。

## 通用性硬约束 (Iron Law — 违反则 patch 无效)

你正在修改的是通用测试插件的 skill 规则，不是为当前产品写专用逻辑。

MUST:
- 规则必须是"特性模式级"，不能是"业务实例级"
- 正确例子: "当需求描述包含阶段性进度反馈时，必须为每个阶段生成独立验证步骤"
- 错误例子: "GEO检测的loading有5个阶段，需要逐一验证"
- 每条新规则都能回答: "换成电商/社交/金融产品，这条规则还适用吗？"

MUST NOT:
- 不得引用当前产品的业务术语 (GEO、VisiGEO、早鸟限免、URL黑名单具体域名 等)
- 不得硬编码具体数值、具体字段名、具体页面路径
- 不得添加只对当前需求有效的特殊分支

## 当前评分

```json
{{ score_json }}
```

## 差距分类 (决定处理方式)

- **类型 1** (人工覆盖但 AI 遗漏 — 基准 A 差距): 补强 skill 的"触发 → 生成"机制
- **类型 2** (方法论要求但 AI 遗漏 — 基准 B 差距): 补强生成器选择策略或生成器内部检查清单
- **类型 3** (AI 覆盖但人工遗漏 — AI 优势): 记录不改

修改优先级: 类型 1 > 类型 2。类型 3 不触发修改。

## 抽象映射表 (参考，引导正确抽象层级)

```json
{{ abstraction_map }}
```

## 当前 skill 文件内容

```markdown
{{ skill_content }}
```

## 历史迭代记录 (避免重复尝试失败的修改)

```json
{{ iteration_history }}
```

## 修改策略

1. 优先增强已有规则的"触发条件"而非新增整段规则
2. 如果某维度已收敛 (分数 >= 阈值)，不要修改相关规则
3. 如果历史迭代中已尝试相同修改但未生效，换不同策略
4. 每次修改数量控制: 1-3 个 patch 为宜，避免大规模重写

## 输出

严格输出 JSON:

```json
{
  "analysis": [
    {
      "gap_type": 1 | 2,
      "gap_pattern": "通用特性模式名",
      "evidence": ["missing checkpoint A", "partial checkpoint B"],
      "root_cause": "当前 skill 中缺少 xxx 触发机制",
      "fix_strategy": "在 xxx 位置增加 xxx 规则"
    }
  ],
  "patches": [
    {
      "file": "skills/{skill-name}/SKILL.md",
      "diff": "--- a/skills/.../SKILL.md\n+++ b/skills/.../SKILL.md\n@@ -N,M +N,M @@\n context\n-removed\n+added\n context\n"
    }
  ],
  "skipped_gaps": [
    {"gap": "...", "reason": "已收敛 / 类型3 / 历史已尝试"}
  ]
}
```

diff 必须是严格的 unified diff 格式，含 `--- a/` `+++ b/` 头和 `@@` hunk 头。
file 路径相对 TestingAgent 根目录。
只输出 JSON。
```

- [ ] **Step 2: Commit**

```bash
git add scripts/auto-iterate/prompts/analyze-and-patch.md
git commit -m "feat: add analyze-and-patch prompt with generality iron law"
```

---

## Task 13: Prompt 模板 — `review-patch.md` + `revise-patch.md`

**Files:**
- Create: `scripts/auto-iterate/prompts/review-patch.md`
- Create: `scripts/auto-iterate/prompts/revise-patch.md`

- [ ] **Step 1: 写入 review-patch.md**

```markdown
# 任务: Patch 通用性审查

你是方法论审查专家。审查下方 skill 修改补丁是否满足通用性要求。

## 待审查补丁

```json
{{ patch_json }}
```

## 当前 skill 全文 (上下文)

```markdown
{{ skill_content }}
```

## 审查清单 (逐条检查每个 patch 的每条新增/修改规则)

1. **特定产品术语**: 是否出现业务专有名词 (如 GEO、VisiGEO、早鸟、特定品牌名)？→ FAIL
2. **硬编码具体值**: 是否硬编码具体数值、字段名、页面路径、URL？→ FAIL
3. **跨产品适用性**: 换成完全不同的产品 (如外卖平台、金融、IM) 是否仍然成立？→ 否则 FAIL
4. **与已有规则冲突**: 是否与 skill 已有规则重复或矛盾？→ WARN
5. **粒度合适性**: 太细 = 过拟合；太粗 = 无效。→ WARN

## 输出

严格输出 JSON:

```json
{
  "verdict": "PASS" | "REVISE",
  "issues": [
    {
      "patch_index": 0,
      "rule": "规则原文片段",
      "problem": "问题描述 (哪个检查项失败)",
      "suggestion": "如何改写才能通过"
    }
  ]
}
```

只输出 JSON。
```

- [ ] **Step 2: 写入 revise-patch.md**

```markdown
# 任务: 根据审查意见修订 Patch

你要根据审查意见修订 patch，保留修改意图但消除通用性问题。

## 原始 patch

```json
{{ original_patch }}
```

## 审查意见

```json
{{ review_issues }}
```

## 要求

- 保留 analysis (差距识别不变)
- 按审查建议重写 patches 中的 diff
- 消除业务术语/硬编码值/过拟合规则
- 保持改进意图 (仍然解决原本的差距)

## 输出

与原始 patch 相同的 JSON 结构 (含 analysis + patches + skipped_gaps)。

只输出 JSON。
```

- [ ] **Step 3: Commit**

```bash
git add scripts/auto-iterate/prompts/review-patch.md scripts/auto-iterate/prompts/revise-patch.md
git commit -m "feat: add patch review and revise prompts"
```

---

## Task 14: 分析与补丁模块 `analyzer.py`

**Files:**
- Create: `scripts/auto-iterate/analyzer.py`
- Test: `scripts/auto-iterate/tests/test_analyzer.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_analyzer.py
from unittest.mock import patch
from analyzer import generate_patch, review_patch, revise_patch, run_analysis_cycle

@patch('analyzer.claude_call')
def test_generate_patch_calls_claude(mock_call, tmp_path):
    mock_call.return_value = {
        "analysis": [],
        "patches": [{"file": "skills/x.md", "diff": "--- a\n+++ b\n"}],
        "skipped_gaps": [],
    }
    result = generate_patch(
        score={"total_weighted_score": 0.70},
        skill_content="skill text",
        iteration_history=[],
        abstraction_map={},
        output_path=str(tmp_path / "p.json"),
    )
    assert "patches" in result
    mock_call.assert_called_once()

@patch('analyzer.claude_call')
def test_review_patch_returns_pass(mock_call, tmp_path):
    mock_call.return_value = {"verdict": "PASS", "issues": []}
    result = review_patch(
        patch={"patches": []}, skill_content="",
        output_path=str(tmp_path / "r.json"),
    )
    assert result["verdict"] == "PASS"

@patch('analyzer.revise_patch')
@patch('analyzer.review_patch')
@patch('analyzer.generate_patch')
def test_run_analysis_cycle_pass_first_try(mock_gen, mock_review, mock_revise, tmp_path):
    mock_gen.return_value = {"patches": [{"file": "x", "diff": "d"}]}
    mock_review.return_value = {"verdict": "PASS", "issues": []}

    result = run_analysis_cycle(
        score={}, skill_content="", iteration_history=[],
        abstraction_map={}, iter_dir=str(tmp_path),
        max_revise_attempts=2,
    )
    assert result["verdict"] == "PASS"
    assert result["patch"] == mock_gen.return_value
    mock_revise.assert_not_called()

@patch('analyzer.revise_patch')
@patch('analyzer.review_patch')
@patch('analyzer.generate_patch')
def test_run_analysis_cycle_revise_then_pass(mock_gen, mock_review, mock_revise, tmp_path):
    mock_gen.return_value = {"patches": [{"file": "x", "diff": "d"}]}
    # first review REVISE, second PASS
    mock_review.side_effect = [
        {"verdict": "REVISE", "issues": [{"problem": "GEO leaks"}]},
        {"verdict": "PASS", "issues": []},
    ]
    mock_revise.return_value = {"patches": [{"file": "x", "diff": "d2"}]}

    result = run_analysis_cycle(
        score={}, skill_content="", iteration_history=[],
        abstraction_map={}, iter_dir=str(tmp_path),
        max_revise_attempts=2,
    )
    assert result["verdict"] == "PASS"
    assert result["patch"] == mock_revise.return_value

@patch('analyzer.revise_patch')
@patch('analyzer.review_patch')
@patch('analyzer.generate_patch')
def test_run_analysis_cycle_exhausts_revise_attempts(mock_gen, mock_review, mock_revise, tmp_path):
    mock_gen.return_value = {"patches": [{"file": "x", "diff": "d"}]}
    mock_review.return_value = {"verdict": "REVISE", "issues": [{"problem": "x"}]}
    mock_revise.return_value = {"patches": [{"file": "x", "diff": "d2"}]}

    result = run_analysis_cycle(
        score={}, skill_content="", iteration_history=[],
        abstraction_map={}, iter_dir=str(tmp_path),
        max_revise_attempts=2,
    )
    # max_revise_attempts=2 → 3 reviews total (initial + 2 revisions), all REVISE
    assert result["verdict"] == "REVISE"
    # should not apply
    assert result.get("skip_apply") is True
```

- [ ] **Step 2: 运行测试，预期失败**

```bash
pytest tests/test_analyzer.py -v
```

Expected: FAIL - module not found

- [ ] **Step 3: 实现 analyzer.py**

```python
# analyzer.py
import json
from pathlib import Path
from jinja2 import Template
from claude_runner import claude_call


def _render(prompt_dir: str, name: str, **kwargs) -> str:
    text = Path(f"{prompt_dir}/{name}").read_text(encoding='utf-8')
    return Template(text).render(**kwargs)


def generate_patch(score: dict, skill_content: str,
                   iteration_history: list, abstraction_map: dict,
                   output_path: str, prompt_dir: str = None,
                   model: str = "sonnet", timeout: int = 300) -> dict:
    if prompt_dir is None:
        prompt_dir = str(Path(__file__).parent / "prompts")
    prompt = _render(
        prompt_dir, "analyze-and-patch.md",
        score_json=json.dumps(score, ensure_ascii=False, indent=2),
        skill_content=skill_content,
        iteration_history=json.dumps(iteration_history, ensure_ascii=False, indent=2),
        abstraction_map=json.dumps(abstraction_map, ensure_ascii=False, indent=2),
    )
    result = claude_call(prompt, output_path, parse_json=True,
                         model=model, timeout=timeout)
    if result is None:
        raise RuntimeError("Failed to parse patch JSON")
    return result


def review_patch(patch: dict, skill_content: str, output_path: str,
                 prompt_dir: str = None, model: str = "sonnet",
                 timeout: int = 300) -> dict:
    if prompt_dir is None:
        prompt_dir = str(Path(__file__).parent / "prompts")
    prompt = _render(
        prompt_dir, "review-patch.md",
        patch_json=json.dumps(patch, ensure_ascii=False, indent=2),
        skill_content=skill_content,
    )
    result = claude_call(prompt, output_path, parse_json=True,
                         model=model, timeout=timeout)
    if result is None:
        raise RuntimeError("Failed to parse review JSON")
    return result


def revise_patch(original_patch: dict, review_issues: list,
                 output_path: str, prompt_dir: str = None,
                 model: str = "sonnet", timeout: int = 300) -> dict:
    if prompt_dir is None:
        prompt_dir = str(Path(__file__).parent / "prompts")
    prompt = _render(
        prompt_dir, "revise-patch.md",
        original_patch=json.dumps(original_patch, ensure_ascii=False, indent=2),
        review_issues=json.dumps(review_issues, ensure_ascii=False, indent=2),
    )
    result = claude_call(prompt, output_path, parse_json=True,
                         model=model, timeout=timeout)
    if result is None:
        raise RuntimeError("Failed to parse revised patch JSON")
    return result


def run_analysis_cycle(score: dict, skill_content: str,
                       iteration_history: list, abstraction_map: dict,
                       iter_dir: str, max_revise_attempts: int = 2,
                       prompt_dir: str = None, model: str = "sonnet",
                       timeout: int = 300) -> dict:
    """完整的分析→审查→修订循环。

    Returns: {
        "verdict": "PASS" | "REVISE",
        "patch": final patch dict (通过审查的)
        "skip_apply": True 若审查多次未通过
        "review_history": [...]
    }
    """
    iter_path = Path(iter_dir)
    iter_path.mkdir(parents=True, exist_ok=True)

    patch = generate_patch(
        score, skill_content, iteration_history, abstraction_map,
        str(iter_path / "patch.json"),
        prompt_dir=prompt_dir, model=model, timeout=timeout,
    )

    review_history = []
    for attempt in range(max_revise_attempts + 1):
        suffix = "" if attempt == 0 else f"-revise-{attempt}"
        review = review_patch(
            patch, skill_content,
            str(iter_path / f"review{suffix}.json"),
            prompt_dir=prompt_dir, model=model, timeout=timeout,
        )
        review_history.append(review)
        if review["verdict"] == "PASS":
            return {
                "verdict": "PASS",
                "patch": patch,
                "review_history": review_history,
            }
        if attempt >= max_revise_attempts:
            break
        patch = revise_patch(
            patch, review.get("issues", []),
            str(iter_path / f"patch-revised-{attempt + 1}.json"),
            prompt_dir=prompt_dir, model=model, timeout=timeout,
        )

    return {
        "verdict": "REVISE",
        "patch": patch,
        "skip_apply": True,
        "review_history": review_history,
    }
```

- [ ] **Step 4: 运行测试，预期通过**

```bash
pytest tests/test_analyzer.py -v
```

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-iterate/analyzer.py scripts/auto-iterate/tests/test_analyzer.py
git commit -m "feat: add patch generator/reviewer/reviser with revise loop"
```

---

## Task 15: 阶段迭代循环 `phase_loop.py`

**Files:**
- Create: `scripts/auto-iterate/phase_loop.py`
- Test: `scripts/auto-iterate/tests/test_phase_loop.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_phase_loop.py
from unittest.mock import patch, MagicMock
from phase_loop import iterate

def _mk_generator(outputs):
    """返回每次调用返回 outputs.pop(0) 的函数"""
    def gen(*args, **kwargs):
        return outputs.pop(0)
    return gen

@patch('phase_loop.run_analysis_cycle')
@patch('phase_loop.score_artifact')
@patch('phase_loop.patcher')
def test_iterate_converges_first_try(mock_patcher, mock_score, mock_analyze, tmp_path):
    mock_score.return_value = {"total_weighted_score": 0.90, "dimensions": {"a": {"score": 0.70}}, "converged": True}
    convergence = {"min_total_score": 0.85, "min_dimension_score": 0.65, "max_iterations": 3}

    gen_calls = []
    def fake_generator(iter_num):
        gen_calls.append(iter_num)
        return "ai output"

    result = iterate(
        phase="phase1", module_name="_",
        generator=fake_generator,
        baseline_a={}, convergence=convergence,
        skill_dir=str(tmp_path / "skills"),
        snapshot_root=str(tmp_path / "snap"),
        iter_root=str(tmp_path / "iters"),
        abstraction_map={},
        max_revise_attempts=2,
    )
    assert result["converged"] is True
    assert result["iterations"] == 1
    assert len(gen_calls) == 1
    mock_analyze.assert_not_called()

@patch('phase_loop.run_analysis_cycle')
@patch('phase_loop.score_artifact')
@patch('phase_loop.patcher')
def test_iterate_patches_and_retries(mock_patcher, mock_score, mock_analyze, tmp_path):
    mock_score.side_effect = [
        {"total_weighted_score": 0.60, "dimensions": {"a": {"score": 0.50}}, "converged": False},
        {"total_weighted_score": 0.90, "dimensions": {"a": {"score": 0.70}}, "converged": True},
    ]
    mock_analyze.return_value = {
        "verdict": "PASS",
        "patch": {"patches": [{"file": "skills/x.md", "diff": "d"}]},
    }
    mock_patcher.apply_patches.return_value = []
    convergence = {"min_total_score": 0.85, "min_dimension_score": 0.65, "max_iterations": 3}

    gen_iters = []
    def fake_generator(iter_num):
        gen_iters.append(iter_num)
        return "ai output"

    result = iterate(
        phase="phase1", module_name="_",
        generator=fake_generator,
        baseline_a={}, convergence=convergence,
        skill_dir=str(tmp_path / "skills"),
        snapshot_root=str(tmp_path / "snap"),
        iter_root=str(tmp_path / "iters"),
        abstraction_map={},
        max_revise_attempts=2,
    )
    assert result["converged"] is True
    assert result["iterations"] == 2
    assert gen_iters == [1, 2]
    assert mock_patcher.snapshot.called
    assert mock_patcher.apply_patches.called

@patch('phase_loop.run_analysis_cycle')
@patch('phase_loop.score_artifact')
@patch('phase_loop.patcher')
def test_iterate_exhausts_max_iterations(mock_patcher, mock_score, mock_analyze, tmp_path):
    mock_score.return_value = {"total_weighted_score": 0.60, "dimensions": {"a": {"score": 0.50}}, "converged": False}
    mock_analyze.return_value = {
        "verdict": "PASS",
        "patch": {"patches": [{"file": "skills/x.md", "diff": "d"}]},
    }
    mock_patcher.apply_patches.return_value = []
    convergence = {"min_total_score": 0.85, "min_dimension_score": 0.65, "max_iterations": 2}

    result = iterate(
        phase="phase1", module_name="_",
        generator=lambda i: "o",
        baseline_a={}, convergence=convergence,
        skill_dir=str(tmp_path / "skills"),
        snapshot_root=str(tmp_path / "snap"),
        iter_root=str(tmp_path / "iters"),
        abstraction_map={},
        max_revise_attempts=2,
    )
    assert result["converged"] is False
    assert result["iterations"] == 2
    assert "weak_dimensions" in result
```

- [ ] **Step 2: 运行测试，预期失败**

```bash
pytest tests/test_phase_loop.py -v
```

Expected: FAIL - module not found

- [ ] **Step 3: 实现 phase_loop.py**

```python
# phase_loop.py
"""通用阶段/模块迭代循环"""
from pathlib import Path
from typing import Callable
import patcher
from scorer import score_artifact, is_converged
from analyzer import run_analysis_cycle


def read_skill_content(skill_dir: str, files: list) -> str:
    """读取相关 skill 文件内容拼接 (供 patch 生成参考)"""
    parts = []
    for f in files:
        path = Path(skill_dir).parent / f  # file paths are relative to TestingAgent root
        if path.exists():
            parts.append(f"=== {f} ===\n{path.read_text(encoding='utf-8')}")
    return "\n\n".join(parts)


def iterate(phase: str, module_name: str,
            generator: Callable[[int], str],
            baseline_a: dict, convergence: dict,
            skill_dir: str, snapshot_root: str, iter_root: str,
            abstraction_map: dict, skill_files: list = None,
            max_revise_attempts: int = 2,
            prompt_dir: str = None, model: str = "sonnet",
            timeout: int = 300) -> dict:
    """通用迭代循环。

    Args:
        generator: (iter_num) -> ai_output 字符串。封装了不同阶段的生成逻辑。
        skill_files: 相关 skill 文件相对路径列表 (供 analyze 读取全文)

    Returns:
        {
            "converged": bool,
            "iterations": int,
            "final_score": dict,
            "history": [...],
            "weak_dimensions": [...],  # 仅未收敛时
        }
    """
    if skill_files is None:
        skill_files = []

    history = []
    last_score = None

    for iter_num in range(1, convergence["max_iterations"] + 1):
        iter_dir = Path(iter_root) / f"iter-{iter_num}"
        iter_dir.mkdir(parents=True, exist_ok=True)

        # ① 生成
        ai_output = generator(iter_num)
        (iter_dir / "ai-output.md").write_text(ai_output, encoding='utf-8')

        # ② 打分
        score = score_artifact(
            phase=phase, module_name=module_name, iteration=iter_num,
            ai_output=ai_output, baseline_a=baseline_a,
            output_path=str(iter_dir / "score.json"),
            convergence=convergence, prompt_dir=prompt_dir,
            model=model, timeout=timeout,
        )
        last_score = score
        history.append({
            "iter": iter_num,
            "score": score.get("total_weighted_score", 0.0),
            "weak_dimensions": score.get("weak_dimensions", []),
        })

        # ③ 收敛检查
        if is_converged(score, convergence):
            return {
                "converged": True,
                "iterations": iter_num,
                "final_score": score,
                "history": history,
            }

        # ④ 分析 + patch 生成 + 审查
        skill_content = read_skill_content(skill_dir, skill_files)
        analysis = run_analysis_cycle(
            score=score, skill_content=skill_content,
            iteration_history=history, abstraction_map=abstraction_map,
            iter_dir=str(iter_dir), max_revise_attempts=max_revise_attempts,
            prompt_dir=prompt_dir, model=model, timeout=timeout,
        )

        if analysis.get("skip_apply"):
            history[-1]["patch_skipped"] = True
            continue  # 审查未通过，跳过本轮 patch，进入下一轮

        # ⑤ 快照 + 应用
        snap_dir = Path(snapshot_root) / f"iter-{iter_num}"
        patcher.snapshot(skill_dir, str(snap_dir))

        testing_agent_root = str(Path(skill_dir).parent)
        errors = patcher.apply_patches(
            analysis["patch"].get("patches", []),
            testing_agent_root,
        )
        history[-1]["patches_applied"] = len(analysis["patch"].get("patches", []))
        if errors:
            history[-1]["patch_errors"] = errors

    # 未收敛
    return {
        "converged": False,
        "iterations": convergence["max_iterations"],
        "final_score": last_score,
        "history": history,
        "weak_dimensions": last_score.get("weak_dimensions", []) if last_score else [],
    }
```

- [ ] **Step 4: 运行测试，预期通过**

```bash
pytest tests/test_phase_loop.py -v
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-iterate/phase_loop.py scripts/auto-iterate/tests/test_phase_loop.py
git commit -m "feat: add generic iteration loop with snapshot and patch apply"
```

---

## Task 16: 阶段生成器 `generators.py`

**Files:**
- Create: `scripts/auto-iterate/generators.py`
- Test: `scripts/auto-iterate/tests/test_generators.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_generators.py
from unittest.mock import patch
from generators import make_phase1_generator, make_phase3_generator

@patch('generators.claude_call')
def test_phase1_generator_renders_prompt(mock_call, tmp_path):
    mock_call.return_value = "parsed output"
    (tmp_path / "skills" / "requirement-analysis").mkdir(parents=True)
    (tmp_path / "skills" / "requirement-analysis" / "SKILL.md").write_text("skill text", encoding='utf-8')

    gen = make_phase1_generator(
        prd_content="prd text",
        skill_dir=str(tmp_path / "skills"),
        output_root=str(tmp_path / "iters"),
    )
    result = gen(1)
    assert result == "parsed output"
    mock_call.assert_called_once()
    # check prompt was rendered with both prd and skill
    call_args = mock_call.call_args[0]
    assert "prd text" in call_args[0]
    assert "skill text" in call_args[0]

@patch('generators.claude_call')
def test_phase3_generator_includes_module_context(mock_call, tmp_path):
    mock_call.return_value = "tc text"
    (tmp_path / "skills" / "test-case-generation").mkdir(parents=True)
    (tmp_path / "skills" / "test-case-generation" / "SKILL.md").write_text("gen skill", encoding='utf-8')
    (tmp_path / "skills" / "test-case-generation" / "generator-reference.md").write_text("gen ref", encoding='utf-8')

    gen = make_phase3_generator(
        module_name="URL通用校验", module_prd="prd slice",
        parsed_requirements="parsed content",
        associations="assoc content",
        skill_dir=str(tmp_path / "skills"),
        output_root=str(tmp_path / "iters"),
    )
    result = gen(1)
    assert result == "tc text"
    prompt = mock_call.call_args[0][0]
    assert "URL通用校验" in prompt
    assert "prd slice" in prompt
    assert "gen ref" in prompt
```

- [ ] **Step 2: 运行测试，预期失败**

```bash
pytest tests/test_generators.py -v
```

Expected: FAIL - module not found

- [ ] **Step 3: 实现 generators.py**

```python
# generators.py
from pathlib import Path
from jinja2 import Template
from claude_runner import claude_call


def _render(prompt_dir: str, name: str, **kwargs) -> str:
    text = Path(f"{prompt_dir}/{name}").read_text(encoding='utf-8')
    return Template(text).render(**kwargs)


def make_phase1_generator(prd_content: str, skill_dir: str,
                          output_root: str, prompt_dir: str = None,
                          model: str = "sonnet", timeout: int = 300):
    """返回 (iter_num) -> ai_output"""
    if prompt_dir is None:
        prompt_dir = str(Path(__file__).parent / "prompts")

    def gen(iter_num: int) -> str:
        skill_content = Path(
            f"{skill_dir}/requirement-analysis/SKILL.md"
        ).read_text(encoding='utf-8')

        prompt = _render(
            prompt_dir, "generate-phase1.md",
            prd_content=prd_content, skill_content=skill_content,
        )
        output = Path(output_root) / f"iter-{iter_num}" / "parsed-requirements.md"
        output.parent.mkdir(parents=True, exist_ok=True)
        return claude_call(prompt, str(output), model=model, timeout=timeout)

    return gen


def make_phase2_generator(parsed_requirements: str, skill_dir: str,
                          output_root: str, prompt_dir: str = None,
                          model: str = "sonnet", timeout: int = 300):
    if prompt_dir is None:
        prompt_dir = str(Path(__file__).parent / "prompts")

    def gen(iter_num: int) -> str:
        skill_content = Path(
            f"{skill_dir}/requirement-association/SKILL.md"
        ).read_text(encoding='utf-8')

        prompt = _render(
            prompt_dir, "generate-phase2.md",
            parsed_requirements=parsed_requirements,
            skill_content=skill_content,
        )
        output = Path(output_root) / f"iter-{iter_num}" / "associations.md"
        output.parent.mkdir(parents=True, exist_ok=True)
        return claude_call(prompt, str(output), model=model, timeout=timeout)

    return gen


def make_phase3_generator(module_name: str, module_prd: str,
                          parsed_requirements: str, associations: str,
                          skill_dir: str, output_root: str,
                          prompt_dir: str = None, model: str = "sonnet",
                          timeout: int = 300):
    if prompt_dir is None:
        prompt_dir = str(Path(__file__).parent / "prompts")

    def gen(iter_num: int) -> str:
        skill_content = Path(
            f"{skill_dir}/test-case-generation/SKILL.md"
        ).read_text(encoding='utf-8')
        gen_ref_path = Path(f"{skill_dir}/test-case-generation/generator-reference.md")
        generator_reference = gen_ref_path.read_text(encoding='utf-8') if gen_ref_path.exists() else ""

        prompt = _render(
            prompt_dir, "generate-phase3.md",
            module_name=module_name, module_prd=module_prd,
            parsed_requirements=parsed_requirements,
            associations=associations,
            skill_content=skill_content,
            generator_reference=generator_reference,
        )
        safe_name = module_name.replace('/', '_').replace(' ', '_')
        output = Path(output_root) / f"iter-{iter_num}" / f"cases-{safe_name}.md"
        output.parent.mkdir(parents=True, exist_ok=True)
        return claude_call(prompt, str(output), model=model, timeout=timeout)

    return gen
```

- [ ] **Step 4: 运行测试，预期通过**

```bash
pytest tests/test_generators.py -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-iterate/generators.py scripts/auto-iterate/tests/test_generators.py
git commit -m "feat: add phase-specific generators"
```

---

## Task 17: 最终报告生成 `reporter.py`

**Files:**
- Create: `scripts/auto-iterate/reporter.py`
- Test: `scripts/auto-iterate/tests/test_reporter.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_reporter.py
from pathlib import Path
from reporter import generate_report
from state import State

def test_generate_report_creates_markdown(tmp_path):
    s = State(state_file=str(tmp_path / "s.json"))
    s.phase1_converged = True
    s.phase1_iterations = 2
    s.phase1_final_score = {"total_weighted_score": 0.83}
    s.phase2_converged = True
    s.phase2_iterations = 1
    s.phase2_final_score = {"total_weighted_score": 0.78}
    s.converged_modules = ["URL通用校验"]
    s.unconverged_modules = [{"module": "AI语义", "best_score": 0.72, "gap_dimensions": ["content_fidelity"]}]
    s.add_history("phase1", {"iter": 1, "score": 0.65})
    s.add_history("phase1", {"iter": 2, "score": 0.83})
    s.add_history("URL通用校验", {"iter": 1, "score": 0.88})

    report_path = tmp_path / "report.md"
    generate_report(s, str(report_path))

    text = report_path.read_text(encoding='utf-8')
    assert "URL通用校验" in text
    assert "AI语义" in text
    assert "0.83" in text
    assert "收敛" in text or "Converged" in text
```

- [ ] **Step 2: 运行测试，预期失败**

```bash
pytest tests/test_reporter.py -v
```

Expected: FAIL - module not found

- [ ] **Step 3: 实现 reporter.py**

```python
# reporter.py
from pathlib import Path
from state import State


def _fmt_score(s: dict) -> str:
    if not s:
        return "N/A"
    return f"{s.get('total_weighted_score', 0.0):.2f}"


def generate_report(state: State, output_path: str):
    """生成最终报告"""
    lines = []
    lines.append("# Supertester Skill 自动迭代优化报告\n")
    lines.append(f"开始时间: {state.started_at}\n")

    # 执行摘要
    lines.append("## 执行摘要\n")
    phase3_total = len(state.converged_modules) + len(state.unconverged_modules)
    lines.append(f"- Phase 1: {'已收敛' if state.phase1_converged else '未收敛'}, "
                 f"{state.phase1_iterations} 轮, 最终分 {_fmt_score(state.phase1_final_score)}")
    lines.append(f"- Phase 2: {'已收敛' if state.phase2_converged else '未收敛'}, "
                 f"{state.phase2_iterations} 轮, 最终分 {_fmt_score(state.phase2_final_score)}")
    lines.append(f"- Phase 3: {phase3_total} 个模块, "
                 f"{len(state.converged_modules)} 个收敛, "
                 f"{len(state.unconverged_modules)} 个需人工介入\n")

    # Phase 1 轨迹
    if "phase1" in state.history:
        lines.append("## Phase 1 迭代轨迹\n")
        lines.append("| 轮次 | 总分 | 短板维度 |")
        lines.append("|------|------|----------|")
        for h in state.history["phase1"]:
            weak = ", ".join(h.get("weak_dimensions", [])) or "—"
            lines.append(f"| {h['iter']} | {h.get('score', 0):.2f} | {weak} |")
        lines.append("")

    # Phase 2 轨迹
    if "phase2" in state.history:
        lines.append("## Phase 2 迭代轨迹\n")
        lines.append("| 轮次 | 总分 | 短板维度 |")
        lines.append("|------|------|----------|")
        for h in state.history["phase2"]:
            weak = ", ".join(h.get("weak_dimensions", [])) or "—"
            lines.append(f"| {h['iter']} | {h.get('score', 0):.2f} | {weak} |")
        lines.append("")

    # Phase 3 各模块轨迹
    lines.append("## Phase 3 各模块迭代轨迹\n")
    for module_name in state.converged_modules:
        if module_name in state.history:
            lines.append(f"### 模块: {module_name} (已收敛)\n")
            lines.append("| 轮次 | 总分 | 短板维度 |")
            lines.append("|------|------|----------|")
            for h in state.history[module_name]:
                weak = ", ".join(h.get("weak_dimensions", [])) or "—"
                lines.append(f"| {h['iter']} | {h.get('score', 0):.2f} | {weak} |")
            lines.append("")

    # 未收敛项
    if state.unconverged_modules:
        lines.append("## 未收敛项 (需人工介入)\n")
        lines.append("| 阶段/模块 | 最高分 | 短板维度 |")
        lines.append("|-----------|--------|----------|")
        for u in state.unconverged_modules:
            dims = ", ".join(u.get("gap_dimensions", [])) or "—"
            lines.append(f"| {u['module']} | {u.get('best_score', 0):.2f} | {dims} |")
        lines.append("")

    Path(output_path).write_text("\n".join(lines), encoding='utf-8')
```

- [ ] **Step 4: 运行测试，预期通过**

```bash
pytest tests/test_reporter.py -v
```

Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-iterate/reporter.py scripts/auto-iterate/tests/test_reporter.py
git commit -m "feat: add final report generator"
```

---

## Task 18: 主编排器 `orchestrator.py`

**Files:**
- Create: `scripts/auto-iterate/orchestrator.py`

- [ ] **Step 1: 实现 orchestrator.py**

```python
# orchestrator.py
"""主编排器: Phase 0 → Phase 1 迭代 → Phase 2 迭代 → Phase 3 按模块迭代 → 最终报告"""
import argparse
import json
import sys
from pathlib import Path

from config import Config
from state import load_or_init, State
from splitter import split_prd, split_reference, match_modules
from phase0 import run_phase0
from phase_loop import iterate
from generators import (
    make_phase1_generator, make_phase2_generator, make_phase3_generator,
)
from reporter import generate_report


def log(msg: str):
    print(f"[orchestrator] {msg}", flush=True)


def run_phase1(config: Config, state: State, baselines: dict):
    """Phase 1 迭代: 需求解析"""
    if state.phase1_converged:
        log("Phase 1 already converged, skipping")
        return
    log("Phase 1 start")
    prd_content = Path(config.prd_path).read_text(encoding='utf-8')

    # 使用合并后的 phase1 baseline (所有模块)
    baseline_a = baselines["phase1"]

    gen = make_phase1_generator(
        prd_content=prd_content,
        skill_dir=config.skill_dir,
        output_root=f"{config.output_dir}/iterations/phase1",
        prompt_dir=config.prompt_dir, model=config.model,
        timeout=config.timeout,
    )
    result = iterate(
        phase="phase1", module_name="_global",
        generator=gen, baseline_a=baseline_a,
        convergence=config.convergence["phase1"],
        skill_dir=config.skill_dir,
        snapshot_root=f"{config.output_dir}/skill-snapshots/phase1",
        iter_root=f"{config.output_dir}/iterations/phase1",
        abstraction_map=config.abstraction_map,
        skill_files=["skills/requirement-analysis/SKILL.md",
                     "skills/requirement-analysis/clarification-patterns.md"],
        max_revise_attempts=config.max_patch_revise_attempts,
        prompt_dir=config.prompt_dir, model=config.model,
        timeout=config.timeout,
    )
    state.phase1_converged = result["converged"]
    state.phase1_iterations = result["iterations"]
    state.phase1_final_score = result["final_score"]
    state.history["phase1"] = result["history"]
    state.save()
    log(f"Phase 1 end: converged={result['converged']} iterations={result['iterations']}")


def redo_phase1_final(config: Config) -> str:
    """Phase 1 收敛后用最终版 skill 重新生成定稿产物"""
    prd_content = Path(config.prd_path).read_text(encoding='utf-8')
    gen = make_phase1_generator(
        prd_content=prd_content, skill_dir=config.skill_dir,
        output_root=f"{config.output_dir}/final-artifacts",
        prompt_dir=config.prompt_dir, model=config.model,
        timeout=config.timeout,
    )
    output = gen(iter_num=0)  # 用 iter-0 表示定稿
    # 写到稳定路径
    final_path = Path(config.output_dir) / "final-artifacts" / "parsed-requirements.md"
    final_path.parent.mkdir(parents=True, exist_ok=True)
    final_path.write_text(output, encoding='utf-8')
    return output


def run_phase2(config: Config, state: State, baselines: dict,
               parsed_requirements: str):
    if state.phase2_converged:
        log("Phase 2 already converged, skipping")
        return
    log("Phase 2 start")

    baseline_a = baselines["phase2"]
    gen = make_phase2_generator(
        parsed_requirements=parsed_requirements,
        skill_dir=config.skill_dir,
        output_root=f"{config.output_dir}/iterations/phase2",
        prompt_dir=config.prompt_dir, model=config.model,
        timeout=config.timeout,
    )
    result = iterate(
        phase="phase2", module_name="_global",
        generator=gen, baseline_a=baseline_a,
        convergence=config.convergence["phase2"],
        skill_dir=config.skill_dir,
        snapshot_root=f"{config.output_dir}/skill-snapshots/phase2",
        iter_root=f"{config.output_dir}/iterations/phase2",
        abstraction_map=config.abstraction_map,
        skill_files=["skills/requirement-association/SKILL.md"],
        max_revise_attempts=config.max_patch_revise_attempts,
        prompt_dir=config.prompt_dir, model=config.model,
        timeout=config.timeout,
    )
    state.phase2_converged = result["converged"]
    state.phase2_iterations = result["iterations"]
    state.phase2_final_score = result["final_score"]
    state.history["phase2"] = result["history"]
    state.save()
    log(f"Phase 2 end: converged={result['converged']} iterations={result['iterations']}")


def redo_phase2_final(config: Config, parsed_requirements: str) -> str:
    gen = make_phase2_generator(
        parsed_requirements=parsed_requirements,
        skill_dir=config.skill_dir,
        output_root=f"{config.output_dir}/final-artifacts",
        prompt_dir=config.prompt_dir, model=config.model,
        timeout=config.timeout,
    )
    output = gen(iter_num=0)
    final_path = Path(config.output_dir) / "final-artifacts" / "associations.md"
    final_path.parent.mkdir(parents=True, exist_ok=True)
    final_path.write_text(output, encoding='utf-8')
    return output


def run_phase3(config: Config, state: State, baselines: dict,
               matched_modules: list, parsed_requirements: str,
               associations: str, only_module: str = None):
    log(f"Phase 3 start: {len(matched_modules)} modules")

    for module in matched_modules:
        name = module["name"]
        if only_module and name != only_module:
            continue
        if name in state.converged_modules:
            log(f"Module '{name}' already converged, skipping")
            continue
        if not module.get("ref_cases"):
            log(f"Module '{name}' has no reference cases, skipping")
            continue

        state.current_module = name
        state.save()
        log(f"Module '{name}' start")

        baseline_a = baselines["phase3"].get(name, {})
        gen = make_phase3_generator(
            module_name=name,
            module_prd=module.get("prd_content") or "",
            parsed_requirements=parsed_requirements,
            associations=associations,
            skill_dir=config.skill_dir,
            output_root=f"{config.output_dir}/iterations/phase3/{_safe(name)}",
            prompt_dir=config.prompt_dir, model=config.model,
            timeout=config.timeout,
        )
        result = iterate(
            phase="phase3", module_name=name,
            generator=gen, baseline_a=baseline_a,
            convergence=config.convergence["phase3"],
            skill_dir=config.skill_dir,
            snapshot_root=f"{config.output_dir}/skill-snapshots/phase3/{_safe(name)}",
            iter_root=f"{config.output_dir}/iterations/phase3/{_safe(name)}",
            abstraction_map=config.abstraction_map,
            skill_files=["skills/test-case-generation/SKILL.md",
                         "skills/test-case-generation/generator-reference.md"],
            max_revise_attempts=config.max_patch_revise_attempts,
            prompt_dir=config.prompt_dir, model=config.model,
            timeout=config.timeout,
        )
        state.history[name] = result["history"]
        if result["converged"]:
            state.converged_modules.append(name)
        else:
            state.unconverged_modules.append({
                "module": name,
                "best_score": max((h.get("score", 0) for h in result["history"]), default=0),
                "gap_dimensions": result.get("weak_dimensions", []),
            })
        state.save()
        log(f"Module '{name}' end: converged={result['converged']}")


def _safe(name: str) -> str:
    return name.replace('/', '_').replace(' ', '_')


def main():
    parser = argparse.ArgumentParser(description="Supertester Skill 自动迭代优化")
    parser.add_argument("--phase", type=int, choices=[0, 1, 2, 3],
                        help="只跑指定阶段 (0=baseline提取)")
    parser.add_argument("--module", type=str,
                        help="只跑指定模块 (仅对 Phase 3 有效)")
    parser.add_argument("--status", action="store_true",
                        help="查看当前进度然后退出")
    args = parser.parse_args()

    config = Config()
    state_file = f"{config.output_dir}/iteration-state.json"
    state = load_or_init(state_file)

    if args.status:
        log(f"Phase 0 complete: {state.phase0_complete}")
        log(f"Phase 1 converged: {state.phase1_converged} ({state.phase1_iterations} iters)")
        log(f"Phase 2 converged: {state.phase2_converged} ({state.phase2_iterations} iters)")
        log(f"Converged modules ({len(state.converged_modules)}): {state.converged_modules}")
        log(f"Unconverged modules: {[u['module'] for u in state.unconverged_modules]}")
        return 0

    # Phase 0: 拆分 + 基准提取
    Path(config.output_dir).mkdir(parents=True, exist_ok=True)

    prd_modules = split_prd(config.prd_path)
    ref_groups = split_reference(config.reference_path)
    matched = match_modules(prd_modules, ref_groups)
    log(f"Split: {len(prd_modules)} PRD modules, {len(ref_groups)} ref groups, "
        f"{sum(1 for m in matched if m.get('ref_cases'))} matched")

    baselines_path = Path(config.output_dir) / "baselines"
    if not state.phase0_complete or not baselines_path.exists():
        baselines = run_phase0(
            matched, config.output_dir,
            config.prompt_dir, config.model, config.timeout,
        )
        state.phase0_complete = True
        state.save()
    else:
        baselines = {
            phase: json.loads((baselines_path / f"{phase}-baseline.json").read_text(encoding='utf-8'))
            for phase in ["phase1", "phase2", "phase3"]
        }
        log("Phase 0 baselines loaded from disk")

    if args.phase == 0:
        return 0

    # Phase 1
    if args.phase is None or args.phase == 1:
        run_phase1(config, state, baselines)

    # 用最终 Phase 1 skill 重新生成定稿
    final_phase1_path = Path(config.output_dir) / "final-artifacts" / "parsed-requirements.md"
    if state.phase1_converged and not final_phase1_path.exists():
        log("Redo Phase 1 with final skill")
        redo_phase1_final(config)
    parsed_requirements = final_phase1_path.read_text(encoding='utf-8') if final_phase1_path.exists() else ""

    # Phase 2
    if args.phase is None or args.phase == 2:
        run_phase2(config, state, baselines, parsed_requirements)

    final_phase2_path = Path(config.output_dir) / "final-artifacts" / "associations.md"
    if state.phase2_converged and not final_phase2_path.exists():
        log("Redo Phase 2 with final skill")
        redo_phase2_final(config, parsed_requirements)
    associations = final_phase2_path.read_text(encoding='utf-8') if final_phase2_path.exists() else ""

    # Phase 3
    if args.phase is None or args.phase == 3:
        run_phase3(config, state, baselines, matched,
                   parsed_requirements, associations, only_module=args.module)

    # 最终报告
    report_path = f"{config.output_dir}/final-report.md"
    generate_report(state, report_path)
    log(f"Report generated: {report_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: 手动基本验证 — 运行 --status (不会真的调用 claude)**

```bash
cd scripts/auto-iterate
source .venv/Scripts/activate
python orchestrator.py --status
```

Expected: 输出 "Phase 0 complete: False" 等初始状态信息 (因为还没跑过)，无报错。

- [ ] **Step 3: Commit**

```bash
git add scripts/auto-iterate/orchestrator.py
git commit -m "feat: add main orchestrator with CLI and full phase wiring"
```

---

## Task 19: 端到端冒烟测试 (单模块真实运行)

**Files:**
- Modify: None (手动运行验证)

- [ ] **Step 1: 准备环境**

```bash
cd E:/workspace/aise/TestingAgent/scripts/auto-iterate
source .venv/Scripts/activate

# 确认 claude CLI 可用
claude --version
```

Expected: claude 版本号

- [ ] **Step 2: 运行单模块迭代 (选一个简单模块)**

```bash
python orchestrator.py --module "URL通用校验"
```

Expected:
- Phase 0 基准提取成功 (output/baselines/ 下有 JSON)
- Phase 1 迭代运行 (可能 1-4 轮)
- Phase 2 迭代运行
- Phase 3 仅 URL通用校验 模块迭代
- 最终报告生成 (output/final-report.md)

- [ ] **Step 3: 检查产物**

```bash
ls output/baselines/
ls output/iterations/phase1/
ls output/iterations/phase3/URL通用校验/
cat output/iteration-state.json
cat output/final-report.md
```

- [ ] **Step 4: 检查 skill 修改**

```bash
git diff skills/
# 或
ls scripts/auto-iterate/output/skill-snapshots/
```

Expected: 看到 skill 文件确实被修改，且每轮有快照。

- [ ] **Step 5: 验证通用性 — 抽查 diff 中的新规则**

手工检查 skill 里新增/修改的规则，确认：
- 不包含 "GEO" / "VisiGEO" / "URL黑名单" 等具体业务术语
- 不包含具体数值（如 "22 个域名"）
- 规则能换到其他产品场景适用

- [ ] **Step 6: 如验证通过，Commit 基线**

```bash
git add -A
git commit -m "test: end-to-end smoke test on URL通用校验 module"
```

- [ ] **Step 7: 如果发现问题**

根据现象回到对应任务修复：
- 基准提取 JSON 解析失败 → 调整 `extract-baseline.md` 输出格式约束
- 评分 JSON 不稳定 → 调整 `score.md` 中 schema 描述
- Patch diff 格式错误 → 调整 `analyze-and-patch.md` 中 diff 格式示例
- Patch 包含业务术语 → 加强 `review-patch.md` 审查条款

---

## Task 20: 全量运行与文档收尾

**Files:**
- Modify: `scripts/auto-iterate/README.md`

- [ ] **Step 1: 运行全量迭代 (不指定 module)**

```bash
python orchestrator.py
```

Expected: 所有 65 个模块按匹配情况执行（时长视 API 响应可能数小时）。

- [ ] **Step 2: 查看最终报告**

```bash
cat output/final-report.md
```

- [ ] **Step 3: 补充 README 的"故障排查"和"产物说明"**

```markdown
## 产物结构 (output/)

- `baselines/` — Phase 0 提取的三阶段基准 JSON
- `iterations/{phase-or-module}/iter-N/` — 每轮迭代的 ai-output / score / patch / review
- `skill-snapshots/` — 每次 apply patch 前的 skill 快照
- `final-artifacts/` — Phase 1/2 收敛后用最终 skill 重跑的定稿产物
- `iteration-state.json` — 全局状态，控制断点恢复
- `final-report.md` — 收敛报告

## 故障排查

- **claude 命令未找到**: 确认 Claude Code CLI 已安装，`claude --version` 可用
- **评分 JSON 解析失败**: 检查 `output/iterations/*/iter-*/score.json`；调整 `prompts/score.md`
- **Patch 应用失败**: 查看 history 中的 `patch_errors`；`prompts/analyze-and-patch.md` 可加强 diff 格式要求
- **某模块一直未收敛**: 查看 `weak_dimensions`；该维度的 skill 触发机制可能需要人工补强
- **要回滚所有修改**: 用 `git reset --hard <initial-commit>` 或从 `output/skill-snapshots/` 手动恢复

## 重新开始

删除 `output/` 目录即可。skill 文件若已被修改且想恢复，用 git 或 skill-snapshots 中的初始版本。
```

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-iterate/README.md
git commit -m "docs: add troubleshooting and artifact explanation"
```

---

## Self-Review

### Spec coverage 检查

| Spec 章节 | 实现任务 |
|-----------|---------|
| 1. 概述 | — (非实现) |
| 2.1 目录结构 | Task 1 |
| 2.2 执行流程 | Task 18 (orchestrator) |
| 2.3 Claude CLI 封装 | Task 3 |
| 3. 双基准评分 | Task 10 (score.md), Task 11 (scorer + dimensions) |
| 3.2-3.4 评分维度 | Task 11 (dimensions.py) |
| 3.5 维度综合逻辑 | Task 10 (score.md 规则部分) |
| 3.6 收敛标准 | Task 2 (config), Task 11 (is_converged) |
| 4.2.1 Patch 生成硬约束 | Task 12 (analyze-and-patch.md) |
| 4.2.2 自动审查 | Task 13, Task 14 |
| 4.2.3 抽象映射表 | Task 2 (config), 通过 prompt 注入 |
| 5. 差距分类 | Task 12 |
| 6.1 状态文件 | Task 5 |
| 6.2 断点恢复 | Task 5 + Task 18 |
| 6.3 快照回滚 | Task 6 |
| 7.1 extract-baseline | Task 7 |
| 7.2 生成 prompts | Task 9 |
| 7.3 score | Task 10 |
| 7.4 analyze-and-patch | Task 12 |
| 7.5 review-patch | Task 13 |
| 7.6 revise-patch | Task 13 |
| 8. 实现组件 | Task 2/4/5/6/11/14/15/16/17/18 |
| 9. 环境与运行 | Task 1, Task 18, Task 20 |
| 10. 报告结构 | Task 17 |

所有章节都有对应任务。

### 一致性检查

- Task 18 orchestrator 调用 `iterate()` — 签名与 Task 15 定义匹配 (phase, module_name, generator, baseline_a, convergence, skill_dir, snapshot_root, iter_root, abstraction_map, skill_files)
- Task 15 中 `run_analysis_cycle` 调用 — 签名与 Task 14 定义匹配
- `claude_call` 签名一致 (Task 3 → 所有调用方)
- `State` 字段 (Task 5) 与 orchestrator 使用的字段匹配

### Placeholder 扫描

无 TBD / TODO / "类似 Task N" 等。每个实现步骤都有完整代码。

---

## 执行交接

Plan complete and saved to `docs/superpowers/plans/2026-04-12-auto-iterate.md`. Two execution options:

1. **Subagent-Driven (recommended)** - 每个 task 派一个新 subagent，task 间审查，迭代快
2. **Inline Execution** - 本会话内执行，批量断点审查

Which approach?
