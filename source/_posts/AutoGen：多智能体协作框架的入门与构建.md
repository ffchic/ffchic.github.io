---
title: AutoGen：多智能体协作框架的入门与构建
date: 2026-04-01 10:00:00
categories:
  - [技术]
  - [AI]
tags: [智能体, AI-Agent, AutoGen]
---

## 核心思想

AutoGen 的核心思想是**通过对话实现协作**。它将多智能体系统抽象为一个由多个“可对话”智能体组成的群聊。开发者可以定义不同角色（如 `Coder`、`ProductManager`、`Tester` 等），并设定它们之间的交互规则（例如：`Coder` 写完代码后由 `Tester` 自动接管）。

任务的解决过程，就是这些智能体在群聊中通过自动化消息传递，不断对话、协作、迭代，直至最终达成目标的过程。

## 模型客户端配置

首先，我们先来了解一下模型客户端的配置。

```python
# OpenAIChatCompletionClient 是兼容 OpenAI 接口格式的通用模型客户端，可对接 DeepSeek 等第三方服务
from autogen_ext.models.openai import OpenAIChatCompletionClient

client = OpenAIChatCompletionClient(
    # 模型名称从环境变量读取，默认使用 DeepSeek 的对话模型
    model=os.getenv("OPENAI_MODEL", "deepseek-chat"),
    api_key=api_key,
    # API 基础地址从环境变量读取，支持切换到不同的 OpenAI 兼容服务
    base_url=os.getenv("OPENAI_API_BASE", "https://api.deepseek.com/v1"),
    temperature=temperature,  # 输出创造性程度（0.0 最保守，1.0 最随机）
    max_tokens=max_tokens,    # 每次生成的最大 token 数
    top_p=0.9,                # Nucleus 采样阈值：只从累积概率前 90% 的 token 中采样，平衡多样性与质量
    model_info=ModelInfo(
        family="openai",          # 模型接口协议族，声明兼容 OpenAI 格式
        vision=False,             # 该模型不支持图像输入
        function_calling=True,    # 支持函数调用（Tool Call），可配合工具使用
        json_output=True,         # 支持结构化 JSON 输出模式
        structured_output=False,  # 不使用 OpenAI 的 Structured Output 严格模式
    ),
)
```

以上代码是实例化一个模型客户端的 Demo，指定了各种参数：使用的 LLM、最大 Token 数、模型信息等。

#### 核心参数解析：Temperature

其中，`temperature` 是一个极其关键的参数，它控制着模型输出概率分布的“尖锐程度”。

简单来讲，在模型预测下一个词时，会把每个候选词的原始分数（Logits，$z_i$）除以 $T$（即 Temperature），公式表现为 $z_i / T$。

假设现在有三个候选词及其原始分数：
- 词 **“好”**：`3` 分
- 词 **“棒”**：`2` 分
- 词 **“烂”**：`1` 分

根据不同的 $T$ 值，运算结果如下：

- **假设一：$T = 1$（原始状态）**
  运算后的分数不变，原始分数直接参与后续概率计算。
- **假设二：$T = 0.5$（趋于保守）**
  分数会变得苛刻，放大差距。运算后：
  词 **“好”**（`3/0.5=6` 分）> 词 **“棒”**（`2/0.5=4` 分）> 词 **“烂”**（`1/0.5=2` 分），“好”的优势被进一步拉大。
- **假设三：$T = 2$（趋于随机）**
  分数变得宽容，缩小差距。运算后：
  词 **“好”**（`3/2=1.5` 分）> 词 **“棒”**（`2/2=1` 分）> 词 **“烂”**（`1/2=0.5` 分），各个词被选中的概率变得更加相近。

**总结来说，`temperature` 值越大，各个词之间的原始差距被缩得越小，模型选词越偏向随机发散；值越小，差距被放大，模型越偏向确定保守。**

