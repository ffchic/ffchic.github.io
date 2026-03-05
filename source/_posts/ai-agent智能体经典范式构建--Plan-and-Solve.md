---
title: ai-agent智能体经典范式构建--Plan-and-Solve
date: 2026-03-04 16:19:52
categories: [技术, AI]
tags: [AI Agent, 智能体, LLM, 架构设计]
---

Plan-and-Solve 翻译过来是规划和执行，他的执行逻辑顾名思义，先规划（Plan）再执行（Solve）。

### ReAct 与 Plan-and-Solve 的区别

在了解 Plan-and-Solve 之前，我们经常会对比另一种经典的 [Agent 范式](ai-agent智能体经典范式构建--ReAct.md)：**ReAct (Reason + Act)**。它们在处理复杂任务时的核心逻辑有显著的区别：

1. **执行模式不同**：
   - **ReAct** 采用的是“交替式”的思考与行动（Interleaved Reasoning and Acting）。它会在每走一步之前先进行思考（Thought），然后执行一个动作（Act），观察结果（Observation）后，再决定下一步怎么走。走一步看一步。
   - **Plan-and-Solve** 则是将“规划”和“执行”完全解耦。它会在一开始统揽全局，直接将复杂问题拆解为一个包含多个子步骤的**完整执行计划**，然后再按照计划列表逐一去解决（Solve）这些子问题。

2. **长期任务的表现（长程推理）**：
   - **ReAct** 在面对需要很多步骤的长流程任务时，非常容易“迷失方向”。因为每次动作只聚焦当前状态，缺乏全局视野，容易导致错误累积、陷入重复调用同一个工具的“死循环”，或者遗忘最初的目标。
   - **Plan-and-Solve** 通过提前制定全局计划，大大提升了长程任务的稳定性和成功率。它能更好地掌控任务进度，清楚地知道当前处在整个计划的哪一个环节。

3. **灵活性与容错**：
   - **ReAct** 的灵活性极高，每一次行动都会根据最新的真实环境反馈来调整，非常适合高度动态和需要探索的信息收集任务。
   - **Plan-and-Solve** 初始计划的灵活性相对固化。如果在第一步执行时就遇到了突发情况导致环境改变，后续排好的计划可能就不再适用了。因此，高级的 Plan-and-Solve 架构通常还需要引入**重新规划（Re-plan）**机制来弥补这一缺陷。

简单来说，**ReAct 就像是一个“边走边看、摸着石头过河”的探险家**，而 **Plan-and-Solve 则像是一个“先画好施工图纸，再按图搬砖”的工程师**。

### Plan-and-Solve 的工作原理

简单来说，**Plan-and-Solve** 会把整个流程分成两部分：

- **规划阶段 (Planning Phase)**：第一部分并不会着急去解决问题或调用工具，而是将问题分解，并制定一个清晰、分步骤的计划。这个计划本身就是一次大语言模型的调用产物。
- **执行阶段 (Solving Phase)**：在获得完整的计划后，智能体进入执行阶段。它会严格按照计划中的步骤，逐一执行。每一步的执行都可能是一次独立的 LLM 调用，或者是对上一步结果的加工处理，直到计划中的所有步骤都完成，最终得出答案。

我们可以将这个两阶段过程进行形式化表达。首先，规划模型 $\pi_{\text{plan}}$ 根据原始问题 $q$ 生成一个包含 $n$ 个任务的计划 $P = (p_1, p_2, p_3, \dots, p_n)$：

$$P = \pi_{\text{plan}}(q)$$

随后，在执行阶段，执行模型 $\pi_{\text{solve}}$ 会逐一完成计划中的步骤。对于第 $i$ 个步骤，其解决方案 $s_i$ 的生成会同时依赖于原始问题 $q$、完整计划 $P$ 以及之前所有步骤的执行结果 $(s_1, \dots, s_{i-1})$：

$$s_i = \pi_{\text{solve}}(q, P, (s_1, \dots, s_{i-1}))$$

最终的答案就是最后一个步骤的执行结果 $s_n$。

{% asset_img lan-and-Solve范式.png lan-and-Solve范式 %}


Plan-and-Solve 尤其适用于那些结构性强、可以被清晰分解的复杂任务，例如：

- 多步数学应用题：需要先列出计算步骤，再逐一求解。
- 需要整合多个信息源的报告撰写：需要先规划好报告结构（引言、数据来源A、数据来源B、总结），再逐一填充内容。
- 代码生成任务：需要先构思好函数、类和模块的结构，再逐一实现。

