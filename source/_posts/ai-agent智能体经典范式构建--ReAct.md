---
title: ai-agent智能体经典范式构建--ReAct
date: 2026-02-08 10:00:00
categories: [技术, AI]
tags: [AI Agent, 智能体, LLM, 架构设计]
---

# 智能体经典范式构建

一个现代智能体，它的核心能力是能够将大语言模型和外部世界联通起来。它能够自主地理解用户意图、拆解复杂任务，并通过调用代码解释器、搜索引擎、API 等一系列“工具”，来获取信息、执行操作，最终达成目标。然而，智能体并非万能，它同样面临着来自大模型本身的“幻觉”问题、在复杂任务中可能陷入推理循环、以及对工具的错误使用等挑战，这些也构成了智能体的能力边界。


- **ReAct (Reasoning and Acting)**： 一种将“思考”和“行动”紧密结合的范式，让智能体边想边做，动态调整。

## 1. 环境准备

在开始构建之前，我们需要先构建开发环境和一些基础组件。

### 1.1 安装 Python 库

本章主要使用 Python 语言，首先要确保安装了 `openai` 库与大模型进行交互，以及 `python-dotenv` 库用于安全地管理我们的 API 密钥。

```bash
pip install openai python-dotenv
```

### 1.2 配置 API 密钥

在你的项目根目录下，创建一个名为 `.env` 的文件。写入要使用的大模型信息。如图所示：

{% asset_img env.png env文件配置 %}

我这里使用的 DeepSeek，申请 API 地址：[https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)

{% asset_img creat_api.png 创建deepseek api %}

如图所示点击创建 API Key 输入一个名称点击创建即可。注意这里的 Key 要立即复制保存，该窗口关闭后将不可见。

{% asset_img api.png 创建deepseek api %}

然后将申请到的 API Key 填入 `LLM_API_KEY` 变量中。

```ini
# .env file
LLM_API_KEY="获取的api key"
LLM_MODEL_ID="deepseek-chat"
LLM_BASE_URL="https://api.deepseek.com"
```

### 1.3 封装基础 LLM 调用函数

为了代码结构清晰，我们先封装好大模型的客户端调用类。这个类中封装了所有与大模型交互的细节。并调用大模型写一个简单的快速排序，更加方便理解。

```python
import os
from openai import OpenAI
from dotenv import load_dotenv
from typing import List, Dict

# 加载 .env 文件中的环境变量
load_dotenv()

class HelloAgentsLLM:
    """
    它用于调用任何兼容OpenAI接口的服务，并默认使用流式响应。
    """
    def __init__(self, model: str = None, apiKey: str = None, baseUrl: str = None, timeout: int = None):
        """
        初始化客户端。优先使用传入参数，如果未提供，则从环境变量加载。
        """
        self.model = model or os.getenv("LLM_MODEL_ID")
        apiKey = apiKey or os.getenv("LLM_API_KEY")
        baseUrl = baseUrl or os.getenv("LLM_BASE_URL")
        timeout = timeout or int(os.getenv("LLM_TIMEOUT", 60))
        
        if not all([self.model, apiKey, baseUrl]):
            raise ValueError("模型ID、API密钥和服务地址必须被提供或在.env文件中定义。")

        self.client = OpenAI(api_key=apiKey, base_url=baseUrl, timeout=timeout)

    def think(self, messages: List[Dict[str, str]], temperature: float = 0) -> str:
        """
        调用大语言模型进行思考，并返回其响应。
        """
        print(f"🧠 正在调用 {self.model} 模型...")
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                stream=True,
            )
            
            # 处理流式响应
            print("✅ 大语言模型响应成功:")
            collected_content = []
            for chunk in response:
                content = chunk.choices[0].delta.content or ""
                print(content, end="", flush=True)
                collected_content.append(content)
            print()  # 在流式输出结束后换行
            return "".join(collected_content)

        except Exception as e:
            print(f"❌ 调用LLM API时发生错误: {e}")
            return None

# --- 客户端使用示例 ---
if __name__ == '__main__':
    try:
        llmClient = HelloAgentsLLM()
        
        exampleMessages = [
            {"role": "system", "content": "You are a helpful assistant that writes Python code."},
            {"role": "user", "content": "写一个快速排序算法"}
        ]
        
        print("--- 调用LLM ---")
        responseText = llmClient.think(exampleMessages)
        if responseText:
            print("\n\n--- 完整模型响应 ---")
            print(responseText)

    except ValueError as e:
        print(e)
```