> **注：** 实际模型中，运算后的分数最终还会通过 Softmax 函数（指数归一化）转换为 $0 \sim 100\%$ 的概率！上面的 `3/2/1` 分只是为了方便理解 $T$ 是如何放大/缩小差距的。真实模型中，转换后的概率大致呈现下方表格所示的动态变化趋势：

| Temperature $T$ | 效果 | 概率分布示例长什么样 |
| :--- | :--- | :--- |
| **$T \to 0$** | 极度确定，永远选最高概率词 | 好: 99%，棒: 1%，烂: 0% |
| **$T = 0.3$** | 保守，高概率词碾压其他 | 好: 80%，棒: 18%，烂: 2% |
| **$T = 0.7$**（默认）| 平衡 | 好: 55%，棒: 35%，烂: 10% |
| **$T = 1.0$** | 使用模型原始分布，不做任何压缩 | 好: 45%，棒: 30%，烂: 25% |
| **$T > 1.0$** | 分布趋于均匀，各词概率接近，输出混乱 | 好: 36%，棒: 34%，烂: 30% |


#### 核心参数解析：top_p

`top_p`（Nucleus Sampling，核采样）的作用简单来说就是**“砍尾巴”**。它通常和 `temperature` 配合使用：先由 `temperature` 处理数据得出概率分布，再根据 `top_p` 的阈值比例来砍掉尾巴，最后才进行选词。

假设经过 `temperature` 处理后，候选词的概率如下：
- **“好”**：45%
- **“棒”**：25%
- **“绝”**：15%
- **“行”**：8%
- **“烂”**：5%
- **...（其他低概率词）**：合计 2%

如果我们设置 `top_p = 0.9`（即 90%），模型会按概率从高到低累加，只截取累积概率刚达到 90% 时的单词集合：

1. 第一名 **“好”** (45%) —— 累计：45%（没到 90%，继续）
2. 第二名 **“棒”** (25%) —— 累计：70%（没到 90%，继续）
3. 第三名 **“绝”** (15%) —— 累计：85%（没到 90%，继续）
4. 第四名 **“行”** (8%) —— 累计：93% （超过了 90%！停！）

**结果**：只有 **【好、棒、绝、行】** 这 4 个词留下来进入最终的抽签池（并且这四个词的概率会按比例重新放大归一化到 100%）。而排在后面的“烂”以及更糟的词，将被直接拦腰斩断、彻底除名。哪怕它原本还有 5% 的机会，现在的入选概率也是 0%。

#### temperature 和 top_p 的协同工作

在底层运行中，这两个参数可以说是“黄金搭档”。它们的协同工作流程如下：

1. **算概率**：先使用 `temperature` 来决定候选词分差是被放大还是缩小，计算出一个带有特定“感情色彩”的概率分布。
2. **砍尾巴**：再用 `top_p` 执行“截断”——看着调完之后的概率单，从上往下加，一旦累计达到阈值（如 `0.9`）就划线，把排在后面的“弱势词”全扔掉。
3. **终极抽签**：从活下来的“精英”圈子里，按它们的相对概率随机抽取一个词输出。

**核心区别总结**：

| 比较维度 | Temperature (温度) | top_p (核采样 / 截断采样) |
| :--- | :--- | :--- |
| **手段** | 像**“滤镜”**：改变所有人分数的差距。 | 像**“剪刀”**：直接把排在后面的选项咔嚓剪掉。 |
| **态度** | 温柔：即使把 $T$ 调得很低，最后一名也依然有那么 `0.0001%` 的机会，理论上没绝杀。 | 冷酷：只要你没挤进去前 $P\%$ 的圈子，直接出局，概率彻底归零。 |
| **解决的问题** | 防止输出过于死板（提高 $T$），或防止输出过于发散（降低 $T$）。 | 剪除“长尾噪音”。语言模型词汇表有几万个词，往往有几千个极低概率的词（比如乱码或离谱生僻字）。`top_p` 的任务就是把这几千个垃圾选项永远关在门外，防止哪怕万分之一的“爆冷抽中”。 |

