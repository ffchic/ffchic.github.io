---
title: 博客搭建教程github+hexo
date: 2025-12-07 00:00:14
tags: [Hexo, GitHub, 教程]
categories: [技术]
---

本文将详细介绍如何使用 Hexo 框架配合 GitHub Pages 搭建个人博客，并整理了 Hexo 的常用命令供查阅。

<!-- more -->

## 1. 环境准备

在开始之前，请确保你的电脑已经安装了以下环境：

*   **Node.js** (推荐 LTS 版本)
*   **Git**

## 2. 安装 Hexo

打开终端（Terminal），运行以下命令全局安装 Hexo：

```bash
npm install -g hexo-cli
```

## 3. 初始化项目

选择一个文件夹作为你的博客目录，然后运行：

```bash
hexo init my-blog
cd my-blog
npm install
```

## 4. 部署到 GitHub Pages

### 4.1 创建仓库
在 GitHub 上创建一个新的仓库，仓库名为 `username.github.io`（将 `username` 替换为你的 GitHub 用户名）。

### 4.2 安装部署插件
在博客根目录下运行：

```bash
npm install hexo-deployer-git --save
```

### 4.3 配置 _config.yml
打开根目录下的 `_config.yml` 文件，找到 `deploy` 部分，修改如下：

```yaml
deploy:
  type: git
  repo: git@github.com:username/username.github.io.git  # 推荐使用 SSH
  branch: gh-pages
```

### 4.4 部署
运行以下命令将网站部署到 GitHub：

```bash
hexo clean && hexo deploy
```

## 5. Hexo 常用命令速查

以下是 Hexo 开发中最高频使用的命令：

### 基础命令

*   **初始化**
    ```bash
    hexo init [folder]  # 初始化一个新本地文件夹为网站
    ```

*   **新建文章**
    ```bash
    hexo new "文章标题"  # 创建一篇新文章
    # 或者指定布局
    hexo new page "关于我"
    ```

*   **生成静态文件**
    ```bash
    hexo generate  # 简写: hexo g
    ```

*   **启动本地服务器**
    ```bash
    hexo server    # 简写: hexo s
    # 默认访问地址: http://localhost:4000
    ```

*   **部署**
    ```bash
    hexo deploy    # 简写: hexo d
    ```

### 组合命令 (推荐)

*   **清除缓存并生成**
    ```bash
    hexo clean && hexo g
    ```

*   **清除缓存并启动服务器**
    ```bash
    hexo clean && hexo s
    ```

*   **生成并部署**
    ```bash
    hexo g -d
    ```

### 其他命令

*   **清除缓存**
    ```bash
    hexo clean     # 清除缓存文件 (db.json) 和已生成的静态文件 (public)
    # 当发现样式修改没生效时，一定要运行这个命令
    ```

*   **查看版本**
    ```bash
    hexo version
    ```

## 6. 常见问题

*   **部署失败**：检查 `repo` 地址是否正确，SSH Key 是否配置。
*   **样式未更新**：记得先运行 `hexo clean`。

希望这篇教程能帮到你！