代码逻辑比较简单，在 `__init__` 实例化方法中读取刚刚定义好的 API 相关配置。在 `think` 方法中调用大模型，这里使用的 Stream 流式传输，但我们方便理解还是同步返回，可以参考我的这篇教程：{% post_link SSE-入门与实践 'SSE 入门与实践指南' %}。然后在最后写了一个简单的 Demo，在 `exampleMessages` 定义了系统提示词和用户输入，让大模型帮我们实现一个快速排序。

调用后返回：

{% asset_img llm_return.png 模型调用结构 api %}

## 2. ReAct

基础环境等配置好后，就可以开始构建第一个也是最经典的智能体范式 ReAct (Reason + Act)。它的核心就是模仿人类的行为方式，从推理（Reason）到行动（Act），从而构建一个“思考-行动-观察”的循环。

### 2.1 ReAct 的工作流程

ReAct 的巧妙之处在于，它认为思考和行动是相辅相成的，思考指导行动，行动的结果反过来修正思考。为此 ReAct 需要通过一种特殊的提示词工程来引导模型，使其每一步的输出都遵循一个固定的轨迹。

- **Thought (思考)**： 这是智能体的“内心独白”。它会分析当前情况、分解任务、制定下一步计划，或者反思上一步的结果。
- **Action (行动)**： 这是智能体决定采取的具体动作，通常是调用一个外部工具，例如 `Search['华为最新款手机']`。
- **Observation (观察)**： 这是执行 Action 后从外部工具返回的结果，例如搜索结果的摘要或 API 的返回值。

智能体将不断重复 **Thought - Action - Observation** 这一过程，并将新一次的观察结果追加到历史记录中。形成一个不断增长的上下文，直到它在 Thought 中认为已经找到了最终答案，然后输出结果。这个过程形成了一个强大的协同效应：推理使得行动更具目的性，而行动则为推理提供了事实依据。

如图所示，具体来说，在每个时间步 \\(t\\)，智能体的策略（大模型 \\(\pi\\)）会根据初始问题 \\(q\\) 和之前所有行动和观察的结果 \\((a\_1, o\_1), \dots, (a\_{t-1}, o\_{t-1})\\)（其中 \\((a\_1, o\_1)\\) 代表第一步的行动 Action 和观察 Observation），来生成当前时间步的思考 \\(th\_t\\) 和行动 \\(a\_t\\)：

$$ (th_t, a_t) = \pi(q, (a_1, o_1), \dots, (a_{t-1}, o_{t-1})) $$

随后智能体中的工具 \\(\mathcal{T}\\) 会执行 \\(a\_t\\)，并返回一个结果 \\(o\_t\\)：

$$ o_t = \mathcal{T}(a_t) $$

这个循环不断进行，不断将新的 \\(a\_t\\) 和 \\(o\_t\\) 添加到历史中，直到模型认为任务完成。

{% asset_img ReAct.png react范式流程 api %}


### 2.2 工具的定义和实现
如果说大语言模型是智能体的大脑，那么工具 (Tools) 就是其与外部世界交互的“手和脚”。为了让ReAct范式能够真正解决我们设定的问题，智能体需要具备调用外部工具的能力。

本章中，我们尝试为智能体提供一个搜索功能，这里使用谷歌的 SerpApi。它通过 API 提供结构化的 Google 搜索结果，能直接返回"答案摘要框"或精确的知识图谱信息。

首先要安装一个库：