#### 核心参数解析：`json_output` 与 `structured_output`

这两个参数通常一起出现，它们主要用于指导或强制大模型以结构化的 JSON 格式返回输出。

- **当 `json_output=True` 时：**
  它就像是在提示里告诉模型：“请自觉一点，把结果按照 JSON 的格式发给我。”
  - **模型表现**：它会**尽力**返回 JSON。
  - **潜在问题**：因为它只是“尽力”，有时候它可能会漏写一个逗号、多加一个引号、把字段名拼错（比如把 `name` 写成了 `first_name`），甚至在 JSON 外面还啰里啰嗦加一句“这是您要求的 JSON 代码”。
  - **可能后果**：当你的程序尝试去解析（Parse）这段文本时，极易因为格式或类型的细微错误而自动报错挂掉。

- **当 `structured_output=True` 时：**
  这相当于直接给大模型发了一张“固定格式的机读答题卡”。此时，这不再仅仅是一个提示语的作用，而是从大模型底层的推理生成机制层面，**严格限制了**模型的输出概率分布。它能确保输出百分之百符合你预先定义的 JSON Schema（数据结构）约束，连多余的一个废话字符都不会出现。

> **避坑指南：**虽然当前绝大多数模型都能听懂“输出 JSON”的指令（即支持 `json_output`），但底层引擎直接支持严格 `structured_output` 模式的模型并不算多。该特性目前更广泛且成熟地应用于 OpenAI 的官方原生模型（如 `GPT-4o` 等）。
> 
> 在上文的示例代码中，我们对接的是第三方 DeepSeek 服务，受限于 API 的原生支持情况，所以这里我们暂时将 `structured_output` 设置成了 `False`。


## AutoGen 的 Agent (智能体)

```python
# AssistantAgent 是 AutoGen 中最基础的对话智能体，负责与语言模型交互并生成回复
from autogen_agentchat.agents import AssistantAgent

coding_assistant = AssistantAgent(
    name="CodingMentor",        # 智能体名称，用于标识和日志输出
    model_client=client,        # 绑定上面创建的模型客户端
    system_message="""你是一位专业的 Python 编程导师。
    你的职责是:
    1. 清晰地解释编程概念
    2. 提供带注释的代码示例
    3. 建议最佳实践
    4. 帮助调试问题

    总是用 Markdown 格式化代码，并解释你的推理过程。""",
)
```

#### `AssistantAgent`

`AssistantAgent` 是 AutoGen 中最基础、最常用，也是最成熟的对话智能体类。它是任务的主要解决者，其核心是封装了一个大型语言模型（LLM）。

如果把 AutoGen 比作一个“虚拟外包项目组”，那么 `AssistantAgent` 就是这个项目组的**核心脑力员工**。它本身“没有手”（不具备直接在本地电脑上执行代码或操作的能力），但它拥有最强的思考与规划能力。你通过 `system_message` 给它分配什么角色（如：前端专家、文案策划、数据分析师），它就能胜任对应的工作。

除此之外，它还内置了以下强大的核心能力：

