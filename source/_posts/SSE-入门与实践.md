---
title: SSE 入门与实践
date: 2025-12-10 17:44:21
tags: [SSE, Server-Sent Events, 实时通信]
categories: [技术, 网络]
---
 
最近在做一个文字游戏，项目中涉及到与 AI 模型进行对话，需要`实时`接收模型的回复。考虑到`实时性`要求，我选择了使用`SSE`来实现。

<!-- more -->

## 1. 概述
`SSE` 全称 `Server-Sent Events`（服务器发送事件），是一种基于 `HTTP` 的服务器推送技术。它允许服务器通过一个持久连接`单向`、`实时`地向客户端（浏览器）推送数据，适合新闻更新、股票行情、通知等场景。


## 2. 工作原理
SSE 基于浏览器的 EventSource 发起一个持久的 HTTP GET 连接，服务器以 `Content-Type: text/event-stream` 连续写入事件流，数据按行传输并以空行分隔。常用字段：`event`（事件名，默认 `message`）、`data`（数据，支持多行拼接）、`id`（事件标识，用于断线续传）、`retry`（客户端重连间隔毫秒）。连接中断时浏览器会自动重连并携带 `Last-Event-ID`，服务端据此续传；为及时送达与保活，响应一般设置 `Cache-Control: no-cache`、`Connection: keep-alive`，并可周期写入注释行作为心跳（如 `: keep-alive`）。


## 3. SSE 与 WebSocket 对比
- 协议与能力差异
SSE 基于标准 HTTP 的事件流（非长轮询），只支持服务器→客户端的`单向推送`；WebSocket 基于独立协议（依托 TCP）建立持久的`全双工`连接，支持`双向通信`。
SSE 更`轻量`，易于使用与部署；WebSocket 适用于需要频繁双向交互的场景。
- 适用场景选择建议
SSE 适用于单向实时推送，如新闻、行情、通知等；WebSocket 适用于聊天室、协作编辑等需要双向实时交互的应用。
SSE 的浏览器支持较好（除老版 IE），WebSocket 的兼容性也良好；选择更关注业务模式与服务端资源管理。

## 4. 服务端实现示例
使用 Hono 与 `hono/streaming` 实现 SSE：

```ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { streamSSE } from 'hono/streaming'

const app = new Hono()

app.get('/sse', (c) => {
  return streamSSE(c, (stream) => {
    stream.writeSSE({ event: 'message', data: 'connected' })
    const timer = setInterval(() => {
      stream.writeSSE({ event: 'message', data: new Date().toISOString() })
    }, 1000)
    stream.onAbort(() => {
      clearInterval(timer)
    })
  })
})

serve({ fetch: app.fetch, port: 3000 })
```

安装依赖与运行示例：

```bash
npm install hono @hono/node-server
node index.js
```

## 5. 客户端使用示例
使用 React 订阅 SSE：

```tsx
import { useEffect, useState } from 'react'

export default function SseDemo() {
  const [messages, setMessages] = useState<string[]>([])
  useEffect(() => {
    const es = new EventSource('http://localhost:3000/sse')
    es.onmessage = (e) => {
      setMessages((prev) => [...prev, e.data])
    }
    es.addEventListener('news', (e) => {
      const data = (e as MessageEvent).data
      setMessages((prev) => [...prev, data])
    })
    es.onerror = () => {
      es.close()
    }
    return () => es.close()
  }, [])
  return (
    <div>
      <h3>SSE Demo</h3>
      <ul>
        {messages.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </div>
  )
}
```
安装依赖与启动示例：
```bash
npm install react react-dom
```

## 6. 事件模型与数据格式
SSE 事件由若干“字段行”组成，以空行表示事件结束。常见字段：
- `event`: 事件名（可选，默认 `message`）
- `data`: 事件数据；允许出现多行 `data:`，客户端会拼接为一个消息体
- `id`: 事件标识（可选）；浏览器断线重连时会在请求头携带 `Last-Event-ID`，服务端可据此续传
- `retry`: 客户端重连间隔（毫秒，可选）

示例：

```text
event: updates
id: 101
retry: 2000
data: {"status":"ok","time":"2025-12-10"}

```

多行数据示例（客户端将拼接为一条消息）：

```text
data: first line
data: second line

```

建议使用 JSON 作为数据格式；当需要持续推送大量记录时，可采用`NDJSON`（每行一个 JSON 对象），同时保持事件间的`空行`作为边界。