### 编码实现

为了彰显范式的特性，这次我们不使用现成的高级工具库，而是通过提示词的设计与代码封装，从零完成一个简单的推理任务。

目标问题如下：
> “一个水果店周一卖出了 15 个苹果。周二卖出的苹果数量是周一的两倍。周三卖出的数量比周二少了 5 个。请问这三天总共卖出了多少个苹果？”

这种连环数学题无法通过单次大模型查询得出准确实时的计算结果，必须先将问题分解为逻辑连贯的子步骤，然后再按顺序求解。这正是检验 Plan-and-Solve **“先规划，后执行”** 核心能力的绝佳场景。

#### 1. 规划阶段 (Planner)

提示词部分，规划阶段和执行阶段需要两段不同的 Prompt。在规划阶段，我们需要明确告诉模型：**只做规划拆解，不要进行计算和执行**。

````python
# 规划阶段提示词
PLANNER_PROMPT_TEMPLATE = """
你是一个顶级的 AI 规划专家。你的任务是将用户提出的复杂问题，分解成一个由多个简单步骤组成的行动计划。
请确保计划中的每个步骤都是一个独立的、可执行的子任务，并且严格按照逻辑顺序排列。
你的输出必须是一个 Python 列表，其中每个元素都是一个描述子任务的字符串。

问题: {question}

请严格按照以下格式输出你的计划，```python 与 ``` 作为前后缀是必要的:
```python
["步骤1", "步骤2", "步骤3", ...]
```
"""
````

这个提示词通过以下几点确保了输出的质量和稳定性：
- **角色设定**：定义为“顶级的 AI 规划专家”，激发大模型的专业推理能力。
- **任务描述**：清晰定义了“仅分解问题”的边界目标。
- **格式约束**：强制要求输出为 `Python` 列表格式的字符串，这极大地简化了我们在代码中的解析工作，使其比解析自然语言更稳定可靠。

接下来，我们将这个逻辑封装成一个 `Planner` 类：

```python
import ast
# 假定 llm_client.py 中的 HelloAgentsLLM 类已经定义好
# from llm_client import HelloAgentsLLM
from system_prompt import PLANNER_PROMPT_TEMPLATE

class Planner:
    def __init__(self, llm_client):
        self.llm_client = llm_client

    def plan(self, question: str) -> list[str]:
        """根据用户问题生成一个行动计划"""
        prompt = PLANNER_PROMPT_TEMPLATE.format(question=question)
        messages = [{"role": "user", "content": prompt}]
        
        print("--- 正在生成计划 ---")
        response_text = self.llm_client.think(messages=messages) or ""
        print(f"✅ 计划已生成:\n{response_text}")
        
        # 解析 LLM 输出的列表字符串
        try:
            # 提取 ```python 和 ``` 之间的内容
            plan_str = response_text.split("```python")[1].split("```")[0].strip()
            # 使用 ast.literal_eval 安全地将字符串转换为 Python 列表
            plan = ast.literal_eval(plan_str)
            return plan if isinstance(plan, list) else []
        except (ValueError, SyntaxError, IndexError) as e:
            print(f"❌ 解析计划时出错: {e}\n原始响应: {response_text}")
            return []
        except Exception as e:
            print(f"❌ 解析计划时发生未知错误: {e}")
            return []
```

#### 2. 执行器与状态管理 (Executor)

规划器勾勒好清晰的蓝图后，我们需要一个 `Executor` (执行器) 逐一完成计划中的分解任务。执行器不仅负责调用大语言模型解决子问题，还要承担**状态管理**的核心职责：它必须记录每一步的具体计算结果，并将其作为上下文“击鼓传花”提供给后续步骤。

执行器的提示词需要包含以下关键信息：
- **原始问题**：确保模型不偏离最终目标。
- **完整计划**：让模型了解当前步骤的全局站位。
- **历史步骤与结果**：也就是**状态**，作为当前步骤的先决已知条件。
- **当前步骤**：明确当下的具体微小任务。

````python
# 执行阶段提示词
EXECUTOR_PROMPT_TEMPLATE = """
你是一位顶级的 AI 执行专家。你的任务是严格按照给定的计划，一步步地解决问题。
你将收到原始问题、完整的计划、以及到目前为止已经完成的步骤和结果。
请你专注于解决“当前步骤”，并仅输出针对该步骤的最终答案，不要输出任何额外的解释或对话。

# 原始问题:
{question}

# 完整计划:
{plan}

# 历史步骤与结果（已知条件）:
{history}

# 当前步骤:
{current_step}

请仅输出针对“当前步骤”的精简回答:
"""
````