- **记忆功能（维护上下文）**：大模型本身是无状态、没有记忆的，需要每次对话时都把之前的对话历史统一发送给大模型。`AssistantAgent` 内部自动实现了历史消息的管理与拼接功能。
- **代码提取与格式化（Code Block Parsing）**：大模型在回答时，往往会将代码、代码注释、说明文字甚至一些废话混合在一起返回。`AssistantAgent` 内置了提取能力，它会自动扫描大模型回答的 Markdown 内容中的独立代码块，方便后续交给其他 Agent（如 `UserProxyAgent`）去执行。
- **工具调用（Function Calling / Tool Use）**：可以给大模型注册一些 Python 函数（例如：`get_weather(city: str)`、`search_web(query: str)`）。当你问到某些模型不知道的实时/专有信息，且工具恰好可以获取时，模型会按照约定格式输出调用指令。底层机制捕获该指令后会执行对应函数，再把调用结果返回给大模型。
- **自动化的重试与纠错（Auto-Reply & Fallback）**：面对复杂的任务，代码往往一次性跑不通。这时别的 Agent（通常是 `UserProxyAgent` 充当的执行者和测试者）在运行时如果抛出异常，会把异常信息反馈给它（例如：“*你刚才写的代码抛出了 IndentationError，在第4行。*”）。`AssistantAgent` 底层自带 `auto-reply`（自动回复）机制，不需要开发者写额外的 `while` 循环。它收到报错后会自动将报错信息塞进上下文，再次请求大模型：“根据报错，给我一个新的修复方案。” 只有当问题解决，或者达到最大重试次数（`max_consecutive_auto_reply`）时，交互才会停止。
- **终止条件判断（Termination Detection）**：AI 群聊很容易陷入无限死循环（例如两个 AI 互相发送“谢谢你”、“不客气”）。因此，`AssistantAgent` 经常被配置一种“终止词”识别能力。比如，你可以约定当任务彻底完成时，在回复末尾加上 `TERMINATE`。框架一旦检测到该触发词，就会自动结束这轮多智能体对话任务。



#### `UserProxyAgent`

`UserProxyAgent` 可以理解为人类用户在 AutoGen 中的代理或化身，它通常与 `AssistantAgent` 构成最经典的协作模式。

**`UserProxyAgent` 的三大核心使命：**

- **信息输入层 (Human-in-the-loop)**：拦截对话，请求人类干预或提供决策。
- **物理执行层 (Execution)**：作为 AI 的“手”，负责在真实机器上跑代码或调 API（注意：这点在最新的 AutoGen 0.4 架构演进中发生了改变，引入了专门的 `CodeExecutorAgent`）。
- **流程控制层 (Orchestration)**：作为项目的绝对主导者，随时可以通过人类指令拉停失控的对话（例如发送 `TERMINATE`）。


##### 信息输入层
在 AutoGen 0.2 版本使用时会有一个核心参数 `human_input_mode`，它的可能值及作用如下：
- `"ALWAYS"`：智能体每次收到消息都会提示人工输入。
- `"TERMINATE"`：智能体仅在收到终止消息时，或自动回复次数达到 `max_consecutive_auto_reply` 时提示人工输入。
- `"NEVER"`：智能体永远不会提示人工输入，完全自主运行。

但在 0.4 新版本中，废弃了 `human_input_mode` 这一参数，改用更加灵活的方式：
- **对于普通对话**：`UserProxyAgent` 默认只要给了它任务，就会自动往下走。如果传入了 `input_func=...`，就相当于在接管人类的输入。可以传入一个函数，函数最终返回一个回复，这样更加灵活。
- **对于高危操作**（如：执行代码）：放在了 `CodeExecutorAgent`（见下文）。通过 `approval_func=...` 这就相当于一种精准管控的 ALWAYS —— 我们允许它自由思考、自由对话，但只有在它打算执行代码时，才需要人类点头 y/n。

##### 物理执行层
在过去的老版本中，没有 `CodeExecutorAgent`，只有 `UserProxyAgent`。这时候的 `UserProxyAgent` 是一个全能王，他既负责拦截对话让用户输入，又负责对大模型输出的结果代码进行测试。这样会有两个缺陷：
- **极度不安全**：`UserProxyAgent` 代表了用户，那么他就有极大的权限，就可以在没有用户授权的情况下运行测试代码。
- **代码极难维护**：概念混淆，配置参数极其臃肿。

在新的版本中引进了 `CodeExecutorAgent`。它是无情的代码执行机器，只用来执行测试代码，从而区分 `UserProxyAgent` 的工作，让流程更加清晰。

##### 终止条件判断 (Termination)
**流程控制层**：作为项目的绝对主导者，随时可以拉停失控的对话（发送 `TERMINATE`）。
在整个流程中，如果说了 `TERMINATE` 那么 Agent 就会认为这次对话已经完成。初级玩法是给模型一段提示词，如：