```bash
pip install google-search-results
```
同时，你需要前往 [SerpApi官网](https://serpapi.com/) 注册一个免费账户，获取你的API密钥，并将其添加到我们项目根目录下的 .env 文件中。

一个良好的工具应该包含三个核心要素：
- 名称 (Name)： 一个简洁、唯一的标识符，供智能体在 Action 中调用，例如 Search。
- 描述 (Description)： 一段清晰的自然语言描述，说明这个工具的用途。这是整个机制中最关键的部分，因为大语言模型会依赖这段描述来判断何时使用哪个工具。
- 执行逻辑 (Execution Logic)： 真正执行任务的函数或方法。

**（1）构建一个搜索工具**
```python
import os
from serpapi import SerpApiClient

def search(query: str) -> str:
    """
    一个基于SerpApi的实战网页搜索引擎工具。
    它会智能地解析搜索结果，优先返回直接答案或知识图谱信息。
    """
    print(f"🔍 正在执行 [SerpApi] 网页搜索: {query}")
    try:
        api_key = os.getenv("SERPAPI_API_KEY")
        if not api_key:
            return "错误:SERPAPI_API_KEY 未在 .env 文件中配置。"

        params = {
            "engine": "google",
            "q": query,
            "api_key": api_key,
            "gl": "cn",  # 国家代码
            "hl": "zh-cn", # 语言代码
        }
        
        client = SerpApiClient(params)
        results = client.get_dict()
        
        # 智能解析:优先寻找最直接的答案
        if "answer_box_list" in results:
            return "\n".join(results["answer_box_list"])
        if "answer_box" in results and "answer" in results["answer_box"]:
            return results["answer_box"]["answer"]
        if "knowledge_graph" in results and "description" in results["knowledge_graph"]:
            return results["knowledge_graph"]["description"]
        if "organic_results" in results and results["organic_results"]:
            # 如果没有直接答案，则返回前三个有机结果的摘要
            snippets = [
                f"[{i+1}] {res.get('title', '')}\n{res.get('snippet', '')}"
                for i, res in enumerate(results["organic_results"][:3])
            ]
            return "\n\n".join(snippets)
        
        return f"对不起，没有找到关于 '{query}' 的信息。"

    except Exception as e:
        return f"搜索时发生错误: {e}"

```

**（2）构建通用的工具执行器**

一个智能体可能需要多个工具，如搜索、查询数据库、计算等。这里定义工具执行器，方便统一调用管理。
```python
from typing import Dict, Any

class ToolExecutor:
    """
    一个工具执行器，负责管理和执行工具。
    """
    def __init__(self):
        self.tools: Dict[str, Dict[str, Any]] = {}

    def registerTool(self, name: str, description: str, func: callable):
        """
        向工具箱中注册一个新工具。
        """
        if name in self.tools:
            print(f"警告:工具 '{name}' 已存在，将被覆盖。")
        self.tools[name] = {"description": description, "func": func}
        print(f"工具 '{name}' 已注册。")

    def getTool(self, name: str) -> callable:
        """
        根据名称获取一个工具的执行函数。
        """
        return self.tools.get(name, {}).get("func")

    def getAvailableTools(self) -> str:
        """
        获取所有可用工具的格式化描述字符串。
        """
        return "\n".join([
            f"- {name}: {info['description']}" 
            for name, info in self.tools.items()
        ])

```

**（3）测试工具**

调用工具查看执行情况：
```python
# --- 工具初始化与使用示例 ---
if __name__ == '__main__':
    # 1. 初始化工具执行器
    toolExecutor = ToolExecutor()

    # 2. 注册我们的实战搜索工具
    search_description = "一个网页搜索引擎。当你需要回答关于时事、事实以及在你的知识库中找不到的信息时，应使用此工具。"
    toolExecutor.registerTool("Search", search_description, search)
    
    # 3. 打印可用的工具
    print("\n--- 可用的工具 ---")
    print(toolExecutor.getAvailableTools())

    # 4. 智能体的Action调用，这次我们问一个实时性的问题
    print("\n--- 执行 Action: Search['英伟达最新的GPU型号是什么'] ---")
    tool_name = "Search"
    tool_input = "英伟达最新的GPU型号是什么"

    tool_function = toolExecutor.getTool(tool_name)
    if tool_function:
        observation = tool_function(tool_input)
        print("--- 观察 (Observation) ---")
        print(observation)
    else:
        print(f"错误:未找到名为 '{tool_name}' 的工具。")
```
执行结果：
{% asset_img tool_return.png 工具执行结果 %}

### 2.3 ReAct 智能体的编码实现

现在准备工作都已齐全，接下来可以实现一个完整的智能体。

根据这套逻辑，要先编写一套提示词，让大模型知道要怎么做：

```python
# ReAct 提示词模板
REACT_PROMPT_TEMPLATE = """
请注意，你是一个有能力调用外部工具的智能助手。

可用工具如下:
{tools}

请严格按照以下格式进行回应:

Thought: 你的思考过程，用于分析问题、拆解任务和规划下一步行动。
Action: 你决定采取的行动，必须是以下格式之一:
- `{{tool_name}}[{{tool_input}}]`:调用一个可用工具。
- `Finish[最终答案]`:当你认为已经获得最终答案时。
- 当你收集到足够的信息，能够回答用户的最终问题时，你必须在Action:字段后使用 Finish[最终答案] 来输出最终答案。

现在，请开始解决以下问题:
Question: {question}
History: {history}
"""
```
这段提示词定义好了llm和智能体的交互规范。方便我们更好的处理智能体逻辑
- 角色定义： “你是一个有能力调用外部工具的智能助手”，设定了LLM的角色。
- 工具清单 ({tools})： 告知LLM它有哪些可用的“手脚”。
- 格式规约 (Thought/Action)： 这是最重要的部分，它强制LLM的输出具有结构性，使我们能通过代码精确解析其意图。
- 动态上下文 ({question}/{history})： 将用户的原始问题和不断累积的交互历史注入，让LLM基于完整的上下文进行决策。

核心的循环逻辑
ReActAgent 的核心是一个循环，它不断地“格式化提示词 -> 调用LLM -> 执行动作 -> 整合结果”，直到任务完成或达到最大步数限制。
也就是之前图中所展示的 思考-行动-观察 。在这个过程中不断循环，直到得到结果

```python
class ReActAgent:
    def __init__(self, llm_client: HelloAgentsLLM, tool_executor: ToolExecutor, max_steps: int = 5):
        self.llm_client = llm_client
        self.tool_executor = tool_executor
        self.max_steps = max_steps
        self.history = []

    def run(self, question: str):
        """
        运行ReAct智能体来回答一个问题。
        """
        self.history = [] # 每次运行时重置历史记录
        current_step = 0

        while current_step < self.max_steps:
            current_step += 1
            print(f"--- 第 {current_step} 步 ---")

            # 1. 格式化提示词
            tools_desc = self.tool_executor.getAvailableTools()
            history_str = "\n".join(self.history)
            prompt = REACT_PROMPT_TEMPLATE.format(
                tools=tools_desc,
                question=question,
                history=history_str
            )

            # 2. 调用LLM进行思考
            messages = [{"role": "user", "content": prompt}]
            response_text = self.llm_client.think(messages=messages)
            
            if not response_text:
                print("错误:LLM未能返回有效响应。")
                break
            # (这段逻辑在 run 方法的 while 循环内)
            # 3. 解析LLM的输出
            thought, action = self._parse_output(response_text)
            
            if thought:
                print(f"思考: {thought}")

            if not action:
                print("警告:未能解析出有效的Action，流程终止。")
                break

            # 4. 执行Action
            if action.startswith("Finish"):
                # 如果是Finish指令，提取最终答案并结束
                match = re.match(r"Finish\[(.*)\]", action, re.DOTALL)
                if match:
                    final_answer = match.group(1)
                else:
                    # 格式不带方括号，直接取 Finish 后面的内容
                    final_answer = action[len("Finish"):].strip().strip("[]")
                print(f"🎉 最终答案: {final_answer}")
                return final_answer
            
            tool_name, tool_input = self._parse_action(action)
            if not tool_name or not tool_input:
                # ... 处理无效Action格式 ...
                continue

            print(f"🎬 行动: {tool_name}[{tool_input}]")
            
            tool_function = self.tool_executor.getTool(tool_name)
            if not tool_function:
                observation = f"错误:未找到名为 '{tool_name}' 的工具。"
            else:
                observation = tool_function(tool_input) # 调用真实工具

            # (这段逻辑紧随工具调用之后，在 while 循环的末尾)
            print(f"👀 观察: {observation}")
            
            # 将本轮的Action和Observation添加到历史记录中
            self.history.append(f"Action: {action}")
            self.history.append(f"Observation: {observation}")

        # 循环结束
        print("已达到最大步数，流程终止。")
        return None

    # (这些方法是 ReActAgent 类的一部分)
    def _parse_output(self, text: str):
        """解析LLM的输出，提取Thought和Action。
        """
        # Thought: 匹配到 Action: 或文本末尾
        thought_match = re.search(r"Thought:\s*(.*?)(?=\nAction:|$)", text, re.DOTALL)
        # Action: 匹配到文本末尾
        action_match = re.search(r"Action:\s*(.*?)$", text, re.DOTALL)
        thought = thought_match.group(1).strip() if thought_match else None
        action = action_match.group(1).strip() if action_match else None
        return thought, action

    def _parse_action(self, action_text: str):
        """解析Action字符串，提取工具名称和输入。
        """
        match = re.match(r"(\w+)\[(.*)\]", action_text, re.DOTALL)
        if match:
            return match.group(1), match.group(2)
        return None, None
```
代码的整体流程也非常容易理解。首先调用大模型，大模型会根据约定好的规范来返回思考和下一步行动，使用正则匹配大模型的下一步行动，帮他调用工具，把大模型的回复和调用工具的结果加到history中再次调用大模型。按照以上流程直到结束

运行示例输出（以下为精简版，实际运行会包含完整的多轮搜索过程）：

```text
工具 'Search' 已注册。

# ── 第 1 步 ──────────────────────────────────
🧠 正在调用 deepseek-chat 模型...
✅ 大语言模型响应成功:
Thought: 这是一个实时性问题，我的知识库无法保证准确，需要使用搜索工具获取最新数据。
🎬 行动: Search[20-30万 中国 最值得买 燃油车 推荐 2024]
🔍 正在执行 [SerpApi] 网页搜索: 20-30万 中国 最值得买 燃油车 推荐 2024
👀 观察: [1] 2025年20-30万购车指南 ...
          [2] 20万内五款靠谱汽油SUV推荐 ...
          [3] 精选15-30万性价比爆表燃油车TOP10 ...

# ── 第 2~4 步（多轮搜索，逐步精确，此处省略）─────

# ── 第 5 步 ──────────────────────────────────
🧠 正在调用 deepseek-chat 模型...
✅ 大语言模型响应成功:
Thought: 已收集到足够信息，可以整理最终推荐列表。
🎉 最终答案: 在20-30万价位，推荐轿车：本田雅阁、丰田凯美瑞、大众帕萨特、别克君威、领克03、凯迪拉克CT4、捷豹XEL；
            推荐SUV：本田CR-V、丰田RAV4荣放、大众途观L、吉利星越L、别克昂科威Plus。
```
完整代码及输出可以查看 [ReAct 示例代码](https://github.com/ffchic/llm-dome/tree/main/ReAct)

### ReAct 的特点、局限性与调试技巧

**（1）ReAct 的特点**

- **高可解释性**：ReAct 最大的优点就是透明。它的思考过程 Thought 是用户可见的，我们可以清晰地看到智能体每一步的"心路历程"。
- **动态规划和纠错能力**：与一次性计划好所有步骤的范式不同，ReAct 的流程是走一步看一步，根据每次获取到的 Observation 来动态调整 Thought 和 Action。发现得到的结果不理想，则可以在下一步中修改关键词等来重新调整。
- **工具协同能力**：ReAct 范式天然地将大语言模型的推理能力与外部工具的执行能力结合起来。LLM 负责运筹帷幄（规划和推理），工具负责解决具体问题（搜索、计算），二者协同工作，突破了单一 LLM 在知识时效性、计算准确性等方面的固有局限。
**（2）ReAct 的固有局限性**

- **对 LLM 自身能力的强依赖**：ReAct 流程的成功与否，高度依赖于底层 LLM 的综合能力。如果 LLM 的逻辑推理能力、指令遵循能力或格式化输出能力不足，就很容易在 Thought 环节产生错误的规划，或者在 Action 环节生成不符合格式的指令，导致整个流程中断。
- **执行效率问题**：由于其循序渐进的特性，完成一个任务通常需要多次调用 LLM。每一次调用都伴随着网络延迟和计算成本。对于需要很多步骤的复杂任务，这种串行的"思考-行动"循环可能会导致较高的总耗时和费用。
- **提示词的脆弱性**：整个机制的稳定运行建立在一个精心设计的提示词模板之上。模板中的任何微小变动，甚至是用词的差异，都可能影响 LLM 的行为。此外，并非所有模型都能持续稳定地遵循预设的格式，这增加了在实际应用中的不确定性。
- **可能陷入局部最优**：步进式的决策模式意味着智能体缺乏一个全局的、长远的规划。它可能会因为眼前的 Observation 而选择一个看似正确但长远来看并非最优的路径，甚至在某些情况下陷入"原地打转"的循环中。

**（3）调试技巧**

当你构建的 ReAct 智能体行为不符合预期时，可以从以下几个方面入手进行调试：

- **检查完整的提示词**：在每次调用 LLM 之前，将最终格式化好的、包含所有历史记录的完整提示词打印出来。这是追溯 LLM 决策源头的最直接方式。
- **分析原始输出**：当输出解析失败时（例如，正则表达式没有匹配到 Action），务必将 LLM 返回的原始、未经处理的文本打印出来。这能帮助你判断是 LLM 没有遵循格式，还是你的解析逻辑有误。
- **验证工具的输入与输出**：检查智能体生成的 `tool_input` 是否是工具函数所期望的格式，同时也要确保工具返回的 `observation` 格式是智能体可以理解和处理的。
- **调整提示词中的示例（Few-shot Prompting）**：如果模型频繁出错，可以在提示词中加入一两个完整的"Thought-Action-Observation"成功案例，通过示例来引导模型更好地遵循你的指令。
- **尝试不同的模型或参数**：更换一个能力更强的模型，或者调整 `temperature` 参数（通常设为 0 以保证输出的确定性），有时能直接解决问题。



## 总结

选择合适的范式取决于具体的业务场景和复杂度。