在 `Executor` 类的实现中，我们通过一个循环来驱动执行，并利用 `history` 变量维护执行流转的上文状态：

```python
from system_prompt import EXECUTOR_PROMPT_TEMPLATE

class Executor:
    def __init__(self, llm_client):
        self.llm_client = llm_client

    def execute(self, question: str, plan: list[str]) -> str:
        """根据计划，逐步执行并汇总解决问题"""
        history = ""  # 用于存储历史步骤和结果的状态记录
        final_answer = ""  # 初始化最终答案
        
        print("\n--- 正在执行计划 ---")
        
        for i, step in enumerate(plan):
            print(f"\n-> 正在执行步骤 {i+1}/{len(plan)}: {step}")
            
            prompt = EXECUTOR_PROMPT_TEMPLATE.format(
                question=question,
                plan=plan,
                history=history if history else "无", 
                current_step=step
            )
            
            messages = [{"role": "user", "content": prompt}]
            response_text = self.llm_client.think(messages=messages) or ""
            
            # 更新历史记录，为下一个循环传递状态
            history += f"步骤 {i+1}: {step}\n结果: {response_text}\n\n"
            print(f"✅ 步骤 {i+1} 已完成，结果: {response_text}")
            
            final_answer = response_text

        # 循环结束后，最后一步的响应就是总体规划的最终答案
        return final_answer
```

#### 3. 编排合并 (PlanAndSolveAgent)

最后，我们需要一个智能体调度器将 `Planner` 和 `Executor` 进行整合并对外暴露能力。

```python
class PlanAndSolveAgent:
    def __init__(self, llm_client):
        """初始化智能体，挂载规划器与执行器实例"""
        self.llm_client = llm_client
        self.planner = Planner(self.llm_client)
        self.executor = Executor(self.llm_client)

    def run(self, question: str):
        """运行智能体的完整生命周期：先规划 -> 后执行"""
        print(f"\n--- 开始处理问题 ---\n问题: {question}")
        
        # 1. 拆解：调用规划器生成计划
        plan = self.planner.plan(question)
        if not plan:
            print("\n--- 任务终止 --- \n无法生成有效的行动计划。")
            return

        # 2. 求解：调用执行器逐步执行计划
        final_answer = self.executor.execute(question, plan)
        print(f"\n--- 任务完成 ---\n🎉 最终答案: {final_answer}")
```

该部分设计极好地体现了**“组合优于继承”**的架构原则。Agent 作为一个协调者 (Orchestrator)，自身没有冗余的复杂逻辑，通过流水线一样调用各个明确分工的组件，使得代码变得极具可维护性。

#### 4. 运行实例

将这套代码运行起来后，我们可以从终端日志一窥模型思考的全过程：

````text
--- 开始处理问题 ---
问题: 一个水果店周一卖出了15个苹果。周二卖出的苹果数量是周一的两倍。周三卖出的数量比周二少了5个。请问这三天总共卖出了多少个苹果？

--- 正在生成计划 ---
🧠 正在调用大语言模型...
✅ 计划已生成:
```python
["计算周二卖出的苹果数量：周一卖出的15个苹果乘以2", "计算周三卖出的苹果数量：周二卖出的数量减去5个", "计算三天卖出的苹果总数：将周一、周二、周三卖出的数量相加"]
```

--- 正在执行计划 ---

-> 正在执行步骤 1/3: 计算周二卖出的苹果数量：周一卖出的15个苹果乘以2
🧠 正在调用大语言模型...
✅ 步骤 1 已完成，结果: 30

-> 正在执行步骤 2/3: 计算周三卖出的苹果数量：周二卖出的数量减去5个
🧠 正在调用大语言模型...
✅ 步骤 2 已完成，结果: 30 - 5 = 25

-> 正在执行步骤 3/3: 计算三天卖出的苹果总数：将周一、周二、周三卖出的数量相加
🧠 正在调用大语言模型...
✅ 步骤 3 已完成，结果: 15 + 30 + 25 = 70

--- 任务完成 ---
🎉 最终答案: 70
```

至此，一个从设计到实现的**标准 Plan-and-Solve 范式**智能体便跃然纸上。相比起 ReAct 范式的见机行事，Plan-and-Solve 确实更加稳健，更像是“运筹帷幄之中，决胜千里之外”。