```text
你是一个有用的AI助手。
当你需要解决问题时，你可以编写Python代码。
请将代码放在 ```python 和 ``` 之间，它将被执行。
警告：请不要在提供代码的同一轮回复中说出 'TERMINATE'！
你必须等待代码被执行，看到执行成功并输出结果后，才能在下一轮单独回复 'TERMINATE' 来结束对话。
```

但这样也不能完全保证大模型的回答没有多余信息。更好的做法是**不让大模型输出 TERMINATE，而是调用工具 (Function Calling) 或再引入一个 ReviewerAgent 来解决是否结束的问题**：

- **接口约束（Protocol Constraint）**：收回文本终止权，强制大模型通过 Function Calling 提交确定性的结果来结束流程。
- **职责分离（Separation of Duties）**：打破“既当运动员又当裁判”的单体模型局限，引入 ReviewerAgent 进行交叉验证，通过多智能体间的博弈和审批来确保输出质量。


## RoundRobin 固定轮询与 Selector 动态路由

AutoGen 的核心概念就是群聊。但在群聊中如果超过了两个 Agent，那“下一个谁发言”就成了一个必须解决的路由问题。

- **确定性（强流程控制）：`RoundRobinGroupChat`**
  基于数组索引的绝对轮询。例如 `[A, B, C]` 的顺序永远是 A → B → C → A。
  - **特点**：不需要额外的 `model_client`，它本身不消耗 Token 做路由决策。
  - **适用场景**：
    1. 双角色的“乒乓球式”对话（如：师生问答、辩论）。
    2. 严格的工序流水线（如：数据分析师 → 解决方案专家）。
  - **技术局限**：缺乏灵活性。如果 B 发现了错误想退回给 A，在纯轮询中很难做到，它必须按顺序传给 C（这样反而会由于无效对话额外消耗 Token）。

- **自适应（大模型动态决策）：`SelectorGroupChat`**
  背后藏着一个隐藏的“LLM 主持人”。每一轮发言后，主持人会读取当前聊天记录，并分析所有参与者的职责，决定把麦克风交给谁。
  - **特点**：不仅发声的 Agent 会消耗 Token，维持群聊路由本身的判定（`model_client`）也会消耗 Token。
  - **低 Temperature 的必要性**：路由器的 `temperature` 必须设置得极低（通常为 0.1 或 0），以保证它像齿轮一样基于逻辑精准判定，而不是“富有创意地瞎指派”。
  - **Prompt 编写技巧**：在 Selector 模式中，参与者的 `system_message` 不仅是给自己看的，也是给“主持人”看的。因此必须明确写明**“交接指令”**（例如：“如果你是 QA 发现了问题，请明确在回复中指出让 Developer 重新返工”）。

#### 核心对比总结

| 比较维度 | `RoundRobin` (固定轮询) | `Selector` (动态路由) |
| :--- | :--- | :--- |
| **控制力** | 绝对控制 | 交由大模型控制 |
| **成本 (Token)** | 低 | 高，每轮多一次路由推理 |
| **适用复杂度** | 线性流 | 非线性网状协同 |

#### 进阶探讨

- **Selector 的状态图约束（Transitions）**
  在 `Selector` 动态路由中，默认是全互连网络（所有人都能传话给所有人）。但在真实的商业业务中，我们往往需要限制路由走向。
  AutoGen 允许通过配置“状态转换边”或提示词来赋予群聊“状态机”式的严格跳转规则。比如限制 `Tester` 只能把任务传给 `Developer` 或 `PM`，绝对禁止流转给其他无关 Agent，从而缩减路由 LLM 的选择空间，降低大模型幻觉概率。

