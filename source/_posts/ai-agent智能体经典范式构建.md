---
title: ai-agent智能体经典范式构建
date: 2026-02-08 10:00:00
categories: [技术, AI]
tags: [AI Agent, 智能体, LLM, 架构设计]
---

# 智能体经典范式构建

一个现代智能体，它的核心能力是能够将大语言模型和外部世界联通起来。它能够自主地理解用户意图、拆解复杂任务，并通过调用代码解释器、搜索引擎、API 等一系列“工具”，来获取信息、执行操作，最终达成目标。然而，智能体并非万能，它同样面临着来自大模型本身的“幻觉”问题、在复杂任务中可能陷入推理循环、以及对工具的错误使用等挑战，这些也构成了智能体的能力边界。

为了更好地组织智能体的“思考”与“行动”过程，业界涌现出了多种经典的架构范式。在本章中，我们将聚焦于其中最具代表性的三种，并一步步从零实现它们：

- **ReAct (Reasoning and Acting)**： 一种将“思考”和“行动”紧密结合的范式，让智能体边想边做，动态调整。
- **Plan-and-Solve**： 一种“三思而后行”的范式，智能体首先生成一个完整的行动计划，然后严格执行。
- **Reflection**： 一种赋予智能体“反思”能力的范式，通过自我批判和修正来优化结果。

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

为了代码结构清晰，我们先封装好大模型的客户端调用类。这个类中封装所有与大模型交互细节。并调用大模型写一个简单的快速排序，更加方便理解。

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

代码逻辑比较简单，在 `init` 实例化方法中读取刚刚定义好的 API 相关配置。在 `think` 调用大模型，这里使用的 Stream 流式传输，但我们方便理解还是同步返回，可以参考我的这篇教程：{% post_link SSE-入门与实践 'SSE 入门与实践指南' %}。然后在最后写了一个简单的 Demo，在 `exampleMessages` 定义了系统提示词和用户输入，让大模型帮我们实现一个快速排序。

调用后返回：

{% asset_img llm_return.png 模型调用结构 api %}

## 2. ReAct

基础环境等配置好后，就可以开始构建第一个也是最经典的智能体范式 ReAct (Reason + Act)。它的核心就是模仿人类的行为方式，从推理（Reason）到行动（Act），从而构建一个“思考-行动-观察”的循环。

### 2.1 ReAct 的工作流程

ReAct的巧妙之处在于，他认为思考和行动是相辅相成的，思考指导行动，行动的结果反过来修正思考。为此 ReAct 需要通过一种特殊的提示词工程来引导模型，使其每一步的输出都遵循一个固定的轨迹。

- **Thought (思考)**： 这是智能体的“内心独白”。它会分析当前情况、分解任务、制定下一步计划，或者反思上一步的结果。
- **Action (行动)**： 这是智能体决定采取的具体动作，通常是调用一个外部工具，例如 `Search['华为最新款手机']`。
- **Observation (观察)**： 这是执行 Action 后从外部工具返回的结果，例如搜索结果的摘要或 API 的返回值。

智能体将不断重复 **Thought - Action - Observation** 这一过程，并将新一次的观察结果追加到历史记录中。形成一个不断增长的上下文，直到它在 Thought 中认为已经找到了最终答案，然后输出结果。这个过程形成了一个强大的协同效应：推理使得行动更具目的性，而行动则为推理提供了事实依据。

如图所示，具体来说，在每个时间步 $t$，智能体的策略（大模型 $\pi$）会根据初始问题 $q$ 和之前所有行动和观察的结果 $(a_1, o_1), \dots, (a_{t-1}, o_{t-1})$，来生成当前时间步的思考 $th_t$ 和行动 $a_t$：

$$ (th_t, a_t) = \pi(q, (a_1, o_1), \dots, (a_{t-1}, o_{t-1})) $$

随后智能体中的工具 $\mathcal{T}$ 会执行 $a_t$，并返回一个结果 $o_t$：

$$ o_t = \mathcal{T}(a_t) $$

这个循环不断进行，不断将新的 $a_t$ 和 $o_t$ 添加到历史中，直到模型认为任务完成。

{% asset_img ReAct.png react范式流程 api %}

## 总结

选择合适的范式取决于具体的业务场景和复杂度。
