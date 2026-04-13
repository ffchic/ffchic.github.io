---
title: 深度解析LangGraph：构建可控的多智能体工作流
date: 2026-04-13 12:00:00
tags:
  - LangGraph
  - AI-Agent
categories:
  - AI
---

## 简单概念

LangGraph 是用图结构编排 LLM 调用流程的框架，节点处理逻辑，边控制走向，State在节点间传递数据。

```mermaid
flowchart TD
    subgraph 数据层
        S[("全局共享 State\n{ input, refined, output }")]:::state
    end

    subgraph 逻辑执行层
        START((START)):::point --> Node_Pre[preprocess 节点]:::node
        Node_Pre --> Node_LLM[llm 节点]:::node
        Node_LLM --> END((END)):::point
    end

    %% 数据交互说明
    Node_Pre -.->|1. 读取 input\n2. 返回 {"refined": "..."} 合并| S
    Node_LLM -.->|1. 读取 refined\n2. 返回 {"output": "..."} 合并| S

    classDef state fill:#fef0f0,stroke:#f56c6c,stroke-width:2px,color:#333
    classDef node fill:#ecf5ff,stroke:#409eff,stroke-width:2px,color:#333
    classDef point fill:#fdf6ec,stroke:#e6a23c,stroke-width:2px,color:#333
```

### BaseMessage 体系
  - LangChain 用消息对象替代裸字符串                                            
  - 三种角色：SystemMessage / HumanMessage / AIMessage
  - 每条消息有明确的 role 和 content 如：{"role": "system", "content": "你是一个专业的python开发工程师}

###  多轮对话的本质
LLM 本身无记忆，每次都是全新请求
  - 多轮的实现：把完整历史塞进消息列表传给 invoke()
  - AIMessage 可以直接追加进历史，不需要转换 

### state（共享数据）
在此框架中用到的重要数据结构，一般使用TypedDict来指定好需要的字段格式。
在所有节点中都可以同享，或者可以理解为一个上下文工具

### node（处理函数）
本质是一个python函数，输入的是整个state，输出要修改的字段。框架会自动的进行数据merge（合并到state中）

### Edge（执行顺序）
也叫做边他定义的是各个节点的执行顺序
```python
# 添加边：定义执行顺序
# START 和 END 是 LangGraph 内置的特殊节点
builder.add_edge(START, "preprocess")    # 图从 preprocess 开始
builder.add_edge("preprocess", "llm")   # preprocess 完后执行 llm
builder.add_edge("llm", END)             # llm 完后结束
```
这样写就是 开始 -> preprocess -> llm -> 结束