```python
# 核心：通过定制 selector_prompt 赋予群聊“状态机”式的严格跳转规则
custom_prompt = """你是一个群聊的主持人。请根据以下规则选择下一个发言人：
                  1. 刚开始必须由 Planner 发言。
                  2. 如果 Planner 说'计划完成'，下一个必须是 Executor。
                  3. 如果 Executor 说'执行完毕'，下一个必须是 Reviewer。
                  4. 如果 Reviewer 提出修改建议，下一个必须是 Executor 重新执行。
                  根据当前的对话历史，输出下一个应该发言的角色名称。
"""
```

- **`description` 属性的妙用**
  在 `SelectorGroupChat` 中，“主持人（路由 LLM）”其实优先看的是每个 Agent 的 `description` 来决定下一个是谁。如果不传 `description`，框架会自动把超长的 `system_message` 喂给路由器。这不仅会无端浪费 Token，还会因为文字过多导致路由器“抓错重点，乱指派任务”。

```python
planner = AssistantAgent("Planner", 
                          model_client=create_model_client(0.1), 
                          description="负责拆解任务规划的计划员", 
                          system_message="你的职责是将任务拆分成子步骤，并且在完成时输出'计划完成'")
executer = AssistantAgent("Executor", 
                          model_client=create_model_client(0.1), 
                          description="负责执行代码和操作的执行员", 
                          system_message="根据Planner的计划执行具体的任务，完成后回复'执行完毕'")
reviewer = AssistantAgent("Reviewer", 
                          model_client=create_model_client(0.1), 
                          description="负责检查执行结果的审核员", 
                          system_message="检查Executor的产出，如果没问题则必须输出'全部任务验收通过'。发现问题则退回。")
```

- **定制化路由（Custom Selector）**
  AutoGen 支持传入自定义的 Python 闭包/函数作为路由裁判。这就允许开发者完全跳过大模型，直接用纯 Python 语法（`If-Else`、正则提取等）结合上下文状态来拍板决定下一个发言者，实现灵活性与低成本兼顾的混合群聊系统。
```python
# 重点：定义自定义选择器闭包函数 (Custom Speaker Selector)
# 它接收当前对话的所有消息作为入参，返回字符串(下一个发言者的名字)
def my_strict_router(messages) -> str:
    # 这个函数完全脱离大模型执行，靠纯代码跑逻辑
    if not messages:
        return "Agent_A"  # 启动时永远让 A 先说
        
    last_message = messages[-1].content
    last_speaker = messages[-1].source
    
    # 使用闭包外部变量做逻辑判定
    if state.turns >= 2:
        # 打破正常规则，如果玩了两个回合（A-B-A-B），强行让A说一句终止的话来满足下方 termination 条件
        if last_speaker == "Agent_B":
              # 强行注入终止条件信号（实战中可以用来做系统熔断等）
              return "Agent_A" 
              
    if last_speaker == "Agent_A" and "转交B" in last_message:
        return "Agent_B"
        
    if last_speaker == "Agent_B" and "转交A" in last_message:
        state.turns += 1
        return "Agent_A"
        
    # 兜底选择
    return "Agent_A"

# 基于回合数的自定义终止条件
termination = MaxMessageTermination(5)

# 构建 GroupChat，此时不再设置 model_client (或者设了也不会被用于路由)，
# 而是传入 selector_func (在某些新版 API 中为 selector) 属性。
# 注意：在最新的 autogen_agentchat 0.4 中，SelectorGroupChat 专门增加了 `selector_func`
team = SelectorGroupChat(
    participants=[a, b],
    model_client=create_model_client(0.1), # 由于用了纯函数，这里的模型不怎么工作了
    termination_condition=termination,
    selector_func=my_strict_router # 将闭包函数挂载为图跳转的核心控制器
)

result = await team.run(task="开始运行硬约束路由流转测试！")

```

## FunctionTool 工具集成

