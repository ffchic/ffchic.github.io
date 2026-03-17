import re

file_path = "/Users/ffchic/fhrall/project/ffchic.github.io/source/_posts/ai-agent智能体经典范式构建--Reflection.md"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Fixes
content = content.replace("在了解Reflection范式之前我们需要先了解[Agent 范式](ai-agent智能体经典范式构建--ReAct.md)：**ReAct (Reason + Act)**或 [Agent 范式](ai-agent智能体经典范式构建--Plan-and-Solve.md)：**Plan-and-Solve** 其中的一种", 
                          "在了解 Reflection 范式之前，我们需要先了解 [Agent 范式：**ReAct (Reason + Act)**](ai-agent智能体经典范式构建--ReAct.md) 或 [Agent 范式：**Plan-and-Solve**](ai-agent智能体经典范式构建--Plan-and-Solve.md) 中的任何一种。")

content = content.replace("在以上的两种范式中，一但智能体完成了任务，也就代表着智能体执行结束。但是它生成的最终答案，无论是生成轨迹或最终结果都有可能出现错误，Reflection的核心机制就是为智能体引入一种事后自我矫正循环的机制，能够使其像人类一样，审视自己的工作，发现不足，并进行迭代优化。",
                          "在以上的两种范式中，一旦智能体完成了任务，也就代表着智能体执行结束。但是它生成的最终答案，无论是生成轨迹或最终结果都有可能出现错误。Reflection 的核心机制就是为智能体引入一种事后的自我矫正循环机制，能够使其像人类一样，审视自己的工作，发现不足，并进行迭代优化。")

content = content.replace("### Reflection核心机制", "### Reflection 核心机制")

content = content.replace("1.执行 (Execution)：", "1. **执行 (Execution)**：")
content = content.replace("2.反思 (Reflection)：", "2. **反思 (Reflection)**：")
content = content.replace("3.优化 (Refinement)：", "3. **优化 (Refinement)**：")

content = content.replace("- 遗漏信息：是否忽略了问题的某些关键约束或方面？ 根据评估，它会生成一段结构化的反馈 (Feedback)，指出具体的问题所在和改进建议。",
                          "- 遗漏信息：是否忽略了问题的某些关键约束或方面？\n\n   根据评估，它会生成一段结构化的反馈 (Feedback)，指出具体的问题所在和改进建议。")

content = content.replace("存在明确的优化路径：大语言模型初次生成的代码很可能是一个简单但效率低下的递归实现。\n反思点清晰：可以通过反思发现其“时间复杂度过高”或“存在重复计算”的问题。\n优化方向明确：可以根据反馈，将其优化为更高效的迭代版本或使用备忘录模式的版本。",
                          "- **存在明确的优化路径**：大语言模型初次生成的代码很可能是一个简单但效率低下的递归实现。\n- **反思点清晰**：可以通过反思发现其“时间复杂度过高”或“存在重复计算”的问题。\n- **优化方向明确**：可以根据反馈，将其优化为更高效的迭代版本或使用备忘录模式的版本。")

content = content.replace("Reflection的核心是迭代，而迭代的核心是尝试和够记住之前的尝试和获得的反馈。",
                          "Reflection 的核心是迭代，而迭代的核心是尝试并能够记住之前的尝试和获得的反馈。")

content = content.replace("Reflection机制需要不同的角色来协同工作，所以需要三段不同的提示词",
                          "Reflection 机制需要不同的角色来协同工作，所以需要三段不同的提示词：")

content = content.replace("首次执行提示词 (Execution Prompt) ：", "- **首次执行提示词 (Execution Prompt)**：")
content = content.replace("反思提示词 (Reflection Prompt) ：", "- **反思提示词 (Reflection Prompt)**：")
content = content.replace("优化提示词 (Refinement Prompt) ：", "- **优化提示词 (Refinement Prompt)**：")

content = content.replace("### Reflection机制的成本和收益", "### Reflection 机制的成本和收益")
content = content.replace("Reflection机制在智能体解决任务的质量上非常出色，但也同样的会付出相应的成本\n主要成本\n\n模型调用开销增加:这是最直接的成本。每进行一轮迭代，至少需要额外调用两次大语言模型（一次用于反思，一次用于优化）。如果迭代多轮，API 调用成本和计算资源消耗将成倍增加。\n\n任务延迟显著提高:Reflection 是一个串行过程，每一轮的优化都必须等待上一轮的反思完成。这使得任务的总耗时显著延长，不适合对实时性要求高的场景。\n\n提示工程复杂度上升:如我们的案例所示，Reflection 的成功在很大程度上依赖于高质量、有针对性的提示词。为“执行”、“反思”、“优化”等不同阶段设计和调试有效的提示词，需要投入更多的开发精力。\n\n核心收益\n\n解决方案质量的跃迁:最大的收益在于，它能将一个“合格”的初始方案，迭代优化成一个“优秀”的最终方案。这种从功能正确到性能高效、从逻辑粗糙到逻辑严谨的提升，在很多关键任务中是至关重要的。\n\n鲁棒性与可靠性增强:通过内部的自我纠错循环，智能体能够发现并修复初始方案中可能存在的逻辑漏洞、事实性错误或边界情况处理不当等问题，从而大大提高了最终结果的可靠性。\n\n综上所述，Reflection 机制是一种典型的“以成本换质量”的策略。它非常适合那些对最终结果的质量、准确性和可靠性有极高要求，且对任务完成的实时性要求相对宽松的场景。例如:\n\n生成关键的业务代码或技术报告。\n在科学研究中进行复杂的逻辑推演。\n需要深度分析和规划的决策支持系统。",
                          "Reflection 机制在智能体解决任务的质量上非常出色，但也同样会付出相应的成本。\n\n**主要成本：**\n\n- **模型调用开销增加**：这是最直接的成本。每进行一轮迭代，至少需要额外调用两次大语言模型（一次用于反思，一次用于优化）。如果迭代多轮，API 调用成本和计算资源消耗将成倍增加。\n- **任务延迟显著提高**：Reflection 是一个串行过程，每一轮的优化都必须等待上一轮的反思完成。这使得任务的总耗时显著延长，不适合对实时性要求高的场景。\n- **提示工程复杂度上升**：如我们的案例所示，Reflection 的成功在很大程度上依赖于高质量、有针对性的提示词。为“执行”、“反思”、“优化”等不同阶段设计和调试有效的提示词，需要投入更多的开发精力。\n\n**核心收益：**\n\n- **解决方案质量的跃迁**：最大的收益在于，它能将一个“合格”的初始方案，迭代优化成一个“优秀”的最终方案。这种从功能正确到性能高效、从逻辑粗糙到逻辑严谨的提升，在很多关键任务中是至关重要的。\n- **鲁棒性与可靠性增强**：通过内部的自我纠错循环，智能体能够发现并修复初始方案中可能存在的逻辑漏洞、事实性错误或边界情况处理不当等问题，从而大大提高了最终结果的可靠性。\n\n综上所述，Reflection 机制是一种典型的“以成本换质量”的策略。它非常适合那些对最终结果的质量、准确性和可靠性有极高要求，且对任务完成的实时性要求相对宽松的场景。例如：\n\n- 生成关键的业务代码或技术报告。\n- 在科学研究中进行复杂的逻辑推演。\n- 需要深度分析和规划的决策支持系统。")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updates applied successfully!")