### 简单实例
```python
# 定义工具函数
def calculator(expression: str) -> str:
    """
    安全的计算器工具

    Args:
        expression: 数学表达式字符串

    Returns:
        计算结果或错误信息
    """
    try:
        # 只允许安全的数学运算
        allowed_chars = set("0123456789+-*/()., ")
        if not all(c in allowed_chars for c in expression):
            return "错误：表达式包含不允许的字符"

        # 使用ast.literal_eval进行安全计算
        import ast
        import operator

        # 定义允许的操作
        ops = {
            ast.Add: operator.add,
            ast.Sub: operator.sub,
            ast.Mult: operator.mul,
            ast.Div: operator.truediv,
            ast.Mod: operator.mod,
            ast.Pow: operator.pow,
            ast.USub: operator.neg,
            ast.UAdd: operator.pos,
        }

        def safe_eval(node):
            if isinstance(node, ast.Constant):  # Python 3.8+
                return node.value
            if isinstance(node, ast.Num):  # Python < 3.8
                return node.n
            if isinstance(node, ast.BinOp):
                return ops[type(node.op)](safe_eval(node.left), safe_eval(node.right))
            if isinstance(node, ast.UnaryOp):
                return ops[type(node.op)](safe_eval(node.operand))
            raise ValueError(f"不支持的操作: {type(node)}")

        # 解析并计算表达式
        tree = ast.parse(expression, mode="eval")
        result = safe_eval(tree.body)
        return f"计算结果: {result}"
    except Exception as e:
        return f"计算错误: {e!s}"


async def demo_single_tool_agent() -> None:
    """演示单工具智能体"""
    print("\n🔧 Single Tool Agent Demo")
    print("-" * 50)

    # 创建计算器工具
    calc_tool = FunctionTool(calculator, description="执行数学计算")

    # 创建带计算器工具的智能体
    calculator_agent = AssistantAgent(
        name="CalculatorAgent",
        model_client=create_model_client(),
        tools=[calc_tool],
        system_message="""你是一个数学计算助手。
        你可以使用计算器工具来执行数学运算。
        当用户要求计算时，使用calculator工具来完成。
        用中文解释计算过程和结果。""",
    )

    # 测试计算功能
    tasks = ["计算 25 * 4 + 15", "计算 (100 - 25) / 3", "计算 2 ** 10"]

    for task in tasks:
        print(f"\n📊 任务: {task}")
        result = await calculator_agent.run(task=task)
        print(f"🤖 回复: {result.messages[-1].content}")

```
以上代码展示了工具的基本使用方法，主要包含以下几个核心要点：

- **工具的定义与包装**
  简单来说，就是使用 `FunctionTool` 将 Python 函数包装为大模型可调用的工具。在这个过程中，**参数的类型提示（Type Hints）**和**文档字符串（Docstring）、`description` 参数**非常重要，它们能帮助大模型准确理解工具的功能和调用方式。

- **工具执行的安全性与错误处理**
  脚本中的 `calculator` 没有直接使用危险的 `eval()`，而是使用了 `ast.parse` 和受限的操作符字典（`safe_eval`）来确保数学表达式的安全性。
  **工具执行失败时不应导致整个程序崩溃**，而是应该将异常捕获（`try...except`）并转为友好的文本（如 `"计算错误: ..."`）返回给 AI，让 AI 能够根据报错信息进行“纠错”并重试。

- **多智能体工具链协作**
  不同职责的 Agent 应该配置不同的工具。例如，“数据分析师”（配备计算和数据分析工具）处理完数据后，交由“存储专家”（配备数据库读写工具）进行落盘保存，各司其职。

### 高阶用法

#### 1. 异步工具支持
```python
async def async_weather_query(city: str) -> str:
    """
    异步天气查询工具，模拟网络请求延迟

    Args:
        city: 城市名称

    Returns:
        天气信息
    """
    print(f"   [Async] 正在查询 {city} 的天气...")
    await asyncio.sleep(2)  # 模拟网络延迟
    
    weather_conditions = ["晴朗", "多云", "小雨", "大雨", "雪", "雾"]
    temperature = random.randint(-10, 35)
    condition = random.choice(weather_conditions)
    
    return f"{city}当前天气: {condition}, 温度: {temperature}°C"


async def demo_async_tool_agent() -> None:
    """演示异步工具智能体"""
    print("\n⏳ Async Tool Agent Demo")
    print("-" * 50)

    # 创建带异步工具的智能体
    async_agent = AssistantAgent(
        name="AsyncWeatherAgent",
        model_client=create_model_client(),
        tools=[FunctionTool(async_weather_query, description="异步查询城市天气")],
        system_message="""你是一个天气助手。
        你可以使用异步工具查询天气。
        并发查询多个城市的天气以提高效率。""",
    )

    task = "查询北京、上海和广州的天气"
    print(f"\n📋 任务: {task}")
    
    result = await async_agent.run(task=task)
    print(f"🤖 回复: {result.messages[-1].content}")

```
在实际应用中，工具通常需要调用外部 API 或读写数据库（涉及网络和 I/O 阻塞）。AutoGen 完全支持使用 `async def` 定义异步工具，这对于提高多智能体并发对话的性能至关重要。

#### 2. 使用 Pydantic 进行复杂结构化输入/输出验证

```python
class UserProfile(BaseModel):
    name: str = Field(description="用户的姓名")
    age: int = Field(description="用户的年龄")
    hobbies: list[str] = Field(description="用户的爱好列表，至少提取出两项", min_items=1)
    is_vip: bool = Field(default=False, description="是否是VIP用户，默认为False")


def create_user_profile(profile: UserProfile) -> str:
    """
    根据给定的结构化信息创建详细的用户画像。
    由于使用了 Pydantic，如果大模型没有按照要求的结构或者类型提供参数，在进入本函数前就会直接报错拦截。

    Args:
        profile: 结构化的用户画像信息(UserProfile 模型)

    Returns:
        创建后的系统返回结果
    """
    return f"🚀 成功在系统中录入结构化用户画像: 姓名: {profile.name}, 年龄: {profile.age}, 爱好: {', '.join(profile.hobbies)}, VIP状态: {profile.is_vip}"


async def demo_pydantic_tool_agent() -> None:
    """演示使用 Pydantic 进行复杂输入验证的工具智能体"""
    print("\n📝 Pydantic Tool Agent Demo")
    print("-" * 50)

    # 创建使用 Pydantic 验证工具的智能体
    pydantic_agent = AssistantAgent(
        name="ProfileAgent",
        model_client=create_model_client(),
        tools=[FunctionTool(create_user_profile, description="创建结构化的用户画像")],
        system_message="""你是一个用户档案自动化提取助手。
        你需要根据用户的自然语言自述，精准提取信息，并使用 create_user_profile 工具将结构化数据录入系统。
        大模型会自动根据 Pydantic 模型的 Field 描述来映射变量。
        用中文向用户汇报你保存了哪些信息。""",
    )

    # 测试 Pydantic 工作流
    task = "嗨，我叫张三，今年28岁，从事互联网行业。我平时非常喜欢打篮球，周末有时候会去潜水，最近迷上了看科幻类型的电影。"
    print(f"\n📋 任务: {task}")
    
    result = await pydantic_agent.run(task=task)
    print(f"🤖 回复: {result.messages[-1].content}")

```
通过集成 Pydantic 对象作为工具的参数类型，可以天然地限制和校验大模型的输入格式。如果大模型传入的参数不符合 Pydantic 模型定义的 Schema，执行工具前就会自动抛出校验错误，进而触发大模型的纠错重试机制。

#### 3. 人类参与与审批拦截 (Human-in-the-loop / Tool Approval)
提及操作审批与权限拦截，往往会联想到前文提到的 `UserProxyAgent` 或 `CodeExecutorAgent`，它们可用于拦截代码执行并询问人类。不过，在较新的 AutoGen 版本中，**将权限包装直接下沉到工具调用层**（Tool Approval），往往粒度更细、也更直接有效。

## 源码与示例

本文涉及的相关代码与完整 Demo，可以在此处获取：[https://github.com/ffchic/llm-dome](https://github.com/ffchic/llm-dome)



